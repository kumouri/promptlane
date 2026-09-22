import { esc, page, record } from './layout.mjs';

/** The leaderboard (spec §3.5 columns). */
export function ladderPage({ user, rows, house, placing }) {
  const table = rows.length
    ? `<table>
<tr><th class="num">#</th><th>Handle</th><th class="num">Elo</th><th class="num">Current prompt</th><th class="num">All time</th>
<th class="num">Nexus kills</th><th class="num">Timeout wins</th><th class="num">Draws</th><th class="num">Parse-error rate</th><th>Last match</th></tr>
${rows
  .map(
    (r) => `<tr><td class="num">${r.rank}</td><td><b>${esc(r.handle)}</b> <span class="dim">${esc(r.hash?.slice(0, 8) ?? '')}</span>${
      placing.has(r.handle) ? ' <span class="pill q">placing…</span>' : ''
    }</td>
<td class="num">${r.elo}</td><td class="num">${record(r.current)}</td><td class="num">${record(r.allTime)}</td>
<td class="num">${r.nexusKills}</td><td class="num">${r.timeoutWins}</td><td class="num">${r.draws}</td>
<td class="num">${r.calls ? (r.parseErrorRate * 100).toFixed(1) + '%' : '—'}</td>
<td>${r.lastMatchId ? `<a href="/matches/${esc(r.lastMatchId)}">${esc(r.lastMatchId)}</a>` : '—'}</td></tr>`,
  )
  .join('\n')}
</table>`
    : '<p class="dim">Nobody has merged a prompt yet. Yours could be first.</p>';
  const body = `
<h1>Elysium ladder</h1>
<p class="dim">Elo from 1000, K 32, draw ½. Only full matches between merged prompts count (placements and
challenges); the house bot (<code>${esc(house.file)}</code>) is a fixed 1000. "Current prompt" is the record of the
hash that is merged now; a revision keeps the rating and re-places on seeds 7, 11, 42.</p>
${table}
`;
  return page({ title: 'Ladder', path: '/ladder', user, body });
}
