// Speedplane module

let speedplaneConfig = null;

function loadSpeedplaneConfig() {
  try {
    const saved = window.loadFromStorage('speedplaneConfig');
    if (saved) {
      speedplaneConfig = saved;
    }
  } catch (e) {}
}

function saveSpeedplaneConfig() {
  try {
    window.saveToStorage('speedplaneConfig', speedplaneConfig);
  } catch (e) {}
}

function formatMbps(mbps) {
  return mbps.toFixed(2) + ' Mbps';
}

function formatMs(ms) {
  return ms.toFixed(2) + ' ms';
}

function formatPct(pct) {
  if (pct < 0) return 'N/A';
  return pct.toFixed(2) + '%';
}

function constructServiceUrl(host, port) {
  // Check if host already contains a protocol
  if (host.includes('://')) {
    return host;
  }
  // Otherwise construct with http://
  return `http://${host}:${port}`;
}

function renderSpeedplane() {
  const container = document.getElementById('speedplaneContainer');
  if (!container) return;

  if (!speedplaneConfig || !speedplaneConfig.host || !speedplaneConfig.port) {
    container.innerHTML = '<div class="small" style="color:var(--muted);">Click the edit button to configure Speedplane</div>';
    return;
  }

  // Check if structure already exists
  const statusEl = document.getElementById('speedplane-status');
  const dataEl = document.getElementById('speedplane-data');

  // Only create structure if it doesn't exist
  if (!statusEl || !dataEl) {
    // Initial render - create elements
    const nameText = window.escapeHtml(speedplaneConfig.name || speedplaneConfig.host + ':' + speedplaneConfig.port);
    const serviceUrl = constructServiceUrl(speedplaneConfig.host, speedplaneConfig.port);
    container.innerHTML = `
      <div class="kv" style="margin-bottom:8px;">
        <div class="k">
          <span class="monitor-status" id="speedplane-status"><i class="fas fa-circle" style="color:var(--muted);"></i></span> ${nameText}
          <a href="${serviceUrl}" target="_blank" rel="noreferrer" title="Open Speedplane service" style="margin-left:6px; color:var(--muted); font-size:0.9em;"><i class="fas fa-external-link-alt"></i></a>
        </div>
        <div class="v" id="speedplane-timestamp">—</div>
      </div>
      <div id="speedplane-data">
        <div class="muted">Loading...</div>
      </div>
    `;
  }
}

function showSpeedplaneEditDialog() {
  const config = speedplaneConfig || { name: '', host: '', port: '' };

  const dialog = document.createElement('div');
  dialog.className = 'modal-overlay active';
  dialog.innerHTML = `
    <div class="modal" style="max-width:500px;">
      <div class="modal-header">
        <h2><i class="fas fa-tachometer-alt"></i> ${speedplaneConfig ? 'Edit' : 'Configure'} Speedplane</h2>
        <button class="modal-close speedplane-dialog-close"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-content">
        <div class="pref-section">
          <div class="pref-row">
            <label>Name (optional)</label>
            <input type="text" id="speedplane-edit-name" placeholder="e.g., Home Server" value="${config.name || ''}">
          </div>
          <div class="pref-row">
            <label>Host / IP / URL</label>
            <input type="text" id="speedplane-edit-host" placeholder="192.168.1.1, hostname, or http://example.com" value="${config.host || ''}">
          </div>
          <div class="pref-row">
            <label>Port (optional if URL provided)</label>
            <input type="number" id="speedplane-edit-port" placeholder="8080" min="1" max="65535" value="${config.port || ''}">
          </div>
        </div>
        <div style="margin-top:20px; display:flex; justify-content:flex-end; gap:10px;">
          <button class="btn-small speedplane-dialog-close">Cancel</button>
          <button class="btn-small" id="speedplane-save">Save</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(dialog);

  function closeDialog() {
    dialog.remove();
  }

  dialog.querySelectorAll('.speedplane-dialog-close').forEach(btn => {
    btn.addEventListener('click', closeDialog);
  });

  document.getElementById('speedplane-save').addEventListener('click', async () => {
    const name = document.getElementById('speedplane-edit-name').value.trim();
    let host = document.getElementById('speedplane-edit-host').value.trim();
    let port = parseInt(document.getElementById('speedplane-edit-port').value) || 0;

    if (!host) {
      await window.popup.alert('Please fill in host', 'Input Required');
      return;
    }

    // Parse host and port if full URL provided
    if (host.includes('://')) {
      try {
        const url = new URL(host);
        const parsedHost = url.hostname;
        const parsedPort = url.port || (url.protocol === 'https:' ? '443' : '80');

        // Update the fields with parsed values
        host = parsedHost;
        port = parsedPort;
        document.getElementById('speedplane-edit-host').value = host;
        document.getElementById('speedplane-edit-port').value = port;
      } catch (e) {
        await window.popup.alert('Invalid URL format', 'Input Error');
        return;
      }
    } else if (!port) {
      await window.popup.alert('Please fill in port', 'Input Required');
      return;
    }

    // Validate using backend
    try {
      const res = await fetch('/api/utils/validate-input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'speedplane',
          data: { name, host, port }
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
      if (window.debugError) window.debugError('speedplane', 'Error validating speedplane:', e);
      await window.popup.alert('Validation error: Unable to connect to server', 'Error');
      return;
    }

    speedplaneConfig = { name, host, port };
    saveSpeedplaneConfig();
    window.speedplaneConfig = speedplaneConfig;
    renderSpeedplane();
    refreshSpeedplane();
    closeDialog();
  });
}

async function checkSpeedplane() {
  if (!speedplaneConfig || !speedplaneConfig.host) {
    return;
  }

  const statusEl = document.getElementById('speedplane-status');
  const dataEl = document.getElementById('speedplane-data');
  const timestampEl = document.getElementById('speedplane-timestamp');

  // Only render structure if it doesn't exist
  if (!statusEl || !dataEl) {
    renderSpeedplane();
    // Wait a bit for DOM to update, then try again
    setTimeout(() => checkSpeedplane(), 100);
    return;
  }

  statusEl.innerHTML = '<i class="fas fa-spinner fa-spin" style="color:var(--accent);"></i>';

  try {
    // Parse host and port - handle full URLs
    let host = speedplaneConfig.host;
    let port = speedplaneConfig.port;

    if (host.includes('://')) {
      // Full URL provided
      const url = new URL(host);
      host = url.hostname;
      port = url.port || (url.protocol === 'https:' ? '443' : '80');
    }

    const url = `/api/speedplane?host=${encodeURIComponent(host)}&port=${encodeURIComponent(port)}`;
    const res = await fetch(url, {cache: "no-store"});
    const data = await res.json();

    if (data.success && data.data) {
      statusEl.innerHTML = '<i class="fas fa-check-circle" style="color:#a3be8c;"></i>';

      const speedData = data.data;
      let html = '';

      // Format timestamp
      if (speedData.timestamp) {
        try {
          const timestamp = new Date(speedData.timestamp);
          if (timestampEl) timestampEl.textContent = timestamp.toLocaleString();
        } catch (e) {
          if (timestampEl) timestampEl.textContent = speedData.timestamp;
        }
      } else {
        if (timestampEl) timestampEl.textContent = '—';
      }

      // Download and Upload on same line
      const downloadValue = speedData.download_mbps !== undefined ? formatMbps(speedData.download_mbps) : null;
      const uploadValue = speedData.upload_mbps !== undefined ? formatMbps(speedData.upload_mbps) : null;
      
      if (downloadValue || uploadValue) {
        html += '<div class="kv"><div class="k">Download / Upload</div><div class="v mono">';
        if (downloadValue) html += downloadValue;
        if (downloadValue && uploadValue) html += ' / ';
        if (uploadValue) html += uploadValue;
        html += '</div></div>';
      }

      // Ping, Jitter, and Packet Loss on same line - always show this line
      const pingValue = speedData.ping_ms !== undefined ? formatMs(speedData.ping_ms) : '—';
      const jitterValue = speedData.jitter_ms !== undefined ? formatMs(speedData.jitter_ms) : '—';
      const packetLossValue = speedData.packet_loss_pct !== undefined ? formatPct(speedData.packet_loss_pct) : '—';
      
      html += '<div class="kv"><div class="k">Ping / Jitter / Packet Loss</div><div class="v mono">';
      html += pingValue + ' / ' + jitterValue + ' / ' + packetLossValue;
      html += '</div></div>';

      // ISP
      if (speedData.isp) {
        html += '<div class="kv"><div class="k">ISP</div><div class="v">' + window.escapeHtml(speedData.isp) + '</div></div>';
      }

      // External IP
      if (speedData.external_ip) {
        html += '<div class="kv"><div class="k">External IP</div><div class="v mono">' + window.escapeHtml(speedData.external_ip) + '</div></div>';
      }

      // Server info
      if (speedData.server_name || speedData.server_country) {
        const serverInfo = [];
        if (speedData.server_name) serverInfo.push(window.escapeHtml(speedData.server_name));
        if (speedData.server_country) serverInfo.push(window.escapeHtml(speedData.server_country));
        if (serverInfo.length > 0) {
          html += '<div class="kv"><div class="k">Server</div><div class="v">' + serverInfo.join(', ') + '</div></div>';
        }
      }

      dataEl.innerHTML = html;
    } else {
      statusEl.innerHTML = '<i class="fas fa-times-circle" style="color:#bf616a;"></i>';
      dataEl.innerHTML = '<div class="muted" style="color:#bf616a;">' + (data.error || 'Error fetching data') + '</div>';
      if (timestampEl) timestampEl.textContent = '—';
    }
  } catch (err) {
    statusEl.innerHTML = '<i class="fas fa-times-circle" style="color:#bf616a;"></i>';
    dataEl.innerHTML = '<div class="muted" style="color:#bf616a;">Error: ' + window.escapeHtml(err.message) + '</div>';
    if (timestampEl) timestampEl.textContent = '—';
  }
}

function refreshSpeedplane() {
  checkSpeedplane();
  window.startTimer('speedplane');
}

function initSpeedplane() {
  loadSpeedplaneConfig();
  renderSpeedplane();

  // Setup edit button
  const editBtn = document.getElementById('speedplane-edit-btn');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      showSpeedplaneEditDialog();
    });
  }

  // Initial check and interval
  setTimeout(refreshSpeedplane, 2000);
  // Refresh is now handled via WebSocket refresh notifications (fallback only if WebSocket not connected)
  setInterval(() => {
    if (!window.wsIsConnected || !window.wsIsConnected()) {
      refreshSpeedplane();
    }
  }, window.timers ? window.timers.speedplane.interval : 300000);
}

// Export to window
window.speedplaneConfig = speedplaneConfig;
window.renderSpeedplane = renderSpeedplane;
window.showSpeedplaneEditDialog = showSpeedplaneEditDialog;
window.refreshSpeedplane = refreshSpeedplane;
window.initSpeedplane = initSpeedplane;
