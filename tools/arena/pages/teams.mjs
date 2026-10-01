import { renderMarkdown } from './compile.mjs';
import { esc, fmtDate, page, record } from './layout.mjs';

/**
 * Teams (docs/arena-runbook.md §1d): `/teams` lists every entry, `/teams/<folder>` shows one (its
 * prose, what the ladder's compiler made of it, its matches), `/team` is your own team -- create,
 * join, submit. Entrant prose is data: it only ever reaches the page through `esc`, inside a
 * `<pre>` or a `<textarea>`. Emails appear for the organizer only.
 */

const teamUrl = (folder) => `/teams/${encodeURIComponent(folder)}`;

function membersHtml(members) {
  return members.map((m) => `${esc(m.handle)} <span class="dim">(${esc(m.role)}${m.email ? ` · ${esc(m.email)}` : ''})</span>`).join(', ');
}

function statusHtml(status) {
  const cls = { 'on the ladder': 'run', placing: 'q', 'submitted — syncing': 'q' }[status] ?? '';
  return `<span class="pill ${cls}">${esc(status)}</span>`;
}

function standingHtml(s) {
  return s ? `#${esc(s.rank)} · ${esc(s.elo)} <span class="dim">· ${esc(record(s.current))}</span>` : '<span class="dim">—</span>';
}

function cutoffLine({ open, cutoffLabel }) {
  return open
    ? `Submissions close <b>${esc(cutoffLabel)}</b> — midnight Central at the end of Thursday 15 October.`
    : `<span class="warn">Submissions closed ${esc(cutoffLabel)}.</span> Teams and entries are frozen.`;
}

export function teamsPage({ user, rows, open, cutoffLabel, myTeam }) {
  const table = rows.length
    ? `<table>
<tr><th>Team</th><th>Members</th><th>Status</th><th>Last update</th><th>Ladder</th><th>Via</th></tr>
${rows
  .map(
    (r) => `<tr><td><a href="${esc(teamUrl(r.folder))}"><b>${esc(r.folder)}</b></a></td><td>${membersHtml(r.members)}</td><td>${statusHtml(r.status)}</td>
<td class="dim">${fmtDate(r.updatedAt)}</td><td>${standingHtml(r.standing)}</td><td class="dim">${r.source === 'web' ? 'web' : 'GitHub'}</td></tr>`,
  )
  .join('\n')}
</table>`
    : '<p class="dim">No teams yet. Yours could be first.</p>';
  const body = `
<h1>Teams</h1>
<p>Every entry is a team: one lead and a learner (two learners when the organizer assigns a third), or a lead entering
solo. A team's name is its folder in <code>jamobair-entrants</code>: the handles joined by <code>+</code>, lead first.
${cutoffLine({ open, cutoffLabel })}</p>
<p>${myTeam ? `Your team: <a href="/team"><b>${esc(myTeam)}</b></a>.` : `<a href="/team">Create or join a team</a> to submit on the web — or open a pull request, as before.`}</p>
${table}
<p class="dim">Ladder: rank · Elo · the current prompt's W-D-L. "Via" says where the team is managed: web teams submit here
(the arena commits to jamobair-entrants for them); GitHub teams submit by pull request.</p>
`;
  return page({ title: 'Teams', path: '/teams', user, body });
}

function compileHtml(compile) {
  if (!compile) return '<p class="dim">Nothing submitted yet.</p>';
  if (compile.state === 'n/a') return '<p class="dim">This ladder is not on Jev, so it does not compile prose (the <a href="/compile">compile panel</a> still shows what it would compile to).</p>';
  if (compile.state === 'compiling') return '<p><span class="pill q">compiling…</span> <span class="dim">reload in a minute</span></p>';
  if (compile.state === 'failed') return `<p class="bad">Compile failed (${esc(fmtDate(compile.at))}): ${esc(compile.error)}</p><p class="dim">The <a href="/compile">compile panel</a> shows what each instrument made of the prose, and why.</p>`;
  if (compile.state === 'compiled') {
    const r = compile.record;
    const counts = Object.entries(r.schemas ?? {}).map(([inst, s]) => `${esc(inst)} ${esc(s.rules?.length ?? '?')} rules`).join(' · ');
    return `<p><span class="pill run">compiled</span> ${counts} <span class="dim">· ${esc(r.backend ?? '')} · ${esc(fmtDate(r.compiledAt))} · compiler ${esc(r.compilerVersion)}</span></p>
<p class="dim">This is the compile every ladder match of this prompt plays.</p>
${r.markdown ? `<details class="card"><summary>What the prose compiled to</summary>${renderMarkdown(r.markdown)}</details>` : ''}`;
  }
  return '<p class="dim">Not compiled yet — it compiles on its first match (or right after a web submission).</p>';
}

function matchesHtml(folder, matches) {
  if (!matches.length) return '<p class="dim">No matches yet.</p>';
  return `<table><tr><th>Match</th><th>Kind</th><th>Opponent</th><th>Result</th><th>When</th><th></th></tr>
${matches
  .map((j) => {
    const mine = j.sides.violet.handle === folder ? 'violet' : 'green';
    const opp = j.sides[mine === 'violet' ? 'green' : 'violet'];
    const res = j.status === 'finished' && j.result ? (j.result.winner === mine ? '<span class="ok">won</span>' : j.result.winner ? '<span class="bad">lost</span>' : 'draw') : esc(j.status);
    const replay = j.status === 'finished' ? `<a href="/play/?replay=/logs/${esc(j.id)}.json">replay</a>` : j.status === 'queued' || j.status === 'started' ? `<a href="/play/?live=${esc(j.id)}">watch live</a>` : '';
    return `<tr><td><a href="/matches/${esc(j.id)}">${esc(j.id)}</a></td><td class="dim">${esc(j.kind)}</td><td>${esc(opp.house ? 'house bot' : opp.handle)} <span class="dim">(${mine === 'violet' ? 'we were violet' : 'we were green'})</span></td>
<td>${res}</td><td class="dim">${fmtDate(j.finishedAt ?? j.createdAt)}</td><td>${replay}</td></tr>`;
  })
  .join('\n')}</table>`;
}

export function teamPage({ user, d }) {
  const { row, current, compile, matches, member, joinCode } = d;
  const body = `
<h1>${esc(row.folder)}</h1>
<p>${membersHtml(row.members)}</p>
<p>${statusHtml(row.status)} · last update ${fmtDate(row.updatedAt)} · ladder ${standingHtml(row.standing)} · ${row.source === 'web' ? 'managed on the web' : 'managed on GitHub'}
${member ? ` · <a href="/team">edit on your team page</a>` : ''}</p>
${joinCode && row.members.length < 2 ? `<p class="dim">Join code (members and the organizer see this): <code>${esc(joinCode)}</code></p>` : ''}
<h2>Pilot</h2>
${current
  ? `<p class="dim"><code>entrants/${esc(row.folder)}/pilot.md</code> · ${esc(current.hash.slice(0, 8))} · ${fmtDate(current.at)}</p>
${current.text === null ? '<p class="dim">The arena has not cached this text yet; it appears after the next sync.</p>' : `<pre class="pilot">${esc(current.text)}</pre>`}`
  : '<p class="dim">Nothing submitted yet.</p>'}
<h2>Compile</h2>
${compileHtml(compile)}
<h2>Recent matches</h2>
${matchesHtml(row.folder, matches)}
`;
  return page({ title: row.folder, path: '/teams', user, body });
}

/** `/team`: yours. Not on a team → create / join; on one → the submit form. */
export function myTeamPage({ user, team, folder, current, open, cutoffLabel, cfg, flash, draft, conflict, result }) {
  if (!team) {
    const body = `
<h1>Your team</h1>
<p>${cutoffLine({ open, cutoffLabel })} You are signed in as <b>${esc(user.email)}</b>; that is how the arena knows who is on which
team — only a team's members can submit for it.</p>
${open
  ? `<div class="row">
<form method="post" action="/team/create" class="card">
  <h2>Create a team (you are its lead)</h2>
  <label for="c-handle">Your handle — your team's folder name starts with it</label>
  <input type="text" id="c-handle" name="handle" value="${esc(draft?.handle ?? user.handle ?? '')}" required pattern="[A-Za-z0-9_][A-Za-z0-9._-]*" maxlength="39">
  <p><button type="submit">Create the team</button></p>
  <p class="dim" style="margin:0">You get a join code to send your learner. A lead with no learner may enter solo.</p>
</form>
<form method="post" action="/team/join" class="card">
  <h2>Join a team (as its learner)</h2>
  <label for="j-handle">Your handle</label>
  <input type="text" id="j-handle" name="handle" value="${esc(draft?.handle ?? user.handle ?? '')}" required pattern="[A-Za-z0-9_][A-Za-z0-9._-]*" maxlength="39">
  <label for="j-code">Join code from your lead</label>
  <input type="text" id="j-code" name="code" value="" required maxlength="20" autocomplete="off">
  <p><button type="submit">Join</button></p>
  <p class="dim" style="margin:0">Teams of three are assigned by the organizer, not joined.</p>
</form>
</div>`
  : ''}
<p class="dim">Already entered by pull request? Your team keeps working that way. To edit it here instead, ask the organizer to link
it to your login.</p>`;
    return page({ title: 'Your team', path: '/team', user, body, flash });
  }
  const me = team.members.find((m) => m.email === user.email);
  const text = draft?.prompt ?? current?.text ?? '';
  const base = conflict ? conflict.currentBlobSha ?? '' : draft?.base ?? current?.blobSha ?? '';
  const resultHtml = result
    ? `<div class="card"><p class="ok"><b>${result.unchanged ? 'No change — that is already the pilot.md in the repo.' : 'Submitted.'}</b></p>
<p>${result.commit ? `Committed to jamobair-entrants as <code>${esc(String(result.commit).slice(0, 8))}</code>: ` : ''}<code>entrants/${esc(result.folder)}/pilot.md</code>
(${esc(result.hash.slice(0, 8))}). The entrants validator passed it. The ladder places it within a minute;
<a href="${esc(teamUrl(result.folder))}">your team page</a> shows its compile and its placement matches.</p></div>`
    : '';
  const conflictHtml = conflict
    ? `<div class="card"><p class="bad"><b>Not submitted: the pilot.md in the repo changed since you loaded this page.</b> Your text is still in the box
below. This is what the repo has now — merge what you want from it into yours, then submit again (the form now replaces this version):</p>
${conflict.currentText === null ? '<p class="dim">(the file was removed)</p>' : `<pre class="pilot">${esc(conflict.currentText)}</pre>`}</div>`
    : '';
  const body = `
<h1>Your team: ${esc(folder)}</h1>
<p>${team.members.map((m) => `${esc(m.handle)} <span class="dim">(${esc(m.role)}${m.email === user.email ? ', you' : ''})</span>`).join(', ')}
· <a href="${esc(teamUrl(folder))}">team page</a></p>
${team.members.length < 2 && open ? `<p>Join code for your learner: <code>${esc(team.joinCode)}</code> <span class="dim">— send it to them; they open <b>Your team</b> → <i>Join</i>.</span></p>` : ''}
<p>${cutoffLine({ open, cutoffLabel })}</p>
${resultHtml}${conflictHtml}
${open
  ? `<form method="post" action="/team/submit">
  <input type="hidden" name="base" value="${esc(base)}">
  <label for="prompt">Your team's <code>entrants/${esc(folder)}/pilot.md</code> — one prompt drives drums, keytar and violin. The rules are the
  entrants validator's: no code fences, no URLs (at most ${esc(cfg.maxPromptBytes / 1024)} KB here).</label>
  <textarea id="prompt" name="prompt" required placeholder="You are a bearbot on the drums…">
${esc(text)}</textarea>
  <p class="dim" style="margin:4px 0">${current ? `Replacing ${esc(current.hash.slice(0, 8))} (${fmtDate(current.at)}).` : 'Your first submission.'} Submitting commits it to
  jamobair-entrants on your team's behalf — the same as a merged pull request. Try it on the <a href="/compile">compile panel</a> first.</p>
  <p><button type="submit">Submit as ${esc(me.handle)}</button></p>
</form>`
  : current?.text != null ? `<h2>Your pilot</h2><pre class="pilot">${esc(current.text)}</pre>` : '<p class="dim">Your team did not submit a pilot.</p>'}
`;
  return page({ title: 'Your team', path: '/team', user, body, flash });
}
