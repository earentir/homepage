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
    const saved = localStorage.getItem('calendarSettings');
    if (saved) {
      calendarSettings = { ...calendarSettings, ...JSON.parse(saved) };
    }
  } catch (e) {
    if (window.debugError) window.debugError('calendar', 'Failed to load calendar settings:', e);
  }
}

function saveCalendarSettings() {
  localStorage.setItem('calendarSettings', JSON.stringify(calendarSettings));
}

// Load events from localStorage
function loadEvents() {
  try {
    const saved = localStorage.getItem('calendarEvents');
    if (saved) {
      calendarEvents = JSON.parse(saved);
    }
  } catch (e) {
    if (window.debugError) window.debugError('calendar', 'Failed to load calendar events:', e);
    calendarEvents = [];
  }
}

function saveEvents() {
  localStorage.setItem('calendarEvents', JSON.stringify(calendarEvents));
}

// Generate unique ID
function generateEventId() {
  return 'evt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Check if a date has events
function dateHasEvents(dateStr) {
  return calendarEvents.some(evt => evt.date === dateStr);
}

// Get events for a specific date
function getEventsForDate(dateStr) {
  return calendarEvents.filter(evt => evt.date === dateStr);
}

// Get next N upcoming events
function getUpcomingEvents(count = 5) {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const nowTime = now.toTimeString().slice(0, 5);

  return calendarEvents
    .filter(evt => {
      if (evt.date > todayStr) return true;
      if (evt.date === todayStr && evt.time >= nowTime) return true;
      return false;
    })
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.time.localeCompare(b.time);
    })
    .slice(0, count);
}

// Format date for display
function formatEventDate(dateStr, timeStr) {
  const date = new Date(dateStr + 'T' + (timeStr || '00:00'));
  const options = { weekday: 'short', month: 'short', day: 'numeric' };
  let formatted = date.toLocaleDateString('en-US', options);
  if (timeStr) {
    formatted += ' ' + timeStr;
  }
  return formatted;
}

// Render the calendar month view
function renderCalendar() {
  const container = document.getElementById('calendarGrid');
  if (!container) return;

  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();

  // Update month/year display
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'];
  const titleEl = document.getElementById('calendarTitle');
  if (titleEl) {
    titleEl.textContent = monthNames[month] + ' ' + year;
  }

  // First day of month and number of days
  const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 = Sunday, 1 = Monday, etc.
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

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
  // If startDay is 1 (Monday), we need to adjust firstDayOfMonth
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
    const hasEvents = dateHasEvents(dateStr);
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
      showDayEvents(date);
    });
  });
}

// Show events for a specific day (tooltip or modal)
function showDayEvents(dateStr) {
  const events = getEventsForDate(dateStr);
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
  renderCalendar();
}

function nextMonth() {
  currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
  renderCalendar();
}

function goToCurrentMonth() {
  currentCalendarDate = new Date();
  renderCalendar();
}

// Week calendar functions
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day - calendarSettings.startDay + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

function renderWeekCalendar() {
  const container = document.getElementById('weekCalendarGrid');
  if (!container) return;

  const daysToShow = calendarSettings.workWeekOnly ? 5 : 7;

  // Set data attribute for CSS grid columns
  container.setAttribute('data-cols', daysToShow);

  // Determine which days to show
  let startIdx = calendarSettings.startDay;
  if (calendarSettings.workWeekOnly) {
    startIdx = 1; // Always start Monday for work week
  }

  // Calculate actual week start based on startIdx
  const weekStart = getWeekStart(currentWeekDate);
  if (calendarSettings.workWeekOnly && calendarSettings.startDay !== 1) {
    // For work week, always start from Monday
    const day = weekStart.getDay();
    const diff = (day === 0) ? 1 : (1 - day + 7) % 7;
    weekStart.setDate(weekStart.getDate() + diff);
  }

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  // Day names
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Update week range display
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + daysToShow - 1);
  const titleEl = document.getElementById('weekCalendarTitle');
  if (titleEl) {
    const startMonth = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endMonth = weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    titleEl.textContent = startMonth + ' - ' + endMonth;
  }

  let html = '<div class="week-header">';

  // Generate headers
  for (let i = 0; i < daysToShow; i++) {
    const dayIdx = (startIdx + i) % 7;
    html += `<div class="week-day-name">${dayNames[dayIdx]}</div>`;
  }
  html += '</div><div class="week-days">';

  // Generate day cells - start from weekStart which already accounts for work week
  const currentDay = new Date(weekStart);

  for (let i = 0; i < daysToShow; i++) {
    const dateStr = currentDay.toISOString().split('T')[0];
    const dayNum = currentDay.getDate();
    const hasEvents = dateHasEvents(dateStr);
    const isToday = dateStr === todayStr;
    const events = getEventsForDate(dateStr);

    let classes = 'week-day';
    if (hasEvents) classes += ' has-event';
    if (isToday) classes += ' today';

    let eventsHtml = '';
    if (events.length > 0) {
      events.slice(0, 3).forEach(evt => {
        eventsHtml += `<div class="week-event" title="${window.escapeHtml(evt.title)}">${evt.time ? evt.time + ' ' : ''}${window.escapeHtml(evt.title)}</div>`;
      });
      if (events.length > 3) {
        eventsHtml += `<div class="week-event more">+${events.length - 3} more</div>`;
      }
    }

    html += `
      <div class="${classes}" data-date="${dateStr}">
        <div class="week-day-num">${dayNum}</div>
        <div class="week-events">${eventsHtml}</div>
      </div>
    `;

    currentDay.setDate(currentDay.getDate() + 1);
  }

  html += '</div>';
  container.innerHTML = html;

  // Click handlers
  container.querySelectorAll('.week-day').forEach(el => {
    el.addEventListener('click', () => {
      const date = el.getAttribute('data-date');
      showDayEvents(date);
    });
  });
}

function prevWeek() {
  currentWeekDate.setDate(currentWeekDate.getDate() - 7);
  renderWeekCalendar();
}

function nextWeek() {
  currentWeekDate.setDate(currentWeekDate.getDate() + 7);
  renderWeekCalendar();
}

function goToCurrentWeek() {
  currentWeekDate = new Date();
  renderWeekCalendar();
}

// Render upcoming events module
function renderUpcomingEvents() {
  const container = document.getElementById('upcomingEventsList');
  if (!container) return;

  const events = getUpcomingEvents(5);

  if (events.length === 0) {
    container.innerHTML = '<div class="muted" style="padding:8px 0;">No upcoming events</div>';
    return;
  }

  let html = '';
  events.forEach(evt => {
    html += `
      <div class="kv" style="flex-direction:column; align-items:flex-start; gap:4px;">
        <div class="v" style="font-weight:500;">${window.escapeHtml(evt.title)}</div>
        <div class="muted" style="font-size:0.85em;">${formatEventDate(evt.date, evt.time)}</div>
      </div>
    `;
  });
  container.innerHTML = html;
}

// Using escapeHtml from core.js

function moveEventUp(index) {
  if (window.moveArrayItemUp && window.moveArrayItemUp(calendarEvents, index)) {
    saveEvents();
    renderEventsPreferenceList();
    renderCalendar();
    renderWeekCalendar();
    renderUpcomingEvents();
  }
}

function moveEventDown(index) {
  if (window.moveArrayItemDown && window.moveArrayItemDown(calendarEvents, index)) {
    saveEvents();
    renderEventsPreferenceList();
    renderCalendar();
    renderWeekCalendar();
    renderUpcomingEvents();
  }
}

function moveEvent(fromIndex, toIndex) {
  if (window.moveArrayItem && window.moveArrayItem(calendarEvents, fromIndex, toIndex)) {
    saveEvents();
    renderEventsPreferenceList();
    renderCalendar();
    renderWeekCalendar();
    renderUpcomingEvents();
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
        renderCalendar();
        renderWeekCalendar();
        renderUpcomingEvents();
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
  renderCalendar();
  renderWeekCalendar();
  renderUpcomingEvents();
}

function saveEventFromForm() {
  const id = document.getElementById('event-id').value;
  const title = document.getElementById('event-title').value.trim();
  const date = document.getElementById('event-date').value;
  const time = document.getElementById('event-time').value;

  if (!title || !date) {
    alert('Title and date are required');
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
      renderWeekCalendar();
    });
  }

  if (startDaySelect) {
    startDaySelect.value = calendarSettings.startDay;
    startDaySelect.addEventListener('change', () => {
      calendarSettings.startDay = parseInt(startDaySelect.value, 10);
      saveCalendarSettings();
      renderWeekCalendar();
    });
  }

  // Month calendar settings
  const dimWeekendsCheckbox = document.getElementById('pref-dim-weekends');
  if (dimWeekendsCheckbox) {
    dimWeekendsCheckbox.checked = calendarSettings.dimWeekends;
    dimWeekendsCheckbox.addEventListener('change', () => {
      calendarSettings.dimWeekends = dimWeekendsCheckbox.checked;
      saveCalendarSettings();
      renderCalendar();
    });
  }
}

// Expose functions globally
window.initCalendar = initCalendar;
window.renderCalendar = renderCalendar;
window.renderWeekCalendar = renderWeekCalendar;
window.renderUpcomingEvents = renderUpcomingEvents;
window.renderEventsPreferenceList = renderEventsPreferenceList;
