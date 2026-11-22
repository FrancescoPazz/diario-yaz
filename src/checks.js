// Gentle checks on dates the user types in. Pure functions, no DOM: used by the app and by the tests.
import { ACTIVE, d2n } from './logic.js';

const isDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * Start date of the recorded pack closest to `start` whose 24 active pills overlap a pack starting on `start`
 * (the two starts are less than 24 days apart), or null. `ignore` is the start of the pack being edited.
 * A pack on the same day is not reported here: the sheet already refuses it as a duplicate.
 */
export function overlappingPack(blisters, start, ignore = null) {
  if (!isDay(start)) return null;
  const n = d2n(start);
  let best = null, gap = ACTIVE;
  for (const b of blisters || []) {
    if (!b || !isDay(b.start) || b.start === ignore || b.start === start) continue;
    const g = Math.abs(d2n(b.start) - n);
    if (g < gap) { best = b.start; gap = g; }
  }
  return best;
}

/** How many recorded packs overlap another one (the packs History flags), so the Today screen can point to them. */
export function overlapCount(blisters) {
  return (blisters || []).filter(b => b && overlappingPack(blisters, b.start)).length;
}
