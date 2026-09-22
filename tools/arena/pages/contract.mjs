import { esc, page } from './layout.mjs';
import { HANDLE_RE } from '../prompts.mjs';

/**
 * The prompt contract, served by Elysium itself so it needs only Access — not GitHub access to
 * the private `jamobair-entrants` repo. Content is hand-kept in sync with the frozen v1 specimen
 * (`src/types.ts`, `src/pilots/promptPilot.ts` — see `runs/historical-v1.md`, never patched) and
 * with `tools/arena/prompts.mjs`'s entry rules; `test_contract.mjs` reads those files and fails
 * if this page drifts from them.
 */

// Verbatim from `PromptPilot.buildPrompt` (src/pilots/promptPilot.ts) — the line the game inserts
// between your prompt text and the Observation JSON. Keep this in lockstep with that literal;
// `test_contract.mjs` checks it.
export const REPLY_INSTRUCTION =
  'Reply with ONLY one JSON object, no prose: {"kind": "move"|"attack"|"ability"|"recall"|"hold", "target"?: string | {"x":number,"y":number}, "ability"?: string}';

const EXAMPLE_OBSERVATION = {
  clockSec: 123.5,
  self: {
    id: 'violet-drums',
    team: 'violet',
    lane: 'top',
    instrument: 'drums',
    pos: { x: 12.4, y: 3.1 },
    hp: 340,
    maxHp: 480,
    moveSpeed: 5.2,
    cooldowns: { slam: 0, dash: 4.5 },
  },
  allies: [{ id: 'violet-keytar', pos: { x: 10.1, y: 4.0 }, hp: 260, maxHp: 300 }],
  visibleEnemies: [{ id: 'green-violin', pos: { x: 15.0, y: 2.8 }, hp: 200, maxHp: 300, kind: 'bearbot' }],
  nearbyMinions: [{ id: 'green-minion-4', team: 'green', pos: { x: 14.0, y: 3.0 }, hp: 40, maxHp: 60 }],
  nearbyTowers: [{ id: 'violet-tower-top-1', team: 'violet', lane: 'top', pos: { x: 8.0, y: 3.0 }, hp: 1200, maxHp: 1200, alive: true }],
};

export function contractPage({ user }) {
  const promptExample = 'You are a bearbot on the drums, team violet, lane top…';
  const fullPrompt = [promptExample, '', REPLY_INSTRUCTION, '', 'OBSERVATION:', JSON.stringify(EXAMPLE_OBSERVATION)].join('\n');
  const body = `
<h1>The prompt contract</h1>
<p class="dim">The exact text the game sends your prompt, the reply it expects back, and the entry rules —
served here so reading it needs only your InRhythm login, not access to a private GitHub repo.</p>

<h2>1 · What you submit</h2>
<p>One file: <code>entrants/&lt;your-handle&gt;/pilot.md</code>, where <code>&lt;your-handle&gt;</code> is your
GitHub login (letters, digits, <code>. _ -</code>, up to 39 characters — pattern
<code>${esc(HANDLE_RE.source)}</code>). It drives all three bearbots on your side at once: the same prompt text,
handed to drums (top), keytar (mid) and violin (bottom).</p>
<p>Entry rules (enforced by the entrants repo's validator and, for quick tests here, by this arena — the same
rules, ported verbatim):</p>
<ul>
  <li>Non-empty.</li>
  <li>No code fences — no <code>\`\`\`</code> or <code>~~~</code> anywhere in the file.</li>
  <li>No URLs — no <code>http://</code>, <code>https://</code> or <code>www.</code></li>
  <li>No line or byte cap. What bounds an oversized prompt is the model's context window, not a rule.</li>
</ul>

<h2>2 · What the game sends your prompt</h2>
<p>Every time a bearbot needs a decision, the runner builds one text prompt: your file's text (trimmed), a
blank line, this fixed instruction line, a blank line, then <code>OBSERVATION:</code> and one JSON object
describing what that bearbot can see right now. Example (values invented, shape exact):</p>
<pre>${esc(fullPrompt)}</pre>

<h2>3 · The Observation object</h2>
<table>
<tr><th>Field</th><th>Meaning</th></tr>
<tr><td><code>clockSec</code></td><td>Sim-seconds elapsed in the match.</td></tr>
<tr><td><code>self</code></td><td><code>id</code>, <code>team</code> (<code>violet</code>|<code>green</code>),
<code>lane</code> (<code>top</code>|<code>mid</code>|<code>bottom</code>), <code>instrument</code>
(<code>drums</code>|<code>keytar</code>|<code>violin</code>), <code>pos</code> (<code>{x,y}</code>),
<code>hp</code>, <code>maxHp</code>, <code>moveSpeed</code>, <code>cooldowns</code> (ability name → seconds
remaining, <code>0</code> = ready).</td></tr>
<tr><td><code>allies</code></td><td>Array of <code>{id, pos, hp, maxHp}</code> — your other two bearbots.</td></tr>
<tr><td><code>visibleEnemies</code></td><td>Array of <code>{id, pos, hp, maxHp, kind}</code>, <code>kind</code> one
of <code>bearbot</code>|<code>minion</code>|<code>tower</code>|<code>nexus</code>.</td></tr>
<tr><td><code>nearbyMinions</code></td><td>Array of <code>{id, team, pos, hp, maxHp}</code>.</td></tr>
<tr><td><code>nearbyTowers</code></td><td>Array of <code>{id, team, lane, pos, hp, maxHp, alive}</code>.</td></tr>
</table>

<h2>4 · What you must reply</h2>
<p>Exactly one JSON object, nothing else:</p>
<ul>
  <li><code>kind</code> — one of <code>move</code>, <code>attack</code>, <code>ability</code>, <code>recall</code>,
  <code>hold</code>. Required.</li>
  <li><code>target</code> — an entity <code>id</code> string (for <code>attack</code>/<code>ability</code>) or a
  <code>{x,y}</code> position (for <code>move</code>). Optional, depends on <code>kind</code>.</li>
  <li><code>ability</code> — the ability name, for <code>kind: "ability"</code>. Optional.</li>
</ul>
<p class="dim">Only <code>kind</code>, <code>target</code> and <code>ability</code> are read — extra keys in the
reply object are legal and ignored, which is a handy place to keep a running worksheet if that helps the model
reason (the house bot's own prompts do this; see <a href="/test">Test</a> to try it).</p>

<h2>5 · Where it lives</h2>
<p>Merge your file to <code>main</code> of
<a href="https://github.com/kumouri/jamobair-entrants">jamobair-entrants</a> (needs access — ask Ceryce in
Slack; the repo is private, round one is IR-only). The arena polls <code>main</code> every minute, validates and
hashes what it finds, and queues your placement matches automatically.</p>
`;
  return page({ title: 'Contract', path: '/contract', user, body });
}
