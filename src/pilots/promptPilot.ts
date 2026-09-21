import type { Action, ActionKind, Observation, Pilot } from '../types';
import type { CallModel } from './callModel';

export interface PromptTraceSink {
  (prompt: string, reply: string, action: Action | null): void;
}

const VALID_KINDS: ActionKind[] = ['move', 'attack', 'ability', 'recall', 'hold'];

/** Builds one text prompt per decision from a pilot's voice file + the current Observation. */
export class PromptPilot implements Pilot {
  constructor(
    private readonly promptFile: string,
    private readonly callModel: CallModel,
    private readonly onTrace?: PromptTraceSink,
  ) {}

  async decide(obs: Observation): Promise<Action> {
    const prompt = this.buildPrompt(obs);
    let reply = '';
    let action: Action | null = null;
    try {
      reply = await this.callModel(prompt);
      action = parseAction(reply);
    } catch (err) {
      reply = `[pilot error: ${(err as Error).message}]`;
      action = null;
    }
    this.onTrace?.(prompt, reply, action);
    return action ?? { kind: 'hold' };
  }

  private buildPrompt(obs: Observation): string {
    return [
      this.promptFile.trim(),
      '',
      'Reply with ONLY one JSON object, no prose: {"kind": "move"|"attack"|"ability"|"recall"|"hold", "target"?: string | {"x":number,"y":number}, "ability"?: string}',
      '',
      'OBSERVATION:',
      JSON.stringify(obs),
    ].join('\n');
  }
}

function parseAction(reply: string): Action | null {
  const match = reply.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (!VALID_KINDS.includes(parsed.kind)) return null;
    return parsed as Action;
  } catch {
    return null;
  }
}
