/**
 * Bundle `headless.ts` (and `metrics.ts`) with esbuild and import it in-process. Shared by the CLI (`cli.mjs`) and
 * the arena (`tools/arena/`), so both drive the same runner and the same `verifyReplay`.
 * The bundle is built once per process; the sim in `src/` is bundled unchanged.
 */
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..');

const loaded = new Map();

/** Bundle one TypeScript entry next to this file and import it; once per entry per process. */
function loadTs(entry) {
  if (!loaded.has(entry)) {
    loaded.set(
      entry,
      (async () => {
        const bundle = await build({
          entryPoints: [path.join(HERE, entry)],
          absWorkingDir: ROOT,
          bundle: true,
          write: false,
          format: 'esm',
          platform: 'node',
          target: 'node20',
          logLevel: 'silent',
        });
        const code = Buffer.from(bundle.outputFiles[0].contents).toString('base64');
        return import(`data:text/javascript;base64,${code}`);
      })(),
    );
  }
  return loaded.get(entry);
}

export function loadHeadless() {
  return loadTs('headless.ts');
}

/** The match metrics module (`metrics.ts`), bundled the same way; see `metrics.mjs`. */
export function loadMetrics() {
  return loadTs('metrics.ts');
}

/** Yields to the event loop so the sim's own promise chain settles between ticks. */
export const flush = () => new Promise((resolve) => setImmediate(resolve));

/** Node-side twin of the game's `httpCallModel`: same request, same reply extraction. */
export function httpCallModel(endpoint, timeoutSec) {
  return async (prompt) => {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
      signal: AbortSignal.timeout(timeoutSec * 1000),
    });
    if (!res.ok) throw new Error(`pilot endpoint responded ${res.status}`);
    const data = await res.json();
    return typeof data === 'string' ? data : data.reply ?? JSON.stringify(data);
  };
}

/** `GET /health` on a model server; the result is recorded in the match log's `backend`. */
export async function probeBackend(endpoint) {
  const healthUrl = new URL('/health', endpoint).toString();
  let res;
  try {
    res = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });
  } catch (err) {
    throw new Error(
      `model server not reachable at ${endpoint} (${err.cause?.code ?? err.message}). ` +
        `Start it first: python tools/model_server.py`,
    );
  }
  if (!res.ok) return { kind: 'http', endpoint, health: null };
  try {
    return { kind: 'http', endpoint, health: await res.json() };
  } catch {
    return { kind: 'http', endpoint, health: null };
  }
}

export function backendLabel(backend) {
  if (backend.kind === 'mock') return 'mock';
  const h = backend.health;
  return h?.backend ? `${h.backend}/${h.model ?? '?'}` : `http:${backend.endpoint}`;
}

/** The one-line summary the CLI prints and the arena shows on a match page. */
export function resultLine(log, outFile) {
  const r = log.result;
  const s = r.stats;
  const pe = (t) => s[t].parseErrors + (s[t].callErrors ? `(+${s[t].callErrors} call errors)` : '');
  return [
    `RESULT winner=${r.winner ?? 'draw'}`,
    `by=${r.endReason === 'nexus' ? 'nexus-kill' : r.endReason ?? 'unfinished'}`,
    `duration=${r.durationSec}s`,
    `decisions ${log.sides.violet.name}=${s.violet.calls} ${log.sides.green.name}=${s.green.calls}`,
    `parse-errors ${log.sides.violet.name}=${pe('violet')} ${log.sides.green.name}=${pe('green')}`,
    `deaths violet=${s.violet.deaths} green=${s.green.deaths}`,
    `towers-lost violet=${s.violet.towersLost} green=${s.green.towersLost}`,
    ...(r.objective ? [`bandstand violet=${r.objective.captures.violet} green=${r.objective.captures.green} openings=${r.objective.openings.length}`] : []),
    // Only a recall-2 match says anything here: channels started, and how many got home.
    ...(r.recall ? [`recall=${r.recall.name} channels=${r.recall.bots.reduce((n, b) => n + b.started, 0)} home=${r.recall.bots.reduce((n, b) => n + b.home, 0)} interrupted=${r.recall.bots.reduce((n, b) => n + b.damage, 0)}`] : []),
    `backend=${backendLabel(log.backend)}`,
    // Only an economy match says anything here, so every older result line is unchanged.
    ...(r.economy ? [`economy=${r.economy.ruleset} items=${r.economy.bots.map((b) => b.items.length).join('/')} levels=${r.economy.bots.map((b) => b.level).join('/')}`] : []),
    ...(outFile ? [`log=${outFile}`] : []),
  ].join(' ');
}
