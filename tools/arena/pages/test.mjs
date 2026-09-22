import { esc, page } from './layout.mjs';

/**
 * Submit/test page: paste a scratch prompt (never ranked, never kept) or play your merged prompt,
 * against the house bot or another entrant's merged prompt, quick or full.
 */
export function testPage({ user, tournament, handles, myPrompt, quota, flash, draft }) {
  const opponents = handles.filter((h) => h !== user.handle);
  const q = tournament.quota;
  const quotaLine = user.handle
    ? `Today: ${quota.quick}/${q.quick} quick and ${quota.full}/${q.full} full tests used` +
      (quota.active ? ` · <span class="warn">${quota.active} test still queued or running — one at a time</span>` : '')
    : 'Enter your handle to see your quota.';
  const body = `
<h1>Test a prompt</h1>
<p class="dim">Quick = 3 sim-minutes at cadence ${esc(tournament.quick.cadenceSec)} s (a few wall-minutes). Full = the whole
10-minute match at cadence ${esc(tournament.cadenceSec)} s (about 25 wall-minutes on the local model). Matches run one at a
time; the <a href="/matches">queue</a> shows where yours is.</p>
<form method="post" action="/test">
  <label for="handle">Your handle (GitHub login — the folder name under <code>entrants/</code>)</label>
  <input type="text" id="handle" name="handle" value="${esc(draft?.handle ?? user.handle ?? '')}" required pattern="[A-Za-z0-9_][A-Za-z0-9._-]*" maxlength="39">
  <p class="dim" style="margin:4px 0 0">${quotaLine}</p>

  <label>Prompt to play</label>
  <div class="card">
    <label style="margin-top:0"><input type="radio" name="source" value="scratch" ${draft?.source !== 'merged' ? 'checked' : ''}> Scratch — paste text below. Same rules as the validator: one file, no code fences, no URLs. Never ranked, never stored past the match log.</label>
    <textarea name="prompt" placeholder="You are a bearbot on the drums…">${esc(draft?.prompt ?? '')}</textarea>
    <label><input type="radio" name="source" value="merged" ${draft?.source === 'merged' ? 'checked' : ''} ${myPrompt ? '' : 'disabled'}> My merged prompt${
      myPrompt ? ` <span class="dim">(${esc(myPrompt.hash.slice(0, 8))}, seen ${esc(myPrompt.seenAt.slice(0, 10))})</span>` : ' <span class="dim">— none merged yet for this handle</span>'
    }</label>
  </div>

  <div class="row">
    <div><label for="opponent">Opponent</label>
    <select id="opponent" name="opponent">
      <option value="house">house bot</option>
      ${opponents.map((h) => `<option value="${esc(h)}" ${draft?.opponent === h ? 'selected' : ''}>${esc(h)} (merged prompt)</option>`).join('')}
    </select></div>
    <div><label for="kind">Length</label>
    <select id="kind" name="kind">
      <option value="quick" ${draft?.kind !== 'full' ? 'selected' : ''}>quick — 3 sim-min, not ranked</option>
      <option value="full" ${draft?.kind === 'full' ? 'selected' : ''}>full — 10 sim-min${myPrompt ? ', ranked if both prompts are merged' : ''}</option>
    </select></div>
  </div>
  <p><button type="submit">Queue the match</button></p>
</form>
<p class="dim">To get <em>on the ladder</em> you merge: <code>entrants/${esc(user.handle ?? '<handle>')}/pilot.md</code> in
<a href="https://github.com/kumouri/jamobair-entrants">jamobair-entrants</a>. Placements queue themselves within a minute of the merge.
Anyone who can watch a match can read the prompt that played in it, scratch included.</p>
`;
  return page({ title: 'Test', path: '/test', user, body, flash });
}
