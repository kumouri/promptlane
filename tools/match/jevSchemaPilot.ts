/**
 * A bearbot driven by an entrant's COMPILED prose -- the Jev rule cascade `tools/jev/compile.py`
 * produced -- for the Elysium compile panel's practice match (`docs/entrant-compile-preview.md`,
 * door B). Sibling to `jevPilot.ts` (the house bot's fixed cascade) and, like it, lives outside the
 * frozen `src/pilots/` and only imports the frozen types.
 *
 * The decision logic is not here: each ask POSTs `{schema, observation}` to
 * `tools/jev/schema_server.py`, which asks Jev every rule's condition in one call, takes the first
 * "yes" in cascade order, and resolves its target. This file only picks the schema for the
 * instrument this bearbot is holding (one entrant prompt drives all three) and turns the reply into
 * a `TracingDecision`. Any transport failure is `action: null` -- the same hold path `PromptPilot`
 * and `jevTracingPilot` take -- so a practice match never crashes on a dropped call.
 */
import type { Action, ActionKind, Instrument, Observation } from '../../src/types';
import type { TracingDecision, TracingPilot } from './jevPilot';

export interface JevSchemaPilotConfig {
  /** The schema-server endpoint, e.g. http://127.0.0.1:8797/ */
  endpoint: string;
  timeoutSec?: number;
  /** compile.py schema JSON per instrument. */
  schemas: Partial<Record<Instrument, unknown>>;
}

interface SchemaDecideResponse {
  action: Action;
  rule: string | null;
  answers: Record<string, number>;
  ms: number;
}

const KINDS: ReadonlySet<ActionKind> = new Set(['move', 'attack', 'ability', 'recall', 'hold']);

export function jevSchemaTracingPilot(config: JevSchemaPilotConfig): TracingPilot {
  const timeoutMs = (config.timeoutSec ?? 30) * 1000;
  return {
    async decide(obs: Observation): Promise<TracingDecision> {
      const schema = config.schemas[obs.self.instrument];
      if (!schema) return { action: null, reply: `[pilot error: no compiled schema for ${obs.self.instrument}]` };
      try {
        const res = await fetch(config.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ schema, observation: obs }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          throw new Error(`jev-schema endpoint responded ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
        }
        const data = (await res.json()) as SchemaDecideResponse;
        if (!data.action || !KINDS.has(data.action.kind)) throw new Error(`bad action from jev-schema: ${JSON.stringify(data.action)}`);
        return { action: data.action, reply: JSON.stringify({ rule: data.rule, action: data.action, answers: data.answers, ms: data.ms }) };
      } catch (err) {
        return { action: null, reply: `[pilot error: ${(err as Error).message}]` };
      }
    },
  };
}
