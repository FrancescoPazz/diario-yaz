// Diario Yaz — interfaccia, salvataggio sul telefono e promemoria.
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { LocalNotifications } from '@capacitor/local-notifications';
import { App } from '@capacitor/app';
import { DAY, d2n, n2d, localToday, compute, buildMap, planNotifications, applyAnswer, parseBackup, nextRx, shiftRx } from './logic.js';

const NATIVE = Capacitor.isNativePlatform();
const STORE_KEY = 'diario-yaz';
const CHANNEL = 'promemoria';
const EMPTY = () => ({ blisters: [], lastNo: null, settings: { time: '09:00' } });

let state = null;
let ui = { month: null, pickDate: false, confirmDel: null, addOpen: false, backupOpen: false, confirmImport: false };
let notif = { display: 'unknown', exact: 'unknown' };

/* ---------- utilità di formato ---------- */
const fmt = (n, o = { weekday: 'short', day: 'numeric', month: 'short' }) => new Date(n * DAY).toLocaleDateString('it-IT', { ...o, timeZone: 'UTC' });
const fmtLong = n => fmt(n, { weekday: 'long', day: 'numeric', month: 'long' });
const rel = (n, t) => n === t ? 'oggi' : n === t + 1 ? 'domani' : n === t - 1 ? 'ieri' : n > t ? `tra ${n - t} giorni` : `${t - n} giorni fa`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = id => document.getElementById(id);

function showErr(msg) { const e = $('err'); e.textContent = msg || ''; e.hidden = !msg; }
let toastTimer = null;
function toast(msg) { const e = $('toast'); e.textContent = msg; e.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { e.hidden = true; }, 4500); }

/* ---------- salvataggio sul dispositivo ---------- */
async function load() {
  try {
    const { value } = await Preferences.get({ key: STORE_KEY });
    if (!value) return EMPTY();
    const d = JSON.parse(value);
    return { blisters: Array.isArray(d.blisters) ? d.blisters : [], lastNo: d.lastNo || null, settings: { time: (d.settings && d.settings.time) || '09:00', rx: (d.settings && d.settings.rx) || null } };
  } catch (e) {
    showErr('Non riesco a leggere i dati salvati. Se hai un backup puoi reimportarlo.');
    return EMPTY();
  }
}

let saveQueue = Promise.resolve();
function persist() {
  state.blisters.sort((a, b) => (a.start < b.start ? -1 : 1));
  const snap = JSON.stringify(state);
  render();
  saveQueue = saveQueue
    .then(() => Preferences.set({ key: STORE_KEY, value: snap }))
    .then(() => showErr(''))
    .catch(() => showErr('Salvataggio non riuscito. Riprova.'))
    .then(() => reschedule());
}

/* ---------- promemoria (notifiche locali) ---------- */
async function setupNotifications() {
  if (!NATIVE) return;
  try {
    await LocalNotifications.createChannel({ id: CHANNEL, name: 'Promemoria pillola', description: 'Inizio blister, giorno 25, ciclo previsto e ricetta', importance: 4, visibility: 1, vibration: true });
    await LocalNotifications.registerActionTypes({ types: [
      { id: 'PLACEBO', actions: [{ id: 'placebo', title: 'Placebo' }, { id: 'skip', title: 'Blister nuovo' }] },
      { id: 'BLISTER', actions: [{ id: 'yes', title: 'Sì' }, { id: 'no', title: 'No' }] },
    ] });
    await LocalNotifications.addListener('localNotificationActionPerformed', onNotificationAction);
  } catch (e) { /* le notifiche restano disattivate, l'app funziona comunque */ }
  await refreshPermissions();
}

async function refreshPermissions() {
  if (!NATIVE) return;
  try { notif.display = (await LocalNotifications.checkPermissions()).display; } catch (e) { notif.display = 'unknown'; }
  try { notif.exact = (await LocalNotifications.checkExactNotificationSetting()).exact_alarm; } catch (e) { notif.exact = 'unknown'; }
}

async function askPermission() {
  if (!NATIVE) return;
  try { notif.display = (await LocalNotifications.requestPermissions()).display; } catch (e) { /* nulla */ }
  if (notif.display !== 'granted') showErr('Le notifiche sono disattivate. Puoi attivarle da Impostazioni Android › App › Diario Yaz › Notifiche.');
  await reschedule();
  render();
}

let schedQueue = Promise.resolve();
function reschedule() {
  schedQueue = schedQueue.then(doReschedule).catch(() => {});
  return schedQueue;
}
async function doReschedule() {
  if (!NATIVE || !state || notif.display !== 'granted') return;
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });
  const t = d2n(localToday());
  const [hh, mm] = state.settings.time.split(':').map(Number);
  const now = Date.now();
  const list = planNotifications(state, t).map(p => {
    const [y, mo, d] = n2d(p.n).split('-').map(Number);
    return { p, at: new Date(y, mo - 1, d, hh, mm, 0) };
  }).filter(x => x.at.getTime() > now + 15000).slice(0, 60);
  if (!list.length) return;
  await LocalNotifications.schedule({ notifications: list.map(({ p, at }) => ({
    id: p.id, title: p.title, body: p.body, largeBody: p.body,
    channelId: CHANNEL, actionTypeId: p.actionTypeId, smallIcon: 'ic_stat_notify', iconColor: '#A92D58',
    extra: { kind: p.kind, date: n2d(p.n), blisterStart: p.blisterStart },
    schedule: { at, allowWhileIdle: true },
  })) });
}

const ANSWER_TEXT = { placebo: 'Registrato: hai cominciato le placebo.', skip: 'Registrato: blister nuovo, questo mese salti il ciclo.', yes: 'Registrato: nuovo blister iniziato.', no: 'Ok, te lo richiedo domani.' };
function onNotificationAction(ev) {
  const id = ev.actionId, x = (ev.notification && ev.notification.extra) || {};
  if (!state || !ANSWER_TEXT[id]) { render(); return; }      // semplice tocco sulla notifica: apre l'app sulla domanda
  const next = applyAnswer(state, id, x.blisterStart, x.date);
  if (!next) { toast('Questa domanda ha già una risposta. Controlla il diario qui sotto.'); render(); return; }
  next.settings = state.settings;
  state = next; persist(); toast(ANSWER_TEXT[id]);
}

/* ---------- azioni dalla pagina ---------- */
const lastB = () => state.blisters[state.blisters.length - 1];
function answer(kind, date) {
  const next = applyAnswer(state, kind, lastB().start, date || localToday());
  if (!next) return showErr('Non riesco a registrare questa risposta. Controlla le date nello storico.');
  next.settings = state.settings; state = next; ui.pickDate = false; persist(); toast(ANSWER_TEXT[kind]);
}
const actions = {
  async setup() {
    const v = $('setup-date').value;
    if (!v) return showErr('Scegli la data di inizio del blister.');
    if (d2n(v) > d2n(localToday())) return showErr('La data non può essere nel futuro.');
    state.blisters = [{ start: v, placebo: null }]; state.lastNo = null; persist();
    if (NATIVE && notif.display !== 'granted') await askPermission();
  },
  placebo() { answer('placebo'); },
  skip() { answer('skip'); },
  yes() { answer('yes'); },
  no() { answer('no'); },
  pick() { ui.pickDate = true; render(); },
  pickSave() {
    const v = $('pick-date').value;
    if (!v) return showErr('Scegli una data.');
    if (d2n(v) > d2n(localToday())) return showErr('La data non può essere nel futuro.');
    if (d2n(v) <= d2n(lastB().start) + 23) return showErr('La data deve essere dopo la 24ª compressa attiva del blister precedente.');
    answer('yes', v);
  },
  monthPrev() { ui.month = shiftMonth(ui.month, -1); render(); },
  monthNext() { ui.month = shiftMonth(ui.month, 1); render(); },
  monthToday() { ui.month = null; render(); },
  del(el) { ui.confirmDel = el.dataset.start; render(); },
  delNo() { ui.confirmDel = null; render(); },
  delYes(el) {
    state.blisters = state.blisters.filter(b => b.start !== el.dataset.start); ui.confirmDel = null;
    const l = lastB(); if (l && l.placebo === false) l.placebo = null;
    persist();
  },
  addToggle() { ui.addOpen = !ui.addOpen; render(); },
  addSave() {
    const v = $('add-date').value, o = $('add-out').value;
    if (!v) return showErr('Scegli la data di inizio.');
    if (state.blisters.some(b => b.start === v)) return showErr('Esiste già un blister iniziato in quella data.');
    if (d2n(v) > d2n(localToday())) return showErr('La data non può essere nel futuro.');
    state.blisters.push({ start: v, placebo: o === 'placebo' ? true : o === 'skip' ? false : null }); ui.addOpen = false; persist();
  },
  rxShift() { state.settings.rx = shiftRx(state, compute(state, d2n(localToday()))); persist(); },
  notifOn() { askPermission(); },
  async exactOn() {
    try { notif.exact = (await LocalNotifications.changeExactNotificationSetting()).exact_alarm; } catch (e) { /* nulla */ }
    await reschedule(); render();
  },
  async testNotif() {
    if (notif.display !== 'granted') return askPermission();
    try {
      await LocalNotifications.schedule({ notifications: [{ id: 999999, title: 'Diario Yaz', body: 'Le notifiche funzionano. I promemoria arriveranno alle ' + state.settings.time + '.', channelId: CHANNEL, smallIcon: 'ic_stat_notify', iconColor: '#A92D58', schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true } }] });
      toast('Notifica di prova tra 5 secondi.');
    } catch (e) { showErr('Non riesco a inviare la notifica di prova.'); }
  },
  backupToggle() { ui.backupOpen = !ui.backupOpen; ui.confirmImport = false; render(); },
  async copyBackup() {
    const ta = $('backup-out');
    try { await navigator.clipboard.writeText(ta.value); toast('Backup copiato. Incollalo in una nota o in un messaggio a te stessa.'); }
    catch (e) { ta.focus(); ta.select(); toast('Testo selezionato: tieni premuto e scegli Copia.'); }
  },
  importAsk() {
    try { parseBackup($('backup-in').value); ui.confirmImport = true; render(); }
    catch (e) { showErr(e.message); }
  },
  importNo() { ui.confirmImport = false; render(); },
  importYes() {
    try { state = parseBackup($('backup-in').value); ui.confirmImport = false; ui.backupOpen = false; persist(); toast('Dati importati.'); }
    catch (e) { showErr(e.message); }
  },
};
function shiftMonth(m, k) { const t = new Date(); let [y, mo] = m || [t.getFullYear(), t.getMonth()]; mo += k; y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12; return [y, mo]; }

document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]'); if (!el) return;
  e.preventDefault(); showErr('');
  actions[el.dataset.a] && actions[el.dataset.a](el);
});
document.addEventListener('change', e => {
  if (e.target.id === 'notif-time' && /^\d{2}:\d{2}$/.test(e.target.value)) {
    state.settings.time = e.target.value; persist(); toast('Promemoria alle ' + e.target.value + '.');
  }
});

/* ---------- interfaccia ---------- */
function render() {
  const app = $('app');
  if (!state) return;
  const keep = ui.backupOpen && $('backup-in') ? $('backup-in').value : null;
  const t = d2n(localToday());
  const m = compute(state, t);
  if (!m) { app.innerHTML = setupView() + settingsView(); return; }
  app.innerHTML = askView(m) + skipView(m) + todayView(m) + calendarView(m)
    + `<div class="two">${periodsView(m)}${historyView()}</div>` + settingsView(m);
  if (keep !== null && $('backup-in')) $('backup-in').value = keep;
}

function setupView() {
  return `<section class="panel setup">
    <span class="label">Per iniziare</span>
    <div class="big">Quando hai preso la prima compressa del blister attuale?</div>
    <p class="sub" style="margin:0">Da questa data calcolo il giorno delle placebo, il prossimo blister e il ciclo previsto.</p>
    <div class="row"><input type="date" id="setup-date" max="${localToday()}" aria-label="Data della prima compressa"><button class="btn primary" data-a="setup">Inizia il diario</button></div>
  </section>`;
}

function askView(m) {
  const q = m.q; if (!q) return '';
  if (q.type === 'placebo') {
    const late = q.day > 25;
    return `<section class="ask" aria-label="Domanda di oggi">
      <span class="label">${late ? `Giorno 25 · ${fmt(m.last.s + 24)}` : 'Oggi è il giorno 25'}</span>
      <h2>${late ? 'Il giorno 25 hai cominciato le placebo oppure un nuovo blister?' : 'Oggi cominci a prendere le placebo oppure cominci un nuovo blister?'}</h2>
      <p>Con le placebo il ciclo è previsto ${fmtLong(m.last.s + 27)}. Con un blister nuovo salti il ciclo di questo mese e il conteggio riparte da ${late ? fmt(m.last.s + 24) : 'oggi'}: il prossimo ciclo sarebbe ${fmtLong(m.last.s + 24 + 27)}.</p>
      <div class="row"><button class="btn" data-a="placebo">Placebo</button><button class="btn alt" data-a="skip">Blister nuovo</button></div>
    </section>`;
  }
  if (q.type === 'blister') {
    const extra = q.late > 0 ? `<p>Il nuovo blister era previsto ${fmt(m.nominalNext)} (${q.late === 1 ? '1 giorno fa' : q.late + ' giorni fa'}).</p>` : '';
    const picker = ui.pickDate ? `<div class="row"><input type="date" id="pick-date" min="${n2d(m.last.s + 24)}" max="${localToday()}" aria-label="Data di inizio del nuovo blister"><button class="btn" data-a="pickSave">Salva data</button></div>` : '';
    return `<section class="ask" aria-label="Domanda di oggi">
      <span class="label">Inizio blister</span>
      <h2>Hai cominciato un nuovo blister oggi?</h2>${extra}
      <div class="row"><button class="btn" data-a="yes">Sì</button><button class="btn alt" data-a="no">No</button>${ui.pickDate ? '' : '<button class="btn ghost" data-a="pick">L\'ho iniziato un altro giorno</button>'}</div>
      ${picker}
    </section>`;
  }
  if (q.type === 'snoozed') {
    return `<section class="note row" style="justify-content:space-between"><span>Ok, nessun blister nuovo oggi. Te lo richiedo domani.</span>
      <button class="btn small" data-a="yes">L'ho appena iniziato</button></section>`;
  }
  return '';
}

function skipView(m) {
  const s = m.skipNote; if (!s) return '';
  const head = s.skipped > m.t ? 'Questo mese salti il ciclo'
    : s.skipped === m.t ? 'Oggi avresti avuto il ciclo: questo mese lo salti'
      : 'Questo mese hai saltato il ciclo';
  return `<section class="skipnote" role="status">
    <span class="label">Placebo saltate</span>
    <h2>${head}</h2>
    <p>Hai iniziato il blister nuovo ${fmtLong(m.last.s)} al posto della prima placebo, quindi il ciclo previsto ${fmtLong(s.skipped)} non arriva.${s.next ? ` Se questa volta prendi le placebo, il prossimo ciclo è previsto ${fmtLong(s.next.n)}.` : ''}</p>
  </section>`;
}

function todayView(m) {
  const { phase, last, day, t } = m;
  let headline, sub;
  if (phase.kind === 'active') { headline = `Compressa attiva ${phase.pill} di 24`; sub = phase.pill === 24 ? 'Ultima attiva: domani tocca alle placebo o a un blister nuovo.' : `${24 - phase.pill} attive rimanenti in questo blister.`; }
  else if (phase.kind === 'placebo') { headline = `Placebo ${phase.pill - 24} di 4`; sub = phase.pill === 28 ? 'Oggi è il giorno previsto del ciclo.' : `Ciclo previsto ${fmtLong(last.s + 27)}.`; }
  else { headline = 'Tra un blister e l\'altro'; sub = phase.late > 0 ? `Il nuovo blister era previsto ${fmt(m.nominalNext)}.` : 'Oggi inizia il nuovo blister.'; }

  const pills = Array.from({ length: 28 }, (_, i) => {
    const n = i + 1, isPl = n > 24;
    const cls = ['pill', isPl ? 'pl' : '', n < day ? 'taken' : '', n === day ? 'now' : '', isPl && last.p === false ? 'skip' : '', n === 28 && last.p !== false ? 'flow' : ''].join(' ');
    return `<span class="${cls}" aria-label="${isPl ? 'Placebo' : 'Attiva'} ${n}, ${fmt(last.s + i)}">${n}</span>`;
  }).join('');

  const nextPeriod = m.periods.find(p => p.n >= t && !p.skipped);
  const nextPlacebo = (last.p !== false && day < 25) ? last.s + 24 : m.proj[0].s + 24;
  const nextBlister = m.nextStart;
  return `<section class="panel">
    <div class="today-grid">
      <div style="display:flex;flex-direction:column;gap:6px;min-width:0">
        <span class="label">${fmtLong(t)} · giorno ${Math.max(day, 1)} del blister iniziato ${fmt(last.s)}</span>
        <div class="big">${headline}<small>${sub}</small></div>
      </div>
      <div class="blister" aria-label="Blister attuale, 24 attive e 4 placebo">${pills}</div>
    </div>
    <div class="facts">
      <div class="fact"><span class="label">Ciclo previsto</span><b>${nextPeriod ? fmt(nextPeriod.n) : '—'}</b><span class="in">${nextPeriod ? rel(nextPeriod.n, t) + (nextPeriod.tentative ? ' · se prendi le placebo' : '') : ''}</span></div>
      <div class="fact"><span class="label">Prime placebo</span><b>${fmt(nextPlacebo)}</b><span class="in">${rel(nextPlacebo, t)} · giorno 25</span></div>
      <div class="fact"><span class="label">Prossimo blister</span><b>${fmt(nextBlister)}</b><span class="in">${rel(nextBlister, t)}${last.p === null && day <= 28 ? ' · dopo le placebo' : ''}</span></div>
    </div>
  </section>`;
}

function calendarView(m) {
  const now = new Date();
  const [y, mo] = ui.month || [now.getFullYear(), now.getMonth()];
  const map = buildMap(m);
  const first = d2n(`${y}-${String(mo + 1).padStart(2, '0')}-01`);
  const daysIn = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  const lead = (new Date(first * DAY).getUTCDay() + 6) % 7;
  const title = new Date(first * DAY).toLocaleDateString('it-IT', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  let cells = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'].map(d => `<div class="dow">${d}</div>`).join('');
  for (let i = 0; i < lead; i++) cells += '<div class="d out"></div>';
  for (let k = 0; k < daysIn; k++) {
    const n = first + k, info = map.get(n);
    const cls = ['d'];
    let tag = '', tip = fmtLong(n);
    if (info) {
      if (info.kind === 'gap') { cls.push('gap'); tag = `+${info.late}`; tip += ', nessun blister registrato'; }
      else {
        cls.push(info.period ? 'period' : info.kind);
        tag = info.period ? 'ciclo' : info.kind === 'placebo' ? `P${info.day - 24}` : String(info.day);
        tip += info.period ? ', ciclo previsto' : info.kind === 'placebo' ? `, placebo ${info.day - 24}` : `, attiva ${info.day}`;
        if (info.start) { cls.push('start'); tip += ', inizio blister'; }
        if (info.skipend) { cls.push('skipend'); tip += ', placebo saltate'; }
      }
      if (info.skippedPeriod) { cls.push('skipped'); tag = 'no ciclo'; tip += ', ciclo saltato questo mese'; }
      if (info.proj) cls.push('proj');
    }
    if (n === m.t) cls.push('today');
    cells += `<div class="${cls.join(' ')}" aria-label="${esc(tip)}"><span class="n">${k + 1}</span><span class="t">${tag}</span></div>`;
  }
  return `<section class="panel">
    <div class="cal-head"><h2>${title}</h2>
      <div class="row" style="gap:6px"><button class="btn small" data-a="monthPrev" aria-label="Mese precedente">←</button><button class="btn small" data-a="monthToday">Oggi</button><button class="btn small" data-a="monthNext" aria-label="Mese successivo">→</button></div>
    </div>
    <div class="cal">${cells}</div>
    <div class="legend">
      <span><i style="background:var(--pill)"></i>Attiva</span>
      <span><i style="background:var(--placebo);border:1px solid var(--line)"></i>Placebo</span>
      <span><i style="background:var(--accent)"></i>Ciclo</span>
      <span><i style="border:2px dashed var(--accent)"></i>Ciclo previsto</span>
      <span><i style="background:var(--sage);border-radius:50%;width:8px;height:8px"></i>Inizio blister</span>
      <span>↷ Placebo saltate</span>
      <span><i style="background:var(--warn-bg);border:1.5px solid var(--warn)"></i>Ciclo saltato</span>
    </div>
  </section>`;
}

function periodsView(m) {
  const up = m.periods.filter(p => p.n >= m.t).slice(0, 8);
  return `<section class="panel"><div><span class="label">Se prendi tutte le placebo</span><h2>Prossimi cicli previsti</h2></div>
    <div class="list">${up.map(p => p.skipped
      ? `<div class="li"><div><div class="when">${fmtLong(p.n)}</div><div class="meta">${rel(p.n, m.t)} · placebo saltate, blister nuovo</div></div><span class="chip skip">ciclo saltato</span></div>`
      : `<div class="li"><div><div class="when">${fmtLong(p.n)}</div><div class="meta">${rel(p.n, m.t)}${p.current ? ' · blister in corso' : ''}</div></div>
      <span class="chip ${p.current ? 'now' : ''}">${p.current ? (p.tentative ? 'da confermare il giorno 25' : 'placebo confermate') : 'previsto'}</span></div>`).join('')}</div></section>`;
}

function historyView() {
  const rows = [...state.blisters].reverse().map(b => {
    const s = d2n(b.start);
    const chip = b.placebo === true ? '<span class="chip ok">placebo prese</span>' : b.placebo === false ? '<span class="chip skip">placebo saltate</span>' : '<span class="chip now">in corso</span>';
    const meta = b.placebo === false ? `ciclo del ${fmt(s + 27)} saltato · nuovo blister ${fmt(s + 24)}` : `ciclo ${b.placebo === null ? 'previsto ' : ''}${fmt(s + 27)}`;
    const del = ui.confirmDel === b.start
      ? `<div class="row" style="gap:6px"><span class="meta">Eliminare?</span><button class="btn small" data-a="delYes" data-start="${b.start}">Elimina</button><button class="btn small" data-a="delNo">Annulla</button></div>`
      : `<div class="row" style="gap:8px">${chip}<button class="btn ghost small" data-a="del" data-start="${b.start}" aria-label="Elimina il blister del ${fmt(s)}">×</button></div>`;
    return `<div class="li"><div><div class="when">Iniziato ${fmt(s, { day: 'numeric', month: 'short', year: 'numeric' })}</div><div class="meta">${meta}</div></div>${del}</div>`;
  }).join('');
  const add = ui.addOpen ? `<div class="row"><input type="date" id="add-date" max="${localToday()}" aria-label="Inizio blister">
      <select id="add-out" aria-label="Placebo"><option value="placebo">Placebo prese</option><option value="skip">Placebo saltate</option><option value="open">In corso</option></select>
      <button class="btn small" data-a="addSave">Aggiungi</button></div>` : '';
  return `<section class="panel"><div class="row" style="justify-content:space-between"><div><span class="label">Storico</span><h2>Blister registrati</h2></div>
      <button class="btn small" data-a="addToggle">${ui.addOpen ? 'Chiudi' : 'Aggiungi'}</button></div>
    ${add}<div class="list">${rows}</div></section>`;
}

function settingsView(m) {
  const rx = m && nextRx(state, m);
  const rxRow = m ? `<div class="setting"><div><b>Ricetta dal medico</b><div class="meta">Ogni due blister ti ricordo di chiederla. Prossimo promemoria ${fmtLong(rx)} (${rel(rx, m.t)}).</div></div><button class="btn small" data-a="rxShift" aria-label="Sposta il promemoria della ricetta al blister accanto">Sposta</button></div>` : '';
  const notifRow = !NATIVE
    ? '<div class="setting"><div><b>Notifiche</b><div class="meta">Disponibili solo nell\'app installata sul telefono.</div></div></div>'
    : `<div class="setting"><div><b>Notifiche</b><div class="meta">${notif.display === 'granted' ? '<span class="status-ok">Attive</span>: ti chiedo dell\'inizio blister, del giorno 25, ti avviso del ciclo e della ricetta.' : '<span class="status-off">Disattivate</span>: senza permesso non posso avvisarti.'}</div></div>
        ${notif.display === 'granted' ? '<button class="btn small" data-a="testNotif">Prova</button>' : '<button class="btn small primary" data-a="notifOn">Attiva</button>'}</div>
       ${notif.display === 'granted' && notif.exact !== 'granted' && notif.exact !== 'unknown' ? `<div class="setting"><div><b>Orario esatto</b><div class="meta">Android può ritardare i promemoria di qualche minuto. Consenti le sveglie esatte per riceverli puntuali.</div></div><button class="btn small" data-a="exactOn">Consenti</button></div>` : ''}`;
  const backup = ui.backupOpen ? `
    <div style="display:flex;flex-direction:column;gap:8px">
      <span class="meta">Copia questo testo e conservalo: ti serve per ripristinare lo storico su un altro telefono.</span>
      <textarea id="backup-out" readonly aria-label="Backup dei dati">${esc(JSON.stringify(state))}</textarea>
      <div class="row"><button class="btn small" data-a="copyBackup">Copia backup</button></div>
      <span class="meta" style="margin-top:8px">Per ripristinare, incolla qui un backup.</span>
      <textarea id="backup-in" aria-label="Incolla un backup" placeholder='{"blisters":[...]}'></textarea>
      ${ui.confirmImport
        ? '<div class="row"><span class="meta">I dati attuali verranno sostituiti.</span><button class="btn small primary" data-a="importYes">Sostituisci</button><button class="btn small" data-a="importNo">Annulla</button></div>'
        : '<div class="row"><button class="btn small" data-a="importAsk">Importa backup</button></div>'}
    </div>` : '';
  return `<section class="panel"><div><span class="label">Impostazioni</span><h2>Promemoria e dati</h2></div>
    <div>
      <div class="setting"><div><b>Orario dei promemoria</b><div class="meta">Ogni notifica arriva a quest'ora nel giorno giusto.</div></div><input type="time" id="notif-time" value="${esc(state.settings.time)}" aria-label="Orario dei promemoria"></div>
      ${notifRow}
      ${rxRow}
      <div class="setting"><div><b>Backup</b><div class="meta">I dati sono salvati su questo telefono. Il backup serve per spostarli su un altro dispositivo.</div></div><button class="btn small" data-a="backupToggle">${ui.backupOpen ? 'Chiudi' : 'Apri'}</button></div>
    </div>${backup}</section>`;
}

/* ---------- avvio ---------- */
async function boot() {
  state = await load();
  await setupNotifications();
  render();
  reschedule();
  if (NATIVE) {
    App.addListener('resume', async () => { await refreshPermissions(); render(); reschedule(); });
  }
  let shownDay = localToday();
  setInterval(() => { if (localToday() !== shownDay) { shownDay = localToday(); render(); reschedule(); } }, 60000);
}
boot();
