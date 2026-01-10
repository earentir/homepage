// Monitoring module

const defaultMonitors = [];
let monitors = [];
const monitorDownSince = {};

// Load from localStorage
(function() {
  try {
    const saved = window.loadFromStorage('monitors');
    if (saved) {
      monitors = saved;
    } else {
      monitors = defaultMonitors;
    }
  } catch (e) {
    monitors = defaultMonitors;
  }

  try {
    const savedInterval = window.loadFromStorage('monitorInterval');
    if (savedInterval !== null && savedInterval !== undefined && window.timers) {
      const interval = typeof savedInterval === 'number' ? savedInterval : parseInt(savedInterval);
      window.timers.monitoring.interval = interval * 1000;
    }
  } catch (e) {}
})();

function saveMonitors() {
  try {
    window.saveToStorage('monitors', monitors);
  } catch (e) {}
}

function saveMonitorInterval(seconds) {
  try {
    // Save as number
    window.saveToStorage('monitorInterval', seconds);
    if (window.timers) {
      window.timers.monitoring.interval = seconds * 1000;
    }
  } catch (e) {}
}

function formatTimeSince(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remainingHours = hours % 24;
    return days + 'd' + (remainingHours > 0 ? ' ' + remainingHours + 'h' : '');
  } else if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return hours + 'h' + (remainingMinutes > 0 ? ' ' + remainingMinutes + 'm' : '');
  } else if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return minutes + 'm' + (remainingSeconds > 0 ? ' ' + remainingSeconds + 's' : '');
  } else {
    return seconds + 's';
  }
}

function renderMonitors() {
  const container = document.getElementById('monitoringContainer');
  if (!container) return;

  if (monitors.length === 0) {
    container.innerHTML = '<div class="small" style="color:var(--muted);">Add services in Preferences → Monitoring</div>';
    return;
  }

  container.innerHTML = '';
  monitors.forEach((mon, index) => {
    const row = document.createElement('div');
    row.className = 'kv monitor-row';
    row.dataset.index = index;

    const k = document.createElement('div');
    k.className = 'k';
    const isHttps = mon.type === 'http' && mon.url && mon.url.startsWith('https://');
    const sslIconHtml = isHttps ? '<span class="ssl-status" id="mon-ssl-' + index + '" style="margin-left:4px;"></span>' : '';
    k.innerHTML = '<span class="monitor-status" id="mon-status-' + index + '"><i class="fas fa-circle" style="color:var(--muted);"></i></span>' + sslIconHtml + ' ' + mon.name;

    const v = document.createElement('div');
    v.className = 'v mono';
    v.id = 'mon-result-' + index;
    v.textContent = '—';

    row.appendChild(k);
    row.appendChild(v);
    container.appendChild(row);
  });
}

async function checkMonitor(mon, index) {
  const statusEl = document.getElementById('mon-status-' + index);
  const resultEl = document.getElementById('mon-result-' + index);
  const sslEl = document.getElementById('mon-ssl-' + index);

  if (!statusEl || !resultEl) return;

  statusEl.innerHTML = '<i class="fas fa-spinner fa-spin" style="color:var(--accent);"></i>';

  try {
    let url = '/api/monitor?type=' + mon.type;
    if (mon.type === 'http') {
      url += '&url=' + encodeURIComponent(mon.url);
    } else if (mon.type === 'port') {
      url += '&host=' + encodeURIComponent(mon.host) + '&port=' + mon.port;
    } else if (mon.type === 'ping') {
      url += '&host=' + encodeURIComponent(mon.host);
    }

    const res = await fetch(url, {cache: 'no-store'});
    const data = await res.json();

    if (data.success) {
      delete monitorDownSince[index];
      statusEl.innerHTML = '<i class="fas fa-check-circle" style="color:#a3be8c;"></i>';
      resultEl.textContent = data.latency ? data.latency + 'ms' : 'OK';
      resultEl.style.color = '';
    } else {
      if (!monitorDownSince[index]) {
        monitorDownSince[index] = Date.now();
      }
      const timeSince = formatTimeSince(Date.now() - monitorDownSince[index]);
      statusEl.innerHTML = '<i class="fas fa-times-circle" style="color:#bf616a;"></i>';
      resultEl.textContent = timeSince;
      resultEl.style.color = '#bf616a';
    }

    if (sslEl) {
      if (data.sslExpiry) {
        const expiry = new Date(data.sslExpiry);
        const now = new Date();
        const daysUntilExpiry = Math.floor((expiry - now) / (1000 * 60 * 60 * 24));
        const expiryStr = expiry.toLocaleDateString() + ' (' + (daysUntilExpiry >= 0 ? daysUntilExpiry + ' days' : 'expired') + ')';

        let sslColor, sslIcon;
        if (daysUntilExpiry < 0) {
          sslColor = '#bf616a';
          sslIcon = 'fa-lock-open';
        } else if (daysUntilExpiry < 15) {
          sslColor = '#ebcb8b';
          sslIcon = 'fa-lock';
        } else {
          sslColor = '#a3be8c';
          sslIcon = 'fa-lock';
        }
        sslEl.innerHTML = '<i class="fas ' + sslIcon + '" style="color:' + sslColor + ';" title="SSL expires: ' + expiryStr + '"></i>';
      } else if (data.sslError) {
        sslEl.innerHTML = '<i class="fas fa-lock-open" style="color:#bf616a;" title="SSL error: ' + data.sslError + '"></i>';
      } else {
        sslEl.innerHTML = '';
      }
    }
  } catch (e) {
    if (!monitorDownSince[index]) {
      monitorDownSince[index] = Date.now();
    }
    const timeSince = formatTimeSince(Date.now() - monitorDownSince[index]);
    statusEl.innerHTML = '<i class="fas fa-times-circle" style="color:#bf616a;"></i>';
    resultEl.textContent = timeSince;
    resultEl.style.color = '#bf616a';
    if (sslEl) sslEl.innerHTML = '';
  }
}

function updateDownMonitorsDisplay() {
  Object.keys(monitorDownSince).forEach(index => {
    const resultEl = document.getElementById('mon-result-' + index);
    if (resultEl && monitorDownSince[index]) {
      const timeSince = formatTimeSince(Date.now() - monitorDownSince[index]);
      resultEl.textContent = timeSince;
    }
  });
}

async function refreshMonitoring() {
  for (let i = 0; i < monitors.length; i++) {
    await checkMonitor(monitors[i], i);
  }
  window.startTimer('monitoring');
}

function moveMonitorUp(index) {
  if (index <= 0) return;
  const temp = monitors[index];
  monitors[index] = monitors[index - 1];
  monitors[index - 1] = temp;

  // Update monitorDownSince indices
  const oldDownSince = monitorDownSince[index];
  const oldDownSincePrev = monitorDownSince[index - 1];
  if (oldDownSince !== undefined) {
    monitorDownSince[index - 1] = oldDownSince;
  } else {
    delete monitorDownSince[index - 1];
  }
  if (oldDownSincePrev !== undefined) {
    monitorDownSince[index] = oldDownSincePrev;
  } else {
    delete monitorDownSince[index];
  }

  saveMonitors();
  renderMonitorsList();
  renderMonitors();
  // Refresh to update status displays with new indices
  setTimeout(refreshMonitoring, 100);
}

function moveMonitorDown(index) {
  if (index >= monitors.length - 1) return;
  const temp = monitors[index];
  monitors[index] = monitors[index + 1];
  monitors[index + 1] = temp;

  // Update monitorDownSince indices
  const oldDownSince = monitorDownSince[index];
  const oldDownSinceNext = monitorDownSince[index + 1];
  if (oldDownSince !== undefined) {
    monitorDownSince[index + 1] = oldDownSince;
  } else {
    delete monitorDownSince[index + 1];
  }
  if (oldDownSinceNext !== undefined) {
    monitorDownSince[index] = oldDownSinceNext;
  } else {
    delete monitorDownSince[index];
  }

  saveMonitors();
  renderMonitorsList();
  renderMonitors();
  // Refresh to update status displays with new indices
  setTimeout(refreshMonitoring, 100);
}

function moveMonitor(fromIndex, toIndex) {
  if (fromIndex === toIndex) return;

  const item = monitors.splice(fromIndex, 1)[0];
  monitors.splice(toIndex, 0, item);

  // Rebuild monitorDownSince with correct indices after reordering
  const oldDownSince = { ...monitorDownSince };
  // Clear all
  Object.keys(monitorDownSince).forEach(key => {
    delete monitorDownSince[key];
  });

  // Map old indices to new indices based on the move
  for (let newIndex = 0; newIndex < monitors.length; newIndex++) {
    let oldIndex;
    if (newIndex === toIndex) {
      // This is the moved item
      oldIndex = fromIndex;
    } else if (fromIndex < toIndex) {
      // Moving down: items between fromIndex+1 and toIndex shift up by 1
      if (newIndex > fromIndex && newIndex <= toIndex) {
        oldIndex = newIndex - 1;
      } else {
        oldIndex = newIndex;
      }
    } else {
      // Moving up: items between toIndex and fromIndex-1 shift down by 1
      if (newIndex >= toIndex && newIndex < fromIndex) {
        oldIndex = newIndex + 1;
      } else {
        oldIndex = newIndex;
      }
    }

    if (oldDownSince[oldIndex] !== undefined) {
      monitorDownSince[newIndex] = oldDownSince[oldIndex];
    }
  }

  saveMonitors();
  renderMonitorsList();
  renderMonitors();
  // Refresh to update status displays with new indices
  setTimeout(refreshMonitoring, 100);
}

function renderMonitorsList() {
  const list = document.getElementById('monitorsList');
  if (!list) return;
  list.innerHTML = '';

  if (monitors.length === 0) {
    list.innerHTML = '<div class="small" style="color:var(--muted);padding:10px;">No services yet. Click "Add" to create one.</div>';
    return;
  }

  monitors.forEach((mon, index) => {
    const typeLabels = { http: 'HTTP', port: 'Port', ping: 'Ping' };
    const typeIcons = { http: 'fa-globe', port: 'fa-plug', ping: 'fa-satellite-dish' };

    let desc = '';
    if (mon.type === 'http') desc = mon.url;
    else if (mon.type === 'port') desc = mon.host + ':' + mon.port;
    else if (mon.type === 'ping') desc = mon.host;

    const canMoveUp = index > 0;
    const canMoveDown = index < monitors.length - 1;

    const item = document.createElement('div');
    item.className = 'module-item';
    item.draggable = true;
    item.dataset.index = index;
    item.innerHTML = `
      <div class="module-icon drag-handle" style="cursor: grab; color: var(--muted);" title="Drag to reorder">
        <i class="fas fa-grip-vertical"></i>
      </div>
      <div class="module-icon"><i class="fas ${typeIcons[mon.type] || 'fa-heartbeat'}"></i></div>
      <div class="module-info">
        <div class="module-name">${mon.name}</div>
        <div class="module-desc">${typeLabels[mon.type] || mon.type} • ${desc}</div>
      </div>
      <div class="module-controls">
        <button class="btn-small move-mon-up-btn" data-index="${index}" ${!canMoveUp ? 'disabled' : ''} title="Move up">
          <i class="fas fa-arrow-up"></i>
        </button>
        <button class="btn-small move-mon-down-btn" data-index="${index}" ${!canMoveDown ? 'disabled' : ''} title="Move down">
          <i class="fas fa-arrow-down"></i>
        </button>
        <button class="btn-small edit-mon-btn" data-index="${index}"><i class="fas fa-edit"></i></button>
        <button class="btn-small delete-mon-btn" data-index="${index}"><i class="fas fa-trash"></i></button>
      </div>
    `;
    list.appendChild(item);

    // Setup drag and drop using common function
    if (window.setupDragAndDrop) {
      window.setupDragAndDrop(item, index, monitors, (fromIndex, toIndex) => {
        moveMonitor(fromIndex, toIndex);
      }, () => {
        saveMonitors();
        renderMonitorsList();
        renderMonitors();
        setTimeout(refreshMonitoring, 100);
      });
    }

    // Setup move buttons using common function
    if (window.setupMoveButtons) {
      window.setupMoveButtons(item, index, monitors.length,
        'move-mon-up-btn', 'move-mon-down-btn',
        () => moveMonitorUp(index),
        () => moveMonitorDown(index)
      );
    }

    item.querySelector('.edit-mon-btn').addEventListener('click', () => {
      editMonitor(index);
    });

    item.querySelector('.delete-mon-btn').addEventListener('click', () => {
      if (confirm('Delete monitor "' + mon.name + '"?')) {
        delete monitorDownSince[index];
        monitors.splice(index, 1);
        saveMonitors();
        renderMonitorsList();
        renderMonitors();
      }
    });
  });
}

function editMonitor(index) {
  const mon = monitors[index];
  const nameInput = document.getElementById('mon-name');
  const typeSelect = document.getElementById('mon-type');
  const urlInput = document.getElementById('mon-url');
  const hostInput = document.getElementById('mon-host');
  const portInput = document.getElementById('mon-port');
  const form = document.getElementById('monitorForm');

  if (nameInput) nameInput.value = mon.name;
  if (typeSelect) typeSelect.value = mon.type;
  if (urlInput) urlInput.value = mon.url || '';
  if (hostInput) hostInput.value = mon.host || '';
  if (portInput) portInput.value = mon.port || '';
  if (form) {
    form.style.display = 'block';
    form.dataset.editIndex = index;
    updateMonitorFormFields();
  }
}

function updateMonitorFormFields() {
  const typeSelect = document.getElementById('mon-type');
  const urlRow = document.getElementById('mon-url-row');
  const hostRow = document.getElementById('mon-host-row');
  const portRow = document.getElementById('mon-port-row');

  if (!typeSelect) return;

  const type = typeSelect.value;
  if (type === 'http') {
    if (urlRow) urlRow.style.display = 'flex';
    if (hostRow) hostRow.style.display = 'none';
    if (portRow) portRow.style.display = 'none';
  } else if (type === 'port') {
    if (urlRow) urlRow.style.display = 'none';
    if (hostRow) hostRow.style.display = 'flex';
    if (portRow) portRow.style.display = 'flex';
  } else if (type === 'ping') {
    if (urlRow) urlRow.style.display = 'none';
    if (hostRow) hostRow.style.display = 'flex';
    if (portRow) portRow.style.display = 'none';
  }
}

function initMonitoring() {
  const typeSelect = document.getElementById('mon-type');
  const addBtn = document.getElementById('addMonitorBtn');
  const cancelBtn = document.getElementById('mon-cancel');
  const saveBtn = document.getElementById('mon-save');
  const intervalInput = document.getElementById('monitor-interval');
  const form = document.getElementById('monitorForm');

  if (typeSelect) {
    typeSelect.addEventListener('change', updateMonitorFormFields);
  }

  if (addBtn) {
    addBtn.addEventListener('click', () => {
      document.getElementById('mon-name').value = '';
      document.getElementById('mon-type').value = 'http';
      document.getElementById('mon-url').value = '';
      document.getElementById('mon-host').value = '';
      document.getElementById('mon-port').value = '';
      form.style.display = 'block';
      delete form.dataset.editIndex;
      updateMonitorFormFields();
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      form.style.display = 'none';
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const name = document.getElementById('mon-name').value.trim();
      const type = document.getElementById('mon-type').value;

      let mon = { id: 'mon-' + Date.now(), name, type };

      if (type === 'http') {
        const url = document.getElementById('mon-url').value.trim();
        mon.url = url;
      } else if (type === 'port') {
        const host = document.getElementById('mon-host').value.trim();
        const port = parseInt(document.getElementById('mon-port').value);
        mon.host = host;
        mon.port = port;
      } else if (type === 'ping') {
        const host = document.getElementById('mon-host').value.trim();
        mon.host = host;
      }

      // Validate using backend
      try {
        const res = await fetch('/api/utils/validate-input', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'monitoring',
            data: mon
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (!data.valid) {
            alert(data.error || 'Validation failed');
            return;
          }
        }
      } catch (e) {
        // Fallback to client-side validation if backend fails
        if (!name) {
          alert('Please enter a name');
          return;
        }
        if (type === 'http') {
          if (!mon.url) {
            alert('Please enter a URL');
            return;
          }
        } else if (type === 'port') {
          if (!mon.host) {
            alert('Please enter a host');
            return;
          }
          if (!mon.port || mon.port < 1 || mon.port > 65535) {
            alert('Please enter a valid port (1-65535)');
            return;
          }
        } else if (type === 'ping') {
          if (!mon.host) {
            alert('Please enter a host');
            return;
          }
        }
      }

      const editIndex = form.dataset.editIndex;
      if (editIndex !== undefined) {
        mon.id = monitors[parseInt(editIndex)].id;
        monitors[parseInt(editIndex)] = mon;
      } else {
        monitors.push(mon);
      }

      saveMonitors();
      renderMonitorsList();
      renderMonitors();
      refreshMonitoring();
      form.style.display = 'none';
    });
  }

  if (intervalInput && window.timers) {
    intervalInput.value = window.timers.monitoring.interval / 1000;
    intervalInput.addEventListener('change', () => {
      const val = Math.max(5, Math.min(3600, parseInt(intervalInput.value) || 60));
      intervalInput.value = val;
      saveMonitorInterval(val);
    });
  }

  // Modal observer
  const prefsModal = document.getElementById('prefsModal');
  if (prefsModal) {
    const observer = new MutationObserver(() => {
      if (prefsModal.classList.contains('active')) {
        renderMonitorsList();
        if (intervalInput && window.timers) {
          intervalInput.value = window.timers.monitoring.interval / 1000;
        }
      }
    });
    observer.observe(prefsModal, { attributes: true, attributeFilter: ['class'] });
  }

  renderMonitors();

  // Initial check and intervals
  setTimeout(refreshMonitoring, 2000);
  // Refresh is now handled via WebSocket refresh notifications (fallback only if WebSocket not connected)
  setInterval(() => {
    if (!window.wsIsConnected || !window.wsIsConnected()) {
      refreshMonitoring();
    }
  }, window.timers ? window.timers.monitoring.interval : 60000);
  setInterval(updateDownMonitorsDisplay, 1000);
}

// Export to window
window.monitors = monitors;
window.saveMonitors = saveMonitors;
window.renderMonitors = renderMonitors;
window.refreshMonitoring = refreshMonitoring;
window.renderMonitorsList = renderMonitorsList;
window.initMonitoring = initMonitoring;
