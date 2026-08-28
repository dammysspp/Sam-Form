/**
 * FormForge Form Builder Controller
 */

class FormBuilder {
  constructor() {
    this.form = null;
    this.undoStack = [];
    this.redoStack = [];
    this.maxHistory = 30;
    this.draggedQId = null;
    this.activeTab = 'questions'; // questions | settings | logic | theme
    this.isDirty = false;
    this.collapsedQuestions = new Set(); // Stores collapsed question IDs
  }

  toggleQuestionCollapse(qid) {
    if (this.collapsedQuestions.has(qid)) {
      this.collapsedQuestions.delete(qid);
    } else {
      this.collapsedQuestions.add(qid);
    }
    const cardEl = document.getElementById(`q_card_${qid}`);
    if (cardEl) {
      const isCollapsed = this.collapsedQuestions.has(qid);
      cardEl.classList.toggle('is-collapsed', isCollapsed);
      const iconBtn = cardEl.querySelector('.btn-toggle-collapse');
      if (iconBtn) {
        iconBtn.innerHTML = isCollapsed ? icon('chevronDown', 15) : icon('chevronUp', 15);
        iconBtn.title = isCollapsed ? 'Expand Question' : 'Collapse Question';
      }
    }
  }

  collapseAllQuestions() {
    (this.form.questions || []).forEach(q => this.collapsedQuestions.add(q.id));
    this.renderQuestionsTab();
    Utils.showToast('All questions collapsed', 'info', 1500);
  }

  expandAllQuestions() {
    this.collapsedQuestions.clear();
    this.renderQuestionsTab();
    Utils.showToast('All questions expanded', 'info', 1500);
  }

  collapseSectionQuestions(secId) {
    (this.form.questions || []).filter(q => q.sectionId === secId).forEach(q => this.collapsedQuestions.add(q.id));
    this.renderQuestionsTab();
  }

  expandSectionQuestions(secId) {
    (this.form.questions || []).filter(q => q.sectionId === secId).forEach(q => this.collapsedQuestions.delete(q.id));
    this.renderQuestionsTab();
  }

  async init() {
    const urlParams = new URLSearchParams(window.location.search);
    const formId = urlParams.get('id');
    const templateId = urlParams.get('template');

    if (formId) {
      this.form = await DB.getFormById(formId);
    } else if (templateId) {
      await this.loadTemplate(templateId);
    }

    if (!this.form) {
      this.createNewForm();
    }

    // Ensure required structure
    this.normalizeFormData();

    // Snapshot initial state
    this.saveHistoryState();

    // Bind UI
    this.bindEvents();
    this.render();

    // Setup Autosave interval every 15s if dirty
    setInterval(() => {
      if (this.isDirty) {
        this.saveForm(false);
      }
    }, 15000);
  }

  normalizeFormData() {
    if (!this.form.sections || this.form.sections.length === 0) {
      this.form.sections = [{ id: 'sec-1', title: 'Main Section', description: '' }];
    }
    if (!this.form.questions) this.form.questions = [];
    if (!this.form.settings) this.form.settings = {};
    if (!this.form.theme) this.form.theme = 'indigo';
    if (!this.form.status) this.form.status = 'draft';
    if (!this.form.mode) this.form.mode = 'exam';
    if (!this.form.conditionalLogic) this.form.conditionalLogic = [];

    // Ensure questions have valid sectionId
    const firstSecId = this.form.sections[0].id;
    this.form.questions.forEach(q => {
      if (!q.sectionId || !this.form.sections.some(s => s.id === q.sectionId)) {
        q.sectionId = firstSecId;
      }
    });
  }

  createNewForm() {
    this.form = {
      id: Utils.uid('form'),
      title: 'Untitled Assessment',
      description: 'Form description and instructions for respondents.',
      status: 'draft',
      mode: 'exam',
      theme: 'indigo',
      timeLimit: 20,
      passingScore: 60,
      version: 1,
      createdAt: new Date().toISOString(),
      sections: [
        { id: 'sec-1', title: 'General Questions', description: 'Please complete all items.' }
      ],
      questions: [
        QuestionsEngine.createDefault(QuestionTypes.MULTIPLE_CHOICE, 'sec-1')
      ],
      settings: {
        enableTimer: true,
        randomizeQuestions: false,
        randomizeOptions: false,
        negativeMarking: 0,
        showStudyFeedback: false,
        maxAttempts: 1,
        remarks: ScoringEngine.defaultRemarks
      },
      conditionalLogic: []
    };
  }

  async loadTemplate(templateId) {
    try {
      const resp = await fetch('data/templates.json');
      const templates = await resp.json();
      const match = templates.find(t => t.id === templateId);
      if (match) {
        this.form = Utils.clone(match);
        this.form.id = Utils.uid('form');
        this.form.title = `${match.title} (Copy)`;
        this.form.status = 'draft';
        this.form.createdAt = new Date().toISOString();
      }
    } catch (e) {
      console.warn('Template load failed', e);
    }
  }

  // --- UNDO / REDO SYSTEM ---
  saveHistoryState() {
    const snapshot = JSON.stringify(this.form);
    if (this.undoStack.length === 0 || this.undoStack[this.undoStack.length - 1] !== snapshot) {
      this.undoStack.push(snapshot);
      if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
      this.redoStack = [];
      this.isDirty = true;
      this.updateHistoryButtons();
    }
  }

  undo() {
    if (this.undoStack.length > 1) {
      const current = this.undoStack.pop();
      this.redoStack.push(current);
      const prev = this.undoStack[this.undoStack.length - 1];
      this.form = JSON.parse(prev);
      this.render();
      this.updateHistoryButtons();
      Utils.showToast('Undo performed', 'info', 1500);
    }
  }

  redo() {
    if (this.redoStack.length > 0) {
      const next = this.redoStack.pop();
      this.undoStack.push(next);
      this.form = JSON.parse(next);
      this.render();
      this.updateHistoryButtons();
      Utils.showToast('Redo performed', 'info', 1500);
    }
  }

  updateHistoryButtons() {
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');
    if (btnUndo) btnUndo.disabled = this.undoStack.length <= 1;
    if (btnRedo) btnRedo.disabled = this.redoStack.length === 0;
  }

  // --- RENDER CONTROLLER ---
  render() {
    this.applyTheme(this.form.theme);
    this.renderHeader();
    this.renderTabs();

    if (this.activeTab === 'questions') {
      this.renderQuestionsTab();
    } else if (this.activeTab === 'settings') {
      this.renderSettingsTab();
    } else if (this.activeTab === 'logic') {
      this.renderLogicTab();
    } else if (this.activeTab === 'theme') {
      this.renderThemeTab();
    }

    this.updateStatsBar();
  }

  applyTheme(themeKey) {
    document.body.className = `theme-${themeKey || 'indigo'}`;
  }

  renderHeader() {
    const titleEl = document.getElementById('builder-form-title');
    if (titleEl && document.activeElement !== titleEl) {
      titleEl.value = this.form.title || 'Untitled Assessment';
    }

    const statusBadge = document.getElementById('builder-status-badge');
    if (statusBadge) {
      statusBadge.textContent = (this.form.status || 'draft').toUpperCase();
      statusBadge.className = `status-badge status-${this.form.status}`;
    }
  }

  renderTabs() {
    document.querySelectorAll('.builder-nav-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === this.activeTab);
    });
  }

  setTab(tabName) {
    this.activeTab = tabName;
    this.render();
  }

  // ----------------------------------------------------
  // QUESTIONS & SECTIONS TAB
  // ----------------------------------------------------
  renderQuestionsTab() {
    const container = document.getElementById('builder-main-content');
    if (!container) return;

    let html = `
      <div class="builder-meta-card">
        <input type="text" class="form-title-input" value="${Utils.escapeHTML(this.form.title)}" 
          placeholder="Form Title" oninput="Builder.updateFormTitle(this.value)" />
        <textarea class="form-desc-input" placeholder="Form Description / Instructions" 
          oninput="Builder.updateFormDesc(this.value)">${Utils.escapeHTML(this.form.description || '')}</textarea>
        
        <!-- Global Quick Actions Bar -->
        ${(this.form.questions || []).length > 1 ? `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:1.25rem; pt:0.75rem; border-top:1px solid var(--border-color); padding-top:0.75rem;">
            <div style="font-size:0.84rem; font-weight:700; color:var(--text-muted);">
              ${(this.form.questions || []).length} Total Questions
            </div>
            <div style="display:flex; gap:0.5rem;">
              <button type="button" class="btn-pill-action" onclick="Builder.collapseAllQuestions()">
                ${icon('collapse', 13)} Collapse All
              </button>
              <button type="button" class="btn-pill-action" onclick="Builder.expandAllQuestions()">
                ${icon('expand', 13)} Expand All
              </button>
            </div>
          </div>
        ` : ''}
      </div>
    `;

    // Render Section by Section
    const sections = this.form.sections || [];
    sections.forEach((sec, secIdx) => {
      const secQuestions = (this.form.questions || []).filter(q => q.sectionId === sec.id);

      html += `
        <div class="section-container" id="sec_container_${sec.id}">
          <div class="section-header-card">
            <div class="section-header-top">
              <span class="section-badge">Section ${secIdx + 1} of ${sections.length}</span>
              <div class="section-actions" style="display:flex; align-items:center; gap:0.5rem;">
                ${secQuestions.length > 1 ? `
                  <button type="button" class="btn-pill-action" onclick="Builder.collapseSectionQuestions('${sec.id}')" title="Collapse questions in this section">
                    ${icon('collapse', 12)} Collapse
                  </button>
                  <button type="button" class="btn-pill-action" onclick="Builder.expandSectionQuestions('${sec.id}')" title="Expand questions in this section">
                    ${icon('expand', 12)} Expand
                  </button>
                ` : ''}
                ${sections.length > 1 ? `
                  <button type="button" class="btn-icon text-danger" title="Delete Section" onclick="Builder.deleteSection('${sec.id}')">✕</button>
                ` : ''}
              </div>
            </div>
            <input type="text" class="section-title-input" value="${Utils.escapeHTML(sec.title)}" 
              placeholder="Section Title" oninput="Builder.updateSectionProp('${sec.id}', 'title', this.value)" />
            <input type="text" class="section-desc-input" value="${Utils.escapeHTML(sec.description || '')}" 
              placeholder="Section Description (Optional)" oninput="Builder.updateSectionProp('${sec.id}', 'description', this.value)" />
          </div>

          <div class="questions-list" id="q_list_${sec.id}">
            ${secQuestions.map((q, idx) => QuestionsEngine.renderBuilderCard(q, idx, secQuestions.length, sections, this.form.mode, this.collapsedQuestions.has(q.id))).join('')}
          </div>

          <div class="section-add-q-bar">
            <button type="button" class="btn btn-outline" onclick="Builder.addQuestion('${sec.id}')">
              + Add Question
            </button>
          </div>
        </div>
      `;
    });

    html += `
      <div class="builder-bottom-controls">
        <button type="button" class="btn btn-secondary" onclick="Builder.addSection()">+ Add New Section</button>
        <button type="button" class="btn btn-primary" onclick="Builder.openImportModal()">📥 Import Questions JSON</button>
      </div>
    `;

    container.innerHTML = html;
  }

  // ----------------------------------------------------
  // SETTINGS TAB
  // ----------------------------------------------------
  renderSettingsTab() {
    const container = document.getElementById('builder-main-content');
    if (!container) return;

    const s = this.form.settings || {};
    container.innerHTML = `
      <div class="settings-page-card">
        <h2 class="settings-heading">Assessment & Form Settings</h2>
        
        <div class="setting-group">
          <label class="setting-title">Primary Assessment Mode</label>
          <div class="radio-cards-group">
            <label class="radio-card ${this.form.mode === 'exam' ? 'active' : ''}">
              <input type="radio" name="form_mode" value="exam" ${this.form.mode === 'exam' ? 'checked' : ''} 
                onchange="Builder.updateFormProp('mode', 'exam')" />
              <strong>Examination Mode</strong>
              <p class="text-muted">Timed, strict scoring, no instant feedback until submitted.</p>
            </label>
            <label class="radio-card ${this.form.mode === 'study' ? 'active' : ''}">
              <input type="radio" name="form_mode" value="study" ${this.form.mode === 'study' ? 'checked' : ''} 
                onchange="Builder.updateFormProp('mode', 'study')" />
              <strong>Quiz & Study Mode</strong>
              <p class="text-muted">Instant feedback & explanations upon answering each question.</p>
            </label>
            <label class="radio-card ${this.form.mode === 'survey' ? 'active' : ''}">
              <input type="radio" name="form_mode" value="survey" ${this.form.mode === 'survey' ? 'checked' : ''} 
                onchange="Builder.updateFormProp('mode', 'survey')" />
              <strong>Survey / Questionnaire</strong>
              <p class="text-muted">Unscored data collection and feedback gathering.</p>
            </label>
          </div>
        </div>

        <div class="setting-group">
          <label class="setting-title">Countdown Timer Configuration</label>
          <div class="toggle-row">
            <label class="toggle-label">
              <input type="checkbox" ${s.enableTimer ? 'checked' : ''} 
                onchange="Builder.updateSetting('enableTimer', this.checked)" />
              <span>Enable Countdown Timer</span>
            </label>
          </div>
          <div class="timer-config-box ${s.enableTimer ? '' : 'disabled-box'}">
            <label>Time Limit (Minutes):</label>
            <input type="number" min="1" max="300" class="form-input form-input-sm" style="width:120px;" 
              value="${this.form.timeLimit || 30}" 
              oninput="Builder.updateFormProp('timeLimit', parseInt(this.value) || 0)" />
            <small class="text-muted">Resilient timestamp timer with 20% warning & 5% critical alerts.</small>
          </div>
        </div>

        <div class="setting-group">
          <label class="setting-title">Randomization & Anti-Cheat</label>
          <div class="grid-2-col">
            <label class="toggle-label">
              <input type="checkbox" ${s.randomizeQuestions ? 'checked' : ''} 
                onchange="Builder.updateSetting('randomizeQuestions', this.checked)" />
              <span>Randomize Question Order per Respondent</span>
            </label>
            <label class="toggle-label">
              <input type="checkbox" ${s.randomizeOptions ? 'checked' : ''} 
                onchange="Builder.updateSetting('randomizeOptions', this.checked)" />
              <span>Randomize Multiple Choice Choices</span>
            </label>
          </div>
        </div>

        ${this.form.mode !== 'survey' ? `
          <div class="setting-group">
            <label class="setting-title">Scoring & Results Disclosure</label>
            <div class="toggle-row" style="margin-bottom:1rem;">
              <label class="toggle-label">
                <input type="checkbox" ${s.showScoreAfterSubmission !== false ? 'checked' : ''} 
                  onchange="Builder.updateSetting('showScoreAfterSubmission', this.checked)" />
                <span><strong>Reveal Scores Immediately Upon Submission</strong></span>
              </label>
              <p class="text-muted" style="font-size:0.8rem; margin:0.25rem 0 0 1.75rem;">
                When unchecked, candidate scores will be hidden after submission. Candidates who did not provide an email will be prompted to enter one so results can be delivered later.
              </p>
            </div>

            <div class="grid-2-col">
              <div>
                <label class="form-label-sm">Passing Score Percentage (%)</label>
                <input type="number" min="0" max="100" class="form-input" value="${this.form.passingScore || 60}" 
                  oninput="Builder.updateFormProp('passingScore', parseFloat(this.value) || 0)" />
              </div>
              <div>
                <label class="form-label-sm">Negative Marking Penalty (Points subtracted per wrong answer)</label>
                <input type="number" min="0" max="10" step="0.25" class="form-input" value="${s.negativeMarking || 0}" 
                  oninput="Builder.updateSetting('negativeMarking', parseFloat(this.value) || 0)" />
              </div>
            </div>
          </div>
        ` : `
          <div class="setting-group" style="background:#f0fdf4; border-color:#86efac; padding:1rem 1.25rem; border-radius:var(--radius-md);">
            <div style="font-weight:700; color:#166534; font-size:0.92rem; display:flex; align-items:center; gap:0.5rem;">
              <span>${icon('check', 18)}</span> Unscored Survey Mode Active
            </div>
            <p style="font-size:0.84rem; color:#15803d; margin-top:0.25rem; margin-bottom:0;">
              In Survey mode, all questions are unscored. Respondents simply submit responses without grades, marks, or passing criteria.
            </p>
          </div>
        `}

        <div class="setting-group">
          <label class="setting-title">Form Status & Access</label>
          <div class="grid-2-col">
            <div>
              <label class="form-label-sm">Publish Status</label>
              <select class="form-select" onchange="Builder.updateFormProp('status', this.value)">
                <option value="draft" ${this.form.status === 'draft' ? 'selected' : ''}>Draft (Editing)</option>
                <option value="published" ${this.form.status === 'published' ? 'selected' : ''}>Published (Accepting Responses)</option>
                <option value="closed" ${this.form.status === 'closed' ? 'selected' : ''}>Closed (No longer accepting responses)</option>
              </select>
            </div>
            <div>
              <label class="form-label-sm">Max Responses Limit (Optional)</label>
              <input type="number" min="0" class="form-input" value="${s.maxResponses || ''}" placeholder="Unlimited" 
                oninput="Builder.updateSetting('maxResponses', parseInt(this.value) || null)" />
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ----------------------------------------------------
  // CONDITIONAL LOGIC TAB
  // ----------------------------------------------------
  renderLogicTab() {
    const container = document.getElementById('builder-main-content');
    if (!container) return;

    const logicRules = this.form.conditionalLogic || [];
    const questions = this.form.questions || [];
    const sections = this.form.sections || [];

    let rulesHTML = logicRules.map((rule, idx) => {
      return `
        <div class="logic-rule-card">
          <div class="logic-rule-header">
            <strong>Rule #${idx + 1}</strong>
            <button type="button" class="btn-icon text-danger" onclick="Builder.removeLogicRule(${idx})">✕</button>
          </div>
          <div class="logic-rule-body">
            <span>IF</span>
            <select class="form-select inline-select" onchange="Builder.updateLogicRule(${idx}, 'questionId', this.value)">
              ${questions.map((q, qIdx) => `<option value="${q.id}" ${q.id === rule.questionId ? 'selected' : ''}>Q${qIdx + 1}: ${Utils.escapeHTML(q.question.substring(0, 30))}</option>`).join('')}
            </select>
            <select class="form-select inline-select" onchange="Builder.updateLogicRule(${idx}, 'operator', this.value)">
              <option value="equals" ${rule.operator === 'equals' ? 'selected' : ''}>equals</option>
              <option value="not_equals" ${rule.operator === 'not_equals' ? 'selected' : ''}>does not equal</option>
              <option value="contains" ${rule.operator === 'contains' ? 'selected' : ''}>contains</option>
              <option value="greater_than" ${rule.operator === 'greater_than' ? 'selected' : ''}>is greater than</option>
              <option value="less_than" ${rule.operator === 'less_than' ? 'selected' : ''}>is less than</option>
            </select>
            <input type="text" class="form-input inline-input" value="${Utils.escapeHTML(rule.value || '')}" 
              placeholder="Value..." oninput="Builder.updateLogicRule(${idx}, 'value', this.value)" />
            <span>THEN JUMP TO</span>
            <select class="form-select inline-select" onchange="Builder.updateLogicRule(${idx}, 'targetSectionId', this.value)">
              ${sections.map((s, sIdx) => `<option value="${s.id}" ${s.id === rule.targetSectionId ? 'selected' : ''}>Section ${sIdx + 1}: ${Utils.escapeHTML(s.title)}</option>`).join('')}
              <option value="SUBMIT" ${rule.targetSectionId === 'SUBMIT' ? 'selected' : ''}>[Submit Form Immediately]</option>
            </select>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="settings-page-card">
        <div class="card-header-flex">
          <div>
            <h2 class="settings-heading">Conditional Logic & Branching</h2>
            <p class="text-muted">Control navigation paths dynamically based on respondents' choices.</p>
          </div>
          <button type="button" class="btn btn-primary" onclick="Builder.addLogicRule()">+ Add Rule</button>
        </div>

        <div class="logic-rules-list">
          ${rulesHTML || '<div class="empty-state-box">No branching rules defined yet. Click "+ Add Rule" above to create one.</div>'}
        </div>
      </div>
    `;
  }

  // ----------------------------------------------------
  // THEMES TAB
  // ----------------------------------------------------
  renderThemeTab() {
    const container = document.getElementById('builder-main-content');
    if (!container) return;

    const themes = [
      { id: 'indigo', name: 'Google Indigo', color: '#4f46e5', bg: '#f8fafc' },
      { id: 'slate', name: 'Academic Slate', color: '#334155', bg: '#f1f5f9' },
      { id: 'emerald', name: 'Emerald Forest', color: '#059669', bg: '#ecfdf5' },
      { id: 'rose', name: 'Rose Blossom', color: '#e11d48', bg: '#fff1f2' },
      { id: 'amber', name: 'Warm Amber', color: '#d97706', bg: '#fffbeb' },
      { id: 'purple', name: 'Royal Purple', color: '#7c3aed', bg: '#faf5ff' },
      { id: 'dark', name: 'Night Owl Dark', color: '#6366f1', bg: '#0f172a' },
      { id: 'high-contrast', name: 'High Contrast (A11y)', color: '#000000', bg: '#ffffff' }
    ];

    container.innerHTML = `
      <div class="settings-page-card">
        <h2 class="settings-heading">Design Theme & Styling</h2>
        <p class="text-muted">Customize the visual presentation for your respondents.</p>
        
        <div class="theme-palette-grid">
          ${themes.map(t => `
            <div class="theme-card ${this.form.theme === t.id ? 'active' : ''}" onclick="Builder.setTheme('${t.id}')">
              <div class="theme-swatch" style="background: ${t.color};"></div>
              <div class="theme-card-info">
                <strong>${t.name}</strong>
                <small>${t.id}</small>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  setTheme(themeId) {
    this.form.theme = themeId;
    this.applyTheme(themeId);
    this.saveHistoryState();
    this.renderThemeTab();
    Utils.showToast(`Theme updated to ${themeId}`, 'success', 1500);
  }

  // --- ACTIONS & MUTATORS ---
  updateFormTitle(title) {
    this.form.title = title;
    this.isDirty = true;
    document.title = `${title} | FormForge`;
  }

  updateFormDesc(desc) {
    this.form.description = desc;
    this.isDirty = true;
  }

  updateFormProp(prop, val) {
    this.form[prop] = val;
    this.saveHistoryState();
    this.render();
  }

  updateSetting(prop, val) {
    this.form.settings[prop] = val;
    this.saveHistoryState();
    this.render();
  }

  // Question mutators
  addQuestion(sectionId, type = QuestionTypes.MULTIPLE_CHOICE) {
    const q = QuestionsEngine.createDefault(type, sectionId);
    this.form.questions.push(q);
    this.saveHistoryState();
    this.renderQuestionsTab();
    
    // Scroll new question into view
    setTimeout(() => {
      const el = document.getElementById(`q_card_${q.id}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  }

  duplicateQuestion(qid) {
    const idx = this.form.questions.findIndex(q => q.id === qid);
    if (idx !== -1) {
      const clone = Utils.clone(this.form.questions[idx]);
      clone.id = Utils.uid('q');
      clone.question = `${clone.question} (Copy)`;
      this.form.questions.splice(idx + 1, 0, clone);
      this.saveHistoryState();
      this.renderQuestionsTab();
      Utils.showToast('Question duplicated', 'info', 1500);
    }
  }

  deleteQuestion(qid) {
    this.form.questions = this.form.questions.filter(q => q.id !== qid);
    this.saveHistoryState();
    this.renderQuestionsTab();
    Utils.showToast('Question deleted', 'info', 1500);
  }

  changeQuestionType(qid, newType) {
    const q = this.form.questions.find(item => item.id === qid);
    if (q) {
      q.type = newType;
      // Reset options / fields appropriately
      if ([QuestionTypes.MULTIPLE_CHOICE, QuestionTypes.CHECKBOXES, QuestionTypes.DROPDOWN, QuestionTypes.MULTIPLE_DROPDOWN].includes(newType)) {
        if (!q.options || q.options.length === 0) q.options = ['Option 1', 'Option 2', 'Option 3'];
      }
      this.saveHistoryState();
      this.renderQuestionsTab();
    }
  }

  updateQuestionProp(qid, prop, val) {
    const q = this.form.questions.find(item => item.id === qid);
    if (q) {
      q[prop] = val;
      this.isDirty = true;
    }
  }

  // Options mutators
  addOption(qid) {
    const q = this.form.questions.find(item => item.id === qid);
    if (q && q.options) {
      q.options.push(`Option ${q.options.length + 1}`);
      this.saveHistoryState();
      this.renderQuestionsTab();
    }
  }

  updateOption(qid, optIdx, val) {
    const q = this.form.questions.find(item => item.id === qid);
    if (q && q.options) {
      q.options[optIdx] = val;
      this.isDirty = true;
    }
  }

  removeOption(qid, optIdx) {
    const q = this.form.questions.find(item => item.id === qid);
    if (q && q.options && q.options.length > 1) {
      q.options.splice(optIdx, 1);
      this.saveHistoryState();
      this.renderQuestionsTab();
    }
  }

  setCorrectAnswer(qid, optIdx, isChecked, isMulti) {
    const q = this.form.questions.find(item => item.id === qid);
    if (!q) return;

    const optVal = q.options[optIdx];
    if (isMulti) {
      if (!Array.isArray(q.answer)) q.answer = [];
      if (isChecked) {
        if (!q.answer.includes(optVal)) q.answer.push(optVal);
      } else {
        q.answer = q.answer.filter(a => a !== optVal);
      }
    } else {
      q.answer = isChecked ? optVal : '';
    }
    this.saveHistoryState();
  }

  // Matrix mutators
  addMatrixRow(qid) {
    const q = this.form.questions.find(item => item.id === qid);
    if (q) {
      if (!q.matrixRows) q.matrixRows = [];
      q.matrixRows.push(`Row ${q.matrixRows.length + 1}`);
      this.saveHistoryState();
      this.renderQuestionsTab();
    }
  }

  updateMatrixRow(qid, idx, val) {
    const q = this.form.questions.find(item => item.id === qid);
    if (q && q.matrixRows) {
      q.matrixRows[idx] = val;
      this.isDirty = true;
    }
  }

  removeMatrixRow(qid, idx) {
    const q = this.form.questions.find(item => item.id === qid);
    if (q && q.matrixRows && q.matrixRows.length > 1) {
      q.matrixRows.splice(idx, 1);
      this.saveHistoryState();
      this.renderQuestionsTab();
    }
  }

  addMatrixCol(qid) {
    const q = this.form.questions.find(item => item.id === qid);
    if (q) {
      if (!q.matrixColumns) q.matrixColumns = [];
      q.matrixColumns.push(`Column ${q.matrixColumns.length + 1}`);
      this.saveHistoryState();
      this.renderQuestionsTab();
    }
  }

  updateMatrixCol(qid, idx, val) {
    const q = this.form.questions.find(item => item.id === qid);
    if (q && q.matrixColumns) {
      q.matrixColumns[idx] = val;
      this.isDirty = true;
    }
  }

  removeMatrixCol(qid, idx) {
    const q = this.form.questions.find(item => item.id === qid);
    if (q && q.matrixColumns && q.matrixColumns.length > 1) {
      q.matrixColumns.splice(idx, 1);
      this.saveHistoryState();
      this.renderQuestionsTab();
    }
  }

  // Section mutators
  addSection() {
    const newSec = {
      id: Utils.uid('sec'),
      title: `Section ${this.form.sections.length + 1}`,
      description: ''
    };
    this.form.sections.push(newSec);
    this.saveHistoryState();
    this.renderQuestionsTab();
    Utils.showToast('New section added', 'info', 1500);
  }

  updateSectionProp(secId, prop, val) {
    const s = this.form.sections.find(item => item.id === secId);
    if (s) {
      s[prop] = val;
      this.isDirty = true;
    }
  }

  deleteSection(secId) {
    if (this.form.sections.length <= 1) {
      Utils.showToast('Form must contain at least one section', 'warning');
      return;
    }
    const fallbackSecId = this.form.sections.find(s => s.id !== secId).id;
    // Reassign questions
    this.form.questions.forEach(q => {
      if (q.sectionId === secId) q.sectionId = fallbackSecId;
    });
    this.form.sections = this.form.sections.filter(s => s.id !== secId);
    this.saveHistoryState();
    this.renderQuestionsTab();
    Utils.showToast('Section removed', 'info', 1500);
  }

  moveQuestionToSection(qid, newSectionId) {
    const q = this.form.questions.find(item => item.id === qid);
    if (q) {
      q.sectionId = newSectionId;
      this.saveHistoryState();
      this.renderQuestionsTab();
    }
  }

  // --- DRAG AND DROP ---
  handleDragStart(e, qid) {
    this.draggedQId = qid;
    e.dataTransfer.setData('text/plain', qid);
    e.currentTarget.classList.add('is-dragging');
  }

  handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  handleDrop(e, targetQId) {
    e.preventDefault();
    document.querySelectorAll('.is-dragging').forEach(el => el.classList.remove('is-dragging'));

    if (!this.draggedQId || this.draggedQId === targetQId) return;

    const fromIdx = this.form.questions.findIndex(q => q.id === this.draggedQId);
    const toIdx = this.form.questions.findIndex(q => q.id === targetQId);

    if (fromIdx !== -1 && toIdx !== -1) {
      const [moved] = this.form.questions.splice(fromIdx, 1);
      // Align section if dropped into different section
      moved.sectionId = this.form.questions[toIdx]?.sectionId || moved.sectionId;
      this.form.questions.splice(toIdx, 0, moved);
      this.saveHistoryState();
      this.renderQuestionsTab();
      Utils.showToast('Question order updated', 'info', 1000);
    }
    this.draggedQId = null;
  }

  // --- CONDITIONAL LOGIC MUTATORS ---
  addLogicRule() {
    if (!this.form.conditionalLogic) this.form.conditionalLogic = [];
    const firstQ = this.form.questions[0]?.id || '';
    const firstSec = this.form.sections[0]?.id || '';
    this.form.conditionalLogic.push({
      questionId: firstQ,
      operator: 'equals',
      value: '',
      targetSectionId: firstSec
    });
    this.saveHistoryState();
    this.renderLogicTab();
  }

  updateLogicRule(idx, prop, val) {
    if (this.form.conditionalLogic && this.form.conditionalLogic[idx]) {
      this.form.conditionalLogic[idx][prop] = val;
      this.isDirty = true;
    }
  }

  removeLogicRule(idx) {
    if (this.form.conditionalLogic) {
      this.form.conditionalLogic.splice(idx, 1);
      this.saveHistoryState();
      this.renderLogicTab();
    }
  }

  // --- SAVE & PERSISTENCE ---
  async saveForm(showToastNotification = true) {
    try {
      this.form.version = (this.form.version || 1) + 1;
      await DB.saveForm(this.form);
      this.isDirty = false;
      this.renderHeader();
      if (showToastNotification) {
        Utils.showToast('Form saved successfully!', 'success');
      }
    } catch (err) {
      console.error('Save failed', err);
      Utils.showToast(`Error saving form: ${err.message}`, 'error');
    }
  }

  async publishForm() {
    this.form.status = 'published';
    await this.saveForm(false);
    Utils.showToast('Form published and ready for responses!', 'success');
    this.render();
  }

  // Preview form in new tab or popup
  previewForm() {
    const previewUrl = `responder.html?id=${this.form.id}&preview=true`;
    window.open(previewUrl, '_blank');
  }

  // Share form modal hub
  openShareModal() {
    Utils.openShareHubModal(this.form);
  }

  // --- IMPORT MODAL ---
  openImportModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.id = 'import-modal';
    modal.innerHTML = `
      <div class="modal-card modal-lg">
        <div class="modal-header">
          <h3 class="modal-title">Import Questions from JSON</h3>
          <button class="btn-icon" onclick="this.closest('.modal-backdrop').remove()">✕</button>
        </div>
        <div class="modal-body">
          <div class="import-dropzone" id="import-dropzone">
            <div class="dropzone-icon">📁</div>
            <p><strong>Drag & Drop your JSON file here</strong> or <label class="text-link"><input type="file" id="import-file-input" accept=".json" style="display:none;" />browse</label></p>
            <small class="text-muted">Supports questions array or complete FormForge export JSON</small>
          </div>

          <div class="import-paste-area">
            <label class="form-label-sm">Or Paste JSON Content directly:</label>
            <textarea class="form-textarea" id="import-json-textarea" rows="7" placeholder="Paste JSON here..."></textarea>
          </div>

          <div class="import-quick-samples">
            <span>Quick Samples:</span>
            <button type="button" class="btn btn-sm btn-ghost" onclick="Builder.loadSampleBulk(50)">Generate 50 Questions</button>
            <button type="button" class="btn btn-sm btn-ghost" onclick="Builder.loadSampleBulk(100)">Generate 100 Questions</button>
            <button type="button" class="btn btn-sm btn-ghost" onclick="Builder.loadSampleBulk(200)">Generate 200 Questions</button>
          </div>

          <div id="import-validation-results" style="margin-top: 1rem;"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="this.closest('.modal-backdrop').remove()">Cancel</button>
          <button class="btn btn-primary" id="btn-execute-import" onclick="Builder.executeImport()">Import Questions</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Setup dropzone listeners
    const dropzone = modal.querySelector('#import-dropzone');
    const fileInput = modal.querySelector('#import-file-input');
    const textarea = modal.querySelector('#import-json-textarea');

    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (re) => {
          textarea.value = re.target.result;
          this.previewValidation(re.target.result);
        };
        reader.readAsText(file);
      }
    };

    dropzone.ondragover = (e) => { e.preventDefault(); dropzone.classList.add('dropzone-active'); };
    dropzone.ondragleave = () => dropzone.classList.remove('dropzone-active');
    dropzone.ondrop = (e) => {
      e.preventDefault();
      dropzone.classList.remove('dropzone-active');
      const file = e.dataTransfer.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (re) => {
          textarea.value = re.target.result;
          this.previewValidation(re.target.result);
        };
        reader.readAsText(file);
      }
    };

    textarea.oninput = () => {
      this.previewValidation(textarea.value);
    };
    textarea.onchange = () => {
      this.previewValidation(textarea.value);
    };
    textarea.onpaste = () => {
      setTimeout(() => this.previewValidation(textarea.value), 50);
    };
  }

  loadSampleBulk(count) {
    const data = Importer.generateBulkSample(count);
    const textarea = document.getElementById('import-json-textarea');
    if (textarea) {
      textarea.value = JSON.stringify(data, null, 2);
      this.previewValidation(textarea.value);
    }
  }

  previewValidation(jsonText) {
    const resBox = document.getElementById('import-validation-results');
    if (!resBox) return;

    if (!jsonText.trim()) {
      resBox.innerHTML = '';
      return;
    }

    const validation = Importer.validateJSON(jsonText);
    if (!validation.isValid) {
      resBox.innerHTML = `
        <div class="alert-box alert-danger">
          <strong>⚠ Validation Failed:</strong>
          <ul>
            ${validation.errors.map(err => `<li>${Utils.escapeHTML(err)}</li>`).join('')}
          </ul>
        </div>
      `;
    } else {
      resBox.innerHTML = `
        <div class="alert-box alert-success">
          <strong>✓ Valid Form JSON:</strong> Ready to import ${validation.data.questions.length} questions.
          ${validation.warnings.length > 0 ? `
            <div class="alert-warnings">
              <small><strong>Warnings:</strong></small>
              <ul>${validation.warnings.map(w => `<li>${Utils.escapeHTML(w)}</li>`).join('')}</ul>
            </div>
          ` : ''}
        </div>
      `;
    }
  }

  async executeImport() {
    const textarea = document.getElementById('import-json-textarea');
    if (!textarea || !textarea.value.trim()) {
      Utils.showToast('Please paste or upload a JSON file first', 'warning');
      return;
    }

    const validation = Importer.validateJSON(textarea.value);
    if (!validation.isValid) {
      Utils.showToast('Please fix JSON validation errors before importing', 'error');
      return;
    }

    const imported = validation.data;
    if (imported.questions && imported.questions.length > 0) {
      if (this.form && this.form.id) {
        // Builder View Context (Append questions)
        this.form.questions = this.form.questions.concat(imported.questions);
        if (imported.title && this.form.title === 'Untitled Assessment') {
          this.form.title = imported.title;
        }
        if (imported.description && !this.form.description) {
          this.form.description = imported.description;
        }
        if (imported.timeLimit) this.form.timeLimit = imported.timeLimit;
        if (imported.passingScore) this.form.passingScore = imported.passingScore;

        this.saveHistoryState();
        this.render();

        const modal = document.getElementById('import-modal');
        if (modal) modal.remove();

        Utils.showToast(`Successfully imported ${imported.questions.length} questions!`, 'success');
      } else {
        // Dashboard Context (Create new Form and open Builder)
        const newForm = {
          id: Utils.uid('form'),
          title: imported.title || 'Imported Assessment',
          description: imported.description || '',
          status: 'draft',
          mode: imported.mode || 'exam',
          theme: imported.theme || 'indigo',
          timeLimit: imported.timeLimit !== undefined ? imported.timeLimit : 30,
          passingScore: imported.passingScore !== undefined ? imported.passingScore : 70,
          version: 1,
          createdAt: new Date().toISOString(),
          sections: imported.sections && imported.sections.length ? imported.sections : [{ id: 'sec-1', title: 'Main Section', description: '' }],
          questions: imported.questions,
          settings: imported.settings || {
            enableTimer: true,
            randomizeQuestions: false,
            randomizeOptions: true,
            negativeMarking: 0,
            showStudyFeedback: false
          }
        };

        await DB.saveForm(newForm);

        const modal = document.getElementById('import-modal');
        if (modal) modal.remove();

        Utils.showToast(`Imported "${newForm.title}" with ${newForm.questions.length} questions! Redirecting...`, 'success', 2000);

        setTimeout(() => {
          window.location.href = `builder.html?id=${newForm.id}`;
        }, 300);
      }
    }
  }

  // --- STATS BAR ---
  updateStatsBar() {
    const countEl = document.getElementById('stats-q-count');
    const pointsEl = document.getElementById('stats-points-total');
    const timeEl = document.getElementById('stats-time-total');

    const totalQuestions = this.form.questions?.length || 0;
    const isSurvey = this.form.mode === 'survey';
    const totalPoints = isSurvey ? 0 : (this.form.questions || []).reduce((acc, q) => acc + (parseFloat(q.points) || 0), 0);

    if (countEl) countEl.textContent = `${totalQuestions} Questions`;
    if (pointsEl) {
      if (isSurvey) {
        pointsEl.textContent = 'Unscored Survey';
        pointsEl.style.color = '#10b981';
      } else {
        pointsEl.textContent = `${totalPoints} Total Points`;
        pointsEl.style.color = '';
      }
    }
    if (timeEl) timeEl.textContent = this.form.timeLimit ? `${this.form.timeLimit} Mins` : 'Untimed';
  }

  // --- KEYBOARD SHORTCUTS ---
  bindEvents() {
    window.addEventListener('keydown', (e) => {
      // Ctrl+S / Cmd+S -> Save
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        this.saveForm(true);
      }
      // Ctrl+Z / Cmd+Z -> Undo
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.undo();
      }
      // Ctrl+Y or Ctrl+Shift+Z -> Redo
      else if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') || ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')) {
        e.preventDefault();
        this.redo();
      }
      // Ctrl+P / Cmd+P -> Preview
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        this.previewForm();
      }
      // Ctrl+Enter -> Publish
      else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        this.publishForm();
      }
    });
  }
}

// Global Builder Instance
window.Builder = new FormBuilder();
