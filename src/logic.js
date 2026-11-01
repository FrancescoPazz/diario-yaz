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
 * Stato salvato: { blisters: [{ start, placebo: true | false | null }], lastNo: "AAAA-MM-GG" | null, settings: { time: "HH:MM", rx: "AAAA-MM-GG" | null } }
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
const fmtIt = n => new Date(n * DAY).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

/**
 * Elenco dei promemoria da programmare da oggi (t) in avanti, per i prossimi ~3 blister.
 * Ogni voce: { id, n, kind, title, body, actionTypeId?, blisterStart }.
 * Va ricalcolato e riprogrammato a ogni modifica dei dati e a ogni apertura dell'app.
 */
export function planNotifications(st, t, horizon = 100) {
  const m = compute(st, t);
  if (!m) return [];
  const out = new Map();
  const add = (n, kind, blisterStart, title, body, actionTypeId) => {
    if (n < t || n > t + horizon) return;
    const id = kind * 100000 + n;
    if (!out.has(id)) out.set(id, { id, n, kind, title, body, actionTypeId, blisterStart: n2d(blisterStart) });
  };
  const placeboSeq = s => {
    add(s + 24, KIND.PLACEBO_Q, s, 'Giorno 25 · placebo o blister nuovo?',
      'Oggi cominci a prendere le placebo oppure cominci un nuovo blister? Con il blister nuovo questo mese salti il ciclo.', 'PLACEBO');
    add(s + 25, KIND.PLACEBO_R, s, 'Non hai ancora risposto',
      'Il giorno 25 hai cominciato le placebo oppure un nuovo blister?', 'PLACEBO');
    add(s + 26, KIND.PLACEBO_R, s, 'Non hai ancora risposto',
      'Il giorno 25 hai cominciato le placebo oppure un nuovo blister?', 'PLACEBO');
  };
  const blisterSeq = (from, prevStart, expected) => {
    for (let k = 0; k < 4; k++) {
      const n = from + k, late = n - expected;
      add(n, KIND.BLISTER_Q, prevStart, 'Nuovo blister',
        'Hai cominciato un nuovo blister oggi?' + (late > 0 ? ` Era previsto ${fmtIt(expected)}.` : ''), 'BLISTER');
    }
  };

  const { last } = m;
  if (last.p === null) placeboSeq(last.s);
  if (last.p !== false) {
    add(last.s + 27, KIND.PERIOD, last.s, 'Ciclo previsto oggi',
      last.p === true ? 'Oggi è il giorno previsto del ciclo (ultima placebo).' : 'Se hai preso le placebo, oggi è il giorno previsto del ciclo.');
    blisterSeq(m.nextStart, last.s, m.nominalNext);
  }
  if (m.prev && m.prev.p === false) {
    add(m.prev.s + 27, KIND.SKIPPED, m.prev.s, 'Questo mese salti il ciclo',
      `Oggi avresti avuto il ciclo, ma lo salti perché hai saltato le placebo. Se prendi le placebo di questo blister, il prossimo è previsto ${fmtIt(last.s + 27)}.`);
  }
  m.proj.slice(0, 3).forEach(b => {
    placeboSeq(b.s);
    add(b.s + 27, KIND.PERIOD, b.s, 'Ciclo previsto oggi', 'Se hai preso le placebo, oggi è il giorno previsto del ciclo.');
    blisterSeq(b.s + LENGTH, b.s, b.s + LENGTH);
  });
  rxStarts(st, m).forEach(s => add(s + RX_DAY - 1, KIND.RX, s, 'Ricetta dal medico',
    'Tra pochi giorni finisci il secondo blister: chiedi al medico di base la nuova ricetta per la pillola.'));
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

/** Controlla un backup importato e lo normalizza. Lancia un Error con messaggio in italiano se non è valido. */
export function parseBackup(text) {
  let d;
  try { d = JSON.parse(text); } catch (e) { throw new Error('Il testo incollato non è un backup valido.'); }
  if (!d || !Array.isArray(d.blisters)) throw new Error('Nel backup manca l\'elenco dei blister.');
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const blisters = d.blisters.map(b => {
    if (!b || !re.test(b.start)) throw new Error('Il backup contiene una data non valida.');
    return { start: b.start, placebo: b.placebo === true ? true : b.placebo === false ? false : null };
  });
  const time = d.settings && /^\d{2}:\d{2}$/.test(d.settings.time) ? d.settings.time : '09:00';
  const rx = d.settings && re.test(d.settings.rx || '') ? d.settings.rx : null;
  return { blisters, lastNo: re.test(d.lastNo || '') ? d.lastNo : null, settings: { time, rx } };
}
