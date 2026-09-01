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

  // --- HARDWARE & DEVICE FINGERPRINTING (Zero external dependencies) ---
  async getDeviceFingerprint() {
    try {
      const parts = [
        navigator.userAgent || '',
        navigator.language || '',
        screen.width + 'x' + screen.height + 'x' + screen.colorDepth,
        new Date().getTimezoneOffset(),
        navigator.hardwareConcurrency || 1,
        navigator.deviceMemory || 1,
        navigator.platform || '',
        (navigator.languages || []).join(',')
      ];

      // Canvas 2D graphic rendering hash
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 50;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.textBaseline = 'top';
          ctx.font = "14px 'Arial'";
          ctx.textBaseline = 'alphabetic';
          ctx.fillStyle = '#f60';
          ctx.fillRect(125, 1, 62, 20);
          ctx.fillStyle = '#069';
          ctx.fillText('SamForm, AntiRetake 🔒', 2, 15);
          ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
          ctx.fillText('SamForm, AntiRetake 🔒', 4, 17);
          parts.push(canvas.toDataURL());
        }
      } catch (e) {}

      const raw = parts.join('###');
      // Simple resilient 32-bit FNV-1a string hash to hex
      let hash = 2166136261;
      for (let i = 0; i < raw.length; i++) {
        hash ^= raw.charCodeAt(i);
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
      }
      const hex = (hash >>> 0).toString(16).padStart(8, '0');
      return `dev_${hex}`;
    } catch (err) {
      return `dev_${Math.random().toString(36).substr(2, 8)}`;
    }
  },

  // Fetch Public Client IP Address with quick timeout & multiple fallbacks
  async getClientIP() {
    // 1. Check local session cache first to speed up
    const cachedIP = sessionStorage.getItem('samform_cached_client_ip');
    if (cachedIP) return cachedIP;

    const fetchWithTimeout = (url, ms = 2500) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), ms);
      return fetch(url, { signal: controller.signal })
        .then(r => r.json())
        .finally(() => clearTimeout(timeoutId));
    };

    try {
      const data = await fetchWithTimeout('https://api.ipify.org?format=json', 2500);
      if (data && data.ip) {
        sessionStorage.setItem('samform_cached_client_ip', data.ip);
        return data.ip;
      }
    } catch (e) {}

    try {
      const data = await fetchWithTimeout('https://ipapi.co/json/', 2500);
      if (data && data.ip) {
        sessionStorage.setItem('samform_cached_client_ip', data.ip);
        return data.ip;
      }
    } catch (e) {}

    return 'N/A';
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

  // True Standard QR Code Generator (100% Scannable by all smartphones)
  generateQRCodeElement(text, size = 180, containerId = 'qr-container-target') {
    // Generate clean direct URL using standard QR API / library
    const encoded = encodeURIComponent(text);
    const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}&margin=8&qzone=1`;

    return `
      <div id="${containerId}" style="display:inline-block; background:#ffffff; padding:12px; border-radius:12px; border:1px solid #e2e8f0; box-shadow:0 4px 12px rgba(0,0,0,0.06);">
        <img src="${qrImgUrl}" alt="Scan QR Code" width="${size}" height="${size}" style="display:block; border-radius:4px;" />
      </div>
    `;
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
    const qrElement = this.generateQRCodeElement(shareUrl, 190);
    const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(shareUrl)}&margin=12&qzone=1`;

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
                ${qrElement}
              </div>
              <small class="text-muted" style="display:block; margin-top:0.4rem;">Scan with any smartphone camera or QR reader app.</small>
              <div style="margin-top: 0.85rem;">
                <a href="${qrImgUrl}" download="samform_qr_${form.id}.png" target="_blank" class="btn btn-sm btn-outline">
                  <span style="vertical-align:-2px;">${icon('download', 14)}</span> Download High-Res QR (PNG)
                </a>
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
