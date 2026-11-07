import { describe, expect, it } from 'vitest';
import { MAX_REACTION_TILT, reactionTilt } from '../../src/design/reactionTilt';

describe('наклон реакции', () => {
  it('в пределах, разный у разных и постоянный у одной', () => {
    const seeds = Array.from({ length: 200 }, (_, i) => `$event${i}👍`);
    const tilts = seeds.map(reactionTilt);
    expect(tilts.every((tilt) => Math.abs(tilt) <= MAX_REACTION_TILT)).toBe(true);
    expect(new Set(tilts).size).toBeGreaterThan(10);
    expect(seeds.map(reactionTilt)).toEqual(tilts);
  });
});
