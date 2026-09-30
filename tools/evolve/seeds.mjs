/**
 * Deterministic randomness for the evolution harness (docs/prompt-evolution-spec.md §4). Every
 * seed and every "random" choice is a pure function of the campaign seed and a label, so a
 * generation re-planned after a crash picks exactly the same match seeds, mutation foci and
 * bootstrap resamples as the first time. Nothing here reads the clock or `Math.random`.
 */
import { createHash } from 'node:crypto';

export function sha256(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex');
}

/**
 * A match seed in 1..2^31-1 from the campaign seed and any labels, e.g.
 * `deriveSeed(7, 'epoch', 0, 'seed', 2)`. Same inputs, same seed, on every machine.
 */
export function deriveSeed(...parts) {
  const h = sha256(parts.map(String).join(':'));
  return (parseInt(h.slice(0, 8), 16) % 0x7ffffffe) + 1;
}

/** mulberry32: a small seeded PRNG, uniform in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seeded pick from `list`, labelled like `deriveSeed`. */
export function pick(list, ...parts) {
  if (!list.length) throw new Error('pick from an empty list');
  return list[deriveSeed(...parts) % list.length];
}
