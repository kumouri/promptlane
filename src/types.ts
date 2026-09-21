export type Team = 'violet' | 'green';
export type Lane = 'top' | 'mid' | 'bottom';
export type Instrument = 'drums' | 'keytar' | 'violin';

export interface Vec2 {
  x: number;
  y: number;
}

export interface Cooldowns {
  [ability: string]: number; // seconds remaining, 0 = ready
}

/** What a bearbot's pilot can see. Kept small and plain-JSON on purpose. */
export interface Observation {
  clockSec: number;
  self: {
    id: string;
    team: Team;
    lane: Lane;
    instrument: Instrument;
    pos: Vec2;
    hp: number;
    maxHp: number;
    moveSpeed: number;
    cooldowns: Cooldowns;
  };
  allies: Array<{ id: string; pos: Vec2; hp: number; maxHp: number }>;
  visibleEnemies: Array<{ id: string; pos: Vec2; hp: number; maxHp: number; kind: 'bearbot' | 'minion' | 'tower' | 'nexus' }>;
  nearbyMinions: Array<{ id: string; team: Team; pos: Vec2; hp: number; maxHp: number }>;
  nearbyTowers: Array<{ id: string; team: Team; lane: Lane; pos: Vec2; hp: number; maxHp: number; alive: boolean }>;
}

export type ActionKind = 'move' | 'attack' | 'ability' | 'recall' | 'hold';

export interface Action {
  kind: ActionKind;
  target?: Vec2 | string; // a position (move) or an entity id (attack/ability target)
  ability?: string;
}

export interface Pilot {
  decide(obs: Observation): Promise<Action>;
}

export type PilotKind = 'scripted' | 'prompt-mock' | 'prompt-http';
