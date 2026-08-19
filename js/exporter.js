/**
 * FormForge Data Exporter (JSON, CSV, Plain Text, Print/PDF)
 */

const Exporter = {
  // Trigger browser download of file
  downloadFile(content, fileName, mimeType = 'text/plain') {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  // Export form definition as clean JSON
  exportFormJSON(form) {
    const cleanForm = Utils.clone(form);
    const fileName = `${(form.title || 'form').toLowerCase().replace(/[^a-z0-9]/g, '_')}_export.json`;
    const jsonStr = JSON.stringify(cleanForm, null, 2);
    this.downloadFile(jsonStr, fileName, 'application/json');
  },

  // Export questions list as CSV
  exportQuestionsCSV(form) {
    const questions = form.questions || [];
    const rows = [
      ['Question Number', 'Type', 'Question Text', 'Options', 'Correct Answer', 'Points', 'Required', 'Explanation']
    ];

    questions.forEach((q, i) => {
      const opts = (q.options || []).join(' | ');
      const rawAns = Array.isArray(q.answer) ? q.answer.join(' | ') : (q.answer !== undefined && q.answer !== null ? q.answer : '');
      const ans = String(rawAns);
      rows.push([
        i + 1,
        q.type,
        `"${(q.question || '').replace(/"/g, '""')}"`,
        `"${opts.replace(/"/g, '""')}"`,
        `"${ans.replace(/"/g, '""')}"`,
        q.points || 1,
        q.required ? 'Yes' : 'No',
        `"${(q.explanation || '').replace(/"/g, '""')}"`
      ]);
    });

    const csvContent = rows.map(r => r.join(',')).join('\n');
    const fileName = `${(form.title || 'questions').toLowerCase().replace(/[^a-z0-9]/g, '_')}_questions.csv`;
    this.downloadFile(csvContent, fileName, 'text/csv');
  },

  // Export responses data as CSV
  exportResponsesCSV(form, responses) {
    const questions = form.questions || [];
    
    // Header
    const header = ['Response ID', 'Respondent Name', 'Email', 'Candidate ID', 'Submitted At', 'Score', 'Max Score', 'Percentage', 'Passed', 'Grade', 'Grading Status', 'Duration (sec)'];
    questions.forEach((q, i) => {
      header.push(`Q${i + 1}: ${(q.question || '').substring(0, 30)}`);
    });

    const rows = [header];

    responses.forEach((resp) => {
      const scoring = resp.scoring || {};
      const answers = resp.answers || {};
      const row = [
        resp.id,
        `"${(resp.respondentName || 'Anonymous').replace(/"/g, '""')}"`,
        `"${(resp.respondentEmail || 'N/A').replace(/"/g, '""')}"`,
        `"${(resp.respondentId || 'N/A').replace(/"/g, '""')}"`,
        resp.submittedAt,
        scoring.score || 0,
        scoring.maxScore || 0,
        `${scoring.percentage || 0}%`,
        scoring.passed ? 'Yes' : 'No',
        scoring.grade || 'N/A',
        scoring.isFullyGraded ? 'Graded' : 'Pending Manual Review',
        resp.durationSeconds || 0
      ];

      questions.forEach((q) => {
        let ansVal = answers[q.id];
        if (Array.isArray(ansVal)) ansVal = ansVal.join(' | ');
        else if (typeof ansVal === 'object' && ansVal !== null) ansVal = JSON.stringify(ansVal);
        row.push(`"${String(ansVal !== undefined ? ansVal : '').replace(/"/g, '""')}"`);
      });

      rows.push(row);
    });

    const csvContent = rows.map(r => r.join(',')).join('\n');
    const fileName = `${(form.title || 'form').toLowerCase().replace(/[^a-z0-9]/g, '_')}_responses.csv`;
    this.downloadFile(csvContent, fileName, 'text/csv');
  },

  // Export form questions as formatted plain text (Printable paper exam format)
  exportFormPlainText(form) {
    let out = `=======================================================\n`;
    out += `${(form.title || 'Assessment').toUpperCase()}\n`;
    if (form.description) out += `${form.description}\n`;
    out += `Time Allowed: ${form.timeLimit ? form.timeLimit + ' Minutes' : 'Untimed'}\n`;
    out += `=======================================================\n\n`;

    const questions = form.questions || [];
    questions.forEach((q, i) => {
      out += `Question ${i + 1} (${q.points || 1} pt${(q.points || 1) > 1 ? 's' : ''}):\n`;
      out += `${q.question}\n`;

      if (q.options && q.options.length > 0) {
        q.options.forEach((opt, idx) => {
          const letter = String.fromCharCode(65 + idx);
          out += `  [ ${letter} ] ${opt}\n`;
        });
      } else if (q.type === QuestionTypes.SHORT_ANSWER || q.type === QuestionTypes.PARAGRAPH) {
        out += `  _______________________________________________________\n`;
      }
      out += `\n`;
    });

    const fileName = `${(form.title || 'assessment').toLowerCase().replace(/[^a-z0-9]/g, '_')}_printable.txt`;
    this.downloadFile(out, fileName, 'text/plain');
  },

  // Trigger print dialog for beautiful PDF saving
  printAssessment(form) {
    window.print();
  }
};

window.Exporter = Exporter;
