import { Rng } from '../rng';

/** Sends a prompt to a model and gets text back. Pluggable so any endpoint can sit behind it. */
export type CallModel = (prompt: string) => Promise<string>;

/**
 * Deterministic, key-free stand-in for a model. Picks an action heuristically from the prompt's
 * own observation JSON so the game runs with nothing to configure.
 */
export function mockCallModel(seed = 1): CallModel {
  const rng = new Rng(seed);
  return async (prompt: string) => {
    const obsMatch = prompt.match(/OBSERVATION:\s*(\{[\s\S]*\})\s*$/);
    let obs: any = null;
    try {
      obs = obsMatch ? JSON.parse(obsMatch[1]) : null;
    } catch {
      obs = null;
    }

    if (!obs) {
      return JSON.stringify({ kind: 'hold' });
    }

    if (obs.self.hp / obs.self.maxHp < 0.25) {
      return JSON.stringify({ kind: 'recall' }, null, 0);
    }

    const enemies = obs.visibleEnemies as Array<{ id: string; kind: string }>;
    if (enemies.length > 0) {
      const target = rng.pick(enemies);
      const ability = rng.next() > 0.5 ? Object.keys(obs.self.cooldowns).find((k) => obs.self.cooldowns[k] === 0) : undefined;
      if (ability) {
        return JSON.stringify({ kind: 'ability', ability, target: target.id });
      }
      return JSON.stringify({ kind: 'attack', target: target.id });
    }

    const minions = obs.nearbyMinions as Array<{ id: string; team: string }>;
    const enemyMinion = minions.find((m) => m.team !== obs.self.team);
    if (enemyMinion) {
      return JSON.stringify({ kind: 'attack', target: enemyMinion.id });
    }

    // Nothing in sight — push down the lane toward the enemy base, same as the scripted baseline.
    const enemyBase = obs.self.team === 'violet' ? { x: 900, y: 100 } : { x: 100, y: 900 };
    return JSON.stringify({ kind: 'move', target: enemyBase });
  };
}

/**
 * POSTs the prompt to an HTTP endpoint and returns its text reply. The URL is read from an env
 * var at build time (Vite inlines `import.meta.env.*`) — no key is ever typed into a prompt or
 * this codebase; put it in a local `.env` the model server reads itself.
 */
export function httpCallModel(): CallModel {
  const url = import.meta.env.VITE_PILOT_ENDPOINT as string | undefined;
  return async (prompt: string) => {
    if (!url) {
      throw new Error('VITE_PILOT_ENDPOINT is not set — add it to a local .env to use the HTTP adapter.');
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
    if (!res.ok) {
      throw new Error(`pilot endpoint responded ${res.status}`);
    }
    const data = await res.json();
    return typeof data === 'string' ? data : data.reply ?? JSON.stringify(data);
  };
}
