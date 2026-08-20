/**
 * FormForge Results & Manual Grading Controller
 */

class FormResults {
  constructor() {
    this.form = null;
    this.responses = [];
    this.filteredResponses = [];
    this.searchTerm = '';
    this.filterStatus = 'all'; // all | graded | pending
    this.sortField = 'submittedAt';
    this.sortAsc = false;
  }

  async init() {
    const urlParams = new URLSearchParams(window.location.search);
    let formId = urlParams.get('id');

    if (!formId) {
      // Auto-fallback: fetch available forms so admin can pick or see latest
      const allForms = await DB.getAllForms();
      if (allForms.length > 0) {
        formId = allForms[0].id; // Default to first available form
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('id', formId);
        window.history.replaceState({}, '', newUrl);
      } else {
        this.renderNoForm();
        return;
      }
    }

    this.form = await DB.getFormById(formId);
    if (!this.form) {
      this.renderNoForm();
      return;
    }

    document.title = `${this.form.title} — Analytics & Grading`;
    await this.reloadResponses();
    this.render();
  }

  async reloadResponses() {
    this.responses = await DB.getResponsesByFormId(this.form.id);
    
    // Ensure scores are fresh with manual grades evaluated
    this.responses.forEach(r => {
      r.scoring = ScoringEngine.calculateTotalResults(this.form, r.answers || {}, r.manualGrades || {});
    });

    this.filterAndSort();
  }

  async renderNoForm() {
    const root = document.getElementById('results-app');
    if (!root) return;

    const allForms = await DB.getAllForms();
    root.innerHTML = `
      <div class="empty-state-card" style="max-width:560px; margin:4rem auto; text-align:center; padding:2.5rem 2rem; background:var(--bg-surface); border:1px solid var(--border-color); border-radius:var(--radius-lg); box-shadow:var(--shadow-md);">
        <div style="color:var(--primary); margin-bottom:1rem;">${icon('chart', 48)}</div>
        <h2>Select an Assessment to View Results</h2>
        <p class="text-muted" style="margin-bottom:1.5rem;">Choose an assessment from your dashboard or select one below to inspect responses and grade candidates.</p>
        
        ${allForms.length > 0 ? `
          <div style="display:flex; flex-direction:column; gap:0.5rem; margin-bottom:1.5rem; text-align:left;">
            ${allForms.map(f => `
              <a href="results.html?id=${f.id}" class="btn btn-secondary" style="justify-content:space-between; display:flex; padding:0.75rem 1rem;">
                <span style="font-weight:700;">${Utils.escapeHTML(f.title)}</span>
                <span class="badge" style="text-transform:uppercase;">${f.status || 'Draft'} →</span>
              </a>
            `).join('')}
          </div>
        ` : ''}

        <a href="index.html" class="btn btn-primary">Return to Dashboard</a>
      </div>
    `;
  }

  render() {
    const root = document.getElementById('results-app');
    if (!root) return;

    const total = this.responses.length;
    let avgScore = 0;
    let highestScore = 0;
    let lowestScore = 100;
    let passedCount = 0;
    let totalDuration = 0;
    let pendingGradingCount = 0;

    if (total > 0) {
      let scoreSum = 0;
      this.responses.forEach(r => {
        const pct = r.scoring?.percentage || 0;
        scoreSum += pct;
        if (pct > highestScore) highestScore = pct;
        if (pct < lowestScore) lowestScore = pct;
        if (r.scoring?.passed) passedCount++;
        if (!r.scoring?.isFullyGraded) pendingGradingCount++;
        totalDuration += (r.durationSeconds || 0);
      });
      avgScore = Math.round((scoreSum / total) * 10) / 10;
    } else {
      lowestScore = 0;
    }

    const avgDuration = total > 0 ? Math.round(totalDuration / total) : 0;

    root.innerHTML = `
      <header class="results-header">
        <div class="results-header-container">
          <div>
            <div class="breadcrumbs">
              <a href="index.html">Dashboard</a> / <a href="builder.html?id=${this.form.id}">${Utils.escapeHTML(this.form.title)}</a> / <span>Responses & Grading</span>
            </div>
            <h1 class="results-page-title">${Utils.escapeHTML(this.form.title)} — Results</h1>
          </div>
          <div class="results-header-actions">
            <button class="btn btn-secondary" onclick="Results.exportCSV()">Export CSV</button>
            <button class="btn btn-secondary" onclick="Results.exportJSON()">Export JSON</button>
            <button class="btn btn-primary" onclick="window.print()">Print Summary</button>
          </div>
        </div>
      </header>

      <main class="results-content-container">
        <!-- KPI Metrics Grid -->
        <div class="metrics-grid">
          <div class="metric-card">
            <span class="metric-icon">👥</span>
            <div class="metric-val">${total}</div>
            <div class="metric-label">Total Submissions</div>
          </div>
          <div class="metric-card">
            <span class="metric-icon">📊</span>
            <div class="metric-val">${avgScore}%</div>
            <div class="metric-label">Average Score</div>
          </div>
          <div class="metric-card">
            <span class="metric-icon">⏳</span>
            <div class="metric-val">${pendingGradingCount}</div>
            <div class="metric-label">Pending Manual Review</div>
          </div>
          <div class="metric-card">
            <span class="metric-icon">⏱</span>
            <div class="metric-val">${Utils.formatTime(avgDuration)}</div>
            <div class="metric-label">Avg. Completion Time</div>
          </div>
        </div>

        ${total > 0 ? `
          <!-- Analytics Charts Section -->
          <div class="analytics-charts-grid">
            <div class="chart-card">
              <h3 class="chart-title">Score Distribution</h3>
              <div class="chart-wrapper">
                <canvas id="scoreDistChart" height="200"></canvas>
              </div>
            </div>
            <div class="chart-card">
              <h3 class="chart-title">Question Accuracy Breakdown</h3>
              <div class="chart-wrapper">
                <canvas id="qAccuracyChart" height="200"></canvas>
              </div>
            </div>
          </div>
        ` : ''}

        <!-- Responses Data Table Section -->
        <div class="table-section-card">
          <div class="table-toolbar">
            <div class="search-input-box">
              <input type="text" class="form-input" placeholder="Search by name, email, or candidate ID..." 
                value="${Utils.escapeHTML(this.searchTerm)}" oninput="Results.handleSearch(this.value)" />
            </div>

            <div class="dashboard-filters">
              <button class="filter-pill ${this.filterStatus === 'all' ? 'active' : ''}" onclick="Results.setFilterStatus('all')">All</button>
              <button class="filter-pill ${this.filterStatus === 'graded' ? 'active' : ''}" onclick="Results.setFilterStatus('graded')">Fully Graded</button>
              <button class="filter-pill ${this.filterStatus === 'pending' ? 'active' : ''}" onclick="Results.setFilterStatus('pending')">Pending Review (${pendingGradingCount})</button>
            </div>

            <div class="toolbar-stats text-muted">
              Showing ${this.filteredResponses.length} of ${total} records
            </div>
          </div>

          <div class="responsive-table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th onclick="Results.setSort('respondentName')">Respondent / Candidate ↕</th>
                  <th onclick="Results.setSort('score')">Score ↕</th>
                  <th onclick="Results.setSort('percentage')">Percentage ↕</th>
                  <th>Grade</th>
                  <th>Grading Status</th>
                  <th onclick="Results.setSort('durationSeconds')">Time Spent ↕</th>
                  <th onclick="Results.setSort('submittedAt')">Submitted ↕</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${this.filteredResponses.length === 0 ? `
                  <tr><td colspan="8" class="text-center py-4 text-muted">No responses found matching your criteria.</td></tr>
                ` : this.filteredResponses.map(r => {
                  const s = r.scoring || {};
                  const isGraded = s.isFullyGraded;
                  return `
                    <tr>
                      <td>
                        <strong>${Utils.escapeHTML(r.respondentName || 'Candidate')}</strong>
                        ${r.respondentId ? `<span class="badge" style="font-size:0.7rem; margin-left:4px;">ID: ${Utils.escapeHTML(r.respondentId)}</span>` : ''}
                        ${r.respondentEmail && r.respondentEmail !== 'N/A' ? `<div class="sub-email">${Utils.escapeHTML(r.respondentEmail)}</div>` : ''}
                      </td>
                      <td>${s.score || 0} / ${s.maxScore || 0}</td>
                      <td><strong>${s.percentage || 0}%</strong></td>
                      <td><span class="grade-pill grade-${s.grade || 'N'}">${s.grade || 'N/A'}</span></td>
                      <td>
                        ${isGraded ? `
                          <span class="status-pill status-pass">GRADED ✓</span>
                        ` : `
                          <span class="status-pill status-draft">PENDING REVIEW ⏳</span>
                        `}
                      </td>
                      <td>${Utils.formatTime(r.durationSeconds || 0)}</td>
                      <td>${Utils.formatDate(r.submittedAt)}</td>
                      <td>
                        <button class="btn btn-sm ${isGraded ? 'btn-outline' : 'btn-primary'}" onclick="Results.inspectResponse('${r.id}')">
                          ${isGraded ? 'Inspect' : 'Grade / Review ✏️'}
                        </button>
                        <button class="btn-icon text-danger" title="Delete Response" onclick="Results.deleteResponse('${r.id}')">✕</button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    `;

    if (total > 0) {
      this.renderCharts();
    }
  }

  // --- CANVAS CHARTS ---
  renderCharts() {
    this.renderScoreDistCanvas();
    this.renderQuestionAccuracyCanvas();
  }

  renderScoreDistCanvas() {
    const canvas = document.getElementById('scoreDistChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.parentElement.clientWidth || 400;
    const height = canvas.height = 200;

    const buckets = [
      { label: '0-20%', count: 0 },
      { label: '21-40%', count: 0 },
      { label: '41-60%', count: 0 },
      { label: '61-80%', count: 0 },
      { label: '81-100%', count: 0 }
    ];

    this.responses.forEach(r => {
      const pct = r.scoring?.percentage || 0;
      if (pct <= 20) buckets[0].count++;
      else if (pct <= 40) buckets[1].count++;
      else if (pct <= 60) buckets[2].count++;
      else if (pct <= 80) buckets[3].count++;
      else buckets[4].count++;
    });

    const maxCount = Math.max(...buckets.map(b => b.count), 1);
    const barWidth = (width - 60) / buckets.length;
    const chartHeight = height - 50;

    ctx.clearRect(0, 0, width, height);

    buckets.forEach((b, i) => {
      const x = 40 + i * barWidth + 10;
      const barH = (b.count / maxCount) * chartHeight;
      const y = height - 30 - barH;

      const grad = ctx.createLinearGradient(0, y, 0, height - 30);
      grad.addColorStop(0, '#4f46e5');
      grad.addColorStop(1, '#818cf8');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x, y, barWidth - 20, barH, [4, 4, 0, 0]) : ctx.rect(x, y, barWidth - 20, barH);
      ctx.fill();

      ctx.fillStyle = '#1e293b';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      if (b.count > 0) ctx.fillText(String(b.count), x + (barWidth - 20) / 2, y - 5);

      ctx.fillStyle = '#64748b';
      ctx.fillText(b.label, x + (barWidth - 20) / 2, height - 10);
    });
  }

  renderQuestionAccuracyCanvas() {
    const canvas = document.getElementById('qAccuracyChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.parentElement.clientWidth || 400;
    const height = canvas.height = 200;

    const questions = this.form.questions || [];
    if (questions.length === 0) return;

    const qStats = questions.map((q, i) => {
      let correct = 0;
      this.responses.forEach(r => {
        if (r.scoring?.breakdown?.[q.id]?.isCorrect) correct++;
      });
      const pct = this.responses.length > 0 ? Math.round((correct / this.responses.length) * 100) : 0;
      return { label: `Q${i + 1}`, accuracy: pct };
    });

    const displayCount = Math.min(qStats.length, 12);
    const subset = qStats.slice(0, displayCount);
    const barWidth = (width - 50) / displayCount;
    const chartHeight = height - 50;

    ctx.clearRect(0, 0, width, height);

    subset.forEach((item, i) => {
      const x = 35 + i * barWidth + 6;
      const barH = (item.accuracy / 100) * chartHeight;
      const y = height - 30 - barH;

      ctx.fillStyle = item.accuracy >= 60 ? '#10b981' : '#f59e0b';
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x, y, barWidth - 12, barH, [4, 4, 0, 0]) : ctx.rect(x, y, barWidth - 12, barH);
      ctx.fill();

      ctx.fillStyle = '#1e293b';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${item.accuracy}%`, x + (barWidth - 12) / 2, y - 5);

      ctx.fillStyle = '#64748b';
      ctx.fillText(item.label, x + (barWidth - 12) / 2, height - 10);
    });
  }

  // --- FILTERS & SORT ---
  setFilterStatus(status) {
    this.filterStatus = status;
    this.filterAndSort();
    this.render();
  }

  handleSearch(term) {
    this.searchTerm = term.toLowerCase();
    this.filterAndSort();
    this.render();
  }

  setSort(field) {
    if (this.sortField === field) {
      this.sortAsc = !this.sortAsc;
    } else {
      this.sortField = field;
      this.sortAsc = true;
    }
    this.filterAndSort();
    this.render();
  }

  filterAndSort() {
    let list = this.responses.filter(r => {
      if (this.filterStatus === 'graded' && !r.scoring?.isFullyGraded) return false;
      if (this.filterStatus === 'pending' && r.scoring?.isFullyGraded) return false;

      if (!this.searchTerm) return true;
      const name = (r.respondentName || '').toLowerCase();
      const email = (r.respondentEmail || '').toLowerCase();
      const candId = (r.respondentId || '').toLowerCase();
      return name.includes(this.searchTerm) || email.includes(this.searchTerm) || candId.includes(this.searchTerm);
    });

    list.sort((a, b) => {
      let valA = a[this.sortField];
      let valB = b[this.sortField];

      if (this.sortField === 'score') {
        valA = a.scoring?.score || 0;
        valB = b.scoring?.score || 0;
      } else if (this.sortField === 'percentage') {
        valA = a.scoring?.percentage || 0;
        valB = b.scoring?.percentage || 0;
      }

      if (valA < valB) return this.sortAsc ? -1 : 1;
      if (valA > valB) return this.sortAsc ? 1 : -1;
      return 0;
    });

    this.filteredResponses = list;
  }

  // --- INSPECTION & MANUAL GRADING MODAL ---
  inspectResponse(responseId) {
    const resp = this.responses.find(r => r.id === responseId);
    if (!resp) return;

    const scoring = resp.scoring || {};
    const breakdown = scoring.breakdown || {};
    const questions = this.form.questions || [];
    const manualGrades = resp.manualGrades || {};

    document.body.classList.add('review-modal-open');

    // Remove any existing rotate prompt
    const existingPrompt = document.getElementById('landscape_rotate_prompt');
    if (existingPrompt) existingPrompt.remove();

    // Landscape Enforcement Banner for mobile devices in portrait
    const rotateOverlay = document.createElement('div');
    rotateOverlay.className = 'landscape-rotate-prompt';
    rotateOverlay.id = 'landscape_rotate_prompt';
    rotateOverlay.innerHTML = `
      <div class="rotate-phone-icon" style="color:var(--primary); margin-bottom:1rem;">${icon('rotate', 48)}</div>
      <div class="rotate-prompt-title">Rotate Device to Landscape</div>
      <p class="rotate-prompt-desc">
        To review responses, grade written answers, and view detailed statistics, please turn your phone horizontally.
      </p>
      <button type="button" class="btn-bypass-landscape" onclick="Results.closeInspector()">
        Close & Return to Table
      </button>
    `;
    document.body.appendChild(rotateOverlay);

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.id = `inspect_modal_${resp.id}`;
    modal.innerHTML = `
      <div class="modal-card modal-lg" style="max-width:900px; width:95vw;">
        <div class="modal-header" style="padding:1rem 1.5rem; background:var(--bg-surface-subtle); border-bottom:1px solid var(--border-color);">
          <div style="min-width:0; flex:1;">
            <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap; margin-bottom:0.25rem;">
              <h3 class="modal-title" style="margin:0; font-size:1.2rem;">${Utils.escapeHTML(resp.respondentName || 'Candidate')}</h3>
              ${resp.respondentId && resp.respondentId !== 'N/A' ? `<span class="badge" style="background:#e0e7ff; color:#3730a3; font-size:0.75rem;">ID: ${Utils.escapeHTML(resp.respondentId)}</span>` : ''}
              ${resp.respondentEmail && resp.respondentEmail !== 'N/A' ? `<span class="badge" style="background:#f1f5f9; color:#475569; font-size:0.75rem;"><span style="vertical-align:-1px;">${icon('mail', 12)}</span> ${Utils.escapeHTML(resp.respondentEmail)}</span>` : ''}
              ${resp.respondentPhone && resp.respondentPhone !== 'N/A' ? `<span class="badge" style="background:#dcfce7; color:#166534; font-size:0.75rem;"><span style="vertical-align:-1px;">${icon('whatsapp', 12)}</span> ${Utils.escapeHTML(resp.respondentPhone)}</span>` : ''}
              ${resp.respondentTelegram && resp.respondentTelegram !== 'N/A' ? `<span class="badge" style="background:#e0f2fe; color:#0369a1; font-size:0.75rem;"><span style="vertical-align:-1px;">${icon('telegram', 12)}</span> @${Utils.escapeHTML(resp.respondentTelegram)}</span>` : ''}
            </div>
            <small class="text-muted" style="display:block; font-size:0.78rem;">
              Submitted on ${Utils.formatDate(resp.submittedAt)} • Duration: ${Utils.formatTime(resp.durationSeconds)}
            </small>
          </div>
          <button class="btn-icon" onclick="Results.closeInspector()" style="font-size:1.2rem; align-self:flex-start;">✕</button>
        </div>

        <div class="modal-body" style="padding:1.25rem 1.5rem; max-height:78vh; overflow-y:auto;">
          <!-- Modern High-Contrast Score KPI Header -->
          <div class="inspect-score-summary">
            <div class="inspect-kpi">
              <strong>${scoring.score || 0} / ${scoring.maxScore || 0}</strong>
              <span>Total Score</span>
            </div>
            <div class="inspect-kpi">
              <strong>${scoring.percentage || 0}%</strong>
              <span>Percentage</span>
            </div>
            <div class="inspect-kpi">
              <strong>${scoring.grade || 'PENDING'}</strong>
              <span>Grade</span>
            </div>
            <div class="inspect-kpi">
              <strong style="font-size:1.05rem;">${scoring.isFullyGraded ? (scoring.passed ? 'PASSED ✓' : 'FAILED') : 'PENDING'}</strong>
              <span>Status</span>
            </div>
          </div>

          <!-- Multi-Channel Instant Score Dispatch Panel -->
          <div class="score-dispatch-card" style="background:#f8fafc; border:1.5px solid var(--border-color); border-radius:var(--radius-md); padding:1rem 1.25rem; margin:1.25rem 0; box-shadow:var(--shadow-sm);">
            <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.5rem; margin-bottom:0.75rem;">
              <div>
                <strong style="font-size:0.95rem; color:var(--text-main); display:flex; align-items:center; gap:0.4rem;">
                  <span style="color:var(--primary);">${icon('send', 16)}</span> Dispatch Graded Score to Candidate (Free)
                </strong>
                <small class="text-muted" style="font-size:0.78rem;">Send personalized results directly to candidate via WhatsApp, Telegram, Email, or all at once.</small>
              </div>
              <button type="button" class="btn btn-sm btn-primary" onclick="Results.dispatchAllChannels('${resp.id}')" title="Send via all available candidate channels">
                <span style="vertical-align:-1px;">${icon('send', 13)}</span> Send to All Channels
              </button>
            </div>

            <!-- Inline Candidate Contacts Quick Bar -->
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(210px, 1fr)); gap:0.6rem; margin-bottom:0.85rem; background:#ffffff; padding:0.75rem; border-radius:8px; border:1px solid var(--border-color);">
              <div>
                <label class="form-label-sm" style="font-size:0.75rem;"><span style="vertical-align:-1px; color:#25D366;">${icon('whatsapp', 13)}</span> WhatsApp Phone Number:</label>
                <input type="tel" id="disp_phone_${resp.id}" class="form-input form-input-sm" placeholder="e.g. 2348012345678" value="${resp.respondentPhone && resp.respondentPhone !== 'N/A' ? Utils.escapeHTML(resp.respondentPhone) : ''}" 
                  onchange="Results.updateCandidateContact('${resp.id}', 'respondentPhone', this.value)" />
              </div>
              <div>
                <label class="form-label-sm" style="font-size:0.75rem;"><span style="vertical-align:-1px; color:#229ED9;">${icon('telegram', 13)}</span> Telegram Handle or Phone:</label>
                <input type="text" id="disp_tg_${resp.id}" class="form-input form-input-sm" placeholder="e.g. @username or phone" value="${resp.respondentTelegram && resp.respondentTelegram !== 'N/A' ? Utils.escapeHTML(resp.respondentTelegram) : ''}" 
                  onchange="Results.updateCandidateContact('${resp.id}', 'respondentTelegram', this.value)" />
              </div>
              <div>
                <label class="form-label-sm" style="font-size:0.75rem;"><span style="vertical-align:-1px; color:var(--primary);">${icon('mail', 13)}</span> Email Address:</label>
                <input type="email" id="disp_email_${resp.id}" class="form-input form-input-sm" placeholder="student@example.com" value="${resp.respondentEmail && resp.respondentEmail !== 'N/A' ? Utils.escapeHTML(resp.respondentEmail) : ''}" 
                  onchange="Results.updateCandidateContact('${resp.id}', 'respondentEmail', this.value)" />
              </div>
            </div>

            <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
              <button type="button" class="btn btn-sm" style="background:#25D366; color:#ffffff; border:none;" onclick="Results.dispatchWhatsApp('${resp.id}')">
                <span style="vertical-align:-2px;">${icon('whatsapp', 14)}</span> WhatsApp DM
              </button>
              <button type="button" class="btn btn-sm" style="background:#229ED9; color:#ffffff; border:none;" onclick="Results.dispatchTelegram('${resp.id}')">
                <span style="vertical-align:-2px;">${icon('telegram', 14)}</span> Telegram DM
              </button>
              <button type="button" class="btn btn-sm btn-secondary" onclick="Results.dispatchEmail('${resp.id}')">
                <span style="vertical-align:-2px;">${icon('mail', 14)}</span> Email Report
              </button>
              <button type="button" class="btn btn-sm btn-outline" onclick="Results.copyScoreCardText('${resp.id}')">
                <span style="vertical-align:-2px;">${icon('fileText', 14)}</span> Copy Text
              </button>
            </div>
          </div>

          <div class="inspect-q-feed">
            ${questions.map((q, idx) => {
              const evalData = breakdown[q.id] || {};
              const userAns = resp.answers[q.id];
              const qManual = manualGrades[q.id] || {};
              const maxPts = q.points || 1;
              const hasEarned = evalData.earnedPoints !== undefined ? evalData.earnedPoints : (qManual.earnedPoints || 0);

              return `
                <div class="inspect-q-item ${evalData.needsManualReview ? 'inspect-pending-review' : evalData.isCorrect ? 'inspect-correct' : 'inspect-incorrect'}">
                  <div class="inspect-q-title-row">
                    <span><strong>Q${idx + 1}.</strong> ${Utils.escapeHTML(q.question)}</span>
                    <span class="badge ${evalData.isCorrect ? 'badge-correct' : 'badge-incorrect'}" style="flex-shrink:0;">
                      ${hasEarned} / ${maxPts} pts ${evalData.needsManualReview ? '(Review Required)' : ''}
                    </span>
                  </div>

                  <div style="font-size:0.85rem; font-weight:600; color:var(--text-muted); margin-bottom:0.25rem;">Candidate's Answer:</div>
                  <div class="user-ans-box">${Utils.escapeHTML(Array.isArray(userAns) ? userAns.join(', ') : (userAns !== undefined && userAns !== null && userAns !== '' ? (typeof userAns === 'object' ? JSON.stringify(userAns) : String(userAns)) : '<No Answer Provided>'))}</div>

                  ${q.answer ? `
                    <div class="inspect-q-correct text-success">
                      <strong>Sample / Model Answer:</strong> ${Utils.escapeHTML(Array.isArray(q.answer) ? q.answer.join(', ') : String(q.answer))}
                    </div>
                  ` : ''}

                  <!-- Manual Examiner Grading Panel -->
                  <div class="manual-grading-panel">
                    <div class="manual-grading-header">
                      <span><strong><span style="vertical-align:-2px;">${icon('edit', 14)}</span> Examiner Evaluation & Marks</strong></span>
                      ${qManual.gradedAt ? `<span class="text-success font-weight-bold" style="font-size:0.75rem;">✓ Graded on ${Utils.formatDate(qManual.gradedAt)}</span>` : '<span class="text-muted" style="font-size:0.75rem;">Awaiting review</span>'}
                    </div>

                    <div class="manual-quick-btn-row">
                      <button type="button" class="btn btn-sm btn-success" 
                        onclick="Results.quickMark('${resp.id}', '${q.id}', ${maxPts}, 'Correct')">
                        ✓ Correct (+${maxPts} pts)
                      </button>
                      ${maxPts > 1 ? `
                        <button type="button" class="btn btn-sm btn-secondary" 
                          onclick="Results.quickMark('${resp.id}', '${q.id}', ${maxPts / 2}, 'Partial Credit')">
                          ½ Partial (+${maxPts / 2} pts)
                        </button>
                      ` : ''}
                      <button type="button" class="btn btn-sm btn-danger" 
                        onclick="Results.quickMark('${resp.id}', '${q.id}', 0, 'Incorrect')">
                        ✕ Incorrect (0 pts)
                      </button>
                    </div>

                    <div class="manual-grading-controls">
                      <div class="points-input-wrap">
                        <label class="form-label-sm">Custom Mark (0 to ${maxPts}):</label>
                        <input type="number" min="0" max="${maxPts}" step="0.5" 
                          id="manual_pts_${q.id}" 
                          class="form-input form-input-sm" 
                          value="${qManual.earnedPoints !== undefined ? qManual.earnedPoints : (evalData.earnedPoints || 0)}" style="width:110px;" />
                      </div>
                      <div class="comments-input-wrap">
                        <label class="form-label-sm">Feedback / Notes to Candidate:</label>
                        <input type="text" id="manual_comment_${q.id}" class="form-input form-input-sm" 
                          placeholder="Optional feedback..." 
                          value="${Utils.escapeHTML(qManual.comment || '')}" />
                      </div>
                      <button type="button" class="btn btn-sm btn-primary"
                        onclick="Results.saveManualGrade('${resp.id}', '${q.id}')">Save</button>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
        <div class="modal-footer" style="padding:1rem 1.5rem; background:var(--bg-surface-subtle); border-top:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem;">
          <div>
            <button class="btn btn-secondary" onclick="Results.closeInspector()">Close</button>
          </div>
          <div style="display:flex; gap:0.5rem;">
            <button type="button" class="btn btn-outline" onclick="Results.saveDraftReview('${resp.id}')" title="Save current grading marks without finalizing">
              💾 Save Draft Review
            </button>
            <button type="button" class="btn btn-success" onclick="Results.approveAndFinalize('${resp.id}')" style="background:#10b981; border-color:#059669; color:#ffffff; font-weight:700;">
              ✓ Approve & Finalize Score
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  closeInspector() {
    document.body.classList.remove('review-modal-open');
    const prompt = document.getElementById('landscape_rotate_prompt');
    if (prompt) prompt.remove();
    document.querySelectorAll('.modal-backdrop').forEach(m => m.remove());
  }

  async quickMark(responseId, qid, earnedPoints, defaultComment) {
    const resp = this.responses.find(r => r.id === responseId);
    if (!resp) return;

    if (!resp.manualGrades) resp.manualGrades = {};
    resp.manualGrades[qid] = {
      earnedPoints: parseFloat(earnedPoints) || 0,
      comment: defaultComment || '',
      gradedAt: new Date().toISOString()
    };

    // Recalculate score immediately
    resp.scoring = ScoringEngine.calculateTotalResults(this.form, resp.answers || {}, resp.manualGrades);

    // Save to IndexedDB
    await DB.saveResponse(resp);
    await this.reloadResponses();
    this.render();

    // Re-render modal to display newly totaled scores, percentages, and grades live
    const modal = document.getElementById(`inspect_modal_${resp.id}`);
    if (modal) {
      modal.remove();
      this.inspectResponse(resp.id);
    }

    Utils.showToast(`Marked ${defaultComment} (${earnedPoints} pts). Total recalculated!`, 'success', 2000);
  }

  async saveManualGrade(responseId, qid) {
    const ptsInput = document.getElementById(`manual_pts_${qid}`);
    const commentInput = document.getElementById(`manual_comment_${qid}`);
    if (!ptsInput) return;

    const earnedPoints = parseFloat(ptsInput.value) || 0;
    const comment = commentInput ? commentInput.value.trim() : '';

    const resp = this.responses.find(r => r.id === responseId);
    if (!resp) return;

    if (!resp.manualGrades) resp.manualGrades = {};
    resp.manualGrades[qid] = {
      earnedPoints,
      comment,
      gradedAt: new Date().toISOString()
    };

    // Recalculate score
    resp.scoring = ScoringEngine.calculateTotalResults(this.form, resp.answers || {}, resp.manualGrades);

    // Save to IndexedDB
    await DB.saveResponse(resp);
    await this.reloadResponses();
    this.render();

    // Refresh modal summary KPI numbers
    const modal = document.getElementById(`inspect_modal_${resp.id}`);
    if (modal) {
      modal.remove();
      this.inspectResponse(resp.id);
    }

    Utils.showToast('Manual mark saved! Result updated.', 'success');
  }

  // Save draft review without sending notifications
  async saveDraftReview(responseId) {
    const resp = this.responses.find(r => r.id === responseId);
    if (!resp) return;

    // Collect all inputs currently open in the modal
    const questions = this.form.questions || [];
    if (!resp.manualGrades) resp.manualGrades = {};

    questions.forEach(q => {
      const ptsInput = document.getElementById(`manual_pts_${q.id}`);
      const commentInput = document.getElementById(`manual_comment_${q.id}`);
      if (ptsInput) {
        resp.manualGrades[q.id] = {
          earnedPoints: parseFloat(ptsInput.value) || 0,
          comment: commentInput ? commentInput.value.trim() : '',
          gradedAt: new Date().toISOString()
        };
      }
    });

    resp.scoring = ScoringEngine.calculateTotalResults(this.form, resp.answers || {}, resp.manualGrades);
    await DB.saveResponse(resp);
    await this.reloadResponses();
    this.render();

    // Refresh modal
    const modal = document.getElementById(`inspect_modal_${resp.id}`);
    if (modal) {
      modal.remove();
      this.inspectResponse(resp.id);
    }

    Utils.showToast('Draft review marks saved! (Not yet finalized)', 'info');
  }

  // Approve & Finalize Score (Marks submission as fully graded and triggers automated dispatch)
  async approveAndFinalize(responseId) {
    const resp = this.responses.find(r => r.id === responseId);
    if (!resp) return;

    // Collect all inputs currently open in the modal and ensure manualGrades has entries
    const questions = this.form.questions || [];
    if (!resp.manualGrades) resp.manualGrades = {};

    questions.forEach(q => {
      const ptsInput = document.getElementById(`manual_pts_${q.id}`);
      const commentInput = document.getElementById(`manual_comment_${q.id}`);
      if (ptsInput) {
        resp.manualGrades[q.id] = {
          earnedPoints: parseFloat(ptsInput.value) || 0,
          comment: commentInput ? commentInput.value.trim() : '',
          gradedAt: new Date().toISOString()
        };
      } else if (!resp.manualGrades[q.id]) {
        // Default unreviewed manual questions to 0 so they are marked as reviewed
        resp.manualGrades[q.id] = {
          earnedPoints: 0,
          comment: 'Finalized by examiner',
          gradedAt: new Date().toISOString()
        };
      }
    });

    // Recalculate total scoring
    resp.scoring = ScoringEngine.calculateTotalResults(this.form, resp.answers || {}, resp.manualGrades);
    resp.scoring.isFullyGraded = true;
    resp.scoring.pendingManualCount = 0;

    const remarkData = ScoringEngine.getRemarkForScore(resp.scoring.percentage, this.form.settings?.remarks);
    resp.scoring.grade = remarkData.grade;
    resp.scoring.remark = remarkData.text;

    await DB.saveResponse(resp);
    await this.reloadResponses();
    this.render();

    // Trigger automated multi-channel dispatch if configured
    if (window.BotDispatcherInstance) {
      BotDispatcherInstance.autoDispatchAll(this.form, resp);
    }

    // Refresh modal
    const modal = document.getElementById(`inspect_modal_${resp.id}`);
    if (modal) {
      modal.remove();
      this.inspectResponse(resp.id);
    }

    Utils.showToast(`✓ Assessment Approved & Finalized! Score: ${resp.scoring.score}/${resp.scoring.maxScore} (${resp.scoring.percentage}%) [Grade: ${resp.scoring.grade}]`, 'success', 4000);
  }

  // Update candidate contact info live
  async updateCandidateContact(responseId, field, val) {
    const resp = this.responses.find(r => r.id === responseId);
    if (!resp) return;

    const trimmed = val.trim();
    resp[field] = trimmed || 'N/A';
    
    // Also save inside answers._metadata so it persists across DB and Supabase
    if (!resp.answers) resp.answers = {};
    if (!resp.answers._metadata) resp.answers._metadata = {};
    if (field === 'respondentPhone') resp.answers._metadata.phone = trimmed || 'N/A';
    if (field === 'respondentTelegram') resp.answers._metadata.telegram = trimmed || 'N/A';

    await DB.saveResponse(resp);
    await this.reloadResponses();

    // Update input element value if present
    const phoneInput = document.getElementById(`disp_phone_${responseId}`);
    const tgInput = document.getElementById(`disp_tg_${responseId}`);
    const emailInput = document.getElementById(`disp_email_${responseId}`);
    if (phoneInput && field === 'respondentPhone') phoneInput.value = trimmed;
    if (tgInput && field === 'respondentTelegram') tgInput.value = trimmed;
    if (emailInput && field === 'respondentEmail') emailInput.value = trimmed;

    Utils.showToast(`Updated candidate ${field.replace('respondent', '')}!`, 'success');
  }

  async deleteResponse(responseId) {
    const ok = await Utils.confirmDialog({
      title: 'Delete Response',
      message: 'Are you sure you want to permanently delete this response entry?',
      confirmText: 'Delete',
      isDanger: true
    });

    if (ok) {
      // 1. Immediately remove from local memory array so UI updates instantly
      this.responses = this.responses.filter(r => r.id !== responseId);
      this.filterAndSort();
      this.render();

      // 2. Persist delete to Cloud & Local Storage
      await DB.deleteResponse(responseId);
      await this.reloadResponses();
      this.render();
      Utils.showToast('Response entry removed', 'info');
    }
  }

  exportCSV() {
    Exporter.exportResponsesCSV(this.form, this.responses);
    Utils.showToast('Responses & candidate data exported to CSV', 'success');
  }

  exportJSON() {
    const data = {
      form: this.form,
      responses: this.responses,
      exportedAt: new Date().toISOString()
    };
    Exporter.downloadFile(JSON.stringify(data, null, 2), `${this.form.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}_responses.json`, 'application/json');
    Utils.showToast('Responses exported to JSON', 'success');
  }

  // --- MULTI-CHANNEL SCORE DISPATCH (100% FREE DIRECT TO RESPONDENT) ---
  generateScoreReportText(resp) {
    const s = resp.scoring || {};
    const formTitle = this.form.title || 'Assessment';
    const name = resp.respondentName || 'Candidate';
    const statusText = s.isFullyGraded ? (s.passed ? 'PASSED ✓' : 'FAILED') : 'PENDING REVIEW';
    
    let text = `🎓 SAMSCO COMMUNICATIONS — ASSESSMENT RESULT\n\n`;
    text += `Hello ${name},\n`;
    text += `Your submission for "${formTitle}" has been graded.\n\n`;
    text += `📊 SCORE REPORT:\n`;
    text += `• Total Score: ${s.score || 0} / ${s.maxScore || 0}\n`;
    text += `• Percentage: ${s.percentage || 0}%\n`;
    text += `• Letter Grade: ${s.grade || 'N/A'}\n`;
    text += `• Result Status: ${statusText}\n`;
    text += `• Duration: ${Utils.formatTime(resp.durationSeconds || 0)}\n\n`;

    if (s.remark) {
      text += `📝 EXAMINER REMARKS:\n"${s.remark}"\n\n`;
    }

    text += `Generated securely via SamForm.`;
    return text;
  }

  async dispatchWhatsApp(responseId) {
    const resp = this.responses.find(r => r.id === responseId);
    if (!resp) return;

    // Read live input from modal if available, otherwise record
    const inputEl = document.getElementById(`disp_phone_${responseId}`);
    let rawPhone = inputEl ? inputEl.value : (resp.respondentPhone || '');
    let phone = rawPhone.replace(/[^0-9]/g, '');

    if (rawPhone && rawPhone !== resp.respondentPhone) {
      await this.updateCandidateContact(responseId, 'respondentPhone', rawPhone);
    }

    // 1. Try automated background gateway if configured
    if (window.BotDispatcherInstance) {
      const cfg = BotDispatcherInstance.getConfig();
      if (cfg.whatsappGatewayUrl && phone) {
        Utils.showToast('Sending automated WhatsApp via Gateway...', 'info');
        const res = await BotDispatcherInstance.sendWhatsAppMessage(phone, this.generateScoreReportText(resp));
        if (res.success) {
          Utils.showToast(`✓ Graded result sent to WhatsApp (+${phone})!`, 'success');
          return;
        } else if (!res.fallback) {
          console.warn('[Results] WhatsApp gateway error, opening direct chat:', res.reason);
        }
      }
    }

    // 2. Direct 1-tap WhatsApp link fallback
    const msg = this.generateScoreReportText(resp);
    const encodedMsg = encodeURIComponent(msg);

    let url = '';
    if (phone) {
      url = `https://wa.me/${phone}?text=${encodedMsg}`;
    } else {
      url = `https://api.whatsapp.com/send?text=${encodedMsg}`;
      Utils.showToast('Candidate provided no phone number. Select contact in WhatsApp.', 'info');
    }

    window.open(url, '_blank');
    Utils.showToast('Opening WhatsApp with candidate score card...', 'success');
  }

  async dispatchTelegram(responseId) {
    const resp = this.responses.find(r => r.id === responseId);
    if (!resp) return;

    const inputEl = document.getElementById(`disp_tg_${responseId}`);
    let rawTg = inputEl ? inputEl.value : (resp.respondentTelegram || '');
    let tg = rawTg.trim().replace(/^@/, '');

    if (rawTg && rawTg !== resp.respondentTelegram) {
      await this.updateCandidateContact(responseId, 'respondentTelegram', rawTg);
    }

    // 1. Try automated background Telegram Bot API if configured
    if (window.BotDispatcherInstance) {
      const cfg = BotDispatcherInstance.getConfig();
      if (cfg.telegramBotToken && tg) {
        Utils.showToast('Sending automated Telegram via Bot API...', 'info');
        const res = await BotDispatcherInstance.sendTelegramMessage(tg, this.generateScoreReportText(resp));
        if (res.success) {
          Utils.showToast(`✓ Graded result sent to Telegram (@${tg})!`, 'success');
          return;
        } else if (!res.fallback) {
          console.warn('[Results] Telegram bot notice:', res.reason);
          Utils.showToast(res.reason, 'warning', 4500);
          return;
        }
      }
    }

    // 2. Direct Telegram DM / Share fallback
    const msg = this.generateScoreReportText(resp);
    const encodedMsg = encodeURIComponent(msg);

    let url = '';
    if (tg && !tg.startsWith('+') && isNaN(tg)) {
      url = `https://t.me/${tg}`;
      navigator.clipboard.writeText(msg);
      Utils.showToast(`Opening @${tg} in Telegram. Formatted score copied to clipboard!`, 'success', 3500);
    } else {
      url = `https://t.me/share/url?url=${encodeURIComponent('https://samform.vercel.app')}&text=${encodedMsg}`;
      Utils.showToast('Opening Telegram Share...', 'success');
    }

    window.open(url, '_blank');
  }

  async dispatchEmail(responseId) {
    const resp = this.responses.find(r => r.id === responseId);
    if (!resp) return;

    const inputEl = document.getElementById(`disp_email_${responseId}`);
    let rawEmail = inputEl ? inputEl.value.trim() : (resp.respondentEmail || '');

    if (rawEmail && rawEmail !== resp.respondentEmail) {
      await this.updateCandidateContact(responseId, 'respondentEmail', rawEmail);
    }

    const email = rawEmail && rawEmail !== 'N/A' ? rawEmail : '';
    if (!email || !email.includes('@')) {
      Utils.showToast('Candidate provided no valid email address.', 'warning');
      return;
    }

    // Check if automated EmailJS is configured
    if (window.BotDispatcherInstance) {
      const cfg = BotDispatcherInstance.getConfig();
      if (cfg.emailjsServiceId && cfg.emailjsTemplateId && cfg.emailjsPublicKey) {
        Utils.showToast('Sending automated email via EmailJS...', 'info');
        const res = await BotDispatcherInstance.sendEmailJS(email, resp.respondentName || 'Candidate', this.form.title, resp.scoring, resp.durationSeconds);
        if (res.success) {
          Utils.showToast(`✓ Graded result emailed to ${email} via EmailJS!`, 'success');
          return;
        } else {
          console.warn('[Results] EmailJS dispatch error, falling back to mail client:', res.reason);
          Utils.showToast(`EmailJS Notice: ${res.reason}`, 'warning', 4000);
        }
      }
    }

    // Fallback: Launch mail client
    const subject = encodeURIComponent(`Your Results: ${this.form.title} [Grade: ${resp.scoring?.grade || 'N/A'}]`);
    const body = encodeURIComponent(this.generateScoreReportText(resp));
    const mailtoUrl = `mailto:${email}?subject=${subject}&body=${body}`;
    window.location.href = mailtoUrl;
    Utils.showToast('Launching email composer with pre-filled score...', 'success');
  }

  async dispatchAllChannels(responseId) {
    const resp = this.responses.find(r => r.id === responseId);
    if (!resp) return;

    // 1. Run automated background dispatches (WhatsApp Gateway, Telegram Bot, EmailJS)
    if (window.BotDispatcherInstance) {
      const botRes = await BotDispatcherInstance.autoDispatchAll(this.form, resp);
      let autoCount = 0;
      if (botRes.whatsapp?.success) autoCount++;
      if (botRes.telegram?.success) autoCount++;
      if (botRes.emailjs?.success) autoCount++;

      if (autoCount > 0) {
        Utils.showToast(`✓ Dispatched automatically to ${autoCount} connected channel(s)!`, 'success');
        return;
      }
    }

    // 2. If no automated bot is connected, trigger direct manual 1-tap dispatches sequentially
    let dispatched = 0;
    if (resp.respondentPhone && resp.respondentPhone !== 'N/A') {
      this.dispatchWhatsApp(responseId);
      dispatched++;
    }
    if (resp.respondentEmail && resp.respondentEmail !== 'N/A' && resp.respondentEmail.includes('@')) {
      setTimeout(() => this.dispatchEmail(responseId), 500);
      dispatched++;
    }
    if (resp.respondentTelegram && resp.respondentTelegram !== 'N/A') {
      setTimeout(() => this.dispatchTelegram(responseId), 1000);
      dispatched++;
    }

    if (dispatched === 0) {
      this.copyScoreCardText(responseId);
      Utils.showToast('No candidate contact saved. Formatted report copied to clipboard!', 'warning');
    }
  }

  copyScoreCardText(responseId) {
    const resp = this.responses.find(r => r.id === responseId);
    if (!resp) return;

    const msg = this.generateScoreReportText(resp);
    navigator.clipboard.writeText(msg);
    Utils.showToast('Formatted candidate score report copied to clipboard!', 'success');
  }
}

window.Results = new FormResults();
