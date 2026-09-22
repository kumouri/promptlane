import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { AuthError, decodeJwt, makeAuth, verifyAccessJwt } from './auth.mjs';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const { publicKey: otherPublic, privateKey: otherPrivate } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = (key, kid) => ({ ...key.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' });

const AUD = 'a'.repeat(64);
const TEAM = 'kumouri';
const ISS = `https://${TEAM}.cloudflareaccess.com`;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

function sign(payload, { key = privateKey, kid = 'k1', alg = 'RS256' } = {}) {
  const input = `${b64({ alg, kid, typ: 'JWT' })}.${b64(payload)}`;
  const sig = createSign('RSA-SHA256').update(input).sign(key).toString('base64url');
  return `${input}.${sig}`;
}

const nowSec = () => Math.floor(Date.now() / 1000);
const good = (over = {}) => ({ aud: [AUD], iss: ISS, email: 'Someone@InRhythm.com', exp: nowSec() + 600, iat: nowSec(), ...over });
const keys = [jwk(publicKey, 'k1')];
const getKeys = async () => keys;

test('decodeJwt rejects anything that is not three base64url parts', () => {
  assert.throws(() => decodeJwt('nope'), AuthError);
  assert.throws(() => decodeJwt('a.b.c'), AuthError);
});

test('a valid Access token verifies and yields the email claim', async () => {
  const p = await verifyAccessJwt(sign(good()), { aud: AUD, issuer: ISS, getKeys });
  assert.equal(p.email, 'Someone@InRhythm.com');
});

test('refusals: bad signature, wrong aud, wrong issuer, expired, unknown kid, no email, wrong alg', async () => {
  const cases = [
    [sign(good(), { key: otherPrivate }), /bad signature/],
    [sign(good({ aud: ['b'.repeat(64)] })), /different application/],
    [sign(good({ iss: 'https://evil.cloudflareaccess.com' })), /wrong issuer/],
    [sign(good({ exp: nowSec() - 5 })), /expired/],
    [sign(good(), { kid: 'k9' }), /unknown signing key/],
    [sign(good({ email: undefined })), /no email/],
    [sign(good(), { alg: 'HS256' }), /unsupported alg/],
  ];
  for (const [token, re] of cases) {
    await assert.rejects(verifyAccessJwt(token, { aud: AUD, issuer: ISS, getKeys }), (err) => err instanceof AuthError && re.test(err.message), re.source);
  }
});

test('key rotation: an unknown kid re-fetches the JWKS once', async () => {
  let fetches = 0;
  const rotating = async () => {
    fetches += 1;
    return fetches === 1 ? [jwk(publicKey, 'k1')] : [jwk(publicKey, 'k1'), jwk(otherPublic, 'k2')];
  };
  const p = await verifyAccessJwt(sign(good(), { key: otherPrivate, kid: 'k2' }), { aud: AUD, issuer: ISS, getKeys: rotating });
  assert.equal(p.email, 'Someone@InRhythm.com');
  assert.equal(fetches, 2);
});

test('makeAuth in Access mode: no token → 401; organizer by email, case-insensitive', async () => {
  const fetchJson = async (url) => {
    assert.equal(url, `${ISS}/cdn-cgi/access/certs`);
    return { keys };
  };
  const auth = makeAuth({ aud: AUD, team: TEAM, organizerEmail: 'Ceryce@InRhythm.com', fetchJson });
  assert.equal(auth.mode, 'access');
  await assert.rejects(auth.identify({ headers: {} }), (e) => e instanceof AuthError && e.status === 401);
  await assert.rejects(auth.identify({ headers: { 'cf-access-jwt-assertion': 'garbage' } }), AuthError);
  const me = await auth.identify({ headers: { 'cf-access-jwt-assertion': sign(good()) } });
  assert.deepEqual(me, { email: 'someone@inrhythm.com', organizer: false, mode: 'access' });
  const org = await auth.identify({ headers: { cookie: `x=1; CF_Authorization=${sign(good({ email: 'ceryce@inrhythm.com' }))}` } });
  assert.deepEqual(org, { email: 'ceryce@inrhythm.com', organizer: true, mode: 'access' });
});

test('makeAuth refuses a half-configured Access mode and a placeholder organizer', () => {
  assert.throws(() => makeAuth({ aud: AUD }), /ARENA_ACCESS_TEAM/);
  assert.throws(() => makeAuth({ aud: AUD, team: TEAM, organizerEmail: 'CHANGE-ME@inrhythm.com' }), /organizerEmail/);
  assert.throws(() => makeAuth({}), /--dev-user/);
});

test('dev mode: every request is the dev user with the organizer role, headers ignored', async () => {
  const auth = makeAuth({ devUser: 'Dev@Example.com' });
  assert.equal(auth.mode, 'dev');
  const me = await auth.identify({ headers: { 'cf-access-jwt-assertion': 'ignored' } });
  assert.deepEqual(me, { email: 'dev@example.com', organizer: true, mode: 'dev' });
});
