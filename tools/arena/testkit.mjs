/** Shared fixtures for the arena's end-to-end tests: a temp entrants tree, JSON helpers, an Access-mode arena with a fake JWKS. */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ROOT } from '../match/load.mjs';
import { DEFAULT_CONFIG, createArena, loadConfig } from './server.mjs';

export const quiet = { info() {}, warn() {}, error(m) { console.error(m); } };

/**
 * A temp dir with `entrants/<handle>/pilot.md` for each `handles` entry (default: alice on the
 * keytar prompt) and a config on the mock backend. `tweak(config)` may edit the tournament.
 */
export function fixture({ handles = { alice: 'keytar.md' }, tweak } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'arena-e2e-'));
  const entrants = path.join(dir, 'repo');
  for (const [handle, file] of Object.entries(handles)) {
    mkdirSync(path.join(entrants, 'entrants', handle), { recursive: true });
    const text = file.endsWith('.md') ? readFileSync(path.join(ROOT, 'prompts', 'pilots', file), 'utf8') : file;
    writeFileSync(path.join(entrants, 'entrants', handle, 'pilot.md'), text);
  }
  const config = loadConfig(DEFAULT_CONFIG, { backend: 'mock', entrantsDir: entrants });
  tweak?.(config);
  return { dir, entrants, config, data: path.join(dir, 'data'), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export async function json(url, init) {
  const res = await fetch(url, { ...init, headers: { accept: 'application/json', ...(init?.body ? { 'content-type': 'application/json' } : {}), ...(init?.headers ?? {}) } });
  return { status: res.status, body: await res.json() };
}

/** Access-mode arena with a fake JWKS, so a non-organizer entrant can be exercised over HTTP. */
export async function accessArena(f, { organizerEmail = 'ceryce@inrhythm.com', sync = false } = {}) {
  const { generateKeyPairSync, createSign } = await import('node:crypto');
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const AUD = 'c'.repeat(64);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const token = (email) => {
    const now = Math.floor(Date.now() / 1000);
    const input = `${b64({ alg: 'RS256', kid: 'k1', typ: 'JWT' })}.${b64({ aud: [AUD], iss: 'https://team.cloudflareaccess.com', email, exp: now + 300 })}`;
    return `${input}.${createSign('RSA-SHA256').update(input).sign(privateKey).toString('base64url')}`;
  };
  const arena = await createArena({
    config: f.config,
    dataDir: f.data,
    accessAud: AUD,
    accessTeam: 'team',
    organizerEmail,
    fetchJson: async () => ({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256' }] }),
    log: quiet,
    sync,
  });
  const as = (email) => ({ 'cf-access-jwt-assertion': token(email) });
  return { arena, token, as, organizer: as(organizerEmail) };
}
