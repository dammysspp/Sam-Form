/**
 * FormForge Responder & Assessment Runner
 */

class FormResponder {
  constructor() {
    this.form = null;
    this.answers = {};
    this.flags = new Set();
    this.studyFeedback = {};
    this.currentSectionIndex = 0;
    this.timer = null;
    this.startTime = null;
    this.isPreview = false;
    this.isSubmitted = false;
    this.respondentName = '';
    this.respondentEmail = '';
    this.respondentPhone = '';
    this.respondentTelegram = '';
    this.orderedQuestions = [];
  }

  async init() {
    const urlParams = new URLSearchParams(window.location.search);
    let formId = urlParams.get('id');
    this.isPreview = urlParams.get('preview') === 'true';

    // If id=demo or no id is specified, generate/load a rich sample assessment
    if (formId === 'demo' || !formId) {
      let existingDemo = await DB.getFormById('demo');
      if (!existingDemo) {
        existingDemo = {
          id: 'demo',
          title: 'SamForm General Knowledge & Diagnostic Assessment',
          description: 'A comprehensive demonstration assessment testing multiple question types, automatic timers, and instant evaluation.',
          mode: 'exam',
          theme: 'indigo',
          status: 'published',
          timeLimit: 15,
          passingScore: 70,
          settings: {
            enableTimer: true,
            showScoreAfterSubmission: true,
            randomizeQuestions: false,
            randomizeOptions: false,
            negativeMarking: 0
          },
          sections: [{ id: 'sec-1', title: 'General Assessment' }],
          questions: [
            {
              id: 'q_demo_1',
              sectionId: 'sec-1',
              type: QuestionTypes.MULTIPLE_CHOICE,
              question: 'Which protocol is standard for secure web transmission?',
              options: ['HTTP', 'HTTPS', 'FTP', 'Telnet'],
              answer: 'HTTPS',
              points: 5,
              explanation: 'HTTPS encrypts data in transit using TLS/SSL.'
            },
            {
              id: 'q_demo_2',
              sectionId: 'sec-1',
              type: QuestionTypes.CHECKBOXES,
              question: 'Select all cloud and storage technologies utilized by SamForm:',
              options: ['IndexedDB (Offline Storage)', 'Supabase Cloud Database', 'Cassandra DB', 'Service Worker PWA Cache'],
              answer: ['IndexedDB (Offline Storage)', 'Supabase Cloud Database', 'Service Worker PWA Cache'],
              points: 10,
              explanation: 'SamForm operates offline-first with IndexedDB and syncs to Supabase Cloud.'
            },
            {
              id: 'q_demo_3',
              sectionId: 'sec-1',
              type: QuestionTypes.TRUE_FALSE,
              question: 'Candidates require administrative credentials to access and submit an assessment.',
              answer: 'False',
              points: 5,
              explanation: 'Public assessment links (responder.html) are open to candidates without sign-in.'
            },
            {
              id: 'q_demo_4',
              sectionId: 'sec-1',
              type: QuestionTypes.SHORT_ANSWER,
              question: 'What is the full name of the organization that created SamForm?',
              answer: 'Samsco Communications',
              points: 10,
              explanation: 'SamForm is engineered with excellence by Samsco Communications.'
            },
            {
              id: 'q_demo_5',
              sectionId: 'sec-1',
              type: QuestionTypes.ESSAY,
              question: 'Explain the benefits of offline-first assessment software for remote educational institutions.',
              points: 15,
              explanation: 'Essays are reviewed manually by instructors in the SamForm review console.'
            }
          ]
        };
        await DB.saveForm(existingDemo);
      }
      this.form = existingDemo;
    } else {
      this.form = await DB.getFormById(formId);
    }

    if (!this.form) {
      // Fallback: check if any forms exist in DB
      const all = await DB.getAllForms();
      if (all.length > 0) {
        this.form = all[0];
      } else {
        this.renderError('Assessment or form could not be found in storage. Please launch an assessment from the dashboard or Builder.');
        return;
      }
    }

    // Check status if closed or max responses reached
    if (!this.isPreview) {
      if (this.form.status === 'closed') {
        this.renderClosed('This form is closed and no longer accepting responses.');
        return;
      }

      if (this.form.settings?.maxResponses) {
        const existing = await DB.getResponsesByFormId(this.form.id);
        if (existing.length >= this.form.settings.maxResponses) {
          this.renderClosed('This assessment has reached its maximum allowed number of responses.');
          return;
        }
      }
    }

    // Setup Theme
    document.body.className = `theme-${this.form.theme || 'indigo'} responder-mode`;
    document.title = `${this.form.title} | Assessment`;

    // Process Randomization
    this.setupQuestionsOrder();

    // Check for Draft resumption
    const draft = await DB.getDraft(this.form.id);
    if (draft && draft.data && !this.isPreview) {
      this.promptResumeDraft(draft.data);
    } else {
      // Show clean "About this Quiz / Exam" landing page before starting
      this.renderIntroScreen();
    }
  }

  // --- WELCOME / ABOUT THIS ASSESSMENT SCREEN ---
  renderIntroScreen() {
    const root = document.getElementById('responder-app');
    if (!root) return;

    const qCount = this.orderedQuestions.length;
    const totalPoints = this.orderedQuestions.reduce((sum, q) => sum + (parseFloat(q.points) || 1), 0);
    const timeLimitText = this.form.timeLimit > 0 ? `${this.form.timeLimit} Minutes` : 'Untimed';
    const passScore = this.form.passingScore || 50;
    const mode = (this.form.mode || 'exam').toUpperCase();

    root.innerHTML = `
      ${this.isPreview ? `<div class="preview-mode-banner">${icon('eye', 14)} PREVIEW MODE — Submissions will not affect real response statistics</div>` : ''}

      <div class="assessment-intro-container">
        <div class="assessment-intro-card">
          <!-- Hero Header -->
          <div class="intro-hero-banner">
            <div class="intro-badge-row">
              <span class="badge badge-outline" style="color:#fff; border-color:rgba(255,255,255,0.4);">${mode}</span>
              ${this.form.timeLimit > 0 ? `<span class="badge badge-outline" style="color:#fff; border-color:rgba(255,255,255,0.4);">${icon('clock', 13)} ${timeLimitText}</span>` : ''}
            </div>
            <h1 class="intro-hero-title">${Utils.escapeHTML(this.form.title)}</h1>
            ${this.form.description ? `<p class="intro-hero-desc">${Utils.escapeHTML(this.form.description)}</p>` : ''}
          </div>

          <!-- Body Specs & Guidelines -->
          <div class="intro-body">
            <div class="intro-spec-grid">
              <div class="intro-spec-item">
                <span class="spec-icon" style="color:var(--primary);">${icon('helpCircle', 26)}</span>
                <div class="spec-val">${qCount}</div>
                <div class="spec-label">Questions</div>
              </div>
              <div class="intro-spec-item">
                <span class="spec-icon" style="color:#059669;">${icon('target', 26)}</span>
                <div class="spec-val">${totalPoints} pts</div>
                <div class="spec-label">Total Marks</div>
              </div>
              <div class="intro-spec-item">
                <span class="spec-icon" style="color:#d97706;">${icon('award', 26)}</span>
                <div class="spec-val">${passScore}%</div>
                <div class="spec-label">Pass Mark</div>
              </div>
            </div>

            <div class="intro-instructions-box">
              <strong>${icon('fileText', 15)} Assessment Instructions & Guidelines:</strong>
              <ul>
                ${this.form.timeLimit > 0 ? `<li>You have <strong>${this.form.timeLimit} minutes</strong> once you click Begin. The timer runs continuously in the top bar.</li>` : '<li>This assessment is untimed. Complete all questions at your own pace.</li>'}
                <li>Your progress is auto-saved locally as you answer.</li>
                <li>Make sure you review your answers before submitting.</li>
              </ul>
            </div>

            <!-- Candidate Details Form -->
            <div class="intro-candidate-form">
              <h3 class="intro-candidate-title"><span style="vertical-align:-2px;">${icon('user', 18)}</span> Candidate Information & Result Delivery</h3>
              <div class="grid-2-col">
                <div>
                  <label class="form-label-sm">Full Name <span class="required-star">*</span></label>
                  <input type="text" id="intro_resp_name" class="form-input" 
                    placeholder="e.g. John Doe" value="${Utils.escapeHTML(this.respondentName)}" />
                </div>
                <div>
                  <label class="form-label-sm">Email Address</label>
                  <input type="email" id="intro_resp_email" class="form-input" 
                    placeholder="candidate@example.com" value="${Utils.escapeHTML(this.respondentEmail)}" />
                </div>
              </div>

              <div class="grid-2-col" style="margin-top: 0.75rem;">
                <div>
                  <label class="form-label-sm">WhatsApp Phone Number (with Country Code)</label>
                  <input type="tel" id="intro_resp_phone" class="form-input" 
                    placeholder="e.g. +2348012345678" value="${Utils.escapeHTML(this.respondentPhone || '')}" />
                </div>
                <div>
                  <label class="form-label-sm">Telegram Username (or Phone)</label>
                  <input type="text" id="intro_resp_telegram" class="form-input" 
                    placeholder="e.g. @john_doe or +234..." value="${Utils.escapeHTML(this.respondentTelegram || '')}" />
                </div>
              </div>

              <div style="margin-top: 0.75rem;">
                <label class="form-label-sm">Student / Candidate ID (Optional)</label>
                <input type="text" id="intro_resp_id" class="form-input" 
                  placeholder="e.g. CAND-2026-99" value="${Utils.escapeHTML(this.respondentId || '')}" />
              </div>

              <button type="button" class="btn btn-primary btn-begin-assessment" onclick="Responder.handleBeginClick()">
                <span style="vertical-align:-1px;">${icon('play', 14)}</span> Begin Assessment
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  handleBeginClick() {
    const nameInput = document.getElementById('intro_resp_name');
    const emailInput = document.getElementById('intro_resp_email');
    const phoneInput = document.getElementById('intro_resp_phone');
    const telegramInput = document.getElementById('intro_resp_telegram');
    const idInput = document.getElementById('intro_resp_id');

    const name = nameInput ? nameInput.value.trim() : '';
    if (!name) {
      Utils.showToast('Please enter your full name to begin', 'warning');
      if (nameInput) nameInput.focus();
      return;
    }

    this.respondentName = name;
    this.respondentEmail = emailInput ? emailInput.value.trim() : '';
    this.respondentPhone = phoneInput ? phoneInput.value.trim() : '';
    this.respondentTelegram = telegramInput ? telegramInput.value.trim().replace(/^@/, '') : '';
    this.respondentId = idInput ? idInput.value.trim() : '';

    this.startAssessment();
  }

  setupQuestionsOrder() {
    let qList = Utils.clone(this.form.questions || []);
    const settings = this.form.settings || {};

    if (settings.randomizeQuestions) {
      qList = Utils.shuffleArray(qList);
    }

    if (settings.randomizeOptions) {
      qList.forEach(q => {
        if ([QuestionTypes.MULTIPLE_CHOICE, QuestionTypes.CHECKBOXES, QuestionTypes.DROPDOWN, QuestionTypes.MULTIPLE_DROPDOWN].includes(q.type) && q.options) {
          q.options = Utils.shuffleArray(q.options);
        }
      });
    }

    this.orderedQuestions = qList;
  }

  promptResumeDraft(draftData) {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">
          <h3 class="modal-title">Resume Previous Attempt?</h3>
        </div>
        <div class="modal-body">
          <p>We found an auto-saved draft from your previous session (<strong>${Utils.formatDate(draftData.timestamp)}</strong>).</p>
          <p>Would you like to resume where you left off?</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="btn-draft-restart">Start Again</button>
          <button class="btn btn-primary" id="btn-draft-resume">Resume Attempt</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('#btn-draft-resume').onclick = () => {
      this.answers = draftData.answers || {};
      this.flags = new Set(draftData.flags || []);
      this.currentSectionIndex = draftData.currentSectionIndex || 0;
      this.respondentName = draftData.respondentName || '';
      this.respondentEmail = draftData.respondentEmail || '';
      this.respondentId = draftData.respondentId || '';
      this.startTime = draftData.startTime || Date.now();
      modal.remove();
      this.startAssessment(this.startTime);
    };

    modal.querySelector('#btn-draft-restart').onclick = async () => {
      await DB.clearDraft(this.form.id);
      modal.remove();
      this.renderIntroScreen();
    };
  }

  startAssessment(existingStartTime = null) {
    this.startTime = existingStartTime || Date.now();

    // Start timer if configured
    if (this.form.settings?.enableTimer && this.form.timeLimit > 0) {
      this.timer = new AssessmentTimer({
        durationMinutes: this.form.timeLimit,
        onTick: (data) => this.handleTimerTick(data),
        onExpire: () => this.handleTimerExpire(),
        onStateChange: (state) => this.handleTimerStateChange(state)
      });
      this.timer.start(existingStartTime);
    }

    this.render();

    // Periodic draft autosave every 4 seconds
    setInterval(() => {
      if (!this.isSubmitted && !this.isPreview) {
        this.saveDraft();
      }
    }, 4000);
  }

  // --- TIMER HANDLERS ---
  handleTimerTick(data) {
    const timerDisplay = document.getElementById('timer-display');
    const timerBar = document.getElementById('timer-progress-fill');
    
    if (timerDisplay) {
      timerDisplay.innerHTML = `<span style="vertical-align:-2px;">${icon('clock', 14)}</span> ${data.formatted}`;
    }
    if (timerBar) {
      timerBar.style.width = `${data.percent}%`;
    }
  }

  handleTimerStateChange(state) {
    const pill = document.getElementById('timer-pill');
    if (pill) {
      pill.className = `timer-pill timer-${state}`;
      if (state === 'warning') {
        Utils.showToast('Time Warning: 20% remaining!', 'warning');
      } else if (state === 'critical') {
        Utils.showToast('Critical: 5% remaining! Complete your answers.', 'error');
      }
    }
  }

  handleTimerExpire() {
    Utils.showToast('Time expired! Automatically submitting assessment...', 'error', 4000);
    setTimeout(() => {
      this.submitAssessment(true);
    }, 1500);
  }

  // --- DRAFT AUTOSAVE ---
  async saveDraft() {
    const draftData = {
      answers: this.answers,
      flags: Array.from(this.flags),
      currentSectionIndex: this.currentSectionIndex,
      respondentName: this.respondentName,
      respondentEmail: this.respondentEmail,
      respondentPhone: this.respondentPhone,
      respondentTelegram: this.respondentTelegram,
      respondentId: this.respondentId,
      startTime: this.startTime,
      timestamp: new Date().toISOString()
    };
    await DB.saveDraft(this.form.id, draftData);
  }

  // --- RENDER CONTROLLER ---
  render() {
    const root = document.getElementById('responder-app');
    if (!root) return;

    const sections = this.form.sections || [{ id: 'sec-1', title: 'Questions' }];
    const currentSec = sections[this.currentSectionIndex] || sections[0];
    const secQuestions = this.orderedQuestions.filter(q => q.sectionId === currentSec.id);

    // Calculate progress counts
    const totalQ = this.orderedQuestions.length;
    const answeredCount = Object.keys(this.answers).filter(k => {
      const val = this.answers[k];
      return val !== undefined && val !== null && val !== '' && (!Array.isArray(val) || val.length > 0);
    }).length;
    const progressPercent = totalQ > 0 ? Math.round((answeredCount / totalQ) * 100) : 0;

    root.innerHTML = `
      ${this.isPreview ? `<div class="preview-mode-banner">${icon('eye', 14)} PREVIEW MODE — Submissions will not affect real response statistics</div>` : ''}

      <header class="responder-header">
        <div class="header-container">
          <div class="header-brand">
            <h1 class="brand-title">${Utils.escapeHTML(this.form.title)}</h1>
            <span class="mode-badge">${(this.form.mode || 'exam').toUpperCase()}</span>
          </div>

          <div class="header-status-area">
            <!-- Fixed Progress Metric -->
            <div class="header-progress-metric" title="${answeredCount} of ${totalQ} questions answered">
              <div class="progress-pct-label"><span id="header-progress-val">${progressPercent}%</span> complete</div>
              <div class="header-progress-track">
                <div class="header-progress-fill" style="width: ${progressPercent}%;"></div>
              </div>
            </div>

            ${this.form.settings?.enableTimer && this.form.timeLimit > 0 ? `
              <div class="timer-pill timer-normal" id="timer-pill" title="Time Remaining">
                <span id="timer-display"><span style="vertical-align:-2px;">${icon('clock', 14)}</span> --:--</span>
                <div class="timer-bar-track">
                  <div class="timer-bar-fill" id="timer-progress-fill"></div>
                </div>
              </div>
            ` : ''}
            <button class="btn btn-sm btn-outline btn-nav-toggle" onclick="Responder.toggleNavigator()">
              <span style="vertical-align:-1px;">${icon('menu', 14)}</span> <span class="nav-btn-text">Navigator</span>
            </button>
          </div>
        </div>
        <!-- Fixed Overall Progress Line -->
        <div class="fixed-top-progress-bar">
          <div class="fixed-top-progress-fill" style="width: ${progressPercent}%;"></div>
        </div>
      </header>

      <main class="responder-main-layout">
        <div class="responder-content-column">
          <!-- Section Details Card -->
          <div class="progress-card">
            <div class="progress-info-row">
              <span>Section ${this.currentSectionIndex + 1} of ${sections.length}: <strong>${Utils.escapeHTML(currentSec.title)}</strong></span>
              <span class="progress-count-pill">${answeredCount} / ${totalQ} Answered (${progressPercent}%)</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill" style="width: ${progressPercent}%;"></div>
            </div>
          </div>

          <!-- Section Meta -->
          ${currentSec.description ? `
            <div class="section-banner-card">
              <p>${Utils.escapeHTML(currentSec.description)}</p>
            </div>
          ` : ''}

          <!-- Questions List -->
          <div class="responder-questions-feed">
            ${secQuestions.map((q, idx) => {
              const globalIdx = this.orderedQuestions.findIndex(item => item.id === q.id);
              const curVal = this.answers[q.id];
              const isFlag = this.flags.has(q.id);
              const studyFeedback = this.studyFeedback[q.id];
              return QuestionsEngine.renderResponderCard(q, globalIdx, curVal, isFlag, studyFeedback);
            }).join('')}
          </div>

          <!-- Section Navigation Buttons -->
          <div class="responder-nav-bar">
            ${this.currentSectionIndex > 0 ? `
              <button type="button" class="btn btn-secondary" onclick="Responder.prevSection()">← Previous Section</button>
            ` : '<div></div>'}

            ${this.currentSectionIndex < sections.length - 1 ? `
              <button type="button" class="btn btn-primary" onclick="Responder.nextSection()">Next Section →</button>
            ` : `
              <button type="button" class="btn btn-success btn-lg" onclick="Responder.confirmSubmission()">Submit Assessment ✓</button>
            `}
          </div>
        </div>

        <!-- Question Navigator Drawer/Sidebar -->
        <aside class="responder-navigator-sidebar" id="responder-navigator">
          <div class="nav-sidebar-header">
            <h3>Question Navigator</h3>
            <button class="btn-icon" onclick="Responder.toggleNavigator()">✕</button>
          </div>
          <div class="nav-stats-summary">
            <div class="stat-pill"><span class="chip-dot dot-answered"></span> Answered: ${answeredCount}</div>
            <div class="stat-pill"><span class="chip-dot dot-unanswered"></span> Unanswered: ${totalQ - answeredCount}</div>
            <div class="stat-pill"><span class="chip-dot dot-flagged"></span> Flagged: ${this.flags.size}</div>
          </div>
          <div class="nav-grid">
            ${this.orderedQuestions.map((q, idx) => {
              const hasAns = this.answers[q.id] !== undefined && this.answers[q.id] !== '' && (!Array.isArray(this.answers[q.id]) || this.answers[q.id].length > 0);
              const isFlag = this.flags.has(q.id);
              let stateClass = hasAns ? 'grid-answered' : 'grid-unanswered';
              if (isFlag) stateClass += ' grid-flagged';

              return `
                <button type="button" class="nav-grid-item ${stateClass}" onclick="Responder.jumpToQuestion('${q.id}', '${q.sectionId}')">
                  <span>${idx + 1}</span>
                  ${isFlag ? '<span class="grid-flag-icon">🚩</span>' : ''}
                  ${hasAns ? '<span class="grid-check-icon">✓</span>' : ''}
                </button>
              `;
            }).join('')}
          </div>
        </aside>
      </main>
    `;
  }

  toggleNavigator() {
    const nav = document.getElementById('responder-navigator');
    if (nav) nav.classList.toggle('open');
  }

  jumpToQuestion(qid, sectionId) {
    const secIdx = (this.form.sections || []).findIndex(s => s.id === sectionId);
    if (secIdx !== -1 && secIdx !== this.currentSectionIndex) {
      this.currentSectionIndex = secIdx;
      this.render();
    }

    setTimeout(() => {
      const el = document.getElementById(`resp_card_${qid}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('highlight-flash');
        setTimeout(() => el.classList.remove('highlight-flash'), 1200);
      }
    }, 50);
  }

  // --- ANSWER HANDLERS ---
  handleAnswerChange(qid, value) {
    this.answers[qid] = value;
    
    // Immediately update radio card visual styles without reloading the DOM
    const cardEl = document.getElementById(`resp_card_${qid}`);
    if (cardEl) {
      cardEl.querySelectorAll('.responder-option-card').forEach(card => {
        const input = card.querySelector('input[type="radio"]');
        if (input) {
          card.classList.toggle('selected', input.value === value);
        }
      });
    }

    this.onAnswerRecorded(qid, false);
  }

  handleCheckboxChange(qid, optionValue, isChecked) {
    if (!Array.isArray(this.answers[qid])) {
      this.answers[qid] = [];
    }
    if (isChecked) {
      if (!this.answers[qid].includes(optionValue)) this.answers[qid].push(optionValue);
    } else {
      this.answers[qid] = this.answers[qid].filter(v => v !== optionValue);
    }

    // Immediately update checkbox card visual styles without reloading the DOM
    const cardEl = document.getElementById(`resp_card_${qid}`);
    if (cardEl) {
      cardEl.querySelectorAll('.responder-option-card').forEach(card => {
        const input = card.querySelector('input[type="checkbox"]');
        if (input) {
          card.classList.toggle('selected', this.answers[qid].includes(input.value));
        }
      });
    }

    this.onAnswerRecorded(qid, false);
  }

  handleMultiSelectChange(qid, selectEl) {
    const selected = Array.from(selectEl.selectedOptions).map(opt => opt.value);
    this.answers[qid] = selected;
    this.onAnswerRecorded(qid, true);
  }

  handleMatrixChange(qid, rowKey, colValue) {
    if (typeof this.answers[qid] !== 'object' || this.answers[qid] === null) {
      this.answers[qid] = {};
    }
    this.answers[qid][rowKey] = colValue;
    this.onAnswerRecorded(qid, true);
  }

  moveRankingItem(qid, itemIdx, direction) {
    const q = this.orderedQuestions.find(item => item.id === qid);
    if (!q) return;

    let items = Array.isArray(this.answers[qid]) ? [...this.answers[qid]] : [...(q.options || [])];
    const targetIdx = itemIdx + direction;
    if (targetIdx >= 0 && targetIdx < items.length) {
      const temp = items[itemIdx];
      items[itemIdx] = items[targetIdx];
      items[targetIdx] = temp;
      this.answers[qid] = items;
      this.onAnswerRecorded(qid, true);
      this.render();
    }
  }

  clearAnswer(qid) {
    delete this.answers[qid];
    delete this.studyFeedback[qid];
    this.render();
    Utils.showToast('Answer cleared', 'info', 1000);
  }

  toggleFlag(qid) {
    if (this.flags.has(qid)) {
      this.flags.delete(qid);
    } else {
      this.flags.add(qid);
    }
    this.render();
  }

  onAnswerRecorded(qid, shouldReRender = false) {
    // If Quiz/Study mode: compute instant feedback
    if (this.form.mode === 'study') {
      const q = this.orderedQuestions.find(item => item.id === qid);
      if (q) {
        const evalResult = ScoringEngine.evaluateQuestion(q, this.answers[qid]);
        this.studyFeedback[qid] = evalResult;
      }
    }

    // Live update fixed progress widgets without destroying typing focus
    const totalQ = this.orderedQuestions.length;
    const answeredCount = Object.keys(this.answers).filter(k => {
      const val = this.answers[k];
      return val !== undefined && val !== null && val !== '' && (!Array.isArray(val) || val.length > 0);
    }).length;
    const progressPercent = totalQ > 0 ? Math.round((answeredCount / totalQ) * 100) : 0;

    // Update fixed top bar and header percentage indicator
    const fixedTopFill = document.querySelector('.fixed-top-progress-fill');
    if (fixedTopFill) fixedTopFill.style.width = `${progressPercent}%`;

    const headerVal = document.getElementById('header-progress-val');
    if (headerVal) headerVal.textContent = `${progressPercent}%`;

    const headerFill = document.querySelector('.header-progress-fill');
    if (headerFill) headerFill.style.width = `${progressPercent}%`;

    if (shouldReRender) {
      this.render();
    }
  }

  // --- SECTION NAVIGATION & CONDITIONAL BRANCHING ---
  validateCurrentSection() {
    const currentSec = this.form.sections[this.currentSectionIndex];
    const secQuestions = this.orderedQuestions.filter(q => q.sectionId === currentSec.id);

    for (const q of secQuestions) {
      if (q.required) {
        const val = this.answers[q.id];
        const isEmpty = val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0);
        if (isEmpty) {
          this.jumpToQuestion(q.id, currentSec.id);
          Utils.showToast(`Please answer required question: "${q.question}"`, 'warning');
          return false;
        }
      }
    }
    return true;
  }

  nextSection() {
    if (!this.validateCurrentSection()) return;

    // Check Conditional Branching
    const nextTarget = this.evaluateBranching();
    if (nextTarget === 'SUBMIT') {
      this.confirmSubmission();
      return;
    } else if (nextTarget) {
      const targetIdx = this.form.sections.findIndex(s => s.id === nextTarget);
      if (targetIdx !== -1) {
        this.currentSectionIndex = targetIdx;
        this.render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
    }

    if (this.currentSectionIndex < this.form.sections.length - 1) {
      this.currentSectionIndex++;
      this.render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  prevSection() {
    if (this.currentSectionIndex > 0) {
      this.currentSectionIndex--;
      this.render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  evaluateBranching() {
    const rules = this.form.conditionalLogic || [];
    for (const rule of rules) {
      const userAns = this.answers[rule.questionId];
      if (userAns !== undefined && userAns !== null) {
        const strAns = String(userAns).trim().toLowerCase();
        const strVal = String(rule.value || '').trim().toLowerCase();

        let matched = false;
        if (rule.operator === 'equals' && strAns === strVal) matched = true;
        else if (rule.operator === 'not_equals' && strAns !== strVal) matched = true;
        else if (rule.operator === 'contains' && strAns.includes(strVal)) matched = true;
        else if (rule.operator === 'greater_than' && parseFloat(strAns) > parseFloat(strVal)) matched = true;
        else if (rule.operator === 'less_than' && parseFloat(strAns) < parseFloat(strVal)) matched = true;

        if (matched) return rule.targetSectionId;
      }
    }
    return null;
  }

  // --- SUBMISSION ---
  async confirmSubmission() {
    if (!this.validateCurrentSection()) return;

    const totalQ = this.orderedQuestions.length;
    const answeredCount = Object.keys(this.answers).filter(k => this.answers[k] !== undefined && this.answers[k] !== '').length;
    const unanswered = totalQ - answeredCount;

    let confirmMsg = 'Are you ready to submit your assessment?';
    if (unanswered > 0) {
      confirmMsg = `You have ${unanswered} unanswered question(s). Are you sure you want to finish and submit?`;
    }

    const ok = await Utils.confirmDialog({
      title: 'Submit Assessment',
      message: confirmMsg,
      confirmText: 'Submit Now',
      isDanger: unanswered > 0
    });

    if (ok) {
      this.submitAssessment(false);
    }
  }

  async submitAssessment(forcedByTimer = false) {
    if (this.timer) this.timer.stop();
    this.isSubmitted = true;

    const durationSeconds = Math.round((Date.now() - this.startTime) / 1000);

    // Calculate score
    const scoreResult = ScoringEngine.calculateTotalResults(this.form, this.answers);

    const responseRecord = {
      id: Utils.uid('resp'),
      formId: this.form.id,
      formTitle: this.form.title,
      respondentName: this.respondentName || 'Anonymous Candidate',
      respondentEmail: this.respondentEmail || 'N/A',
      respondentPhone: this.respondentPhone || 'N/A',
      respondentTelegram: this.respondentTelegram || 'N/A',
      respondentId: this.respondentId || 'N/A',
      answers: this.answers,
      flags: Array.from(this.flags),
      durationSeconds,
      submittedAt: new Date().toISOString(),
      forcedByTimer,
      scoring: scoreResult
    };

    if (!this.isPreview) {
      await DB.saveResponse(responseRecord);
      await DB.clearDraft(this.form.id);
    }

    this.renderResultsScreen(responseRecord, scoreResult);
  }

  // --- RESULTS SCREEN ---
  renderResultsScreen(responseRecord, scoreResult) {
    const root = document.getElementById('responder-app');
    if (!root) return;

    const isExam = this.form.mode === 'exam';
    const isSurvey = this.form.mode === 'survey';
    const revealScore = this.form.settings?.showScoreAfterSubmission !== false;
    const hasEmail = this.respondentEmail && this.respondentEmail !== 'N/A' && this.respondentEmail.includes('@');

    // If score is hidden and candidate didn't provide contact info, show contact capture card
    if (!revealScore && !isSurvey) {
      const hasAnyContact = (this.respondentEmail && this.respondentEmail !== 'N/A') || 
                            (this.respondentPhone && this.respondentPhone !== 'N/A') || 
                            (this.respondentTelegram && this.respondentTelegram !== 'N/A');

      root.innerHTML = `
        <div class="results-screen-container">
          <div class="results-hero-card hero-passed">
            <div class="results-icon" style="color: var(--success);">
              ${icon('check', 48)}
            </div>
            <h2>Assessment Submitted Successfully!</h2>
            <p class="text-muted" style="margin-bottom: 1.5rem;">
              Your answers have been recorded. Scores are currently withheld by the examiner and will be reviewed and sent directly to you.
            </p>

            ${!hasAnyContact ? `
              <div class="email-capture-box" style="background: var(--bg-surface-subtle); border: 1.5px solid var(--border-color); border-radius: var(--radius-md); padding: 1.5rem; margin: 1.5rem 0; text-align: left;">
                <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.5rem;">
                  <span style="color:var(--primary);">${icon('send', 20)}</span>
                  <strong style="font-size:1.05rem; color:var(--text-main);">Where should we send your results?</strong>
                </div>
                <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:1rem;">
                  Please enter your WhatsApp phone number, Telegram handle, or Email so your graded report can be dispatched directly to you.
                </p>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:0.75rem; margin-bottom:1rem;">
                  <div>
                    <label class="form-label-sm"><span style="vertical-align:-1px;">${icon('whatsapp', 13)}</span> WhatsApp Phone</label>
                    <input type="tel" id="post_resp_phone" class="form-input" placeholder="+234..." />
                  </div>
                  <div>
                    <label class="form-label-sm"><span style="vertical-align:-1px;">${icon('telegram', 13)}</span> Telegram (@user / phone)</label>
                    <input type="text" id="post_resp_telegram" class="form-input" placeholder="@john_doe" />
                  </div>
                  <div>
                    <label class="form-label-sm"><span style="vertical-align:-1px;">${icon('mail', 13)}</span> Email Address</label>
                    <input type="email" id="post_resp_email" class="form-input" placeholder="student@example.com" />
                  </div>
                </div>
                <button type="button" class="btn btn-primary" onclick="Responder.savePostSubmissionContacts('${responseRecord.id}')">
                  Save Delivery Channels & Finish
                </button>
                <div id="post_contact_msg" style="margin-top:0.6rem; font-size:0.85rem;"></div>
              </div>
            ` : `
              <div class="alert-box alert-success" style="margin: 1.5rem 0; text-align: left;">
                <span style="vertical-align:-2px;">${icon('check', 16)}</span> Graded results and feedback will be sent directly to your saved contact channels once finalized.
              </div>
            `}

            <div class="results-actions" style="margin-top: 1.5rem;">
              <a href="index.html" class="btn btn-secondary">
                <span style="vertical-align:-2px;">${icon('home', 15)}</span> Return to Home
              </a>
            </div>
          </div>
        </div>
      `;
      return;
    }

    root.innerHTML = `
      <div class="results-screen-container">
        <div class="results-hero-card ${scoreResult.passed ? 'hero-passed' : 'hero-failed'}">
          <div class="results-icon" style="color: ${scoreResult.passed ? 'var(--success)' : 'var(--primary)'};">
            ${scoreResult.passed ? icon('award', 48) : icon('fileText', 48)}
          </div>
          <h2>${isSurvey ? 'Thank You!' : 'Assessment Submitted'}</h2>
          <p class="text-muted">${isSurvey ? 'Your responses have been successfully recorded.' : `You scored ${scoreResult.score} out of ${scoreResult.maxScore} points`}</p>

          ${!isSurvey ? `
            <div class="score-kpi-grid">
              <div class="score-kpi-item">
                <span class="kpi-num">${scoreResult.percentage}%</span>
                <span class="kpi-label">Percentage</span>
              </div>
              <div class="score-kpi-item">
                <span class="kpi-num">${scoreResult.grade}</span>
                <span class="kpi-label">Grade</span>
              </div>
              <div class="score-kpi-item">
                <span class="kpi-num">${scoreResult.correctCount} / ${scoreResult.totalQuestions}</span>
                <span class="kpi-label">Correct Items</span>
              </div>
              <div class="score-kpi-item">
                <span class="kpi-num">${Utils.formatTime(responseRecord.durationSeconds)}</span>
                <span class="kpi-label">Time Taken</span>
              </div>
            </div>

            <div class="results-remark-box">
              <strong>Evaluation Remark:</strong> ${Utils.escapeHTML(scoreResult.remark)}
            </div>
          ` : ''}

          <div class="results-actions">
            <button type="button" class="btn btn-secondary" onclick="window.print()">
              <span style="vertical-align:-2px;">${icon('printer', 15)}</span> Print / Save PDF
            </button>
            <a href="index.html" class="btn btn-primary">
              <span style="vertical-align:-2px;">${icon('home', 15)}</span> Return to Home
            </a>
          </div>
        </div>

        ${!isSurvey ? `
          <div class="results-review-section">
            <h3 class="review-title">Detailed Response Breakdown</h3>
            <div class="review-questions-list">
              ${this.orderedQuestions.map((q, idx) => {
                const evalData = scoreResult.breakdown[q.id] || {};
                const isCorrect = evalData.isCorrect;
                const isUnanswered = evalData.isUnanswered;
                const userAns = this.answers[q.id];

                return `
                  <div class="review-q-card ${isUnanswered ? 'review-unanswered' : isCorrect ? 'review-correct' : 'review-incorrect'}">
                    <div class="review-q-header">
                      <span><strong>Q${idx + 1}.</strong> ${Utils.escapeHTML(q.question)}</span>
                      <span class="review-badge ${isCorrect ? 'badge-correct' : 'badge-incorrect'}">
                        ${isUnanswered ? 'Unanswered (0 pts)' : isCorrect ? `Correct (+${evalData.earnedPoints} pts)` : `Incorrect (${evalData.earnedPoints} pts)`}
                      </span>
                    </div>
                    <div class="review-q-body">
                      <div class="review-ans-row">
                        <strong>Your Answer:</strong> ${Utils.escapeHTML(Array.isArray(userAns) ? userAns.join(', ') : (userAns ? (typeof userAns === 'object' ? JSON.stringify(userAns) : String(userAns)) : 'None'))}
                      </div>
                      ${!isCorrect && q.answer ? `
                        <div class="review-ans-row text-success">
                          <strong>Correct Answer:</strong> ${Utils.escapeHTML(Array.isArray(q.answer) ? q.answer.join(', ') : String(q.answer))}
                        </div>
                      ` : ''}
                      ${q.explanation ? `
                        <div class="review-explanation-row">
                          <strong>Explanation:</strong> ${Utils.escapeHTML(q.explanation)}
                        </div>
                      ` : ''}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  async savePostSubmissionContacts(responseId) {
    const phoneInput = document.getElementById('post_resp_phone');
    const tgInput = document.getElementById('post_resp_telegram');
    const emailInput = document.getElementById('post_resp_email');
    const msg = document.getElementById('post_contact_msg');

    const phone = phoneInput ? phoneInput.value.trim() : '';
    const tg = tgInput ? tgInput.value.trim().replace(/^@/, '') : '';
    const email = emailInput ? emailInput.value.trim() : '';

    if (!phone && !tg && !email) {
      if (msg) {
        msg.innerHTML = '<span class="text-danger">Please enter at least one contact method (WhatsApp, Telegram, or Email).</span>';
      }
      return;
    }

    this.respondentPhone = phone || this.respondentPhone;
    this.respondentTelegram = tg || this.respondentTelegram;
    this.respondentEmail = email || this.respondentEmail;

    // Update response in DB and Supabase Cloud
    try {
      const all = await DB.getAllResponses();
      const existing = all.find(r => r.id === responseId);
      if (existing) {
        if (phone) existing.respondentPhone = phone;
        if (tg) existing.respondentTelegram = tg;
        if (email) existing.respondentEmail = email;
        await DB.saveResponse(existing);
      }

      if (msg) {
        msg.innerHTML = `<span class="text-success">${icon('check', 14)} Contact details saved successfully! The examiner will dispatch your results.</span>`;
      }
      if (phoneInput) phoneInput.disabled = true;
      if (tgInput) tgInput.disabled = true;
      if (emailInput) emailInput.disabled = true;
      Utils.showToast('Delivery channels saved!', 'success');
    } catch (e) {
      console.error('Error saving post-submission contacts', e);
    }
  }

  renderError(msg) {
    const root = document.getElementById('responder-app');
    if (root) {
      root.innerHTML = `
        <div class="empty-state-card">
          <h2>Assessment Unavailable</h2>
          <p>${Utils.escapeHTML(msg)}</p>
          <a href="index.html" class="btn btn-primary">Go to Dashboard</a>
        </div>
      `;
    }
  }

  renderClosed(msg) {
    const root = document.getElementById('responder-app');
    if (root) {
      root.innerHTML = `
        <div class="empty-state-card">
          <h2>Form Closed</h2>
          <p>${Utils.escapeHTML(msg)}</p>
          <a href="index.html" class="btn btn-primary">Return to Home</a>
        </div>
      `;
    }
  }
}

window.Responder = new FormResponder();
