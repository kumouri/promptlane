/**
 * A bearbot driven by an entrant's COMPILED prose -- the Jev rule cascade `tools/jev/compile.py`
 * produced -- for the Elysium compile panel's practice match (`docs/entrant-compile-preview.md`,
 * door B). Sibling to `jevPilot.ts` (the house bot's fixed cascade) and, like it, lives outside the
 * frozen `src/pilots/` and only imports the frozen types.
 *
 * The decision logic is not here: each ask POSTs `{schema, observation}` to
 * `tools/jev/schema_server.py`, which asks Jev every node's condition (guards and their branches
 * included) in one call, walks the tree taking the first "yes" in cascade order, and resolves its
 * target. This file only picks the schema for the
 * instrument this bearbot is holding (one entrant prompt drives all three) and turns the reply into
 * a `TracingDecision`. Any transport failure is `action: null` -- the same hold path `PromptPilot`
 * and `jevTracingPilot` take -- so a practice match never crashes on a dropped call.
 *
 * Each ask also names the targeting rule the server resolves the winning rule's target under
 * (`tools/jev/target_resolve.py` TARGETING_RULES), and a reply resolved under any other rule is a
 * failed call. A server from before the rule existed resolves everything under `first-min` and
 * says nothing, so it can't silently play a match meant for `own-lane-1`.
 *
 * A schema plays under the vocabulary it was compiled under (`tools/jev/vocab.py`): its own `vocab`
 * key, or vocab-1 when it has none. Each ask names it and the match's map (vocab-2's tower facts read
 * tower range from it), and a reply that doesn't echo the schema's vocabulary is a failed call. A
 * server from before vocabularies existed echoes nothing, which reads as vocab-1, so a vocab-1 schema
 * plays on it exactly as before and a vocab-2 schema holds instead of playing under the wrong words.
 *
 * Under vocab-2, an ability aimed outside its own range walks toward its target
 * (`approachOutOfRange`); under vocab-1 the server's action is played as it comes.
 */
import type { Action, ActionKind, Instrument, Observation, Vec2 } from '../../src/types';
import { INSTRUMENTS } from '../../src/sim/entities';
import { dist } from '../../src/sim/map';
import { DEFAULT_MAP, resolveMap, type MapVariant } from '../../src/mapVariant';
import { transportErrorMessage, type TracingDecision, type TracingPilot } from './jevPilot';

/** The plain min() over float distances every schema match played before 2026-10-01. */
export const FIRST_MIN = 'first-min';
/** A bot at its fountain rides its own lane; ties within 0.5 units break side-symmetrically. */
export const OWN_LANE_1 = 'own-lane-1';
export const TARGETINGS: readonly string[] = [FIRST_MIN, OWN_LANE_1];
/** What a new schema match plays. A log, request or campaign shape that names none means `first-min`. */
export const DEFAULT_TARGETING = OWN_LANE_1;

export function resolveTargeting(name: string | undefined | null): string {
  if (name === undefined || name === null) return FIRST_MIN;
  if (!TARGETINGS.includes(name)) throw new Error(`unknown targeting "${name}" (known: ${TARGETINGS.join(', ')})`);
  return name;
}

/** Why a schema server's /health says it can't resolve `targeting`, or null when it can. */
export function targetingUnsupported(health: { targeting?: unknown } | null | undefined, targeting: string): string | null {
  const known = Array.isArray(health?.targeting) ? (health.targeting as string[]) : [FIRST_MIN];
  return known.includes(targeting)
    ? null
    : `the schema server resolves targets under ${known.join(', ')} only, not ${targeting}; restart tools/jev/schema_server.py from this checkout`;
}

/** The vocabulary every schema compiled before 2026-10-02 is in; a schema with no `vocab` key. */
export const VOCAB_1 = 'vocab-1';
/** Stage A of docs/vocabulary-spec.md: tower facts, distances, the fight line, six more targets. */
export const VOCAB_2 = 'vocab-2';
export const VOCABS: readonly string[] = [VOCAB_1, VOCAB_2];
/** What an entrant compile writes (tools/jev/vocab.py DEFAULT_VOCAB; a test holds them equal). */
export const DEFAULT_VOCAB = VOCAB_2;

/** The vocabulary a compile.py schema plays under: its own `vocab` key, else vocab-1. */
export function schemaVocab(schema: unknown): string {
  const v = (schema as { vocab?: unknown } | null | undefined)?.vocab;
  return typeof v === 'string' ? v : VOCAB_1;
}

/** Every vocabulary a side's schemas need, sorted. */
export function vocabsOf(schemas: Partial<Record<Instrument, unknown>> | undefined | null): string[] {
  return [...new Set(Object.values(schemas ?? {}).map(schemaVocab))].sort();
}

/** Why a schema server's /health says it can't play `vocabs`, or null when it can. */
export function vocabUnsupported(health: { vocabs?: unknown } | null | undefined, vocabs: readonly string[]): string | null {
  const known = Array.isArray(health?.vocabs) ? (health.vocabs as string[]) : [VOCAB_1];
  const missing = vocabs.filter((v) => !known.includes(v));
  return missing.length
    ? `the schema server plays ${known.join(', ')} only, not ${missing.join(', ')}; restart tools/jev/schema_server.py from this checkout`
    : null;
}

/**
 * Why a schema server's /health says it can't describe the tower aggro rule `name`
 * (`src/towerAggro.ts`), or null when it can or the match has none. A server from before the rule
 * would leave Jev's description saying an enemy tower shoots minions first while it shoots this bot.
 */
export function towerAggroUnsupported(health: { tower_aggro?: unknown } | null | undefined, name: string | null): string | null {
  if (!name) return null;
  const known = Array.isArray(health?.tower_aggro) ? (health.tower_aggro as string[]) : [];
  return known.includes(name)
    ? null
    : `the schema server doesn't describe tower aggro ${name} (it knows: ${known.join(', ') || 'none'}); restart tools/jev/schema_server.py from this checkout`;
}

export interface JevSchemaPilotConfig {
  /** The schema-server endpoint, e.g. http://127.0.0.1:8797/ */
  endpoint: string;
  timeoutSec?: number;
  /** compile.py schema JSON per instrument. */
  schemas: Partial<Record<Instrument, unknown>>;
  /** The targeting rule (`TARGETINGS`). Default: `DEFAULT_TARGETING`. */
  targeting?: string;
  /** The match's map variant, sent with every ask (vocab-2 reads tower range from it). Default: `DEFAULT_MAP`, as `runMatch`. */
  map?: string | MapVariant;
}

interface SchemaDecideResponse {
  action: Action;
  rule: string | null;
  answers: Record<string, number>;
  ms: number;
  /** Which Jev door answered this call ("typesafe" / "workers-ai" / "stub"); absent from older servers. */
  door?: string;
  tokens_in?: number;
  cost_usd?: number;
  /** The targeting rule the target resolved under; absent from servers older than the field (= first-min). */
  targeting?: string;
  /** The vocabulary the schema played under; absent from servers older than the field (= vocab-1). */
  vocab?: string;
}

const KINDS: ReadonlySet<ActionKind> = new Set(['move', 'attack', 'ability', 'recall', 'hold']);

/** Where `obs` lists unit `id`, or null when it lists no such unit. */
function listedPos(obs: Observation, id: string): Vec2 | null {
  const unit = [...obs.visibleEnemies, ...obs.nearbyTowers, ...obs.nearbyMinions, ...obs.allies].find((u) => u.id === id);
  return unit ? unit.pos : null;
}

/**
 * vocab-2's ability reach (docs/vocabulary-spec.md §8.3). The sim's `ability` never moves the bot:
 * aimed at a target beyond the ability's range it does nothing, and the bot stands where it is until
 * its next decision (src/sim/match.ts tryUseAbility). Its `attack` walks to a target out of reach
 * (approachAndAttack), which is what vocab-2's `nearest_tower` relies on (§8.2). So an ability
 * whose target `obs` places beyond that ability's range becomes a move to where the target stood;
 * the next decision casts it once the bot is in range. The range is the sim's own
 * (`INSTRUMENTS[...].abilities[...].range`). An ability with range 0 (fill, glissando, solo) never
 * checks one, and a target `obs` doesn't list, or no target, is left to the sim as before.
 */
export function approachOutOfRange(action: Action, obs: Observation): Action {
  if (action.kind !== 'ability' || action.target === undefined) return action;
  const ability = INSTRUMENTS[obs.self.instrument].abilities.find((a) => a.name === action.ability);
  if (!ability || ability.range <= 0) return action;
  const pos = typeof action.target === 'string' ? listedPos(obs, action.target) : action.target;
  if (!pos || dist(obs.self.pos, pos) <= ability.range) return action;
  return { kind: 'move', target: { x: pos.x, y: pos.y } };
}

export function jevSchemaTracingPilot(config: JevSchemaPilotConfig): TracingPilot {
  const timeoutMs = (config.timeoutSec ?? 30) * 1000;
  const targeting = config.targeting === undefined ? DEFAULT_TARGETING : resolveTargeting(config.targeting);
  const { name, towerRange, towerFractions, laneTowerFractions, scale } = config.map === undefined ? DEFAULT_MAP : resolveMap(config.map);
  // The geometry the Python side mirrors (tools/jev/vocab.py map_spec); a scaled map (pvp-2) adds its scale
  // and per-lane towers, and a pvp-1 ask is byte for byte what it was.
  const map = { name, towerRange, towerFractions, ...(laneTowerFractions ? { laneTowerFractions } : {}), ...(scale !== undefined ? { scale } : {}) };
  return {
    async decide(obs: Observation): Promise<TracingDecision> {
      const schema = config.schemas[obs.self.instrument];
      if (!schema) return { action: null, reply: `[pilot error: no compiled schema for ${obs.self.instrument}]` };
      const vocab = schemaVocab(schema);
      // the observation as asked: the sim's positions are live and move on while the call is out
      const asked = structuredClone(obs);
      try {
        const res = await fetch(config.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ schema, observation: asked, targeting, vocab, map }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          throw new Error(`jev-schema endpoint responded ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
        }
        const data = (await res.json()) as SchemaDecideResponse;
        if (!data.action || !KINDS.has(data.action.kind)) throw new Error(`bad action from jev-schema: ${JSON.stringify(data.action)}`);
        const resolvedUnder = data.targeting ?? FIRST_MIN;
        if (resolvedUnder !== targeting) throw new Error(`jev-schema resolved the target under ${resolvedUnder}, not ${targeting}; restart tools/jev/schema_server.py from this checkout`);
        const playedUnder = data.vocab ?? VOCAB_1;
        if (playedUnder !== vocab) throw new Error(`jev-schema played the schema under ${playedUnder}, not its own ${vocab}; restart tools/jev/schema_server.py from this checkout`);
        const door = data.door ?? 'unknown';
        // the reply keeps the server's action; a vocab-2 ability out of range plays as a move
        return {
          action: vocab === VOCAB_1 ? data.action : approachOutOfRange(data.action, asked),
          reply: JSON.stringify({ rule: data.rule, action: data.action, answers: data.answers, ms: data.ms, ...(data.door ? { door } : {}) }),
          usage: { door, tokensIn: data.tokens_in ?? 0, costUsd: data.cost_usd ?? 0 },
        };
      } catch (err) {
        return { action: null, reply: `[pilot error: ${transportErrorMessage(err)}]` };
      }
    },
  };
}
