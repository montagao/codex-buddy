const DEFAULT_SUMMARY_TEMPLATE = `# Codex Buddy Review Summary

Collected {{totalVersions}} PR versions with {{totalFiles}} total file changes`;

const DEFAULT_SUMMARIES_ONLY_TEMPLATE = `# Codex Buddy Summaries
Collected {{totalVersions}} PR versions`;

const DEFAULT_REVIEW_HEADING = 'Review Questions';
const DEFAULT_REVIEW_QUESTIONS = [
  'Which of these PRs solves the task at hand the best and why?',
  'What additional inputs or BLOCKERS do you foresee?',
  'Are there any potential issues or improvements to consider?',
];
const DEFAULT_REVIEW_QUESTIONS_TEXT = DEFAULT_REVIEW_QUESTIONS.join('\n');

const elements = {
  currentVersionOnly: document.getElementById('currentVersionOnly'),
  includeReviewQuestions: document.getElementById('includeReviewQuestions'),
  summaryTemplate: document.getElementById('summaryTemplate'),
  summariesOnlyTemplate: document.getElementById('summariesOnlyTemplate'),
  reviewHeading: document.getElementById('reviewHeading'),
  reviewQuestions: document.getElementById('reviewQuestions'),
  saveStatus: document.getElementById('saveStatus'),
  version: document.getElementById('extensionVersion'),
};

// Populate extension version in footer
if (elements.version) {
  const manifest = chrome.runtime.getManifest();
  elements.version.textContent = manifest.version_name || manifest.version;
}

// Load saved options with defaults
chrome.storage.sync.get(
  {
    currentVersionOnly: false,
    includeReviewQuestions: true,
    compactMode: false,
    summaryTemplate: DEFAULT_SUMMARY_TEMPLATE,
    summariesOnlyTemplate: DEFAULT_SUMMARIES_ONLY_TEMPLATE,
    reviewHeading: DEFAULT_REVIEW_HEADING,
    reviewQuestions: DEFAULT_REVIEW_QUESTIONS_TEXT,
  },
  (items) => {
    elements.currentVersionOnly.checked = items.currentVersionOnly;
    elements.includeReviewQuestions.checked = items.includeReviewQuestions;
    elements.summaryTemplate.value = items.summaryTemplate || DEFAULT_SUMMARY_TEMPLATE;
    elements.summariesOnlyTemplate.value =
      items.summariesOnlyTemplate || DEFAULT_SUMMARIES_ONLY_TEMPLATE;
    elements.reviewHeading.value = items.reviewHeading || DEFAULT_REVIEW_HEADING;
    elements.reviewQuestions.value = items.reviewQuestions || DEFAULT_REVIEW_QUESTIONS_TEXT;

    if (items.compactMode) {
      chrome.storage.sync.set({ compactMode: false });
    }
  }
);

function showSaveToast() {
  if (!elements.saveStatus) return;
  elements.saveStatus.classList.add('show');
  clearTimeout(showSaveToast._timeout);
  showSaveToast._timeout = setTimeout(() => {
    elements.saveStatus.classList.remove('show');
  }, 2000);
}

function collectOptions() {
  return {
    currentVersionOnly: elements.currentVersionOnly.checked,
    includeReviewQuestions: elements.includeReviewQuestions.checked,
    compactMode: false,
    summaryTemplate: (elements.summaryTemplate.value || '').trim() || DEFAULT_SUMMARY_TEMPLATE,
    summariesOnlyTemplate:
      (elements.summariesOnlyTemplate.value || '').trim() || DEFAULT_SUMMARIES_ONLY_TEMPLATE,
    reviewHeading: (elements.reviewHeading.value || '').trim() || DEFAULT_REVIEW_HEADING,
    reviewQuestions: (elements.reviewQuestions.value || '').trim() || DEFAULT_REVIEW_QUESTIONS_TEXT,
  };
}

function saveOptions() {
  const options = collectOptions();
  chrome.storage.sync.set(options, showSaveToast);
}

let saveDebounce = null;
function scheduleSave() {
  clearTimeout(saveDebounce);
  saveDebounce = setTimeout(saveOptions, 350);
}

// Checkbox listeners
elements.currentVersionOnly.addEventListener('change', saveOptions);
elements.includeReviewQuestions.addEventListener('change', saveOptions);

// Template textareas
elements.summaryTemplate.addEventListener('input', scheduleSave);
elements.summariesOnlyTemplate.addEventListener('input', scheduleSave);
elements.reviewHeading.addEventListener('input', scheduleSave);
elements.reviewQuestions.addEventListener('input', scheduleSave);

// Reset handler
document.getElementById('resetDefaults').addEventListener('click', () => {
  elements.currentVersionOnly.checked = false;
  elements.includeReviewQuestions.checked = true;
  elements.summaryTemplate.value = DEFAULT_SUMMARY_TEMPLATE;
  elements.summariesOnlyTemplate.value = DEFAULT_SUMMARIES_ONLY_TEMPLATE;
  elements.reviewHeading.value = DEFAULT_REVIEW_HEADING;
  elements.reviewQuestions.value = DEFAULT_REVIEW_QUESTIONS_TEXT;
  saveOptions();
});
