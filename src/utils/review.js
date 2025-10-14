/**
 * Replace {{ token }} placeholders in a template string.
 * Supported tokens today: totalVersions, totalFiles.
 */
export function applyTemplate(template, context) {
  if (!template || typeof template !== 'string') {
    return '';
  }

  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(context, key)) {
      const value = context[key];
      return value === undefined || value === null ? '' : String(value);
    }
    return match;
  });
}

/**
 * Normalise user-provided review questions into a string array.
 */
export function normalizeQuestions(questions) {
  if (!questions) {
    return [];
  }

  if (Array.isArray(questions)) {
    return questions.map((q) => q.trim()).filter(Boolean);
  }

  return questions
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Build a numbered review-section block.
 */
export function buildReviewSection(heading, questionsInput, options) {
  const {
    lineSeparator = '\n---\n',
    separator = '\n\n',
    totalVersions = 0,
    totalFiles = 0,
  } = options || {};

  const normalizedHeading =
    heading && heading.trim().length > 0 ? heading.trim() : 'Review Questions';
  const headingWithMarkdown = normalizedHeading.startsWith('#')
    ? normalizedHeading
    : `## ${normalizedHeading}`;

  const metrics = { totalVersions, totalFiles };
  const questions = normalizeQuestions(questionsInput);
  const lines =
    questions.length > 0
      ? questions.map((question, index) => {
          const rendered = applyTemplate(question, metrics);
          return `${index + 1}. ${rendered}`;
        })
      : ['1. Add your review questions in Options → Summary Template.'];

  return `${lineSeparator}\n${headingWithMarkdown}${separator}${lines.join('\n')}\n`;
}

export default {
  applyTemplate,
  normalizeQuestions,
  buildReviewSection,
};
