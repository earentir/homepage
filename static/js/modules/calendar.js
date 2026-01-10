// Calendar and Events module

// Event structure: { id, title, date, time }
// date format: YYYY-MM-DD, time format: HH:MM (24h)

let calendarEvents = [];
let currentCalendarDate = new Date();
let currentWeekDate = new Date();

// Calendar settings
let calendarSettings = {
  workWeekOnly: false,  // true = Mon-Fri only
  startDay: 1,          // 0 = Sunday, 1 = Monday (default)
  dimWeekends: false    // true = show weekends dimmer in month view
};

function loadCalendarSettings() {
  try {
    const saved = window.loadFromStorage('calendarSettings');
    if (saved) {
      calendarSettings = { ...calendarSettings, ...saved };
    }
  } catch (e) {
    if (window.debugError) window.debugError('calendar', 'Failed to load calendar settings:', e);
  }
}

function saveCalendarSettings() {
  window.saveToStorage('calendarSettings', calendarSettings);
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

    html += `<div class="${classes}" data-date="${dateStr}" title="${hasEvents ? 'Has events' : ''}">${day}</div>`;
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
  alert(msg);
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
        <div class="${classes}" data-date="${day.date}">
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

function deleteEvent(id) {
  if (!confirm('Delete this event?')) return;

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
        alert(data.error || 'Validation failed');
        return;
      }
    } else {
      alert('Validation error: Unable to validate input');
      return;
    }
  } catch (e) {
    if (window.debugError) window.debugError('calendar', 'Error validating event:', e);
    alert('Validation error: Unable to connect to server');
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
}

// Expose functions globally
window.initCalendar = initCalendar;
window.renderCalendar = renderCalendar;
window.renderWeekCalendar = renderWeekCalendar;
window.renderUpcomingEvents = renderUpcomingEvents;
window.renderEventsPreferenceList = renderEventsPreferenceList;
