import { esc, fmtDate, page } from './layout.mjs';

function teamsCard({ list, validator, open, cutoffLabel }, btn) {
  const drift = validator.upstream !== null && validator.upstream !== validator.vendored;
  return `<div class="card"><h2>Teams</h2>
<p>Web submissions are ${open ? `<span class="ok">open</span> until ${esc(cutoffLabel)}` : `<span class="warn">closed</span> (${esc(cutoffLabel)})`}.
Validator: vendored <code>${esc(validator.vendored.slice(0, 7))}</code>, entrants repo <code>${esc(validator.upstream?.slice(0, 7) ?? '—')}</code>
${drift ? '<span class="bad">— differs: web submissions are refused until you re-vendor (tools/arena/entrants_validator/README.md)</span>' : validator.upstream ? '<span class="ok">same</span>' : '<span class="dim">(not checked yet)</span>'}</p>
<table><tr><th>Team</th><th>Members</th><th>Join code</th><th>Last web write</th><th></th></tr>
${list
  .map(
    (t) => `<tr><td><a href="/teams/${esc(encodeURIComponent(t.folder))}">${esc(t.folder)}</a></td>
<td>${t.members.map((m) => `${esc(m.handle)} <span class="dim">(${esc(m.role)} · ${esc(m.email)})</span>`).join('<br>')}</td>
<td><code>${t.members.length < 2 ? esc(t.joinCode) : '—'}</code></td><td class="dim">${t.lastSubmit ? `${fmtDate(t.lastSubmit.ts)} · <code>${esc(String(t.lastSubmit.commit).slice(0, 8))}</code>` : '—'}</td>
<td>${btn(`/api/teams/${esc(t.teamId)}/disband`, 'Disband')}</td></tr>`,
  )
  .join('')}
</table>
<p class="dim">Create a team for people: a learner with you as lead, a team of three, or to <b>link</b> a team that entered by pull
request (use the handles in its folder, lead first; its members can then submit here too). Disbanding forgets the team here only.</p>
<form method="post" action="/api/teams">
<div class="row">
  <div><label>Lead email</label><input type="text" name="leadEmail" required></div><div><label>Lead handle</label><input type="text" name="leadHandle" required></div>
</div><div class="row">
  <div><label>Learner email</label><input type="text" name="learnerEmail"></div><div><label>Learner handle</label><input type="text" name="learnerHandle"></div>
</div><div class="row">
  <div><label>Second learner email</label><input type="text" name="learner2Email"></div><div><label>Second learner handle</label><input type="text" name="learner2Handle"></div>
</div>
<p><button type="submit">Create team</button></p>
</form></div>`;
}

/** Organizer page: queue controls, entrants sync, teams, claims, void. Every button is a ledger row. */
export function adminPage({ user, paused, sync, claims, prompts, queue, running, backends, ladder, brackets, tournament, teams, flash }) {
  const btn = (action, label, extra = '') =>
    `<form method="post" action="${action}" style="display:inline">${extra}<button class="secondary" type="submit">${label}</button></form>`;
  const body = `
<h1>Admin</h1>
<div class="card"><h2>Queue</h2>
<p>${paused ? '<span class="warn">paused</span>' : '<span class="ok">running</span>'} · ${running.length} running · ${queue.length} queued</p>
<p>${paused ? btn('/api/queue/resume', 'Resume') : btn('/api/queue/pause', 'Pause (in-flight match finishes)')}</p>
${
  queue.length
    ? `<table>${queue
        .map(
          (j) => `<tr><td><a href="/matches/${esc(j.id)}">${esc(j.id)}</a></td><td class="dim">${esc(j.kind)} · ${esc(j.priority)} · ${esc(j.backendId)}</td>
<td>${btn(`/api/matches/${esc(j.id)}/cancel`, 'Cancel')}</td></tr>`,
        )
        .join('')}</table>`
    : ''
}
</div>
<div class="card"><h2>Backends</h2>
<table>${Object.entries(backends)
    .map(([id, b]) => `<tr><td><code>${esc(id)}</code></td><td>${esc(b.kind)} ${esc(b.model ?? '')} ${esc(b.endpoint ?? '')}</td><td class="dim">avg ${b.avgSecPerCall ?? 0.9} s/call</td></tr>`)
    .join('')}</table>
</div>
<div class="card"><h2>Entrants sync</h2>
<p>Source: <code>${esc(sync.describe)}</code> · last sync ${fmtDate(sync.lastAt)} ${sync.lastError ? `<span class="bad">— ${esc(sync.lastError)}</span>` : `<span class="ok">ok</span>`} · every ${sync.intervalSec} s</p>
<p>${btn('/api/sync', 'Sync now')}</p>
<table><tr><th>Handle</th><th>Hash</th><th>Commit</th><th>Seen</th></tr>
${[...prompts.entries()].map(([h, p]) => `<tr><td>${esc(h)}</td><td><code>${esc(p.hash.slice(0, 8))}</code></td><td><code>${esc(String(p.commit).slice(0, 8))}</code></td><td class="dim">${fmtDate(p.seenAt)}</td></tr>`).join('')}
</table></div>
${teams ? teamsCard(teams, btn) : ''}
<div class="card"><h2>Handle claims</h2>
<table><tr><th>Email</th><th>Handle</th><th></th></tr>
${[...claims.entries()]
    .map(
      ([email, handle]) => `<tr><td>${esc(email)}</td><td>${esc(handle)}</td><td>${btn(
        '/api/claims',
        'Reassign',
        `<input type="hidden" name="email" value="${esc(email)}"><input type="text" name="handle" value="${esc(handle)}" style="width:12em;display:inline">`,
      )}</td></tr>`,
    )
    .join('')}
</table></div>
<div class="card"><h2>Jam-day bracket</h2>
${brackets.length ? `<p>Existing: ${brackets.map((id) => `<a href="/bracket/${esc(id)}">${esc(id)}</a>`).join(' · ')}</p>` : ''}
<p class="dim">Seeds the current ladder (${ladder.length} entrant${ladder.length === 1 ? '' : 's'} with a merged prompt, merged hashes pinned now) into a
single-elimination bracket. The backend and cadence are fixed for the tournament and recorded in every match log. Rounds 1–2 are
pre-run and held until you reveal them (Q9). Nothing runs until you press <em>Run</em> on the bracket page.</p>
<form method="post" action="/api/brackets">
<div class="row">
  <div><label for="b-id">Tournament id</label><input type="text" id="b-id" name="id" value="jam" pattern="[a-z0-9][a-z0-9-]{0,30}" required></div>
  <div><label for="b-name">Name</label><input type="text" id="b-name" name="name" value="InRhythm AI Jam — round one" required></div>
  <div><label for="b-backend">Backend</label><select id="b-backend" name="backend">${Object.keys(backends).map((id) => `<option value="${esc(id)}" ${id === tournament.backend ? 'selected' : ''}>${esc(id)}</option>`).join('')}</select></div>
</div>
<div class="row">
  <div><label for="b-cad">Cadence (s) — Q8 says 2</label><input type="text" id="b-cad" name="cadenceSec" value="2"></div>
  <div><label for="b-max">Sim seconds per match</label><input type="text" id="b-max" name="maxSimSec" value="600"></div>
  <div><label for="b-pre">Pre-run rounds (held)</label><input type="text" id="b-pre" name="preRunRounds" value="2"></div>
  <div><label for="b-seed">Seed base</label><input type="text" id="b-seed" name="seedBase" value="2026"></div>
  <div><label for="b-top">Top N (blank = everyone)</label><input type="text" id="b-top" name="top" value=""></div>
</div>
<p><button type="submit">Create bracket from the ladder</button></p>
</form>
<table><tr><th class="num">#</th><th>Handle</th><th class="num">Elo</th></tr>${ladder.map((r) => `<tr><td class="num">${r.rank}</td><td>${esc(r.handle)}</td><td class="num">${r.elo}</td></tr>`).join('')}</table>
</div>
<div class="card"><h2>Void a match</h2>
<form method="post" action="/api/void"><input type="text" name="id" placeholder="ladder-20260925-003" style="width:20em;display:inline">
<input type="text" name="reason" placeholder="reason" style="width:20em;display:inline"> <button type="submit">Void</button></form>
<p class="dim">Voiding appends a row; the ladder re-derives without that match. It cannot be un-voided except by re-running.</p>
</div>
`;
  return page({ title: 'Admin', path: '/admin', user, body, flash });
}
