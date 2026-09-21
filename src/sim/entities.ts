import type { Instrument, Lane, Team, Vec2 } from '../types';
import { BEARBOT_RADIUS, MINION_RADIUS, NEXUS_RADIUS, TOWER_RADIUS } from './map';

export type UnitKind = 'bearbot' | 'minion' | 'tower' | 'nexus';

export interface AbilityDef {
  name: string;
  cooldownSec: number;
  range: number;
  /** What it does, resolved by the match sim. */
  effect: 'taunt-slow' | 'aoe-slow' | 'aoe-burst' | 'dash' | 'stab' | 'solo';
  damage?: number;
  radius?: number;
}

export interface InstrumentDef {
  instrument: Instrument;
  role: string;
  maxHp: number;
  moveSpeed: number;
  attackRange: number;
  attackDamage: number;
  attackCooldownSec: number;
  abilities: AbilityDef[];
}

export const INSTRUMENTS: Record<Instrument, InstrumentDef> = {
  drums: {
    instrument: 'drums',
    role: 'Tank',
    maxHp: 220,
    moveSpeed: 55,
    attackRange: 40,
    attackDamage: 8,
    attackCooldownSec: 1.1,
    abilities: [
      { name: 'kick', cooldownSec: 6, range: 45, effect: 'taunt-slow', damage: 6 },
      { name: 'fill', cooldownSec: 10, range: 0, effect: 'aoe-slow', radius: 90 },
    ],
  },
  keytar: {
    instrument: 'keytar',
    role: 'Mage',
    maxHp: 140,
    moveSpeed: 60,
    attackRange: 160,
    attackDamage: 10,
    attackCooldownSec: 1.3,
    abilities: [
      { name: 'chord', cooldownSec: 7, range: 180, effect: 'aoe-burst', damage: 26, radius: 60 },
      { name: 'glissando', cooldownSec: 9, range: 0, effect: 'dash' },
    ],
  },
  violin: {
    instrument: 'violin',
    role: 'Assassin',
    maxHp: 150,
    moveSpeed: 75,
    attackRange: 45,
    attackDamage: 11,
    attackCooldownSec: 0.9,
    abilities: [
      { name: 'staccato', cooldownSec: 4, range: 50, effect: 'stab', damage: 30 },
      { name: 'solo', cooldownSec: 40, range: 0, effect: 'solo' },
    ],
  },
};

export interface Bearbot {
  kind: 'bearbot';
  id: string;
  team: Team;
  lane: Lane;
  instrument: Instrument;
  pos: Vec2;
  hp: number;
  maxHp: number;
  moveSpeed: number;
  attackRange: number;
  attackDamage: number;
  attackCooldownSec: number;
  attackTimer: number;
  cooldowns: Record<string, number>;
  radius: number;
  moveTarget: Vec2 | null;
  attackTarget: string | null;
  recalling: boolean;
  buffs: { soloUntil: number; slowUntil: number };
  alive: boolean;
}

export interface Minion {
  kind: 'minion';
  id: string;
  team: Team;
  lane: Lane;
  pos: Vec2;
  hp: number;
  maxHp: number;
  moveSpeed: number;
  attackRange: number;
  attackDamage: number;
  attackCooldownSec: number;
  attackTimer: number;
  radius: number;
  pathT: number; // progress 0..1 violet-base -> green-base
  alive: boolean;
}

export interface Tower {
  kind: 'tower';
  id: string;
  team: Team;
  lane: Lane;
  tier: 1 | 2;
  pos: Vec2;
  hp: number;
  maxHp: number;
  attackRange: number;
  attackDamage: number;
  attackCooldownSec: number;
  attackTimer: number;
  radius: number;
  alive: boolean;
}

export interface Nexus {
  kind: 'nexus';
  id: string;
  team: Team;
  pos: Vec2;
  hp: number;
  maxHp: number;
  radius: number;
  alive: boolean;
}

export type Unit = Bearbot | Minion | Tower | Nexus;

let idCounter = 0;
export function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

export function makeBearbot(team: Team, lane: Lane, instrument: Instrument, pos: Vec2): Bearbot {
  const def = INSTRUMENTS[instrument];
  const cooldowns: Record<string, number> = {};
  for (const a of def.abilities) cooldowns[a.name] = 0;
  return {
    kind: 'bearbot',
    id: nextId('bb'),
    team,
    lane,
    instrument,
    pos: { ...pos },
    hp: def.maxHp,
    maxHp: def.maxHp,
    moveSpeed: def.moveSpeed,
    attackRange: def.attackRange,
    attackDamage: def.attackDamage,
    attackCooldownSec: def.attackCooldownSec,
    attackTimer: 0,
    cooldowns,
    radius: BEARBOT_RADIUS,
    moveTarget: null,
    attackTarget: null,
    recalling: false,
    buffs: { soloUntil: 0, slowUntil: 0 },
    alive: true,
  };
}

export function makeMinion(team: Team, lane: Lane): Minion {
  return {
    kind: 'minion',
    id: nextId('mn'),
    team,
    lane,
    pos: { x: 0, y: 0 },
    hp: 60,
    maxHp: 60,
    moveSpeed: 34,
    attackRange: 30,
    attackDamage: 6,
    attackCooldownSec: 1,
    attackTimer: 0,
    radius: MINION_RADIUS,
    pathT: 0,
    alive: true,
  };
}

export function makeTower(team: Team, lane: Lane, tier: 1 | 2, pos: Vec2): Tower {
  return {
    kind: 'tower',
    id: nextId('tw'),
    team,
    lane,
    tier,
    pos: { ...pos },
    hp: 900,
    maxHp: 900,
    attackRange: 160,
    attackDamage: 18,
    attackCooldownSec: 1,
    attackTimer: 0,
    radius: TOWER_RADIUS,
    alive: true,
  };
}

export function makeNexus(team: Team, pos: Vec2): Nexus {
  return {
    kind: 'nexus',
    id: nextId('nx'),
    team,
    pos: { ...pos },
    hp: 2200,
    maxHp: 2200,
    radius: NEXUS_RADIUS,
    alive: true,
  };
}
