/**
 * Writes `vocab1_observations.json`: observations the real sim handed real pilots, recovered by
 * replaying every checked-in match log (`verifyReplay`'s observation hook) and keeping every 120th
 * decision, at most 15 a log. `make_vocab1_golden.py` then records what the vocab-1 description and
 * resolver said about each one, and `test_vocab.py` holds every later checkout to it
 * (docs/vocabulary-spec.md §5.2: "the vocab-1 description is unchanged on a fixed observation
 * corpus"). Both goldens were made from develop at eaf1b45, before vocab-2 existed.
 *
 *   node tools/jev/testdata/make_vocab1_corpus.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flush, loadHeadless } from '../../match/load.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const EVERY = 120;
const PER_LOG = 15;

const h = await loadHeadless();
const files = execFileSync('git', ['ls-files', 'runs/*.json'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
const out = [];
for (const f of files) {
  let log;
  try {
    log = JSON.parse(readFileSync(path.join(ROOT, f), 'utf8'));
  } catch {
    continue;
  }
  if (!log || !Array.isArray(log.checkpoints) || !Array.isArray(log.decisions)) continue;
  const kept = [];
  let n = 0;
  const v = await h.verifyReplay(log, flush, (_decision, obs) => {
    if (n++ % EVERY === 0 && kept.length < PER_LOG) kept.push(obs);
  });
  if (!v.ok) throw new Error(`${f} does not replay`);
  const map = typeof log.map === 'string' ? log.map : (log.map?.name ?? null);
  for (const obs of kept) out.push({ log: f, map, obs });
}
writeFileSync(path.join(HERE, 'vocab1_observations.json'), JSON.stringify(out) + '\n');
console.log(`${out.length} observations from ${new Set(out.map((o) => o.log)).size} logs`);
