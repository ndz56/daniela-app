/* ============================================================
   היומן של דניאלה — לוגיקה ראשית
   ============================================================ */

// ===== מצב גלובלי =====
const STORAGE_KEY = 'daniela-app-v1';

const defaultState = {
  appointments: [],   // {id, title, who, location, date, time, note, repeat, category}
  meds: [],           // {id, name, time, takenDates:[]}
  tests: [],          // {id, name, category, date, location, note}
  birthdays: [],      // {id, name, date, calendar:'gregorian'|'hebrew'}
  notes: [],          // {id, text, audio?, duration?, createdAt}
  fitness: [],        // {id, category, duration, distance, note, date, createdAt}
  customModules: [],  // [{id, name, icon, categories: [], items: [{id, title, category, date, note, createdAt}]}]
  shabbat: { type: null, lastSuggestion: null },
  settings: {
    city: '', notifications: false, lastNotifyCheck: null, apiKey: '',
    firebaseConfig: '', familyCode: '',
    modules: { appointments: true, meds: true, tests: true, birthdays: true, shabbat: true, notes: true, fitness: true },
    moduleLabels: {},
    testCategories: ['בדיקת דם', 'US (אולטרסאונד)', 'רנטגן', 'MRI', 'CT', 'אקו לב', 'מיפוי', 'בדיקת ראייה', 'בדיקת שמיעה'],
    fitnessCategories: ['🚶 הליכה', '🚴 אופניים', '🏃 ריצה', '🏊 שחייה', '🏋️ חדכ"ש', '🧘 יוגה', '⚽ ספורט קבוצתי'],
    calendarView: 'month' // 'month' | 'list'
  }
};

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultState);
    const parsed = JSON.parse(raw);
    return deepMerge(structuredClone(defaultState), parsed);
  } catch {
    return structuredClone(defaultState);
  }
}

function deepMerge(target, src) {
  for (const k in src) {
    if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) {
      target[k] = deepMerge(target[k] || {}, src[k]);
    } else {
      target[k] = src[k];
    }
  }
  return target;
}

function saveState() {
  state._meta = state._meta || {};
  state._meta.lastUpdated = Date.now();
  state._meta.deviceId = state._meta.deviceId || uid();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  // דחיפה לענן אם מחובר
  pushToCloud();
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// ===== עזרי תאריך =====
const HE_MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
const HE_DAYS = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
const REPEAT_LABELS = { none: '', weekly: 'חוזרת כל שבוע', monthly: 'חוזרת כל חודש', yearly: 'חוזרת כל שנה' };

const CATEGORIES = {
  doctor:  { label: '🩺 רופא',    color: '#e74c3c' },
  friend:  { label: '👯 חברה',    color: '#27ae60' },
  family:  { label: '👨‍👩‍👧 משפחה', color: '#3498db' },
  work:    { label: '💼 עבודה',   color: '#9b59b6' },
  general: { label: '📌 כללי',    color: '#95a5a6' }
};
function getCategoryColor(cat) { return CATEGORIES[cat || 'general']?.color || CATEGORIES.general.color; }

function todayISO() {
  const d = new Date();
  d.setHours(0,0,0,0);
  return d.toISOString().slice(0,10);
}

function formatDateHe(iso) {
  if (!iso) return '';
  const [y,m,d] = iso.split('-').map(Number);
  const dt = new Date(y, m-1, d);
  return `יום ${HE_DAYS[dt.getDay()]}, ${d} ב${HE_MONTHS[m-1]} ${y}`;
}

function shortDateHe(iso) {
  if (!iso) return '';
  const [y,m,d] = iso.split('-').map(Number);
  return `${d}/${m}/${y}`;
}

function getHebrewDateString(date = new Date()) {
  try {
    if (typeof hebcal === 'undefined') return '';
    const hd = new hebcal.HDate(date);
    return hd.renderGematriya();
  } catch {
    return '';
  }
}

function gregorianToHebrew(iso) {
  if (typeof hebcal === 'undefined' || !iso) return '';
  try {
    const [y,m,d] = iso.split('-').map(Number);
    const hd = new hebcal.HDate(new Date(y, m-1, d));
    return hd.renderGematriya();
  } catch { return ''; }
}

function hebrewBirthdayThisYear(originalIso) {
  if (typeof hebcal === 'undefined' || !originalIso) return null;
  try {
    const [y,m,d] = originalIso.split('-').map(Number);
    const origHd = new hebcal.HDate(new Date(y, m-1, d));
    const thisYearHebYear = new hebcal.HDate(new Date()).getFullYear();
    const thisYearHd = new hebcal.HDate(origHd.getDate(), origHd.getMonth(), thisYearHebYear);
    return thisYearHd.greg().toISOString().slice(0,10);
  } catch { return null; }
}

// בדיקה אם פגישה חוזרת מתאימה לתאריך נתון
function repeatMatches(appt, targetISO) {
  if (!appt.date || !targetISO) return false;
  if (appt.date === targetISO) return true;
  if (!appt.repeat || appt.repeat === 'none') return false;
  const [ay, am, ad] = appt.date.split('-').map(Number);
  const [ty, tm, td] = targetISO.split('-').map(Number);
  const aDate = new Date(ay, am-1, ad);
  const tDate = new Date(ty, tm-1, td);
  if (tDate < aDate) return false;
  if (appt.repeat === 'weekly')  return aDate.getDay() === tDate.getDay();
  if (appt.repeat === 'monthly') return ad === td;
  if (appt.repeat === 'yearly')  return am === tm && ad === td;
  return false;
}

// ===== ניווט =====
const screens = document.querySelectorAll('.screen');
const DEFAULT_LABELS = {
  appointments: 'יומן פגישות',
  meds: 'תרופות',
  tests: 'בדיקות דם',
  birthdays: 'ימי הולדת',
  shabbat: 'ארוחת שבת',
  notes: 'פתקים שלי',
  fitness: 'כושר גופני'
};
function getModuleLabel(key) {
  return state.settings.moduleLabels?.[key] || DEFAULT_LABELS[key] || key;
}
const screenTitles = new Proxy({
  home: 'היומן שלי',
  settings: 'הגדרות',
  day: 'פירוט יום'
}, {
  get(target, prop) {
    if (prop in target) return target[prop];
    return getModuleLabel(prop);
  }
});

// מצב לוח שנה
let calCursor = (() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; })();
let selectedDayISO = null;

function showScreen(name, options = {}) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.dataset.screen === name));
  document.getElementById('screenTitle').textContent = screenTitles[name] || 'היומן שלי';
  document.getElementById('backBtn').hidden = (name === 'home');
  document.getElementById('settingsBtn').hidden = (name === 'settings');
  window.scrollTo(0,0);
  if (name === 'customModule' && options.customModuleId) {
    renderCustomModule(options.customModuleId);
    return;
  }
  const renderers = {
    home: renderHome,
    appointments: renderAppointments,
    meds: renderMeds,
    tests: renderTests,
    birthdays: renderBirthdays,
    notes: renderNotes,
    fitness: renderFitness,
    shabbat: renderShabbat,
    settings: renderSettings,
    day: renderDayScreen
  };
  renderers[name]?.();
}

document.addEventListener('click', (e) => {
  const goBtn = e.target.closest('[data-go]');
  if (goBtn) {
    const target = goBtn.dataset.go;
    if (target === 'customModule') {
      showScreen('customModule', { customModuleId: goBtn.dataset.customModuleId });
    } else {
      showScreen(target);
    }
    return;
  }
  if (e.target.closest('#backBtn')) { showScreen('home'); return; }
  if (e.target.closest('#settingsBtn')) { showScreen('settings'); return; }
});

// ===== מסך הבית =====
function renderHome() {
  const now = new Date();
  document.getElementById('todayDate').textContent = `יום ${HE_DAYS[now.getDay()]}, ${now.getDate()} ב${HE_MONTHS[now.getMonth()]}`;
  document.getElementById('todayHebrew').textContent = getHebrewDateString(now);
  applyHomeMenuButtons();
  applyModuleVisibility();

  // מידע על שבת/חג
  const shabbatInfo = getShabbatInfo();
  document.getElementById('todayShabbat').textContent = shabbatInfo;

  const today = todayISO();
  const summary = document.getElementById('todaySummary');
  summary.innerHTML = '';

  const todaysAppts = state.appointments.filter(a => repeatMatches(a, today));
  const todaysTests = state.tests.filter(t => t.date === today);
  const todaysBdays = state.birthdays.filter(b => {
    if (b.calendar === 'hebrew') return hebrewBirthdayThisYear(b.date) === today;
    const [, m, d] = b.date.split('-');
    const [, tm, td] = today.split('-');
    return m === tm && d === td;
  });
  const pendingMeds = state.meds.filter(m => !(m.takenDates || []).includes(today));

  if (todaysAppts.length === 0 && todaysTests.length === 0 && todaysBdays.length === 0 && pendingMeds.length === 0) {
    summary.innerHTML = `<div class="summary-item empty">אין משהו דחוף להיום ✨</div>`;
    return;
  }

  pendingMeds.forEach(m => {
    summary.innerHTML += `<div class="summary-item"><span class="summary-icon">💊</span><span>לקחת ${escapeHtml(m.name)}${m.time ? ' ב-' + escapeHtml(m.time) : ''}</span></div>`;
  });
  todaysAppts.forEach(a => {
    summary.innerHTML += `<div class="summary-item"><span class="summary-icon">📅</span><span>${escapeHtml(a.title)}${a.time ? ' ב-' + escapeHtml(a.time) : ''}${a.who ? ' (' + escapeHtml(a.who) + ')' : ''}</span></div>`;
  });
  todaysTests.forEach(t => {
    summary.innerHTML += `<div class="summary-item"><span class="summary-icon">🩸</span><span>בדיקה: ${escapeHtml(t.name)}</span></div>`;
  });
  todaysBdays.forEach(b => {
    summary.innerHTML += `<div class="summary-item"><span class="summary-icon">🎂</span><span>יום הולדת ל${escapeHtml(b.name)}!</span></div>`;
  });
}

// ===== מידע שבת/חג מ-hebcal =====
function fmtTime(d) {
  if (!d) return '';
  return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
}

function getCityForShabbat() {
  return state.settings.city || 'Tel Aviv';
}

// מחזיר את זמני שבת הקרובה (מתאים גם בשבוע, ביום שישי, ובשבת)
function getNextShabbatTimes() {
  if (typeof hebcal === 'undefined') return null;
  try {
    const loc = hebcal.Location.lookup(getCityForShabbat());
    if (!loc) return null;
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=ראשון, 5=שישי, 6=שבת

    // חישוב יום שישי הקרוב/הנוכחי
    let friday = new Date(now);
    friday.setHours(12, 0, 0, 0);
    if (dayOfWeek === 6) {
      // שבת - יום השישי האחרון
      friday.setDate(now.getDate() - 1);
    } else if (dayOfWeek !== 5) {
      const daysUntil = (5 - dayOfWeek + 7) % 7;
      friday.setDate(now.getDate() + daysUntil);
    }
    const saturday = new Date(friday);
    saturday.setDate(friday.getDate() + 1);

    const fridayZ = new hebcal.Zmanim(loc, friday);
    const satZ = new hebcal.Zmanim(loc, saturday);
    return {
      friday, saturday,
      candles: fridayZ.sunsetOffset(-18),  // הדלקת נרות: 18 דק׳ לפני שקיעה
      havdalah: satZ.sunsetOffset(42)       // הבדלה: 42 דק׳ אחרי שקיעה
    };
  } catch { return null; }
}

// זמני שבת לפי תאריך נתון (לתאי הלוח)
function getCandleLightingFor(dateIso) {
  if (typeof hebcal === 'undefined') return null;
  try {
    const loc = hebcal.Location.lookup(getCityForShabbat());
    if (!loc) return null;
    const [y,m,d] = dateIso.split('-').map(Number);
    const dt = new Date(y, m-1, d, 12);
    const z = new hebcal.Zmanim(loc, dt);
    return fmtTime(z.sunsetOffset(-18));
  } catch { return null; }
}
function getHavdalahFor(dateIso) {
  if (typeof hebcal === 'undefined') return null;
  try {
    const loc = hebcal.Location.lookup(getCityForShabbat());
    if (!loc) return null;
    const [y,m,d] = dateIso.split('-').map(Number);
    const dt = new Date(y, m-1, d, 12);
    const z = new hebcal.Zmanim(loc, dt);
    return fmtTime(z.sunsetOffset(42));
  } catch { return null; }
}

function getThisWeekParasha() {
  if (typeof hebcal === 'undefined') return '';
  try {
    const now = new Date();
    const dayOfWeek = now.getDay();
    let saturday = new Date(now);
    saturday.setHours(12, 0, 0, 0);
    if (dayOfWeek !== 6) {
      const daysUntil = (6 - dayOfWeek + 7) % 7;
      saturday.setDate(now.getDate() + daysUntil);
    }
    const events = hebcal.HebrewCalendar.calendar({
      start: saturday, end: saturday,
      sedrot: true, noHolidays: true, il: true
    }) || [];
    const parsha = events.find(e => {
      const cats = e.getCategories ? e.getCategories() : [];
      return cats.includes('parashat') || cats.includes('parsha') || cats.includes('sedrah');
    });
    if (parsha) {
      let brief = parsha.renderBrief('he') || '';
      // ניקוי - אם hebcal מחזיר עם "פרשת" קדמית או עם ניקוד, מסיר זאת
      brief = brief.replace(/^\s*פָּ?רָ?שַ?ת\s+/, '').replace(/^\s*פרשת\s+/, '').trim();
      return 'פרשת ' + brief;
    }
  } catch {}
  return '';
}

function getShabbatInfo() {
  if (typeof hebcal === 'undefined') return '';
  try {
    const now = new Date();
    const dayOfWeek = now.getDay();

    // חיפוש החג הקרוב (בטווח 14 יום קדימה)
    for (let i = 0; i <= 14; i++) {
      const d = new Date(now); d.setDate(now.getDate() + i);
      const hd = new hebcal.HDate(d);
      const events = hebcal.HebrewCalendar.getHolidaysOnDate(hd, true);
      if (events && events.length > 0) {
        const ev = events.find(e => e.getCategories().includes('major') || e.getCategories().includes('holiday'));
        if (ev) {
          const renderHe = ev.renderBrief('he');
          const holidayStr = i === 0 ? `🎉 היום: ${renderHe}` : `🎉 בעוד ${i} ימים: ${renderHe}`;
          // הוספת פרשה רק ביום שישי
          if (dayOfWeek === 5) {
            const parsha = getThisWeekParasha();
            return parsha ? holidayStr + ' • 📖 ' + parsha : holidayStr;
          }
          return holidayStr;
        }
      }
    }

    // ימי חול (ראשון-חמישי) - לא מציג זמני שבת ולא פרשה
    if (dayOfWeek !== 5 && dayOfWeek !== 6) {
      return '';
    }

    const sh = getNextShabbatTimes();
    if (!sh) return '';
    const candleStr = fmtTime(sh.candles);
    const havStr = fmtTime(sh.havdalah);
    if (dayOfWeek === 6) {
      return `🕯️ שבת שלום! יציאת השבת ${havStr}`;
    }
    // יום שישי - מציג פרשה + זמני שבת
    const parsha = getThisWeekParasha();
    const p = parsha ? `📖 ${parsha} • ` : '';
    return `${p}🕯️ כניסת השבת ${candleStr} | יציאת השבת ${havStr}`;
  } catch { return ''; }
}

// ===== רינדור רשימות =====
function renderAppointments() {
  const view = state.settings.calendarView || 'month';
  document.getElementById('calMonthView').hidden = view !== 'month';
  document.getElementById('calWeekView').hidden = view !== 'week';
  document.getElementById('calListView').hidden = view !== 'list';
  // הסתרת ניווט חודש בתצוגות אחרות
  const showNav = view === 'month';
  document.getElementById('calPrev').style.visibility = showNav ? '' : 'hidden';
  document.getElementById('calNext').style.visibility = showNav ? '' : 'hidden';
  document.getElementById('calToday').style.visibility = showNav ? '' : 'hidden';
  if (view === 'month') renderCalendarMonth();
  else if (view === 'week') renderWeekView();
  else renderAppointmentsList();
}

function renderWeekView() {
  const container = document.getElementById('weekAgenda');
  const today = new Date(); today.setHours(0,0,0,0);
  const todayIso = isoFromDate(today);
  // הצגת 7 ימים מהיום
  const sections = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    const iso = isoFromDate(d);
    let events = eventsOnDate(iso);
    if (apptSearchTerm) {
      events = events.filter(e => e.type !== 'appointment' || appointmentMatchesSearch(e.item));
    }
    const isToday = iso === todayIso;
    const isShabbat = d.getDay() === 6;
    const heb = typeof hebcal !== 'undefined' ? (() => {
      try { return new hebcal.HDate(d).renderGematriya(); } catch { return ''; }
    })() : '';
    const dayLabel = isToday ? 'היום' : i === 1 ? 'מחר' : i === 2 ? 'מחרתיים' : `יום ${HE_DAYS[d.getDay()]}`;
    const dateLabel = `${d.getDate()}/${d.getMonth()+1}`;

    let eventsHtml = '';
    if (events.length === 0) {
      eventsHtml = '<div class="week-empty">— אין אירועים —</div>';
    } else {
      // מיון - אירועים עם שעה קודם
      const sorted = [...events].sort((a,b) => {
        const ta = a.item.time || 'zz';
        const tb = b.item.time || 'zz';
        return ta.localeCompare(tb);
      });
      eventsHtml = sorted.map(e => {
        if (e.type === 'appointment') {
          const color = getCategoryColor(e.item.category);
          const catLabel = CATEGORIES[e.item.category || 'general']?.label || '';
          return `<div class="week-event" style="border-right:4px solid ${color}">
            <span class="week-event-time">${e.item.time || '—'}</span>
            <span>${escapeHtml(e.item.title)}${e.item.who ? ' • ' + escapeHtml(e.item.who) : ''}</span>
            <span style="margin-inline-start:auto;font-size:12px;color:${color};font-weight:700">${catLabel}</span>
          </div>`;
        }
        if (e.type === 'test') return `<div class="week-event" style="border-right:4px solid #c0392b"><span class="week-event-time">—</span><span>🩸 בדיקה: ${escapeHtml(e.item.name)}</span></div>`;
        if (e.type === 'birthday') return `<div class="week-event" style="border-right:4px solid #e91e63"><span class="week-event-time">🎂</span><span>יום הולדת ל${escapeHtml(e.item.name)}</span></div>`;
        if (e.type === 'holiday') return `<div class="week-event" style="border-right:4px solid #f6c878"><span class="week-event-time">🕯️</span><span>${escapeHtml(e.item.name)}</span></div>`;
        return '';
      }).join('');
    }

    sections.push(`
      <div class="week-day-section ${isToday ? 'today' : ''} ${isShabbat ? 'shabbat' : ''}">
        <div class="week-day-header" data-day="${iso}">
          <span class="week-day-name">${dayLabel}</span>
          <span class="week-day-date">${dateLabel}</span>
          <span class="week-day-heb">${escapeHtml(heb)}</span>
        </div>
        ${eventsHtml}
      </div>
    `);
  }
  container.innerHTML = sections.join('');
}

function renderAppointmentsList() {
  const list = document.getElementById('appointmentsList');
  const today = todayISO();
  const oneTime = state.appointments.filter(a => (!a.repeat || a.repeat === 'none') && a.date >= today);
  const recurring = expandUpcomingAppointments(today, 365).filter(a => a.repeat && a.repeat !== 'none');
  let all = [...oneTime, ...recurring].sort((a,b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  if (apptSearchTerm) all = all.filter(appointmentMatchesSearch);
  if (all.length === 0) {
    list.innerHTML = emptyMsg(apptSearchTerm ? 'לא נמצאו פגישות שמתאימות לחיפוש.' : 'אין פגישות עתידיות. אפשר להוסיף בכפתור למטה.');
    return;
  }

  // קיבוץ לפי חודש
  let html = '';
  let currentMonth = '';
  all.forEach(a => {
    const [y, m] = a.date.split('-');
    const mKey = `${y}-${m}`;
    if (mKey !== currentMonth) {
      currentMonth = mKey;
      html += `<div class="list-month-header">${HE_MONTHS[Number(m)-1]} ${y}</div>`;
    }
    const color = getCategoryColor(a.category);
    const catLabel = CATEGORIES[a.category || 'general']?.label || '';
    html += `
      <div class="item-card" style="border-right:6px solid ${color}">
        <div class="item-main">
          <div class="item-title">${escapeHtml(a.title)} <span style="font-size:13px;color:${color};font-weight:700">${catLabel}</span></div>
          <div class="item-sub">${formatDateHe(a.date)}${a.time ? ' • ' + escapeHtml(a.time) : ''}${a.who ? ' • ' + escapeHtml(a.who) : ''}</div>
          ${a.location ? `<div class="item-sub">📍 ${escapeHtml(a.location)}</div>` : ''}
          ${a.note ? `<div class="item-sub">${escapeHtml(a.note)}</div>` : ''}
          ${a.repeat && a.repeat !== 'none' ? `<div class="repeat-tag">🔁 ${REPEAT_LABELS[a.repeat]}</div>` : ''}
        </div>
        <button class="item-action edit" data-edit="appointment" data-id="${a.originalId || a.id}" aria-label="עריכה">✏️</button>
        <button class="item-action delete" data-del="appointment" data-id="${a.originalId || a.id}" aria-label="מחיקה">🗑️</button>
      </div>
    `;
  });
  list.innerHTML = html;
}

function expandUpcomingAppointments(fromISO, daysAhead = 90) {
  const out = [];
  const start = new Date(fromISO); start.setHours(0,0,0,0);
  for (let i = 0; i <= daysAhead; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const iso = d.toISOString().slice(0,10);
    state.appointments.forEach(a => {
      if (repeatMatches(a, iso)) {
        out.push({ ...a, date: iso, originalId: a.id });
      }
    });
  }
  out.sort((a,b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  return out;
}

function isoFromDate(d) {
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function eventsOnDate(iso) {
  const events = [];
  state.appointments.forEach(a => { if (repeatMatches(a, iso)) events.push({type:'appointment', item:a}); });
  state.tests.forEach(t => { if (t.date === iso) events.push({type:'test', item:t}); });
  state.birthdays.forEach(b => {
    if (b.calendar === 'hebrew') {
      if (hebrewBirthdayThisYear(b.date) === iso) events.push({type:'birthday', item:b});
    } else {
      const [, m, d] = b.date.split('-');
      const [, im, id] = iso.split('-');
      if (m === im && d === id) events.push({type:'birthday', item:b});
    }
  });
  // חגים
  if (typeof hebcal !== 'undefined') {
    try {
      const [y,m,d] = iso.split('-').map(Number);
      const hd = new hebcal.HDate(new Date(y, m-1, d));
      const hols = hebcal.HebrewCalendar.getHolidaysOnDate(hd, true) || [];
      hols.filter(h => h.getCategories().some(c => ['major','holiday','minor'].includes(c)))
        .forEach(h => events.push({type:'holiday', item:{name: h.renderBrief('he')}}));
    } catch {}
  }
  return events;
}

let pickerYearSelected = null;
let apptSearchTerm = '';

function appointmentMatchesSearch(a) {
  if (!apptSearchTerm) return true;
  const q = apptSearchTerm.toLowerCase();
  return [a.title, a.who, a.note, CATEGORIES[a.category || 'general']?.label || '']
    .some(s => s && s.toLowerCase().includes(q));
}

function openMonthPicker() {
  pickerYearSelected = calCursor.getFullYear();
  renderMonthPicker();
  document.getElementById('monthPicker').classList.remove('hidden');
}

function closeMonthPicker() {
  document.getElementById('monthPicker').classList.add('hidden');
}

function renderMonthPicker() {
  const thisYear = new Date().getFullYear();
  const years = [];
  for (let y = thisYear - 2; y <= thisYear + 5; y++) years.push(y);

  document.getElementById('pickerYears').innerHTML = years.map(y =>
    `<button data-picker-year="${y}" class="${y === pickerYearSelected ? 'selected' : ''}">${y}</button>`
  ).join('');

  const curMonth = calCursor.getMonth();
  const curYear = calCursor.getFullYear();
  document.getElementById('pickerMonths').innerHTML = HE_MONTHS.map((m, i) =>
    `<button data-picker-month="${i}" class="${i === curMonth && pickerYearSelected === curYear ? 'current' : ''}">${m}</button>`
  ).join('');
}

function renderCalendarMonth() {
  const cursor = calCursor;
  const year = cursor.getFullYear(), month = cursor.getMonth();
  document.getElementById('calTitle').textContent = `${HE_MONTHS[month]} ${year}`;

  const grid = document.getElementById('calGrid');
  const first = new Date(year, month, 1);
  // ביום ראשון = יום הראשון של השבוע. day=0=Sunday
  const startOffset = first.getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const todayIso = todayISO();

  const cells = [];
  // ימים של החודש הקודם
  for (let i = startOffset; i > 0; i--) {
    const d = new Date(year, month, 1 - i);
    cells.push({ date: d, otherMonth: true });
  }
  // ימי החודש
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push({ date: new Date(year, month, i), otherMonth: false });
  }
  // השלמה ל-42 (6 שורות)
  while (cells.length < 42) {
    const last = cells[cells.length-1].date;
    const d = new Date(last); d.setDate(last.getDate() + 1);
    cells.push({ date: d, otherMonth: true });
  }

  grid.innerHTML = cells.map(c => {
    const iso = isoFromDate(c.date);
    const isToday = iso === todayIso;
    const isShabbat = c.date.getDay() === 6;
    let events = eventsOnDate(iso);
    let isMatch = !apptSearchTerm;
    if (apptSearchTerm) {
      const matchingAppt = events.find(e => e.type === 'appointment' && appointmentMatchesSearch(e.item));
      isMatch = !!matchingAppt;
    }
    const heb = typeof hebcal !== 'undefined' ? (() => {
      try {
        const hd = new hebcal.HDate(c.date);
        // גמטריה רק של היום בחודש (לא כולל החודש והשנה)
        return hebcal.gematriya ? hebcal.gematriya(hd.getDate()) : hd.getDate();
      } catch { return ''; }
    })() : '';

    const dots = events.slice(0,4).map(e => {
      let bg = '';
      if (e.type === 'appointment') bg = `style="background:${getCategoryColor(e.item.category)}"`;
      const cls = e.type === 'birthday' ? 'birthday' : e.type === 'test' ? 'test' : e.type === 'holiday' ? 'holiday' : '';
      return `<span class="cal-dot ${cls}" ${bg}></span>`;
    }).join('');

    // זמני שבת - רק בשישי (כניסת השבת)
    let shabbatTime = '';
    if (!c.otherMonth && c.date.getDay() === 5) {
      const t = getCandleLightingFor(iso);
      if (t) shabbatTime = `<div class="cal-shabbat-time">🕯️${t}</div>`;
    }
    return `<button class="cal-day ${c.otherMonth ? 'other-month' : ''} ${isToday ? 'today' : ''} ${isShabbat ? 'shabbat' : ''} ${events.length ? 'has-events' : ''} ${apptSearchTerm && !isMatch ? 'dimmed' : ''} ${apptSearchTerm && isMatch ? 'matched' : ''}" data-day="${iso}">
      <div class="cal-day-num">${c.date.getDate()}</div>
      <div class="cal-heb">${heb}</div>
      ${shabbatTime}
      <div class="cal-dots">${dots}</div>
    </button>`;
  }).join('');
}

function renderDayScreen() {
  const iso = selectedDayISO;
  if (!iso) { showScreen('appointments'); return; }
  const [y,m,d] = iso.split('-').map(Number);
  const date = new Date(y, m-1, d);
  const heb = typeof hebcal !== 'undefined' ? (() => {
    try { return new hebcal.HDate(date).renderGematriya(); } catch { return ''; }
  })() : '';

  document.getElementById('dayHeader').innerHTML = `
    <div class="today-date">יום ${HE_DAYS[date.getDay()]}, ${date.getDate()} ב${HE_MONTHS[date.getMonth()]} ${date.getFullYear()}</div>
    <div class="today-hebrew">${escapeHtml(heb)}</div>
  `;

  const events = eventsOnDate(iso);
  const container = document.getElementById('dayEvents');
  if (events.length === 0) {
    container.innerHTML = emptyMsg('אין אירועים ביום זה. אפשר להוסיף פגישה בכפתור למטה.');
  } else {
    container.innerHTML = events.map(e => {
      if (e.type === 'appointment') {
        const a = e.item;
        const color = getCategoryColor(a.category);
        const catLabel = CATEGORIES[a.category || 'general']?.label || '';
        return `<div class="item-card" style="border-right:6px solid ${color}">
          <div class="item-main">
            <div class="item-title">${escapeHtml(a.title)} <span style="font-size:13px;color:${color};font-weight:700">${catLabel}</span></div>
            <div class="item-sub">${a.time ? 'בשעה ' + escapeHtml(a.time) : 'ללא שעה'}${a.who ? ' • ' + escapeHtml(a.who) : ''}</div>
            ${a.location ? `<div class="item-sub">📍 ${escapeHtml(a.location)}</div>` : ''}
            ${a.note ? `<div class="item-sub">${escapeHtml(a.note)}</div>` : ''}
            ${a.repeat && a.repeat !== 'none' ? `<div class="repeat-tag">🔁 ${REPEAT_LABELS[a.repeat]}</div>` : ''}
          </div>
          <button class="item-action edit" data-edit="appointment" data-id="${a.id}" aria-label="עריכה">✏️</button>
          <button class="item-action delete" data-del="appointment" data-id="${a.id}" aria-label="מחיקה">🗑️</button>
        </div>`;
      }
      if (e.type === 'test') return `<div class="item-card"><div class="item-main"><div class="item-title">🩸 ${escapeHtml(e.item.name)}</div>${e.item.note ? `<div class="item-sub">${escapeHtml(e.item.note)}</div>` : ''}</div></div>`;
      if (e.type === 'birthday') return `<div class="item-card"><div class="item-main"><div class="item-title">🎂 יום הולדת ל${escapeHtml(e.item.name)}</div></div></div>`;
      if (e.type === 'holiday') return `<div class="item-card" style="border-right:5px solid #f6c878"><div class="item-main"><div class="item-title">🕯️ ${escapeHtml(e.item.name)}</div></div></div>`;
      return '';
    }).join('');
  }
}

function applyModuleVisibility() {
  const mods = state.settings.modules || {};
  document.querySelectorAll('[data-go]').forEach(btn => {
    const target = btn.dataset.go;
    if (DEFAULT_LABELS[target]) {
      const labelEl = btn.querySelector('.menu-label');
      if (labelEl) labelEl.textContent = getModuleLabel(target);
    }
    // הצגה רק אם המודול כפתור-יכיל (לא הגדרות/יום)
    const isMenuButton = btn.classList.contains('menu-btn');
    if (isMenuButton) {
      if (mods[target] === false) btn.style.display = 'none';
      else btn.style.display = '';
    }
  });
}

function renderModuleToggles() {
  const container = document.getElementById('moduleToggles');
  if (!container) return;
  const mods = state.settings.modules || {};
  const items = [
    {key:'appointments', icon:'📅'},
    {key:'meds', icon:'💊'},
    {key:'tests', icon:'🩸'},
    {key:'birthdays', icon:'🎂'},
    {key:'shabbat', icon:'🕯️'},
    {key:'notes', icon:'📝'},
    {key:'fitness', icon:'💪'}
  ];
  const builtIn = items.map(it => `
    <div class="module-row">
      <button class="module-toggle ${mods[it.key] !== false ? 'on' : ''}" data-toggle-module="${it.key}">
        <span class="toggle-icon">${it.icon}</span>
        <span class="module-label-text">${escapeHtml(getModuleLabel(it.key))}</span>
      </button>
      <button class="module-rename" data-rename-module="${it.key}" aria-label="שינוי שם">✏️</button>
    </div>
  `).join('');

  const customs = (state.customModules || []).map(cm => `
    <div class="module-row">
      <button class="module-toggle on" data-toggle-module="custom:${cm.id}">
        <span class="toggle-icon">${escapeHtml(cm.icon || '⭐')}</span>
        <span class="module-label-text">${escapeHtml(cm.name)}</span>
      </button>
      <button class="module-rename" data-rename-custom="${cm.id}" aria-label="עריכה">✏️</button>
      <button class="module-rename" data-delete-custom="${cm.id}" aria-label="מחיקה" style="background:#ffe5e5;color:#c0392b">🗑️</button>
    </div>
  `).join('');

  const addBtn = `<button class="full-btn light" id="addCustomModule" style="margin-top:8px">➕ מודול חדש משלי</button>`;

  container.innerHTML = builtIn + customs + addBtn;
}

function renderMeds() {
  const list = document.getElementById('medsList');
  if (state.meds.length === 0) { list.innerHTML = emptyMsg('עדיין אין תרופות ברשימה.'); return; }
  const today = todayISO();
  list.innerHTML = state.meds.map(m => {
    const taken = (m.takenDates || []).includes(today);
    return `
    <div class="item-card">
      <div class="item-main">
        <div class="item-title">${escapeHtml(m.name)}</div>
        <div class="item-sub">${m.time ? 'בשעה ' + escapeHtml(m.time) : 'כל יום'}</div>
      </div>
      <button class="item-action ${taken ? 'checked' : 'check'}" data-toggle-med="${m.id}" aria-label="${taken ? 'לקחתי' : 'סמני כלקחתי'}">${taken ? '✓' : '○'}</button>
      <button class="item-action edit" data-edit="med" data-id="${m.id}" aria-label="עריכה">✏️</button>
      <button class="item-action delete" data-del="med" data-id="${m.id}" aria-label="מחיקה">🗑️</button>
    </div>`;
  }).join('');
}

function renderTests() {
  const list = document.getElementById('testsList');
  const sorted = [...state.tests].sort((a,b) => (a.date||'').localeCompare(b.date||''));
  if (sorted.length === 0) { list.innerHTML = emptyMsg('עדיין אין בדיקות מתוכננות.'); return; }
  list.innerHTML = sorted.map(t => `
    <div class="item-card" style="border-right:6px solid #c0392b">
      <div class="item-main">
        <div class="item-title">${t.category ? `<span style="background:#fde8e8;color:#c0392b;padding:2px 8px;border-radius:8px;font-size:13px;font-weight:700">${escapeHtml(t.category)}</span> ` : ''}${escapeHtml(t.name)}</div>
        <div class="item-sub">${t.date ? formatDateHe(t.date) : 'ללא תאריך'}</div>
        ${t.location ? `<div class="item-sub">📍 ${escapeHtml(t.location)}</div>` : ''}
        ${t.note ? `<div class="item-sub">${escapeHtml(t.note)}</div>` : ''}
      </div>
      <button class="item-action edit" data-edit="test" data-id="${t.id}" aria-label="עריכה">✏️</button>
      <button class="item-action delete" data-del="test" data-id="${t.id}" aria-label="מחיקה">🗑️</button>
    </div>
  `).join('');
}

function renderBirthdays() {
  const list = document.getElementById('birthdaysList');
  if (state.birthdays.length === 0) { list.innerHTML = emptyMsg('עדיין אין ימי הולדת. הוסיפי את האהובים שלך.'); return; }

  const today = new Date(); today.setHours(0,0,0,0);
  const enriched = state.birthdays.map(b => {
    let nextGreg;
    if (b.calendar === 'hebrew') {
      const candidate = hebrewBirthdayThisYear(b.date);
      if (candidate && new Date(candidate) >= today) {
        nextGreg = candidate;
      } else {
        try {
          const [y,m,d] = b.date.split('-').map(Number);
          const origHd = new hebcal.HDate(new Date(y, m-1, d));
          const nextHebYear = new hebcal.HDate(today).getFullYear() + 1;
          const nextHd = new hebcal.HDate(origHd.getDate(), origHd.getMonth(), nextHebYear);
          nextGreg = nextHd.greg().toISOString().slice(0,10);
        } catch { nextGreg = b.date; }
      }
    } else {
      const [, m, d] = b.date.split('-');
      const thisYear = today.getFullYear();
      let candidate = new Date(thisYear, Number(m)-1, Number(d));
      if (candidate < today) candidate = new Date(thisYear+1, Number(m)-1, Number(d));
      nextGreg = candidate.toISOString().slice(0,10);
    }
    return { ...b, nextGreg };
  }).sort((a,b) => a.nextGreg.localeCompare(b.nextGreg));

  list.innerHTML = enriched.map(b => {
    // תאריך לידה מקורי - תמיד מהשדה b.date שנשמר (הוא בפורמט YYYY-MM-DD גרגוריאני)
    const origGreg = shortDateHe(b.date);
    const origHeb = gregorianToHebrew(b.date);

    // תאריך הולדת הבא - לפי בחירת לוח: עברי או לועזי
    const nextGreg = b.nextGreg;
    const nextHeb = gregorianToHebrew(nextGreg);

    // חישוב גיל
    const [by, bm, bd] = b.date.split('-').map(Number);
    const today = new Date();
    let age = today.getFullYear() - by;
    if (today.getMonth()+1 < bm || (today.getMonth()+1 === bm && today.getDate() < bd)) age--;

    const trackByLabel = b.calendar === 'hebrew' ? '🕎 לפי לוח עברי' : '📅 לפי לוח לועזי';

    return `
    <div class="item-card">
      <div class="item-main">
        <div class="item-title">🎂 ${escapeHtml(b.name)} <span style="font-size:14px;color:#6b5e8f;font-weight:600">(גיל ${age})</span></div>
        <div class="item-sub"><b>תאריך לידה (לועזי):</b> ${escapeHtml(origGreg)}</div>
        <div class="item-sub"><b>תאריך לידה (עברי):</b> ${escapeHtml(origHeb)}</div>
        <div class="item-sub" style="margin-top:6px;color:#7b5cd6"><b>יום הולדת הבא:</b> ${formatDateHe(nextGreg)}</div>
        <div class="item-sub" style="color:#7b5cd6">${escapeHtml(nextHeb)}</div>
        <div class="item-sub" style="font-size:13px;color:#8b7eb3;margin-top:4px">${trackByLabel}</div>
      </div>
      <button class="item-action edit" data-edit="birthday" data-id="${b.id}" aria-label="עריכה">✏️</button>
      <button class="item-action delete" data-del="birthday" data-id="${b.id}" aria-label="מחיקה">🗑️</button>
    </div>
  `;}).join('');
}

function renderNotes() {
  const list = document.getElementById('notesList');
  const sorted = [...state.notes].sort((a,b) => b.createdAt - a.createdAt);
  if (sorted.length === 0) { list.innerHTML = emptyMsg('כאן יישמרו הפתקים, מחשבות והקלטות שלך.'); return; }
  list.innerHTML = sorted.map(n => {
    const audioHtml = n.audio ? `<audio controls src="${n.audio}" style="width:100%;margin-top:8px"></audio>` : '';
    const text = n.text || (n.audio ? '🎤 פתק קולי' : '');
    return `
    <div class="item-card">
      <div class="item-main">
        <div class="item-title" style="white-space:pre-wrap;font-weight:600;font-size:17px">${escapeHtml(text)}</div>
        ${audioHtml}
        <div class="item-sub">${new Date(n.createdAt).toLocaleString('he-IL')}</div>
      </div>
      ${!n.audio ? `<button class="item-action edit" data-edit="note" data-id="${n.id}" aria-label="עריכה">✏️</button>` : ''}
      <button class="item-action delete" data-del="note" data-id="${n.id}" aria-label="מחיקה">🗑️</button>
    </div>
  `;}).join('');
}

// ===== הקלטה קולית =====
let mediaRecorder = null;
let recordedChunks = [];
let recordingStartTime = 0;
let recordingTimer = null;

async function startRecording() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('הדפדפן הזה לא תומך בהקלטה');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(recordedChunks, { type: 'audio/webm' });
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        const duration = Math.round((Date.now() - recordingStartTime) / 1000);
        const label = prompt('כותרת קצרה (לא חובה):', '');
        state.notes.push({
          id: uid(),
          text: label || '',
          audio: dataUrl,
          duration,
          createdAt: Date.now()
        });
        saveState();
        showToast('הקלטה נשמרה ✓');
        renderNotes();
      };
      reader.readAsDataURL(blob);
    };
    mediaRecorder.start();
    recordingStartTime = Date.now();
    showRecordingUI();
  } catch (err) {
    alert('לא ניתן להקליט: ' + (err.message || 'אין הרשאת מיקרופון'));
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
  hideRecordingUI();
}

function showRecordingUI() {
  if (document.getElementById('recBanner')) return;
  const banner = document.createElement('div');
  banner.id = 'recBanner';
  banner.style.cssText = 'position:fixed;top:60px;inset-inline:18px;background:#e74c3c;color:white;padding:14px 18px;border-radius:14px;z-index:300;box-shadow:0 10px 30px rgba(231,76,60,0.4);display:flex;align-items:center;gap:12px;font-weight:700';
  banner.innerHTML = '<span style="font-size:20px">🔴</span><span style="flex:1">מקליט... <span id="recTime">0:00</span></span><button id="stopRecBtn" style="background:white;color:#e74c3c;border:none;padding:8px 16px;border-radius:10px;font-weight:700;font-family:inherit;cursor:pointer">סיים</button>';
  document.body.appendChild(banner);
  recordingTimer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    const mm = Math.floor(elapsed / 60);
    const ss = (elapsed % 60).toString().padStart(2, '0');
    const el = document.getElementById('recTime');
    if (el) el.textContent = `${mm}:${ss}`;
  }, 500);
  document.getElementById('stopRecBtn').addEventListener('click', stopRecording);
}

function hideRecordingUI() {
  clearInterval(recordingTimer);
  recordingTimer = null;
  const banner = document.getElementById('recBanner');
  if (banner) banner.remove();
}

// ===== מודולים מותאמים =====
let currentCustomModuleId = null;

function applyHomeMenuButtons() {
  // הוספת/הסרת כפתורים של מודולים מותאמים במסך הבית
  const grid = document.querySelector('.menu-grid');
  if (!grid) return;
  // הסרת כפתורי מודול מותאם קודמים
  grid.querySelectorAll('[data-custom-module-id]').forEach(el => el.remove());
  // הוספה לכל מודול מותאם
  (state.customModules || []).forEach(cm => {
    const btn = document.createElement('button');
    btn.className = 'menu-btn';
    btn.dataset.go = 'customModule';
    btn.dataset.customModuleId = cm.id;
    btn.innerHTML = `<span class="menu-icon">${escapeHtml(cm.icon || '⭐')}</span><span class="menu-label">${escapeHtml(cm.name)}</span>`;
    grid.appendChild(btn);
  });
}

function renderCustomModule(cmId) {
  const cm = (state.customModules || []).find(x => x.id === cmId);
  if (!cm) { showScreen('home'); return; }
  currentCustomModuleId = cmId;
  document.getElementById('screenTitle').textContent = cm.icon + ' ' + cm.name;
  const container = document.getElementById('customModuleContent');
  const sorted = [...cm.items].sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0));
  const listHtml = sorted.length === 0
    ? emptyMsg('אין פריטים. תוסיפי בכפתור למטה.')
    : sorted.map(it => `
      <div class="item-card">
        <div class="item-main">
          <div class="item-title">${it.category ? `<span style="background:#f0eaf9;color:#4a2e9c;padding:2px 8px;border-radius:8px;font-size:13px;font-weight:700">${escapeHtml(it.category)}</span> ` : ''}${escapeHtml(it.title)}</div>
          ${it.date ? `<div class="item-sub">${formatDateHe(it.date)}</div>` : ''}
          ${it.note ? `<div class="item-sub">${escapeHtml(it.note)}</div>` : ''}
        </div>
        <button class="item-action edit" data-custom-edit="${cm.id}" data-item-id="${it.id}" aria-label="עריכה">✏️</button>
        <button class="item-action delete" data-custom-del="${cm.id}" data-item-id="${it.id}" aria-label="מחיקה">🗑️</button>
      </div>
    `).join('');

  container.innerHTML = `
    <div id="customModuleList" class="item-list">${listHtml}</div>
    <button class="add-btn" data-custom-add="${cm.id}">+ הוספת פריט</button>
  `;
}

function openCustomAdd(cmId) {
  const cm = (state.customModules || []).find(x => x.id === cmId);
  if (!cm) return;
  currentAdd = 'custom:' + cmId;
  modalTitle.textContent = `הוספה ל${cm.name}`;
  const cats = cm.categories || [];
  const categoryField = cats.length > 0
    ? `<label>קטגוריה</label><select name="category" data-custom-cat="${cmId}">
        ${cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
        <option value="__add_new__">➕ הוסיפי קטגוריה חדשה...</option>
      </select>`
    : `<label>קטגוריה (לא חובה)</label>
       <div style="display:flex;gap:6px">
         <select name="category" data-custom-cat="${cmId}">
           <option value="">— ללא —</option>
           <option value="__add_new__">➕ הוסיפי קטגוריה חדשה...</option>
         </select>
       </div>`;
  modalFields.innerHTML = `
    <label>כותרת</label>
    <input type="text" name="title" required placeholder="מה להוסיף?" />
    ${categoryField}
    <label>תאריך (לא חובה)</label>
    <input type="date" name="date" />
    <label>הערה (לא חובה)</label>
    <textarea name="note" placeholder="פרטים נוספים..."></textarea>
  `;
  modal.classList.remove('hidden');
}

// טיפול בהוספת קטגוריה חדשה לתוך מודול מותאם
document.addEventListener('change', (e) => {
  if (e.target.matches('[data-custom-cat]') && e.target.value === '__add_new__') {
    const cmId = e.target.dataset.customCat;
    const cm = (state.customModules || []).find(x => x.id === cmId);
    if (!cm) return;
    const newCat = prompt('שם הקטגוריה החדשה:');
    if (newCat && newCat.trim()) {
      cm.categories = cm.categories || [];
      const trimmed = newCat.trim();
      if (!cm.categories.includes(trimmed)) cm.categories.push(trimmed);
      saveState();
      const newOption = document.createElement('option');
      newOption.value = trimmed;
      newOption.textContent = trimmed;
      e.target.insertBefore(newOption, e.target.lastElementChild);
      e.target.value = trimmed;
    } else {
      e.target.value = e.target.options[0]?.value || '';
    }
  }
});

function renderFitness() {
  const summary = document.getElementById('fitnessSummary');
  const list = document.getElementById('fitnessList');
  const items = state.fitness || [];

  // סטטיסטיקה ל-30 יום אחרונים
  const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 30);
  const recent = items.filter(f => new Date(f.date) >= monthAgo);
  const totalMin = recent.reduce((s, f) => s + (Number(f.duration) || 0), 0);
  const totalKm = recent.reduce((s, f) => s + (Number(f.distance) || 0), 0);
  const totalActivities = recent.length;

  summary.innerHTML = `
    <h3>📊 חודש אחרון</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:10px;text-align:center">
      <div><div style="font-size:24px;font-weight:800;color:#4a2e9c">${totalActivities}</div><div style="font-size:13px;color:#6b5e8f">פעילויות</div></div>
      <div><div style="font-size:24px;font-weight:800;color:#4a2e9c">${totalMin}</div><div style="font-size:13px;color:#6b5e8f">דקות</div></div>
      <div><div style="font-size:24px;font-weight:800;color:#4a2e9c">${totalKm.toFixed(1)}</div><div style="font-size:13px;color:#6b5e8f">ק"מ</div></div>
    </div>
  `;

  const sorted = [...items].sort((a,b) => (b.date || '').localeCompare(a.date || ''));
  if (sorted.length === 0) { list.innerHTML = emptyMsg('עדיין אין פעילויות. תרשמי את הראשונה!'); return; }
  list.innerHTML = sorted.map(f => `
    <div class="item-card" style="border-right:6px solid #27ae60">
      <div class="item-main">
        <div class="item-title">${escapeHtml(f.category || 'פעילות')}</div>
        <div class="item-sub">${formatDateHe(f.date)}${f.duration ? ' • ' + escapeHtml(f.duration) + ' דק׳' : ''}${f.distance ? ' • ' + escapeHtml(f.distance) + ' ק"מ' : ''}</div>
        ${f.note ? `<div class="item-sub">${escapeHtml(f.note)}</div>` : ''}
      </div>
      <button class="item-action edit" data-edit="fitness" data-id="${f.id}" aria-label="עריכה">✏️</button>
      <button class="item-action delete" data-del="fitness" data-id="${f.id}" aria-label="מחיקה">🗑️</button>
    </div>
  `).join('');
}

function renderShabbat() {
  document.querySelectorAll('[data-shabbat-type]').forEach(b => {
    b.classList.toggle('selected', b.dataset.shabbatType === state.shabbat.type);
  });
  const box = document.getElementById('shabbatSuggestions');
  const aiBtn = document.getElementById('aiSuggestBtn');
  if (state.shabbat.lastSuggestion) {
    box.classList.add('visible');
    box.innerHTML = state.shabbat.lastSuggestion;
  } else {
    box.classList.remove('visible');
    box.innerHTML = '';
  }
  // הצגת כפתור AI רק אם יש מפתח ויש סוג שנבחר
  if (aiBtn) {
    aiBtn.hidden = !(state.settings.apiKey && state.shabbat.type);
  }
}

function renderSyncUI() {
  const connected = !!cloudSync.ready;
  document.getElementById('syncDisconnected').hidden = connected;
  document.getElementById('syncConnected').hidden = !connected;
  if (connected) {
    document.getElementById('syncFamily').textContent = 'משפחה: ' + (state.settings.familyCode || '');
    const t = cloudSync.lastSync ? new Date(cloudSync.lastSync).toLocaleString('he-IL') : '—';
    document.getElementById('syncLastUpdate').textContent = 'סנכרון אחרון: ' + t;
  }
}

function renderSettings() {
  document.getElementById('citySelect').value = state.settings.city || '';
  const status = document.getElementById('notifyStatus');
  if (!('Notification' in window)) {
    status.textContent = 'הדפדפן הזה לא תומך בהתראות.';
  } else if (Notification.permission === 'granted') {
    status.textContent = '✓ התראות מופעלות';
  } else if (Notification.permission === 'denied') {
    status.textContent = '⚠ התראות נחסמו. שני את ההגדרות בדפדפן.';
  } else {
    status.textContent = 'התראות עדיין לא הופעלו.';
  }
  // סטטוס מפתח API
  const apiStatus = document.getElementById('apiKeyStatus');
  const apiInput = document.getElementById('apiKeyInput');
  if (state.settings.apiKey) {
    apiStatus.textContent = '✓ מפתח שמור (' + state.settings.apiKey.slice(0, 10) + '...)';
    apiInput.value = '';
    apiInput.placeholder = 'הדבק מפתח חדש כדי להחליף';
  } else {
    apiStatus.textContent = 'אין מפתח. תשתמשי בהצעות מובנות.';
  }
  // סטטוס סנכרון
  renderSyncUI();
  // טוגלים של מודולים
  renderModuleToggles();
}

// ============ סנכרון ענן (Firebase) ============
const cloudSync = {
  app: null,
  db: null,
  unsub: null,
  ready: false,
  pushTimer: null,
  lastSync: null,
  ignoreNextRemote: false
};

function initCloudSync() {
  if (!state.settings.firebaseConfig || !state.settings.familyCode) return;
  if (typeof firebase === 'undefined' || !firebase.initializeApp) {
    setTimeout(initCloudSync, 500);
    return;
  }
  try {
    let cfg;
    try { cfg = JSON.parse(state.settings.firebaseConfig); }
    catch { showSyncStatus('שגיאה: ה-config לא JSON תקין'); return; }

    // יצירת אפליקציית firebase (פעם אחת)
    if (firebase.apps.length === 0) {
      cloudSync.app = firebase.initializeApp(cfg);
    } else {
      cloudSync.app = firebase.apps[0];
    }
    cloudSync.db = firebase.firestore();

    firebase.auth().signInAnonymously().then(() => {
      const familyDoc = cloudSync.db.collection('families').doc(state.settings.familyCode);
      // האזנה לשינויים מהענן
      cloudSync.unsub = familyDoc.onSnapshot((snap) => {
        if (cloudSync.ignoreNextRemote) {
          cloudSync.ignoreNextRemote = false;
          return;
        }
        if (!snap.exists) {
          // ראשון - דחיפה ראשונית של מה שיש לנו
          pushToCloud(true);
          return;
        }
        const remote = snap.data();
        // איחוד: לוקח את הצד עם הזמן האחרון
        const localTime = state._meta?.lastUpdated || 0;
        const remoteTime = remote?._meta?.lastUpdated || 0;
        if (remoteTime > localTime) {
          mergeFromRemote(remote);
          cloudSync.lastSync = Date.now();
          showSyncStatus('עודכן מהענן ✓');
          renderSyncUI();
          // רענון מסך נוכחי
          const active = document.querySelector('.screen.active')?.dataset.screen;
          if (active) showScreen(active);
        }
      }, (err) => {
        showSyncStatus('שגיאת סנכרון: ' + err.message);
      });
      cloudSync.ready = true;
      showSyncStatus('מחובר לענן ✓');
      renderSyncUI();
    }).catch(err => {
      showSyncStatus('שגיאת אימות: ' + err.message);
    });
  } catch (err) {
    showSyncStatus('שגיאה: ' + err.message);
  }
}

function mergeFromRemote(remote) {
  // העתקה של רוב השדות מהענן, אבל שמירה על ההגדרות המקומיות
  const localSettings = state.settings;
  state = deepMerge(structuredClone(defaultState), remote);
  // ההגדרות נשמרות מקומיות (לכל מכשיר שלו)
  state.settings = localSettings;
  // שמירה ל-localStorage בלי דחיפה לענן שוב
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function pushToCloud(force = false) {
  if (!cloudSync.ready || !cloudSync.db) return;
  if (cloudSync.pushTimer) clearTimeout(cloudSync.pushTimer);
  cloudSync.pushTimer = setTimeout(async () => {
    try {
      // יצירת עותק בלי ההגדרות הפרטיות
      const toSync = { ...state };
      delete toSync.settings; // ההגדרות לכל מכשיר בנפרד
      cloudSync.ignoreNextRemote = true;
      await cloudSync.db.collection('families').doc(state.settings.familyCode).set(toSync, { merge: false });
      cloudSync.lastSync = Date.now();
      renderSyncUI();
    } catch (err) {
      console.warn('push failed', err);
      cloudSync.ignoreNextRemote = false;
    }
  }, force ? 0 : 800);
}

function connectSync() {
  const code = document.getElementById('familyCodeInput').value.trim();
  const cfg = document.getElementById('firebaseConfigInput').value.trim();
  if (!code || !cfg) { showSyncStatus('מלא את שני השדות'); return; }
  // ניקוי הקלט - אם הדביקו את כל בלוק ה-firebaseConfig
  let cleanCfg = cfg;
  const m = cfg.match(/\{[\s\S]*\}/);
  if (m) cleanCfg = m[0];
  try { JSON.parse(cleanCfg); }
  catch {
    // אם זה JS object literal, ננסה להפוך
    try {
      const evalled = Function('"use strict"; return (' + cleanCfg + ')')();
      cleanCfg = JSON.stringify(evalled);
    } catch {
      showSyncStatus('ה-config לא תקין. הדבק את התוכן שבסוגריים { } בלבד');
      return;
    }
  }
  state.settings.firebaseConfig = cleanCfg;
  state.settings.familyCode = code;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  showSyncStatus('מתחבר...');
  initCloudSync();
}

function disconnectSync() {
  if (!confirm('לנתק את הסנכרון? הנתונים יישארו במכשיר.')) return;
  if (cloudSync.unsub) cloudSync.unsub();
  cloudSync.unsub = null;
  cloudSync.ready = false;
  cloudSync.db = null;
  state.settings.firebaseConfig = '';
  state.settings.familyCode = '';
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  showSyncStatus('נותק.');
  renderSyncUI();
}

function showSyncStatus(msg) {
  const el = document.getElementById('syncStatus');
  if (el) el.textContent = msg;
}

// ===== הצעות ארוחה =====
const SHABBAT_IDEAS = {
  'בשרי': [
    { name: 'תפריט קלאסי', items: ['חלה', 'סלט ירקות קצוץ', 'מרק עוף עם קניידלך', 'חזה עוף בתנור עם תפוחי אדמה', 'אורז לבן', 'גזר מתוק', 'עוגת שוקולד פרווה'] },
    { name: 'תפריט קל', items: ['חלה', 'סלט חסה ועגבניות שרי', 'מרק ירקות', 'שניצל הודו', 'פתיתים עם בצל מטוגן', 'קוגל ירושלמי', 'פירות העונה'] },
    { name: 'תפריט חגיגי', items: ['חלה', 'סלטים קטנים: חצילים, מטבוחה, חומוס', 'מרק עוף', 'צלי כתף בקר ברוטב יין', 'תפוחי אדמה אפויים', 'שעועית ירוקה מוקפצת', 'עוגת תפוזים פרווה'] }
  ],
  'חלבי': [
    { name: 'תפריט קלאסי חלבי', items: ['חלה', 'סלט יווני', 'קיש גבינות ופטריות', 'פסטה ברוטב עגבניות ובזיליקום', 'גבינות מגוונות עם זיתים', 'עוגת גבינה'] },
    { name: 'בוקר־לערב', items: ['חלה', 'שקשוקה', 'סלט טונה', 'בלינצ׳ס גבינה', 'יוגורט עם דבש ואגוזים', 'עוגיות חמאה'] },
    { name: 'תפריט קל חלבי', items: ['חלה', 'סלט עלים עם גבינת פטה', 'מרק ברוקולי', 'לזניה ירקות וגבינה', 'פירות העונה עם שמנת מתוקה'] }
  ],
  'פרווה': [
    { name: 'תפריט פרווה דגים', items: ['חלה', 'סלט סלק עם תפוז', 'גפילטע פיש או פילה סלמון אפוי', 'אורז עם שקדים', 'תפוחי אדמה צלויים', 'פירות יער'] },
    { name: 'תפריט צמחוני', items: ['חלה', 'סלט קינואה עם רימון', 'מרק עדשים', 'תבשיל שעועית לבנה', 'בורגול עם בצל מטוגן', 'קומפוט פירות'] }
  ]
};

function suggestShabbat(type) {
  state.shabbat.type = type;
  const options = SHABBAT_IDEAS[type] || [];
  const pick = options[Math.floor(Math.random() * options.length)];
  if (!pick) return;
  state.shabbat.lastSuggestion = `
    <h3>הצעה: ${pick.name} (${type})</h3>
    <p>הנה רעיון לתפריט שלם, הכל בכשרות:</p>
    <ul>${pick.items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>
    <p style="margin-top:14px;color:#6b5e8f;font-size:15px">לחיצה נוספת על הכפתור תיתן הצעה אחרת. בהמשך נחבר AI שיציע תפריטים חדשים לפי מה שיש לך במקרר.</p>
  `;
  saveState();
  renderShabbat();
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-shabbat-type]');
  if (t) suggestShabbat(t.dataset.shabbatType);
});

// ===== עריכת פריט =====
document.addEventListener('click', (e) => {
  const ed = e.target.closest('[data-edit]');
  if (ed) {
    const type = ed.dataset.edit;
    const id = ed.dataset.id;
    let item;
    if (type === 'appointment') item = state.appointments.find(x => x.id === id);
    if (type === 'med')         item = state.meds.find(x => x.id === id);
    if (type === 'test')        item = state.tests.find(x => x.id === id);
    if (type === 'birthday')    item = state.birthdays.find(x => x.id === id);
    if (type === 'note')        item = state.notes.find(x => x.id === id);
    if (type === 'fitness')     item = state.fitness.find(x => x.id === id);
    if (item) openEdit(type, item);
    return;
  }
  const edCustom = e.target.closest('[data-custom-edit]');
  if (edCustom) {
    const cmId = edCustom.dataset.customEdit;
    const itemId = edCustom.dataset.itemId;
    const cm = (state.customModules || []).find(x => x.id === cmId);
    if (cm) {
      const it = cm.items.find(x => x.id === itemId);
      if (it) openEditCustom(cmId, it);
    }
    return;
  }
});

// ===== מחיקה וסימון =====
document.addEventListener('click', (e) => {
  const del = e.target.closest('[data-del]');
  if (del) {
    const type = del.dataset.del;
    const id = del.dataset.id;
    if (!confirm('למחוק?')) return;
    if (type === 'appointment') state.appointments = state.appointments.filter(x => x.id !== id);
    if (type === 'med')         state.meds         = state.meds.filter(x => x.id !== id);
    if (type === 'test')        state.tests        = state.tests.filter(x => x.id !== id);
    if (type === 'birthday')    state.birthdays    = state.birthdays.filter(x => x.id !== id);
    if (type === 'note')        state.notes        = state.notes.filter(x => x.id !== id);
    if (type === 'fitness')     state.fitness      = state.fitness.filter(x => x.id !== id);
    saveState();
    showToast('נמחק');
    showScreen(document.querySelector('.screen.active').dataset.screen);
    return;
  }

  const tog = e.target.closest('[data-toggle-med]');
  if (tog) {
    const id = tog.dataset.toggleMed;
    const med = state.meds.find(m => m.id === id);
    if (!med) return;
    const today = todayISO();
    med.takenDates = med.takenDates || [];
    if (med.takenDates.includes(today)) {
      med.takenDates = med.takenDates.filter(d => d !== today);
    } else {
      med.takenDates.push(today);
      showToast('יופי! סומן ✓');
    }
    saveState();
    renderMeds();
  }
});

// ===== מודאל הוספה =====
const modal = document.getElementById('modal');
const modalForm = document.getElementById('modalForm');
const modalFields = document.getElementById('modalFields');
const modalTitle = document.getElementById('modalTitle');
let currentAdd = null;

const ADD_CONFIGS = {
  appointment: {
    title: 'הוספת פגישה',
    fields: [
      { name: 'title', label: 'מה הפגישה?', type: 'text', required: true, placeholder: 'לדוגמה: ביקור אצל ד״ר כהן' },
      { name: 'category', label: 'קטגוריה (צבע)', type: 'select', options: [
        { value: 'general', label: '📌 כללי' },
        { value: 'doctor',  label: '🩺 רופא' },
        { value: 'friend',  label: '👯 חברה' },
        { value: 'family',  label: '👨‍👩‍👧 משפחה' },
        { value: 'work',    label: '💼 עבודה' }
      ]},
      { name: 'who',   label: 'עם מי?',     type: 'text', placeholder: 'שם הרופא/החברה' },
      { name: 'location', label: 'מיקום (לא חובה)', type: 'text', placeholder: 'כתובת / קליניקה / מקום' },
      { name: 'date',  label: 'מתי?',       type: 'date', required: true },
      { name: 'time',  label: 'באיזו שעה?', type: 'time' },
      { name: 'repeat', label: 'חוזרת?', type: 'select', options: [
        { value: 'none',    label: 'חד פעמית' },
        { value: 'weekly',  label: 'כל שבוע' },
        { value: 'monthly', label: 'כל חודש' },
        { value: 'yearly',  label: 'כל שנה' }
      ]},
      { name: 'note',  label: 'הערה (לא חובה)', type: 'textarea' }
    ]
  },
  med: {
    title: 'הוספת תרופה',
    fields: [
      { name: 'name', label: 'שם התרופה', type: 'text', required: true },
      { name: 'time', label: 'באיזו שעה לקחת?', type: 'time' }
    ]
  },
  test: {
    title: 'הוספת בדיקה',
    fields: [
      { name: 'category', label: 'סוג בדיקה', type: 'dynamicSelect', source: 'testCategories' },
      { name: 'name', label: 'פירוט (מה בודקים?)', type: 'text', required: true, placeholder: 'לדוגמה: ספירת דם / בטן עליונה' },
      { name: 'date', label: 'מתי?', type: 'date' },
      { name: 'location', label: 'איפה?', type: 'text', placeholder: 'מכבי / כללית / שם המכון' },
      { name: 'note', label: 'הערה (צום? הכנה?)', type: 'textarea' }
    ]
  },
  birthday: {
    title: 'הוספת יום הולדת',
    fields: [
      { name: 'name', label: 'של מי?', type: 'text', required: true },
      { name: 'calendar', label: 'איזה לוח?', type: 'select', options: [
        { value: 'gregorian', label: 'לוח לועזי' },
        { value: 'hebrew',    label: 'לוח עברי' }
      ], required: true },
      { name: 'date', label: 'תאריך לידה', type: 'dmyDate', required: true, hint: 'בוחרים יום, חודש ושנה - השנה היא תיבת בחירה נוחה' }
    ]
  },
  note: {
    title: 'פתק חדש',
    fields: [
      { name: 'text', label: 'מה לכתוב?', type: 'textarea', required: true, placeholder: 'מחשבה, רעיון, תזכורת...' }
    ]
  },
  fitness: {
    title: 'הוספת פעילות גופנית',
    fields: [
      { name: 'category', label: 'סוג פעילות', type: 'dynamicSelect', source: 'fitnessCategories' },
      { name: 'date', label: 'מתי?', type: 'date', required: true },
      { name: 'duration', label: 'משך (דקות)', type: 'number', placeholder: 'לדוגמה: 30' },
      { name: 'distance', label: 'מרחק (ק"מ)', type: 'number', placeholder: 'לדוגמה: 5' },
      { name: 'note', label: 'הערה (איך הרגשתי, מסלול, וכו׳)', type: 'textarea' }
    ]
  }
};

let currentEditId = null; // אם מוגדר - אנחנו עורכים, לא מוסיפים

function openEdit(type, item) {
  currentEditId = item.id;
  openAdd(type, item);
  // החלפת כותרת
  const cfg = ADD_CONFIGS[type];
  if (cfg) modalTitle.textContent = '✏️ עריכה: ' + cfg.title.replace('הוספת ','').replace('הוספה','');
}

function openEditCustom(cmId, item) {
  currentEditId = item.id;
  openCustomAdd(cmId);
  modalTitle.textContent = '✏️ עריכת פריט';
  // מילוי השדות מהפריט
  const form = document.getElementById('modalForm');
  Object.entries(item).forEach(([k, v]) => {
    const field = form.querySelector(`[name="${k}"]`);
    if (field && v != null) field.value = v;
  });
}

function openAdd(type, prefill = {}) {
  currentAdd = type;
  if (!currentEditId) currentEditId = null;
  const cfg = ADD_CONFIGS[type];
  modalTitle.textContent = cfg.title;
  modalFields.innerHTML = cfg.fields.map(f => {
    const pre = prefill[f.name] != null ? String(prefill[f.name]) : '';
    if (f.type === 'textarea') {
      return `<label>${f.label}</label><textarea name="${f.name}" ${f.required ? 'required' : ''} placeholder="${f.placeholder||''}">${escapeHtml(pre)}</textarea>`;
    }
    if (f.type === 'select') {
      return `<label>${f.label}</label><select name="${f.name}" ${f.required ? 'required' : ''}>${f.options.map(o => `<option value="${o.value}" ${o.value === pre ? 'selected' : ''}>${o.label}</option>`).join('')}</select>`;
    }
    if (f.type === 'dmyDate') {
      // ברירת מחדל: אם לא הוזן - אמצע 1980
      let preY = 1980, preM = 1, preD = 1;
      if (pre) {
        const m = pre.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) { preY = Number(m[1]); preM = Number(m[2]); preD = Number(m[3]); }
      }
      const thisYear = new Date().getFullYear();
      const years = [];
      for (let y = thisYear; y >= thisYear - 120; y--) years.push(y);
      const monthsOpts = HE_MONTHS.map((m, i) => `<option value="${i+1}" ${i+1 === preM ? 'selected' : ''}>${m}</option>`).join('');
      const yearsOpts = years.map(y => `<option value="${y}" ${y === preY ? 'selected' : ''}>${y}</option>`).join('');
      const daysOpts = Array.from({length: 31}, (_, i) => `<option value="${i+1}" ${i+1 === preD ? 'selected' : ''}>${i+1}</option>`).join('');
      return `<label>${f.label}</label>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px">
          <select data-dmy-day name="__dmy_day_${f.name}">${daysOpts}</select>
          <select data-dmy-month name="__dmy_month_${f.name}">${monthsOpts}</select>
          <select data-dmy-year name="__dmy_year_${f.name}">${yearsOpts}</select>
        </div>
        <input type="hidden" name="${f.name}" data-dmy-field="${f.name}" value="${pre}" />
        ${f.hint ? `<div class="item-sub" style="margin-top:4px">${f.hint}</div>` : ''}`;
    }
    if (f.type === 'dynamicSelect') {
      const items = state.settings[f.source] || [];
      const options = items.map(it => `<option value="${escapeHtml(it)}" ${it === pre ? 'selected' : ''}>${escapeHtml(it)}</option>`).join('');
      return `<label>${f.label}</label>
        <div style="display:flex;gap:6px">
          <select name="${f.name}" data-dynamic-source="${f.source}" style="flex:1">${options}<option value="__add_new__">➕ הוסיפי קטגוריה חדשה...</option></select>
        </div>`;
    }
    return `<label>${f.label}</label><input type="${f.type}" name="${f.name}" ${f.required ? 'required' : ''} placeholder="${f.placeholder||''}" value="${escapeHtml(pre)}" />${f.hint ? `<div class="item-sub" style="margin-top:-8px;margin-bottom:10px">${f.hint}</div>` : ''}`;
  }).join('');
  modal.classList.remove('hidden');
}

// הוספת קטגוריה חדשה דינמית
document.addEventListener('change', (e) => {
  if (e.target.matches('[data-dynamic-source]') && e.target.value === '__add_new__') {
    const source = e.target.dataset.dynamicSource;
    const newCat = prompt('שם הקטגוריה החדשה:');
    if (newCat && newCat.trim()) {
      const list = state.settings[source] || [];
      const trimmed = newCat.trim();
      if (!list.includes(trimmed)) {
        list.push(trimmed);
        state.settings[source] = list;
        saveState();
      }
      // הוספת אופציה חדשה ל-select ובחירתה
      const newOption = document.createElement('option');
      newOption.value = trimmed;
      newOption.textContent = trimmed;
      e.target.insertBefore(newOption, e.target.lastElementChild);
      e.target.value = trimmed;
    } else {
      e.target.value = e.target.options[0]?.value || '';
    }
  }
});

document.addEventListener('click', (e) => {
  const add = e.target.closest('[data-add]');
  if (add) openAdd(add.dataset.add);
  if (e.target.id === 'modalCancel' || e.target === modal) closeModal();
});

function closeModal() { modal.classList.add('hidden'); currentAdd = null; currentEditId = null; }

modalForm.addEventListener('submit', (e) => {
  e.preventDefault();
  // איסוף נתוני dmyDate והפיכתם לפורמט YYYY-MM-DD
  modalForm.querySelectorAll('[data-dmy-field]').forEach(hidden => {
    const fname = hidden.dataset.dmyField;
    const day = modalForm.querySelector(`[name="__dmy_day_${fname}"]`)?.value;
    const month = modalForm.querySelector(`[name="__dmy_month_${fname}"]`)?.value;
    const year = modalForm.querySelector(`[name="__dmy_year_${fname}"]`)?.value;
    if (day && month && year) {
      hidden.value = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    }
  });
  const data = Object.fromEntries(new FormData(modalForm).entries());
  // ניקוי שדות עזר __dmy_*
  Object.keys(data).filter(k => k.startsWith('__dmy_')).forEach(k => delete data[k]);
  if (!currentAdd) return;
  const editing = currentEditId;
  function updateOrPush(arr, newObj) {
    if (editing) {
      const idx = arr.findIndex(x => x.id === editing);
      if (idx !== -1) {
        // שומרים שדות שאסור לאבד (createdAt, takenDates)
        const existing = arr[idx];
        arr[idx] = { ...existing, ...newObj, id: existing.id };
      }
    } else {
      arr.push({ id: uid(), ...newObj });
    }
  }

  if (currentAdd === 'appointment') updateOrPush(state.appointments, { ...data, repeat: data.repeat || 'none' });
  if (currentAdd === 'med')         updateOrPush(state.meds, { ...data, takenDates: [] });
  if (currentAdd === 'test')        updateOrPush(state.tests, data);
  if (currentAdd === 'birthday')    updateOrPush(state.birthdays, data);
  if (currentAdd === 'note')        updateOrPush(state.notes, { text: data.text, createdAt: Date.now() });
  if (currentAdd === 'fitness')     updateOrPush(state.fitness, { ...data, createdAt: Date.now() });
  if (currentAdd && currentAdd.startsWith('custom:')) {
    const cmId = currentAdd.slice(7);
    const cm = (state.customModules || []).find(x => x.id === cmId);
    if (cm) updateOrPush(cm.items, { ...data, createdAt: Date.now() });
  }
  saveState();
  const wasCustom = currentAdd && currentAdd.startsWith('custom:');
  const cmId = wasCustom ? currentAdd.slice(7) : null;
  closeModal();
  showToast('נשמר ✓');
  if (wasCustom) {
    renderCustomModule(cmId);
  } else {
    showScreen(document.querySelector('.screen.active').dataset.screen);
  }
});

// ===== הגדרות: עיר / התראות / גיבוי =====
document.addEventListener('input', (e) => {
  if (e.target.id === 'apptSearch') {
    apptSearchTerm = e.target.value.trim();
    document.getElementById('apptSearchClear').hidden = !apptSearchTerm;
    renderAppointments();
  }
});

document.addEventListener('click', (e) => {
  if (e.target.id === 'apptSearchClear') {
    const input = document.getElementById('apptSearch');
    input.value = '';
    apptSearchTerm = '';
    document.getElementById('apptSearchClear').hidden = true;
    renderAppointments();
  }
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'citySelect') {
    state.settings.city = e.target.value;
    saveState();
    showToast('עיר נשמרה');
  }
  if (e.target.id === 'importFile') {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!confirm('זה ידרוס את כל המידע הנוכחי. להמשיך?')) return;
        state = deepMerge(structuredClone(defaultState), parsed);
        saveState();
        showToast('הגיבוי נטען ✓');
        showScreen('home');
      } catch {
        alert('הקובץ לא תקין');
      }
    };
    reader.readAsText(file);
  }
});

document.addEventListener('click', (e) => {
  if (e.target.id === 'enableNotifyBtn') requestNotifications();
  if (e.target.id === 'exportBtn') exportBackup();
  if (e.target.id === 'importBtn') document.getElementById('importFile').click();
  if (e.target.id === 'recordNoteBtn') startRecording();
  if (e.target.id === 'saveApiKeyBtn') saveApiKey();
  if (e.target.id === 'aiSuggestBtn') generateAiSuggestion();
  if (e.target.id === 'connectSyncBtn') connectSync();
  if (e.target.id === 'disconnectSyncBtn') disconnectSync();

  // ניווט בלוח
  if (e.target.id === 'calPrev') { calCursor.setMonth(calCursor.getMonth()-1); renderCalendarMonth(); return; }
  if (e.target.id === 'calNext') { calCursor.setMonth(calCursor.getMonth()+1); renderCalendarMonth(); return; }
  if (e.target.id === 'calToday') {
    calCursor = (() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; })();
    renderCalendarMonth();
    return;
  }
  if (e.target.id === 'calTitle') { openMonthPicker(); return; }
  if (e.target.id === 'pickerCancel' || e.target.id === 'monthPicker') { closeMonthPicker(); return; }
  const pyBtn = e.target.closest('[data-picker-year]');
  if (pyBtn) {
    pickerYearSelected = Number(pyBtn.dataset.pickerYear);
    renderMonthPicker();
    return;
  }
  const pmBtn = e.target.closest('[data-picker-month]');
  if (pmBtn) {
    const month = Number(pmBtn.dataset.pickerMonth);
    calCursor = new Date(pickerYearSelected, month, 1);
    closeMonthPicker();
    renderCalendarMonth();
    return;
  }
  if (e.target.id === 'calToggle') {
    const order = ['month', 'week', 'list'];
    const cur = state.settings.calendarView || 'month';
    const next = order[(order.indexOf(cur) + 1) % order.length];
    state.settings.calendarView = next;
    saveState();
    renderAppointments();
    showToast(next === 'month' ? '📅 חודש' : next === 'week' ? '🗓️ שבוע' : '📋 רשימה');
    return;
  }

  // לחיצה על יום בלוח
  const dayCell = e.target.closest('[data-day]');
  if (dayCell) {
    selectedDayISO = dayCell.dataset.day;
    showScreen('day');
    return;
  }

  // הוספת פגישה ליום
  if (e.target.id === 'dayAddBtn') {
    openAdd('appointment', { date: selectedDayISO });
    return;
  }

  // טוגל מודול
  const toggleMod = e.target.closest('[data-toggle-module]');
  if (toggleMod) {
    const key = toggleMod.dataset.toggleModule;
    state.settings.modules = state.settings.modules || {};
    state.settings.modules[key] = !(state.settings.modules[key] !== false);
    saveState();
    renderModuleToggles();
    applyHomeMenuButtons();
    showToast(state.settings.modules[key] ? 'הופעל' : 'כובה');
    return;
  }

  // הוספת מודול מותאם
  if (e.target.id === 'addCustomModule') {
    const name = prompt('שם המודול (לדוגמה: ספרים שקראתי, טיולים, מתכונים):');
    if (!name || !name.trim()) return;
    const icon = prompt('אייקון (אימוג׳י אחד, לדוגמה: 📚 🌍 🍳):', '⭐') || '⭐';
    const newMod = { id: 'cm_' + uid(), name: name.trim(), icon: icon.trim(), categories: [], items: [] };
    state.customModules = state.customModules || [];
    state.customModules.push(newMod);
    saveState();
    renderModuleToggles();
    applyHomeMenuButtons();
    showToast('מודול נוסף ✓');
    return;
  }

  // עריכת שם/אייקון של מודול מותאם
  const renameCustom = e.target.closest('[data-rename-custom]');
  if (renameCustom) {
    const id = renameCustom.dataset.renameCustom;
    const cm = (state.customModules || []).find(x => x.id === id);
    if (!cm) return;
    const name = prompt('שם המודול:', cm.name);
    if (name === null) return;
    if (name.trim()) cm.name = name.trim();
    const icon = prompt('אייקון:', cm.icon || '⭐');
    if (icon !== null && icon.trim()) cm.icon = icon.trim();
    saveState();
    renderModuleToggles();
    applyHomeMenuButtons();
    showToast('עודכן');
    return;
  }

  // מחיקת מודול מותאם
  const delCustom = e.target.closest('[data-delete-custom]');
  if (delCustom) {
    const id = delCustom.dataset.deleteCustom;
    const cm = (state.customModules || []).find(x => x.id === id);
    if (!cm) return;
    if (!confirm(`למחוק את המודול "${cm.name}" ואת כל הפריטים שבו?`)) return;
    state.customModules = state.customModules.filter(x => x.id !== id);
    saveState();
    renderModuleToggles();
    applyHomeMenuButtons();
    showToast('נמחק');
    return;
  }

  // הוספת פריט למודול מותאם
  if (e.target.matches('[data-custom-add]')) {
    openCustomAdd(e.target.dataset.customAdd);
    return;
  }

  // מחיקת פריט ממודול מותאם
  const customDel = e.target.closest('[data-custom-del]');
  if (customDel) {
    const cmId = customDel.dataset.customDel;
    const itemId = customDel.dataset.itemId;
    if (!confirm('למחוק?')) return;
    const cm = (state.customModules || []).find(x => x.id === cmId);
    if (cm) {
      cm.items = cm.items.filter(it => it.id !== itemId);
      saveState();
      showToast('נמחק');
      renderCustomModule(cmId);
    }
    return;
  }

  // שינוי שם מודול
  const renameMod = e.target.closest('[data-rename-module]');
  if (renameMod) {
    const key = renameMod.dataset.renameModule;
    const current = getModuleLabel(key);
    const newName = prompt('שינוי שם המודול:\n(השאר ריק כדי לחזור לברירת מחדל)', current);
    if (newName === null) return; // ביטול
    state.settings.moduleLabels = state.settings.moduleLabels || {};
    const trimmed = newName.trim();
    if (!trimmed || trimmed === DEFAULT_LABELS[key]) {
      delete state.settings.moduleLabels[key];
    } else {
      state.settings.moduleLabels[key] = trimmed;
    }
    saveState();
    renderModuleToggles();
    showToast('שם עודכן');
    return;
  }
});

function saveApiKey() {
  const input = document.getElementById('apiKeyInput');
  const val = input.value.trim();
  if (!val) { showToast('הכניסי מפתח'); return; }
  if (!val.startsWith('sk-ant-')) {
    if (!confirm('המפתח לא נראה כמו מפתח Anthropic תקין (אמור להתחיל ב-sk-ant-). לשמור בכל זאת?')) return;
  }
  state.settings.apiKey = val;
  saveState();
  showToast('המפתח נשמר ✓');
  renderSettings();
}

async function generateAiSuggestion() {
  if (!state.settings.apiKey) {
    showToast('צריך מפתח API. עבור להגדרות.');
    return;
  }
  if (!state.shabbat.type) {
    showToast('בחרי קודם בשרי/חלבי/פרווה');
    return;
  }
  const btn = document.getElementById('aiSuggestBtn');
  const box = document.getElementById('shabbatSuggestions');
  btn.disabled = true;
  btn.textContent = '✨ חושב על משהו טעים...';
  box.classList.add('visible');
  box.innerHTML = '<p style="text-align:center;color:#7b5cd6">רגע, ה-AI חושב על תפריט חדש לדניאלה...</p>';

  const type = state.shabbat.type;
  const kosherRule = type === 'בשרי'
    ? 'אסור בשר וחלב ביחד - אסור גבינות, חמאה, חלב, שמנת, גלידה. דברים פרווה (ירקות, פירות, דגנים, ביצים, דגים בנפרד מהארוחה) - מותרים.'
    : type === 'חלבי'
    ? 'אסור בשר/עוף/הודו ושום מוצר בשרי. כל החלבי והפרווה מותר.'
    : 'בלי בשר ובלי חלב. רק ירקות, פירות, דגנים, קטניות, ביצים, דגים.';

  const systemPrompt = `את עוזרת בישול שמציעה תפריטים לארוחת ערב שבת בכשרות יהודית.
- חובה: כל המצרכים כשרים (סימני כשרות).
- חוקי כשרות: ${kosherRule}
- ענה בעברית בלבד, בפורמט HTML פשוט.
- כלול: שם התפריט, רשימת מנות (קדם-מנה, מנה ראשונה, מנה עיקרית, תוספות, קינוח).
- הצעה אחת בלבד, מקורית ולא חוזרת על הקלאסי הצפוי.
- אורך מתאים: 6-9 מנות, לא יותר.`;

  const userPrompt = `הציעי תפריט יצירתי לארוחת ערב שבת ${type}. בבקשה ב-HTML עם <h3> לכותרת, <ul><li> למנות, ו-<p> להערות. שני שורה אחת קצרה בסוף עם רעיון לרוטב/תיבול מיוחד.`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': state.settings.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 800,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`שגיאה ${resp.status}: ${err.slice(0,200)}`);
    }
    const data = await resp.json();
    const text = (data.content || []).map(c => c.text || '').join('\n').trim();
    if (!text) throw new Error('תשובה ריקה מה-AI');

    state.shabbat.lastSuggestion = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <span style="background:#fff3cd;color:#856404;padding:3px 10px;border-radius:10px;font-size:13px;font-weight:600">✨ הצעת AI</span>
      </div>
      ${text}
    `;
    saveState();
    renderShabbat();
  } catch (err) {
    box.innerHTML = `<p style="color:#c0392b">לא הצלחתי להתחבר ל-AI. ${escapeHtml(err.message)}</p><p class="hint">נסי שוב או השתמשי בכפתורי בשרי/חלבי/פרווה להצעה מובנית.</p>`;
  } finally {
    btn.disabled = false;
    btn.textContent = '✨ הצעה חדשה מ-AI';
  }
}

async function requestNotifications() {
  if (!('Notification' in window)) {
    alert('הדפדפן הזה לא תומך בהתראות');
    return;
  }
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    state.settings.notifications = true;
    saveState();
    showToast('יופי! התראות הופעלו 🔔');
    new Notification('היומן של דניאלה', { body: 'התראות עובדות! כאן תקבלי תזכורות.', icon: 'icons/icon.svg' });
  } else {
    showToast('לא ניתנה הרשאה');
  }
  renderSettings();
}

function exportBackup() {
  const data = JSON.stringify(state, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `daniela-backup-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('הגיבוי נשמר 💾');
}

// ===== מנוע התראות (פועל כל דקה אם הלשונית פתוחה) =====
const NOTIFIED_KEY = 'daniela-notified-v1';
function getNotifiedSet() {
  try { return new Set(JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '[]')); }
  catch { return new Set(); }
}
function saveNotifiedSet(set) {
  // שמירה רק של 200 אחרונים
  const arr = [...set].slice(-200);
  localStorage.setItem(NOTIFIED_KEY, JSON.stringify(arr));
}

function fireNotification(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try { new Notification(title, { body, icon: 'icons/icon.svg', tag: title + body }); } catch {}
}

function checkReminders() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const now = new Date();
  const today = todayISO();
  const nowHM = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
  const notified = getNotifiedSet();

  // תרופות - אם הגיעה השעה ולא לקחה היום
  state.meds.forEach(m => {
    if (!m.time) return;
    if (m.time <= nowHM && !(m.takenDates || []).includes(today)) {
      const key = `med:${m.id}:${today}`;
      if (!notified.has(key)) {
        fireNotification('זמן תרופה 💊', `הגיע הזמן לקחת ${m.name}`);
        notified.add(key);
      }
    }
  });

  // פגישות - 30 דק׳ לפני
  state.appointments.forEach(a => {
    if (!repeatMatches(a, today) || !a.time) return;
    const [hh, mm] = a.time.split(':').map(Number);
    const apptTime = new Date(now); apptTime.setHours(hh, mm, 0, 0);
    const diffMin = (apptTime - now) / 60000;
    if (diffMin <= 30 && diffMin > 0) {
      const key = `appt:${a.id}:${today}`;
      if (!notified.has(key)) {
        fireNotification('פגישה מתקרבת 📅', `${a.title} בעוד ${Math.round(diffMin)} דקות`);
        notified.add(key);
      }
    }
  });

  saveNotifiedSet(notified);
}

// ===== עזרי תצוגה =====
function emptyMsg(text) { return `<div class="empty-list">${escapeHtml(text)}</div>`; }

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 1800);
}

// ===== service worker =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      // בדיקה אקטיבית לעדכונים בכל פתיחה
      reg.update();
      // האזנה להודעה מה-SW על עדכון
      navigator.serviceWorker.addEventListener('message', (e) => {
        if (e.data?.type === 'SW_UPDATED') {
          showUpdateBanner();
        }
      });
      // בדיקה אם יש worker שמחכה
      if (reg.waiting) showUpdateBanner();
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner();
          }
        });
      });
    } catch {}
  });
}

function showUpdateBanner() {
  if (document.getElementById('updateBanner')) return;
  const banner = document.createElement('div');
  banner.id = 'updateBanner';
  banner.style.cssText = 'position:fixed;bottom:90px;inset-inline:18px;background:#2b1d4a;color:white;padding:14px 18px;border-radius:14px;z-index:300;box-shadow:0 10px 30px rgba(0,0,0,0.3);display:flex;align-items:center;gap:12px;font-weight:600;';
  banner.innerHTML = '<span style="flex:1">✨ גרסה חדשה זמינה</span><button style="background:white;color:#2b1d4a;border:none;padding:8px 14px;border-radius:10px;font-weight:700;font-family:inherit;cursor:pointer">רענן</button>';
  banner.querySelector('button').addEventListener('click', () => location.reload());
  document.body.appendChild(banner);
}

// ===== התחלה =====
function start() {
  showScreen('home');
  checkReminders();
  // התחלת סנכרון אם מוגדר
  if (state.settings.firebaseConfig && state.settings.familyCode) {
    initCloudSync();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}

// רענון הבית + בדיקת תזכורות כל דקה
setInterval(() => {
  if (document.querySelector('.screen.active')?.dataset.screen === 'home') renderHome();
  checkReminders();
}, 60_000);
