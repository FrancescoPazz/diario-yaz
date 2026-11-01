// Test dei calcoli del blister: node scripts/test-logic.mjs (oppure npm test)
import assert from 'node:assert/strict';
import { d2n, n2d, compute, buildMap, planNotifications, applyAnswer, parseBackup, KIND, nextRx, shiftRx } from '../src/logic.js';

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

// Backup.
assert.deepEqual(parseBackup(JSON.stringify(skipped)).blisters, skipped.blisters);
assert.equal(parseBackup(JSON.stringify(moved)).settings.rx, moved.settings.rx);
assert.throws(() => parseBackup('ciao'));

console.log('Tutti i test sui calcoli sono passati.');
