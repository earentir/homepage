// Generic popup component to replace browser alert/confirm dialogs

(function() {
  'use strict';

  let popupContainer = null;
  let currentResolve = null;

  // Initialize popup container
  function initPopup() {
    if (popupContainer) return;

    popupContainer = document.createElement('div');
    popupContainer.id = 'popup-container';
    popupContainer.innerHTML = `
      <div class="popup-overlay" id="popup-overlay"></div>
      <div class="popup-dialog" id="popup-dialog" role="dialog" aria-modal="true">
        <div class="popup-header">
          <h3 class="popup-title" id="popup-title"></h3>
          <button class="popup-close" id="popup-close" aria-label="Close">&times;</button>
        </div>
        <div class="popup-body">
          <div class="popup-message" id="popup-message"></div>
        </div>
        <div class="popup-footer" id="popup-footer">
          <button class="popup-btn popup-btn-secondary" id="popup-cancel" style="display: none;">Cancel</button>
          <button class="popup-btn popup-btn-primary" id="popup-ok">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(popupContainer);

    // Add styles
    const style = document.createElement('style');
    style.textContent = `
      #popup-container {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 10000;
        display: none;
        align-items: center;
        justify-content: center;
      }
      #popup-container.show {
        display: flex;
      }
      .popup-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(2px);
      }
      .popup-dialog {
        position: relative;
        background: var(--bg, #fff);
        border: 1px solid var(--border, #ddd);
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        min-width: 300px;
        max-width: 500px;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
        z-index: 10001;
        animation: popupFadeIn 0.2s ease-out;
      }
      @keyframes popupFadeIn {
        from {
          opacity: 0;
          transform: scale(0.95);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }
      .popup-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid var(--border, #ddd);
      }
      .popup-title {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        color: var(--txt, #333);
      }
      .popup-close {
        background: none;
        border: none;
        font-size: 24px;
        line-height: 1;
        color: var(--muted, #999);
        cursor: pointer;
        padding: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.2s;
      }
      .popup-close:hover {
        color: var(--txt, #333);
      }
      .popup-body {
        padding: 20px;
        overflow-y: auto;
        flex: 1;
      }
      .popup-message {
        color: var(--txt, #333);
        line-height: 1.5;
        white-space: pre-wrap;
        word-wrap: break-word;
      }
      .popup-footer {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
        padding: 16px 20px;
        border-top: 1px solid var(--border, #ddd);
      }
      .popup-btn {
        padding: 8px 16px;
        border: 1px solid var(--border, #ddd);
        border-radius: 4px;
        font-size: 14px;
        cursor: pointer;
        transition: all 0.2s;
        font-weight: 500;
      }
      .popup-btn-primary {
        background: var(--accent, #4a90e2);
        color: #fff;
        border-color: var(--accent, #4a90e2);
      }
      .popup-btn-primary:hover {
        background: var(--accent-hover, #357abd);
        border-color: var(--accent-hover, #357abd);
      }
      .popup-btn-secondary {
        background: var(--bg, #fff);
        color: var(--txt, #333);
      }
      .popup-btn-secondary:hover {
        background: var(--hover-bg, #f5f5f5);
      }
    `;
    document.head.appendChild(style);

    // Setup event listeners
    const overlay = document.getElementById('popup-overlay');
    const closeBtn = document.getElementById('popup-close');
    const cancelBtn = document.getElementById('popup-cancel');
    const okBtn = document.getElementById('popup-ok');

    function closePopup(result) {
      if (popupContainer) {
        popupContainer.classList.remove('show');
      }
      if (currentResolve) {
        currentResolve(result);
        currentResolve = null;
      }
    }

    overlay.addEventListener('click', () => closePopup(false));
    closeBtn.addEventListener('click', () => closePopup(false));
    cancelBtn.addEventListener('click', () => closePopup(false));
    okBtn.addEventListener('click', () => closePopup(true));

    // ESC key handler
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && popupContainer && popupContainer.classList.contains('show')) {
        e.preventDefault();
        closePopup(false);
      }
    });
  }

  // Show alert popup
  window.popup = {
    alert: function(message, title = 'Alert') {
      return new Promise((resolve) => {
        initPopup();
        currentResolve = resolve;

        const titleEl = document.getElementById('popup-title');
        const messageEl = document.getElementById('popup-message');
        const cancelBtn = document.getElementById('popup-cancel');
        const okBtn = document.getElementById('popup-ok');
        const footer = document.getElementById('popup-footer');

        titleEl.textContent = title;
        messageEl.textContent = message;
        cancelBtn.style.display = 'none';
        okBtn.textContent = 'OK';
        footer.style.justifyContent = 'flex-end';

        popupContainer.classList.add('show');
        okBtn.focus();

        // Focus trap
        const focusableElements = popupContainer.querySelectorAll('button');
        const firstFocusable = focusableElements[0];
        const lastFocusable = focusableElements[focusableElements.length - 1];

        function trapFocus(e) {
          if (e.key !== 'Tab') return;
          if (e.shiftKey) {
            if (document.activeElement === firstFocusable) {
              e.preventDefault();
              lastFocusable.focus();
            }
          } else {
            if (document.activeElement === lastFocusable) {
              e.preventDefault();
              firstFocusable.focus();
            }
          }
        }

        popupContainer.addEventListener('keydown', trapFocus);
        currentResolve = function(result) {
          popupContainer.removeEventListener('keydown', trapFocus);
          popupContainer.classList.remove('show');
          resolve(result);
        };
      });
    },

    confirm: function(message, title = 'Confirm') {
      return new Promise((resolve) => {
        initPopup();
        currentResolve = resolve;

        const titleEl = document.getElementById('popup-title');
        const messageEl = document.getElementById('popup-message');
        const cancelBtn = document.getElementById('popup-cancel');
        const okBtn = document.getElementById('popup-ok');
        const footer = document.getElementById('popup-footer');

        titleEl.textContent = title;
        messageEl.textContent = message;
        cancelBtn.style.display = 'inline-block';
        okBtn.textContent = 'OK';
        footer.style.justifyContent = 'flex-end';

        popupContainer.classList.add('show');
        cancelBtn.focus();

        // Focus trap
        const focusableElements = popupContainer.querySelectorAll('button');
        const firstFocusable = focusableElements[0];
        const lastFocusable = focusableElements[focusableElements.length - 1];

        function trapFocus(e) {
          if (e.key !== 'Tab') return;
          if (e.shiftKey) {
            if (document.activeElement === firstFocusable) {
              e.preventDefault();
              lastFocusable.focus();
            }
          } else {
            if (document.activeElement === lastFocusable) {
              e.preventDefault();
              firstFocusable.focus();
            }
          }
        }

        popupContainer.addEventListener('keydown', trapFocus);
        currentResolve = function(result) {
          popupContainer.removeEventListener('keydown', trapFocus);
          popupContainer.classList.remove('show');
          resolve(result);
        };
      });
    }
  };
})();
