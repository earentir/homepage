// DNSPlane dashboard status (proxied via /api/dnsplane).

let dnsplaneConfig = null;

function loadDnsplaneConfig() {
  try {
    const saved = window.loadFromStorage('dnsplaneConfig');
    if (saved) dnsplaneConfig = saved;
  } catch (e) {}
  window.dnsplaneConfig = dnsplaneConfig;
}

function saveDnsplaneConfig() {
  try {
    window.saveToStorage('dnsplaneConfig', dnsplaneConfig);
  } catch (e) {}
}

function constructServiceUrl(host, port) {
  if (host && host.includes('://')) return host.replace(/\/+$/, '');
  return 'http://' + host + ':' + port;
}

function dashboardUrl(host, port) {
  return constructServiceUrl(host, port) + '/stats/dashboard';
}

function findFeature(features, key) {
  if (!features || !Array.isArray(features)) return null;
  for (let i = 0; i < features.length; i++) {
    if (features[i].key === key) return features[i];
  }
  return null;
}

const DNSPLANE_UP_WORDS = [
  'on',
  'enabled',
  'yes',
  'true',
  'up',
  'active',
  'ok',
  'running',
  'connected',
  'loaded',
  'indexed',
  'ready',
  'healthy',
  'open'
];
const DNSPLANE_DOWN_WORDS = [
  'off',
  'disabled',
  'no',
  'false',
  'down',
  'inactive',
  'stopped',
  'disconnected',
  'error',
  'failed'
];

/** Same green/red as boolLabel for feature rows (local_records, cache, etc.). */
function featureValueColoredHtml(features, key) {
  const f = findFeature(features, key);
  if (!f) return '<span class="muted">—</span>';
  if (typeof f.ok === 'boolean') return boolLabel(f.ok);
  if (typeof f.enabled === 'boolean') return boolLabel(f.enabled);
  if (typeof f.up === 'boolean') return boolLabel(f.up);
  const v = f.value;
  if (typeof v === 'boolean') return boolLabel(v);
  const s = v != null ? String(v).trim() : '';
  if (!s) return '<span class="muted">—</span>';
  const lower = s.toLowerCase();
  if (DNSPLANE_UP_WORDS.includes(lower)) {
    return '<span class="mono" style="color:#a3be8c;">' + window.escapeHtml(s) + '</span>';
  }
  if (DNSPLANE_DOWN_WORDS.includes(lower)) {
    return '<span class="mono" style="color:#bf616a;">' + window.escapeHtml(s) + '</span>';
  }
  const digitsOnly = s.replace(/,/g, '');
  if (/^\d+$/.test(digitsOnly)) {
    return '<span class="mono" style="color:#a3be8c;">' + window.escapeHtml(s) + '</span>';
  }
  return '<span class="mono">' + window.escapeHtml(s) + '</span>';
}

function boolLabel(ok) {
  if (ok === true) return '<span class="mono" style="color:#a3be8c;">up</span>';
  if (ok === false) return '<span class="mono" style="color:#bf616a;">down</span>';
  return '<span class="muted">—</span>';
}

function dnsplaneStatCell(kLabel, vHtml) {
  return (
    '<div class="dnsplane-stat-cell"><span class="k">' +
    kLabel +
    '</span><span class="v">' +
    vHtml +
    '</span></div>'
  );
}

function dnsplaneStatRow(leftCell, rightCell) {
  return '<div class="dnsplane-stat-row">' + leftCell + rightCell + '</div>';
}

function renderDnsplane() {
  const container = document.getElementById('dnsplaneContainer');
  if (!container) return;

  if (!dnsplaneConfig || !dnsplaneConfig.host || !dnsplaneConfig.port) {
    container.innerHTML =
      '<div class="small" style="color:var(--muted);">Use Preferences → Modules → configure (edit) to set host and API port.</div>';
    return;
  }

  const statusEl = document.getElementById('dnsplane-status');
  const dataEl = document.getElementById('dnsplane-data');
  if (!statusEl || !dataEl) {
    const nameText = window.escapeHtml(dnsplaneConfig.name || dnsplaneConfig.host + ':' + dnsplaneConfig.port);
    const dashUrl = dashboardUrl(dnsplaneConfig.host, dnsplaneConfig.port);
    container.innerHTML =
      '<div class="kv dnsplane-card-header">' +
      '<div class="k">' +
      '<span class="monitor-status" id="dnsplane-status"><i class="fas fa-circle" style="color:var(--muted);"></i></span> ' +
      nameText +
      ' <a href="' +
      window.escapeHtml(dashUrl) +
      '" target="_blank" rel="noreferrer" title="Open DNSPlane dashboard" style="margin-left:6px; color:var(--muted); font-size:0.9em;"><i class="fas fa-external-link-alt"></i></a>' +
      '</div>' +
      '<div class="v mono" id="dnsplane-subtitle">—</div>' +
      '</div>' +
      '<div id="dnsplane-data"><div class="muted">Loading…</div></div>';
  }
}

function showDnsplaneEditDialog() {
  const config = dnsplaneConfig || { name: '', host: '', port: '' };

  const dialog = document.createElement('div');
  dialog.className = 'modal-overlay module-edit-overlay active';
  dialog.innerHTML =
    '<div class="modal module-edit" style="max-width:500px;">' +
    '<div class="modal-header">' +
    '<h2><i class="fas fa-network-wired"></i> ' +
    (dnsplaneConfig ? 'Edit' : 'Configure') +
    ' DNSPlane</h2>' +
    '<button class="modal-close dnsplane-dialog-close"><i class="fas fa-times"></i></button>' +
    '</div>' +
    '<div class="modal-content">' +
    '<div class="pref-section">' +
    '<div class="pref-row"><label>Name (optional)</label>' +
    '<input type="text" id="dnsplane-edit-name" placeholder="e.g. Home DNS" value="' +
    window.escapeHtml(config.name || '') +
    '"></div>' +
    '<div class="pref-row"><label>Host / IP</label>' +
    '<input type="text" id="dnsplane-edit-host" placeholder="192.168.1.1" value="' +
    window.escapeHtml(config.host || '') +
    '"></div>' +
    '<div class="pref-row"><label>API port</label>' +
    '<input type="number" id="dnsplane-edit-port" placeholder="8083" min="1" max="65535" value="' +
    (config.port ? String(config.port) : '') +
    '"></div>' +
    '<p class="small" style="color:var(--muted); margin:0;">Dashboard JSON path is fixed to <span class="mono">/stats/dashboard/data</span> on that port.</p>' +
    '</div>' +
    '<div style="margin-top:20px; display:flex; justify-content:flex-end; gap:10px;">' +
    '<button class="btn-small dnsplane-dialog-close">Cancel</button>' +
    '<button class="btn-small" id="dnsplane-save">Save</button>' +
    '</div></div></div>';
  document.body.appendChild(dialog);

  function closeDialog() {
    dialog.remove();
  }

  dialog.querySelectorAll('.dnsplane-dialog-close').forEach(function(btn) {
    btn.addEventListener('click', closeDialog);
  });

  document.getElementById('dnsplane-save').addEventListener('click', async function() {
    const name = document.getElementById('dnsplane-edit-name').value.trim();
    let host = document.getElementById('dnsplane-edit-host').value.trim();
    let port = parseInt(document.getElementById('dnsplane-edit-port').value, 10) || 0;

    if (!host) {
      await window.popup.alert('Host is required.', 'Input required');
      return;
    }

    if (host.includes('://')) {
      try {
        const u = new URL(host);
        host = u.hostname;
        port = parseInt(u.port, 10) || (u.protocol === 'https:' ? 443 : 80);
        document.getElementById('dnsplane-edit-host').value = host;
        document.getElementById('dnsplane-edit-port').value = String(port);
      } catch (err) {
        await window.popup.alert('Invalid URL.', 'Input error');
        return;
      }
    } else if (!port) {
      await window.popup.alert('API port is required.', 'Input required');
      return;
    }

    try {
      const res = await fetch('/api/utils/validate-input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'dnsplane',
          data: { name: name, host: host, port: port }
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (!data.valid) {
          await window.popup.alert(data.error || 'Validation failed', 'Validation');
          return;
        }
      } else {
        await window.popup.alert('Could not validate with server.', 'Error');
        return;
      }
    } catch (e) {
      if (window.debugError) window.debugError('dnsplane', 'validate', e);
      await window.popup.alert('Validation request failed.', 'Error');
      return;
    }

    dnsplaneConfig = { name: name, host: host, port: port };
    saveDnsplaneConfig();
    window.dnsplaneConfig = dnsplaneConfig;
    renderDnsplane();
    refreshDnsplane();
    closeDialog();
  });
}

async function checkDnsplane() {
  if (!dnsplaneConfig || !dnsplaneConfig.host || !dnsplaneConfig.port) return;

  let statusEl = document.getElementById('dnsplane-status');
  let dataEl = document.getElementById('dnsplane-data');
  const subEl = document.getElementById('dnsplane-subtitle');

  if (!statusEl || !dataEl) {
    renderDnsplane();
    setTimeout(function() {
      checkDnsplane();
    }, 100);
    return;
  }

  statusEl.innerHTML = '<i class="fas fa-spinner fa-spin" style="color:var(--accent);"></i>';

  let host = dnsplaneConfig.host;
  let port = dnsplaneConfig.port;
  if (host.includes('://')) {
    const u = new URL(host);
    host = u.hostname;
    port = parseInt(u.port, 10) || (u.protocol === 'https:' ? 443 : 80);
  }

  try {
    const url =
      '/api/dnsplane?host=' + encodeURIComponent(host) + '&port=' + encodeURIComponent(String(port));
    const res = await fetch(url, { cache: 'no-store' });
    const pack = await res.json();

    if (pack.success && pack.data) {
      statusEl.innerHTML = '<i class="fas fa-check-circle" style="color:#a3be8c;"></i>';
      const d = pack.data;
      const st = d.status || {};
      const feats = st.features;
      const build = d.build || {};
      const counters = d.counters || {};

      if (subEl) {
        const ver = build.version ? 'v' + window.escapeHtml(String(build.version)) : '';
        const arch = build.arch && build.os ? window.escapeHtml(build.os + '/' + build.arch) : '';
        subEl.innerHTML = [ver, arch].filter(Boolean).join(' · ') || '—';
      }

      const tui = st.tui || {};
      const tuiConnected = !!tui.connected;
      let tuiLine = tuiConnected ? 'Connected' : 'Not connected';
      if (tuiConnected && tui.addr) tuiLine += ' · ' + String(tui.addr);
      if (tuiConnected && tui.since_rfc3339) tuiLine += ' · since ' + String(tui.since_rfc3339);

      dataEl.innerHTML =
        '<div class="dnsplane-stat-grid">' +
        dnsplaneStatRow(
          dnsplaneStatCell('DNS', boolLabel(st.dns_up === true)),
          dnsplaneStatCell('API', boolLabel(st.api_up === true))
        ) +
        dnsplaneStatRow(
          dnsplaneStatCell('Ready', boolLabel(st.ready === true)),
          dnsplaneStatCell('Local records', featureValueColoredHtml(feats, 'local_records'))
        ) +
        dnsplaneStatRow(
          dnsplaneStatCell('Resolver cache', featureValueColoredHtml(feats, 'cache')),
          dnsplaneStatCell('TUI client', '<span class="dnsplane-tui-val">' + window.escapeHtml(tuiLine) + '</span>')
        ) +
        '<div class="dnsplane-stat-row dnsplane-stat-totals">' +
        dnsplaneStatCell(
          'Queries / answered',
          '<span class="mono">' +
            (counters.total_queries != null ? Number(counters.total_queries).toLocaleString() : '—') +
            ' / ' +
            (counters.total_queries_answered != null
              ? Number(counters.total_queries_answered).toLocaleString()
              : '—') +
            '</span>'
        ) +
        '</div></div>';
    } else {
      statusEl.innerHTML = '<i class="fas fa-times-circle" style="color:#bf616a;"></i>';
      dataEl.innerHTML =
        '<div class="muted" style="color:#bf616a;">' +
        window.escapeHtml(pack.error || 'Error fetching dashboard') +
        '</div>';
      if (subEl) subEl.textContent = '—';
    }
  } catch (err) {
    statusEl.innerHTML = '<i class="fas fa-times-circle" style="color:#bf616a;"></i>';
    dataEl.innerHTML =
      '<div class="muted" style="color:#bf616a;">' + window.escapeHtml(err.message || String(err)) + '</div>';
    if (subEl) subEl.textContent = '—';
  }
}

function refreshDnsplane() {
  checkDnsplane();
  window.startTimer('dnsplane');
}

function initDnsplane() {
  loadDnsplaneConfig();
  renderDnsplane();
  setTimeout(refreshDnsplane, 2000);
  setInterval(function() {
    if (!window.wsIsConnected || !window.wsIsConnected()) {
      refreshDnsplane();
    }
  }, window.timers && window.timers.dnsplane ? window.timers.dnsplane.interval : 60000);
}

window.dnsplaneConfig = dnsplaneConfig;
window.renderDnsplane = renderDnsplane;
window.showDnsplaneEditDialog = showDnsplaneEditDialog;
window.refreshDnsplane = refreshDnsplane;
window.initDnsplane = initDnsplane;
