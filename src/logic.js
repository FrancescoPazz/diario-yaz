// Logica del blister Yaz (24 attive + 4 placebo). Funzioni pure, senza DOM: usate dall'app e dai test.
// Le date sono stringhe "AAAA-MM-GG" oppure numeri di giorno (giorni dal 1970-01-01, UTC).

export const DAY = 864e5;
export const ACTIVE = 24;      // compresse attive
export const LENGTH = 28;      // blister completo con placebo
const RX_DAY = 21;             // giorno del blister in cui ricordare la ricetta: una settimana prima della fine

export const d2n = s => { const [y, m, d] = s.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / DAY); };
export const n2d = n => new Date(n * DAY).toISOString().slice(0, 10);
export const localToday = (now = new Date()) =>
  now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');

/**
 * Stato salvato: { blisters: [{ start, placebo: true | false | null }], lastNo: "AAAA-MM-GG" | null,
 *                 settings: { time: "HH:MM", rx: "AAAA-MM-GG" | null, lang: "auto" | "it" | "en" } }
 * placebo: true = placebo prese, false = placebo saltate (blister nuovo il giorno 25), null = ancora da decidere.
 * rx: una data che cade in un blister in cui ricordare la ricetta (vedi rxStarts).
 */
export function compute(st, t) {
  const B = (st.blisters || [])
    .map(b => ({ s: d2n(b.start), p: b.placebo === undefined ? null : b.placebo }))
    .sort((a, b) => a.s - b.s);
  if (!B.length) return null;
  const last = B[B.length - 1];
  const day = t - last.s + 1;                       // giorno del blister in corso (1 = prima attiva)
  const len = last.p === false ? ACTIVE : LENGTH;
  const nominalNext = last.s + len;                 // quando dovrebbe iniziare il prossimo blister
  const snoozed = st.lastNo === n2d(t);
  let nextStart = nominalNext;
  if (nominalNext <= t) nextStart = snoozed ? t + 1 : t;
  const proj = [];
  for (let i = 0, s = nextStart; i < 14; i++, s += LENGTH) proj.push({ s, p: true, projected: true });

  let phase;
  if (day <= ACTIVE) phase = { kind: 'active', pill: day };
  else if (day <= LENGTH && last.p !== false) phase = { kind: 'placebo', pill: day };
  else phase = { kind: 'waiting', late: t - nominalNext };

  let q = null;
  if (last.p === null && day >= 25 && day <= 28) q = { type: 'placebo', day };
  else if (day > len) q = snoozed ? { type: 'snoozed' } : { type: 'blister', late: t - nominalNext };

  const periods = [];
  B.forEach(b => { if (b.p === false) periods.push({ n: b.s + 27, skipped: true }); });
  if (last.p !== false) periods.push({ n: last.s + 27, tentative: last.p === null, current: true });
  proj.forEach(b => periods.push({ n: b.s + 27, projected: true }));
  periods.sort((a, b) => a.n - b.n);
  const prev = B.length > 1 ? B[B.length - 2] : null;
  const skipNote = (prev && prev.p === false && day <= ACTIVE)
    ? { skipped: prev.s + 27, next: periods.find(p => !p.skipped && p.n > prev.s + 27) } : null;
  return { B, last, prev, day, len, phase, q, nominalNext, nextStart, proj, periods, skipNote, t };
}

/** Mappa giorno → informazioni per il calendario. */
export function buildMap(m) {
  const map = new Map();
  m.B.forEach((b, i) => {
    const len = b.p === false ? ACTIVE : LENGTH;
    const next = i < m.B.length - 1 ? m.B[i + 1].s : null;
    const end = next !== null ? Math.min(b.s + len, next) : b.s + len;
    for (let d = b.s; d < end; d++) {
      const day = d - b.s + 1;
      map.set(d, { day, kind: day <= ACTIVE ? 'active' : 'placebo', start: day === 1, period: day === 28,
        proj: d > m.t, skipend: b.p === false && day === ACTIVE });
    }
    const gapEnd = next !== null ? next : m.nextStart;
    for (let d = end; d < gapEnd; d++) map.set(d, { kind: 'gap', late: d - end + 1, proj: d > m.t });
  });
  m.B.forEach(b => {
    if (b.p !== false) return;
    const n = b.s + 27, info = map.get(n) || { kind: 'gap', proj: n > m.t };
    map.set(n, { ...info, skippedPeriod: true });
  });
  m.proj.forEach(b => {
    for (let d = b.s; d < b.s + LENGTH; d++) {
      const day = d - b.s + 1;
      map.set(d, { day, kind: day <= ACTIVE ? 'active' : 'placebo', start: day === 1, period: day === 28, proj: true });
    }
  });
  return map;
}

/* ---------- Ricetta dal medico ---------- */
const starts = m => [...m.B, ...m.proj].map(b => b.s);

/**
 * Inizio dei blister (registrati e previsti) in cui ricordare la ricetta: uno ogni due.
 * Si conta dal blister che contiene settings.rx; senza rx, dal primo registrato (il secondo, il quarto…).
 */
export function rxStarts(st, m) {
  const S = starts(m), rx = st.settings && st.settings.rx;
  const a = rx ? S.filter(s => s <= d2n(rx)).length - 1 : 1;   // rx prima di tutti i blister dà -1: stessa parità di 1
  return S.filter((s, i) => (i - a) % 2 === 0);
}

/** Giorno del prossimo promemoria della ricetta (oggi compreso). */
export const nextRx = (st, m) => rxStarts(st, m).map(s => s + RX_DAY - 1).find(n => n >= m.t);

/** Sposta i promemoria della ricetta al blister accanto: restituisce il nuovo settings.rx. */
export function shiftRx(st, m) {
  const S = starts(m), i = S.indexOf(nextRx(st, m) - RX_DAY + 1);
  return n2d(S[i + 1] + 14);   // metà del blister: resta dentro lo stesso blister anche se le date previste slittano
}

/* ---------- Notifiche ---------- */
export const KIND = { PLACEBO_Q: 1, PLACEBO_R: 2, BLISTER_Q: 3, PERIOD: 4, SKIPPED: 5, RX: 6 };
const ACTIONS = { [KIND.PLACEBO_Q]: 'PLACEBO', [KIND.PLACEBO_R]: 'PLACEBO', [KIND.BLISTER_Q]: 'BLISTER' };

/**
 * Elenco dei promemoria da programmare da oggi (t) in avanti, per i prossimi ~3 blister.
 * Ogni voce: { id, n, kind, actionTypeId?, blisterStart, expected?, confirmed?, next? }; i testi li scrive i18n.js.
 * Va ricalcolato e riprogrammato a ogni modifica dei dati e a ogni apertura dell'app.
 */
export function planNotifications(st, t, horizon = 100) {
  const m = compute(st, t);
  if (!m) return [];
  const out = new Map();
  const add = (n, kind, blisterStart, data) => {
    if (n < t || n > t + horizon) return;
    const id = kind * 100000 + n;
    if (!out.has(id)) out.set(id, { id, n, kind, actionTypeId: ACTIONS[kind], blisterStart: n2d(blisterStart), ...data });
  };
  const placeboSeq = s => {
    add(s + 24, KIND.PLACEBO_Q, s);
    add(s + 25, KIND.PLACEBO_R, s);
    add(s + 26, KIND.PLACEBO_R, s);
  };
  const blisterSeq = (from, prevStart, expected) => {
    for (let k = 0; k < 4; k++) add(from + k, KIND.BLISTER_Q, prevStart, { expected: from + k > expected ? expected : null });
  };

  const { last } = m;
  if (last.p === null) placeboSeq(last.s);
  if (last.p !== false) {
    add(last.s + 27, KIND.PERIOD, last.s, { confirmed: last.p === true });
    blisterSeq(m.nextStart, last.s, m.nominalNext);
  }
  if (m.prev && m.prev.p === false) add(m.prev.s + 27, KIND.SKIPPED, m.prev.s, { next: last.s + 27 });
  m.proj.slice(0, 3).forEach(b => {
    placeboSeq(b.s);
    add(b.s + 27, KIND.PERIOD, b.s, { confirmed: false });
    blisterSeq(b.s + LENGTH, b.s, b.s + LENGTH);
  });
  rxStarts(st, m).forEach(s => add(s + RX_DAY - 1, KIND.RX, s));
  return [...out.values()].sort((a, b) => a.n - b.n || a.kind - b.kind);
}

/**
 * Applica la risposta data da un pulsante di notifica (o dalla pagina) e restituisce il nuovo stato.
 * answer: 'placebo' | 'skip' | 'yes' | 'no'. blisterStart: blister a cui si riferisce la domanda. date: giorno della domanda.
 * Restituisce null se la domanda non vale più (ad esempio è già stata data una risposta).
 */
export function applyAnswer(st, answer, blisterStart, date) {
  const s = structuredCloneSafe(st);
  s.blisters.sort((a, b) => (a.start < b.start ? -1 : 1));
  const last = s.blisters[s.blisters.length - 1];
  if (!last || last.start !== blisterStart) return null;
  const ls = d2n(last.start);
  if (answer === 'placebo') { if (last.placebo !== null) return null; last.placebo = true; }
  else if (answer === 'skip') {
    if (last.placebo !== null) return null;
    last.placebo = false; s.blisters.push({ start: n2d(ls + 24), placebo: null }); s.lastNo = null;
  } else if (answer === 'yes') {
    const n = d2n(date);
    if (n < ls + 24) return null;
    last.placebo = (n - ls === 24) ? false : (last.placebo === null ? true : last.placebo);
    s.blisters.push({ start: date, placebo: null }); s.lastNo = null;
  } else if (answer === 'no') { s.lastNo = date; }
  else return null;
  return s;
}

function structuredCloneSafe(o) { return JSON.parse(JSON.stringify(o)); }

// A "YYYY-MM-DD" string that is a real calendar day (2026-02-30 is not).
const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && n2d(d2n(v)) === v;
const isTime = v => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

// Shared normalisation of saved or imported data. With strict, a bad pack throws; otherwise it is dropped and counted.
function normalize(d, strict) {
  const blisters = [], seen = new Set();
  let dropped = 0;
  for (const b of (d && Array.isArray(d.blisters)) ? d.blisters : []) {
    if (!b || !isDate(b.start) || seen.has(b.start)) {
      if (strict) throw new Error(b && isDate(b.start) ? 'dup' : 'date');
      dropped++; continue;
    }
    seen.add(b.start);
    blisters.push({ start: b.start, placebo: b.placebo === true ? true : b.placebo === false ? false : null });
  }
  blisters.sort((a, b) => (a.start < b.start ? -1 : 1));
  const s = (d && d.settings) || {};
  const settings = { time: isTime(s.time) ? s.time : '09:00', rx: isDate(s.rx) ? s.rx : null, lang: s.lang === 'it' || s.lang === 'en' ? s.lang : 'auto' };
  return { state: { blisters, lastNo: d && isDate(d.lastNo) ? d.lastNo : null, settings }, dropped };
}

/** Controlla un backup importato e lo normalizza. Se non è valido lancia un Error il cui messaggio è una chiave di T.backupErr. */
export function parseBackup(text) {
  let d;
  try { d = JSON.parse(text); } catch (e) { throw new Error('json'); }
  if (!d || !Array.isArray(d.blisters)) throw new Error('list');
  return normalize(d, true).state;
}

/** Normalises the data saved on the phone: packs with a missing, invalid or repeated start date are dropped. */
export function normalizeState(d) { return normalize(d, false); }
