// System modules: CPU, RAM, Disk, CPU Info

// Disk modules configuration (stored separately, can have multiple)
const defaultDiskModules = [];

let diskModules = [];
try {
  const saved = localStorage.getItem('diskModules');
  if (saved) {
    diskModules = JSON.parse(saved);
  } else {
    diskModules = defaultDiskModules;
  }
} catch (e) {
  diskModules = defaultDiskModules;
}

function saveDiskModules() {
  localStorage.setItem('diskModules', JSON.stringify(diskModules));
}

async function refreshCPU() {
  // Start timer immediately when refresh begins
  if (window.startTimer) window.startTimer("cpu");
  try {
    const res = await fetch("/api/system", {cache:"no-store"});
    const j = await res.json();
    if (j.cpu && j.cpu.usage !== undefined) {
      const usage = j.cpu.usage.toFixed(1);
      document.getElementById("cpuUsage").textContent = usage + "%";
      // Cores are fetched from cpuid API, not system API
      window.updateCpuGraph(parseFloat(usage));
    }
  } catch(err) {
    if (window.debugError) window.debugError('system', "Error refreshing CPU:", err);
    // Ensure timer is still running even on error
    if (window.startTimer) window.startTimer("cpu");
  }
}

async function refreshRAM() {
  // Start timer immediately when refresh begins
  if (window.startTimer) window.startTimer("ram");
  try {
    const res = await fetch("/api/system", {cache:"no-store"});
    const j = await res.json();
    if (j.ram && j.ram.percent !== undefined) {
      const total = window.formatBytes(j.ram.total);
      const used = window.formatBytes(j.ram.used);
      const available = window.formatBytes(j.ram.available);
      const percent = j.ram.percent;

      document.getElementById("ramSummary").textContent = total + " / " + used + " / " + available;
      document.getElementById("ramPercent").textContent = percent.toFixed(1) + "%";
      window.updateRamGraph(percent);
    }
  } catch(err) {
    if (window.debugError) window.debugError('system', "Error refreshing RAM:", err);
    // Ensure timer is still running even on error
    if (window.startTimer) window.startTimer("ram");
  }
}

async function refreshDiskSingle(mountPoint) {
  try {
    const mount = mountPoint || "/";
    const res = await fetch("/api/disk?mount=" + encodeURIComponent(mount), {cache:"no-store"});
    const j = await res.json();

    const safeMount = mount.replace(/[^a-zA-Z0-9]/g, '_');
    const summaryEl = document.getElementById("diskSummary_" + safeMount);
    const percentEl = document.getElementById("diskPercent_" + safeMount);
    const errEl = document.getElementById("diskErr_" + safeMount);
    const graphEl = document.getElementById("diskGraph_" + safeMount);

    if (j.error) {
      if (errEl) errEl.textContent = j.error;
      if (summaryEl) summaryEl.textContent = "—";
      if (percentEl) percentEl.textContent = "—";
      return;
    }

    if (j.percent !== undefined) {
      const total = window.formatBytes(j.total);
      const used = window.formatBytes(j.used);
      const free = window.formatBytes(j.free);
      const percent = j.percent;

      if (summaryEl) summaryEl.textContent = total + " / " + used + " / " + free;
      if (percentEl) percentEl.textContent = percent.toFixed(1) + "%";
      if (errEl) errEl.textContent = "";
      if (graphEl && window.updateDiskGraph) {
        window.updateDiskGraph(percent, safeMount);
      }
    }
  } catch(err) {
    if (window.debugError) window.debugError('system', "Error refreshing Disk:", err);
    const safeMount = (mountPoint || "/").replace(/[^a-zA-Z0-9]/g, '_');
    const errEl = document.getElementById("diskErr_" + safeMount);
    if (errEl) errEl.textContent = "Error loading disk";
  }
}

async function refreshAllDisks() {
  if (!diskModules || diskModules.length === 0) return;
  for (const mod of diskModules) {
    if (mod.enabled && mod.mountPoint) {
      await refreshDiskSingle(mod.mountPoint);
    }
  }
  window.startTimer("disk");
}

async function refreshCPUInfo() {
  try {
    const res = await fetch("/api/cpuid", {cache:"no-store"});
    const j = await res.json();

    const el = document.getElementById("cpuidContent");
    if (!el) return;

    // Update vendor icon/logo in title
    const titleEl = document.querySelector('[data-module="cpuid"] h3');
    if (!titleEl) {
      if (window.debugError) window.debugError('system', 'CPU Info: Title element not found');
      return;
    }

    // Remove existing vendor icon/text if any
    const existingVendor = titleEl.querySelector('.vendor-icon, .vendor-text');
    if (existingVendor) existingVendor.remove();

    // Find the header-icons div
    const headerIcons = titleEl.querySelector('.header-icons');
    if (!headerIcons) {
      if (window.debugError) window.debugError('system', 'CPU Info: Header icons element not found');
      return;
    }

    if (!j.vendor) {
      if (window.debugError) window.debugError('system', 'CPU Info: No vendor in response', j);
      return;
    }

    const vendorLower = j.vendor.toLowerCase();
    let vendorIcon = null;
    let iconClass = 'fab';

    // Check for vendor brand icons (Font Awesome Brands)
    // Note: Only Apple has a brand icon in Font Awesome, others will show as text
    if (vendorLower.includes('apple')) {
      vendorIcon = 'fa-apple';
    }

    if (vendorIcon) {
      // Show vendor logo icon (only for Apple)
      const iconEl = document.createElement('i');
      iconEl.className = `${iconClass} ${vendorIcon} vendor-icon`;
      iconEl.style.marginLeft = '8px';
      iconEl.style.fontSize = '28px';
      iconEl.style.width = '28px';
      iconEl.style.height = '28px';
      iconEl.style.display = 'inline-block';
      iconEl.style.color = 'var(--txt)';
      iconEl.style.verticalAlign = 'middle';
      titleEl.insertBefore(iconEl, headerIcons);
        if (window.debugLog) window.debugLog('system', 'CPU Info: Added vendor icon', vendorIcon, iconClass);
    } else {
      // Show vendor name as text (for AMD, Intel, RISC-V, etc.)
      const textEl = document.createElement('span');
      textEl.className = 'vendor-text';
      textEl.textContent = j.vendor;
      textEl.style.marginLeft = '8px';
      textEl.style.fontSize = '0.75em';
      textEl.style.color = 'var(--txt)';
      textEl.style.fontWeight = '500';
      textEl.style.verticalAlign = 'middle';
      titleEl.insertBefore(textEl, headerIcons);
        if (window.debugLog) window.debugLog('system', 'CPU Info: Added vendor text', j.vendor);
    }

    let html = '';

    // CPU Name (no label, just the name)
    if (j.name) {
      html += `<div class="kv"><div class="k"></div><div class="v mono">${j.name}</div></div>`;
    }

    // Family/Model/Stepping
    if (j.family !== undefined || j.model !== undefined || j.stepping !== undefined) {
      let fmsStr = '';
      if (j.family !== undefined) fmsStr += 'Family ' + j.family;
      if (j.model !== undefined) fmsStr += (fmsStr ? ', ' : '') + 'Model ' + j.model;
      if (j.stepping !== undefined) fmsStr += (fmsStr ? ', ' : '') + 'Stepping ' + j.stepping;
      html += `<div class="kv"><div class="k">Signature</div><div class="v mono">${fmsStr}</div></div>`;
    }

    // Cores
    if (j.physicalCores !== undefined || j.virtualCores !== undefined) {
      const physical = j.physicalCores || 'N/A';
      const virtual = j.virtualCores || 'N/A';
      html += `<div class="kv"><div class="k">Cores</div><div class="v mono">${physical} physical / ${virtual} logical</div></div>`;
    }

    // Hybrid CPU info (Intel P-core/E-core)
    if (j.hybridCPU && j.coreType) {
      html += `<div class="kv"><div class="k">Core Type</div><div class="v mono">${j.coreType} (Hybrid CPU)</div></div>`;
    }

    // Cache info - special handling for L1
    if (j.cache && j.cache.length > 0) {
      let cacheHtml = '';
      let l1Data = null;
      let l1Instruction = null;
      const otherCaches = [];

      // Separate L1 caches
      j.cache.forEach((c) => {
        if (c.level === 1) {
          if (c.type && c.type.toLowerCase().includes('data')) {
            l1Data = c;
          } else if (c.type && c.type.toLowerCase().includes('instruction')) {
            l1Instruction = c;
          } else if (!l1Data && !l1Instruction) {
            // If no type specified, assume it's data or instruction based on order
            if (!l1Data) l1Data = c;
            else if (!l1Instruction) l1Instruction = c;
          }
        } else {
          otherCaches.push(c);
        }
      });

      // L1 cache - single line with Data and Instruction
      if (l1Data || l1Instruction) {
        const l1Parts = [];
        if (l1Data) {
          const sizeStr = l1Data.sizeKB >= 1024 ? (l1Data.sizeKB / 1024).toFixed(1) + ' MB' : l1Data.sizeKB + ' KB';
          l1Parts.push(`Data: ${sizeStr}`);
        }
        if (l1Instruction) {
          const sizeStr = l1Instruction.sizeKB >= 1024 ? (l1Instruction.sizeKB / 1024).toFixed(1) + ' MB' : l1Instruction.sizeKB + ' KB';
          l1Parts.push(`Instruction: ${sizeStr}`);
        }
        if (l1Parts.length > 0) {
          cacheHtml += `<div class="kv" style="border-top:1px solid var(--border); padding-top:12px;"><div class="k">L1</div><div class="v mono">${l1Parts.join(', ')}</div></div>`;
        }
      }

      // L2 and L3 caches
      otherCaches.forEach((c) => {
        const sizeStr = c.sizeKB >= 1024 ? (c.sizeKB / 1024).toFixed(1) + ' MB' : c.sizeKB + ' KB';
        const label = 'L' + c.level;
        const valueStr = c.type ? `${c.type}: ${sizeStr}` : sizeStr;
        cacheHtml += `<div class="kv"><div class="k">${label}</div><div class="v mono">${valueStr}</div></div>`;
      });

      html += cacheHtml;
    }

    el.innerHTML = html || '<div class="muted">No CPU info available</div>';
  } catch(err) {
    if (window.debugError) window.debugError('system', "Error refreshing CPU Info:", err);
  }
}

async function refreshRAMInfo() {
  try {
    const res = await fetch("/api/raminfo", {cache:"no-store"});
    const j = await res.json();

    const el = document.getElementById("raminfoContent");
    if (!el) return;

    if (j.error) {
      el.innerHTML = `<div class="small" style="color:var(--muted);">${j.error}</div>`;
      return;
    }

    let html = '';

    // Total Size
    if (j.totalSizeString) {
      html += `<div class="kv"><div class="k">Total Size</div><div class="v mono">${j.totalSizeString}</div></div>`;
    }

    // Manufacturer
    if (j.manufacturer) {
      html += `<div class="kv"><div class="k">Manufacturer</div><div class="v mono">${j.manufacturer}</div></div>`;
    }

    // Modules
    if (j.modules && j.modules.length > 0) {
      html += `<div class="kv" style="border-top:1px solid var(--border); padding-top:12px;"><div class="k">Modules</div><div class="v mono" style="font-size:0.9em;">`;
      j.modules.forEach((module, idx) => {
        const parts = [];
        if (module.deviceLocator) parts.push(module.deviceLocator);
        if (module.sizeString) parts.push(module.sizeString);
        if (module.speedString) parts.push(module.speedString);
        if (module.type) parts.push(module.type);
        if (module.manufacturer) parts.push(module.manufacturer);
        if (module.partNumber) parts.push(module.partNumber);

        const moduleText = parts.length > 0 ? parts.join(' • ') : 'Unknown module';
        html += `<div style="margin-bottom:${idx < j.modules.length - 1 ? '6px' : '0'}; word-break:break-word;">${moduleText}</div>`;
      });
      html += `</div></div>`;
    }

    el.innerHTML = html || '<div class="muted">No RAM info available</div>';
  } catch(err) {
    if (window.debugError) window.debugError('system', "Error refreshing RAM Info:", err);
    const el = document.getElementById("raminfoContent");
    if (el) {
      el.innerHTML = '<div class="small" style="color:var(--muted);">Error loading RAM info</div>';
    }
  }
}

async function refreshFirmwareInfo() {
  try {
    const res = await fetch("/api/firmware", {cache:"no-store"});
    const j = await res.json();

    const el = document.getElementById("firmwareContent");
    if (!el) return;

    if (j.error) {
      el.innerHTML = `<div class="small" style="color:var(--muted);">${j.error}</div>`;
      return;
    }

    let html = '';

    // Vendor
    if (j.vendor) {
      html += `<div class="kv"><div class="k">Vendor</div><div class="v mono">${j.vendor}</div></div>`;
    }

    // Version
    if (j.version) {
      html += `<div class="kv"><div class="k">Version</div><div class="v mono">${j.version}</div></div>`;
    }

    // Release Date
    if (j.releaseDate) {
      html += `<div class="kv"><div class="k">Release Date</div><div class="v mono">${j.releaseDate}</div></div>`;
    }

    el.innerHTML = html || '<div class="muted">No firmware info available</div>';
  } catch(err) {
    if (window.debugError) window.debugError('system', "Error refreshing Firmware Info:", err);
    const el = document.getElementById("firmwareContent");
    if (el) {
      el.innerHTML = '<div class="small" style="color:var(--muted);">Error loading firmware info</div>';
    }
  }
}

async function refreshSystemInfo() {
  try {
    const res = await fetch("/api/systeminfo", {cache:"no-store"});
    const j = await res.json();

    const el = document.getElementById("systeminfoContent");
    if (!el) return;

    if (j.error) {
      el.innerHTML = `<div class="small" style="color:var(--muted);">${j.error}</div>`;
      return;
    }

    let html = '';

    // Manufacturer
    if (j.manufacturer) {
      html += `<div class="kv"><div class="k">Manufacturer</div><div class="v mono">${j.manufacturer}</div></div>`;
    }

    // Product Name
    if (j.productName) {
      html += `<div class="kv"><div class="k">Product</div><div class="v mono">${j.productName}</div></div>`;
    }

    // Version
    if (j.version) {
      html += `<div class="kv"><div class="k">Version</div><div class="v mono">${j.version}</div></div>`;
    }

    // Serial Number
    if (j.serialNumber) {
      html += `<div class="kv"><div class="k">Serial Number</div><div class="v mono">${j.serialNumber}</div></div>`;
    }

    // UUID
    if (j.uuid) {
      html += `<div class="kv"><div class="k">UUID</div><div class="v mono">${j.uuid}</div></div>`;
    }

    // Wake Up Type
    if (j.wakeUpType) {
      html += `<div class="kv"><div class="k">Wake Up Type</div><div class="v mono">${j.wakeUpType}</div></div>`;
    }

    // SKU Number
    if (j.skuNumber) {
      html += `<div class="kv"><div class="k">SKU</div><div class="v mono">${j.skuNumber}</div></div>`;
    }

    // Family
    if (j.family) {
      html += `<div class="kv"><div class="k">Family</div><div class="v mono">${j.family}</div></div>`;
    }

    el.innerHTML = html || '<div class="muted">No system info available</div>';
  } catch(err) {
    if (window.debugError) window.debugError('system', "Error refreshing System Info:", err);
    const el = document.getElementById("systeminfoContent");
    if (el) {
      el.innerHTML = '<div class="small" style="color:var(--muted);">Error loading system info</div>';
    }
  }
}

async function refreshBaseboardInfo() {
  try {
    const res = await fetch("/api/baseboard", {cache:"no-store"});
    const j = await res.json();

    const el = document.getElementById("baseboardContent");
    if (!el) return;

    if (j.error) {
      el.innerHTML = `<div class="small" style="color:var(--muted);">${j.error}</div>`;
      return;
    }

    let html = '';

    // Manufacturer
    if (j.manufacturer) {
      html += `<div class="kv"><div class="k">Manufacturer</div><div class="v mono">${j.manufacturer}</div></div>`;
    }

    // Product
    if (j.product) {
      html += `<div class="kv"><div class="k">Product</div><div class="v mono">${j.product}</div></div>`;
    }

    // Version
    if (j.version) {
      html += `<div class="kv"><div class="k">Version</div><div class="v mono">${j.version}</div></div>`;
    }

    // Serial Number
    if (j.serialNumber) {
      html += `<div class="kv"><div class="k">Serial Number</div><div class="v mono">${j.serialNumber}</div></div>`;
    }

    // Asset Tag
    if (j.assetTag) {
      html += `<div class="kv"><div class="k">Asset Tag</div><div class="v mono">${j.assetTag}</div></div>`;
    }

    // Location in Chassis
    if (j.locationInChassis) {
      html += `<div class="kv"><div class="k">Location</div><div class="v mono">${j.locationInChassis}</div></div>`;
    }

    // Board Type
    if (j.boardType) {
      html += `<div class="kv"><div class="k">Board Type</div><div class="v mono">${j.boardType}</div></div>`;
    }

    // Feature Flags
    if (j.featureFlags && j.featureFlags.length > 0) {
      html += `<div class="kv"><div class="k">Features</div><div class="v mono">${j.featureFlags.join(', ')}</div></div>`;
    }

    el.innerHTML = html || '<div class="muted">No baseboard info available</div>';
  } catch(err) {
    if (window.debugError) window.debugError('system', "Error refreshing Baseboard Info:", err);
    const el = document.getElementById("baseboardContent");
    if (el) {
      el.innerHTML = '<div class="small" style="color:var(--muted);">Error loading baseboard info</div>';
    }
  }
}

// Render disk modules dynamically
function renderDiskModules() {
  const container = document.getElementById('diskModulesContainer');
  if (!container) return;
  container.innerHTML = '';

  diskModules.forEach((mod, index) => {
    if (!mod.enabled) return;

    // Check if the card already exists in the DOM (in the grid or elsewhere)
    const existingCard = document.querySelector(`[data-module="${mod.id}"]`);
    if (existingCard) return;

    const safeMount = mod.mountPoint.replace(/[^a-zA-Z0-9]/g, '_');
    const displayName = mod.mountPoint === '/' ? 'Disk' : `Disk ${mod.mountPoint}`;

    const card = document.createElement('div');
    card.className = 'card span-4';
    card.setAttribute('data-module', mod.id);
    card.setAttribute('draggable', 'true');

    // First disk module gets the main disk timer
    const hasTimer = index === 0;
    const timerId = hasTimer ? 'diskTimer' : '';
    const timerHtml = hasTimer ? `<div class="timer-circle" id="diskTimer" title="Double-click to refresh"></div>` : '';

    card.innerHTML = `
      <h3><i class="fas fa-hdd"></i> ${displayName}<div class="header-icons">${timerHtml}<i class="fas fa-grip-vertical drag-handle" title="Drag to reorder"></i></div></h3>
      <div class="kv-vertical">
        <div class="k-small">Total / Used / Free</div>
        <div class="v mono" id="diskSummary_${safeMount}">—</div>
      </div>
      <div class="kv-vertical">
        <div class="k-small">Usage</div>
        <div class="v" id="diskPercent_${safeMount}">—</div>
      </div>
      <div class="small" id="diskErr_${safeMount}"></div>
      <div class="usage-graph" id="diskGraph_${safeMount}"></div>
    `;

    container.appendChild(card);

    // Initialize graph for this disk
    if (window.initGraphs) {
      window.initGraphs();
    }

    // Add double-click handler for the timer (first module only)
    if (hasTimer) {
      const timerEl = document.getElementById('diskTimer');
      if (timerEl) {
        timerEl.addEventListener('dblclick', (e) => {
          e.preventDefault();
          e.stopPropagation();
          refreshAllDisks();
        });
      }
    }
  });

  if (window.initDragAndDrop) {
    setTimeout(() => window.initDragAndDrop(), 50);
  }

  refreshAllDisks();
}

// Render disk module list in preferences
function renderDiskModuleList() {
  const list = document.getElementById('diskModuleList');
  if (!list) return;
  list.innerHTML = '';

  if (!diskModules || diskModules.length === 0) {
    list.innerHTML = '<div class="small" style="color:var(--muted); padding:10px;">No disk modules added yet. Click "Add" to create one.</div>';
    return;
  }

  diskModules.forEach((mod, index) => {
    const item = document.createElement('div');
    item.className = 'module-item' + (mod.enabled ? '' : ' disabled');
    item.innerHTML = `
      <div class="module-icon"><i class="fas fa-hdd"></i></div>
      <div class="module-info">
        <div class="module-name">${mod.mountPoint === '/' ? 'Disk (Root)' : mod.mountPoint}</div>
        <div class="module-desc">${mod.mountPoint}</div>
      </div>
      <div class="module-controls">
        <button class="btn-small edit-disk-btn" data-index="${index}"><i class="fas fa-edit"></i></button>
        <button class="btn-small delete-disk-btn" data-index="${index}"><i class="fas fa-trash"></i></button>
        <input type="checkbox" ${mod.enabled ? 'checked' : ''} data-index="${index}" title="Enable/disable">
      </div>
    `;
    list.appendChild(item);

    const checkbox = item.querySelector('input[type="checkbox"]');
    checkbox.addEventListener('change', () => {
      diskModules[index].enabled = checkbox.checked;
      item.classList.toggle('disabled', !checkbox.checked);
      saveDiskModules();
      renderDiskModules();
    });

    const editBtn = item.querySelector('.edit-disk-btn');
    editBtn.addEventListener('click', () => {
      showDiskEditDialog(index);
    });

    const deleteBtn = item.querySelector('.delete-disk-btn');
    deleteBtn.addEventListener('click', () => {
      if (confirm(`Delete disk module "${mod.mountPoint === '/' ? 'Disk (Root)' : mod.mountPoint}"?`)) {
        diskModules.splice(index, 1);
        saveDiskModules();
        renderDiskModuleList();
        renderDiskModules();
      }
    });
  });
}

function showDiskEditDialog(index) {
  const mod = index >= 0 ? diskModules[index] : { id: '', mountPoint: '', enabled: true };
  const isNew = index < 0;

  // Fetch available disks
  fetch('/api/disks', {cache:"no-store"})
    .then(res => res.json())
    .then(data => {
      if (data.error || !data.partitions || data.partitions.length === 0) {
        alert('No disks available');
        return;
      }

      const dialog = document.createElement('div');
      dialog.className = 'modal-overlay active';

      let optionsHtml = '<option value="">Select a disk...</option>';
      data.partitions.forEach(partition => {
        const selected = partition.mountPoint === mod.mountPoint ? 'selected' : '';
        optionsHtml += `<option value="${partition.mountPoint}" ${selected}>${partition.mountPoint} (${partition.device}, ${partition.fsType})</option>`;
      });

      dialog.innerHTML = `
        <div class="modal" style="max-width:500px;">
          <div class="modal-header">
            <h2><i class="fas fa-hdd"></i> ${isNew ? 'Add' : 'Edit'} Disk Module</h2>
            <button class="modal-close disk-dialog-close"><i class="fas fa-times"></i></button>
          </div>
          <div class="modal-content">
            <div class="pref-section">
              <div class="pref-row">
                <label>Mount Point</label>
                <select id="disk-edit-mount" style="width:100%; padding:5px;">
                  ${optionsHtml}
                </select>
              </div>
            </div>
            <div style="margin-top:20px; display:flex; justify-content:flex-end; gap:10px;">
              <button class="btn-small disk-dialog-close">Cancel</button>
              <button class="btn-small" id="disk-save">Save</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(dialog);

      function closeDialog() {
        dialog.remove();
      }

      dialog.querySelectorAll('.disk-dialog-close').forEach(btn => {
        btn.addEventListener('click', closeDialog);
      });

      document.getElementById('disk-save').addEventListener('click', () => {
        const mountPoint = document.getElementById('disk-edit-mount').value.trim();

        if (!mountPoint) {
          alert('Mount point is required');
          return;
        }

        if (isNew) {
          const safeMount = mountPoint.replace(/[^a-zA-Z0-9]/g, '_');
          const exists = diskModules.find(m => m.mountPoint === mountPoint);
          if (exists) {
            alert('This disk is already added');
            return;
          }
          diskModules.push({
            id: 'disk-' + safeMount,
            mountPoint: mountPoint,
            enabled: true
          });
        } else {
          const safeMount = mountPoint.replace(/[^a-zA-Z0-9]/g, '_');
          const exists = diskModules.find((m, i) => m.mountPoint === mountPoint && i !== index);
          if (exists) {
            alert('This disk is already added');
            return;
          }
          diskModules[index].mountPoint = mountPoint;
          diskModules[index].id = 'disk-' + safeMount;
        }

        saveDiskModules();
        window.diskModules = diskModules;
        renderDiskModuleList();
        renderDiskModules();
        // Force layout system to pick up new modules
        if (window.layoutSystem && window.layoutSystem.renderLayout) {
          setTimeout(() => {
            window.layoutSystem.renderLayout();
            if (window.initDragAndDrop) window.initDragAndDrop();
          }, 200);
        }
        closeDialog();
      });
    })
    .catch(err => {
      if (window.debugError) window.debugError('system', 'Error fetching disks:', err);
      alert('Error loading disks');
    });
}

function initDisk() {
  const addBtn = document.getElementById('addDiskBtn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      showDiskEditDialog(-1);
    });
  }

  const prefsBtn = document.getElementById('prefsBtn');
  if (prefsBtn) {
    prefsBtn.addEventListener('click', () => {
      renderDiskModuleList();
    });
  }

  renderDiskModules();
}

// Export to window
window.refreshCPU = refreshCPU;
window.refreshRAM = refreshRAM;
window.refreshDisk = refreshAllDisks;
window.refreshDiskSingle = refreshDiskSingle;
window.refreshAllDisks = refreshAllDisks;
window.renderDiskModules = renderDiskModules;
window.renderDiskModuleList = renderDiskModuleList;
window.refreshCPUInfo = refreshCPUInfo;
window.refreshRAMInfo = refreshRAMInfo;
window.refreshFirmwareInfo = refreshFirmwareInfo;
window.refreshSystemInfo = refreshSystemInfo;
window.refreshBaseboardInfo = refreshBaseboardInfo;
window.diskModules = diskModules;
window.saveDiskModules = saveDiskModules;
window.initDisk = initDisk;
