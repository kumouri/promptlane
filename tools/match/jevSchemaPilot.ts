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
 */
import type { Action, ActionKind, Instrument, Observation } from '../../src/types';
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

export interface JevSchemaPilotConfig {
  /** The schema-server endpoint, e.g. http://127.0.0.1:8797/ */
  endpoint: string;
  timeoutSec?: number;
  /** compile.py schema JSON per instrument. */
  schemas: Partial<Record<Instrument, unknown>>;
  /** The targeting rule (`TARGETINGS`). Default: `DEFAULT_TARGETING`. */
  targeting?: string;
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
}

const KINDS: ReadonlySet<ActionKind> = new Set(['move', 'attack', 'ability', 'recall', 'hold']);

export function jevSchemaTracingPilot(config: JevSchemaPilotConfig): TracingPilot {
  const timeoutMs = (config.timeoutSec ?? 30) * 1000;
  const targeting = config.targeting === undefined ? DEFAULT_TARGETING : resolveTargeting(config.targeting);
  return {
    async decide(obs: Observation): Promise<TracingDecision> {
      const schema = config.schemas[obs.self.instrument];
      if (!schema) return { action: null, reply: `[pilot error: no compiled schema for ${obs.self.instrument}]` };
      try {
        const res = await fetch(config.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ schema, observation: obs, targeting }),
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
        const door = data.door ?? 'unknown';
        return {
          action: data.action,
          reply: JSON.stringify({ rule: data.rule, action: data.action, answers: data.answers, ms: data.ms, ...(data.door ? { door } : {}) }),
          usage: { door, tokensIn: data.tokens_in ?? 0, costUsd: data.cost_usd ?? 0 },
        };
      } catch (err) {
        return { action: null, reply: `[pilot error: ${transportErrorMessage(err)}]` };
      }
    },
  };
}
