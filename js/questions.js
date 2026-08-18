/**
 * FormForge Question Types Architecture & Renderers
 */

const QuestionTypes = {
  SHORT_ANSWER: 'short_answer',
  PARAGRAPH: 'paragraph',
  MULTIPLE_CHOICE: 'multiple_choice',
  CHECKBOXES: 'checkboxes',
  DROPDOWN: 'dropdown',
  MULTIPLE_DROPDOWN: 'multiple_dropdown',
  LINEAR_SCALE: 'linear_scale',
  RATING: 'rating',
  DATE: 'date',
  TIME: 'time',
  NUMBER: 'number',
  EMAIL: 'email',
  PHONE: 'phone',
  URL: 'url',
  FILE_UPLOAD: 'file_upload',
  MATRIX: 'matrix',
  RANKING: 'ranking'
};

const QuestionTypeLabels = {
  short_answer: { label: 'Short Answer', icon: '—' },
  paragraph: { label: 'Paragraph', icon: '¶' },
  multiple_choice: { label: 'Multiple Choice', icon: '◉' },
  checkboxes: { label: 'Checkboxes', icon: '☑' },
  dropdown: { label: 'Dropdown', icon: '▾' },
  multiple_dropdown: { label: 'Multiple Dropdown', icon: '▤' },
  linear_scale: { label: 'Linear Scale', icon: '1-5' },
  rating: { label: 'Star Rating', icon: '★' },
  date: { label: 'Date', icon: '📅' },
  time: { label: 'Time', icon: '⏰' },
  number: { label: 'Number', icon: '#' },
  email: { label: 'Email', icon: '✉' },
  phone: { label: 'Phone Number', icon: '📞' },
  url: { label: 'Website URL', icon: '🔗' },
  file_upload: { label: 'File Upload', icon: '📁' },
  matrix: { label: 'Matrix / Grid', icon: '▦' },
  ranking: { label: 'Ranking', icon: '⇅' }
};

const QuestionsEngine = {
  // Create a default question object
  createDefault(type = QuestionTypes.MULTIPLE_CHOICE, sectionId = 'sec-1') {
    const q = {
      id: Utils.uid('q'),
      sectionId,
      type,
      question: 'Untitled Question',
      description: '',
      required: false,
      points: 1,
      explanation: ''
    };

    switch (type) {
      case QuestionTypes.MULTIPLE_CHOICE:
      case QuestionTypes.CHECKBOXES:
      case QuestionTypes.DROPDOWN:
      case QuestionTypes.MULTIPLE_DROPDOWN:
        q.options = ['Option 1', 'Option 2', 'Option 3'];
        q.answer = type === QuestionTypes.CHECKBOXES || type === QuestionTypes.MULTIPLE_DROPDOWN ? [] : '';
        break;
      case QuestionTypes.LINEAR_SCALE:
        q.scaleMin = 1;
        q.scaleMax = 5;
        q.minLabel = 'Poor';
        q.maxLabel = 'Excellent';
        break;
      case QuestionTypes.RATING:
        q.maxRating = 5;
        break;
      case QuestionTypes.NUMBER:
        q.min = 0;
        q.max = 100;
        break;
      case QuestionTypes.MATRIX:
        q.matrixRows = ['Row 1', 'Row 2', 'Row 3'];
        q.matrixColumns = ['Column 1', 'Column 2', 'Column 3'];
        q.matrixAnswer = {};
        break;
      case QuestionTypes.RANKING:
        q.options = ['Item 1', 'Item 2', 'Item 3', 'Item 4'];
        q.answer = ['Item 1', 'Item 2', 'Item 3', 'Item 4'];
        break;
      default:
        q.answer = '';
    }

    return q;
  },

  // ----------------------------------------------------
  // BUILDER CARD RENDERER (Admin Mode)
  // ----------------------------------------------------
  renderBuilderCard(question, index, total, sections = []) {
    const qid = question.id;
    const type = question.type;

    let typeOptionsHTML = Object.entries(QuestionTypeLabels)
      .map(([val, info]) => `<option value="${val}" ${val === type ? 'selected' : ''}>${info.icon} ${info.label}</option>`)
      .join('');

    let specificEditorHTML = '';

    // Multiple Choice / Checkboxes / Dropdowns
    if ([QuestionTypes.MULTIPLE_CHOICE, QuestionTypes.CHECKBOXES, QuestionTypes.DROPDOWN, QuestionTypes.MULTIPLE_DROPDOWN].includes(type)) {
      const options = question.options || ['Option 1'];
      const isMulti = type === QuestionTypes.CHECKBOXES || type === QuestionTypes.MULTIPLE_DROPDOWN;
      
      const optionsList = options.map((opt, optIdx) => {
        const isChecked = isMulti 
          ? (Array.isArray(question.answer) && question.answer.includes(opt))
          : question.answer === opt;

        return `
          <div class="option-row" data-opt-idx="${optIdx}">
            <label class="correct-answer-selector" title="Mark as correct answer">
              <input type="${isMulti ? 'checkbox' : 'radio'}" name="ans_${qid}" 
                ${isChecked ? 'checked' : ''} 
                onchange="Builder.setCorrectAnswer('${qid}', ${optIdx}, this.checked, ${isMulti})" />
              <span class="custom-check-bullet"></span>
            </label>
            <input type="text" class="form-input option-input" value="${Utils.escapeHTML(opt)}" 
              placeholder="Option ${optIdx + 1}"
              oninput="Builder.updateOption('${qid}', ${optIdx}, this.value)" />
            <button type="button" class="btn-icon btn-remove-opt" title="Remove Option"
              onclick="Builder.removeOption('${qid}', ${optIdx})" ${options.length <= 1 ? 'disabled' : ''}>✕</button>
          </div>
        `;
      }).join('');

      specificEditorHTML = `
        <div class="options-container" id="options_${qid}">
          <div class="options-header-hint">
            <small class="text-muted">Tip: Click the circle/checkbox on the left to set the correct answer.</small>
          </div>
          ${optionsList}
          <button type="button" class="btn btn-sm btn-outline btn-add-option" onclick="Builder.addOption('${qid}')">
            + Add Option
          </button>
        </div>
      `;
    } 
    // Linear Scale
    else if (type === QuestionTypes.LINEAR_SCALE) {
      specificEditorHTML = `
        <div class="linear-scale-config">
          <div class="scale-range-row">
            <label>Range:</label>
            <select class="form-select inline-select" onchange="Builder.updateQuestionProp('${qid}', 'scaleMin', parseInt(this.value))">
              <option value="0" ${question.scaleMin === 0 ? 'selected' : ''}>0</option>
              <option value="1" ${question.scaleMin === 1 ? 'selected' : ''}>1</option>
            </select>
            <span>to</span>
            <select class="form-select inline-select" onchange="Builder.updateQuestionProp('${qid}', 'scaleMax', parseInt(this.value))">
              <option value="5" ${question.scaleMax === 5 ? 'selected' : ''}>5</option>
              <option value="7" ${question.scaleMax === 7 ? 'selected' : ''}>7</option>
              <option value="10" ${question.scaleMax === 10 ? 'selected' : ''}>10</option>
            </select>
          </div>
          <div class="grid-2-col scale-labels">
            <div>
              <label class="form-label-sm">Min Label (Optional)</label>
              <input type="text" class="form-input form-input-sm" value="${Utils.escapeHTML(question.minLabel || '')}" 
                placeholder="e.g. Strongly Disagree" oninput="Builder.updateQuestionProp('${qid}', 'minLabel', this.value)" />
            </div>
            <div>
              <label class="form-label-sm">Max Label (Optional)</label>
              <input type="text" class="form-input form-input-sm" value="${Utils.escapeHTML(question.maxLabel || '')}" 
                placeholder="e.g. Strongly Agree" oninput="Builder.updateQuestionProp('${qid}', 'maxLabel', this.value)" />
            </div>
          </div>
        </div>
      `;
    }
    // Star Rating
    else if (type === QuestionTypes.RATING) {
      specificEditorHTML = `
        <div class="rating-config">
          <label>Number of Stars:</label>
          <select class="form-select inline-select" onchange="Builder.updateQuestionProp('${qid}', 'maxRating', parseInt(this.value))">
            <option value="3" ${question.maxRating === 3 ? 'selected' : ''}>3 Stars</option>
            <option value="5" ${question.maxRating === 5 || !question.maxRating ? 'selected' : ''}>5 Stars</option>
            <option value="10" ${question.maxRating === 10 ? 'selected' : ''}>10 Stars</option>
          </select>
        </div>
      `;
    }
    // Matrix / Grid
    else if (type === QuestionTypes.MATRIX) {
      const rows = question.matrixRows || ['Row 1', 'Row 2'];
      const cols = question.matrixColumns || ['Column 1', 'Column 2'];

      specificEditorHTML = `
        <div class="matrix-config-container">
          <div class="grid-2-col">
            <div class="matrix-sub-col">
              <label class="form-label-sm">Rows (Questions)</label>
              <div class="matrix-list" id="matrix_rows_${qid}">
                ${rows.map((r, rIdx) => `
                  <div class="matrix-item-row">
                    <span>${rIdx + 1}.</span>
                    <input type="text" class="form-input form-input-sm" value="${Utils.escapeHTML(r)}" 
                      oninput="Builder.updateMatrixRow('${qid}', ${rIdx}, this.value)" />
                    <button type="button" class="btn-icon" onclick="Builder.removeMatrixRow('${qid}', ${rIdx})" ${rows.length <= 1 ? 'disabled' : ''}>✕</button>
                  </div>
                `).join('')}
              </div>
              <button type="button" class="btn btn-sm btn-outline" onclick="Builder.addMatrixRow('${qid}')">+ Add Row</button>
            </div>
            <div class="matrix-sub-col">
              <label class="form-label-sm">Columns (Choices)</label>
              <div class="matrix-list" id="matrix_cols_${qid}">
                ${cols.map((c, cIdx) => `
                  <div class="matrix-item-row">
                    <span>${String.fromCharCode(65 + cIdx)}.</span>
                    <input type="text" class="form-input form-input-sm" value="${Utils.escapeHTML(c)}" 
                      oninput="Builder.updateMatrixCol('${qid}', ${cIdx}, this.value)" />
                    <button type="button" class="btn-icon" onclick="Builder.removeMatrixCol('${qid}', ${cIdx})" ${cols.length <= 1 ? 'disabled' : ''}>✕</button>
                  </div>
                `).join('')}
              </div>
              <button type="button" class="btn btn-sm btn-outline" onclick="Builder.addMatrixCol('${qid}')">+ Add Column</button>
            </div>
          </div>
        </div>
      `;
    }
    // Ranking
    else if (type === QuestionTypes.RANKING) {
      const items = question.options || ['Item 1', 'Item 2', 'Item 3'];
      specificEditorHTML = `
        <div class="ranking-config-container">
          <label class="form-label-sm">Items to Rank (Default Correct Sequence)</label>
          <div class="ranking-list" id="ranking_items_${qid}">
            ${items.map((it, itIdx) => `
              <div class="ranking-item-row">
                <span class="ranking-pos">${itIdx + 1}</span>
                <input type="text" class="form-input form-input-sm" value="${Utils.escapeHTML(it)}" 
                  oninput="Builder.updateOption('${qid}', ${itIdx}, this.value)" />
                <button type="button" class="btn-icon" onclick="Builder.removeOption('${qid}', ${itIdx})" ${items.length <= 2 ? 'disabled' : ''}>✕</button>
              </div>
            `).join('')}
          </div>
          <button type="button" class="btn btn-sm btn-outline" onclick="Builder.addOption('${qid}')">+ Add Item</button>
        </div>
      `;
    }
    // Text / Inputs / Numbers
    else if ([QuestionTypes.SHORT_ANSWER, QuestionTypes.EMAIL, QuestionTypes.URL, QuestionTypes.NUMBER].includes(type)) {
      specificEditorHTML = `
        <div class="text-correct-ans-row">
          <label class="form-label-sm">Accepted Answer / Keywords (Optional for auto-scoring)</label>
          <input type="text" class="form-input" value="${Utils.escapeHTML(question.answer || '')}" 
            placeholder="Type correct answer..." oninput="Builder.updateQuestionProp('${qid}', 'answer', this.value)" />
        </div>
      `;
    }

    // Section assignment dropdown if multiple sections exist
    let sectionSelectHTML = '';
    if (sections.length > 1) {
      sectionSelectHTML = `
        <div class="q-section-picker">
          <label class="form-label-sm">Section:</label>
          <select class="form-select form-select-sm" onchange="Builder.moveQuestionToSection('${qid}', this.value)">
            ${sections.map((s, sIdx) => `
              <option value="${s.id}" ${s.id === question.sectionId ? 'selected' : ''}>
                Section ${sIdx + 1}: ${Utils.escapeHTML(s.title || 'Untitled')}
              </option>
            `).join('')}
          </select>
        </div>
      `;
    }

    return `
      <div class="question-builder-card" id="q_card_${qid}" data-qid="${qid}" draggable="true" ondragstart="Builder.handleDragStart(event, '${qid}')" ondragover="Builder.handleDragOver(event)" ondrop="Builder.handleDrop(event, '${qid}')">
        <div class="q-card-drag-handle" title="Drag to reorder">⋮⋮</div>
        
        <div class="q-card-header">
          <div class="q-card-title-row">
            <span class="q-index-badge">Q${index + 1}</span>
            <input type="text" class="form-input q-title-input" value="${Utils.escapeHTML(question.question)}" 
              placeholder="Question Title / Prompt"
              oninput="Builder.updateQuestionProp('${qid}', 'question', this.value)" />
            <select class="form-select q-type-select" onchange="Builder.changeQuestionType('${qid}', this.value)">
              ${typeOptionsHTML}
            </select>
          </div>

          <input type="text" class="form-input q-desc-input" value="${Utils.escapeHTML(question.description || '')}" 
            placeholder="Description / Guidance (Optional)"
            oninput="Builder.updateQuestionProp('${qid}', 'description', this.value)" />
        </div>

        <div class="q-card-body">
          ${specificEditorHTML}
          
          <div class="q-explanation-row">
            <label class="form-label-sm">Study Mode Explanation / Feedback (Shown after answering in Quiz mode)</label>
            <textarea class="form-textarea form-textarea-sm" placeholder="Explain why the correct answer is right..." 
              oninput="Builder.updateQuestionProp('${qid}', 'explanation', this.value)">${Utils.escapeHTML(question.explanation || '')}</textarea>
          </div>
        </div>

        <div class="q-card-footer">
          <div class="q-footer-left">
            ${sectionSelectHTML}
            <div class="q-points-box">
              <label class="form-label-sm">Points:</label>
              <input type="number" min="0" max="100" class="form-input form-input-sm points-input" 
                value="${question.points !== undefined ? question.points : 1}" 
                oninput="Builder.updateQuestionProp('${qid}', 'points', parseFloat(this.value) || 0)" />
            </div>
            <label class="toggle-label">
              <input type="checkbox" ${question.required ? 'checked' : ''} 
                onchange="Builder.updateQuestionProp('${qid}', 'required', this.checked)" />
              <span>Required</span>
            </label>
          </div>

          <div class="q-footer-actions">
            <button type="button" class="btn-icon" title="Duplicate Question" onclick="Builder.duplicateQuestion('${qid}')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
            <button type="button" class="btn-icon text-danger" title="Delete Question" onclick="Builder.deleteQuestion('${qid}')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
      </div>
    `;
  },

  // ----------------------------------------------------
  // RESPONDER CARD RENDERER (Responder / Student Mode)
  // ----------------------------------------------------
  renderResponderCard(question, index, currentValue, isFlagged = false, studyFeedback = null) {
    const qid = question.id;
    const type = question.type;
    const isRequired = question.required;

    let inputHTML = '';

    // Multiple Choice
    if (type === QuestionTypes.MULTIPLE_CHOICE) {
      const opts = question.options || [];
      inputHTML = `
        <div class="responder-options-list">
          ${opts.map((opt, i) => {
            const isChecked = currentValue === opt;
            return `
              <label class="responder-option-card ${isChecked ? 'selected' : ''}">
                <input type="radio" name="resp_${qid}" value="${Utils.escapeHTML(opt)}" 
                  ${isChecked ? 'checked' : ''} 
                  onchange="Responder.handleAnswerChange('${qid}', this.value)" />
                <span class="option-indicator radio-indicator"></span>
                <span class="option-text">${Utils.escapeHTML(opt)}</span>
              </label>
            `;
          }).join('')}
        </div>
      `;
    }
    // Checkboxes
    else if (type === QuestionTypes.CHECKBOXES) {
      const opts = question.options || [];
      const currArr = Array.isArray(currentValue) ? currentValue : [];
      inputHTML = `
        <div class="responder-options-list">
          ${opts.map((opt, i) => {
            const isChecked = currArr.includes(opt);
            return `
              <label class="responder-option-card ${isChecked ? 'selected' : ''}">
                <input type="checkbox" name="resp_${qid}" value="${Utils.escapeHTML(opt)}" 
                  ${isChecked ? 'checked' : ''} 
                  onchange="Responder.handleCheckboxChange('${qid}', this.value, this.checked)" />
                <span class="option-indicator checkbox-indicator"></span>
                <span class="option-text">${Utils.escapeHTML(opt)}</span>
              </label>
            `;
          }).join('')}
        </div>
      `;
    }
    // Dropdown
    else if (type === QuestionTypes.DROPDOWN) {
      const opts = question.options || [];
      inputHTML = `
        <div class="responder-input-wrap">
          <select class="form-select responder-select" onchange="Responder.handleAnswerChange('${qid}', this.value)">
            <option value="">-- Choose an option --</option>
            ${opts.map(opt => `<option value="${Utils.escapeHTML(opt)}" ${currentValue === opt ? 'selected' : ''}>${Utils.escapeHTML(opt)}</option>`).join('')}
          </select>
        </div>
      `;
    }
    // Multiple Dropdown / Tag select
    else if (type === QuestionTypes.MULTIPLE_DROPDOWN) {
      const opts = question.options || [];
      const currArr = Array.isArray(currentValue) ? currentValue : [];
      inputHTML = `
        <div class="responder-multi-dropdown">
          <select multiple class="form-select responder-multi-select" onchange="Responder.handleMultiSelectChange('${qid}', this)">
            ${opts.map(opt => `<option value="${Utils.escapeHTML(opt)}" ${currArr.includes(opt) ? 'selected' : ''}>${Utils.escapeHTML(opt)}</option>`).join('')}
          </select>
          <small class="text-muted">Hold Ctrl / Cmd to select multiple options</small>
        </div>
      `;
    }
    // Short Answer
    else if (type === QuestionTypes.SHORT_ANSWER) {
      inputHTML = `
        <div class="responder-input-wrap">
          <input type="text" class="form-input responder-text-input" 
            placeholder="Your answer" value="${Utils.escapeHTML(currentValue || '')}" 
            oninput="Responder.handleAnswerChange('${qid}', this.value)" />
        </div>
      `;
    }
    // Paragraph
    else if (type === QuestionTypes.PARAGRAPH) {
      inputHTML = `
        <div class="responder-input-wrap">
          <textarea class="form-textarea responder-textarea" rows="4" 
            placeholder="Your detailed answer..." 
            oninput="Responder.handleAnswerChange('${qid}', this.value)">${Utils.escapeHTML(currentValue || '')}</textarea>
        </div>
      `;
    }
    // Linear Scale
    else if (type === QuestionTypes.LINEAR_SCALE) {
      const min = question.scaleMin || 1;
      const max = question.scaleMax || 5;
      const scaleNums = [];
      for (let s = min; s <= max; s++) scaleNums.push(s);

      inputHTML = `
        <div class="linear-scale-responder">
          ${question.minLabel ? `<span class="scale-label scale-min-label">${Utils.escapeHTML(question.minLabel)}</span>` : ''}
          <div class="scale-buttons-row">
            ${scaleNums.map(n => `
              <label class="scale-btn-wrap ${currentValue == n ? 'active' : ''}">
                <span class="scale-num">${n}</span>
                <input type="radio" name="scale_${qid}" value="${n}" ${currentValue == n ? 'checked' : ''} 
                  onchange="Responder.handleAnswerChange('${qid}', parseInt(this.value))" />
                <span class="scale-bullet"></span>
              </label>
            `).join('')}
          </div>
          ${question.maxLabel ? `<span class="scale-label scale-max-label">${Utils.escapeHTML(question.maxLabel)}</span>` : ''}
        </div>
      `;
    }
    // Star Rating
    else if (type === QuestionTypes.RATING) {
      const maxStars = question.maxRating || 5;
      const currentRating = parseInt(currentValue) || 0;
      let starsHTML = '';
      for (let s = 1; s <= maxStars; s++) {
        starsHTML += `
          <button type="button" class="star-btn ${s <= currentRating ? 'star-active' : ''}" 
            onclick="Responder.handleAnswerChange('${qid}', ${s})" title="${s} Stars">★</button>
        `;
      }
      inputHTML = `
        <div class="rating-stars-row">
          ${starsHTML}
          <span class="rating-text">${currentRating > 0 ? `${currentRating} of ${maxStars}` : 'Select rating'}</span>
        </div>
      `;
    }
    // Matrix / Grid
    else if (type === QuestionTypes.MATRIX) {
      const rows = question.matrixRows || ['Row 1'];
      const cols = question.matrixColumns || ['Col 1'];
      const currMatrix = currentValue && typeof currentValue === 'object' ? currentValue : {};

      inputHTML = `
        <div class="matrix-table-wrap">
          <table class="matrix-table">
            <thead>
              <tr>
                <th></th>
                ${cols.map(c => `<th>${Utils.escapeHTML(c)}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${rows.map((r, rIdx) => `
                <tr>
                  <td class="matrix-row-title">${Utils.escapeHTML(r)}</td>
                  ${cols.map(c => {
                    const isChecked = currMatrix[r] === c;
                    return `
                      <td class="matrix-cell">
                        <label class="matrix-radio-label">
                          <input type="radio" name="matrix_${qid}_${rIdx}" value="${Utils.escapeHTML(c)}" 
                            ${isChecked ? 'checked' : ''} 
                            onchange="Responder.handleMatrixChange('${qid}', '${Utils.escapeHTML(r)}', this.value)" />
                          <span class="matrix-bullet"></span>
                        </label>
                      </td>
                    `;
                  }).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }
    // Ranking
    else if (type === QuestionTypes.RANKING) {
      const items = Array.isArray(currentValue) && currentValue.length ? currentValue : (question.options || []);
      inputHTML = `
        <div class="ranking-responder-wrap" id="ranking_${qid}">
          <div class="ranking-hint">Click Up/Down arrows or drag to arrange in order:</div>
          ${items.map((item, itIdx) => `
            <div class="ranking-responder-item" data-rank-idx="${itIdx}">
              <span class="ranking-badge">${itIdx + 1}</span>
              <span class="ranking-label">${Utils.escapeHTML(item)}</span>
              <div class="ranking-controls">
                <button type="button" class="btn-rank-move" onclick="Responder.moveRankingItem('${qid}', ${itIdx}, -1)" ${itIdx === 0 ? 'disabled' : ''}>▲</button>
                <button type="button" class="btn-rank-move" onclick="Responder.moveRankingItem('${qid}', ${itIdx}, 1)" ${itIdx === items.length - 1 ? 'disabled' : ''}>▼</button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }
    // Date, Time, Number, Email, Phone, URL
    else {
      let inputType = 'text';
      if (type === QuestionTypes.DATE) inputType = 'date';
      else if (type === QuestionTypes.TIME) inputType = 'time';
      else if (type === QuestionTypes.NUMBER) inputType = 'number';
      else if (type === QuestionTypes.EMAIL) inputType = 'email';
      else if (type === QuestionTypes.PHONE) inputType = 'tel';
      else if (type === QuestionTypes.URL) inputType = 'url';

      inputHTML = `
        <div class="responder-input-wrap">
          <input type="${inputType}" class="form-input responder-text-input" 
            value="${Utils.escapeHTML(currentValue || '')}" 
            placeholder="Enter ${QuestionTypeLabels[type]?.label || 'answer'}"
            oninput="Responder.handleAnswerChange('${qid}', this.value)" />
        </div>
      `;
    }

    // Study Mode instant feedback card (if answering during Quiz/Study mode)
    let feedbackBannerHTML = '';
    if (studyFeedback) {
      const isCorrect = studyFeedback.isCorrect;
      feedbackBannerHTML = `
        <div class="study-feedback-box ${isCorrect ? 'feedback-correct' : 'feedback-incorrect'}">
          <div class="feedback-status">
            <span class="feedback-icon">${isCorrect ? '✓' : '✗'}</span>
            <strong>${isCorrect ? 'Correct!' : 'Incorrect'}</strong>
            <span class="feedback-points">(${studyFeedback.earnedPoints} / ${question.points || 1} pts)</span>
          </div>
          ${!isCorrect && studyFeedback.correctAnswer ? `
            <div class="feedback-correct-answer">
              <strong>Correct Answer:</strong> ${Utils.escapeHTML(Array.isArray(studyFeedback.correctAnswer) ? studyFeedback.correctAnswer.join(', ') : String(studyFeedback.correctAnswer))}
            </div>
          ` : ''}
          ${question.explanation ? `
            <div class="feedback-explanation">
              <strong>Explanation:</strong> ${Utils.escapeHTML(question.explanation)}
            </div>
          ` : ''}
        </div>
      `;
    }

    return `
      <div class="responder-question-card ${isFlagged ? 'flagged-card' : ''}" id="resp_card_${qid}" data-qid="${qid}">
        <div class="resp-card-header">
          <div class="resp-title-area">
            <h3 class="resp-q-title">
              <span class="resp-q-num">${index + 1}.</span>
              ${Utils.escapeHTML(question.question)}
              ${isRequired ? '<span class="required-star" title="Required">*</span>' : ''}
            </h3>
            ${question.description ? `<p class="resp-q-desc">${Utils.escapeHTML(question.description)}</p>` : ''}
          </div>
          <div class="resp-meta-actions">
            ${question.points ? `<span class="resp-points-pill">${question.points} ${question.points === 1 ? 'pt' : 'pts'}</span>` : ''}
            <button type="button" class="btn-flag ${isFlagged ? 'active' : ''}" 
              onclick="Responder.toggleFlag('${qid}')" title="${isFlagged ? 'Unflag question' : 'Flag for review'}">
              <span class="flag-icon">🚩</span> ${isFlagged ? 'Flagged' : 'Flag'}
            </button>
          </div>
        </div>

        <div class="resp-card-body">
          ${inputHTML}
          ${feedbackBannerHTML}
        </div>

        <div class="resp-card-footer">
          <button type="button" class="btn-clear-selection" onclick="Responder.clearAnswer('${qid}')">Clear answer</button>
        </div>
      </div>
    `;
  }
};

window.QuestionTypes = QuestionTypes;
window.QuestionTypeLabels = QuestionTypeLabels;
window.QuestionsEngine = QuestionsEngine;
