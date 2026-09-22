import { esc, page } from './layout.mjs';

/** The explainer: what this is, how to get on the ladder, where the rules live. */
export function homePage({ user, tournament, house, backend, counts }) {
  const body = `
<h1>Elysium</h1>
<p class="dim">The promptlane arena — where prompts fight for glory forever.</p>
<p>promptlane is a small three-lane MOBA where every champion is the same robot bear with a different
instrument. Each bearbot's brain is a language model running on <b>one prompt</b> — the prompt you write.
Elysium runs your prompt against the house bot before the jam so you can see how it plays.</p>

<div class="row">
  <div class="card"><h2>1 · Test a prompt</h2>
  <p>Paste a prompt on <a href="/test">Test</a> and run a quick match (3 sim-minutes) against the house bot.
  You get a result line and a replay you can watch. Scratch prompts are never ranked and never kept.</p></div>
  <div class="card"><h2>2 · Get on the ladder</h2>
  <p>Merge <code>entrants/&lt;your-handle&gt;/pilot.md</code> in
  <a href="https://github.com/kumouri/jamobair-entrants">jamobair-entrants</a>. The arena polls <code>main</code>,
  sees the new prompt, and plays your three placement matches against the house bot automatically
  (seeds ${esc(tournament.placementSeeds.join(', '))}, full ten minutes each).</p></div>
  <div class="card"><h2>3 · Climb</h2>
  <p>The <a href="/ladder">ladder</a> is Elo: start 1000, K 32, draw ½. A revised prompt keeps its rating and
  re-places. Only full matches with merged prompts count; quick tests are for iteration.</p></div>
  <div class="card"><h2>4 · Watch</h2>
  <p>Every match can be watched as it happens — <a href="/matches">Matches</a> → <em>Watch live</em> opens the game's own
  page on the running match. On jam day the <a href="/bracket">bracket</a> is seeded from the ladder; the early rounds are
  pre-run and replayed at 4×, the semis and final play live.</p></div>
</div>

<h2>Right now</h2>
<table>
<tr><th>Tournament</th><td>${esc(tournament.name)} (<code>${esc(tournament.id)}</code>)</td></tr>
<tr><th>Model</th><td>${esc(backend.model ?? backend.kind)} via <code>${esc(backend.id)}</code> — cadence ${esc(tournament.cadenceSec)} s for ranked matches, ${esc(tournament.quick.cadenceSec)} s for quick tests</td></tr>
<tr><th>House bot</th><td><code>${esc(house.file)}</code> <span class="dim">(${esc(house.hash.slice(0, 8))})</span></td></tr>
<tr><th>Entrants on the ladder</th><td>${counts.entrants}</td></tr>
<tr><th>Matches played</th><td>${counts.finished} finished · ${counts.queued} queued · ${counts.running} running</td></tr>
<tr><th>Daily quota</th><td>${esc(tournament.quota.quick)} quick + ${esc(tournament.quota.full)} full tests per handle (Central Time day)</td></tr>
</table>

<h2>Rules in one breath</h2>
<p>One file, no code fences, no URLs. Your prompt drives all three bearbots on your side
(drums top, keytar mid, violin bottom). A destroyed nexus wins; at ten minutes it goes to towers standing, then
nexus health. Cutoff <b>Thu 1 Oct 2026, 17:00 CT</b>; jam day <b>Fri 2 Oct</b>. The full prompt contract is in the
<a href="https://github.com/kumouri/jamobair-entrants#the-prompt-contract">entrants README</a>.</p>
`;
  return page({ title: 'Home', path: '/', user, body });
}
