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

  const enabledQueries = snmpQueries.filter(q => q.enabled !== false);
  if (enabledQueries.length === 0) {
    container.innerHTML = '<div class="small" style="color:var(--muted);">Add queries in Preferences → Modules → SNMP Modules</div>';
    return;
  }

  container.innerHTML = '';
  enabledQueries.forEach((query, index) => {
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
    renderSnmpModuleList();
    renderSnmpQueries();
    setTimeout(refreshSnmp, 100);
  }
}

function moveSnmpQueryDown(index) {
  if (window.moveArrayItemDown && window.moveArrayItemDown(snmpQueries, index)) {
    // Note: snmpLastValues keys are based on host:port:oid, not index, so no update needed
    saveSnmpQueries();
    renderSnmpModuleList();
    renderSnmpQueries();
    setTimeout(refreshSnmp, 100);
  }
}

function moveSnmpQuery(fromIndex, toIndex) {
  if (window.moveArrayItem && window.moveArrayItem(snmpQueries, fromIndex, toIndex)) {
    // Note: snmpLastValues keys are based on host:port:oid, not index, so no update needed
    saveSnmpQueries();
    renderSnmpModuleList();
    renderSnmpQueries();
    setTimeout(refreshSnmp, 100);
  }
}

function renderSnmpModuleList() {
  const list = document.getElementById('snmpModuleList');
  if (!list) return;

  list.innerHTML = '';

  snmpQueries.forEach((query, index) => {
    const item = document.createElement('div');
    item.className = 'module-item' + (query.enabled !== false ? '' : ' disabled');
    item.innerHTML = `
      <div class="module-icon"><i class="fas fa-network-wired"></i></div>
      <div class="module-info">
        <div class="module-name">${window.escapeHtml(query.title)}</div>
        <div class="module-desc">${window.escapeHtml(query.host)}:${query.port} - ${window.escapeHtml(query.oid)}</div>
      </div>
      <div class="module-controls">
        <button class="btn-small edit-snmp-btn" data-index="${index}"><i class="fas fa-edit"></i></button>
        <button class="btn-small delete-snmp-btn" data-index="${index}"><i class="fas fa-trash"></i></button>
        <input type="checkbox" ${query.enabled !== false ? 'checked' : ''} data-index="${index}" title="Enable/disable">
      </div>
    `;
    list.appendChild(item);

    // Enable/disable handler
    const checkbox = item.querySelector('input[type="checkbox"]');
    checkbox.addEventListener('change', () => {
      snmpQueries[index].enabled = checkbox.checked;
      item.classList.toggle('disabled', !checkbox.checked);
      saveSnmpQueries();
      renderSnmpQueries();
      refreshSnmp();
    });

    // Edit button
    const editBtn = item.querySelector('.edit-snmp-btn');
    editBtn.addEventListener('click', () => showSnmpEditDialog(index));

    // Delete button
    const deleteBtn = item.querySelector('.delete-snmp-btn');
    deleteBtn.addEventListener('click', async () => {
      const confirmed = await window.popup.confirm('Delete SNMP query "' + query.title + '"?', 'Confirm Delete');
      if (confirmed) {
        const query = snmpQueries[index];
        const queryKey = `${query.host}:${query.port}:${query.oid}`;
        delete snmpLastValues[queryKey];
        saveSnmpLastValues();

        snmpQueries.splice(index, 1);
        saveSnmpQueries();
        renderSnmpModuleList();
        renderSnmpQueries();
      }
    });
  });
}

function showSnmpEditDialog(index) {
  const query = index >= 0 ? snmpQueries[index] : { title: '', host: '', port: 161, community: 'public', oid: '', displayType: 'show', prefix: '', suffix: '', divisor: 1, siUnits: false };
  const isNew = index < 0;

  const fields = [
    {
      id: 'title',
      label: 'Title',
      type: 'text',
      placeholder: 'e.g., Router Uptime',
      required: true
    },
    {
      id: 'host',
      label: 'Host',
      type: 'text',
      placeholder: '192.168.1.1',
      required: true
    },
    {
      id: 'port',
      label: 'Port',
      type: 'number',
      min: 1,
      max: 65535,
      required: false
    },
    {
      id: 'community',
      label: 'Community',
      type: 'text',
      placeholder: 'public',
      required: true
    },
    {
      id: 'oid',
      label: 'OID',
      type: 'text',
      placeholder: '1.3.6.1.2.1.1.3.0',
      required: true
    },
    {
      id: 'displayType',
      label: 'Display Type',
      type: 'select',
      options: [
        { value: 'show', label: 'Show' },
        { value: 'diff', label: 'Diff' },
        { value: 'period-diff', label: 'Period Diff' }
      ],
      required: false
    },
    {
      id: 'prefix',
      label: 'Prefix',
      type: 'text',
      placeholder: 'e.g., Speed: ',
      required: false
    },
    {
      id: 'suffix',
      label: 'Suffix',
      type: 'text',
      placeholder: 'e.g., bps',
      required: false
    },
    {
      id: 'divisor',
      label: 'Divisor',
      type: 'select',
      options: query.siUnits ? [
        { value: '1', label: '1' },
        { value: '10', label: '10' },
        { value: '100', label: '100' },
        { value: '1000', label: '1,000 (KB)' },
        { value: '10000', label: '10,000' },
        { value: '100000', label: '100,000' },
        { value: '1000000', label: '1,000,000 (MB)' },
        { value: '1000000000', label: '1,000,000,000 (GB)' }
      ] : [
        { value: '1', label: '1' },
        { value: '10', label: '10' },
        { value: '100', label: '100' },
        { value: '1024', label: '1,024 (KiB)' },
        { value: '12500', label: '12,500' },
        { value: '125000', label: '125,000' },
        { value: '1048576', label: '1,048,576 (MiB)' },
        { value: '1073741824', label: '1,073,741,824 (GiB)' }
      ],
      required: false
    },
    {
      id: 'siUnits',
      label: 'SI units',
      type: 'checkbox',
      onChange: (dialog, field, element) => {
        updateSnmpDivisorOptions(dialog, element.checked);
      }
    }
  ];

  showModuleEditDialog({
    title: `${isNew ? 'Add' : 'Edit'} SNMP Query`,
    icon: 'fas fa-network-wired',
    fields: fields,
    values: query,
    onSave: (formData) => {
      const title = formData.title.trim();
      const host = formData.host.trim();
      const port = parseInt(formData.port) || 161;
      const community = formData.community.trim();
      const oid = formData.oid.trim();
      const displayType = formData.displayType;
      const prefix = formData.prefix.trim();
      const suffix = formData.suffix.trim();
      const divisor = parseInt(formData.divisor) || 1;
      const siUnits = formData.siUnits;

      if (!title || !host || !community || !oid) {
        window.popup.alert('Please fill in all required fields', 'Input Required');
        return;
      }

      const newQuery = { title, host, port, community, oid, displayType, prefix, suffix, divisor, siUnits, enabled: true };

      if (isNew) {
        snmpQueries.push(newQuery);
      } else {
        const oldQuery = snmpQueries[index];
        const oldKey = `${oldQuery.host}:${oldQuery.port}:${oldQuery.oid}`;
        delete snmpLastValues[oldKey];
        saveSnmpLastValues();
        snmpQueries[index] = newQuery;
      }

      saveSnmpQueries();
      renderSnmpModuleList();
      renderSnmpQueries();
    }
  });
}

function updateSnmpDivisorOptions(dialog, siUnits) {
  const divisorSelect = dialog.querySelector('#module-edit-divisor');
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

async function deleteSnmpQuery(index) {
  const confirmed = await window.popup.confirm('Delete this SNMP query?', 'Confirm Delete');
  if (confirmed) {
    const query = snmpQueries[index];
    const queryKey = `${query.host}:${query.port}:${query.oid}`;
    delete snmpLastValues[queryKey];
    saveSnmpLastValues();

    snmpQueries.splice(index, 1);
    saveSnmpQueries();
    renderSnmpModuleList();
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
  snmpQueries.filter(q => q.enabled !== false).forEach((query, index) => {
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

  // Set up add button event listener
  const addBtn = document.getElementById('addSnmpBtn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      console.log('SNMP Add button clicked');
      showSnmpEditDialog(-1);
    });
  } else {
    console.log('SNMP Add button not found');
  }

  renderSnmpQueries();

  // Initial check and interval
  setTimeout(refreshSnmp, 3000);
  // Refresh is now handled via WebSocket refresh notifications (fallback only if WebSocket not connected)
  setInterval(() => {
    if (!window.wsIsConnected || !window.wsIsConnected()) {
      refreshSnmp();
    }
  }, window.timers ? window.timers.snmp.interval : 60000);
}

// Export to window
window.snmpQueries = snmpQueries;
window.renderSnmpQueries = renderSnmpQueries;
window.renderSnmpModuleList = renderSnmpModuleList;
window.refreshSnmp = refreshSnmp;
window.showSnmpEditDialog = showSnmpEditDialog;
window.initSnmp = initSnmp;
