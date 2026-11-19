// Reading the diary from the phone's storage. `prefs` is Capacitor Preferences, or a fake with the same
// get/set/remove methods in the tests.
import { normalizeState } from './logic.js';

export const STORE_KEY = 'diario-yaz';
// Raw text of saved data that could not be read, kept apart so the next save doesn't overwrite it.
export const UNREADABLE_KEY = 'diario-yaz-unreadable';

/**
 * Loads the diary. Returns { state, status, unreadable }:
 * - status 'ok', 'repaired' (some damaged packs were skipped) or 'unreadable' (the saved text is not a diary);
 * - unreadable is the kept raw text of the last unreadable data, or null.
 * When the data is unreadable the app starts empty, so the raw text is copied under UNREADABLE_KEY first.
 */
export async function loadStored(prefs, empty) {
  const { value } = await prefs.get({ key: STORE_KEY });
  let state = empty(), status = 'ok', d;
  if (value) {
    try { d = JSON.parse(value); } catch (e) { d = undefined; }
    if (d && typeof d === 'object' && Array.isArray(d.blisters)) {
      const r = normalizeState(d);
      state = r.state;
      if (r.dropped) status = 'repaired';
    } else status = 'unreadable';
  }
  if (status === 'unreadable') {
    try { await prefs.set({ key: UNREADABLE_KEY, value }); }
    catch (e) { return { state, status, unreadable: value }; }   // not kept, but still shown in this session
  }
  let unreadable = null;
  try { unreadable = (await prefs.get({ key: UNREADABLE_KEY })).value || null; } catch (e) { /* nothing kept */ }
  return { state, status, unreadable };
}
