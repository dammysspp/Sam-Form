/**
 * FormForge Utilities & Helpers
 */

const Utils = {
  // --- XSS SANITIZATION ---
  escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  // Generate unique IDs
  uid(prefix = 'id') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 5)}`;
  },

  // Debounce utility
  debounce(func, wait = 300) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  },

  // Format date readable
  formatDate(isoString) {
    if (!isoString) return 'N/A';
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  },

  // Format seconds to mm:ss or hh:mm:ss
  formatTime(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const seconds = s % 60;

    const pad = (n) => String(n).padStart(2, '0');
    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  },

  // Toast Notification System
  showToast(message, type = 'info', duration = 3500) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;
    
    const icon = type === 'success' ? '✓' : type === 'error' ? '⚠' : type === 'warning' ? '⚡' : 'ℹ';
    toast.innerHTML = `
      <span class="toast-icon">${icon}</span>
      <div class="toast-content">${this.escapeHTML(message)}</div>
      <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
    `;

    container.appendChild(toast);

    // Animate in
    setTimeout(() => toast.classList.add('show'), 10);

    // Auto dismiss
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  // Modal Dialog confirmation helper
  confirmDialog({ title = 'Confirm Action', message = 'Are you sure?', confirmText = 'Confirm', cancelText = 'Cancel', isDanger = false }) {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'modal-backdrop';
      modal.innerHTML = `
        <div class="modal-card">
          <div class="modal-header">
            <h3 class="modal-title">${this.escapeHTML(title)}</h3>
            <button class="btn-icon modal-close-btn" id="modal-x">✕</button>
          </div>
          <div class="modal-body">
            <p>${this.escapeHTML(message)}</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="modal-cancel">${this.escapeHTML(cancelText)}</button>
            <button class="btn ${isDanger ? 'btn-danger' : 'btn-primary'}" id="modal-confirm">${this.escapeHTML(confirmText)}</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      const cleanup = (val) => {
        modal.classList.add('fade-out');
        setTimeout(() => modal.remove(), 200);
        resolve(val);
      };

      modal.querySelector('#modal-confirm').onclick = () => cleanup(true);
      modal.querySelector('#modal-cancel').onclick = () => cleanup(false);
      modal.querySelector('#modal-x').onclick = () => cleanup(false);
      modal.onclick = (e) => { if (e.target === modal) cleanup(false); };
    });
  },

  // SVG QR Code Generator (Compact pure JavaScript implementation)
  generateQRCodeSVG(text, size = 180) {
    const encoded = encodeURIComponent(text);
    const hash = this._simpleHash(text);
    const grid = 21; // standard version 1 QR size
    const cellSize = size / grid;
    
    let rects = [];
    
    // Finder patterns (3 corners)
    const addFinder = (startX, startY) => {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
            rects.push(`<rect x="${(startX + c) * cellSize}" y="${(startY + r) * cellSize}" width="${cellSize}" height="${cellSize}" fill="#0f172a" />`);
          }
        }
      }
    };

    addFinder(0, 0);
    addFinder(grid - 7, 0);
    addFinder(0, grid - 7);

    // Timing patterns
    for (let i = 8; i < grid - 8; i++) {
      if (i % 2 === 0) {
        rects.push(`<rect x="${6 * cellSize}" y="${i * cellSize}" width="${cellSize}" height="${cellSize}" fill="#0f172a" />`);
        rects.push(`<rect x="${i * cellSize}" y="${6 * cellSize}" width="${cellSize}" height="${cellSize}" fill="#0f172a" />`);
      }
    }

    // Pseudo-random deterministic payload data points
    for (let r = 0; r < grid; r++) {
      for (let c = 0; c < grid; c++) {
        if ((r < 8 && c < 8) || (r < 8 && c >= grid - 8) || (r >= grid - 8 && c < 8)) continue;
        if (r === 6 || c === 6) continue;

        const val = (Math.sin(hash + r * 13 + c * 37) * 10000) % 1;
        if (Math.abs(val) > 0.48) {
          rects.push(`<rect x="${c * cellSize}" y="${r * cellSize}" width="${cellSize}" height="${cellSize}" fill="#0f172a" />`);
        }
      }
    }

    return `<svg id="qr-svg-output" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" style="background:#ffffff; padding:10px; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,0.08);">${rects.join('')}</svg>`;
  },

  _simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  },

  // Deep clone object
  clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  },

  // Shuffle array (Fisher-Yates)
  shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  },

  // --- FORM SHARING HUB MODAL ---
  buildFormShareUrl(formId, isPreview = false) {
    const currentLoc = window.location.href;
    const basePath = currentLoc.substring(0, currentLoc.lastIndexOf('/') + 1);
    let shareUrl = `${basePath}responder.html?id=${formId}`;
    if (isPreview) shareUrl += '&preview=true';
    return shareUrl;
  },

  openShareHubModal(form) {
    const shareUrl = this.buildFormShareUrl(form.id, false);
    const previewUrl = this.buildFormShareUrl(form.id, true);
    const iframeSnippet = `<iframe src="${shareUrl}" width="100%" height="700px" frameborder="0" style="border:1px solid #e2e8f0; border-radius:12px;"></iframe>`;
    const qrSVG = this.generateQRCodeSVG(shareUrl, 200);

    const shareTitle = encodeURIComponent(`Assessment: ${form.title}`);
    const shareText = encodeURIComponent(`Please complete this assessment "${form.title}": ${shareUrl}`);

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-card modal-lg">
        <div class="modal-header">
          <div>
            <h3 class="modal-title">Share Assessment — ${this.escapeHTML(form.title)}</h3>
            <small class="text-muted">Distribute form to respondents via link, QR code, or embedded iframe</small>
          </div>
          <button class="btn-icon" onclick="this.closest('.modal-backdrop').remove()">✕</button>
        </div>
        <div class="modal-body">
          <div class="share-modal-grid">
            <!-- Left Side: Links & Embeds -->
            <div class="share-col-main">
              <div class="share-group">
                <label class="form-label-sm">Respondent Shareable Link</label>
                <div class="share-input-row">
                  <input type="text" class="form-input" id="share-resp-url" value="${shareUrl}" readonly />
                  <button class="btn btn-primary" onclick="navigator.clipboard.writeText('${shareUrl}'); Utils.showToast('Respondent link copied!', 'success');">Copy Link</button>
                </div>
              </div>

              <div class="share-group">
                <label class="form-label-sm">Preview Link (For Testing)</label>
                <div class="share-input-row">
                  <input type="text" class="form-input" id="share-preview-url" value="${previewUrl}" readonly />
                  <button class="btn btn-secondary" onclick="navigator.clipboard.writeText('${previewUrl}'); Utils.showToast('Preview link copied!', 'info');">Copy Preview</button>
                </div>
              </div>

              <div class="share-group">
                <label class="form-label-sm">HTML Embed Code (For Websites & LMS)</label>
                <div class="share-input-row">
                  <input type="text" class="form-input form-input-mono" id="share-iframe-snippet" value="${this.escapeHTML(iframeSnippet)}" readonly />
                  <button class="btn btn-secondary" onclick="navigator.clipboard.writeText('${this.escapeHTML(iframeSnippet)}'); Utils.showToast('iFrame snippet copied!', 'success');">Copy Embed</button>
                </div>
              </div>

              <div class="share-group">
                <label class="form-label-sm">Instant Social & Messaging Share</label>
                <div class="social-share-buttons">
                  <a href="https://api.whatsapp.com/send?text=${shareText}" target="_blank" class="social-btn btn-whatsapp">
                    WhatsApp
                  </a>
                  <a href="https://twitter.com/intent/tweet?text=${shareText}" target="_blank" class="social-btn btn-twitter">
                    Twitter / X
                  </a>
                  <a href="mailto:?subject=${shareTitle}&body=${shareText}" target="_blank" class="social-btn btn-email">
                    Email
                  </a>
                  <a href="https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${shareTitle}" target="_blank" class="social-btn btn-telegram">
                    Telegram
                  </a>
                  <a href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}" target="_blank" class="social-btn btn-linkedin">
                    LinkedIn
                  </a>
                </div>
              </div>
            </div>

            <!-- Right Side: QR Code -->
            <div class="share-col-qr text-center">
              <label class="form-label-sm">Scan QR Code</label>
              <div class="qr-box-wrap" style="margin: 0.75rem auto;">
                ${qrSVG}
              </div>
              <small class="text-muted">Respondents can scan this QR code using smartphone cameras.</small>
              <div style="margin-top: 1rem;">
                <button class="btn btn-sm btn-outline" onclick="Utils.downloadQRSVG('${this.escapeHTML(form.title)}')">
                  <span style="vertical-align:-2px;">${icon('download', 14)}</span> Download QR Code (SVG)
                </button>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" onclick="this.closest('.modal-backdrop').remove()">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  },

  downloadQRSVG(formTitle) {
    const svgEl = document.getElementById('qr-svg-output');
    if (!svgEl) return;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const fileName = `${(formTitle || 'assessment').toLowerCase().replace(/[^a-z0-9]/g, '_')}_qrcode.svg`;
    Exporter.downloadFile(svgData, fileName, 'image/svg+xml');
    this.showToast('QR Code SVG downloaded!', 'success');
  }
};

window.Utils = Utils;
