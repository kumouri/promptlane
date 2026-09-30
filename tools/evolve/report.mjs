/**
 * Markdown summary of a campaign, from the store alone (no model, no network): the pre-registered
 * config, then per generation the mutations, compile failures, the ranking with its intervals,
 * every match, and the promotion decision. `npm run evolve -- report --name <c> --out runs/<c>.md`.
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';

const f3 = (x) => (x === null || x === undefined ? '—' : Number(x).toFixed(3));
const ci = (fit) => (fit.lo === null || fit.lo === undefined ? `n=${fit.n}, no interval` : `[${f3(fit.lo)}, ${f3(fit.hi)}] n=${fit.n}`);

function spend(store) {
  const total = { mutateCalls: 0, mutateTokens: 0, mutateUsd: 0, compileCalls: 0, compileTokens: 0, compileUsd: 0 };
  const list = (dir) => (store.exists(dir) ? readdirSync(store.path(dir)).filter((f) => f.endsWith('.json')) : []);
  for (const f of list('mutations')) {
    const u = store.readJson(`mutations/${f}`).usage ?? {};
    total.mutateCalls += u.calls ?? 0;
    total.mutateTokens += u.total_tokens ?? 0;
    total.mutateUsd += u.cost_usd ?? 0;
  }
  for (const f of list('compiled')) {
    const u = store.readJson(`compiled/${f}`).usage ?? {};
    total.compileCalls += u.calls ?? 0;
    total.compileTokens += u.total_tokens ?? 0;
    total.compileUsd += u.cost_usd ?? 0;
  }
  return total;
}

export function renderReport(store) {
  const campaign = store.readJson('campaign.json');
  const state = store.readJson('state.json');
  const L = [];
  L.push(`# Prompt-evolution campaign \`${campaign.name}\``, '');
  L.push(`Created ${campaign.createdAt}. Spec: \`docs/prompt-evolution-spec.md\`. Store: \`${path.relative(process.cwd(), store.dir).replace(/\\/g, '/') || '.'}\` (git-ignored).`, '');
  L.push('## Pre-registered config', '', '```json', JSON.stringify(campaign, null, 1), '```', '');
  L.push(`**State:** next generation ${state.generation}, epoch ${state.epoch}, opponents ${state.opponents.join(', ')}, survivors ${state.survivors.join(', ')}.`, '');
  const s = spend(store);
  L.push(`**Model spend (as each backend reported it; the \`claude\` CLI reports a notional cost, it runs on the subscription):** mutation ${s.mutateCalls} call(s), ${s.mutateTokens.toLocaleString('en-US')} tokens, $${s.mutateUsd.toFixed(4)}; compile ${s.compileCalls} call(s), ${s.compileTokens.toLocaleString('en-US')} tokens, $${s.compileUsd.toFixed(4)}. Jev spend is on the schema server's \`/health\`.`, '');
  for (let g = 0; store.exists(`gen-${g}.json`); g++) {
    const gen = store.readJson(`gen-${g}.json`);
    L.push(`## Generation ${g} (epoch ${gen.epoch}) — ${gen.phase}`, '');
    L.push(`Parents ${gen.parents.join(', ')}; opponents ${gen.opponents.join(', ')}; seeds ${gen.seeds.join(', ')}; shape cadence ${gen.shape.cadenceSec} s, ${gen.shape.maxSimSec} sim-s.`, '');
    L.push('| Slot | Parent | Focus | Child | The one change |', '|---|---|---|---|---|');
    for (const sl of gen.slots) L.push(`| ${sl.id} | ${sl.parent} | ${sl.focus} | ${sl.child ?? '✗'} | ${(sl.change ?? sl.failed ?? '').replace(/\|/g, '\\|')} |`);
    L.push('');
    const fails = Object.entries(gen.compileFailures ?? {});
    if (fails.length) L.push(...fails.map(([id, why]) => `- compile failed: ${id} — ${why}`), '');
    if (gen.ranking) {
      L.push('| Rank | Genome | Mean score | 95% CI (seed-paired) | W-D-L | Elo | Deaths own/foe | Towers lost own/foe | Aggression | Caution | Spread | Call errors |');
      L.push('|---:|---|---:|---|---|---:|---|---|---:|---:|---:|---:|');
      gen.ranking.forEach((r, i) => {
        const fit = r.fitness;
        L.push(`| ${i + 1} | ${r.id}${gen.survivors.includes(r.id) ? ' (survives)' : ''} | ${f3(fit.mean)} | ${fit.note ?? ci(fit)} | ${fit.wins}-${fit.draws}-${fit.losses} | ${r.elo ?? '—'} | ${r.deaths}/${r.foeDeaths} | ${r.towersLost}/${r.foeTowersLost} | ${f3(r.descriptors.aggression)} | ${f3(r.descriptors.caution)} | ${r.descriptors.spread ?? '—'} | ${r.callErrors} |`);
      });
      L.push('');
      L.push('Matches (key → result; logs in the store under `matches/`, each `npm run match -- --verify`-able):', '');
      for (const key of [...(gen.matchKeys ?? []), ...(gen.promotion?.matches ?? [])]) {
        if (!store.exists('matches', `${key}.result.json`)) continue;
        const m = store.readJson(`matches/${key}.result.json`);
        const v = m.sides.violet;
        const gr = m.sides.green;
        L.push(`- \`${m.key}\` seed ${m.seed}: ${m.violet} (violet) ${v.score}–${gr.score} ${m.green} (green) — ${v.endReason ?? 'unfinished'} at ${v.durationSec} s, decided by ${v.by}; deaths ${v.deaths}-${gr.deaths}, towers lost ${v.towersLost}-${gr.towersLost}, call errors ${v.callErrors}/${gr.callErrors}`);
      }
      L.push('');
    }
    if (gen.promotion) L.push(`**Promotion:** ${gen.promotion.promote ? 'promoted' : 'not promoted'} ${gen.promotion.id ?? ''} — ${gen.promotion.reason}.`, '');
  }
  return L.join('\n') + '\n';
}
