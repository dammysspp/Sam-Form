/**
 * FormForge JSON Importer & Bulk Validator
 */

const Importer = {
  // Validate and parse raw JSON text
  validateJSON(jsonText) {
    const errors = [];
    const warnings = [];
    let parsedData = null;

    // 1. Syntax Check
    try {
      parsedData = JSON.parse(jsonText);
    } catch (err) {
      return {
        isValid: false,
        errors: [`Invalid JSON Syntax: ${err.message}`],
        warnings: [],
        data: null
      };
    }

    if (!parsedData || typeof parsedData !== 'object') {
      return {
        isValid: false,
        errors: ['Root JSON must be an object (or array of questions).'],
        warnings: [],
        data: null
      };
    }

    // Handle array of questions vs full form object
    let questions = [];
    let formMeta = {};

    if (Array.isArray(parsedData)) {
      questions = parsedData;
      formMeta = {
        title: 'Imported Question Bank',
        description: `Imported on ${new Date().toLocaleDateString()}`
      };
    } else {
      formMeta = {
        title: parsedData.title || 'Untitled Form',
        description: parsedData.description || '',
        timeLimit: parsedData.timeLimit || 0,
        passingScore: parsedData.passingScore || 50,
        mode: parsedData.mode || 'exam',
        theme: parsedData.theme || 'indigo',
        sections: parsedData.sections || [{ id: 'sec-1', title: 'Main Section', description: '' }],
        settings: parsedData.settings || {}
      };
      questions = parsedData.questions || [];
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      errors.push('Form does not contain any questions in "questions" array.');
      return { isValid: false, errors, warnings, data: null };
    }

    const validTypes = Object.values(QuestionTypes);
    const sanitizedQuestions = [];

    // 2. Validate individual questions
    questions.forEach((q, idx) => {
      const qNum = idx + 1;
      const prefix = `Question ${qNum}:`;

      if (!q || typeof q !== 'object') {
        errors.push(`${prefix} Must be a valid object.`);
        return;
      }

      // Check text
      const questionText = q.question || q.title || q.prompt;
      if (!questionText || typeof questionText !== 'string' || !questionText.trim()) {
        errors.push(`${prefix} Missing or empty question prompt text.`);
      }

      // Check type
      let type = (q.type || 'multiple_choice').toLowerCase().replace(/\s+/g, '_');
      if (type === 'mcq') type = 'multiple_choice';
      if (type === 'multi_choice') type = 'multiple_choice';
      if (type === 'checkbox') type = 'checkboxes';
      if (type === 'scale') type = 'linear_scale';
      if (type === 'stars') type = 'rating';

      if (!validTypes.includes(type)) {
        warnings.push(`${prefix} Unknown type "${q.type}". Defaulted to "multiple_choice".`);
        type = QuestionTypes.MULTIPLE_CHOICE;
      }

      // Options check
      let options = q.options;
      if ([QuestionTypes.MULTIPLE_CHOICE, QuestionTypes.CHECKBOXES, QuestionTypes.DROPDOWN, QuestionTypes.MULTIPLE_DROPDOWN, QuestionTypes.RANKING].includes(type)) {
        if (!Array.isArray(options) || options.length === 0) {
          errors.push(`${prefix} Type "${type}" requires a non-empty "options" array.`);
          options = ['Option 1', 'Option 2'];
        } else {
          options = options.map(opt => String(opt).trim()).filter(Boolean);
          if (options.length < 2 && type !== QuestionTypes.RANKING) {
            warnings.push(`${prefix} Has fewer than 2 choices.`);
          }
        }
      }

      // Answer verification vs available options
      if (q.answer !== undefined && options && options.length > 0) {
        if (type === QuestionTypes.MULTIPLE_CHOICE || type === QuestionTypes.DROPDOWN) {
          const ansStr = String(q.answer).trim();
          if (ansStr && !options.includes(ansStr)) {
            warnings.push(`${prefix} "answer" ("${ansStr}") does not match any listed options.`);
          }
        } else if (type === QuestionTypes.CHECKBOXES || type === QuestionTypes.MULTIPLE_DROPDOWN) {
          if (Array.isArray(q.answer)) {
            const unmatched = q.answer.filter(a => !options.includes(String(a).trim()));
            if (unmatched.length > 0) {
              warnings.push(`${prefix} Some answers (${unmatched.join(', ')}) do not match listed options.`);
            }
          }
        }
      }

      // Matrix checks
      let matrixRows = q.matrixRows;
      let matrixColumns = q.matrixColumns;
      if (type === QuestionTypes.MATRIX) {
        if (!Array.isArray(matrixRows) || matrixRows.length === 0) matrixRows = ['Row 1', 'Row 2'];
        if (!Array.isArray(matrixColumns) || matrixColumns.length === 0) matrixColumns = ['Col 1', 'Col 2'];
      }

      sanitizedQuestions.push({
        id: q.id || Utils.uid('q'),
        sectionId: q.sectionId || 'sec-1',
        type,
        question: questionText || `Question ${qNum}`,
        description: q.description || '',
        options: options || undefined,
        answer: q.answer !== undefined ? q.answer : (type === QuestionTypes.CHECKBOXES ? [] : ''),
        points: typeof q.points === 'number' ? q.points : 1,
        required: Boolean(q.required),
        explanation: q.explanation || '',
        scaleMin: q.scaleMin || 1,
        scaleMax: q.scaleMax || 5,
        minLabel: q.minLabel || '',
        maxLabel: q.maxLabel || '',
        maxRating: q.maxRating || 5,
        matrixRows,
        matrixColumns
      });
    });

    const isValid = errors.length === 0;

    return {
      isValid,
      errors,
      warnings,
      data: isValid ? {
        ...formMeta,
        questions: sanitizedQuestions
      } : null
    };
  },

  // Bulk Generator (for stress-testing 500+ questions smoothly)
  generateBulkSample(count = 50) {
    const questions = [];
    const subjects = ['Mathematics', 'Science', 'History', 'Technology', 'Literature'];

    for (let i = 1; i <= count; i++) {
      const subject = subjects[i % subjects.length];
      questions.push({
        id: `bulk_q_${i}`,
        sectionId: 'sec-1',
        type: i % 4 === 0 ? 'checkboxes' : i % 3 === 0 ? 'dropdown' : 'multiple_choice',
        question: `[${subject}] Assessment item #${i}: Which of the following statements is mathematically/factually sound?`,
        options: [
          `Option Alpha for item ${i}`,
          `Option Beta for item ${i} (Verified)`,
          `Option Gamma for item ${i}`,
          `Option Delta for item ${i}`
        ],
        answer: i % 4 === 0 ? [`Option Beta for item ${i} (Verified)`] : `Option Beta for item ${i} (Verified)`,
        points: 2,
        required: true,
        explanation: `Explanation and reasoning for assessment question #${i}.`
      });
    }

    return {
      title: `Bulk Generated Assessment (${count} Questions)`,
      description: `Auto-generated high-volume test set containing ${count} questions.`,
      timeLimit: Math.max(15, Math.ceil(count * 0.75)),
      passingScore: 60,
      mode: 'exam',
      questions
    };
  }
};

window.Importer = Importer;
