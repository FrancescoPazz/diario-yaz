// Diario Yaz — interfaccia Material 3, salvataggio sul telefono e promemoria.
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { LocalNotifications } from '@capacitor/local-notifications';
import { App } from '@capacitor/app';
import { DAY, d2n, n2d, localToday, compute, buildMap, planNotifications, applyAnswer, parseBackup, nextRx, shiftRx } from './logic.js';
import { strings, pickLang } from './i18n.js';

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
import translate from '@material-symbols/svg-400/rounded/translate.svg';
import checkCircle from '@material-symbols/svg-400/rounded/check_circle.svg';
import skipNext from '@material-symbols/svg-400/rounded/skip_next.svg';
import del from '@material-symbols/svg-400/rounded/delete.svg';
import add from '@material-symbols/svg-400/rounded/add.svg';
import check from '@material-symbols/svg-400/rounded/check.svg';
import contentCopy from '@material-symbols/svg-400/rounded/content_copy.svg';
import contentPaste from '@material-symbols/svg-400/rounded/content_paste.svg';

const ICONS = { today, todayFill, calendarMonth, calendarMonthFill, history, historyFill, settings, settingsFill, chevronLeft, chevronRight,
  waterDrop, pill, prescriptions, eventRepeat, eventBusy, snooze, schedule, notifications, notificationsOff, alarm, backup, translate,
  checkCircle, skipNext, del, add, check, contentCopy, contentPaste };
const icon = name => ICONS[name].replace('<svg', '<svg class="i" aria-hidden="true" focusable="false"');

const NATIVE = Capacitor.isNativePlatform();
const STORE_KEY = 'diario-yaz';
const CHANNEL = 'promemoria';
const EMPTY = () => ({ blisters: [], lastNo: null, settings: { time: '09:00', rx: null, lang: 'auto' } });
const TABS = [['oggi', 'today'], ['calendario', 'calendarMonth'], ['storico', 'history'], ['impostazioni', 'settings']];

let state = null;
let T = strings(pickLang('auto', navigator.language));
let ui = { tab: 'oggi', month: null, calDay: null, pickDate: false, dialog: null, delStart: null };
let shownTab = null;
let notif = { display: 'unknown', exact: 'unknown' };

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = id => document.getElementById(id);

// Con una finestra aperta l'errore va dentro la finestra: tutto il resto della pagina sta sotto lo sfondo scuro.
function showErr(msg) { const e = document.querySelector('dialog[open] .dlg-err') || $('err'); e.textContent = msg || ''; e.hidden = !msg; }
let toastTimer = null;
function toast(msg) {
  const e = $('snackbar'); e.textContent = msg; e.hidden = true; void e.offsetWidth; e.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { e.hidden = true; }, 4500);
}

function applyLang() {
  T = strings(pickLang(state.settings.lang, navigator.language));
  document.documentElement.lang = T.lang;
  buildNav();
}

/* ---------- salvataggio sul dispositivo ---------- */
async function load() {
  try {
    const { value } = await Preferences.get({ key: STORE_KEY });
    if (!value) return EMPTY();
    const d = JSON.parse(value), s = d.settings || {};
    return { blisters: Array.isArray(d.blisters) ? d.blisters : [], lastNo: d.lastNo || null, settings: { time: s.time || '09:00', rx: s.rx || null, lang: s.lang || 'auto' } };
  } catch (e) {
    showErr(T.err.load);
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
    .catch(() => showErr(T.err.save))
    .then(() => reschedule());
}

/* ---------- promemoria (notifiche locali) ---------- */
// Canale e pulsanti delle notifiche portano testi: si registrano di nuovo quando cambia la lingua.
async function registerNotificationTexts() {
  if (!NATIVE) return;
  try {
    await LocalNotifications.createChannel({ id: CHANNEL, name: T.channelName, description: T.channelDesc, importance: 4, visibility: 1, vibration: true });
    await LocalNotifications.registerActionTypes({ types: [
      { id: 'PLACEBO', actions: [{ id: 'placebo', title: T.btnPlacebo }, { id: 'skip', title: T.btnNewPack }] },
      { id: 'BLISTER', actions: [{ id: 'yes', title: T.yes }, { id: 'no', title: T.no }] },
    ] });
  } catch (e) { /* le notifiche restano disattivate, l'app funziona comunque */ }
}

async function setupNotifications() {
  if (!NATIVE) return;
  await registerNotificationTexts();
  try { await LocalNotifications.addListener('localNotificationActionPerformed', onNotificationAction); } catch (e) { /* nulla */ }
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
  if (notif.display !== 'granted') showErr(T.err.notifOff);
  await reschedule();
  render();
}

// Con isExactNotification a true (predefinito) il plugin apre la pagina "Sveglie e promemoria" a ogni schedule()
// finché il permesso manca: lo si chiede solo se c'è già. Per concederlo c'è "Consenti" nelle Impostazioni dell'app.
const exact = () => notif.exact === 'granted';

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
  await LocalNotifications.schedule({ notifications: list.map(({ p, at }) => {
    const [title, body] = T.msg[p.kind](p);
    return {
      id: p.id, title, body, largeBody: body,
      channelId: CHANNEL, actionTypeId: p.actionTypeId, smallIcon: 'ic_stat_notify', iconColor: '#A92D58', isExactNotification: exact(),
      extra: { kind: p.kind, date: n2d(p.n), blisterStart: p.blisterStart },
      schedule: { at, allowWhileIdle: true },
    };
  }) });
}

function onNotificationAction(ev) {
  const id = ev.actionId, x = (ev.notification && ev.notification.extra) || {};
  ui.tab = 'oggi'; ui.dialog = null;
  if (!state || !T.answered[id]) { render(); return; }      // semplice tocco sulla notifica: apre l'app sulla domanda
  const next = applyAnswer(state, id, x.blisterStart, x.date);
  if (!next) { toast(T.alreadyAnswered); render(); return; }
  next.settings = state.settings;
  state = next; persist(); toast(T.answered[id]);
}

/* ---------- azioni ---------- */
const lastB = () => state.blisters[state.blisters.length - 1];
function answer(kind, date) {
  const next = applyAnswer(state, kind, lastB().start, date || localToday());
  if (!next) return showErr(T.err.answer);
  next.settings = state.settings; state = next; ui.pickDate = false; persist(); toast(T.answered[kind]);
}
function setTab(tab) { ui.tab = tab; render(); window.scrollTo(0, 0); }
function openDialog(name) { ui.dialog = name; render(); }
function closeDialog() { ui.dialog = null; render(); }

const actions = {
  tab(el) { setTab(el.dataset.tab); },
  async setup() {
    const v = $('setup-date').value;
    if (!v) return showErr(T.err.setupDate);
    if (d2n(v) > d2n(localToday())) return showErr(T.err.future);
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
    if (!v) return showErr(T.err.pickDate);
    if (d2n(v) > d2n(localToday())) return showErr(T.err.future);
    if (d2n(v) <= d2n(lastB().start) + 23) return showErr(T.err.after24);
    answer('yes', v);
  },
  monthPrev() { ui.month = shiftMonth(ui.month, -1); ui.calDay = null; render(); },
  monthNext() { ui.month = shiftMonth(ui.month, 1); ui.calDay = null; render(); },
  monthToday() { ui.month = null; ui.calDay = null; render(); },
  calDay(el) { ui.calDay = Number(el.dataset.n); render(); },
  closeDialog,
  addOpen() { openDialog('add'); },
  addSave() {
    const v = $('add-date').value, o = document.querySelector('[name=add-out]:checked').value;
    if (!v) return showErr(T.err.addDate);
    if (state.blisters.some(b => b.start === v)) return showErr(T.err.dup);
    if (d2n(v) > d2n(localToday())) return showErr(T.err.future);
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
      await LocalNotifications.schedule({ notifications: [{ id: 999999, title: 'Diario Yaz', body: T.testBody(state.settings.time), channelId: CHANNEL, smallIcon: 'ic_stat_notify', iconColor: '#A92D58', isExactNotification: exact(), schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true } }] });
      toast(T.testIn5);
    } catch (e) { showErr(T.err.test); }
  },
  backupOpen() { openDialog('backup'); },
  // Dentro la finestra la snackbar non si vedrebbe: la conferma va sul pulsante stesso.
  async copyBackup(el) {
    const ta = $('backup-out');
    try { await navigator.clipboard.writeText(ta.value); el.innerHTML = icon('check') + T.copied; }
    catch (e) { ta.focus(); ta.select(); el.textContent = T.copyManual; }
  },
  importAsk() {
    try { parseBackup($('backup-in').value); $('imp-ask').hidden = true; $('imp-confirm').hidden = false; }
    catch (e) { showErr(T.backupErr[e.message] || T.backupErr.json); }
  },
  importNo() { $('imp-ask').hidden = false; $('imp-confirm').hidden = true; },
  importYes() {
    try { state = parseBackup($('backup-in').value); ui.dialog = null; applyLang(); registerNotificationTexts(); persist(); toast(T.imported); }
    catch (e) { showErr(T.backupErr[e.message] || T.backupErr.json); }
  },
};
function shiftMonth(m, k) { const t = new Date(); let [y, mo] = m || [t.getFullYear(), t.getMonth()]; mo += k; y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12; return [y, mo]; }

document.addEventListener('click', e => {
  if (e.target.id === 'dlg') return closeDialog();      // tocco sullo sfondo scuro fuori dalla finestra
  const el = e.target.closest('[data-a]'); if (!el) return;
  e.preventDefault(); showErr('');
  actions[el.dataset.a] && actions[el.dataset.a](el);
});
document.addEventListener('change', async e => {
  if (e.target.id === 'notif-time' && /^\d{2}:\d{2}$/.test(e.target.value)) {
    state.settings.time = e.target.value; persist(); toast(T.remindAt(e.target.value));
  }
  if (e.target.id === 'lang') {
    state.settings.lang = e.target.value; applyLang();
    await registerNotificationTexts(); persist();     // persist riprogramma le notifiche con i nuovi testi
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
    const head = T.fmtLong(m.t);
    return [head, pageHead(head, T.dayOf(Math.max(m.day, 1), T.fmt(m.last.s))) + askView(m) + skipView(m) + todayView(m) + nextView(m)];
  },
  calendario: m => [T.tabs.calendario, pageHead(T.tabs.calendario) + calendarView(m) + periodsView(m)],
  storico: () => [T.tabs.storico, pageHead(T.tabs.storico) + historyView()],
  impostazioni: m => [T.tabs.impostazioni, pageHead(T.tabs.impostazioni) + settingsView(m) + `<p class="note-text">${T.note}</p>`],
};

function pageHead(title, sub) {
  return `<div class="page-head"><h1 class="headline-l">${title}</h1>${sub ? `<p class="body-l muted">${sub}</p>` : ''}</div>`;
}

function buildNav() {
  $('nav').innerHTML = TABS.map(([id, ic]) => `<button class="nav-item" data-a="tab" data-tab="${id}">
    <span class="nav-ind"><span class="off">${icon(ic)}</span><span class="on">${icon(ic + 'Fill')}</span></span>
    <span class="nav-label label-m">${T.tabs[id]}</span></button>`).join('');
}

function setupView() {
  return `<section class="setup">
    <div class="setup-mark">${icon('pill')}</div>
    <div class="page-head" style="padding:0"><h1 class="headline-l">Diario Yaz</h1><p class="body-l muted">${T.setupSub}</p></div>
    <div class="card">
      <h2 class="title-l">${T.setupQ}</h2>
      <p class="body-m muted">${T.setupWhy}</p>
      <label class="field"><span>${T.firstPill}</span><input type="date" class="input" id="setup-date" max="${localToday()}"></label>
      <button class="btn filled m wide" data-a="setup">${T.start}</button>
    </div>
    <button class="btn text" data-a="backupOpen">${T.haveBackup}</button>
  </section>`;
}

function askView(m) {
  const q = m.q; if (!q) return '';
  if (q.type === 'placebo') {
    const late = q.day > 25;
    return `<section class="card ask" aria-label="${T.askLabel}">
      <div class="ask-tag label-l">${icon('pill')}${late ? T.day25On(T.fmt(m.last.s + 24)) : T.day25Today}</div>
      <h2>${late ? T.placeboQLate : T.placeboQ}</h2>
      <p>${T.placeboWhy(T.fmtLong(m.last.s + 27), late ? T.fmt(m.last.s + 24) : null, T.fmtLong(m.last.s + 24 + 27))}</p>
      <div class="actions"><button class="btn filled m" data-a="placebo">${T.btnPlacebo}</button><button class="btn outlined m" data-a="skip">${T.btnNewPack}</button></div>
    </section>`;
  }
  if (q.type === 'blister') {
    const extra = q.late > 0 ? `<p>${T.packLate(T.fmt(m.nominalNext), T.rel(m.nominalNext, m.t))}</p>` : '';
    const picker = ui.pickDate
      ? `<div class="row pick"><label class="field"><span>${T.startDate}</span><input type="date" class="input" id="pick-date" min="${n2d(m.last.s + 24)}" max="${localToday()}"></label><button class="btn filled m" data-a="pickSave">${T.save}</button></div>`
      : `<button class="btn text" data-a="pick">${T.otherDay}</button>`;
    return `<section class="card ask" aria-label="${T.askLabel}">
      <div class="ask-tag label-l">${icon('eventRepeat')}${T.packStart}</div>
      <h2>${T.packQ}</h2>${extra}
      <div class="actions"><button class="btn filled m" data-a="yes">${T.yes}</button><button class="btn outlined m" data-a="no">${T.no}</button></div>
      ${picker}
    </section>`;
  }
  if (q.type === 'snoozed') {
    return `<section class="card notice soft"><span class="av neutral">${icon('snooze')}</span>
      <p class="body-m grow">${T.snoozed}</p>
      <button class="btn tonal" data-a="yes">${T.justStarted}</button></section>`;
  }
  return '';
}

function skipView(m) {
  const s = m.skipNote; if (!s) return '';
  const head = s.skipped > m.t ? T.skipFuture : s.skipped === m.t ? T.skipToday : T.skipPast;
  return `<section class="card notice" role="status">${icon('eventBusy')}<div>
    <h2 class="title-m">${head}</h2>
    <p class="body-m">${T.skipWhy(T.fmtLong(m.last.s), T.fmtLong(s.skipped), s.next && T.fmtLong(s.next.n))}</p>
  </div></section>`;
}

function todayView(m) {
  const { phase, last, day } = m;
  const count = (n, of) => `<div class="count" role="img" aria-label="${T.of(n, of)}"><span class="display">${n}</span><span class="of">/${of}</span></div>`;
  let big, title, sub;
  if (phase.kind === 'active') {
    big = count(phase.pill, 24); title = T.active;
    sub = phase.pill === 24 ? T.lastActive : T.activeLeft(24 - phase.pill);
  } else if (phase.kind === 'placebo') {
    big = count(phase.pill - 24, 4); title = T.placebo;
    sub = phase.pill === 28 ? T.periodToday : T.periodOn(T.fmtLong(last.s + 27));
  } else {
    big = `<span class="wait">${icon('eventRepeat')}</span>`; title = T.between;
    sub = phase.late > 0 ? T.packWas(T.fmt(m.nominalNext)) : T.packToday;
  }
  const pills = Array.from({ length: 28 }, (_, i) => {
    const n = i + 1, isPl = n > 24;
    const cls = ['pill', isPl ? 'pl' : '', n < day ? 'taken' : '', n === day ? 'now' : '', isPl && last.p === false ? 'skip' : '', n === 28 && last.p !== false && n !== day ? 'flow' : ''].join(' ');
    return `<span class="${cls}">${n}</span>`;
  }).join('');
  return `<section class="card hero">
    <div class="hero-row">${big}<div><h2 class="title-l">${title}</h2><p class="body-m muted">${sub}</p></div></div>
    <div class="blister" role="img" aria-label="${T.packAria(Math.max(day, 1))}">${pills}</div>
  </section>`;
}

function nextView(m) {
  const { last, day, t } = m;
  const nextPeriod = m.periods.find(p => p.n >= t && !p.skipped);
  const items = [
    nextPeriod && [nextPeriod.n, 'waterDrop', 'primary', T.expectedPeriod, nextPeriod.tentative ? T.ifPlacebo : ''],
    [(last.p !== false && day < 25) ? last.s + 24 : m.proj[0].s + 24, 'pill', '', T.firstPlacebo, T.day25],
    [m.nextStart, 'eventRepeat', '', T.nextPack, last.p === null && day <= 28 ? T.afterPlacebo : ''],
    [nextRx(state, m), 'prescriptions', 'neutral', T.rx, T.rxAsk],
  ].filter(Boolean).sort((a, b) => a[0] - b[0]);
  return `<section class="card"><h2 class="title-m">${T.upcoming}</h2><ul class="list">${items.map(([n, ic, tone, head, extra]) =>
    `<li class="li"><span class="av ${tone}">${icon(ic)}</span><div><div class="li-h">${head}</div><div class="li-s">${T.fmt(n)}${extra ? ', ' + extra : ''}</div></div><span class="li-t">${T.rel(n, t)}</span></li>`).join('')}</ul></section>`;
}

function calendarView(m) {
  const now = new Date();
  const [y, mo] = ui.month || [now.getFullYear(), now.getMonth()];
  const map = buildMap(m);
  const first = d2n(`${y}-${String(mo + 1).padStart(2, '0')}-01`);
  const daysIn = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  const lead = (new Date(first * DAY).getUTCDay() + 6) % 7;
  const away = y !== now.getFullYear() || mo !== now.getMonth();
  const C = T.cal;
  const sel = ui.calDay !== null && ui.calDay >= first && ui.calDay < first + daysIn ? ui.calDay
    : (first <= m.t && m.t < first + daysIn ? m.t : null);
  let detail = null;
  let cells = T.weekdays.map(d => `<div class="dow" aria-hidden="true">${d}</div>`).join('');
  for (let i = 0; i < lead; i++) cells += '<div></div>';
  for (let k = 0; k < daysIn; k++) {
    const n = first + k, info = map.get(n), col = (lead + k) % 7;
    const cls = ['d'], tip = [T.fmtLong(n)];
    let mark = false;
    if (info) {
      if (info.kind === 'gap') { cls.push('gap'); tip.push(C.noPack); }
      else {
        // fascia continua per i giorni dello stesso tipo, arrotondata dove cambia tipo, blister, settimana o mese
        const prev = map.get(n - 1), next = map.get(n + 1);
        cls.push(info.kind);
        if (col === 0 || k === 0 || info.start || !prev || prev.kind !== info.kind) cls.push('bs');
        if (col === 6 || k === daysIn - 1 || !next || next.kind !== info.kind || next.start) cls.push('be');
        if (info.period) cls.push('period');
        tip.push(info.period ? C.period : info.kind === 'placebo' ? C.placebo(info.day - 24) : C.active(info.day));
        if (info.start) { mark = true; tip.push(C.start); }
        if (info.skipend) { mark = true; cls.push('skipend'); tip.push(C.skipEnd); }
      }
      if (info.skippedPeriod) { cls.push('skipped'); tip.push(C.skipped); }
      if (info.proj) cls.push('proj');
    }
    if (n === m.t) { cls.push('today'); tip.push(C.today); }
    if (n === sel) { cls.push('sel'); detail = tip; }
    cells += `<button class="${cls.join(' ')}" data-a="calDay" data-n="${n}" aria-pressed="${n === sel}" aria-label="${esc(tip.join(', '))}"><span class="n">${k + 1}</span>${mark ? '<i class="mk"></i>' : ''}</button>`;
  }
  // Dettaglio del giorno toccato (di base oggi): le stesse informazioni che il lettore di schermo legge sulla casella
  const [dHead, ...dInfo] = detail || [];
  const dText = dInfo.join(', ') || C.noInfo;
  const dayDetail = `<p class="cal-detail body-m" aria-live="polite">${detail
    ? `<strong>${esc(dHead)}</strong><span>${esc(dText.charAt(0).toUpperCase() + dText.slice(1))}</span>`
    : `<span class="muted">${C.hint}</span>`}</p>`;
  const lg = T.legend;
  return `<section class="card">
    <div class="card-head cal-head"><h2 class="title-l">${T.monthTitle(first)}</h2>
      <div class="row" style="gap:0">${away ? `<button class="btn text" data-a="monthToday">${T.todayBtn}</button>` : ''}<button class="icon-btn" data-a="monthPrev" aria-label="${T.prevMonth}">${icon('chevronLeft')}</button><button class="icon-btn" data-a="monthNext" aria-label="${T.nextMonth}">${icon('chevronRight')}</button></div>
    </div>
    <div class="cal">${cells}</div>
    ${dayDetail}
    <div class="legend">
      <span><i class="a"></i>${lg[0]}</span><span><i class="p"></i>${lg[1]}</span>
      <span><i class="dot c"></i>${lg[2]}</span><span><i class="dot cp"></i>${lg[3]}</span>
      <span><i class="mk st"></i>${lg[4]}</span><span><i class="mk ps"></i>${lg[5]}</span>
      <span><i class="dot cs"></i>${lg[6]}</span>
    </div>
  </section>`;
}

function periodsView(m) {
  const up = m.periods.filter(p => p.n >= m.t).slice(0, 6);
  return `<section class="card"><div><h2 class="title-m">${T.nextPeriods}</h2><p class="body-m muted">${T.ifAllPlacebo}</p></div><ul class="list">${up.map(p => {
    const [ic, tone, sub] = p.skipped ? ['eventBusy', 'tertiary', T.skippedNoPeriod]
      : p.current ? ['waterDrop', 'primary', p.tentative ? T.currentTentative : T.currentConfirmed]
        : ['waterDrop', '', ''];
    return `<li class="li"><span class="av ${tone}">${icon(ic)}</span><div><div class="li-h">${T.fmtLong(p.n)}</div>${sub ? `<div class="li-s">${sub}</div>` : ''}</div><span class="li-t">${T.rel(p.n, m.t)}</span></li>`;
  }).join('')}</ul></section>`;
}

function historyView() {
  const rows = [...state.blisters].reverse().map(b => {
    const s = d2n(b.start), period = T.fmt(s + 27);
    const [ic, tone, sub] = b.placebo === true ? ['checkCircle', '', T.histTaken(period)]
      : b.placebo === false ? ['skipNext', 'tertiary', T.histSkipped(period)]
        : ['pill', 'primary', T.histOpen(period)];
    return `<li class="li"><span class="av ${tone}">${icon(ic)}</span>
      <div><div class="li-h">${T.fmtFull(s)}</div><div class="li-s">${sub}</div></div>
      <button class="icon-btn" data-a="del" data-start="${b.start}" aria-label="${T.delAria(T.fmt(s))}">${icon('del')}</button></li>`;
  }).join('');
  return `<section class="card"><ul class="list">${rows}</ul></section>
    <button class="fab" data-a="addOpen">${icon('add')}${T.add}</button>`;
}

function settingsView(m) {
  const item = (ic, tone, head, sub, ctl) => `<li class="li"><span class="av ${tone}">${icon(ic)}</span><div><div class="li-h">${head}</div><div class="li-s">${sub}</div></div>${ctl || '<span></span>'}</li>`;
  const granted = notif.display === 'granted';
  const rx = nextRx(state, m);
  const lang = state.settings.lang || 'auto';
  const langSel = `<select class="time" id="lang" aria-label="${T.language}">${[['auto', T.langAuto], ['it', 'Italiano'], ['en', 'English']].map(([v, l]) =>
    `<option value="${v}"${v === lang ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
  return `<section class="card"><ul class="list">
    ${item('schedule', '', T.time, T.timeSub, `<input type="time" class="time" id="notif-time" value="${esc(state.settings.time)}" aria-label="${T.time}">`)}
    ${!NATIVE ? item('notificationsOff', 'neutral', T.notif, T.notifWeb)
      : granted ? item('notifications', '', T.notif, T.notifOn, `<button class="btn tonal" data-a="testNotif">${T.test}</button>`)
        : item('notificationsOff', 'neutral', T.notif, T.notifOff, `<button class="btn filled" data-a="notifOn">${T.enable}</button>`)}
    ${NATIVE && granted && notif.exact !== 'granted' && notif.exact !== 'unknown' ? item('alarm', '', T.exact, T.exactSub, `<button class="btn tonal" data-a="exactOn">${T.allow}</button>`) : ''}
    ${item('prescriptions', '', T.rx, T.rxSub(T.fmt(rx), T.rel(rx, m.t)), `<button class="btn outlined" data-a="rxShift" aria-label="${T.moveAria}">${T.move}</button>`)}
    ${item('translate', '', T.language, T.langSub, langSel)}
    ${item('backup', '', T.backup, T.backupSub, `<button class="btn outlined" data-a="backupOpen">${T.open}</button>`)}
  </ul></section>`;
}

function dialogView() {
  if (ui.dialog === 'add') {
    const opts = [['placebo', T.optTaken], ['skip', T.optSkipped], ['open', T.optOpen]];
    return `<dialog id="dlg" class="sheet" aria-labelledby="dlg-t"><div><div class="handle"></div><div class="dlg-body">
      <h2 id="dlg-t" class="headline-s">${T.addTitle}</h2>
      <label class="field"><span>${T.firstPill}</span><input type="date" class="input" id="add-date" max="${localToday()}"></label>
      <fieldset class="seg"><legend>${T.placeboLegend}</legend><div class="seg-row">${opts.map(([v, l], i) =>
        `<label><input type="radio" name="add-out" value="${v}"${i ? '' : ' checked'}><span class="seg-in">${icon('check')}${l}</span></label>`).join('')}</div></fieldset>
      <p class="dlg-err" hidden></p>
      <div class="actions-end"><button class="btn text" data-a="closeDialog">${T.cancel}</button><button class="btn filled" data-a="addSave">${T.add}</button></div>
    </div></div></dialog>`;
  }
  if (ui.dialog === 'del') {
    return `<dialog id="dlg" class="dlg" aria-labelledby="dlg-t"><div class="dlg-body">
      <h2 id="dlg-t" class="headline-s">${T.delTitle}</h2>
      <p class="body-m muted">${T.delWhy(T.fmtLong(d2n(ui.delStart)))}</p>
      <div class="actions-end"><button class="btn text" data-a="closeDialog">${T.cancel}</button><button class="btn text" data-a="delYes">${T.delete}</button></div>
    </div></dialog>`;
  }
  if (ui.dialog === 'backup') {
    const out = state.blisters.length ? `<p class="body-m muted">${T.backupCopyWhy}</p>
      <textarea id="backup-out" class="input" readonly aria-label="${T.backupAria}">${esc(JSON.stringify(state))}</textarea>
      <div class="row"><button class="btn tonal" data-a="copyBackup">${icon('contentCopy')}${T.copy}</button></div>
      <h3 class="title-m">${T.restore}</h3>` : '';
    return `<dialog id="dlg" class="sheet" aria-labelledby="dlg-t"><div><div class="handle"></div><div class="dlg-body">
      <h2 id="dlg-t" class="headline-s">${T.backup}</h2>${out}
      <p class="body-m muted">${T.restoreWhy}</p>
      <textarea id="backup-in" class="input" aria-label="${T.pasteAria}" placeholder='{"blisters":[...]}'></textarea>
      <p class="dlg-err" hidden></p>
      <div class="row" id="imp-ask"><button class="btn outlined" data-a="importAsk">${icon('contentPaste')}${T.import}</button></div>
      <div class="row" id="imp-confirm" hidden><span class="body-m grow">${T.replaceQ}</span><button class="btn text" data-a="importNo">${T.cancel}</button><button class="btn filled" data-a="importYes">${T.replace}</button></div>
      <div class="actions-end"><button class="btn text" data-a="closeDialog">${T.close}</button></div>
    </div></div></dialog>`;
  }
  return '';
}

/* ---------- avvio ---------- */
async function boot() {
  state = await load();
  applyLang();
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
