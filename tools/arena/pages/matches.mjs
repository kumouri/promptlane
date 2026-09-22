import { esc, fmtDate, fmtDuration, page, sideLabel, statusPill } from './layout.mjs';

function outcome(job) {
  if (job.held) return '<span class="warn">held until jam day</span>';
  if (job.status === 'started') return `<a href="/play/?live=${esc(job.id)}">watch live</a>`;
  if (job.status !== 'finished') return job.reason ? `<span class="dim">${esc(job.reason)}</span>` : '';
  const r = job.result;
  if (r.endReason === null) return `<span class="dim">unfinished (${Math.round(r.durationSec)} s)</span>`;
  const by = r.endReason === 'nexus' ? 'nexus kill' : 'timeout';
  if (r.winner === null) return `draw · ${by}`;
  const name = sideLabel(job.sides[r.winner]);
  return `<b class="${r.winner}">${esc(name)}</b> wins · ${by}`;
}

function rowHtml(job) {
  const v = sideLabel(job.sides.violet);
  const g = sideLabel(job.sides.green);
  const tags = [job.kind, job.bracket ? `r${job.bracket.round}` : '', job.quick ? 'quick' : 'full', job.ranked ? 'ranked' : ''].filter(Boolean).join(' · ');
  return `<tr><td><a href="/matches/${esc(job.id)}">${esc(job.id)}</a></td>
<td><span class="violet">${esc(v)}</span> vs <span class="green">${esc(g)}</span></td>
<td class="dim">${esc(tags)} · seed ${job.seed}</td><td>${statusPill(job)}</td><td>${outcome(job)}</td><td class="dim">${fmtDate(job.finishedAt ?? job.createdAt)}</td></tr>`;
}

/** Spectator page: what is running (with the live link), the queue, and recent matches. */
export function matchesPage({ user, queue, running, recent, paused, held = 0 }) {
  const body = `
<h1>Matches</h1>
${paused ? '<p class="warn">The queue is paused; nothing new starts until the organizer resumes it.</p>' : ''}
${held ? `<p class="warn">${held} pre-run <a href="/bracket">bracket</a> match${held === 1 ? ' is' : 'es are'} held until the organizer reveals the round on jam day.</p>` : ''}
<h2>Running — watch live</h2>
${
  running.length
    ? running.map((j) => `<p><a class="btn" href="/play/?live=${esc(j.id)}">Watch ${esc(sideLabel(j.sides.violet))} vs ${esc(sideLabel(j.sides.green))} live</a> <span class="dim">${esc(j.id)}${j.progress ? ` · sim ${Math.round(j.progress.clockSec)} s` : ''}</span></p>`).join('') +
      `<table>${running.map(rowHtml).join('')}</table>`
    : '<p class="dim">Nothing running. A queued match can be opened live too; the page waits for it to start.</p>'
}
<h2>Queued (${queue.length})</h2>
${queue.length ? `<table>${queue.map(rowHtml).join('')}</table>` : '<p class="dim">Queue is empty.</p>'}
<h2>Recent</h2>
${recent.length ? `<table>${recent.map(rowHtml).join('')}</table>` : '<p class="dim">No matches yet.</p>'}
`;
  return page({ title: 'Matches', path: '/matches', user, body });
}

function statsTable(job) {
  const s = job.result.stats;
  const row = (label, f) => `<tr><th>${label}</th><td class="num violet">${f(s.violet)}</td><td class="num green">${f(s.green)}</td></tr>`;
  const fin = job.final;
  return `<table>
<tr><th></th><th class="num violet">${esc(sideLabel(job.sides.violet))}</th><th class="num green">${esc(sideLabel(job.sides.green))}</th></tr>
${row('Model calls', (x) => x.calls)}
${row('Parse errors', (x) => x.parseErrors)}
${row('Call errors', (x) => x.callErrors)}
${row('Avg call (ms)', (x) => x.avgMs)}
${row('Deaths', (x) => x.deaths)}
${row('Towers lost', (x) => x.towersLost)}
${fin ? `<tr><th>Nexus hp at end</th><td class="num violet">${fin.nexus?.[0] ?? '—'}</td><td class="num green">${fin.nexus?.[1] ?? '—'}</td></tr>` : ''}
</table>`;
}

/** One match: status, result line, stats, the replay link. */
export function matchPage({ user, job, live, resultText, position }) {
  let status;
  if (job.status === 'queued') status = `<p class="pill q">queued</p><p>Position ${position} in the queue. <a class="btn" href="/play/?live=${esc(job.id)}">Open the live view</a> — it waits for the match to start. This page does not refresh itself; reload it.</p>`;
  else if (job.status === 'started') {
    const p = live?.progress;
    status = `<p class="pill run">running</p><p><a class="btn" href="/play/?live=${esc(job.id)}">Watch live</a> · started ${fmtDate(job.startedAt)}${p ? ` · sim clock ${Math.round(p.clockSec)} s · ${p.calls} calls · ${fmtDuration(p.elapsedMs)} wall` : ''}. Reload for progress.</p>`;
  } else if (job.held) {
    status = `<p class="warn">Played — result held until the organizer reveals this round on jam day.</p>`;
  } else if (job.status === 'finished') {
    status = `<p><b>${outcome(job)}</b> · sim ${Math.round(job.result.durationSec)} s · wall ${fmtDuration(job.wallMs)} · verified ${job.verify.checkpointsCompared} checkpoints</p>
<p><a class="btn" href="/play/?replay=/logs/${esc(job.id)}.json">Watch the replay</a> <a class="btn" href="/play/?replay=/logs/${esc(job.id)}.json&speed=4">at 4×</a> &nbsp; <a href="/logs/${esc(job.id)}.json">log JSON</a></p>
<pre>${esc(resultText)}</pre>
${statsTable(job)}`;
  } else {
    status = `<p class="bad">${esc(job.status)}${job.reason ? ` — ${esc(job.reason)}` : ''}</p>${
      job.status === 'timed-out' ? `<p><a href="/play/?replay=/logs/${esc(job.id)}.json">Watch what there is</a></p>` : ''
    }`;
  }
  const body = `
<h1>${esc(job.id)}</h1>
<p><span class="violet">${esc(sideLabel(job.sides.violet))}</span> (violet) vs <span class="green">${esc(sideLabel(job.sides.green))}</span> (green)
· seed ${job.seed} · ${esc(job.kind)} · ${job.quick ? 'quick' : 'full'} · ${job.ranked ? 'ranked' : 'not ranked'}
· cadence ${job.cadenceSec} s · backend <code>${esc(job.backend?.label ?? job.backendId)}</code>${job.requestedBy ? ` · requested by ${esc(job.requestedBy.handle)}` : ''}${
    job.bracket ? ` · <a href="/bracket/${esc(job.bracket.tournamentId)}">${esc(job.bracket.tournamentId)}</a> round ${job.bracket.round} slot ${job.bracket.slot + 1}` : ''
  }${
    job.retryOf ? ` · re-run of <a href="/matches/${esc(job.retryOf)}">${esc(job.retryOf)}</a>` : ''
  }</p>
${status}
`;
  return page({ title: job.id, path: '/matches', user, body });
}
