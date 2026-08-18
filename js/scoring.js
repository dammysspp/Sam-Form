/**
 * FormForge Scoring & Assessment Engine (Automated + Manual Grading Support)
 */

const ScoringEngine = {
  defaultRemarks: [
    { min: 90, max: 100, grade: 'A+', text: 'Outstanding! Exceptional mastery demonstrated.' },
    { min: 80, max: 89,  grade: 'A',  text: 'Excellent performance. Great understanding.' },
    { min: 70, max: 79,  grade: 'B',  text: 'Very Good. Solid grasp of most concepts.' },
    { min: 60, max: 69,  grade: 'C',  text: 'Satisfactory. Passed, but review weaker areas.' },
    { min: 50, max: 59,  grade: 'D',  text: 'Needs Improvement. Borderline understanding.' },
    { min: 0,  max: 49,  grade: 'F',  text: 'Fail. More preparation is recommended.' }
  ],

  // Check if a question inherently requires manual grading by teacher/admin
  questionRequiresManualGrading(question) {
    if (question.requiresManualGrading) return true;
    const type = question.type;
    if (type === QuestionTypes.PARAGRAPH || type === QuestionTypes.FILE_UPLOAD) return true;
    if (type === QuestionTypes.SHORT_ANSWER && (!question.answer || !question.answer.trim())) return true;
    return false;
  },

  // Evaluate a single question response
  evaluateQuestion(question, userResponse, negativeMarking = 0, manualGradeOverride = null) {
    const type = question.type;
    const maxPoints = parseFloat(question.points) || 1;
    const correctAnswer = question.answer;

    const isUnanswered = userResponse === undefined || userResponse === null || userResponse === '' ||
      (Array.isArray(userResponse) && userResponse.length === 0) ||
      (typeof userResponse === 'object' && Object.keys(userResponse).length === 0);

    if (isUnanswered) {
      return {
        isUnanswered: true,
        isCorrect: false,
        earnedPoints: 0,
        maxPoints,
        correctAnswer,
        userResponse: null,
        needsManualReview: false,
        feedback: 'Unanswered'
      };
    }

    // Check if manual override score exists from examiner
    if (manualGradeOverride && manualGradeOverride.earnedPoints !== undefined) {
      const earned = Math.min(maxPoints, Math.max(0, parseFloat(manualGradeOverride.earnedPoints) || 0));
      return {
        isUnanswered: false,
        isCorrect: earned === maxPoints,
        earnedPoints: Math.round(earned * 100) / 100,
        maxPoints,
        correctAnswer,
        userResponse,
        needsManualReview: false,
        manualGraded: true,
        manualComment: manualGradeOverride.comment || '',
        explanation: question.explanation || ''
      };
    }

    // Check if question requires manual review
    const needsManualReview = this.questionRequiresManualGrading(question);
    if (needsManualReview) {
      return {
        isUnanswered: false,
        isCorrect: false,
        earnedPoints: 0,
        maxPoints,
        correctAnswer,
        userResponse,
        needsManualReview: true,
        manualGraded: false,
        explanation: question.explanation || ''
      };
    }

    let isCorrect = false;
    let earnedPoints = 0;

    // Multiple Choice / Dropdown / Simple match
    if ([QuestionTypes.MULTIPLE_CHOICE, QuestionTypes.DROPDOWN, QuestionTypes.SHORT_ANSWER, QuestionTypes.NUMBER, QuestionTypes.EMAIL, QuestionTypes.URL].includes(type)) {
      if (typeof correctAnswer === 'string' && typeof userResponse === 'string') {
        isCorrect = userResponse.trim().toLowerCase() === correctAnswer.trim().toLowerCase();
      } else {
        isCorrect = userResponse == correctAnswer;
      }
      earnedPoints = isCorrect ? maxPoints : (negativeMarking ? -Math.abs(negativeMarking) : 0);
    }
    // Checkboxes / Multi-select (with partial credit)
    else if (type === QuestionTypes.CHECKBOXES || type === QuestionTypes.MULTIPLE_DROPDOWN) {
      const correctArr = Array.isArray(correctAnswer) ? correctAnswer : [correctAnswer];
      const userArr = Array.isArray(userResponse) ? userResponse : [userResponse];

      const correctSelected = userArr.filter(item => correctArr.includes(item)).length;
      const incorrectSelected = userArr.filter(item => !correctArr.includes(item)).length;

      if (correctArr.length > 0) {
        if (correctSelected === correctArr.length && incorrectSelected === 0) {
          isCorrect = true;
          earnedPoints = maxPoints;
        } else if (correctSelected > 0 && incorrectSelected === 0) {
          isCorrect = false;
          earnedPoints = (correctSelected / correctArr.length) * maxPoints;
        } else {
          isCorrect = false;
          earnedPoints = negativeMarking ? -Math.abs(negativeMarking) : 0;
        }
      }
    }
    // Matrix / Grid
    else if (type === QuestionTypes.MATRIX) {
      const rows = question.matrixRows || [];
      const userMatrix = typeof userResponse === 'object' ? userResponse : {};
      const answerMatrix = question.matrixAnswer || {};

      let correctRows = 0;
      rows.forEach(r => {
        if (answerMatrix[r] && userMatrix[r] === answerMatrix[r]) correctRows++;
      });

      if (rows.length > 0) {
        const ratio = correctRows / rows.length;
        isCorrect = ratio === 1;
        earnedPoints = ratio * maxPoints;
      }
    }
    // Ranking
    else if (type === QuestionTypes.RANKING) {
      const correctSeq = Array.isArray(correctAnswer) ? correctAnswer : (question.options || []);
      const userSeq = Array.isArray(userResponse) ? userResponse : [];

      if (userSeq.length === correctSeq.length) {
        let matching = 0;
        for (let i = 0; i < correctSeq.length; i++) {
          if (userSeq[i] === correctSeq[i]) matching++;
        }
        const ratio = matching / correctSeq.length;
        isCorrect = ratio === 1;
        earnedPoints = ratio * maxPoints;
      }
    }
    else {
      isCorrect = true;
      earnedPoints = maxPoints;
    }

    earnedPoints = Math.round(earnedPoints * 100) / 100;

    return {
      isUnanswered: false,
      isCorrect,
      earnedPoints,
      maxPoints,
      correctAnswer,
      userResponse,
      needsManualReview: false,
      explanation: question.explanation || ''
    };
  },

  // Calculate full assessment results
  calculateTotalResults(form, responses, manualGrades = {}) {
    const questions = form.questions || [];
    const settings = form.settings || {};
    const negativeMarking = settings.negativeMarking || 0;
    const passingScore = parseFloat(form.passingScore) || 50;

    let totalEarned = 0;
    let totalMax = 0;
    let correctCount = 0;
    let incorrectCount = 0;
    let unansweredCount = 0;
    let pendingManualCount = 0;
    const breakdown = {};

    questions.forEach((q) => {
      const userAns = responses[q.id];
      const manualOverride = manualGrades[q.id];
      const evalResult = this.evaluateQuestion(q, userAns, negativeMarking, manualOverride);
      breakdown[q.id] = evalResult;

      totalMax += evalResult.maxPoints;
      totalEarned += evalResult.earnedPoints;

      if (evalResult.isUnanswered) {
        unansweredCount++;
      } else if (evalResult.needsManualReview) {
        pendingManualCount++;
      } else if (evalResult.isCorrect) {
        correctCount++;
      } else {
        incorrectCount++;
      }
    });

    totalEarned = Math.max(0, totalEarned);
    const percentage = totalMax > 0 ? Math.round((totalEarned / totalMax) * 1000) / 10 : 0;
    const passed = percentage >= passingScore;
    const isFullyGraded = pendingManualCount === 0;

    const remarkData = this.getRemarkForScore(percentage, settings.remarks);

    return {
      score: totalEarned,
      maxScore: totalMax,
      percentage,
      passed,
      passingScore,
      correctCount,
      incorrectCount,
      unansweredCount,
      pendingManualCount,
      isFullyGraded,
      totalQuestions: questions.length,
      grade: isFullyGraded ? remarkData.grade : 'PENDING',
      remark: isFullyGraded ? remarkData.text : 'Assessment has questions pending manual examiner review.',
      breakdown
    };
  },

  getRemarkForScore(percentage, customRemarks) {
    const remarksList = (customRemarks && customRemarks.length > 0) ? customRemarks : this.defaultRemarks;
    for (const r of remarksList) {
      if (percentage >= r.min && percentage <= (r.max !== undefined ? r.max : 100)) {
        return {
          grade: r.grade || this._percentageToGrade(percentage),
          text: r.text || ''
        };
      }
    }
    return {
      grade: this._percentageToGrade(percentage),
      text: percentage >= 50 ? 'Well done on completing the assessment.' : 'Keep practicing to improve.'
    };
  },

  _percentageToGrade(pct) {
    if (pct >= 90) return 'A+';
    if (pct >= 80) return 'A';
    if (pct >= 70) return 'B';
    if (pct >= 60) return 'C';
    if (pct >= 50) return 'D';
    return 'F';
  }
};

window.ScoringEngine = ScoringEngine;
