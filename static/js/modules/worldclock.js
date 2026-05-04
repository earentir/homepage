// World clock: local time + user-defined IANA zones (stored in localStorage).

(function() {
  'use strict';

  const STORAGE_KEY = 'worldClockZones';
  const TWO_COLS_KEY = 'worldClockTwoColumns';
  const LOCAL_LABEL_KEY = 'worldClockLocalDisplayLabel';
  const CALC_ENABLED_KEY = 'worldClockCalculatorEnabled';
  const CALC_TARGET_KEY = 'worldClockCalculatorTarget';

  let worldClockTwoColumns = false;
  let worldClockLocalDisplayLabel = '';
  let worldClockCalculatorEnabled = false;
  let worldClockCalculatorTarget = '';
  let calcTargetInputHydrated = false;

  // Abbreviations and typos → IANA (for calculator target field only).
  const CALC_SHORT_TO_IANA = {
    UTC: 'UTC',
    /** User input only: GMT as a synonym for the universal zone (we display UTC, not GMT). */
    GMT: 'UTC',
    Z: 'UTC',
    PST: 'America/Los_Angeles',
    PDT: 'America/Los_Angeles',
    PT: 'America/Los_Angeles',
    PCT: 'America/Los_Angeles',
    PACIFIC: 'America/Los_Angeles',
    PST8PDT: 'America/Los_Angeles',
    EST: 'America/New_York',
    EDT: 'America/New_York',
    ET: 'America/New_York',
    EASTERN: 'America/New_York',
    CST: 'America/Chicago',
    CDT: 'America/Chicago',
    CT: 'America/Chicago',
    CENTRAL: 'America/Chicago',
    MST: 'America/Denver',
    MDT: 'America/Denver',
    MT: 'America/Denver',
    MOUNTAIN: 'America/Denver',
    CET: 'Europe/Berlin',
    CEST: 'Europe/Berlin',
    EET: 'Europe/Athens',
    EEST: 'Europe/Athens',
    EEET: 'Europe/Athens',
    JST: 'Asia/Tokyo',
    KST: 'Asia/Seoul',
    IST: 'Asia/Kolkata',
    BST: 'Europe/London',
    AEST: 'Australia/Sydney',
    AEDT: 'Australia/Sydney',
    AWST: 'Australia/Perth',
    MSK: 'Europe/Moscow',
    NOVT: 'Asia/Novosibirsk'
  };

  const COMMON_TIMEZONES = [
    'UTC', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Athens', 'Europe/Madrid', 'Europe/Amsterdam',
    'Europe/Zurich',
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Toronto', 'America/Sao_Paulo',
    'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Seoul', 'Asia/Hong_Kong',
    'Australia/Sydney', 'Australia/Melbourne', 'Pacific/Auckland', 'Africa/Johannesburg', 'Africa/Cairo'
  ];

  // Non-IANA or deprecated spellings → canonical IANA (Switzerland uses Europe/Zurich for the whole country).
  const TIMEZONE_ALIASES = {
    'switzerland/geneva': 'Europe/Zurich',
    'switzerland/zurich': 'Europe/Zurich',
    'switzerland/bern': 'Europe/Zurich',
    'switzerland/basel': 'Europe/Zurich',
    'switzerland/lugano': 'Europe/Zurich',
    'switzerland': 'Europe/Zurich',
    'europe/geneva': 'Europe/Zurich',
    'geneva/switzerland': 'Europe/Zurich',
    'uk/london': 'Europe/London',
    'england/london': 'Europe/London',
    'great britain/london': 'Europe/London',
    'united kingdom/london': 'Europe/London',
    'usa/new_york': 'America/New_York',
    'us/eastern': 'America/New_York',
    'us/central': 'America/Chicago',
    'us/mountain': 'America/Denver',
    'us/pacific': 'America/Los_Angeles'
  };

  let worldClockZones = [];
  let tickTimer = null;

  function loadZones() {
    try {
      const saved = window.loadFromStorage(STORAGE_KEY);
      if (Array.isArray(saved)) {
        worldClockZones = saved.filter(function(z) {
          return z && typeof z.timeZone === 'string' && z.timeZone.trim();
        });
        let migrated = false;
        worldClockZones.forEach(function(z) {
          const c = resolveCanonicalTimeZone(z.timeZone);
          if (c && c !== z.timeZone.trim()) {
            z.timeZone = c;
            migrated = true;
          }
        });
        if (migrated) saveZones();
      } else {
        worldClockZones = [];
      }
    } catch (e) {
      worldClockZones = [];
    }
  }

  function saveZones() {
    try {
      window.saveToStorage(STORAGE_KEY, worldClockZones);
    } catch (e) {
      if (window.debugError) window.debugError('worldclock', 'save failed', e);
    }
  }

  function loadTwoColumnsPref() {
    try {
      const v = window.loadFromStorage(TWO_COLS_KEY);
      worldClockTwoColumns = v === true || v === 'true';
    } catch (e) {
      worldClockTwoColumns = false;
    }
  }

  function saveTwoColumnsPref() {
    try {
      window.saveToStorage(TWO_COLS_KEY, worldClockTwoColumns);
    } catch (e) {
      if (window.debugError) window.debugError('worldclock', 'save two-column pref failed', e);
    }
  }

  function loadLocalLabelPref() {
    try {
      const v = window.loadFromStorage(LOCAL_LABEL_KEY);
      worldClockLocalDisplayLabel = typeof v === 'string' ? v : '';
    } catch (e) {
      worldClockLocalDisplayLabel = '';
    }
  }

  function saveLocalLabelPref() {
    try {
      window.saveToStorage(LOCAL_LABEL_KEY, worldClockLocalDisplayLabel);
    } catch (e) {
      if (window.debugError) window.debugError('worldclock', 'save local label pref failed', e);
    }
  }

  function defaultLabelFromIANA(tz) {
    if (!tz || tz === 'Local') return 'Local';
    const parts = tz.split('/');
    const last = parts[parts.length - 1];
    return last.replace(/_/g, ' ');
  }

  function getLocalClockLabel() {
    const custom = (worldClockLocalDisplayLabel || '').trim();
    if (custom) return custom;
    return defaultLabelFromIANA(localTimeZoneId());
  }

  function syncWorldClockDisplayPrefs() {
    const cb = document.getElementById('pref-worldclock-two-cols');
    if (cb) cb.checked = worldClockTwoColumns;
    const calcEn = document.getElementById('pref-worldclock-calc-enabled');
    if (calcEn) calcEn.checked = worldClockCalculatorEnabled;
    const lab = document.getElementById('pref-worldclock-local-label');
    if (lab) lab.value = worldClockLocalDisplayLabel || '';
  }

  function escTxt(s) {
    const t = String(s == null ? '' : s);
    return window.escapeHtml ? window.escapeHtml(t) : t;
  }

  function rowHtml(label, timeStr, offStr, noteStr, titleAttr) {
    return (
      '<div class="wc-row" title="' + attrSafe(titleAttr) + '">' +
      '<span class="wc-label">' + escTxt(label) + '</span>' +
      '<span class="wc-time mono">' + escTxt(timeStr) + '</span>' +
      '<span class="wc-offset">' + escTxt(offStr) + '</span>' +
      '<span class="wc-date-note">' + escTxt(noteStr) + '</span>' +
      '</div>'
    );
  }

  function isValidIANATimeZone(tz) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz.trim() });
      return true;
    } catch (e) {
      return false;
    }
  }

  /** Resolve user input to a canonical IANA id, or null if unknown. */
  function resolveCanonicalTimeZone(raw) {
    const t = (raw || '').trim();
    if (!t) return null;
    if (isValidIANATimeZone(t)) return t;
    const underscored = t.replace(/\s+/g, '_');
    if (underscored !== t && isValidIANATimeZone(underscored)) return underscored;
    const key = underscored.toLowerCase();
    const alias = TIMEZONE_ALIASES[key];
    if (alias && isValidIANATimeZone(alias)) return alias;
    return null;
  }

  function localTimeZoneId() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local';
    } catch (e) {
      return 'Local';
    }
  }

  function ymdLocal(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function ymdInZone(d, tz) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(d);
  }

  function calendarDayDiffDays(localYmd, remoteYmd) {
    const a = new Date(localYmd + 'T12:00:00').getTime();
    const b = new Date(remoteYmd + 'T12:00:00').getTime();
    return Math.round((b - a) / 86400000);
  }

  function dateDiffVsLocalLabel(now, tz) {
    const local = ymdLocal(now);
    const remote = ymdInZone(now, tz);
    const diff = calendarDayDiffDays(local, remote);
    if (diff === 0) return '';
    if (diff > 0) {
      return '+' + diff + ' day' + (diff === 1 ? '' : 's') + ' vs you';
    }
    return diff + ' day' + (diff === -1 ? '' : 's') + ' vs you';
  }

  function longZoneName(now, tz) {
    try {
      const parts = new Intl.DateTimeFormat('en', {
        timeZone: tz,
        timeZoneName: 'long'
      }).formatToParts(now);
      const p = parts.find(function(x) { return x.type === 'timeZoneName'; });
      return (p && p.value) ? p.value : tz;
    } catch (e) {
      return tz;
    }
  }

  /** IANA zones that are the same instant as UTC; we label them UTC (Intl often returns "GMT" for short). */
  function isUtcEquivalentIANA(tz) {
    if (!tz || typeof tz !== 'string') return false;
    const t = tz.trim();
    if (t === 'UTC' || t === 'Etc/UTC' || t === 'Etc/UCT') return true;
    if (t === 'Etc/GMT+0' || t === 'Etc/GMT-0') return true;
    return false;
  }

  function utcOffsetLabel(now, tz) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        timeZoneName: 'longOffset'
      }).formatToParts(now);
      const p = parts.find(function(x) { return x.type === 'timeZoneName'; });
      let s = (p && p.value) ? p.value : '';
      // ICU uses a "GMT±…" prefix for offset strings; we prefer "UTC±…" (same numeric offset).
      return s.replace(/^GMT/, 'UTC');
    } catch (e) {
      return '';
    }
  }

  function shortTimeZoneAbbrev(now, tz) {
    if (isUtcEquivalentIANA(tz)) return 'UTC';
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        timeZoneName: 'short'
      }).formatToParts(now);
      const p = parts.find(function(x) { return x.type === 'timeZoneName'; });
      if (p && p.value) return p.value;
    } catch (e) {}
    return utcOffsetLabel(now, tz) || '—';
  }

  function resolveCalculatorTarget(raw) {
    const t = (raw || '').trim();
    if (!t) return null;
    if (isValidIANATimeZone(t)) return t;
    const canon = resolveCanonicalTimeZone(t);
    if (canon) return canon;
    const u = t.toUpperCase();
    const mapped = CALC_SHORT_TO_IANA[u] || CALC_SHORT_TO_IANA[u.replace(/\s+/g, '_')];
    if (mapped && isValidIANATimeZone(mapped)) return mapped;
    return null;
  }

  function loadCalcPrefs() {
    try {
      const en = window.loadFromStorage(CALC_ENABLED_KEY);
      worldClockCalculatorEnabled = en === true || en === 'true';
      const tgt = window.loadFromStorage(CALC_TARGET_KEY);
      worldClockCalculatorTarget = typeof tgt === 'string' ? tgt : '';
    } catch (e) {
      worldClockCalculatorEnabled = false;
      worldClockCalculatorTarget = '';
    }
  }

  function saveCalcEnabledPref() {
    try {
      window.saveToStorage(CALC_ENABLED_KEY, worldClockCalculatorEnabled);
    } catch (e) {
      if (window.debugError) window.debugError('worldclock', 'save calc enabled failed', e);
    }
  }

  function saveCalcTargetPref() {
    try {
      window.saveToStorage(CALC_TARGET_KEY, worldClockCalculatorTarget);
    } catch (e) {
      if (window.debugError) window.debugError('worldclock', 'save calc target failed', e);
    }
  }

  function updateWorldClockCalculator() {
    const shell = document.getElementById('worldclockCalculator');
    if (!shell) return;
    if (!worldClockCalculatorEnabled) {
      shell.style.display = 'none';
      return;
    }
    shell.style.display = 'block';

    const now = new Date();
    const localTz = localTimeZoneId();
    const abbrEl = document.getElementById('wc-calc-local-abbr');
    const subEl = document.getElementById('wc-calc-local-sub');
    const timeEl = document.getElementById('wc-calc-local-time');
    if (abbrEl) abbrEl.textContent = shortTimeZoneAbbrev(now, localTz);
    if (subEl) subEl.textContent = getLocalClockLabel() + ' · ' + localTz;
    if (timeEl) timeEl.textContent = formatHMSLocal(now);

    const inp = document.getElementById('wc-calc-target-input');
    if (inp && !calcTargetInputHydrated) {
      inp.value = worldClockCalculatorTarget || '';
      calcTargetInputHydrated = true;
    }

    const raw = inp ? inp.value.trim() : (worldClockCalculatorTarget || '').trim();
    const meta = document.getElementById('wc-calc-target-meta');
    const ttime = document.getElementById('wc-calc-target-time');
    const terr = document.getElementById('wc-calc-target-err');

    if (terr) {
      terr.style.display = 'none';
      terr.textContent = '';
    }

    if (!raw) {
      if (meta) meta.textContent = 'Enter PST, EET, Europe/London…';
      if (ttime) ttime.textContent = '—';
      return;
    }

    const resolved = resolveCalculatorTarget(raw);
    if (!resolved) {
      if (meta) meta.textContent = '';
      if (ttime) ttime.textContent = '—';
      if (terr) {
        terr.style.display = 'block';
        terr.textContent = 'Unknown zone — try IANA (e.g. Europe/Athens) or a common code (PST, CET, EEST).';
      }
      return;
    }

    if (meta) {
      meta.textContent = shortTimeZoneAbbrev(now, resolved) + ' · ' + resolved;
    }
    if (ttime) ttime.textContent = formatHMS(now, resolved);
  }

  function formatHMS(now, tz) {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(now);
  }

  function formatHMSLocal(now) {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(now);
  }

  function buildTooltip(now, tz, displayLabel) {
    const long = longZoneName(now, tz);
    const off = utcOffsetLabel(now, tz);
    return displayLabel + ' — ' + long + ' — ' + tz + (off ? ' — ' + off : '');
  }

  function attrSafe(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  function renderWorldClockModule() {
    const container = document.getElementById('worldclockContainer');
    if (!container) return;

    const now = new Date();
    const localTz = localTimeZoneId();
    const wrapClass = 'worldclock-rows' + (worldClockTwoColumns ? ' worldclock-two-cols' : '');

    const localLbl = getLocalClockLabel();
    const localTip = buildTooltip(now, localTz, localLbl);

    if (worldClockZones.length === 0) {
      container.innerHTML =
        '<div class="' + wrapClass + '">' +
        rowHtml(localLbl, formatHMSLocal(now), utcOffsetLabel(now, localTz), '', localTip) +
        '</div>';
      updateWorldClockCalculator();
      return;
    }

    let inner = '';
    inner += rowHtml(localLbl, formatHMSLocal(now), utcOffsetLabel(now, localTz), '', localTip);

    worldClockZones.forEach(function(z) {
      const tz = z.timeZone.trim();
      const label = (z.label && String(z.label).trim()) || tz.split('/').pop().replace(/_/g, ' ');
      const note = dateDiffVsLocalLabel(now, tz);
      const off = utcOffsetLabel(now, tz);
      const tip = buildTooltip(now, tz, label);
      inner += rowHtml(label, formatHMS(now, tz), off, note, tip);
    });

    container.innerHTML = '<div class="' + wrapClass + '">' + inner + '</div>';
    updateWorldClockCalculator();
  }

  function generateZoneId() {
    return 'wc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 7);
  }

  function showWorldClockEditDialog(index) {
    const isNew = index < 0;
    const z = isNew ? { label: '', timeZone: '' } : worldClockZones[index];

    showModuleEditDialog({
      title: isNew ? 'Add time zone' : 'Edit time zone',
      icon: 'fas fa-globe',
      fields: [
        {
          id: 'label',
          label: 'Short label (optional)',
          type: 'text',
          placeholder: 'e.g. HQ',
          required: false
        },
        {
          id: 'timeZone',
          label: 'IANA time zone',
          type: 'text',
          placeholder: 'e.g. Europe/Athens',
          required: true
        }
      ],
      values: { label: z.label || '', timeZone: z.timeZone || '' },
      onDialogCreated: function(dialog) {
        const inp = dialog.querySelector('#module-edit-timeZone');
        if (inp) {
          inp.setAttribute('list', 'worldclock-tz-suggestions');
        }
      },
      onSave: async function(formData) {
        const raw = formData.timeZone.trim();
        if (!raw) {
          await window.popup.alert('Enter an IANA time zone ID.', 'Required');
          return;
        }
        const tz = resolveCanonicalTimeZone(raw);
        if (!tz) {
          await window.popup.alert(
            'Unknown or invalid time zone: ' + raw + '\n\nUse IANA names such as Europe/Athens for Greece, Europe/London for the UK, America/New_York for US Eastern.',
            'Invalid'
          );
          return;
        }
        const entry = {
          id: isNew ? generateZoneId() : worldClockZones[index].id,
          label: formData.label.trim(),
          timeZone: tz
        };
        if (isNew) {
          worldClockZones.push(entry);
        } else {
          worldClockZones[index] = entry;
        }
        saveZones();
        renderWorldClockList();
        renderWorldClockModule();
      }
    });
  }

  function renderWorldClockList() {
    const list = document.getElementById('worldclockList');
    if (!list) return;

    syncWorldClockDisplayPrefs();

    list.innerHTML = '';
    if (worldClockZones.length === 0) {
      list.innerHTML = '<div class="small" style="color:var(--muted);padding:10px;">No extra zones. Click Add and enter an IANA zone (e.g. Europe/Athens for Greece).</div>';
      return;
    }

    worldClockZones.forEach(function(z, index) {
      const label = (z.label && z.label.trim()) || z.timeZone;
      const item = document.createElement('div');
      item.className = 'module-item';
      item.draggable = true;
      item.dataset.index = String(index);
      item.innerHTML =
        '<div class="module-icon drag-handle" style="cursor:grab;color:var(--muted);" title="Drag to reorder"><i class="fas fa-grip-vertical"></i></div>' +
        '<div class="module-icon"><i class="fas fa-clock"></i></div>' +
        '<div class="module-info">' +
        '<div class="module-name">' + (window.escapeHtml ? window.escapeHtml(label) : label) + '</div>' +
        '<div class="module-desc mono">' + (window.escapeHtml ? window.escapeHtml(z.timeZone) : z.timeZone) + '</div>' +
        '</div>' +
        '<div class="module-controls">' +
        '<button type="button" class="btn-small wc-move-up" data-i="' + index + '"' + (index === 0 ? ' disabled' : '') + ' title="Up"><i class="fas fa-arrow-up"></i></button>' +
        '<button type="button" class="btn-small wc-move-down" data-i="' + index + '"' + (index === worldClockZones.length - 1 ? ' disabled' : '') + ' title="Down"><i class="fas fa-arrow-down"></i></button>' +
        '<button type="button" class="btn-small wc-edit" data-i="' + index + '"><i class="fas fa-edit"></i></button>' +
        '<button type="button" class="btn-small wc-del" data-i="' + index + '"><i class="fas fa-trash"></i></button>' +
        '</div>';
      list.appendChild(item);

      item.querySelector('.wc-edit').addEventListener('click', function() {
        showWorldClockEditDialog(index);
      });
      item.querySelector('.wc-del').addEventListener('click', async function() {
        const ok = await window.popup.confirm('Remove this time zone?', 'Confirm');
        if (!ok) return;
        worldClockZones.splice(index, 1);
        saveZones();
        renderWorldClockList();
        renderWorldClockModule();
      });
      const up = item.querySelector('.wc-move-up');
      if (up && !up.disabled) {
        up.addEventListener('click', function() {
          if (index > 0) {
            const t = worldClockZones[index - 1];
            worldClockZones[index - 1] = worldClockZones[index];
            worldClockZones[index] = t;
            saveZones();
            renderWorldClockList();
            renderWorldClockModule();
          }
        });
      }
      const down = item.querySelector('.wc-move-down');
      if (down && !down.disabled) {
        down.addEventListener('click', function() {
          if (index < worldClockZones.length - 1) {
            const t = worldClockZones[index + 1];
            worldClockZones[index + 1] = worldClockZones[index];
            worldClockZones[index] = t;
            saveZones();
            renderWorldClockList();
            renderWorldClockModule();
          }
        });
      }

      if (window.setupDragAndDrop) {
        window.setupDragAndDrop(item, index, worldClockZones, function(from, to) {
          if (window.moveArrayItem) {
            window.moveArrayItem(worldClockZones, from, to);
          }
        }, function() {
          saveZones();
          renderWorldClockList();
          renderWorldClockModule();
        });
      }
    });
  }

  function fillTzDatalist() {
    const dl = document.getElementById('worldclock-tz-suggestions');
    if (!dl) return;
    dl.innerHTML = COMMON_TIMEZONES.map(function(tz) {
      return '<option value="' + tz + '"></option>';
    }).join('');
  }

  function openWorldClockPrefs() {
    if (window.openPreferencesTab) {
      window.openPreferencesTab('worldclock');
    }
  }

  let worldClockPrefsBound = false;

  function initWorldClock() {
    loadZones();
    loadTwoColumnsPref();
    loadLocalLabelPref();
    loadCalcPrefs();
    fillTzDatalist();
    syncWorldClockDisplayPrefs();
    calcTargetInputHydrated = false;
    renderWorldClockModule();

    if (!worldClockPrefsBound) {
      worldClockPrefsBound = true;
      const twoCb = document.getElementById('pref-worldclock-two-cols');
      if (twoCb) {
        twoCb.addEventListener('change', function() {
          worldClockTwoColumns = !!twoCb.checked;
          saveTwoColumnsPref();
          renderWorldClockModule();
        });
      }
      const calcCb = document.getElementById('pref-worldclock-calc-enabled');
      if (calcCb) {
        calcCb.addEventListener('change', function() {
          worldClockCalculatorEnabled = !!calcCb.checked;
          saveCalcEnabledPref();
          updateWorldClockCalculator();
        });
      }
      const labInp = document.getElementById('pref-worldclock-local-label');
      if (labInp) {
        function applyLocalLabelFromInput() {
          worldClockLocalDisplayLabel = labInp.value;
          saveLocalLabelPref();
          renderWorldClockModule();
        }
        labInp.addEventListener('change', applyLocalLabelFromInput);
        labInp.addEventListener('blur', applyLocalLabelFromInput);
      }
      const calcInp = document.getElementById('wc-calc-target-input');
      if (calcInp) {
        calcInp.addEventListener('input', function() {
          updateWorldClockCalculator();
        });
        calcInp.addEventListener('change', function() {
          worldClockCalculatorTarget = calcInp.value;
          saveCalcTargetPref();
        });
        calcInp.addEventListener('blur', function() {
          worldClockCalculatorTarget = calcInp.value;
          saveCalcTargetPref();
        });
      }
    }

    const addPref = document.getElementById('addWorldClockBtn');
    if (addPref) {
      addPref.addEventListener('click', function() {
        showWorldClockEditDialog(-1);
      });
    }
    const cardAdd = document.getElementById('worldclockCardAddBtn');
    if (cardAdd) {
      cardAdd.addEventListener('click', function() {
        openWorldClockPrefs();
        requestAnimationFrame(function() {
          requestAnimationFrame(function() {
            showWorldClockEditDialog(-1);
          });
        });
      });
    }

    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(renderWorldClockModule, 1000);
  }

  window.initWorldClock = initWorldClock;
  window.renderWorldClockModule = renderWorldClockModule;
  window.renderWorldClockList = renderWorldClockList;
  window.showWorldClockEditDialog = showWorldClockEditDialog;
})();
