import { esc, fmtDate, page } from './layout.mjs';

const BY = { nexus: 'nexus kill', timeout: 'timeout tiebreak', deaths: 'draw · fewer deaths', towerHp: 'draw · more tower hp', errors: 'draw · fewer errors', seed: 'draw · higher seed', bye: 'bye', ruling: 'organizer ruling', result: 'result' };

function seedTag(s, cls) {
  if (!s) return '<span class="dim">—</span>';
  return `<span class="${cls}"><b>${esc(s.handle)}</b></span> <span class="dim">#${s.seed} · ${s.elo}</span>`;
}

function slotHtml(slot, view, { organizer }) {
  const { current } = slot;
  const hidden = slot.held && !organizer;
  let line;
  if (slot.status === 'bye') line = `<span class="dim">bye → <b>${esc(slot.seedA?.handle ?? slot.seedB?.handle)}</b></span>`;
  else if (slot.status === 'waiting') line = '<span class="dim">waiting on the previous round</span>';
  else if (slot.status === 'ready') line = '<span class="dim">not played yet</span>';
  else if (slot.status === 'held') line = '<span class="warn">played or in progress — held until jam day</span>';
  else if (slot.status === 'hidden') line = '<span class="dim">revealed on jam day</span>';
  else if (slot.status === 'queued') line = `<span class="pill q">queued</span> <a href="/matches/${esc(current.id)}">${esc(current.id)}</a> · <a href="/play/?live=${esc(current.id)}">watch when it starts</a>`;
  else if (slot.status === 'started') line = `<span class="pill run">LIVE</span> <a class="btn" href="/play/?live=${esc(current.id)}">Watch live</a> <a href="/matches/${esc(current.id)}">${esc(current.id)}</a>`;
  else if (slot.status === 'needs-rerun') line = `<span class="bad">${esc(current.status)}${current.reason ? ` — ${esc(current.reason)}` : ''}</span> · <a href="/matches/${esc(current.id)}">${esc(current.id)}</a> · needs a re-run`;
  else if (hidden) line = `<span class="warn">played — held until jam day</span>`;
  else {
    const w = slot.winner === slot.a ? slot.seedA : slot.seedB;
    const by = BY[slot.by] ?? slot.by;
    const links = current
      ? `<div class="links"><a class="btn" href="/play/?replay=/logs/${esc(current.id)}.json&speed=4">Replay 4×</a> <a href="/matches/${esc(current.id)}">${esc(current.id)}</a></div>`
      : '';
    line = `<b class="ok">${esc(w?.handle ?? '?')}</b> advances <span class="dim">(${esc(by)}${slot.ruling ? `: ${esc(slot.ruling.reason)}` : ''})</span>${links}`;
  }
  let controls = '';
  if (organizer && slot.a !== null && slot.b !== null) {
    const base = `/api/brackets/${esc(view.tournamentId)}/slots/${slot.round}/${slot.slot}`;
    const rerun = ['done', 'needs-rerun', 'ruled'].includes(slot.status) ? `<form method="post" action="${base}/rerun"><button class="secondary" type="submit">Re-run (new seed)</button></form>` : '';
    const rule = `<form method="post" action="${base}/ruling" class="rule"><select name="winner"><option value="${slot.a}">${esc(slot.seedA.handle)}</option><option value="${slot.b}">${esc(slot.seedB.handle)}</option></select><input type="text" name="reason" placeholder="reason"><button class="secondary" type="submit">Rule</button></form>`;
    controls = `<div class="controls">${rerun}${rule}</div>`;
  }
  return `<div class="card slot">
<div>${seedTag(slot.seedA, 'violet')} <span class="dim">vs</span> ${seedTag(slot.seedB, 'green')}</div>
<div>${line}</div>${controls}</div>`;
}

/** The jam-day bracket: one column per round, organizer controls per round and slot. */
export function bracketPage({ user, view, others, flash }) {
  if (!view) {
    const body = `<h1>Bracket</h1><p class="dim">No bracket yet.${user.organizer ? ' Create one from the ladder on <a href="/admin">Admin</a>.' : ' The organizer seeds it from the ladder after the cutoff.'}</p>`;
    return page({ title: 'Bracket', path: '/bracket', user, body, flash });
  }
  const organizer = !!user.organizer;
  const cols = view.rounds
    .map((r) => {
      let ctl = '';
      if (organizer) {
        const base = `/api/brackets/${esc(view.tournamentId)}/rounds/${r.round}`;
        const runnable = r.slots.some((s) => s.status === 'ready');
        ctl += runnable ? `<form method="post" action="${base}/run" style="display:inline"><button type="submit">Run ${esc(r.name.toLowerCase())}</button></form> ` : '';
        if (r.round <= view.preRunRounds) ctl += r.held ? `<form method="post" action="${base}/reveal" style="display:inline"><button class="secondary" type="submit">Reveal results</button></form>` : '<span class="ok">revealed</span>';
      }
      const heldNote = r.held ? `<p class="warn" style="margin:4px 0">${organizer ? 'held — only you can see results' : 'pre-run; results revealed on jam day'}</p>` : '';
      return `<div class="round"><h2>${esc(r.name)}</h2>${heldNote}<p>${ctl}</p>${r.slots.map((s) => slotHtml(s, view, { organizer })).join('')}</div>`;
    })
    .join('');
  const seeds = view.seeds.map((s) => `<tr><td class="num">${s.seed}</td><td><b>${esc(s.handle)}</b> <span class="dim">${esc(s.hash.slice(0, 8))}</span></td><td class="num">${s.elo}</td></tr>`).join('');
  const body = `
<h1>${esc(view.name)}</h1>
<p class="dim">Single elimination seeded by the ladder (Q6): #1 plays #${view.size}, byes to the top seeds. Backend
<code>${esc(view.backend)}</code>, cadence ${esc(view.cadenceSec)} s, ${esc(view.maxSimSec)} s per match — fixed for this
tournament and recorded in every log. A full draw goes deaths → tower hp → errors → higher seed (Q7).
${view.preRunRounds > 0 ? `Round${view.preRunRounds > 1 ? `s 1–${esc(view.preRunRounds)} are` : ' 1 is'} pre-run and held until revealed (Q9); later rounds play live.` : 'Every round plays live.'}
Created ${fmtDate(view.createdAt)}.</p>
${view.champion ? `<p class="flash"><b>${esc(view.champion.handle)}</b> wins ${esc(view.name)}.</p>` : ''}
<style>.rounds{display:flex;gap:14px;overflow-x:auto;align-items:flex-start}.round{flex:0 0 300px}.slot{margin:8px 0}
.slot .links{margin-top:6px}.slot .controls{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;padding-top:8px;border-top:1px dashed var(--line)}
.slot .controls form{display:flex;gap:6px;align-items:center}.slot .controls .rule select,.slot .controls .rule input{width:auto}.slot .controls .rule input{width:9em}</style>
<div class="rounds">${cols}</div>
<h2>Seeds</h2>
<table><tr><th class="num">#</th><th>Handle · merged hash</th><th class="num">Elo at seeding</th></tr>${seeds}</table>
${others.length ? `<p class="dim">Other brackets: ${others.map((id) => `<a href="/bracket/${esc(id)}">${esc(id)}</a>`).join(' · ')}</p>` : ''}
`;
  return page({ title: view.name, path: '/bracket', user, body, flash });
}
