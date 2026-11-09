// Test dei calcoli del blister: node scripts/test-logic.mjs (oppure npm test)
import assert from 'node:assert/strict';
import { d2n, n2d, compute, buildMap, planNotifications, applyAnswer, parseBackup, normalizeState, KIND, nextRx, shiftRx } from '../src/logic.js';
import { strings, pickLang } from '../src/i18n.js';

const at = (st, day) => compute(st, d2n(day));
const base = { blisters: [{ start: '2026-10-12', placebo: null }], lastNo: null, settings: { time: '09:00' } };

// Blister in corso: giorno 21, ciclo previsto l'8 novembre (giorno 28), prossimo blister il 9.
let m = at(base, '2026-11-01');
assert.equal(m.day, 21);
assert.equal(n2d(m.periods[0].n), '2026-11-08');
assert.equal(n2d(m.nextStart), '2026-11-09');
assert.equal(m.q, null);

// Giorno 25: domanda placebo / blister nuovo.
assert.deepEqual(at(base, '2026-11-05').q, { type: 'placebo', day: 25 });

// Giorno 29: domanda sul nuovo blister; con "No" si rimanda a domani.
assert.equal(at(base, '2026-11-09').q.type, 'blister');
assert.equal(at({ ...base, lastNo: '2026-11-09' }, '2026-11-09').q.type, 'snoozed');
assert.equal(n2d(at({ ...base, lastNo: '2026-11-09' }, '2026-11-09').nextStart), '2026-11-10');

// Placebo saltate: il blister nuovo parte il giorno 25 e il ciclo dell'8 novembre salta.
const skipped = applyAnswer(base, 'skip', '2026-10-12', '2026-11-05');
assert.deepEqual(skipped.blisters.map(b => [b.start, b.placebo]), [['2026-10-12', false], ['2026-11-05', null]]);
m = at(skipped, '2026-11-05');
assert.equal(m.day, 1);
assert.equal(n2d(m.skipNote.skipped), '2026-11-08');
assert.equal(n2d(m.skipNote.next.n), '2026-12-02');
assert.ok(buildMap(m).get(d2n('2026-11-08')).skippedPeriod);
assert.ok(m.periods.find(p => p.skipped && n2d(p.n) === '2026-11-08'));

// Una risposta già data non viene applicata due volte.
assert.equal(applyAnswer(skipped, 'placebo', '2026-10-12', '2026-11-05'), null);

// Nuovo blister confermato con "Sì" il giorno 29.
const placebo = applyAnswer(base, 'placebo', '2026-10-12', '2026-11-05');
const next = applyAnswer(placebo, 'yes', '2026-10-12', '2026-11-09');
assert.deepEqual(next.blisters.map(b => [b.start, b.placebo]), [['2026-10-12', true], ['2026-11-09', null]]);

// Promemoria: domanda del giorno 25, giorno del ciclo, domanda di inizio blister; il ciclo saltato ha il suo avviso.
let plan = planNotifications(base, d2n('2026-11-01'));
const has = (p, kind, day) => p.some(x => x.kind === kind && n2d(x.n) === day);
assert.ok(has(plan, KIND.PLACEBO_Q, '2026-11-05'));
assert.ok(has(plan, KIND.PERIOD, '2026-11-08'));
assert.ok(has(plan, KIND.BLISTER_Q, '2026-11-09'));
assert.ok(has(plan, KIND.PLACEBO_Q, '2026-12-03'));
plan = planNotifications(skipped, d2n('2026-11-05'));
assert.ok(has(plan, KIND.SKIPPED, '2026-11-08'));
assert.ok(!has(plan, KIND.PERIOD, '2026-11-08'));
assert.ok(has(plan, KIND.PLACEBO_Q, '2026-11-29'));
assert.equal(new Set(plan.map(p => p.id)).size, plan.length);

// Ricetta: promemoria il giorno 21 di un blister sì e uno no; "Sposta" lo porta al blister accanto e ritorno.
m = at(base, '2026-11-01');
plan = planNotifications(base, m.t);
assert.ok(has(plan, KIND.RX, '2026-11-29'));          // secondo blister, iniziato il 9 novembre
assert.ok(!has(plan, KIND.RX, '2026-12-27'));         // terzo blister: niente
assert.equal(n2d(nextRx(base, m)), '2026-11-29');
const moved = { ...base, settings: { time: '09:00', rx: shiftRx(base, m) } };
assert.equal(n2d(nextRx(moved, m)), '2026-11-01');    // primo blister: oggi è proprio il giorno 21
assert.ok(has(planNotifications(moved, m.t), KIND.RX, '2026-12-27'));
assert.equal(n2d(nextRx({ ...base, settings: { time: '09:00', rx: shiftRx(moved, m) } }, m)), '2026-11-29');

// Calendar map: a late pack leaves "gap" days counted from the day after day 28; a pack recorded early cuts the
// previous one short; a skipped placebo marks day 24 as the end of that pack.
const taken = { ...base, blisters: [{ start: '2026-10-12', placebo: true }] };
const day = (map, s) => map.get(d2n(s));
let map = buildMap(at(taken, '2026-11-11'));                 // no new pack yet, two days late
assert.ok(day(map, '2026-11-08').period);
assert.deepEqual(day(map, '2026-11-09'), { kind: 'gap', late: 1, proj: false });
assert.deepEqual(day(map, '2026-11-10'), { kind: 'gap', late: 2, proj: false });
assert.ok(day(map, '2026-11-11').start && day(map, '2026-11-11').proj);   // expected today
map = buildMap(at({ ...taken, lastNo: '2026-11-11' }, '2026-11-11'));      // "No" today: expected tomorrow
assert.deepEqual(day(map, '2026-11-11'), { kind: 'gap', late: 3, proj: false });
assert.ok(day(map, '2026-11-12').start);
map = buildMap(at({ ...taken, blisters: [...taken.blisters, { start: '2026-11-11', placebo: null }] }, '2026-11-20'));
assert.equal(day(map, '2026-11-10').late, 2);
assert.deepEqual([day(map, '2026-11-11').day, day(map, '2026-11-11').start, day(map, '2026-11-11').proj], [1, true, false]);
map = buildMap(at({ ...taken, blisters: [...taken.blisters, { start: '2026-11-01', placebo: null }] }, '2026-11-05'));
assert.equal(day(map, '2026-10-31').day, 20);
assert.equal(day(map, '2026-11-01').day, 1);
map = buildMap(at(skipped, '2026-11-05'));
assert.ok(day(map, '2026-11-04').skipend);
assert.equal(day(map, '2026-11-04').day, 24);
assert.equal(day(map, '2026-11-05').day, 1);

// Reminders stay between today and the horizon; after "No" the new-pack question moves from today to tomorrow
// and keeps pointing at the original expected day.
plan = planNotifications(taken, d2n('2026-11-01'), 10);
assert.ok(plan.length && plan.every(p => p.n >= d2n('2026-11-01') && p.n <= d2n('2026-11-11')));
assert.ok(!has(plan, KIND.RX, '2026-11-29'));
plan = planNotifications(taken, d2n('2026-11-01'));
assert.ok(plan.every(p => p.n >= d2n('2026-11-01') && p.n <= d2n('2026-11-01') + 100));
plan = planNotifications(taken, d2n('2026-11-10'));                  // day 28 (period) is already past
assert.ok(!has(plan, KIND.PERIOD, '2026-11-08') && plan.every(p => p.n >= d2n('2026-11-10')));
const packQ = st => planNotifications(st, d2n('2026-11-09')).filter(p => p.kind === KIND.BLISTER_Q && p.blisterStart === '2026-10-12')
  .map(p => [n2d(p.n), p.expected === null ? null : n2d(p.expected)]);
assert.deepEqual(packQ(taken), [['2026-11-09', null], ['2026-11-10', '2026-11-09'], ['2026-11-11', '2026-11-09'], ['2026-11-12', '2026-11-09']]);
assert.deepEqual(packQ({ ...taken, lastNo: '2026-11-09' }).map(x => x[0]), ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']);

// Answers: a new pack on day 25 means the placebo was skipped; answers for another pack, before day 25 or unknown are
// ignored; "No" only remembers the day; the input state is never changed.
const frozen = JSON.stringify(base);
assert.deepEqual(applyAnswer(base, 'yes', '2026-10-12', '2026-11-05').blisters.map(b => [b.start, b.placebo]),
  [['2026-10-12', false], ['2026-11-05', null]]);
assert.equal(applyAnswer(base, 'yes', '2026-10-12', '2026-11-04'), null);
assert.equal(applyAnswer(base, 'placebo', '2026-09-14', '2026-11-05'), null);
assert.equal(applyAnswer(base, 'maybe', '2026-10-12', '2026-11-05'), null);
assert.deepEqual(applyAnswer(base, 'no', '2026-10-12', '2026-11-09'), { ...base, lastNo: '2026-11-09' });
assert.equal(applyAnswer(placebo, 'skip', '2026-10-12', '2026-11-05'), null);
assert.equal(applyAnswer({ ...base, blisters: [] }, 'yes', '2026-10-12', '2026-11-09'), null);
assert.equal(JSON.stringify(base), frozen);

// Backup.
assert.deepEqual(parseBackup(JSON.stringify(skipped)).blisters, skipped.blisters);
assert.equal(parseBackup(JSON.stringify(moved)).settings.rx, moved.settings.rx);
assert.throws(() => parseBackup('{}'), { message: 'list' });
assert.throws(() => parseBackup('{"blisters":[{"start":"2026-02-30"}]}'), { message: 'date' });   // not a real day
assert.throws(() => parseBackup('{"blisters":[{"start":"2026-10-12"},{"start":"2026-10-12"}]}'), { message: 'dup' });
assert.equal(parseBackup('{"blisters":[],"settings":{"time":"25:00","lang":"fr"}}').settings.time, '09:00');

// Saved data read on startup: broken entries are dropped instead of breaking the calendar, the rest is kept.
let loaded = normalizeState({ blisters: [{ start: '2026-10-12', placebo: true }, null, { start: 'abc' }, { start: '2026-11-09' },
  { start: '2026-11-09', placebo: true }, { placebo: false }], lastNo: 'yesterday', settings: { time: '7:5', rx: '2026-11-29', lang: 'en' } });
assert.deepEqual(loaded.state.blisters, [{ start: '2026-10-12', placebo: true }, { start: '2026-11-09', placebo: null }]);
assert.equal(loaded.dropped, 4);
assert.deepEqual(loaded.state.settings, { time: '09:00', rx: '2026-11-29', lang: 'en' });
assert.equal(loaded.state.lastNo, null);
assert.ok(compute(loaded.state, d2n('2026-11-10')));
loaded = normalizeState(skipped);
assert.deepEqual(loaded, { state: { ...skipped, settings: { time: '09:00', rx: null, lang: 'auto' } }, dropped: 0 });
assert.deepEqual(normalizeState(null), { state: { blisters: [], lastNo: null, settings: { time: '09:00', rx: null, lang: 'auto' } }, dropped: 0 });

// Lingue: italiano e inglese hanno le stesse chiavi; senza scelta si segue il telefono (italiano solo se è in italiano).
const it = strings('it'), en = strings('en');
const keys = o => Object.keys(o).sort().join();
assert.equal(keys(en), keys(it));
assert.equal(it.lang, 'it');                 // il codice lingua non deve coprire un testo con lo stesso nome
assert.equal(it.language, 'Lingua');
for (const k of Object.keys(it)) if (it[k] && typeof it[k] === 'object') assert.equal(keys(en[k]), keys(it[k]), k);
assert.equal(pickLang('auto', 'it-IT'), 'it');
assert.equal(pickLang('auto', 'en-US'), 'en');
assert.equal(pickLang('auto', 'fr-FR'), 'en');
assert.equal(pickLang('it', 'en-US'), 'it');
assert.equal(it.weekdays.join(''), 'LMMGVSD');
assert.equal(en.rel(d2n('2026-11-02'), d2n('2026-11-01')), 'tomorrow');
for (const L of [it, en]) for (const p of [...plan, ...planNotifications(base, d2n('2026-11-09')), ...planNotifications(skipped, d2n('2026-11-05'))]) {
  const [title, body] = L.msg[p.kind](p);
  assert.ok(title && body && !body.includes('undefined'), `${L.lang} ${p.kind}`);
}
assert.throws(() => parseBackup('ciao'));

console.log('Tutti i test sui calcoli sono passati.');
