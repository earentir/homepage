// SNMP module

let snmpQueries = [];
let snmpLastValues = {};

function loadSnmpQueries() {
  try {
    const saved = window.loadFromStorage('snmpQueries');
    if (saved) {
      snmpQueries = saved;
    }
    const savedLastValues = window.loadFromStorage('snmpLastValues');
    if (savedLastValues) {
      snmpLastValues = savedLastValues;
    }
  } catch (e) {}
}

function saveSnmpLastValues() {
  try {
    window.saveToStorage('snmpLastValues', snmpLastValues);
  } catch (e) {}
}

function saveSnmpQueries() {
  try {
    window.saveToStorage('snmpQueries', snmpQueries);
  } catch (e) {}
}

function renderSnmpQueries() {
  const container = document.getElementById('snmpContainer');
  if (!container) return;

  if (snmpQueries.length === 0) {
    container.innerHTML = '<div class="small" style="color:var(--muted);">Add queries in Preferences → SNMP</div>';
    return;
  }

  container.innerHTML = '';
  snmpQueries.forEach((query, index) => {
    const row = document.createElement('div');
    row.className = 'kv';
    row.dataset.index = index;

    const k = document.createElement('div');
    k.className = 'k';
    k.innerHTML = '<span class="monitor-status" id="snmp-status-' + index + '"><i class="fas fa-circle" style="color:var(--muted);"></i></span> ' + window.escapeHtml(query.title);

    const v = document.createElement('div');
    v.className = 'v mono';
    v.id = 'snmp-value-' + index;
    v.textContent = '—';

    row.appendChild(k);
    row.appendChild(v);
    container.appendChild(row);
  });
}

function moveSnmpQueryUp(index) {
  if (window.moveArrayItemUp && window.moveArrayItemUp(snmpQueries, index)) {
    // Note: snmpLastValues keys are based on host:port:oid, not index, so no update needed
    saveSnmpQueries();
    renderSnmpList();
    renderSnmpQueries();
    setTimeout(refreshSnmp, 100);
  }
}

function moveSnmpQueryDown(index) {
  if (window.moveArrayItemDown && window.moveArrayItemDown(snmpQueries, index)) {
    // Note: snmpLastValues keys are based on host:port:oid, not index, so no update needed
    saveSnmpQueries();
    renderSnmpList();
    renderSnmpQueries();
    setTimeout(refreshSnmp, 100);
  }
}

function moveSnmpQuery(fromIndex, toIndex) {
  if (window.moveArrayItem && window.moveArrayItem(snmpQueries, fromIndex, toIndex)) {
    // Note: snmpLastValues keys are based on host:port:oid, not index, so no update needed
    saveSnmpQueries();
    renderSnmpList();
    renderSnmpQueries();
    setTimeout(refreshSnmp, 100);
  }
}

function renderSnmpList() {
  const list = document.getElementById('snmpList');
  if (!list) return;

  list.innerHTML = '';

  if (snmpQueries.length === 0) {
    list.innerHTML = '<div class="small" style="color:var(--muted);padding:10px;">No queries yet. Click "Add" to create one.</div>';
    return;
  }

  snmpQueries.forEach((query, index) => {
    const item = document.createElement('div');
    item.className = 'module-item';
    item.draggable = true;
    item.dataset.index = index;
    const canMoveUp = index > 0;
    const canMoveDown = index < snmpQueries.length - 1;
    item.innerHTML = `
      <div class="module-icon drag-handle" style="cursor: grab; color: var(--muted);" title="Drag to reorder">
        <i class="fas fa-grip-vertical"></i>
      </div>
      <div class="module-icon"><i class="fas fa-network-wired"></i></div>
      <div class="module-info">
        <div class="module-name">${window.escapeHtml(query.title)}</div>
        <div class="module-desc">${window.escapeHtml(query.host)}:${query.port} - ${window.escapeHtml(query.oid)}</div>
      </div>
      <div class="module-controls">
        <button class="btn-small move-snmp-up-btn" data-index="${index}" ${!canMoveUp ? 'disabled' : ''} title="Move up">
          <i class="fas fa-arrow-up"></i>
        </button>
        <button class="btn-small move-snmp-down-btn" data-index="${index}" ${!canMoveDown ? 'disabled' : ''} title="Move down">
          <i class="fas fa-arrow-down"></i>
        </button>
        <button class="btn-small edit-snmp-btn" data-index="${index}"><i class="fas fa-edit"></i></button>
        <button class="btn-small delete-snmp-btn" data-index="${index}"><i class="fas fa-trash"></i></button>
      </div>
    `;
    list.appendChild(item);

    // Setup drag and drop using common function
    if (window.setupDragAndDrop) {
      window.setupDragAndDrop(item, index, snmpQueries, (fromIndex, toIndex) => {
        moveSnmpQuery(fromIndex, toIndex);
      }, () => {
        saveSnmpQueries();
        renderSnmpList();
        renderSnmpQueries();
        setTimeout(refreshSnmp, 100);
      });
    }

    // Setup move buttons using common function
    if (window.setupMoveButtons) {
      window.setupMoveButtons(item, index, snmpQueries.length,
        'move-snmp-up-btn', 'move-snmp-down-btn',
        () => moveSnmpQueryUp(index),
        () => moveSnmpQueryDown(index)
      );
    }

    item.querySelector('.edit-snmp-btn').addEventListener('click', () => editSnmpQuery(index));
    item.querySelector('.delete-snmp-btn').addEventListener('click', () => deleteSnmpQuery(index));
  });
}

function editSnmpQuery(index) {
  const query = snmpQueries[index];
  document.getElementById('snmp-title').value = query.title || '';
  document.getElementById('snmp-host').value = query.host || '';
  document.getElementById('snmp-port').value = query.port || 161;
  document.getElementById('snmp-community').value = query.community || '';
  document.getElementById('snmp-oid').value = query.oid || '';
  document.getElementById('snmp-display-type').value = query.displayType || 'show';
  document.getElementById('snmp-prefix').value = query.prefix || '';
  document.getElementById('snmp-suffix').value = query.suffix || '';
  document.getElementById('snmp-si-units').checked = query.siUnits || false;
  updateDivisorOptions();
  document.getElementById('snmp-divisor').value = query.divisor || '1';
  document.getElementById('snmpForm').style.display = 'block';
  document.getElementById('snmpForm').dataset.editIndex = index;
}

function deleteSnmpQuery(index) {
  if (confirm('Delete this SNMP query?')) {
    const query = snmpQueries[index];
    const queryKey = `${query.host}:${query.port}:${query.oid}`;
    delete snmpLastValues[queryKey];
    saveSnmpLastValues();

    snmpQueries.splice(index, 1);
    saveSnmpQueries();
    renderSnmpList();
    renderSnmpQueries();
  }
}

async function checkSnmpQuery(query, index) {
  const statusEl = document.getElementById(`snmp-status-${index}`);
  const valueEl = document.getElementById(`snmp-value-${index}`);

  if (!statusEl || !valueEl) return;

  statusEl.innerHTML = '<i class="fas fa-spinner fa-spin" style="color:var(--accent);"></i>';

  try {
    const url = `/api/snmp?host=${encodeURIComponent(query.host)}&port=${encodeURIComponent(query.port)}&community=${encodeURIComponent(query.community)}&oid=${encodeURIComponent(query.oid)}`;
    const res = await fetch(url, {cache: "no-store"});
    const data = await res.json();

    if (data.success && data.value !== undefined) {
      statusEl.innerHTML = '<i class="fas fa-check-circle" style="color:#a3be8c;"></i>';

      const divisor = parseInt(query.divisor) || 1;
      const rawValue = parseFloat(data.value) || 0;
      const currentValue = rawValue / divisor;
      const displayType = query.displayType || 'show';
      const prefix = query.prefix || '';
      const suffix = query.suffix || '';

      let displayValue = '';

      if (displayType === 'show') {
        displayValue = String(currentValue);
      } else if (displayType === 'diff' || displayType === 'period-diff') {
        const queryKey = `${query.host}:${query.port}:${query.oid}`;
        const lastData = snmpLastValues[queryKey];

        if (lastData && lastData.value !== undefined) {
          const lastValue = parseFloat(lastData.value) || 0;
          const diff = currentValue - lastValue;

          if (displayType === 'diff') {
            displayValue = diff >= 0 ? '+' + diff : String(diff);
          } else {
            const refreshIntervalSeconds = window.timers ? window.timers.snmp.interval / 1000 : 60;
            if (refreshIntervalSeconds > 0) {
              const periodDiff = diff / refreshIntervalSeconds;
              displayValue = periodDiff >= 0 ? '+' + periodDiff.toFixed(2) : periodDiff.toFixed(2);
            } else {
              displayValue = '0';
            }
          }
        } else {
          displayValue = '0';
        }

        snmpLastValues[queryKey] = {
          value: currentValue,
          timestamp: Date.now()
        };
        saveSnmpLastValues();
      } else {
        displayValue = String(data.value);
      }

      const finalValue = prefix + displayValue + suffix;
      valueEl.textContent = finalValue;
      valueEl.style.color = '';
    } else {
      statusEl.innerHTML = '<i class="fas fa-times-circle" style="color:#bf616a;"></i>';
      valueEl.textContent = data.error || 'Error';
      valueEl.style.color = '#bf616a';
    }
  } catch (err) {
    statusEl.innerHTML = '<i class="fas fa-times-circle" style="color:#bf616a;"></i>';
    valueEl.textContent = 'Error: ' + err.message;
    valueEl.style.color = '#bf616a';
  }
}

function refreshSnmp() {
  snmpQueries.forEach((query, index) => {
    checkSnmpQuery(query, index);
  });
  window.startTimer('snmp');
}

function updateDivisorOptions() {
  const siUnits = document.getElementById('snmp-si-units').checked;
  const divisorSelect = document.getElementById('snmp-divisor');
  const currentValue = divisorSelect.value;

  divisorSelect.innerHTML = '';

  if (siUnits) {
    divisorSelect.innerHTML = `
      <option value="1">1</option>
      <option value="10">10</option>
      <option value="100">100</option>
      <option value="1000">1,000 (KB)</option>
      <option value="10000">10,000</option>
      <option value="100000">100,000</option>
      <option value="1000000">1,000,000 (MB)</option>
      <option value="1000000000">1,000,000,000 (GB)</option>
    `;
  } else {
    divisorSelect.innerHTML = `
      <option value="1">1</option>
      <option value="10">10</option>
      <option value="100">100</option>
      <option value="1024">1,024 (KiB)</option>
      <option value="12500">12,500</option>
      <option value="125000">125,000</option>
      <option value="1048576">1,048,576 (MiB)</option>
      <option value="1073741824">1,073,741,824 (GiB)</option>
    `;
  }

  const optionExists = Array.from(divisorSelect.options).some(opt => opt.value === currentValue);
  if (optionExists) {
    divisorSelect.value = currentValue;
  } else {
    divisorSelect.value = '1';
  }
}

function initSnmp() {
  loadSnmpQueries();

  const addBtn = document.getElementById('addSnmpBtn');
  const siUnitsCheckbox = document.getElementById('snmp-si-units');
  const cancelBtn = document.getElementById('snmp-cancel');
  const saveBtn = document.getElementById('snmp-save');

  if (addBtn) {
    addBtn.addEventListener('click', () => {
      document.getElementById('snmp-title').value = '';
      document.getElementById('snmp-host').value = '';
      document.getElementById('snmp-port').value = '161';
      document.getElementById('snmp-community').value = 'public';
      document.getElementById('snmp-oid').value = '';
      document.getElementById('snmp-display-type').value = 'show';
      document.getElementById('snmp-prefix').value = '';
      document.getElementById('snmp-suffix').value = '';
      document.getElementById('snmp-divisor').value = '1';
      document.getElementById('snmp-si-units').checked = false;
      updateDivisorOptions();
      document.getElementById('snmpForm').style.display = 'block';
      delete document.getElementById('snmpForm').dataset.editIndex;
    });
  }

  if (siUnitsCheckbox) {
    siUnitsCheckbox.addEventListener('change', updateDivisorOptions);
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      document.getElementById('snmpForm').style.display = 'none';
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const title = document.getElementById('snmp-title').value.trim();
      const host = document.getElementById('snmp-host').value.trim();
      const port = parseInt(document.getElementById('snmp-port').value) || 161;
      const community = document.getElementById('snmp-community').value.trim();
      const oid = document.getElementById('snmp-oid').value.trim();
      const displayType = document.getElementById('snmp-display-type').value;
      const prefix = document.getElementById('snmp-prefix').value.trim();
      const suffix = document.getElementById('snmp-suffix').value.trim();
      const divisor = parseInt(document.getElementById('snmp-divisor').value) || 1;
      const siUnits = document.getElementById('snmp-si-units').checked;

      if (!title || !host || !community || !oid) {
        alert('Please fill in all required fields');
        return;
      }

      const editIndex = document.getElementById('snmpForm').dataset.editIndex;
      const query = { title, host, port, community, oid, displayType, prefix, suffix, divisor, siUnits };

      if (editIndex !== undefined) {
        const oldQuery = snmpQueries[parseInt(editIndex)];
        const oldKey = `${oldQuery.host}:${oldQuery.port}:${oldQuery.oid}`;
        delete snmpLastValues[oldKey];
        saveSnmpLastValues();
        snmpQueries[parseInt(editIndex)] = query;
      } else {
        snmpQueries.push(query);
      }

      saveSnmpQueries();
      renderSnmpList();
      renderSnmpQueries();
      document.getElementById('snmpForm').style.display = 'none';
    });
  }

  // Modal observer
  const prefsModal = document.getElementById('prefsModal');
  if (prefsModal) {
    const observer = new MutationObserver(() => {
      if (prefsModal.classList.contains('active')) {
        renderSnmpList();
      }
    });
    observer.observe(prefsModal, { attributes: true, attributeFilter: ['class'] });
  }

  renderSnmpQueries();

  // Initial check and interval
  setTimeout(refreshSnmp, 3000);
  setInterval(refreshSnmp, window.timers ? window.timers.snmp.interval : 60000);
}

// Export to window
window.snmpQueries = snmpQueries;
window.renderSnmpQueries = renderSnmpQueries;
window.renderSnmpList = renderSnmpList;
window.refreshSnmp = refreshSnmp;
window.editSnmpQuery = editSnmpQuery;
window.deleteSnmpQuery = deleteSnmpQuery;
window.initSnmp = initSnmp;
