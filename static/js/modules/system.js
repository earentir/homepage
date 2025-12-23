// System modules: CPU, RAM, Disk, CPU Info

async function refreshCPU() {
  try {
    const res = await fetch("/api/system", {cache:"no-store"});
    const j = await res.json();
    if (j.cpu && j.cpu.usage !== undefined) {
      const usage = j.cpu.usage.toFixed(1);
      document.getElementById("cpuUsage").textContent = usage + "%";
      // Cores are fetched from cpuid API, not system API
      window.updateCpuGraph(parseFloat(usage));
    }
    window.startTimer("cpu");
  } catch(err) {
    console.error("Error refreshing CPU:", err);
  }
}

async function refreshRAM() {
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
    window.startTimer("ram");
  } catch(err) {
    console.error("Error refreshing RAM:", err);
  }
}

async function refreshDisk() {
  try {
    const res = await fetch("/api/system", {cache:"no-store"});
    const j = await res.json();
    if (j.disk && j.disk.percent !== undefined) {
      const total = window.formatBytes(j.disk.total);
      const used = window.formatBytes(j.disk.used);
      const free = window.formatBytes(j.disk.free);
      const percent = j.disk.percent;

      document.getElementById("diskSummary").textContent = total + " / " + used + " / " + free;
      document.getElementById("diskPercent").textContent = percent.toFixed(1) + "%";
      window.updateDiskGraph(percent);
    }
    window.startTimer("disk");
  } catch(err) {
    console.error("Error refreshing Disk:", err);
  }
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
      console.error('CPU Info: Title element not found');
      return;
    }

    // Remove existing vendor icon/text if any
    const existingVendor = titleEl.querySelector('.vendor-icon, .vendor-text');
    if (existingVendor) existingVendor.remove();

    // Find the header-icons div
    const headerIcons = titleEl.querySelector('.header-icons');
    if (!headerIcons) {
      console.error('CPU Info: Header icons element not found');
      return;
    }

    if (!j.vendor) {
      console.error('CPU Info: No vendor in response', j);
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
      console.log('CPU Info: Added vendor icon', vendorIcon, iconClass);
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
      console.log('CPU Info: Added vendor text', j.vendor);
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
    console.error("Error refreshing CPU Info:", err);
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
    console.error("Error refreshing RAM Info:", err);
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
    console.error("Error refreshing Firmware Info:", err);
    const el = document.getElementById("firmwareContent");
    if (el) {
      el.innerHTML = '<div class="small" style="color:var(--muted);">Error loading firmware info</div>';
    }
  }
}

// Export to window
window.refreshCPU = refreshCPU;
window.refreshRAM = refreshRAM;
window.refreshDisk = refreshDisk;
window.refreshCPUInfo = refreshCPUInfo;
window.refreshRAMInfo = refreshRAMInfo;
window.refreshFirmwareInfo = refreshFirmwareInfo;
