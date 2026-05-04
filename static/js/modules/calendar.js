// Calendar and Events module

// Event structure: { id, title, date, time }
// date format: YYYY-MM-DD, time format: HH:MM (24h)

let calendarEvents = [];
let currentCalendarDate = new Date();
let currentWeekDate = new Date();

// Calendar settings
let calendarSettings = {
  workWeekOnly: false,
  startDay: 1,
  dimWeekends: false,
  weekendShade: false,
  weekendShadeColor: 'rgba(0,0,0,0.12)',
  timeOffShade: true,
  timeOffColor: 'rgba(140,100,30,0.22)',
  timeOffDates: []
};

/** Normalize time-off list to [{ date: YYYY-MM-DD, title: string }], unique by date (stable merge). */
function normalizeTimeOffDatesArray(arr) {
  if (!Array.isArray(arr)) return [];
  const m = new Map();
  arr.forEach(function(item) {
    if (typeof item === 'string') {
      const d = item.trim().slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(d) && !m.has(d)) m.set(d, '');
      return;
    }
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const d = String(item.date || '').trim().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
      const t =
        item.title != null
          ? String(item.title).trim()
          : item.label != null
            ? String(item.label).trim()
            : item.name != null
              ? String(item.name).trim()
              : '';
      const prev = m.get(d) || '';
      m.set(d, t || prev);
    }
  });
  return Array.from(m.entries())
    .map(function(kv) {
      return { date: kv[0], title: kv[1] };
    })
    .sort(function(a, b) {
      return a.date.localeCompare(b.date);
    });
}

function mergeTimeOffLists(existing, incoming) {
  const m = new Map();
  normalizeTimeOffDatesArray(existing).forEach(function(e) {
    m.set(e.date, e.title || '');
  });
  normalizeTimeOffDatesArray(incoming).forEach(function(e) {
    const prev = m.get(e.date) || '';
    const t = (e.title || '').trim();
    m.set(e.date, t ? t : prev);
  });
  return Array.from(m.entries())
    .map(function(kv) {
      return { date: kv[0], title: kv[1] };
    })
    .sort(function(a, b) {
      return a.date.localeCompare(b.date);
    });
}

function timeOffMapFromSettings() {
  const m = new Map();
  (calendarSettings.timeOffDates || []).forEach(function(e) {
    if (e && typeof e === 'object' && e.date && /^\d{4}-\d{2}-\d{2}$/.test(e.date)) {
      m.set(e.date, e.title || '');
    } else if (typeof e === 'string') {
      const d = e.trim().slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(d) && !m.has(d)) m.set(d, '');
    }
  });
  return m;
}

function normalizeCalendarSettingsShape() {
  calendarSettings.timeOffDates = normalizeTimeOffDatesArray(calendarSettings.timeOffDates || []);
  if (typeof calendarSettings.weekendShadeColor !== 'string' || !calendarSettings.weekendShadeColor) {
    calendarSettings.weekendShadeColor = 'rgba(0,0,0,0.12)';
  }
  if (typeof calendarSettings.timeOffColor !== 'string' || !calendarSettings.timeOffColor) {
    calendarSettings.timeOffColor = 'rgba(140,100,30,0.22)';
  }
}

function clamp255(n) {
  n = Number(n);
  if (isNaN(n)) return 0;
  return Math.max(0, Math.min(255, Math.round(n)));
}

function clamp01(x) {
  x = Number(x);
  if (isNaN(x)) return 1;
  return Math.max(0, Math.min(1, x));
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(function(x) {
    return clamp255(x).toString(16).padStart(2, '0');
  }).join('');
}

/** Parse rgba/rgb/#hex into { hex: '#rrggbb', opacity: 0–100 } for the colour dialog. */
function parseCssColorToHexAndOpacity(css) {
  const s = (css || '').trim();
  if (!s) return { hex: '#000000', opacity: 12 };
  const rgbaMatch = s.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/i);
  if (rgbaMatch) {
    const r = clamp255(parseInt(rgbaMatch[1], 10));
    const g = clamp255(parseInt(rgbaMatch[2], 10));
    const b = clamp255(parseInt(rgbaMatch[3], 10));
    const a = clamp01(parseFloat(rgbaMatch[4]));
    return { hex: rgbToHex(r, g, b), opacity: Math.round(a * 100) };
  }
  const rgbMatch = s.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  if (rgbMatch) {
    const r = clamp255(parseInt(rgbMatch[1], 10));
    const g = clamp255(parseInt(rgbMatch[2], 10));
    const b = clamp255(parseInt(rgbMatch[3], 10));
    return { hex: rgbToHex(r, g, b), opacity: 100 };
  }
  const hex6 = s.match(/^#([0-9a-f]{6})$/i);
  if (hex6) return { hex: '#' + hex6[1].toLowerCase(), opacity: 100 };
  const hex3 = s.match(/^#([0-9a-f]{3})$/i);
  if (hex3) {
    const x = hex3[1];
    const hex = '#' + x[0] + x[0] + x[1] + x[1] + x[2] + x[2];
    return { hex: hex.toLowerCase(), opacity: 100 };
  }
  return { hex: '#000000', opacity: 12 };
}

function mergeHexOpacity(hexStr, opacityPct) {
  const hex = (hexStr || '#000000').trim();
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return 'rgba(0,0,0,0.12)';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  let p = parseInt(String(opacityPct).replace(/[^0-9.-]/g, ''), 10);
  if (isNaN(p)) p = 100;
  const a = clamp01(p / 100);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}

function loadCalendarSettings() {
  try {
    const saved = window.loadFromStorage('calendarSettings');
    if (saved) {
      calendarSettings = { ...calendarSettings, ...saved };
    }
  } catch (e) {
    if (window.debugError) window.debugError('calendar', 'Failed to load calendar settings:', e);
  }
  normalizeCalendarSettingsShape();
}

function saveCalendarSettings() {
  normalizeCalendarSettingsShape();
  window.saveToStorage('calendarSettings', calendarSettings);
}

/**
 * Parse time-off JSON into [{ date, title }].
 * Supports: ["2026-01-01"], [{"date":"…","title":"…"}],
 * {"dates":[…]}, {"byYear":{"2026":["01-01",{"date":"01-01","title":"…"}]}},
 * one file per year: {"year":2026,"days":[{"date":"01-01","title":"…"}]}.
 */
function parseTimeOffFromJSON(text) {
  const raw = JSON.parse(text);
  const acc = new Map();

  function add(dateStr, title) {
    const d = String(dateStr).trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    const t = title != null ? String(title).trim() : '';
    const prev = acc.get(d) || '';
    acc.set(d, t || prev);
  }

  function consumeItem(entry, yearHint) {
    if (entry == null) return;
    if (typeof entry === 'string') {
      const e = entry.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(e.slice(0, 10))) add(e.slice(0, 10), '');
      else if (yearHint && /^\d{2}-\d{2}$/.test(e)) add(yearHint + '-' + e, '');
      return;
    }
    if (typeof entry === 'object' && !Array.isArray(entry)) {
      let ds = String(entry.date || entry.day || '').trim();
      const tit =
        entry.title != null
          ? String(entry.title).trim()
          : entry.label != null
            ? String(entry.label).trim()
            : entry.name != null
              ? String(entry.name).trim()
              : '';
      if (!ds) return;
      if (/^\d{4}-\d{2}-\d{2}$/.test(ds.slice(0, 10))) {
        add(ds.slice(0, 10), tit);
      } else if (/^\d{2}-\d{2}$/.test(ds) && yearHint) {
        add(yearHint + '-' + ds, tit);
      }
    }
  }

  if (Array.isArray(raw)) {
    raw.forEach(function(x) {
      consumeItem(x, null);
    });
  } else if (raw && typeof raw === 'object') {
    const y = raw.year != null ? String(raw.year).trim() : '';
    const yearHint = /^\d{4}$/.test(y) ? y : null;
    if (Array.isArray(raw.days)) {
      raw.days.forEach(function(x) {
        consumeItem(x, yearHint);
      });
    }
    if (Array.isArray(raw.dates)) {
      raw.dates.forEach(function(x) {
        consumeItem(x, yearHint);
      });
    }
    if (raw.byYear && typeof raw.byYear === 'object') {
      Object.keys(raw.byYear).forEach(function(year) {
        const arr = raw.byYear[year];
        if (!Array.isArray(arr)) return;
        const yh = /^\d{4}$/.test(year) ? year : null;
        arr.forEach(function(x) {
          consumeItem(x, yh);
        });
      });
    }
  }

  return Array.from(acc.entries())
    .map(function(kv) {
      return { date: kv[0], title: kv[1] };
    })
    .sort(function(a, b) {
      return a.date.localeCompare(b.date);
    });
}

function syncCalendarPreferenceWidgets() {
  const wk = document.getElementById('pref-weekend-shade');
  if (wk) wk.checked = !!calendarSettings.weekendShade;
  const to = document.getElementById('pref-timeoff-shade');
  if (to) to.checked = calendarSettings.timeOffShade !== false;
  const ta = document.getElementById('cal-timeoff-json');
  if (ta) {
    try {
      ta.value = JSON.stringify(calendarSettings.timeOffDates || [], null, 2);
    } catch (err) {
      ta.value = '';
    }
  }
}

function openCalendarColorPicker(title, key) {
  const existing = typeof calendarSettings[key] === 'string' ? calendarSettings[key] : '';
  const parsed = parseCssColorToHexAndOpacity(existing);
  showModuleEditDialog({
    title: title,
    icon: 'fas fa-paint-brush',
    fields: [
      { id: 'color', label: 'Colour', type: 'color', required: false },
      {
        id: 'opacity',
        label: 'Opacity % (0 = transparent, 100 = solid)',
        type: 'number',
        min: 0,
        max: 100,
        step: 1,
        required: false
      }
    ],
    values: { color: parsed.hex, opacity: parsed.opacity },
    onSave: function(formData) {
      calendarSettings[key] = mergeHexOpacity(formData.color, formData.opacity);
      saveCalendarSettings();
      syncCalendarPreferenceWidgets();
      renderCalendar();
      renderWeekCalendar();
    }
  });
}

function monthCellBackgroundStyle(dateStr, dayOfWeek, isToday, timeOffMap) {
  if (isToday) return '';
  const map = timeOffMap || timeOffMapFromSettings();
  const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
  const isTimeOff = map.has(dateStr);
  if (calendarSettings.timeOffShade !== false && isTimeOff) {
    return 'background:' + (calendarSettings.timeOffColor || 'rgba(140,100,30,0.22)') + ';';
  }
  if (calendarSettings.weekendShade && isWeekend) {
    return 'background:' + (calendarSettings.weekendShadeColor || 'rgba(0,0,0,0.12)') + ';';
  }
  return '';
}

// Load events from localStorage
function loadEvents() {
  try {
    const saved = window.loadFromStorage('calendarEvents');
    if (saved) {
      calendarEvents = saved;
    }
  } catch (e) {
    if (window.debugError) window.debugError('calendar', 'Failed to load calendar events:', e);
    calendarEvents = [];
  }
}

function saveEvents() {
  window.saveToStorage('calendarEvents', calendarEvents);
}

// Generate unique ID
function generateEventId() {
  return 'evt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Get events for a specific date - uses backend processing
async function getEventsForDate(dateStr) {
  if (calendarEvents.length === 0) return [];

  try {
    const res = await fetch(`/api/calendar/events-for-date?date=${encodeURIComponent(dateStr)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(calendarEvents),
      cache: 'no-store'
    });
    if (res.ok) {
      const data = await res.json();
      if (data.events && Array.isArray(data.events)) {
        return data.events;
      }
    }
  } catch (e) {
    if (window.debugError) window.debugError('calendar', 'Error getting events for date:', e);
  }

  return [];
}

// Get next N upcoming events - uses backend processing
async function getUpcomingEvents(count = 5) {
  if (calendarEvents.length === 0) return [];

  try {
    const res = await fetch(`/api/calendar/process?count=${count}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(calendarEvents),
      cache: 'no-store'
    });
    if (res.ok) {
      const data = await res.json();
      if (data.upcomingEvents) {
        return data.upcomingEvents;
      }
    }
  } catch (e) {
    if (window.debugError) window.debugError('calendar', 'Error processing upcoming events:', e);
  }

  // Backend processing failed - return empty array
  return [];
}

// Date formatting is now handled by backend - events include formattedDate field

// Render the calendar month view - uses backend processing
async function renderCalendar() {
  const container = document.getElementById('calendarGrid');
  if (!container) return;

  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();

  // Try to get month data from backend
  let monthData = null;
  try {
    const res = await fetch(`/api/calendar/month?year=${year}&month=${month}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(calendarEvents),
      cache: 'no-store'
    });
    if (res.ok) {
      monthData = await res.json();
    }
  } catch (e) {
    if (window.debugError) window.debugError('calendar', 'Error processing month calendar:', e);
  }

  // If backend data not available, show error
  if (!monthData) {
    container.innerHTML = '<div class="muted" style="padding:8px 0;">Unable to load calendar</div>';
    return;
  }

  const titleEl = document.getElementById('calendarTitle');
  if (titleEl) {
    titleEl.textContent = monthData.monthName + ' ' + year;
  }

  const firstDayOfMonth = monthData.firstDay;
  const daysInMonth = monthData.daysInMonth;
  const todayStr = monthData.today;
  const datesWithEvents = monthData.datesWithEvents;
  const timeOffMap = timeOffMapFromSettings();

  // Adjust day names based on startDay setting
  const startDay = calendarSettings.startDay || 0; // 0 = Sunday, 1 = Monday
  const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const reorderedDayNames = [];
  for (let i = 0; i < 7; i++) {
    reorderedDayNames.push(dayNames[(startDay + i) % 7]);
  }

  let html = '<div class="cal-header">';
  reorderedDayNames.forEach((d, idx) => {
    const dayIndex = (startDay + idx) % 7;
    const isWeekend = (dayIndex === 0 || dayIndex === 6);
    const dimClass = (isWeekend && calendarSettings.dimWeekends) ? ' dim' : '';
    html += `<div class="cal-day-name${dimClass}">${d}</div>`;
  });
  html += '</div><div class="cal-days">';

  // Calculate offset for first day of month based on startDay
  let offset = firstDayOfMonth - startDay;
  if (offset < 0) offset += 7;

  // Empty cells for days before first of month
  for (let i = 0; i < offset; i++) {
    const dayIndex = (startDay + i) % 7;
    const isWeekend = (dayIndex === 0 || dayIndex === 6);
    const dimClass = (isWeekend && calendarSettings.dimWeekends) ? ' dim' : '';
    html += `<div class="cal-day empty${dimClass}"></div>`;
  }

  // Days of month
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayOfWeek = new Date(year, month, day).getDay();
    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
    const hasEvents = datesWithEvents.includes(dateStr);
    const isToday = dateStr === todayStr;

    let classes = 'cal-day';
    if (hasEvents) classes += ' has-event';
    if (isToday) classes += ' today';
    if (isWeekend && calendarSettings.dimWeekends) classes += ' dim';

    const bgStyle = monthCellBackgroundStyle(dateStr, dayOfWeek, isToday, timeOffMap);
    const styleAttr = bgStyle ? ' style="' + bgStyle + '"' : '';
    const offTitle = timeOffMap.get(dateStr) || '';
    const tipParts = [];
    if (offTitle) tipParts.push(offTitle);
    if (hasEvents) tipParts.push('Has events');
    const tipStr = tipParts.length
      ? (window.escapeHtml ? window.escapeHtml(tipParts.join(' — ')) : tipParts.join(' — '))
      : '';
    const titleAttr = tipStr ? ' title="' + tipStr + '"' : '';

    html += `<div class="${classes}" data-date="${dateStr}"${titleAttr}${styleAttr}>${day}</div>`;
  }

  html += '</div>';
  container.innerHTML = html;

  // Add click handlers for days with events
  container.querySelectorAll('.cal-day.has-event').forEach(el => {
    el.addEventListener('click', () => {
      const date = el.getAttribute('data-date');
      showDayEvents(date); // showDayEvents is now async but we don't await it (fire and forget)
    });
  });
}

// Show events for a specific day (tooltip or modal)
async function showDayEvents(dateStr) {
  const events = await getEventsForDate(dateStr);
  if (events.length === 0) return;

  let msg = 'Events for ' + dateStr + ':\n\n';
  events.forEach(evt => {
    msg += (evt.time || '--:--') + ' - ' + evt.title + '\n';
  });
  await window.popup.alert(msg, 'Calendar Events');
}

// Navigate calendar
function prevMonth() {
  currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
  renderCalendar(); // renderCalendar is now async but we don't await it (fire and forget)
}

function nextMonth() {
  currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
  renderCalendar(); // renderCalendar is now async but we don't await it (fire and forget)
}

function goToCurrentMonth() {
  currentCalendarDate = new Date();
  renderCalendar(); // renderCalendar is now async but we don't await it (fire and forget)
}

// Render week calendar - uses backend processing
async function renderWeekCalendar() {
  const container = document.getElementById('weekCalendarGrid');
  if (!container) return;

  const daysToShow = calendarSettings.workWeekOnly ? 5 : 7;
  container.setAttribute('data-cols', daysToShow);

  // Try to get week data from backend
  let weekData = null;
  try {
    const weekStartStr = currentWeekDate.toISOString().split('T')[0];
    const res = await fetch(`/api/calendar/week?weekStart=${weekStartStr}&workWeekOnly=${calendarSettings.workWeekOnly}&startDay=${calendarSettings.startDay || 1}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(calendarEvents),
      cache: 'no-store'
    });
    if (res.ok) {
      weekData = await res.json();
    }
  } catch (e) {
    if (window.debugError) window.debugError('calendar', 'Error processing week calendar:', e);
  }

  // Use backend data if available
  if (weekData && weekData.days) {
    const titleEl = document.getElementById('weekCalendarTitle');
    if (titleEl) {
      const startDate = new Date(weekData.weekStart);
      const endDate = new Date(weekData.weekEnd);
      const startMonth = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const endMonth = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      titleEl.textContent = startMonth + ' - ' + endMonth;
    }

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const timeOffMap = timeOffMapFromSettings();
    let html = '<div class="week-header">';
    
    for (let i = 0; i < daysToShow; i++) {
      const day = weekData.days[i];
      if (day) {
        html += `<div class="week-day-name">${day.dayName}</div>`;
      }
    }
    html += '</div><div class="week-days">';

    for (let i = 0; i < daysToShow && i < weekData.days.length; i++) {
      const day = weekData.days[i];
      let classes = 'week-day';
      if (day.hasEvents) classes += ' has-event';
      if (day.isToday) classes += ' today';

      let dow = 0;
      if (day.date) {
        const parts = day.date.split('-');
        if (parts.length === 3) {
          dow = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)).getDay();
        }
      }
      const bgStyle = day.date ? monthCellBackgroundStyle(day.date, dow, !!day.isToday, timeOffMap) : '';
      const weekStyleAttr = bgStyle ? ' style="' + bgStyle + '"' : '';
      const offTitle = day.date ? timeOffMap.get(day.date) || '' : '';
      const weekTipParts = [];
      if (offTitle) weekTipParts.push(offTitle);
      if (day.hasEvents) weekTipParts.push('Has events');
      const weekTipStr = weekTipParts.length
        ? (window.escapeHtml ? window.escapeHtml(weekTipParts.join(' — ')) : weekTipParts.join(' — '))
        : '';
      const weekTitleAttr = weekTipStr ? ' title="' + weekTipStr + '"' : '';

      let eventsHtml = '';
      if (day.events && day.events.length > 0) {
        day.events.slice(0, 3).forEach(evt => {
          eventsHtml += `<div class="week-event" title="${window.escapeHtml(evt.title)}">${evt.time ? evt.time + ' ' : ''}${window.escapeHtml(evt.title)}</div>`;
        });
        if (day.events.length > 3) {
          eventsHtml += `<div class="week-event more">+${day.events.length - 3} more</div>`;
        }
      }

      html += `
        <div class="${classes}" data-date="${day.date}"${weekTitleAttr}${weekStyleAttr}>
          <div class="week-day-num">${day.dayNumber}</div>
          <div class="week-events">${eventsHtml}</div>
        </div>
      `;
    }

    html += '</div>';
    container.innerHTML = html;

    // Click handlers
    container.querySelectorAll('.week-day').forEach(el => {
      el.addEventListener('click', () => {
        const date = el.getAttribute('data-date');
        showDayEvents(date); // showDayEvents is now async but we don't await it (fire and forget)
      });
    });
    return;
  }

  // Backend data not available - show error
  container.innerHTML = '<div class="muted" style="padding:8px 0;">Unable to load week calendar</div>';
}

function prevWeek() {
  currentWeekDate.setDate(currentWeekDate.getDate() - 7);
  renderWeekCalendar(); // renderWeekCalendar is now async but we don't await it (fire and forget)
}

function nextWeek() {
  currentWeekDate.setDate(currentWeekDate.getDate() + 7);
  renderWeekCalendar(); // renderWeekCalendar is now async but we don't await it (fire and forget)
}

function goToCurrentWeek() {
  currentWeekDate = new Date();
  renderWeekCalendar(); // renderWeekCalendar is now async but we don't await it (fire and forget)
}

// Render upcoming events module - uses backend processing
async function renderUpcomingEvents() {
  const container = document.getElementById('upcomingEventsList');
  if (!container) return;

  const events = await getUpcomingEvents(5);

  if (events.length === 0) {
    container.innerHTML = '<div class="muted" style="padding:8px 0;">No upcoming events</div>';
    return;
  }

  // Format dates from backend
  let html = '';
  for (const evt of events) {
    // Backend provides formattedDate, but if missing use basic format
    const formattedDate = evt.formattedDate || (evt.date + (evt.time ? ' ' + evt.time : ''));
    html += `
      <div class="kv" style="flex-direction:column; align-items:flex-start; gap:4px;">
        <div class="v" style="font-weight:500;">${window.escapeHtml(evt.title)}</div>
        <div class="muted" style="font-size:0.85em;">${formattedDate}</div>
      </div>
    `;
  }
  container.innerHTML = html;
}

// Using escapeHtml from core.js

function moveEventUp(index) {
  if (window.moveArrayItemUp && window.moveArrayItemUp(calendarEvents, index)) {
    saveEvents();
    renderEventsPreferenceList();
    renderCalendar(); // renderCalendar is now async but we don't await it (fire and forget)
    renderWeekCalendar(); // renderWeekCalendar is now async but we don't await it (fire and forget)
    renderUpcomingEvents(); // renderUpcomingEvents is now async but we don't await it (fire and forget)
  }
}

function moveEventDown(index) {
  if (window.moveArrayItemDown && window.moveArrayItemDown(calendarEvents, index)) {
    saveEvents();
    renderEventsPreferenceList();
    renderCalendar(); // renderCalendar is now async but we don't await it (fire and forget)
    renderWeekCalendar(); // renderWeekCalendar is now async but we don't await it (fire and forget)
    renderUpcomingEvents(); // renderUpcomingEvents is now async but we don't await it (fire and forget)
  }
}

function moveEvent(fromIndex, toIndex) {
  if (window.moveArrayItem && window.moveArrayItem(calendarEvents, fromIndex, toIndex)) {
    saveEvents();
    renderEventsPreferenceList();
    renderCalendar(); // renderCalendar is now async but we don't await it (fire and forget)
    renderWeekCalendar(); // renderWeekCalendar is now async but we don't await it (fire and forget)
    renderUpcomingEvents(); // renderUpcomingEvents is now async but we don't await it (fire and forget)
  }
}

// Render events list in preferences
function renderEventsPreferenceList() {
  const list = document.getElementById('eventsList');
  if (!list) return;

  list.innerHTML = '';

  if (calendarEvents.length === 0) {
    list.innerHTML = '<div class="small" style="color:var(--muted);padding:10px;">No events yet. Click "Add" to create one.</div>';
    return;
  }

  calendarEvents.forEach((evt, index) => {
    const item = document.createElement('div');
    item.className = 'module-item';
    item.draggable = true;
    item.dataset.index = index;
    item.dataset.eventId = evt.id;
    const canMoveUp = index > 0;
    const canMoveDown = index < calendarEvents.length - 1;
    item.innerHTML = `
      <div class="module-icon drag-handle" style="cursor: grab; color: var(--muted);" title="Drag to reorder">
        <i class="fas fa-grip-vertical"></i>
      </div>
      <div class="module-icon"><i class="fas fa-calendar-alt"></i></div>
      <div class="module-info">
        <div class="module-name">${window.escapeHtml(evt.title)}</div>
        <div class="module-desc">${evt.date} ${evt.time || ''}</div>
      </div>
      <div class="module-controls">
        <button class="btn-small move-event-up-btn" data-index="${index}" ${!canMoveUp ? 'disabled' : ''} title="Move up">
          <i class="fas fa-arrow-up"></i>
        </button>
        <button class="btn-small move-event-down-btn" data-index="${index}" ${!canMoveDown ? 'disabled' : ''} title="Move down">
          <i class="fas fa-arrow-down"></i>
        </button>
        <button class="btn-small edit-event-btn" data-index="${index}"><i class="fas fa-edit"></i></button>
        <button class="btn-small delete-event-btn" data-index="${index}"><i class="fas fa-trash"></i></button>
      </div>
    `;
    list.appendChild(item);

    // Setup drag and drop using common function
    if (window.setupDragAndDrop) {
      window.setupDragAndDrop(item, index, calendarEvents, (fromIndex, toIndex) => {
        moveEvent(fromIndex, toIndex);
      }, () => {
        saveEvents();
        renderEventsPreferenceList();
        renderCalendar(); // renderCalendar is now async but we don't await it (fire and forget)
        renderWeekCalendar(); // renderWeekCalendar is now async but we don't await it (fire and forget)
        renderUpcomingEvents(); // renderUpcomingEvents is now async but we don't await it (fire and forget)
      });
    }

    // Setup move buttons using common function
    if (window.setupMoveButtons) {
      window.setupMoveButtons(item, index, calendarEvents.length,
        'move-event-up-btn', 'move-event-down-btn',
        () => moveEventUp(index),
        () => moveEventDown(index)
      );
    }

    item.querySelector('.edit-event-btn').addEventListener('click', () => {
      editEvent(evt.id);
    });

    item.querySelector('.delete-event-btn').addEventListener('click', () => {
      deleteEvent(evt.id);
    });
  });
}

// Show event form for add/edit
function showEventForm(event = null) {
  const form = document.getElementById('eventForm');
  if (!form) return;

  form.style.display = 'block';

  document.getElementById('event-id').value = event ? event.id : '';
  document.getElementById('event-title').value = event ? event.title : '';
  document.getElementById('event-date').value = event ? event.date : new Date().toISOString().split('T')[0];
  document.getElementById('event-time').value = event ? (event.time || '') : '';

  document.getElementById('event-title').focus();
}

function hideEventForm() {
  const form = document.getElementById('eventForm');
  if (form) form.style.display = 'none';
}

function editEvent(id) {
  const event = calendarEvents.find(e => e.id === id);
  if (event) {
    showEventForm(event);
  }
}

function editEventByIndex(index) {
  if (index >= 0 && index < calendarEvents.length) {
    showEventForm(calendarEvents[index]);
  }
}

async function deleteEvent(id) {
  const confirmed = await window.popup.confirm('Delete this event?', 'Confirm Delete');
  if (!confirmed) return;

  calendarEvents = calendarEvents.filter(e => e.id !== id);
  saveEvents();
  renderEventsPreferenceList();
  renderCalendar(); // renderCalendar is now async but we don't await it (fire and forget)
  renderWeekCalendar(); // renderWeekCalendar is now async but we don't await it (fire and forget)
  renderUpcomingEvents(); // renderUpcomingEvents is now async but we don't await it (fire and forget)
}

async function saveEventFromForm() {
  const id = document.getElementById('event-id').value;
  const title = document.getElementById('event-title').value.trim();
  const date = document.getElementById('event-date').value;
  const time = document.getElementById('event-time').value;

  // Validate using backend
  try {
    const res = await fetch('/api/utils/validate-input', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'calendar-event',
        data: { title, date, time }
      })
    });
    if (res.ok) {
      const data = await res.json();
      if (!data.valid) {
        await window.popup.alert(data.error || 'Validation failed', 'Validation Error');
        return;
      }
    } else {
      await window.popup.alert('Validation error: Unable to validate input', 'Error');
      return;
    }
  } catch (e) {
    if (window.debugError) window.debugError('calendar', 'Error validating event:', e);
    await window.popup.alert('Validation error: Unable to connect to server', 'Error');
    return;
  }

  if (id) {
    // Edit existing
    const idx = calendarEvents.findIndex(e => e.id === id);
    if (idx !== -1) {
      calendarEvents[idx] = { id, title, date, time };
    }
  } else {
    // Add new
    calendarEvents.push({
      id: generateEventId(),
      title,
      date,
      time
    });
  }

  saveEvents();
  hideEventForm();
  renderEventsPreferenceList();
  renderCalendar();
  renderWeekCalendar();
  renderUpcomingEvents();
}

// Initialize calendar module
function initCalendar() {
  loadEvents();
  loadCalendarSettings();
  renderCalendar();
  renderWeekCalendar();
  renderUpcomingEvents();

  // Month calendar navigation buttons
  const calTodayBtn = document.getElementById('calTodayBtn');
  const prevBtn = document.getElementById('calPrevBtn');
  const nextBtn = document.getElementById('calNextBtn');
  if (calTodayBtn) calTodayBtn.addEventListener('click', goToCurrentMonth);
  if (prevBtn) prevBtn.addEventListener('click', prevMonth);
  if (nextBtn) nextBtn.addEventListener('click', nextMonth);

  // Week calendar navigation buttons
  const weekPrevBtn = document.getElementById('weekPrevBtn');
  const weekNextBtn = document.getElementById('weekNextBtn');
  const weekTodayBtn = document.getElementById('weekTodayBtn');
  if (weekPrevBtn) weekPrevBtn.addEventListener('click', prevWeek);
  if (weekNextBtn) weekNextBtn.addEventListener('click', nextWeek);
  if (weekTodayBtn) weekTodayBtn.addEventListener('click', goToCurrentWeek);

  function openCalendarTabForNewEvent() {
    if (window.openPreferencesTab) {
      window.openPreferencesTab('calendar', function() {
        if (window.showEventForm) window.showEventForm();
      });
    }
  }
  const calCardAdd = document.getElementById('calCardAddEventBtn');
  if (calCardAdd) calCardAdd.addEventListener('click', openCalendarTabForNewEvent);
  const eventsCardAdd = document.getElementById('eventsCardAddBtn');
  if (eventsCardAdd) eventsCardAdd.addEventListener('click', openCalendarTabForNewEvent);
  const weekCardAdd = document.getElementById('weekCardAddEventBtn');
  if (weekCardAdd) weekCardAdd.addEventListener('click', openCalendarTabForNewEvent);

  // Add event button in preferences
  const addBtn = document.getElementById('addEventBtn');
  if (addBtn) {
    addBtn.addEventListener('click', () => showEventForm());
  }

  // Save button in form
  const saveBtn = document.getElementById('saveEventBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveEventFromForm);
  }

  // Cancel button in form
  const cancelBtn = document.getElementById('cancelEventBtn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', hideEventForm);
  }

  // Week calendar settings
  const workWeekCheckbox = document.getElementById('pref-work-week');
  const startDaySelect = document.getElementById('pref-week-start-day');

  if (workWeekCheckbox) {
    workWeekCheckbox.checked = calendarSettings.workWeekOnly;
    workWeekCheckbox.addEventListener('change', () => {
      calendarSettings.workWeekOnly = workWeekCheckbox.checked;
      saveCalendarSettings();
      renderWeekCalendar(); // renderWeekCalendar is now async but we don't await it (fire and forget)
    });
  }

  if (startDaySelect) {
    startDaySelect.value = calendarSettings.startDay;
    startDaySelect.addEventListener('change', () => {
      calendarSettings.startDay = parseInt(startDaySelect.value, 10);
      saveCalendarSettings();
      renderWeekCalendar(); // renderWeekCalendar is now async but we don't await it (fire and forget)
    });
  }

  // Month calendar settings
  const dimWeekendsCheckbox = document.getElementById('pref-dim-weekends');
  if (dimWeekendsCheckbox) {
    dimWeekendsCheckbox.checked = calendarSettings.dimWeekends;
    dimWeekendsCheckbox.addEventListener('change', () => {
      calendarSettings.dimWeekends = dimWeekendsCheckbox.checked;
      saveCalendarSettings();
      renderCalendar(); // renderCalendar is now async but we don't await it (fire and forget)
    });
  }

  const weekendShadeCb = document.getElementById('pref-weekend-shade');
  if (weekendShadeCb) {
    weekendShadeCb.checked = !!calendarSettings.weekendShade;
    weekendShadeCb.addEventListener('change', () => {
      calendarSettings.weekendShade = weekendShadeCb.checked;
      saveCalendarSettings();
      renderCalendar();
      renderWeekCalendar();
    });
  }
  const weekendColorBtn = document.getElementById('pref-weekend-shade-color-btn');
  if (weekendColorBtn) {
    weekendColorBtn.addEventListener('click', () => {
      openCalendarColorPicker('Weekend background colour', 'weekendShadeColor');
    });
  }

  const timeOffShadeCb = document.getElementById('pref-timeoff-shade');
  if (timeOffShadeCb) {
    timeOffShadeCb.checked = calendarSettings.timeOffShade !== false;
    timeOffShadeCb.addEventListener('change', () => {
      calendarSettings.timeOffShade = timeOffShadeCb.checked;
      saveCalendarSettings();
      renderCalendar();
      renderWeekCalendar();
    });
  }
  const timeOffColorBtn = document.getElementById('pref-timeoff-color-btn');
  if (timeOffColorBtn) {
    timeOffColorBtn.addEventListener('click', () => {
      openCalendarColorPicker('Time-off / holiday background', 'timeOffColor');
    });
  }

  const mergeBtn = document.getElementById('cal-timeoff-import-merge-btn');
  const replaceBtn = document.getElementById('cal-timeoff-replace-btn');
  const exportBtn = document.getElementById('cal-timeoff-export-btn');
  const clearBtn = document.getElementById('cal-timeoff-clear-btn');
  const ta = document.getElementById('cal-timeoff-json');

  async function applyTimeOffFromTextarea(merge) {
    if (!ta) return;
    const text = ta.value.trim();
    if (!text) {
      await window.popup.alert('Paste JSON first.', 'Import');
      return;
    }
    try {
      const parsed = parseTimeOffFromJSON(text);
      if (parsed.length === 0 && merge) {
        await window.popup.alert(
          'No valid dates found. Examples: {"year":2026,"days":[{"date":"01-01","title":"New Year"}]}, [{"date":"2026-01-01","title":"…"}], or legacy ["2026-01-01"].',
          'Import'
        );
        return;
      }
      if (merge) {
        calendarSettings.timeOffDates = mergeTimeOffLists(calendarSettings.timeOffDates || [], parsed);
      } else {
        calendarSettings.timeOffDates = parsed;
      }
      saveCalendarSettings();
      syncCalendarPreferenceWidgets();
      renderCalendar();
      renderWeekCalendar();
      await window.popup.alert('Imported ' + calendarSettings.timeOffDates.length + ' day(s).', 'Time-off');
    } catch (err) {
      await window.popup.alert('Invalid JSON: ' + (err && err.message ? err.message : String(err)), 'Import error');
    }
  }
  if (mergeBtn) mergeBtn.addEventListener('click', () => { applyTimeOffFromTextarea(true); });
  if (replaceBtn) replaceBtn.addEventListener('click', () => { applyTimeOffFromTextarea(false); });
  if (exportBtn) exportBtn.addEventListener('click', function() {
    syncCalendarPreferenceWidgets();
    const blob = new Blob(
      [JSON.stringify({ dates: normalizeTimeOffDatesArray(calendarSettings.timeOffDates || []) }, null, 2)],
      { type: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'homepage-timeoff.json';
    a.click();
    URL.revokeObjectURL(url);
  });
  if (clearBtn) clearBtn.addEventListener('click', async function() {
    const ok = await window.popup.confirm('Clear all imported time-off days (and titles)?', 'Clear');
    if (!ok) return;
    calendarSettings.timeOffDates = [];
    saveCalendarSettings();
    syncCalendarPreferenceWidgets();
    renderCalendar();
    renderWeekCalendar();
  });

  syncCalendarPreferenceWidgets();
}

// ICS Calendar Management
let icsCalendars = [];

function loadICSCalendars() {
  try {
    const saved = window.loadFromStorage('icsCalendars');
    if (saved && Array.isArray(saved)) {
      icsCalendars = saved;
    } else {
      icsCalendars = [];
    }
  } catch (e) {
    if (window.debugError) window.debugError('calendar', 'Failed to load ICS calendars:', e);
    icsCalendars = [];
  }
}

function saveICSCalendars() {
  window.saveToStorage('icsCalendars', icsCalendars);
  // Sync to backend via both endpoints
  // 1. Direct ICS endpoint
  fetch('/api/calendar/ics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(icsCalendars)
  }).then(res => {
    if (res.ok) {
      if (window.debugLog) window.debugLog('calendar', 'Successfully synced ICS calendars to backend');
    } else {
      if (window.debugError) window.debugError('calendar', 'Failed to sync ICS calendars to backend:', res.status, res.statusText);
    }
  }).catch(err => {
    if (window.debugError) window.debugError('calendar', 'Failed to sync ICS calendars to backend:', err);
  });
  
  // 2. Also sync via storage sync endpoint (for consistency)
  const version = Date.now();
  fetch('/api/storage/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key: 'icsCalendars',
      value: icsCalendars,
      version: version
    })
  }).catch(err => {
    if (window.debugError) window.debugError('calendar', 'Failed to sync ICS calendars via storage sync:', err);
  });
}

function generateICSCalendarId() {
  return 'ics_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function renderICSCalendarsList() {
  const list = document.getElementById('icsCalendarsList');
  if (!list) return;
  list.innerHTML = '';

  if (icsCalendars.length === 0) {
    list.innerHTML = '<div class="small" style="color:var(--muted);padding:10px;">No ICS calendars yet. Click "Add" to add one.</div>';
    return;
  }

  icsCalendars.forEach((cal, index) => {
    const item = document.createElement('div');
    item.className = 'module-item';
    item.innerHTML = `
      <div class="module-icon" style="color: ${cal.color || '#3b88c3'}">
        <i class="fas fa-calendar"></i>
      </div>
      <div class="module-info">
        <div class="module-name">${window.escapeHtml ? window.escapeHtml(cal.name) : cal.name}</div>
        <div class="module-desc" style="font-size:11px; color:var(--muted);">ICS Calendar</div>
      </div>
      <div class="module-controls">
        <input type="checkbox" class="ics-calendar-toggle" data-index="${index}" ${cal.enabled ? 'checked' : ''} title="Enable/Disable">
        <button class="btn-small edit-ics-calendar-btn" data-index="${index}"><i class="fas fa-edit"></i></button>
        <button class="btn-small delete-ics-calendar-btn" data-index="${index}"><i class="fas fa-trash"></i></button>
      </div>
    `;
    list.appendChild(item);

    // Toggle enabled/disabled
    const toggle = item.querySelector('.ics-calendar-toggle');
    toggle.addEventListener('change', () => {
      icsCalendars[index].enabled = toggle.checked;
      saveICSCalendars();
    });

    // Edit button
    const editBtn = item.querySelector('.edit-ics-calendar-btn');
    editBtn.addEventListener('click', () => {
      showICSCalendarEditDialog(index);
    });

    // Delete button
    const deleteBtn = item.querySelector('.delete-ics-calendar-btn');
    deleteBtn.addEventListener('click', async () => {
      const confirmed = await window.popup.confirm(`Delete calendar "${cal.name}"?`, 'Confirm Delete');
      if (confirmed) {
        icsCalendars.splice(index, 1);
        saveICSCalendars();
        renderICSCalendarsList();
      }
    });
  });
}

function showICSCalendarEditDialog(editIndex = -1) {
  const calendar = editIndex >= 0 ? icsCalendars[editIndex] : { name: '', url: '', color: '#3b88c3', enabled: true };
  const isNew = editIndex < 0;

  const fields = [
    {
      id: 'name',
      label: 'Name',
      type: 'text',
      placeholder: 'Calendar name',
      required: true
    },
    {
      id: 'url',
      label: 'ICS URL',
      type: 'text',
      placeholder: 'https://example.com/calendar.ics',
      required: true
    },
    {
      id: 'color',
      label: 'Color',
      type: 'color',
      required: false
    },
    {
      id: 'enabled',
      label: 'Enabled',
      type: 'checkbox',
      required: false
    }
  ];

  showModuleEditDialog({
    title: `${isNew ? 'Add' : 'Edit'} ICS Calendar`,
    icon: 'fas fa-calendar',
    fields: fields,
    values: calendar,
    onSave: async (formData) => {
      const name = formData.name.trim();
      const url = formData.url.trim();
      const color = formData.color;
      const enabled = formData.enabled;

      if (!name || !url) {
        await window.popup.alert('Please enter a name and URL', 'Input Required');
        return;
      }

      const calendarData = {
        id: isNew ? generateICSCalendarId() : calendar.id,
        name: name,
        url: url,
        color: color,
        enabled: enabled
      };

      if (isNew) {
        icsCalendars.push(calendarData);
      } else {
        icsCalendars[editIndex] = calendarData;
      }

      saveICSCalendars();
      renderICSCalendarsList();

      // Refresh calendar views to show new events
      renderCalendar();
      renderWeekCalendar();
      renderUpcomingEvents();
    }
  });
}

async function testICSCalendar() {
  const urlInput = document.getElementById('ics-calendar-url');
  const url = urlInput.value.trim();
  
  if (!url) {
    await window.popup.alert('Please enter a URL', 'Input Required');
    return;
  }

  try {
    const res = await fetch(`/api/calendar/ics/fetch?url=${encodeURIComponent(url)}`);
    const data = await res.json();
    
    if (data.valid) {
      await window.popup.alert('ICS calendar is valid!', 'Success');
    } else {
      await window.popup.alert('Error: ' + (data.error || 'Invalid ICS calendar'), 'Error');
    }
  } catch (e) {
    await window.popup.alert('Error testing calendar: ' + e.message, 'Error');
  }
}


// Load ICS cache TTL setting
function loadICSCacheTTL() {
  const ttlInput = document.getElementById('ics-cache-ttl');
  if (!ttlInput) return;
  
  const saved = window.loadFromStorage('icsCacheTTL');
  if (saved !== null && saved !== undefined) {
    ttlInput.value = saved;
  } else {
    ttlInput.value = 15; // Default 15 minutes
  }
}

// Save ICS cache TTL setting
function saveICSCacheTTL() {
  const ttlInput = document.getElementById('ics-cache-ttl');
  if (!ttlInput) return;
  
  const ttl = parseInt(ttlInput.value, 10);
  if (isNaN(ttl) || ttl < 1) {
    window.popup.alert('Cache TTL must be at least 1 minute', 'Invalid Input');
    ttlInput.value = 15;
    return;
  }
  
  window.saveToStorage('icsCacheTTL', ttl);
  
  // Sync to backend
  fetch('/api/storage/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key: 'icsCacheTTL',
      value: ttl,
      version: Date.now()
    })
  }).catch(err => {
    if (window.debugError) window.debugError('calendar', 'Failed to sync ICS cache TTL to backend:', err);
  });
}

// Refresh ICS calendars manually
async function refreshICSCalendars() {
  const refreshBtn = document.getElementById('refreshICSCalendarsBtn');
  if (!refreshBtn) return;
  
  const originalHTML = refreshBtn.innerHTML;
  refreshBtn.disabled = true;
  refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
  
  try {
    const res = await fetch('/api/calendar/ics/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const data = await res.json();
    
    if (data.success) {
      if (window.debugLog) window.debugLog('calendar', `ICS calendars refreshed: ${data.message}`);
      await window.popup.alert(`ICS calendars refreshed successfully!\n\n${data.message}`, 'Success');
      
      // Refresh calendar views
      renderCalendar();
      renderWeekCalendar();
      renderUpcomingEvents();
    } else {
      await window.popup.alert('Error refreshing ICS calendars: ' + (data.error || 'Unknown error'), 'Error');
    }
  } catch (e) {
    if (window.debugError) window.debugError('calendar', 'Failed to refresh ICS calendars:', e);
    await window.popup.alert('Error refreshing ICS calendars: ' + e.message, 'Error');
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.innerHTML = originalHTML;
  }
}

// Initialize ICS calendar management
function initICSCalendars() {
  loadICSCalendars();
  loadICSCacheTTL();
  renderICSCalendarsList();
  
  // Sync calendars to backend on initialization to ensure backend has them
  if (icsCalendars.length > 0) {
    saveICSCalendars();
  }

  const addBtn = document.getElementById('addICSCalendarBtn');
  if (addBtn) {
    addBtn.addEventListener('click', () => showICSCalendarEditDialog(-1));
  }


  // Cache TTL input
  const ttlInput = document.getElementById('ics-cache-ttl');
  if (ttlInput) {
    ttlInput.addEventListener('change', saveICSCacheTTL);
    ttlInput.addEventListener('blur', saveICSCacheTTL);
  }

  // Refresh button
  const refreshBtn = document.getElementById('refreshICSCalendarsBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', refreshICSCalendars);
  }
}

// Expose functions globally
window.initCalendar = initCalendar;
window.renderCalendar = renderCalendar;
window.renderWeekCalendar = renderWeekCalendar;
window.renderUpcomingEvents = renderUpcomingEvents;
window.renderEventsPreferenceList = renderEventsPreferenceList;
window.initICSCalendars = initICSCalendars;
window.showICSCalendarEditDialog = showICSCalendarEditDialog;
window.showEventForm = showEventForm;
window.hideEventForm = hideEventForm;
window.syncCalendarPreferenceWidgets = syncCalendarPreferenceWidgets;