/**
 * The Jev TEAM bot for the Jev-vs-qwen32b model test (`docs/jev-vs-qwen32b-intent.md`,
 * `runs/jev-vs-qwen32b-*.md`). Sibling to `jevPilot.ts` (the house bot, unchanged, still SHADOW
 * ONLY) -- same shape, but talks to `tools/jev/team_server.py` (the NEW cascade) instead of
 * `house_server.py`, and its `extractWorksheet` carries the extra fields that cascade's
 * percentage thresholds and violin's finisher condition need: `maxHp`, and the foe's own
 * kind/hp/maxHp (house-violet.md's cascade only ever needed foe *presence*).
 *
 * Lives outside `src/pilots/` for the same reason `jevPilot.ts` does: that directory is the frozen
 * v1 specimen. This file only imports the frozen `Pilot`/`Action`/`Observation`/`Instrument`/`Team`
 * types, reading, never editing.
 */
import type { Action, Instrument, Observation, Team, Vec2 } from '../../src/types';
import { BASE } from '../../src/sim/map';
import type { TracingDecision, TracingPilot } from './jevPilot';

export type ActionBucket = 'recall' | 'go_home' | 'ability' | 'attack_foe' | 'attack_tower' | 'ride_wave';

const ABILITY_NAME: Record<Instrument, string> = { keytar: 'chord', violin: 'staccato', drums: 'kick' };

export interface TeamWorksheet {
  hp: number;
  maxHp: number;
  wave: number;
  tower: string | null;
  foe: string | null;
  foeIsBearbot: boolean;
  foeHp: number | null;
  foeMaxHp: number | null;
  cd: number;
  instrument: Instrument;
  team: Team;
  tick: number;
  clockSec: number;
}

export interface JevTeamDecideResponse {
  bucket: ActionBucket;
  rule: number;
  answers: Record<string, number>;
  ms: number;
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Same target-selection heuristic as `jevPilot.ts::extractWorksheet` (lowest-hp visible enemy
 * bearbot, else nearest enemy minion) -- `docs/jev-vs-qwen32b-intent.md`'s "can't be matched"
 * table flags this as code-side, not something either model is asked to choose. Extended with the
 * chosen foe's own kind/hp/maxHp, which the new cascade's violin finisher condition needs. */
export function extractWorksheet(obs: Observation, tick: number): TeamWorksheet {
  const wave = obs.nearbyMinions.filter((m) => m.team === obs.self.team).length;
  const towerEntry = obs.visibleEnemies.find((e) => e.kind === 'tower' || e.kind === 'nexus');
  const bearbots = obs.visibleEnemies.filter((e) => e.kind === 'bearbot');
  let foe: (typeof obs.visibleEnemies)[number] | null = null;
  if (bearbots.length > 0) {
    foe = [...bearbots].sort((a, b) => a.hp - b.hp)[0];
  } else {
    const minions = obs.visibleEnemies.filter((e) => e.kind === 'minion');
    if (minions.length > 0) {
      foe = [...minions].sort((a, b) => distance(obs.self.pos, a.pos) - distance(obs.self.pos, b.pos))[0];
    }
  }
  const abilityKey = ABILITY_NAME[obs.self.instrument];
  return {
    hp: obs.self.hp,
    maxHp: obs.self.maxHp,
    wave,
    tower: towerEntry?.id ?? null,
    foe: foe?.id ?? null,
    foeIsBearbot: foe?.kind === 'bearbot',
    foeHp: foe?.hp ?? null,
    foeMaxHp: foe?.maxHp ?? null,
    cd: obs.self.cooldowns[abilityKey] ?? 0,
    instrument: obs.self.instrument,
    team: obs.self.team,
    tick,
    clockSec: obs.clockSec,
  };
}

export function bucketToAction(bucket: ActionBucket, ws: TeamWorksheet, obs: Observation): Action {
  switch (bucket) {
    case 'recall':
      return { kind: 'recall' };
    case 'go_home':
      return { kind: 'move', target: BASE[ws.team] };
    case 'ability':
      return ws.foe
        ? { kind: 'ability', ability: ABILITY_NAME[ws.instrument], target: ws.foe }
        : { kind: 'hold' };
    case 'attack_foe':
      return ws.foe ? { kind: 'attack', target: ws.foe } : { kind: 'hold' };
    case 'attack_tower':
      return ws.tower ? { kind: 'attack', target: ws.tower } : { kind: 'hold' };
    case 'ride_wave': {
      const allies = obs.nearbyMinions.filter((m) => m.team === ws.team);
      const nearest = allies.length
        ? [...allies].sort((a, b) => distance(obs.self.pos, a.pos) - distance(obs.self.pos, b.pos))[0]
        : null;
      return { kind: 'move', target: nearest ? nearest.pos : BASE[ws.team] };
    }
  }
}

export interface JevTeamPilotConfig {
  /** The jev-team-server endpoint, e.g. http://127.0.0.1:8799/ */
  endpoint: string;
  timeoutSec?: number;
}

/** POSTs the worksheet, turns the response into an Action, and reports `action: null` (hold path)
 * on any transport failure -- never throws. Same `TracingPilot` contract `jevPilot.ts` speaks, so
 * `tools/match/headless.ts`'s `decisionPilotFor` takes either interchangeably. */
export function jevTeamTracingPilot(config: JevTeamPilotConfig, currentTick: () => number): TracingPilot {
  const timeoutMs = (config.timeoutSec ?? 30) * 1000;
  return {
    async decide(obs: Observation): Promise<TracingDecision> {
      const ws = extractWorksheet(obs, currentTick());
      try {
        const res = await fetch(config.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ws),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          throw new Error(`jev-team endpoint responded ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
        }
        const data = (await res.json()) as JevTeamDecideResponse;
        const action = bucketToAction(data.bucket, ws, obs);
        return {
          action,
          reply: JSON.stringify({
            hp: ws.hp,
            maxHp: ws.maxHp,
            wave: ws.wave,
            tower: ws.tower,
            foe: ws.foe,
            cd: ws.cd,
            instrument: ws.instrument,
            bucket: data.bucket,
            rule: data.rule,
            answers: data.answers,
            ms: data.ms,
          }),
        };
      } catch (err) {
        return { action: null, reply: `[pilot error: ${(err as Error).message}]` };
      }
    },
  };
}
