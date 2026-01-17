// Config Export/Import System

// Collect all localStorage data
function collectAllConfig() {
  const config = {};
  // Get all localStorage keys
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      try {
        // Use loadFromStorage which handles JSON parsing automatically
        const value = window.loadFromStorage(key);
        if (value !== null) {
          config[key] = value;
        }
      } catch (e) {
        if (window.debugError) window.debugError('config', 'Error reading localStorage key:', key, e);
      }
    }
  }
  return config;
}

// Import config into localStorage
function importConfig(configData) {
  let imported = 0;
  let errors = 0;

  for (const [key, value] of Object.entries(configData)) {
    try {
      // Use saveToStorage which handles JSON automatically
      window.saveToStorage(key, value);
      imported++;
    } catch (e) {
      if (window.debugError) window.debugError('config', 'Error importing key:', key, e);
      errors++;
    }
  }

  return { imported, errors };
}

// Using escapeHtml from core.js

// Load and display server configs
async function loadServerConfigs() {
  const listEl = document.getElementById('serverConfigsList');
  if (!listEl) return;

  try {
    const res = await fetch('/api/config/list');
    const data = await res.json();
    const configs = data.configs || [];

    if (configs.length === 0) {
      listEl.innerHTML = '<div class="small" style="color:var(--muted);">No configs stored on server</div>';
      return;
    }

    listEl.innerHTML = '';
    configs.forEach(name => {
      const item = document.createElement('div');
      item.className = 'module-item';
      item.style.marginBottom = '8px';
      item.innerHTML = `
        <div class="module-info" style="flex:1;">
          <div class="module-name">${window.escapeHtml(name)}</div>
        </div>
        <div class="module-controls">
          <button class="btn-small download-config-btn" data-name="${window.escapeHtml(name)}" title="Download and apply"><i class="fas fa-download"></i></button>
          <button class="btn-small delete-config-btn" data-name="${window.escapeHtml(name)}" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
      `;

      // Download button
      const downloadBtn = item.querySelector('.download-config-btn');
      downloadBtn.addEventListener('click', async () => {
        try {
          const res = await fetch(`/api/config/download?name=${encodeURIComponent(name)}`);
          const configData = await res.json();
          if (configData.error) {
            await window.popup.alert('Error: ' + configData.error, 'Error');
            return;
          }

          const confirmed = await window.popup.confirm('This will overwrite your current configuration. Continue?', 'Confirm Import');
          if (confirmed) {
            const result = importConfig(configData);
            await window.popup.alert(`Imported ${result.imported} items${result.errors > 0 ? ` (${result.errors} errors)` : ''}. Page will reload.`, 'Import Complete');
            location.reload();
          }
        } catch (err) {
          await window.popup.alert('Error downloading config: ' + err.message, 'Error');
        }
      });

      // Delete button
      const deleteBtn = item.querySelector('.delete-config-btn');
      deleteBtn.addEventListener('click', async () => {
        const confirmed = await window.popup.confirm(`Delete config "${name}"?`, 'Confirm Delete');
        if (!confirmed) return;

        try {
          const res = await fetch(`/api/config/delete?name=${encodeURIComponent(name)}`, {
            method: 'DELETE'
          });
          const result = await res.json();
          if (result.error) {
            await window.popup.alert('Error: ' + result.error, 'Error');
          } else {
            loadServerConfigs();
          }
        } catch (err) {
          await window.popup.alert('Error deleting config: ' + err.message, 'Error');
        }
      });

      listEl.appendChild(item);
    });
  } catch (err) {
    listEl.innerHTML = '<div class="small" style="color:var(--muted);">Error loading configs: ' + err.message + '</div>';
  }
}

// Initialize config management
(function() {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initConfigManagement);
  } else {
    initConfigManagement();
  }

  function initConfigManagement() {
    // Export button
    const exportBtn = document.getElementById('exportConfigBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const config = collectAllConfig();
        const jsonStr = JSON.stringify(config, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'homepage-config-' + new Date().toISOString().split('T')[0] + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    }

    // Import button
    const importBtn = document.getElementById('importConfigBtn');
    const importFile = document.getElementById('importConfigFile');
    if (importBtn && importFile) {
      importBtn.addEventListener('click', () => {
        importFile.click();
      });

      importFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            const configData = JSON.parse(event.target.result);
            const confirmed = await window.popup.confirm('This will overwrite your current configuration. Continue?', 'Confirm Import');
            if (confirmed) {
              const result = importConfig(configData);
              await window.popup.alert(`Imported ${result.imported} items${result.errors > 0 ? ` (${result.errors} errors)` : ''}. Page will reload.`, 'Import Complete');
              location.reload();
            }
          } catch (err) {
            await window.popup.alert('Error importing config: ' + err.message, 'Error');
          }
        };
        reader.readAsText(file);
        e.target.value = ''; // Reset file input
      });
    }

    // Upload config to server
    const uploadBtn = document.getElementById('uploadConfigBtn');
    const configNameInput = document.getElementById('configNameInput');
    if (uploadBtn && configNameInput) {
      uploadBtn.addEventListener('click', async () => {
        const name = configNameInput.value.trim();
        if (!name) {
          await window.popup.alert('Please enter a config name', 'Input Required');
          return;
        }

        if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
          await window.popup.alert('Config name can only contain letters, numbers, dashes, and underscores', 'Invalid Name');
          return;
        }

        try {
          const config = collectAllConfig();
          const res = await fetch(`/api/config/upload?name=${encodeURIComponent(name)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
          });
          const result = await res.json();
          if (result.error) {
            await window.popup.alert('Error: ' + result.error, 'Error');
          } else {
            await window.popup.alert('Config uploaded successfully!', 'Success');
            configNameInput.value = '';
            loadServerConfigs();
          }
        } catch (err) {
          await window.popup.alert('Error uploading config: ' + err.message, 'Error');
        }
      });
    }

    // Server configs are now loaded when preferences modal opens (handled in preferences.js)
  }

  // Export to window
  window.loadServerConfigs = loadServerConfigs;
})();
