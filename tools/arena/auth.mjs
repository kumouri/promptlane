/**
 * Cloudflare Access identity for the arena (docs/arena-site-spec.md §4, rulings Q1/Q2/Q18/Q19).
 *
 * Access sits in front of the tunnel and emails a one-time PIN; every request that reaches the
 * arena then carries a signed JWT (`Cf-Access-Jwt-Assertion` header, or the `CF_Authorization`
 * cookie). The arena verifies it with `node:crypto` against the team's JWKS and takes the `email`
 * claim as the identity. Nothing else is trusted: `cloudflared` connects from loopback, so a
 * loopback source address means nothing once tunnelled (§3.0).
 *
 * With `ARENA_ACCESS_AUD` unset the server is in dev mode: it still binds 127.0.0.1 only, and
 * every request is `--dev-user` with the organizer role. There is no third mode.
 */
import { createPublicKey, verify as cryptoVerify } from 'node:crypto';

export class AuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.status = status;
  }
}

function b64url(s) {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

export function decodeJwt(token) {
  const parts = String(token).split('.');
  if (parts.length !== 3) throw new AuthError('malformed token');
  let header;
  let payload;
  try {
    header = JSON.parse(b64url(parts[0]).toString('utf8'));
    payload = JSON.parse(b64url(parts[1]).toString('utf8'));
  } catch {
    throw new AuthError('malformed token');
  }
  return { header, payload, signingInput: `${parts[0]}.${parts[1]}`, signature: b64url(parts[2]) };
}

/**
 * Verify an Access JWT. `getKeys()` resolves to the JWKS `keys` array; it is called again once
 * if the token's `kid` is unknown (key rotation). Returns the payload.
 */
export async function verifyAccessJwt(token, { aud, issuer, getKeys, now = () => Date.now() / 1000 }) {
  const { header, payload, signingInput, signature } = decodeJwt(token);
  if (header.alg !== 'RS256') throw new AuthError(`unsupported alg ${header.alg}`);
  let keys = await getKeys();
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    keys = await getKeys(true);
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) throw new AuthError('unknown signing key');
  const key = createPublicKey({ key: jwk, format: 'jwk' });
  if (!cryptoVerify('RSA-SHA256', Buffer.from(signingInput), key, signature)) throw new AuthError('bad signature');
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(aud)) throw new AuthError('token is for a different application');
  if (issuer && payload.iss !== issuer) throw new AuthError('wrong issuer');
  const t = now();
  if (typeof payload.exp !== 'number' || payload.exp < t) throw new AuthError('token expired');
  if (typeof payload.nbf === 'number' && payload.nbf > t + 60) throw new AuthError('token not yet valid');
  if (typeof payload.email !== 'string' || !payload.email) throw new AuthError('token has no email');
  return payload;
}

function tokenFrom(req) {
  const h = req.headers['cf-access-jwt-assertion'];
  if (typeof h === 'string' && h) return h;
  const cookie = req.headers.cookie;
  if (typeof cookie === 'string') {
    const m = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(cookie);
    if (m) return m[1];
  }
  return null;
}

/**
 * Build the request identifier. Access mode needs `aud` and `team` (the Zero Trust team name,
 * `<team>.cloudflareaccess.com`); dev mode needs `devUser`. `fetchJson` is injectable for tests.
 */
export function makeAuth({ aud, team, organizerEmail, devUser, fetchJson, now }) {
  if (!aud) {
    if (!devUser) throw new Error('dev mode needs --dev-user <email>');
    const identity = Object.freeze({ email: devUser.toLowerCase(), organizer: true, mode: 'dev' });
    return { mode: 'dev', describe: `dev mode — every request is ${identity.email} (organizer)`, identify: async () => identity };
  }
  if (!team) throw new Error('ARENA_ACCESS_AUD is set but ARENA_ACCESS_TEAM is not');
  if (!organizerEmail || /change-me/i.test(organizerEmail)) throw new Error('organizerEmail must be set (config or ARENA_ORGANIZER_EMAIL)');
  const issuer = `https://${team}.cloudflareaccess.com`;
  const certsUrl = `${issuer}/cdn-cgi/access/certs`;
  const load = fetchJson ?? (async (url) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`${url} → ${res.status}`);
    return res.json();
  });
  let cache = null;
  let cachedAt = 0;
  const getKeys = async (force = false) => {
    const age = Date.now() - cachedAt;
    if (!cache || force || age > 6 * 3600 * 1000) {
      const body = await load(certsUrl);
      cache = body.keys ?? [];
      cachedAt = Date.now();
    }
    return cache;
  };
  const organizer = organizerEmail.toLowerCase();
  return {
    mode: 'access',
    describe: `Cloudflare Access — aud ${aud.slice(0, 8)}…, team ${team}, organizer ${organizer}`,
    async identify(req) {
      const token = tokenFrom(req);
      if (!token) throw new AuthError('no Access token — this page must be reached through Cloudflare Access');
      const payload = await verifyAccessJwt(token, { aud, issuer, getKeys, now });
      const email = payload.email.toLowerCase();
      return { email, organizer: email === organizer, mode: 'access' };
    },
  };
}
