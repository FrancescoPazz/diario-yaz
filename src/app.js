// Diario Yaz — interfaccia Material 3, salvataggio sul telefono e promemoria.
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { LocalNotifications } from '@capacitor/local-notifications';
import { App } from '@capacitor/app';
import { DAY, d2n, n2d, localToday, compute, buildMap, planNotifications, applyAnswer, parseBackup, nextRx, shiftRx } from './logic.js';

// Material Symbols (stile rounded): esbuild li include come testo SVG
import today from '@material-symbols/svg-400/rounded/today.svg';
import todayFill from '@material-symbols/svg-400/rounded/today-fill.svg';
import calendarMonth from '@material-symbols/svg-400/rounded/calendar_month.svg';
import calendarMonthFill from '@material-symbols/svg-400/rounded/calendar_month-fill.svg';
import history from '@material-symbols/svg-400/rounded/history.svg';
import historyFill from '@material-symbols/svg-400/rounded/history-fill.svg';
import settings from '@material-symbols/svg-400/rounded/settings.svg';
import settingsFill from '@material-symbols/svg-400/rounded/settings-fill.svg';
import chevronLeft from '@material-symbols/svg-400/rounded/chevron_left.svg';
import chevronRight from '@material-symbols/svg-400/rounded/chevron_right.svg';
import waterDrop from '@material-symbols/svg-400/rounded/water_drop.svg';
import pill from '@material-symbols/svg-400/rounded/pill.svg';
import prescriptions from '@material-symbols/svg-400/rounded/prescriptions.svg';
import eventRepeat from '@material-symbols/svg-400/rounded/event_repeat.svg';
import eventBusy from '@material-symbols/svg-400/rounded/event_busy.svg';
import snooze from '@material-symbols/svg-400/rounded/snooze.svg';
import schedule from '@material-symbols/svg-400/rounded/schedule.svg';
import notifications from '@material-symbols/svg-400/rounded/notifications.svg';
import notificationsOff from '@material-symbols/svg-400/rounded/notifications_off.svg';
import alarm from '@material-symbols/svg-400/rounded/alarm.svg';
import backup from '@material-symbols/svg-400/rounded/settings_backup_restore.svg';
import checkCircle from '@material-symbols/svg-400/rounded/check_circle.svg';
import skipNext from '@material-symbols/svg-400/rounded/skip_next.svg';
import del from '@material-symbols/svg-400/rounded/delete.svg';
import add from '@material-symbols/svg-400/rounded/add.svg';
import check from '@material-symbols/svg-400/rounded/check.svg';
import contentCopy from '@material-symbols/svg-400/rounded/content_copy.svg';
import contentPaste from '@material-symbols/svg-400/rounded/content_paste.svg';

const ICONS = { today, todayFill, calendarMonth, calendarMonthFill, history, historyFill, settings, settingsFill, chevronLeft, chevronRight,
  waterDrop, pill, prescriptions, eventRepeat, eventBusy, snooze, schedule, notifications, notificationsOff, alarm, backup,
  checkCircle, skipNext, del, add, check, contentCopy, contentPaste };
const icon = name => ICONS[name].replace('<svg', '<svg class="i" aria-hidden="true" focusable="false"');

const NATIVE = Capacitor.isNativePlatform();
const STORE_KEY = 'diario-yaz';
const CHANNEL = 'promemoria';
const EMPTY = () => ({ blisters: [], lastNo: null, settings: { time: '09:00' } });
const TABS = [['oggi', 'Oggi', 'today'], ['calendario', 'Calendario', 'calendarMonth'], ['storico', 'Storico', 'history'], ['impostazioni', 'Impostazioni', 'settings']];

let state = null;
let ui = { tab: 'oggi', month: null, pickDate: false, dialog: null, delStart: null };
let shownTab = null;
let notif = { display: 'unknown', exact: 'unknown' };

/* ---------- utilità di formato ---------- */
const fmt = (n, o = { weekday: 'short', day: 'numeric', month: 'short' }) => new Date(n * DAY).toLocaleDateString('it-IT', { ...o, timeZone: 'UTC' });
const fmtLong = n => fmt(n, { weekday: 'long', day: 'numeric', month: 'long' });
const rel = (n, t) => n === t ? 'oggi' : n === t + 1 ? 'domani' : n === t - 1 ? 'ieri' : n > t ? `tra ${n - t} giorni` : `${t - n} giorni fa`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = id => document.getElementById(id);

// Con una finestra aperta l'errore va dentro la finestra: tutto il resto della pagina sta sotto lo sfondo scuro.
function showErr(msg) { const e = document.querySelector('dialog[open] .dlg-err') || $('err'); e.textContent = msg || ''; e.hidden = !msg; }
let toastTimer = null;
function toast(msg) {
  const e = $('snackbar'); e.textContent = msg; e.hidden = true; void e.offsetWidth; e.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { e.hidden = true; }, 4500);
}

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
  ui.tab = 'oggi'; ui.dialog = null;
  if (!state || !ANSWER_TEXT[id]) { render(); return; }      // semplice tocco sulla notifica: apre l'app sulla domanda
  const next = applyAnswer(state, id, x.blisterStart, x.date);
  if (!next) { toast('Questa domanda ha già una risposta. Controlla il diario qui sotto.'); render(); return; }
  next.settings = state.settings;
  state = next; persist(); toast(ANSWER_TEXT[id]);
}

/* ---------- azioni ---------- */
const lastB = () => state.blisters[state.blisters.length - 1];
function answer(kind, date) {
  const next = applyAnswer(state, kind, lastB().start, date || localToday());
  if (!next) return showErr('Non riesco a registrare questa risposta. Controlla le date nello storico.');
  next.settings = state.settings; state = next; ui.pickDate = false; persist(); toast(ANSWER_TEXT[kind]);
}
function setTab(tab) { ui.tab = tab; render(); window.scrollTo(0, 0); }
function openDialog(name) { ui.dialog = name; render(); }
function closeDialog() { ui.dialog = null; render(); }

const actions = {
  tab(el) { setTab(el.dataset.tab); },
  async setup() {
    const v = $('setup-date').value;
    if (!v) return showErr('Scegli la data di inizio del blister.');
    if (d2n(v) > d2n(localToday())) return showErr('La data non può essere nel futuro.');
    state.blisters = [{ start: v, placebo: null }]; state.lastNo = null; ui.tab = 'oggi'; persist();
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
  closeDialog,
  addOpen() { openDialog('add'); },
  addSave() {
    const v = $('add-date').value, o = document.querySelector('[name=add-out]:checked').value;
    if (!v) return showErr('Scegli la data di inizio.');
    if (state.blisters.some(b => b.start === v)) return showErr('Esiste già un blister iniziato in quella data.');
    if (d2n(v) > d2n(localToday())) return showErr('La data non può essere nel futuro.');
    state.blisters.push({ start: v, placebo: o === 'placebo' ? true : o === 'skip' ? false : null }); ui.dialog = null; persist();
  },
  del(el) { ui.delStart = el.dataset.start; openDialog('del'); },
  delYes() {
    state.blisters = state.blisters.filter(b => b.start !== ui.delStart); ui.dialog = null;
    const l = lastB(); if (l && l.placebo === false) l.placebo = null;
    persist();
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
  backupOpen() { openDialog('backup'); },
  // Dentro la finestra la snackbar non si vedrebbe: la conferma va sul pulsante stesso.
  async copyBackup(el) {
    const ta = $('backup-out');
    try { await navigator.clipboard.writeText(ta.value); el.innerHTML = icon('check') + 'Copiato'; }
    catch (e) { ta.focus(); ta.select(); el.textContent = 'Tieni premuto il testo e scegli Copia'; }
  },
  importAsk() {
    try { parseBackup($('backup-in').value); $('imp-ask').hidden = true; $('imp-confirm').hidden = false; }
    catch (e) { showErr(e.message); }
  },
  importNo() { $('imp-ask').hidden = false; $('imp-confirm').hidden = true; },
  importYes() {
    try { state = parseBackup($('backup-in').value); ui.dialog = null; persist(); toast('Dati importati.'); }
    catch (e) { showErr(e.message); }
  },
};
function shiftMonth(m, k) { const t = new Date(); let [y, mo] = m || [t.getFullYear(), t.getMonth()]; mo += k; y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12; return [y, mo]; }

document.addEventListener('click', e => {
  if (e.target.id === 'dlg') return closeDialog();      // tocco sullo sfondo scuro fuori dalla finestra
  const el = e.target.closest('[data-a]'); if (!el) return;
  e.preventDefault(); showErr('');
  actions[el.dataset.a] && actions[el.dataset.a](el);
});
document.addEventListener('change', e => {
  if (e.target.id === 'notif-time' && /^\d{2}:\d{2}$/.test(e.target.value)) {
    state.settings.time = e.target.value; persist(); toast('Promemoria alle ' + e.target.value + '.');
  }
});
document.addEventListener('close', e => { if (e.target.id === 'dlg') ui.dialog = null; }, true);   // chiusa con Esc

/* ---------- interfaccia ---------- */
function render() {
  if (!state) return;
  const app = $('app');
  const keep = $('backup-in') ? $('backup-in').value : null;
  const m = compute(state, d2n(localToday()));
  const tab = m ? ui.tab : 'setup';
  const [title, body] = m ? VIEWS[tab](m) : ['Diario Yaz', setupView()];
  document.body.classList.toggle('no-nav', !m);
  $('nav').hidden = !m;
  for (const b of $('nav').children) b.dataset.tab === tab ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current');
  $('top-title').textContent = title;
  app.className = 'screen' + (m ? '' : ' bare') + (tab === 'storico' ? ' has-fab' : '');
  if (tab !== shownTab) { void app.offsetWidth; app.classList.add('enter'); shownTab = tab; }
  app.innerHTML = body + dialogView();
  if (keep !== null && $('backup-in')) $('backup-in').value = keep;
  const d = $('dlg'); if (d) d.showModal();
}

const VIEWS = {
  oggi: m => {
    const head = fmtLong(m.t);
    return [head, pageHead(head, `Giorno ${Math.max(m.day, 1)} del blister iniziato ${fmt(m.last.s)}`) + askView(m) + skipView(m) + todayView(m) + nextView(m)];
  },
  calendario: m => ['Calendario', pageHead('Calendario') + calendarView(m) + periodsView(m)],
  storico: () => ['Storico', pageHead('Storico') + historyView()],
  impostazioni: m => ['Impostazioni', pageHead('Impostazioni') + settingsView(m)
    + '<p class="note-text">Il ciclo previsto è il giorno della quarta placebo (giorno 28 del blister). Se salti le placebo e inizi subito un nuovo blister, il conteggio riparte da quel giorno e quel mese il ciclo salta. Le previsioni non sostituiscono le indicazioni del medico o del foglietto illustrativo.</p>'],
};

function pageHead(title, sub) {
  return `<div class="page-head"><h1 class="headline-l">${title}</h1>${sub ? `<p class="body-l muted">${sub}</p>` : ''}</div>`;
}

function buildNav() {
  $('nav').innerHTML = TABS.map(([id, label, ic]) => `<button class="nav-item" data-a="tab" data-tab="${id}">
    <span class="nav-ind"><span class="off">${icon(ic)}</span><span class="on">${icon(ic + 'Fill')}</span></span>
    <span class="nav-label label-m">${label}</span></button>`).join('');
}

function setupView() {
  return `<section class="setup">
    <div class="setup-mark">${icon('pill')}</div>
    <div class="page-head" style="padding:0"><h1 class="headline-l">Diario Yaz</h1><p class="body-l muted">Per il blister da 24 compresse attive e 4 placebo.</p></div>
    <div class="card">
      <h2 class="title-l">Quando hai preso la prima compressa del blister attuale?</h2>
      <p class="body-m muted">Da questa data calcolo il giorno delle placebo, il prossimo blister e il ciclo previsto.</p>
      <label class="field"><span>Data della prima compressa</span><input type="date" class="input" id="setup-date" max="${localToday()}"></label>
      <button class="btn filled m wide" data-a="setup">Inizia il diario</button>
    </div>
    <button class="btn text" data-a="backupOpen">Ho un backup da ripristinare</button>
  </section>`;
}

function askView(m) {
  const q = m.q; if (!q) return '';
  if (q.type === 'placebo') {
    const late = q.day > 25;
    return `<section class="card ask" aria-label="Domanda di oggi">
      <div class="ask-tag label-l">${icon('pill')}${late ? `Giorno 25 · ${fmt(m.last.s + 24)}` : 'Oggi è il giorno 25'}</div>
      <h2>${late ? 'Il giorno 25 hai cominciato le placebo oppure un nuovo blister?' : 'Oggi cominci a prendere le placebo oppure cominci un nuovo blister?'}</h2>
      <p>Con le placebo il ciclo è previsto ${fmtLong(m.last.s + 27)}. Con un blister nuovo salti il ciclo di questo mese e il conteggio riparte da ${late ? fmt(m.last.s + 24) : 'oggi'}: il prossimo ciclo sarebbe ${fmtLong(m.last.s + 24 + 27)}.</p>
      <div class="actions"><button class="btn filled m" data-a="placebo">Placebo</button><button class="btn outlined m" data-a="skip">Blister nuovo</button></div>
    </section>`;
  }
  if (q.type === 'blister') {
    const extra = q.late > 0 ? `<p>Il nuovo blister era previsto ${fmt(m.nominalNext)} (${q.late === 1 ? '1 giorno fa' : q.late + ' giorni fa'}).</p>` : '';
    const picker = ui.pickDate
      ? `<div class="row pick"><label class="field"><span>Data di inizio</span><input type="date" class="input" id="pick-date" min="${n2d(m.last.s + 24)}" max="${localToday()}"></label><button class="btn filled m" data-a="pickSave">Salva</button></div>`
      : '<button class="btn text" data-a="pick">L\'ho iniziato un altro giorno</button>';
    return `<section class="card ask" aria-label="Domanda di oggi">
      <div class="ask-tag label-l">${icon('eventRepeat')}Inizio blister</div>
      <h2>Hai cominciato un nuovo blister oggi?</h2>${extra}
      <div class="actions"><button class="btn filled m" data-a="yes">Sì</button><button class="btn outlined m" data-a="no">No</button></div>
      ${picker}
    </section>`;
  }
  if (q.type === 'snoozed') {
    return `<section class="card notice soft"><span class="av neutral">${icon('snooze')}</span>
      <p class="body-m grow">Ok, nessun blister nuovo oggi. Te lo richiedo domani.</p>
      <button class="btn tonal" data-a="yes">L'ho appena iniziato</button></section>`;
  }
  return '';
}

function skipView(m) {
  const s = m.skipNote; if (!s) return '';
  const head = s.skipped > m.t ? 'Questo mese salti il ciclo'
    : s.skipped === m.t ? 'Oggi avresti avuto il ciclo: questo mese lo salti'
      : 'Questo mese hai saltato il ciclo';
  return `<section class="card notice" role="status">${icon('eventBusy')}<div>
    <h2 class="title-m">${head}</h2>
    <p class="body-m">Hai iniziato il blister nuovo ${fmtLong(m.last.s)} al posto della prima placebo, quindi il ciclo previsto ${fmtLong(s.skipped)} non arriva.${s.next ? ` Se questa volta prendi le placebo, il prossimo ciclo è previsto ${fmtLong(s.next.n)}.` : ''}</p>
  </div></section>`;
}

function todayView(m) {
  const { phase, last, day } = m;
  const count = (n, of) => `<div class="count" role="img" aria-label="${n} di ${of}"><span class="display">${n}</span><span class="of">/${of}</span></div>`;
  let big, title, sub;
  if (phase.kind === 'active') {
    big = count(phase.pill, 24); title = 'Compressa attiva';
    sub = phase.pill === 24 ? 'Ultima attiva: domani tocca alle placebo o a un blister nuovo.' : `${24 - phase.pill} attive rimanenti in questo blister.`;
  } else if (phase.kind === 'placebo') {
    big = count(phase.pill - 24, 4); title = 'Placebo';
    sub = phase.pill === 28 ? 'Oggi è il giorno previsto del ciclo.' : `Ciclo previsto ${fmtLong(last.s + 27)}.`;
  } else {
    big = `<span class="wait">${icon('eventRepeat')}</span>`; title = 'Tra un blister e l\'altro';
    sub = phase.late > 0 ? `Il nuovo blister era previsto ${fmt(m.nominalNext)}.` : 'Oggi inizia il nuovo blister.';
  }
  const pills = Array.from({ length: 28 }, (_, i) => {
    const n = i + 1, isPl = n > 24;
    const cls = ['pill', isPl ? 'pl' : '', n < day ? 'taken' : '', n === day ? 'now' : '', isPl && last.p === false ? 'skip' : '', n === 28 && last.p !== false && n !== day ? 'flow' : ''].join(' ');
    return `<span class="${cls}">${n}</span>`;
  }).join('');
  return `<section class="card hero">
    <div class="hero-row">${big}<div><h2 class="title-l">${title}</h2><p class="body-m muted">${sub}</p></div></div>
    <div class="blister" role="img" aria-label="Blister attuale: 24 compresse attive e 4 placebo, oggi giorno ${Math.max(day, 1)}">${pills}</div>
  </section>`;
}

function nextView(m) {
  const { last, day, t } = m;
  const nextPeriod = m.periods.find(p => p.n >= t && !p.skipped);
  const items = [
    nextPeriod && [nextPeriod.n, 'waterDrop', 'primary', 'Ciclo previsto', nextPeriod.tentative ? 'se prendi le placebo' : ''],
    [(last.p !== false && day < 25) ? last.s + 24 : m.proj[0].s + 24, 'pill', '', 'Prime placebo', 'giorno 25'],
    [m.nextStart, 'eventRepeat', '', 'Prossimo blister', last.p === null && day <= 28 ? 'dopo le placebo' : ''],
    [nextRx(state, m), 'prescriptions', 'neutral', 'Ricetta dal medico', 'chiedila al medico di base'],
  ].filter(Boolean).sort((a, b) => a[0] - b[0]);
  return `<section class="card"><h2 class="title-m">Prossime date</h2><ul class="list">${items.map(([n, ic, tone, head, extra]) =>
    `<li class="li"><span class="av ${tone}">${icon(ic)}</span><div><div class="li-h">${head}</div><div class="li-s">${fmt(n)}${extra ? ', ' + extra : ''}</div></div><span class="li-t">${rel(n, t)}</span></li>`).join('')}</ul></section>`;
}

function calendarView(m) {
  const now = new Date();
  const [y, mo] = ui.month || [now.getFullYear(), now.getMonth()];
  const map = buildMap(m);
  const first = d2n(`${y}-${String(mo + 1).padStart(2, '0')}-01`);
  const daysIn = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  const lead = (new Date(first * DAY).getUTCDay() + 6) % 7;
  const title = new Date(first * DAY).toLocaleDateString('it-IT', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const away = y !== now.getFullYear() || mo !== now.getMonth();
  let cells = ['L', 'M', 'M', 'G', 'V', 'S', 'D'].map(d => `<div class="dow" aria-hidden="true">${d}</div>`).join('');
  for (let i = 0; i < lead; i++) cells += '<div></div>';
  for (let k = 0; k < daysIn; k++) {
    const n = first + k, info = map.get(n), col = (lead + k) % 7;
    const cls = ['d'];
    let tip = fmtLong(n), mark = false;
    if (info) {
      if (info.kind === 'gap') { cls.push('gap'); tip += ', nessun blister registrato'; }
      else {
        // fascia continua per i giorni dello stesso tipo, arrotondata dove cambia tipo, blister o settimana
        const prev = map.get(n - 1), next = map.get(n + 1);
        cls.push(info.kind);
        if (col === 0 || k === 0 || info.start || !prev || prev.kind !== info.kind) cls.push('bs');
        if (col === 6 || k === daysIn - 1 || !next || next.kind !== info.kind || next.start) cls.push('be');
        if (info.period) cls.push('period');
        tip += info.period ? ', ciclo previsto' : info.kind === 'placebo' ? `, placebo ${info.day - 24}` : `, attiva ${info.day}`;
        if (info.start) { mark = true; tip += ', inizio blister'; }
        if (info.skipend) { mark = true; cls.push('skipend'); tip += ', placebo saltate'; }
      }
      if (info.skippedPeriod) { cls.push('skipped'); tip += ', ciclo saltato questo mese'; }
      if (info.proj) cls.push('proj');
    }
    if (n === m.t) { cls.push('today'); tip += ', oggi'; }
    cells += `<div class="${cls.join(' ')}" role="img" aria-label="${esc(tip)}"><span class="n">${k + 1}</span>${mark ? '<i class="mk"></i>' : ''}</div>`;
  }
  return `<section class="card">
    <div class="card-head cal-head"><h2 class="title-l">${title}</h2>
      <div class="row" style="gap:0">${away ? '<button class="btn text" data-a="monthToday">Oggi</button>' : ''}<button class="icon-btn" data-a="monthPrev" aria-label="Mese precedente">${icon('chevronLeft')}</button><button class="icon-btn" data-a="monthNext" aria-label="Mese successivo">${icon('chevronRight')}</button></div>
    </div>
    <div class="cal">${cells}</div>
    <div class="legend">
      <span><i class="a"></i>Attiva</span><span><i class="p"></i>Placebo</span>
      <span><i class="dot c"></i>Ciclo</span><span><i class="dot cp"></i>Ciclo previsto</span>
      <span><i class="mk st"></i>Inizio blister</span><span><i class="mk ps"></i>Placebo saltate</span>
      <span><i class="dot cs"></i>Ciclo saltato</span>
    </div>
  </section>`;
}

function periodsView(m) {
  const up = m.periods.filter(p => p.n >= m.t).slice(0, 6);
  return `<section class="card"><div><h2 class="title-m">Prossimi cicli</h2><p class="body-m muted">Se prendi tutte le placebo.</p></div><ul class="list">${up.map(p => {
    const [ic, tone, sub] = p.skipped ? ['eventBusy', 'tertiary', 'Placebo saltate, niente ciclo']
      : p.current ? ['waterDrop', 'primary', p.tentative ? 'Blister in corso, da confermare il giorno 25' : 'Blister in corso, placebo confermate']
        : ['waterDrop', '', ''];
    return `<li class="li"><span class="av ${tone}">${icon(ic)}</span><div><div class="li-h">${fmtLong(p.n)}</div>${sub ? `<div class="li-s">${sub}</div>` : ''}</div><span class="li-t">${rel(p.n, m.t)}</span></li>`;
  }).join('')}</ul></section>`;
}

function historyView() {
  const rows = [...state.blisters].reverse().map(b => {
    const s = d2n(b.start);
    const [ic, tone, sub] = b.placebo === true ? ['checkCircle', '', `Placebo prese · ciclo ${fmt(s + 27)}`]
      : b.placebo === false ? ['skipNext', 'tertiary', `Placebo saltate · ciclo saltato ${fmt(s + 27)}`]
        : ['pill', 'primary', `In corso · ciclo previsto ${fmt(s + 27)}`];
    return `<li class="li"><span class="av ${tone}">${icon(ic)}</span>
      <div><div class="li-h">${fmt(s, { day: 'numeric', month: 'long', year: 'numeric' })}</div><div class="li-s">${sub}</div></div>
      <button class="icon-btn" data-a="del" data-start="${b.start}" aria-label="Elimina il blister del ${fmt(s)}">${icon('del')}</button></li>`;
  }).join('');
  return `<section class="card"><ul class="list">${rows}</ul></section>
    <button class="fab" data-a="addOpen">${icon('add')}Aggiungi</button>`;
}

function settingsView(m) {
  const item = (ic, tone, head, sub, ctl) => `<li class="li"><span class="av ${tone}">${icon(ic)}</span><div><div class="li-h">${head}</div><div class="li-s">${sub}</div></div>${ctl || '<span></span>'}</li>`;
  const granted = notif.display === 'granted';
  const rx = nextRx(state, m);
  return `<section class="card"><ul class="list">
    ${item('schedule', '', 'Orario dei promemoria', 'Ogni notifica arriva a quest\'ora nel giorno giusto.', `<input type="time" class="time" id="notif-time" value="${esc(state.settings.time)}" aria-label="Orario dei promemoria">`)}
    ${!NATIVE ? item('notificationsOff', 'neutral', 'Notifiche', 'Disponibili solo nell\'app installata sul telefono.')
      : granted ? item('notifications', '', 'Notifiche', '<span class="status-ok">Attive</span>. Inizio blister, giorno 25, ciclo e ricetta.', '<button class="btn tonal" data-a="testNotif">Prova</button>')
        : item('notificationsOff', 'neutral', 'Notifiche', '<span class="status-off">Disattivate</span>. Senza permesso non posso avvisarti.', '<button class="btn filled" data-a="notifOn">Attiva</button>')}
    ${NATIVE && granted && notif.exact !== 'granted' && notif.exact !== 'unknown' ? item('alarm', '', 'Orario esatto', 'Senza questo permesso Android può ritardare i promemoria di qualche minuto.', '<button class="btn tonal" data-a="exactOn">Consenti</button>') : ''}
    ${item('prescriptions', '', 'Ricetta dal medico', `Ogni due blister. Prossimo promemoria ${fmt(rx)}, ${rel(rx, m.t)}.`, '<button class="btn outlined" data-a="rxShift" aria-label="Sposta il promemoria della ricetta al blister accanto">Sposta</button>')}
    ${item('backup', '', 'Backup', 'I dati restano su questo telefono. Il backup serve per spostarli su un altro.', '<button class="btn outlined" data-a="backupOpen">Apri</button>')}
  </ul></section>`;
}

function dialogView() {
  if (ui.dialog === 'add') {
    const opts = [['placebo', 'Prese'], ['skip', 'Saltate'], ['open', 'Non ancora']];
    return `<dialog id="dlg" class="sheet" aria-labelledby="dlg-t"><div><div class="handle"></div><div class="dlg-body">
      <h2 id="dlg-t" class="headline-s">Aggiungi un blister</h2>
      <label class="field"><span>Data della prima compressa</span><input type="date" class="input" id="add-date" max="${localToday()}"></label>
      <fieldset class="seg"><legend>Placebo</legend><div class="seg-row">${opts.map(([v, l], i) =>
        `<label><input type="radio" name="add-out" value="${v}"${i ? '' : ' checked'}><span class="seg-in">${icon('check')}${l}</span></label>`).join('')}</div></fieldset>
      <p class="dlg-err" hidden></p>
      <div class="actions-end"><button class="btn text" data-a="closeDialog">Annulla</button><button class="btn filled" data-a="addSave">Aggiungi</button></div>
    </div></div></dialog>`;
  }
  if (ui.dialog === 'del') {
    return `<dialog id="dlg" class="dlg" aria-labelledby="dlg-t"><div class="dlg-body">
      <h2 id="dlg-t" class="headline-s">Eliminare il blister?</h2>
      <p class="body-m muted">Il blister iniziato ${fmtLong(d2n(ui.delStart))} sparisce dallo storico e le date previste vengono ricalcolate.</p>
      <div class="actions-end"><button class="btn text" data-a="closeDialog">Annulla</button><button class="btn text" data-a="delYes">Elimina</button></div>
    </div></dialog>`;
  }
  if (ui.dialog === 'backup') {
    const out = state.blisters.length ? `<p class="body-m muted">Copia questo testo e conservalo: ti serve per ripristinare i dati su un altro telefono.</p>
      <textarea id="backup-out" class="input" readonly aria-label="Backup dei dati">${esc(JSON.stringify(state))}</textarea>
      <div class="row"><button class="btn tonal" data-a="copyBackup">${icon('contentCopy')}Copia</button></div>
      <h3 class="title-m">Ripristina</h3>` : '';
    return `<dialog id="dlg" class="sheet" aria-labelledby="dlg-t"><div><div class="handle"></div><div class="dlg-body">
      <h2 id="dlg-t" class="headline-s">Backup</h2>${out}
      <p class="body-m muted">Incolla qui un backup. I dati attuali vengono sostituiti.</p>
      <textarea id="backup-in" class="input" aria-label="Incolla un backup" placeholder='{"blisters":[...]}'></textarea>
      <p class="dlg-err" hidden></p>
      <div class="row" id="imp-ask"><button class="btn outlined" data-a="importAsk">${icon('contentPaste')}Importa</button></div>
      <div class="row" id="imp-confirm" hidden><span class="body-m grow">Sostituire i dati attuali?</span><button class="btn text" data-a="importNo">Annulla</button><button class="btn filled" data-a="importYes">Sostituisci</button></div>
      <div class="actions-end"><button class="btn text" data-a="closeDialog">Chiudi</button></div>
    </div></div></dialog>`;
  }
  return '';
}

/* ---------- avvio ---------- */
async function boot() {
  buildNav();
  state = await load();
  await setupNotifications();
  render();
  reschedule();
  if (NATIVE) {
    App.addListener('resume', async () => { await refreshPermissions(); render(); reschedule(); });
    // Indietro di Android: chiude la finestra aperta, poi torna a Oggi, poi riduce l'app
    App.addListener('backButton', () => {
      if (ui.dialog) return closeDialog();
      if (ui.tab !== 'oggi' && state.blisters.length) return setTab('oggi');
      App.minimizeApp();
    });
  }
  let shownDay = localToday();
  setInterval(() => { if (localToday() !== shownDay) { shownDay = localToday(); render(); reschedule(); } }, 60000);
}
boot();
