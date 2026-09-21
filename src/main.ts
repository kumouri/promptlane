import './style.css';
import type { Instrument, Lane, PilotKind, Team } from './types';
import { Match, RosterSlot } from './sim/match';
import { ScriptedPilot } from './pilots/scriptedPilot';
import { PromptPilot } from './pilots/promptPilot';
import { mockCallModel, httpCallModel } from './pilots/callModel';
import { render } from './render';

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

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div class="topbar">
    <div class="clock" id="clock">10:00</div>
    <div class="score">
      <span class="violet-team" id="score-violet">VIOLET 0</span>
      &nbsp;—&nbsp;
      <span class="green-team" id="score-green">0 GREEN</span>
    </div>
    <button id="start-btn">Start match</button>
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

let match: Match | null = null;
let selectedBotId: string | null = null;

function resizeCanvas(): void {
  const rect = canvas.parentElement!.getBoundingClientRect();
  const size = Math.min(rect.width, rect.height);
  canvas.width = size;
  canvas.height = size;
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

    const select = document.createElement('select');
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

function renderPromptView(): void {
  if (!match || !selectedBotId) {
    promptViewEl.innerHTML = '<div class="hint">Start a match, then pick a bearbot.</div>';
    return;
  }
  const kind = match.getPilotKind(selectedBotId);
  if (kind === 'scripted') {
    promptViewEl.innerHTML = '<div class="hint">Scripted pilot — no prompt, just heuristics.</div>';
    return;
  }
  const trace = match.promptTrace.get(selectedBotId);
  if (!trace) {
    promptViewEl.innerHTML = '<div class="hint">Waiting on its first decision…</div>';
    return;
  }
  promptViewEl.innerHTML = `
    <div class="block">
      <div class="label">Prompt (t=${trace.atSec.toFixed(1)}s)</div>
      ${escapeHtml(trace.prompt)}
    </div>
    <div class="block">
      <div class="label">Reply</div>
      ${escapeHtml(trace.reply)}
    </div>
  `;
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

function startMatch(): void {
  match?.stop();
  match = new Match(Date.now() & 0xffffffff, buildRoster());
  selectedBotId = match.bearbots[0]?.id ?? null;
  match.onUpdate(onMatchTick);
  match.start();
  startBtn.textContent = 'Restart';
  renderRoster();
  renderPromptView();
}

function onMatchTick(): void {
  if (!match) return;
  const mins = Math.max(0, Math.floor((600 - match.clockSec) / 60));
  const secs = Math.max(0, Math.floor((600 - match.clockSec) % 60));
  clockEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
  scoreVioletEl.textContent = `VIOLET ${match.towersDestroyedBy('green')}`;
  scoreGreenEl.textContent = `${match.towersDestroyedBy('violet')} GREEN`;

  if (match.ended) {
    const who = match.winner ? match.winner.toUpperCase() : 'NOBODY';
    clockEl.textContent = `${who} WINS (${match.endReason})`;
  }

  renderPromptView();
}

startBtn.addEventListener('click', startMatch);

function loop(): void {
  if (match) render(ctx, match, selectedBotId);
  requestAnimationFrame(loop);
}

renderRoster();
renderPromptView();
requestAnimationFrame(loop);
