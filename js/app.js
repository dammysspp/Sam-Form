/**
 * FormForge Admin Dashboard Controller
 */

class DashboardApp {
  constructor() {
    this.forms = [];
    this.allResponses = [];
    this.filterStatus = 'all';
    this.searchTerm = '';
  }

  async init() {
    await this.loadData();
    this.render();
  }

  async loadData() {
    this.forms = await DB.getAllForms();
    this.allResponses = await DB.getAllResponses();

    // If initial launch with no forms, initialize default templates automatically
    if (this.forms.length === 0) {
      await this.seedInitialTemplates();
      this.forms = await DB.getAllForms();
    }
  }

  async seedInitialTemplates() {
    try {
      const resp = await fetch('data/templates.json');
      const templates = await resp.json();
      for (const tpl of templates) {
        const formObj = Utils.clone(tpl);
        formObj.id = `form_${tpl.id.replace('tpl-', '')}`;
        formObj.status = 'published';
        formObj.createdAt = new Date().toISOString();
        formObj.updatedAt = formObj.createdAt;
        await DB.saveForm(formObj);
      }
    } catch (e) {
      console.warn('Initial seeding skipped', e);
    }
  }

  render() {
    this.renderMetrics();
    this.renderFormsGrid();
    this.renderTemplates();
  }

  renderMetrics() {
    const totalForms = this.forms.length;
    const publishedForms = this.forms.filter(f => f.status === 'published').length;
    const draftForms = this.forms.filter(f => f.status === 'draft').length;
    const totalResponses = this.allResponses.length;

    // Update Cloud Connection status button label
    const cloudBtn = document.getElementById('btn-cloud-settings');
    if (cloudBtn && window.FormForgeSupabase) {
      if (FormForgeSupabase.isReady()) {
        cloudBtn.innerHTML = `<span style="color:var(--success); vertical-align:-2px;">${icon('check', 14)}</span> Supabase: Connected`;
        cloudBtn.className = 'btn btn-secondary';
      } else {
        cloudBtn.innerHTML = `<span style="vertical-align:-2px;">${icon('zap', 14)}</span> Connect Supabase`;
        cloudBtn.className = 'btn btn-secondary';
      }
    }

    let avgScore = 0;
    if (totalResponses > 0) {
      const sum = this.allResponses.reduce((acc, r) => acc + (r.scoring?.percentage || 0), 0);
      avgScore = Math.round((sum / totalResponses) * 10) / 10;
    }

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setVal('metric-total-forms', totalForms);
    setVal('metric-published-forms', publishedForms);
    setVal('metric-draft-forms', draftForms);
    setVal('metric-total-responses', totalResponses);
    setVal('metric-avg-score', `${avgScore}%`);
  }

  renderFormsGrid() {
    const grid = document.getElementById('forms-grid');
    if (!grid) return;

    let list = this.forms.filter(f => {
      if (this.filterStatus !== 'all' && f.status !== this.filterStatus) return false;
      if (this.searchTerm) {
        const term = this.searchTerm.toLowerCase();
        return (f.title || '').toLowerCase().includes(term) || (f.description || '').toLowerCase().includes(term);
      }
      return true;
    });

    if (list.length === 0) {
      grid.innerHTML = `
        <div class="empty-forms-box">
          <div class="empty-icon" style="color:var(--text-muted);">${icon('form', 48)}</div>
          <h3>No forms found</h3>
          <p class="text-muted">${this.searchTerm ? 'Try adjusting your search criteria.' : 'Create your first form or pick a starter template below!'}</p>
          <a href="builder.html" class="btn btn-primary"><span style="vertical-align:-2px;">${icon('plus', 14)}</span> Create New Form</a>
        </div>
      `;
      return;
    }

    grid.innerHTML = list.map(f => {
      const respCount = this.allResponses.filter(r => r.formId === f.id).length;
      const qCount = f.questions?.length || 0;
      const timeLimitText = f.timeLimit ? `${f.timeLimit} mins` : 'Untimed';

      return `
        <div class="form-card" data-form-id="${f.id}">
          <div class="form-card-top theme-accent-${f.theme || 'indigo'}">
            <div class="form-card-badges">
              <span class="status-badge status-${f.status || 'draft'}">${(f.status || 'draft').toUpperCase()}</span>
              <span class="mode-badge">${(f.mode || 'exam').toUpperCase()}</span>
            </div>
            <h3 class="form-card-title">
              <a href="builder.html?id=${f.id}">${Utils.escapeHTML(f.title || 'Untitled Form')}</a>
            </h3>
            <p class="form-card-desc">${Utils.escapeHTML(f.description || 'No description provided.')}</p>
          </div>

          <div class="form-card-meta">
            <div class="meta-item"><span style="vertical-align:-2px; opacity:0.8;">${icon('helpCircle', 14)}</span> ${qCount} Questions</div>
            <div class="meta-item"><span style="vertical-align:-2px; opacity:0.8;">${icon('clock', 14)}</span> ${timeLimitText}</div>
            <div class="meta-item"><span style="vertical-align:-2px; opacity:0.8;">${icon('users', 14)}</span> <a href="results.html?id=${f.id}" class="meta-link" style="font-weight:700; color:var(--primary);">${respCount} Submissions</a></div>
          </div>

          <div class="form-card-footer">
            <div class="footer-btn-group">
              <a href="builder.html?id=${f.id}" class="btn btn-sm btn-primary">Edit</a>
              <a href="responder.html?id=${f.id}&preview=true" target="_blank" class="btn btn-sm btn-secondary">Preview</a>
              <a href="results.html?id=${f.id}" class="btn btn-sm btn-outline">Results (${respCount})</a>
            </div>

            <div class="footer-dropdown-wrap">
              <button class="btn-icon" style="width:32px; height:32px; border-radius:6px; background:var(--bg-surface-subtle);" onclick="App.toggleCardMenu(event, '${f.id}')">⋮</button>
              <div class="card-context-menu" id="menu_${f.id}">
                <button onclick="App.shareForm('${f.id}')"><span style="vertical-align:-2px;">${icon('share', 14)}</span> Share & QR Code</button>
                <button onclick="App.duplicateForm('${f.id}')"><span style="vertical-align:-2px;">${icon('form', 14)}</span> Duplicate</button>
                <button onclick="App.exportJSON('${f.id}')"><span style="vertical-align:-2px;">${icon('download', 14)}</span> Export JSON</button>
                <button onclick="App.exportCSV('${f.id}')"><span style="vertical-align:-2px;">${icon('chart', 14)}</span> Export Questions CSV</button>
                <button onclick="App.toggleStatus('${f.id}')"><span style="vertical-align:-2px;">${icon('rotate', 14)}</span> Change Status</button>
                <button class="text-danger" onclick="App.deleteForm('${f.id}')">Delete</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  async renderTemplates() {
    const container = document.getElementById('templates-container');
    if (!container) return;

    try {
      const resp = await fetch('data/templates.json');
      const templates = await resp.json();

      container.innerHTML = templates.map(t => {
        const tIcon = t.category === 'Quiz' ? icon('award', 24) : t.category === 'Examination' ? icon('fileText', 24) : icon('form', 24);
        return `
          <div class="template-item-card" onclick="window.location.href='builder.html?template=${t.id}'">
            <div class="template-icon-wrap" style="color:var(--primary);">
              ${tIcon}
            </div>
            <div class="template-info">
              <h4>${Utils.escapeHTML(t.title)}</h4>
              <p class="text-muted">${Utils.escapeHTML(t.description)}</p>
              <span class="template-tag">${t.category} • ${t.questions?.length || 0} Questions</span>
            </div>
            <button class="btn btn-sm btn-outline">Use Template</button>
          </div>
        `;
      }).join('');
    } catch (e) {
      container.innerHTML = '<p class="text-muted">No templates available.</p>';
    }
  }

  toggleCardMenu(event, formId) {
    event.stopPropagation();
    document.querySelectorAll('.card-context-menu.open').forEach(m => m.classList.remove('open'));
    const menu = document.getElementById(`menu_${formId}`);
    if (menu) menu.classList.toggle('open');
  }

  setFilter(status) {
    this.filterStatus = status;
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.toggle('active', p.dataset.filter === status));
    this.renderFormsGrid();
  }

  handleSearch(val) {
    this.searchTerm = val;
    this.renderFormsGrid();
  }

  // --- ACTIONS ---
  async duplicateForm(formId) {
    const form = this.forms.find(f => f.id === formId);
    if (!form) return;

    const clone = Utils.clone(form);
    clone.id = Utils.uid('form');
    clone.title = `${form.title} (Copy)`;
    clone.status = 'draft';
    clone.createdAt = new Date().toISOString();
    clone.updatedAt = clone.createdAt;

    await DB.saveForm(clone);
    await this.loadData();
    this.render();
    Utils.showToast('Form duplicated successfully', 'success');
  }

  async deleteForm(formId) {
    const ok = await Utils.confirmDialog({
      title: 'Delete Form',
      message: 'Are you sure you want to permanently delete this form and all associated responses?',
      confirmText: 'Delete Permanently',
      isDanger: true
    });

    if (ok) {
      await DB.deleteForm(formId);
      await this.loadData();
      this.render();
      Utils.showToast('Form deleted', 'info');
    }
  }

  async toggleStatus(formId) {
    const form = this.forms.find(f => f.id === formId);
    if (!form) return;

    const nextStatus = form.status === 'published' ? 'closed' : form.status === 'closed' ? 'draft' : 'published';
    form.status = nextStatus;
    await DB.saveForm(form);
    await this.loadData();
    this.render();
    Utils.showToast(`Status updated to ${nextStatus.toUpperCase()}`, 'success');
  }

  shareForm(formId) {
    const form = this.forms.find(f => f.id === formId);
    if (form) Utils.openShareHubModal(form);
  }

  exportJSON(formId) {
    const form = this.forms.find(f => f.id === formId);
    if (form) Exporter.exportFormJSON(form);
  }

  exportCSV(formId) {
    const form = this.forms.find(f => f.id === formId);
    if (form) Exporter.exportQuestionsCSV(form);
  }

  openDashboardImport() {
    Builder.openImportModal();
  }

  openCloudConfigModal() {
    const isConnected = window.FormForgeSupabase && FormForgeSupabase.isReady();
    const currentUrl = localStorage.getItem('formforge_supabase_url') || '';
    const currentKey = localStorage.getItem('formforge_supabase_key') || '';

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-card modal-md">
        <div class="modal-header">
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <span style="font-size:1.4rem;">⚡</span>
            <h3 class="modal-title">Supabase Cloud Database Connection</h3>
          </div>
          <button class="btn-icon" onclick="this.closest('.modal-backdrop').remove()">✕</button>
        </div>

        <div class="modal-body">
          <div class="alert-box alert-info" style="margin-bottom:1.25rem;">
            <span>${isConnected ? '🟢 <strong>Connected to Supabase!</strong> All forms and candidate submissions are syncing to your cloud database.' : '⚪ Connect your free Supabase project to centrally collect all candidate responses when hosted on GitHub Pages.'}</span>
          </div>

          <div class="form-group" style="margin-bottom:1rem;">
            <label class="form-label">Supabase Project URL <span class="required-star">*</span></label>
            <input type="url" id="sb_url_input" class="form-input" placeholder="https://xyzcompany.supabase.co" value="${Utils.escapeHTML(currentUrl)}" />
            <small class="text-muted">Found in Supabase Dashboard → Settings → API → Project URL</small>
          </div>

          <div class="form-group" style="margin-bottom:1rem;">
            <label class="form-label">Supabase Anon Public API Key <span class="required-star">*</span></label>
            <input type="text" id="sb_key_input" class="form-input" placeholder="eyJhbGciOiJIUzI1NiIsIn..." value="${Utils.escapeHTML(currentKey)}" />
            <small class="text-muted">Found in Supabase Dashboard → Settings → API → Project API Keys (anon / public)</small>
          </div>

          <details style="margin-top:1rem; padding:0.75rem; background:var(--bg-surface-subtle); border-radius:var(--radius-sm);">
            <summary style="cursor:pointer; font-weight:600; font-size:0.85rem;">📋 Click here for 1-step SQL Database Setup</summary>
            <p style="font-size:0.8rem; margin:0.5rem 0; color:var(--text-muted);">
              Run the SQL script from <code>supabase_schema.sql</code> in your Supabase SQL Editor to create the <code>forms</code> and <code>responses</code> tables.
            </p>
          </details>
        </div>

        <div class="modal-footer">
          ${isConnected ? `
            <button class="btn btn-secondary" id="btn-disconnect-sb" style="color:var(--danger);">Disconnect</button>
          ` : ''}
          <button class="btn btn-secondary" onclick="this.closest('.modal-backdrop').remove()">Cancel</button>
          <button class="btn btn-primary" id="btn-save-sb">Save & Connect</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const saveBtn = modal.querySelector('#btn-save-sb');
    saveBtn.onclick = async () => {
      const url = modal.querySelector('#sb_url_input').value.trim();
      const key = modal.querySelector('#sb_key_input').value.trim();

      if (!url || !key) {
        Utils.showToast('Please enter both Supabase URL and Anon API Key', 'error');
        return;
      }

      const ok = FormForgeSupabase.updateCredentials(url, key);
      if (ok) {
        Utils.showToast('Connected to Supabase successfully!', 'success');
        modal.remove();
        await this.loadData();
        this.render();
      } else {
        Utils.showToast('Failed to initialize Supabase client. Please check your credentials.', 'error');
      }
    };

    const disBtn = modal.querySelector('#btn-disconnect-sb');
    if (disBtn) {
      disBtn.onclick = async () => {
        FormForgeSupabase.updateCredentials('', '');
        Utils.showToast('Disconnected from Supabase. Working in local offline mode.', 'info');
        modal.remove();
        await this.loadData();
        this.render();
      };
    }
  }
}

window.App = new DashboardApp();

// Close open dropdown menus on click outside
window.addEventListener('click', () => {
  document.querySelectorAll('.card-context-menu.open').forEach(m => m.classList.remove('open'));
});
