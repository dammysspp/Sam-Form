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
    const formId = urlParams.get('id');

    if (!formId) {
      this.renderNoForm();
      return;
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

  renderNoForm() {
    const root = document.getElementById('results-app');
    if (root) {
      root.innerHTML = `
        <div class="empty-state-card">
          <h2>No Form Selected</h2>
          <p>Please navigate to a valid form from the dashboard to view responses.</p>
          <a href="index.html" class="btn btn-primary">Back to Dashboard</a>
        </div>
      `;
    }
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
        <div class="modal-footer" style="padding:1rem 1.5rem; background:var(--bg-surface-subtle); border-top:1px solid var(--border-color);">
          <button class="btn btn-secondary" onclick="Results.closeInspector()">Close</button>
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

    Utils.showToast('Manual mark and feedback saved!', 'success');
  }

  async deleteResponse(responseId) {
    const ok = await Utils.confirmDialog({
      title: 'Delete Response',
      message: 'Are you sure you want to permanently delete this response entry?',
      confirmText: 'Delete',
      isDanger: true
    });

    if (ok) {
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

  dispatchWhatsApp(responseId) {
    const resp = this.responses.find(r => r.id === responseId);
    if (!resp) return;

    let phone = resp.respondentPhone || '';
    phone = phone.replace(/[^0-9]/g, ''); // Clean to pure numbers

    const msg = this.generateScoreReportText(resp);
    const encodedMsg = encodeURIComponent(msg);

    let url = '';
    if (phone) {
      url = `https://api.whatsapp.com/send?phone=${phone}&text=${encodedMsg}`;
    } else {
      url = `https://api.whatsapp.com/send?text=${encodedMsg}`;
      Utils.showToast('Candidate provided no phone number. Select contact in WhatsApp.', 'info');
    }

    window.open(url, '_blank');
    Utils.showToast('Opening WhatsApp DM with candidate score card...', 'success');
  }

  dispatchTelegram(responseId) {
    const resp = this.responses.find(r => r.id === responseId);
    if (!resp) return;

    let tg = (resp.respondentTelegram || '').trim().replace(/^@/, '');
    const msg = this.generateScoreReportText(resp);
    const encodedMsg = encodeURIComponent(msg);

    let url = '';
    if (tg && !tg.startsWith('+') && isNaN(tg)) {
      // Direct user handle: open user chat or share
      url = `https://t.me/${tg}`;
      // Copy to clipboard so examiner can paste instantly in the chat
      navigator.clipboard.writeText(msg);
      Utils.showToast(`Opening @${tg} in Telegram. Formatted score copied to clipboard!`, 'success', 3500);
    } else {
      url = `https://t.me/share/url?url=${encodeURIComponent('https://samform.vercel.app')}&text=${encodedMsg}`;
      Utils.showToast('Opening Telegram Share...', 'success');
    }

    window.open(url, '_blank');
  }

  dispatchEmail(responseId) {
    const resp = this.responses.find(r => r.id === responseId);
    if (!resp) return;

    const email = resp.respondentEmail && resp.respondentEmail !== 'N/A' ? resp.respondentEmail : '';
    const subject = encodeURIComponent(`Your Results: ${this.form.title} [Grade: ${resp.scoring?.grade || 'N/A'}]`);
    const body = encodeURIComponent(this.generateScoreReportText(resp));

    const mailtoUrl = `mailto:${email}?subject=${subject}&body=${body}`;
    window.location.href = mailtoUrl;
    Utils.showToast('Launching email composer with pre-filled score...', 'success');
  }

  dispatchAllChannels(responseId) {
    const resp = this.responses.find(r => r.id === responseId);
    if (!resp) return;

    let dispatched = 0;
    if (resp.respondentPhone && resp.respondentPhone !== 'N/A') {
      this.dispatchWhatsApp(responseId);
      dispatched++;
    }
    if (resp.respondentEmail && resp.respondentEmail !== 'N/A' && resp.respondentEmail.includes('@')) {
      setTimeout(() => this.dispatchEmail(responseId), 800);
      dispatched++;
    }
    if (resp.respondentTelegram && resp.respondentTelegram !== 'N/A') {
      setTimeout(() => this.dispatchTelegram(responseId), 1600);
      dispatched++;
    }

    if (dispatched === 0) {
      this.copyScoreCardText(responseId);
      Utils.showToast('No contact saved. Formatted score report copied to clipboard!', 'warning');
    } else {
      Utils.showToast(`Broadcasting score via ${dispatched} candidate channel(s)!`, 'success');
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
