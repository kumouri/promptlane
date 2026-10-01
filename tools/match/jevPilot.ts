/**
 * The Jev house bot (SHADOW ONLY -- docs/jev-decision-model-research.md §4/§6 option 3;
 * runs/jev-house-bot-2026-09-23.md). Lives outside `src/pilots/` on purpose: that directory is
 * the frozen v1 specimen (`docs/arena-site-spec.md`: "src/sim/, src/rng.ts, src/pilots/, src/
 * types.ts are the frozen v1 specimen"), and `PromptPilot`/`callModel.ts` are the exact files the
 * jam's entrant contract is defined against (`tools/arena/test_contract.mjs`). This file only
 * imports the frozen `Pilot`/`Action`/`Observation`/`Instrument`/`Team` *types* -- reading, never
 * editing -- the same posture `tools/match/headless.ts` already takes with `src/sim/match`.
 *
 * Jev has no `prompt` field (memo §4): it takes `{state, questions}` and returns one typed answer
 * per question, so "the pilot's decision logic" moves into code here, not into a model reply. This
 * file is that code -- reused, not reinvented, from `tools/jev/{client,rules,serializer}.py` via
 * `tools/jev/house_server.py`'s HTTP contract (worksheet in, `{bucket, rule, answers, ms}` out).
 * Two things live only on the TypeScript side, because only it has the live `Observation`:
 *
 *   1. `extractWorksheet` -- turns an `Observation` into house-violet.md's worksheet fields
 *      (hp, wave, tower, foe, cd, and stand), replicating exactly what the prompt asks the ruled
 *      model to self-report (see prompts/pilots/house-violet.md's "Your reply ... ALWAYS starts
 *      with six worksheet keys"). `tools/jev/rules.py` never had to do this -- the offline harness
 *      replayed logs that already carried these fields, pre-extracted by the ruled model itself.
 *   2. `bucketToAction` -- turns the server's action bucket back into a real `Action` with a real
 *      target (an entity id, or a position for `move`), since the offline harness only ever
 *      compared bucket labels, never assembled a playable action.
 *
 * The Bandstand (docs/economy-spec.md §9.7): only a match played with the objective has a
 * `bandstand` block (`ObjectiveObservation`, `src/objective.ts`). For such an observation the
 * worksheet also carries `stand` and `maxHp`, and the server asks house-violet.md's rule 2 (stand
 * open, no enemy bearbot in sight, hp above 50 % of maxHp -> move to `bandstand.pos`; rule 8 in
 * `rules.py`'s numbering). Without the block neither key is sent, so the POST body, the reply and
 * every decision are exactly what they were before the Bandstand.
 *
 * No hold path (changed 2026-09-25, runs/jev-jam-readiness-2026-09-25.md): the house bot must never
 * silently stop playing. If Jev fails, `house_server.py` already answers with a rules-in-code
 * decision (`fallback: 'rules-in-code'`); if the server itself is unreachable (endpoint down,
 * timeout, non-2xx), this file's `catch` decides with `decideByRules` -- the same rules in
 * TypeScript -- and logs `!!! FALLBACK` to stderr. That reply starts `[jev-fallback:` so
 * `tools/match/headless.ts` still counts it as a call error.
 */
import type { Action, Instrument, Observation, Team, Vec2 } from '../../src/types';
import type { BandstandStatus, ObjectiveObservation } from '../../src/objective';
import { BASE } from '../../src/sim/map';

export type ActionBucket = 'recall' | 'go_home' | 'ability' | 'attack_foe' | 'attack_tower' | 'ride_wave' | 'bandstand';

/** The Bandstand rule's number: after rule 7 (the fallback), so 1-7 keep their pre-Bandstand
 * meaning in every trace -- `tools/jev/rules.py::BANDSTAND_RULE`. It is evaluated second. */
export const BANDSTAND_RULE = 8;

const ABILITY_NAME: Record<Instrument, string> = { keytar: 'chord', violin: 'staccato', drums: 'kick' };

export interface Worksheet {
  hp: number;
  wave: number;
  tower: string | null;
  foe: string | null;
  /** The foe's real kind and hp -- house-violet.md's rule 3 needs "foe is a bearbot with hp less
   * than 100" for violin/drums. The offline harness never had these (its logs didn't); a live match
   * does, so `house_server.py` asks the exact rule 3 whenever they're sent (`rules.py` LIVE PATH). */
  foeKind: 'bearbot' | 'minion' | null;
  foeHp: number | null;
  cd: number;
  instrument: Instrument;
  team: Team;
  tick: number;
  clockSec: number;
  /** `bandstand.status` and `self.maxHp` (the Bandstand rule's 50 % line) -- present only when the
   * match has the objective; absent, not null, otherwise, so the POST body is unchanged. */
  stand?: BandstandStatus;
  maxHp?: number;
}

export interface JevDecideResponse {
  bucket: ActionBucket;
  rule: number;
  answers: Record<string, number>;
  ms: number;
  /** Set when house_server.py couldn't reach Jev and decided by the rules in code instead. */
  fallback?: 'rules-in-code';
  error?: string;
}

/** house-violet.md's rules evaluated in code on the exact worksheet -- the TypeScript twin of
 * `tools/jev/rules.py::ground_truth_answers` + `first_match`, used only when the jev-house server
 * itself can't be reached (`house_server.py` has its own fallback for when Jev can't be). The
 * Bandstand rule is second, as in the file, and can only match when the worksheet has `stand`. Rule 1
 * is the file's single low-hp recall from before its 2026-10-01 split for `recall-2`, as in `rules.py`. */
export function decideByRules(ws: Worksheet): { bucket: ActionBucket; rule: number } {
  const rule3 =
    ws.cd === 0 &&
    ws.foe !== null &&
    (ws.instrument === 'keytar' || (ws.foeKind === 'bearbot' && ws.foeHp !== null && ws.foeHp < 100));
  const bandstand = ws.stand === 'open' && ws.maxHp !== undefined && ws.foeKind !== 'bearbot' && ws.hp > 0.5 * ws.maxHp;
  const rules: Array<[boolean, ActionBucket, number]> = [
    [ws.hp < 75, 'recall', 1],
    [bandstand, 'bandstand', BANDSTAND_RULE],
    [ws.tower !== null && ws.wave === 0, 'go_home', 2],
    [rule3, 'ability', 3],
    [ws.foe !== null, 'attack_foe', 4],
    [ws.tower !== null, 'attack_tower', 5],
    [ws.foe === null && ws.tower === null && ws.wave >= 1, 'ride_wave', 6],
  ];
  const hit = rules.find(([matches]) => matches);
  return hit ? { bucket: hit[1], rule: hit[2] } : { bucket: 'go_home', rule: 7 };
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** A match's `bandstand` block, or null for a match played without the objective (read defensively:
 * a plain `Observation` has no such key). */
function bandstandOf(obs: Observation): ObjectiveObservation['bandstand'] | null {
  return (obs as Partial<ObjectiveObservation>).bandstand ?? null;
}

/** house-violet.md's/house-green.md's own worksheet-extraction rules, read straight off `Observation`.
 * `stand`/`maxHp` are added only when the observation has a `bandstand` block. */
export function extractWorksheet(obs: Observation, tick: number): Worksheet {
  const wave = obs.nearbyMinions.filter((m) => m.team === obs.self.team).length;
  const towerEntry = obs.visibleEnemies.find((e) => e.kind === 'tower' || e.kind === 'nexus');
  const bearbots = obs.visibleEnemies.filter((e) => e.kind === 'bearbot');
  let foe: Observation['visibleEnemies'][number] | null = null;
  if (bearbots.length > 0) {
    foe = [...bearbots].sort((a, b) => a.hp - b.hp)[0];
  } else {
    const minions = obs.visibleEnemies.filter((e) => e.kind === 'minion');
    if (minions.length > 0) {
      foe = [...minions].sort((a, b) => distance(obs.self.pos, a.pos) - distance(obs.self.pos, b.pos))[0];
    }
  }
  const abilityKey = ABILITY_NAME[obs.self.instrument];
  const stand = bandstandOf(obs);
  return {
    hp: obs.self.hp,
    wave,
    tower: towerEntry?.id ?? null,
    foe: foe?.id ?? null,
    foeKind: foe ? (foe.kind as 'bearbot' | 'minion') : null,
    foeHp: foe?.hp ?? null,
    cd: obs.self.cooldowns[abilityKey] ?? 0,
    instrument: obs.self.instrument,
    team: obs.self.team,
    tick,
    clockSec: obs.clockSec,
    ...(stand ? { stand: stand.status, maxHp: obs.self.maxHp } : {}),
  };
}

/** The worksheet keys a trace reply carries beyond the original ones -- none without the objective. */
function standFields(ws: Worksheet): { stand?: BandstandStatus; maxHp?: number } {
  return ws.stand !== undefined ? { stand: ws.stand, maxHp: ws.maxHp } : {};
}

/** The bucket + the worksheet/observation that produced it, turned into a playable `Action`. */
export function bucketToAction(bucket: ActionBucket, ws: Worksheet, obs: Observation): Action {
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
    case 'bandstand': {
      // Only a worksheet with `stand` can reach this bucket; without a bandstand, rule 7's move home.
      const stand = bandstandOf(obs);
      return { kind: 'move', target: stand ? { x: stand.pos.x, y: stand.pos.y } : BASE[ws.team] };
    }
  }
}

export interface JevPilotConfig {
  /** The jev-house-server endpoint, e.g. http://127.0.0.1:8798/ */
  endpoint: string;
  timeoutSec?: number;
}

/**
 * Same `{reply, action}` shape `PromptPilot`'s `onTrace` reports (`src/pilots/promptPilot.ts`):
 * `action: null` means this attempt failed and the caller should fall back to hold, exactly as
 * `PromptPilot.decide` does internally (`action ?? { kind: 'hold' }`) -- `tools/match/headless.ts`
 * applies the identical fallback here so a Jev bearbot and a prompt bearbot share one `TracingPilot`
 * contract. The Jev pilot never returns `action: null` -- see the module docstring's fallback note.
 */
export interface TracingDecision {
  reply: string;
  action: Action | null;
  /** What this one decision cost and which Jev door answered it, when the backend says
   * (`jevSchemaPilot.ts`, which also puts the door in `reply`). The arena sums it per match
   * (`tools/arena/queue.mjs`); the runner itself ignores it. */
  usage?: { door: string; tokensIn: number; costUsd: number };
}

export interface TracingPilot {
  decide(obs: Observation): Promise<TracingDecision>;
}

/** A transport failure's message with its cause. Node's fetch reports every socket-level failure as
 * the bare `fetch failed` and puts the reason (`ECONNREFUSED`, `ECONNRESET`, ...) on `err.cause`.
 * Without the cause, a refused connect can't be told apart from a reset one in a match trace.
 * The listen-backlog bug (`tools/jev/local_http.py`) was this: 12 bots on one server got
 * `fetch failed <- ECONNREFUSED`. */
export function transportErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const cause = err instanceof Error ? (err.cause as { code?: string; message?: string } | undefined) : undefined;
  if (!cause) return message;
  return `${message} <- ${cause.code ?? cause.message ?? String(cause)}`;
}

/** POSTs the worksheet and turns the response into an Action; on any transport failure decides by
 * `decideByRules` instead -- never throws, never holds. `tick` comes from the caller (headless.ts tracks the
 * sim's own tick counter; the offline harness's `Worksheet.tick` has no live equivalent here). */
export function jevTracingPilot(config: JevPilotConfig, currentTick: () => number): TracingPilot {
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
          throw new Error(`jev-house endpoint responded ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
        }
        const data = (await res.json()) as JevDecideResponse;
        const action = bucketToAction(data.bucket, ws, obs);
        // Worksheet fields first, exactly like house-violet.md's own self-report convention --
        // except these are the real Observation values (Jev never self-reports), which is what
        // lets analysis (e.g. the low-hp-recall compliance check) use ground truth, not a report
        // that might itself be wrong.
        return {
          action,
          reply: JSON.stringify({ hp: ws.hp, wave: ws.wave, tower: ws.tower, foe: ws.foe, foeKind: ws.foeKind, foeHp: ws.foeHp, cd: ws.cd, ...standFields(ws), instrument: ws.instrument, bucket: data.bucket, rule: data.rule, answers: data.answers, ms: data.ms, ...(data.fallback ? { fallback: data.fallback } : {}) }),
        };
      } catch (err) {
        // The server itself is down or timed out: never stop playing -- decide by the rules in code,
        // loudly. The `[jev-fallback` prefix makes headless.ts count it as a call error.
        const message = transportErrorMessage(err);
        const { bucket, rule } = decideByRules(ws);
        console.error(`[jev-house] !!! FALLBACK (server unreachable: ${message}) -> rules-in-code rule=${rule} bucket=${bucket}`);
        return {
          action: bucketToAction(bucket, ws, obs),
          reply: `[jev-fallback: ${message}] ` + JSON.stringify({ hp: ws.hp, wave: ws.wave, tower: ws.tower, foe: ws.foe, foeKind: ws.foeKind, foeHp: ws.foeHp, cd: ws.cd, ...standFields(ws), instrument: ws.instrument, bucket, rule, fallback: 'rules-in-code' }),
        };
      }
    },
  };
}
