import type { Action, Observation, Pilot } from '../types';
import { BASE } from '../sim/map';
import { otherTeam } from '../sim/map';

/** The always-works baseline: push lane, attack nearest, use an ability off cooldown, recall low. */
export class ScriptedPilot implements Pilot {
  async decide(obs: Observation): Promise<Action> {
    if (obs.self.hp / obs.self.maxHp < 0.25) {
      return { kind: 'recall' };
    }

    if (obs.visibleEnemies.length > 0) {
      const target = nearest(obs.self.pos, obs.visibleEnemies);
      const readyAbility = Object.entries(obs.self.cooldowns).find(([, remaining]) => remaining === 0)?.[0];
      if (readyAbility) {
        return { kind: 'ability', ability: readyAbility, target: target.id };
      }
      return { kind: 'attack', target: target.id };
    }

    const enemyMinion = obs.nearbyMinions
      .filter((m) => m.team !== obs.self.team)
      .sort((a, b) => distance(obs.self.pos, a.pos) - distance(obs.self.pos, b.pos))[0];
    if (enemyMinion) {
      return { kind: 'attack', target: enemyMinion.id };
    }

    return { kind: 'move', target: BASE[otherTeam(obs.self.team)] };
  }
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function nearest<T extends { pos: { x: number; y: number } }>(from: { x: number; y: number }, items: T[]): T {
  return [...items].sort((a, b) => distance(from, a.pos) - distance(from, b.pos))[0];
}
