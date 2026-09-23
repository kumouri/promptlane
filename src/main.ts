import './style.css';
import type { Instrument, Lane, PilotKind, Team } from './types';
import { Match, RosterSlot } from './sim/match';
import { ScriptedPilot } from './pilots/scriptedPilot';
import { PromptPilot } from './pilots/promptPilot';
import { mockCallModel, httpCallModel } from './pilots/callModel';
import { RenderFx, render } from './render';
import { CHECKPOINT_EVERY_TICKS, isMatchLog, tickOf, type MatchLog } from './replay';
import { DivergenceCheck, LiveFeed, LivePacer, Ticker, buildMatch, openLive } from './live';

import drumsPrompt from '../prompts/pilots/drums.md?raw';
import keytarPrompt from '../prompts/pilots/keytar.md?raw';
import violinPrompt from '../prompts/pilots/violin.md?raw';

const PROMPT_BY_INSTRUMENT: Record<Instrument, string> = {
  drums: drumsPrompt,
  keytar: keytarPrompt,
  violin: violinPrompt,
};

interface SlotConfig {
  team: Team;
  lane: Lane;
  instrument: Instrument;
  pilotKind: PilotKind;
}

const DEFAULT_SLOTS: SlotConfig[] = [
  { team: 'violet', lane: 'top', instrument: 'drums', pilotKind: 'scripted' },
  { team: 'violet', lane: 'mid', instrument: 'keytar', pilotKind: 'scripted' },
  { team: 'violet', lane: 'bottom', instrument: 'violin', pilotKind: 'scripted' },
  { team: 'green', lane: 'top', instrument: 'drums', pilotKind: 'scripted' },
  { team: 'green', lane: 'mid', instrument: 'keytar', pilotKind: 'scripted' },
  { team: 'green', lane: 'bottom', instrument: 'violin', pilotKind: 'scripted' },
];

const slots = DEFAULT_SLOTS.map((s) => ({ ...s }));

const SPEEDS = [1, 4, 16];

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div class="topbar">
    <div class="clock" id="clock">10:00</div>
    <div class="score">
      <span class="violet-team" id="score-violet">VIOLET 0</span>
      &nbsp;—&nbsp;
      <span class="green-team" id="score-green">0 GREEN</span>
    </div>
    <div class="actions">
      <span class="live-badge" id="live-badge" hidden></span>
      <label class="speed-pick" id="speed-pick" hidden title="Replay speed">Speed <select id="speed">${SPEEDS.map((s) => `<option value="${s}">${s}×</option>`).join('')}</select></label>
      <label class="replay-pick" title="Replay a match log written by npm run match">Replay…<input type="file" id="replay-file" accept=".json,application/json"></label>
      <button id="start-btn">Start match</button>
    </div>
  </div>
  <div class="main">
    <canvas id="arena"></canvas>
    <div class="sidepanel">
      <h2>Roster</h2>
      <div class="roster" id="roster"></div>
      <h2>Selected pilot</h2>
      <div class="prompt-view" id="prompt-view">
        <div class="hint">Start a match, then pick a bearbot.</div>
      </div>
    </div>
  </div>
`;

const canvas = document.querySelector<HTMLCanvasElement>('#arena')!;
const ctx = canvas.getContext('2d')!;
const clockEl = document.querySelector<HTMLDivElement>('#clock')!;
const scoreVioletEl = document.querySelector<HTMLSpanElement>('#score-violet')!;
const scoreGreenEl = document.querySelector<HTMLSpanElement>('#score-green')!;
const startBtn = document.querySelector<HTMLButtonElement>('#start-btn')!;
const rosterEl = document.querySelector<HTMLDivElement>('#roster')!;
const promptViewEl = document.querySelector<HTMLDivElement>('#prompt-view')!;
const replayFileEl = document.querySelector<HTMLInputElement>('#replay-file')!;
const liveBadgeEl = document.querySelector<HTMLSpanElement>('#live-badge')!;
const speedPickEl = document.querySelector<HTMLLabelElement>('#speed-pick')!;
const speedEl = document.querySelector<HTMLSelectElement>('#speed')!;

let match: Match | null = null;
let selectedBotId: string | null = null;
/** One shared instance: `prune()` clears out a prior match's entries as soon as a new one is touched. */
const renderFx = new RenderFx();

/**
 * Set while replaying or watching live (`?replay=`, `?live=`, the file picker); null for a local
 * match. Both are the same external-tick driver over a `LiveFeed` (`src/live.ts`): a replay's
 * feed is filled from the log up front, a live feed grows as SSE events arrive.
 */
interface View {
  mode: 'replay' | 'live';
  feed: LiveFeed;
  check: DivergenceCheck | null;
  ticker: Ticker | null;
  stream: { close: () => void } | null;
  source: string;
  error: string | null;
}
let view: View | null = null;

const params = new URLSearchParams(location.search);
let speed = SPEEDS.includes(Number(params.get('speed'))) ? Number(params.get('speed')) : 1;
speedEl.value = String(speed);
speedEl.addEventListener('change', () => {
  speed = Number(speedEl.value);
});

/**
 * The isometric diamond (docs/render-spec.md §4) is wider than it is tall, unlike the old top-down
 * square, and it has to fit whatever box the flex layout hands it — full desktop width, or a short
 * stacked strip above the roster on a phone (§15/§9's media query in style.css). So the canvas is
 * given a plain CSS box (`width/height: 100%` in style.css) instead of relying on its own
 * attribute-derived aspect ratio to size itself, and the backing bitmap is resized to match that
 * box exactly; `render()`'s `fitIso()` does the rest for whatever aspect ratio results.
 */
function resizeCanvas(): void {
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(rect.width));
  canvas.height = Math.max(1, Math.round(rect.height));
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function pilotLabel(kind: PilotKind): string {
  return kind === 'scripted' ? 'Scripted' : kind === 'prompt-mock' ? 'Prompt-mock' : 'Prompt-HTTP';
}

function renderRoster(): void {
  rosterEl.innerHTML = '';
  slots.forEach((slot, i) => {
    const bot = match?.bearbots[i];
    const row = document.createElement('div');
    row.className = 'roster-row' + (bot && bot.id === selectedBotId ? ' selected' : '');
    const label = `${slot.team === 'violet' ? '🟪' : '🟩'} ${slot.lane} · ${slot.instrument}`;
    row.innerHTML = `<span class="name">${label}</span>`;

    if (view?.feed.meta) {
      const who = document.createElement('span');
      who.className = 'pilot-name';
      who.textContent = view.feed.meta.sides[slot.team].name;
      row.appendChild(who);
    }

    const select = document.createElement('select');
    select.hidden = !!view;
    (['scripted', 'prompt-mock', 'prompt-http'] as PilotKind[]).forEach((k) => {
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = pilotLabel(k);
      if (k === slot.pilotKind) opt.selected = true;
      select.appendChild(opt);
    });
    select.disabled = !!match && match.running;
    select.addEventListener('change', () => {
      slot.pilotKind = select.value as PilotKind;
    });
    row.appendChild(select);

    row.addEventListener('click', (ev) => {
      if ((ev.target as HTMLElement).tagName === 'SELECT') return;
      if (bot) {
        selectedBotId = bot.id;
        renderRoster();
        renderPromptView();
      }
    });

    rosterEl.appendChild(row);
  });
}

let promptViewKey = '';
function renderPromptView(force = false): void {
  if (!match || !selectedBotId) {
    const hint = view?.error
      ? `Could not load ${escapeHtml(view.source)}: ${escapeHtml(view.error)}`
      : view?.feed.waiting
        ? `Queued — position ${view.feed.waiting.position}. This page starts the moment the match does.`
        : view
          ? 'Connecting…'
          : 'Start a match, then pick a bearbot.';
    setPromptView('', `<div class="hint">${hint}</div>`, force);
    return;
  }
  const kind = match.getPilotKind(selectedBotId);
  if (kind === 'scripted') {
    setPromptView('scripted', '<div class="hint">Scripted pilot — no prompt, just heuristics.</div>', force);
    return;
  }
  const trace = match.promptTrace.get(selectedBotId);
  if (view?.feed.meta) {
    const bot = match.bearbots.find((b) => b.id === selectedBotId)!;
    const side = view.feed.meta.sides[bot.team];
    const replyLabel = `Last reply${trace ? ` (t=${trace.atSec.toFixed(1)}s)` : ''}`;
    const replyBody = trace ? escapeHtml(trace.reply) : '<span class="hint">no decision yet</span>';
    setPromptView(
      `${selectedBotId}:${trace?.atSec ?? -1}`,
      `<div class="block"><div class="label">${escapeHtml(side.name)} · ${escapeHtml(side.promptFile)}</div>` +
        `${escapeHtml(side.promptText.trim())}</div>` +
        `<div class="block"><div class="label">${replyLabel}</div>${replyBody}</div>`,
      force,
    );
    return;
  }
  if (!trace) {
    setPromptView(`${selectedBotId}:none`, '<div class="hint">Waiting on its first decision…</div>', force);
    return;
  }
  setPromptView(
    `${selectedBotId}:${trace.atSec}`,
    `
    <div class="block">
      <div class="label">Prompt (t=${trace.atSec.toFixed(1)}s)</div>
      ${escapeHtml(trace.prompt)}
    </div>
    <div class="block">
      <div class="label">Reply</div>
      ${escapeHtml(trace.reply)}
    </div>
  `,
    force,
  );
}

/** The side panel is refreshed every frame in replay/live mode; only touch the DOM when it changed. */
function setPromptView(key: string, html: string, force: boolean): void {
  if (!force && key === promptViewKey && key !== '') return;
  promptViewKey = key;
  promptViewEl.innerHTML = html;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] ?? c));
}

function buildRoster(): RosterSlot[] {
  let mockSeed = 100;
  return slots.map((slot) => ({
    team: slot.team,
    lane: slot.lane,
    instrument: slot.instrument,
    pilotKind: slot.pilotKind,
    makePilot: (bot) => {
      if (slot.pilotKind === 'scripted') return new ScriptedPilot();
      const callModel = slot.pilotKind === 'prompt-mock' ? mockCallModel(mockSeed++) : httpCallModel();
      return new PromptPilot(PROMPT_BY_INSTRUMENT[slot.instrument], callModel, (prompt, reply, action) => {
        match?.recordPromptTrace(bot.id, { prompt, reply, action, atSec: match.clockSec });
      });
    },
  }));
}

function teardownView(): void {
  view?.ticker?.stop();
  view?.stream?.close();
  view = null;
  liveBadgeEl.hidden = true;
  speedPickEl.hidden = true;
}

function startMatch(): void {
  match?.stop();
  teardownView();
  match = new Match(Date.now() & 0xffffffff, buildRoster());
  selectedBotId = match.bearbots[0]?.id ?? null;
  match.onUpdate(onMatchTick);
  match.start();
  startBtn.textContent = 'Restart';
  renderRoster();
  renderPromptView(true);
}

/**
 * Replay a log from `npm run match` (or the arena): re-run the same seeded sim with each bearbot
 * answering from the log instead of a model, driven from outside at the chosen speed.
 * Checkpoints in the log are compared as the clock passes them, so a divergence (a changed sim,
 * a wrong log) is shown rather than silently played.
 */
function startReplay(log: MatchLog, source: string): void {
  match?.stop();
  teardownView();
  view = { mode: 'replay', feed: LiveFeed.fromLog(log), check: null, ticker: null, stream: null, source, error: null };
  attachMatch(view);
}

/**
 * Watch a match the arena is running (`?live=<id>`): the same replay, except the log is still
 * being written. Events arrive over SSE; the sim is stepped only up to the last completed round,
 * so the browser is always a little behind the server and never has to guess.
 */
function startLive(id: string): void {
  match?.stop();
  teardownView();
  const feed = new LiveFeed();
  const v: View = { mode: 'live', feed, check: null, ticker: null, stream: null, source: `live ${id}`, error: null };
  view = v;
  v.stream = openLive(
    `/api/matches/${encodeURIComponent(id)}/events`,
    feed,
    () => {
      if (view !== v) return;
      if (feed.meta && !v.ticker) attachMatch(v);
      else if (!v.ticker) renderPromptView(true);
    },
    (message) => {
      if (view !== v || v.ticker) return;
      v.error = message || v.error;
      renderPromptView(true);
    },
  );
  startBtn.textContent = 'Local match';
  renderRoster();
  renderPromptView(true);
}

/** Once the header is known: build the match and start the driver. */
function attachMatch(v: View): void {
  const { feed } = v;
  const built = buildMatch(feed, (i, decision, action) => {
    const m = built.match;
    m.recordPromptTrace(m.bearbots[i].id, { prompt: '', reply: decision.reply ?? '', action, atSec: m.clockSec });
  });
  match = built.match;
  selectedBotId = match.bearbots[0]?.id ?? null;
  const check = new DivergenceCheck(feed, CHECKPOINT_EVERY_TICKS);
  feed.onCheckpoint = (tick, state) => check.onCheckpoint(tick, state);
  v.check = check;
  // live (genuinely unfinished): meter ticks at the observed round-arrival pace instead of
  // bursting to the frontier the instant each round confirms (docs/render-spec.md §8) — Infinity
  // only while more than one round behind (a fresh load or reconnect catching up for real).
  // replay (a finished log, or a stream the server synthesized from one): the chosen speed.
  const live = v.mode === 'live' && !feed.meta?.finished;
  const builtMatch = built.match;
  const pacer = live ? new LivePacer({ cadenceSec: feed.meta!.cadenceSec, getCurrentTick: () => tickOf(builtMatch) }) : null;
  feed.onRound = pacer ? (tick) => pacer.onRound(tick) : null;
  v.ticker = new Ticker(match, built.asks, {
    limit: () => feed.limitTick,
    speed: () => (pacer ? pacer.speed() : speed),
    finished: () => v.mode === 'replay' || !!feed.end,
    onTick: () => {
      check.afterTick(built.match);
      return check.divergedAt === null;
    },
  });
  speedPickEl.hidden = live;
  liveBadgeEl.hidden = false;
  startBtn.textContent = 'Local match';
  renderRoster();
  renderPromptView(true);
}

function sideLabel(team: Team): string {
  return (view?.feed.meta ? view.feed.meta.sides[team].name : team).toUpperCase();
}

function clockText(sec: number): string {
  const mins = Math.max(0, Math.floor((600 - sec) / 60));
  const secs = Math.max(0, Math.floor((600 - sec) % 60));
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/** Top bar for the driver modes; called every frame (cheap: a few text nodes). */
function refreshHud(): void {
  if (!view) return;
  const { feed, check } = view;
  if (!match) {
    clockEl.textContent = feed.waiting ? `QUEUED #${feed.waiting.position}` : view.error ? 'NO STREAM' : 'CONNECTING…';
    liveBadgeEl.hidden = false;
    liveBadgeEl.textContent = view.mode === 'live' ? 'LIVE' : 'REPLAY';
    return;
  }
  const t = tickOf(match);
  scoreVioletEl.textContent = `${sideLabel('violet')} ${match.towersDestroyedBy('green')}`;
  scoreGreenEl.textContent = `${match.towersDestroyedBy('violet')} ${sideLabel('green')}`;
  if (check?.divergedAt !== null && check?.divergedAt !== undefined) {
    clockEl.textContent = `REPLAY DIVERGED @${(check.divergedAt * (feed.meta?.tickDt ?? 0.05)).toFixed(1)}s`;
  } else if (match.ended) {
    const who = match.winner ? sideLabel(match.winner) : 'NOBODY';
    clockEl.textContent = `${who} WINS (${match.endReason})`;
  } else if (feed.result && feed.result.endReason === null && t >= feed.result.ticks) {
    clockEl.textContent = `${clockText(match.clockSec)} · STOPPED (${feed.end?.status === 'timed-out' ? 'wall cap' : 'unfinished'})`;
  } else {
    clockEl.textContent = clockText(match.clockSec);
  }
  const live = view.mode === 'live' && !feed.meta?.finished;
  const behind = Math.max(0, feed.lastRoundTick - t);
  let badge: string;
  if (live && !feed.end) badge = `LIVE · ${feed.meta?.cadenceSec ?? '?'} s cadence${behind > 0 ? ` · ${(behind * (feed.meta?.tickDt ?? 0.05)).toFixed(1)} s behind` : ''}`;
  else if (live && feed.end) badge = `ENDED · ${feed.end.status}${feed.end.verify ? ` · verified ${feed.end.verify.checkpointsCompared} checkpoints` : ''}`;
  else badge = `REPLAY ${speed}×${feed.end?.status && feed.end.status !== 'finished' ? ` · ${feed.end.status}` : ''}`;
  liveBadgeEl.textContent = badge;
  liveBadgeEl.className = `live-badge${live && !feed.end ? ' on' : ''}`;
  renderPromptView();
}

function onMatchTick(): void {
  if (!match || view) return;
  clockEl.textContent = clockText(match.clockSec);
  scoreVioletEl.textContent = `${sideLabel('violet')} ${match.towersDestroyedBy('green')}`;
  scoreGreenEl.textContent = `${match.towersDestroyedBy('violet')} ${sideLabel('green')}`;
  if (match.ended) {
    const who = match.winner ? sideLabel(match.winner) : 'NOBODY';
    clockEl.textContent = `${who} WINS (${match.endReason})`;
  }
  renderPromptView();
}

startBtn.addEventListener('click', startMatch);

function loadReplayText(text: string, source: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    promptViewEl.innerHTML = `<div class="hint">${escapeHtml(source)} is not JSON.</div>`;
    return;
  }
  if (!isMatchLog(parsed)) {
    promptViewEl.innerHTML = `<div class="hint">${escapeHtml(source)} is not a promptlane match log.</div>`;
    return;
  }
  startReplay(parsed, source);
}

replayFileEl.addEventListener('change', () => {
  const file = replayFileEl.files?.[0];
  if (!file) return;
  file.text().then((text) => loadReplayText(text, file.name));
});

const replayParam = params.get('replay');
const liveParam = params.get('live');
if (liveParam) {
  startLive(liveParam);
} else if (replayParam) {
  fetch(replayParam)
    .then((res) => (res.ok ? res.text() : Promise.reject(new Error(`${res.status} ${res.statusText}`))))
    .then((text) => loadReplayText(text, replayParam))
    .catch((err: Error) => {
      promptViewEl.innerHTML = `<div class="hint">Could not load ${escapeHtml(replayParam)}: ${escapeHtml(err.message)}</div>`;
    });
}

function loop(): void {
  if (match) render(ctx, match, selectedBotId, renderFx);
  if (view) refreshHud();
  requestAnimationFrame(loop);
}

renderRoster();
renderPromptView();
requestAnimationFrame(loop);
