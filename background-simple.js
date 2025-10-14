// Simple background script that shows results in a popup
console.log('Background script loaded');

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

chrome.action.onClicked.addListener(async (tab) => {
  console.log('Extension clicked on tab:', tab.url);

  // Check if we're on a valid Codex page
  if (!tab.url || !tab.url.includes('chatgpt.com/codex/tasks/')) {
    console.error('Not on a Codex task page');
    await showInformationalOverlay(tab.id);
    return;
  }

  try {
    const brandIcon = chrome.runtime.getURL('assets/brand-mark.svg');
    await showResultsPopup('', brandIcon, tab.id, true, 'Fetching Codex versions and metadata…');

    const summary = await collectSummaryFromTab(tab.id);

    await showResultsPopup('', brandIcon, tab.id, true, 'Caching summary for quick reopen…');
    try {
      await saveContentToStorage(summary);
    } catch (storageError) {
      console.warn('Failed to cache summary for popup:', storageError);
    }

    // Update overlay with the results
    await showResultsPopup(
      summary,
      brandIcon,
      tab.id,
      false,
      'Summary ready. Review, edit, or export.'
    );
  } catch (error) {
    console.error('Failed to collect PRs:', error);
    try {
      const brandIcon = chrome.runtime.getURL('assets/brand-mark.svg');
      await showResultsPopup(
        'We were unable to collect the summary. Try refreshing the Codex tab and running the extension again.',
        brandIcon,
        tab.id,
        false,
        'Collection failed. Review the on-page logs.'
      );
    } catch (overlayError) {
      console.warn('Unable to update overlay with error state:', overlayError);
    }
    chrome.notifications.create({
      type: 'basic',
      iconUrl: '/icon.png',
      title: 'Error',
      message: 'Failed to collect PR information. Check console for details.',
    });
  }
});

let lastCodexTabId = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'COLLECT_SUMMARY') {
    (async () => {
      try {
        const tab = await getActiveCodexTab();
        if (!tab) {
          sendResponse({
            ok: false,
            error: 'Open this popup on a Codex task page to collect the summary.',
          });
          return;
        }

        const brandIcon = chrome.runtime.getURL('assets/brand-mark.svg');
        await showResultsPopup(
          '',
          brandIcon,
          tab.id,
          true,
          'Fetching Codex versions and metadata…'
        );

        const summary = await collectSummaryFromTab(tab.id);
        await showResultsPopup('', brandIcon, tab.id, true, 'Caching summary for quick reopen…');
        await saveContentToStorage(summary);
        await showResultsPopup(
          summary,
          brandIcon,
          tab.id,
          false,
          'Summary ready. Review, edit, or export.'
        );
        sendResponse({ ok: true, payload: summary });
      } catch (error) {
        console.error('Failed to collect PRs via popup request:', error);
        sendResponse({ ok: false, error: error.message || 'Failed to collect PR information.' });
      }
    })();
    return true;
  }

  if (message?.type === 'SHOW_OVERLAY') {
    (async () => {
      try {
        const tab = await getActiveCodexTab();
        if (!tab) {
          sendResponse({ ok: false, error: 'Open the Codex task page to view the full summary.' });
          return;
        }

        let summary = await getCachedSummary();
        if (!summary) {
          const brandIcon = chrome.runtime.getURL('assets/brand-mark.svg');
          await showResultsPopup(
            '',
            brandIcon,
            tab.id,
            true,
            'Fetching Codex versions and metadata…'
          );
          summary = await collectSummaryFromTab(tab.id);
          await showResultsPopup('', brandIcon, tab.id, true, 'Caching summary for quick reopen…');
          await saveContentToStorage(summary);
          await showResultsPopup(
            summary,
            brandIcon,
            tab.id,
            false,
            'Summary ready. Review, edit, or export.'
          );
          sendResponse({ ok: true });
          return;
        }

        const brandIcon = chrome.runtime.getURL('assets/brand-mark.svg');
        await showResultsPopup(
          summary,
          brandIcon,
          tab.id,
          false,
          'Summary ready. Review, edit, or export.'
        );
        sendResponse({ ok: true });
      } catch (error) {
        console.error('Failed to open overlay:', error);
        sendResponse({
          ok: false,
          error: error.message || 'Unable to open the full summary view.',
        });
      }
    })();
    return true;
  }

  if (message?.type === 'OPEN_OPTIONS') {
    chrome.runtime
      .openOptionsPage()
      .then(() => {
        sendResponse({ ok: true });
      })
      .catch((error) => {
        console.error('Failed to open options page:', error);
        sendResponse({ ok: false, error: error?.message || String(error) });
      });
    return true;
  }
});

async function collectPRsWithDiffs(
  defaultSummaryTemplate,
  defaultSummariesOnlyTemplate,
  defaultReviewHeading,
  defaultReviewQuestions
) {
  console.log('Starting PR collection with diffs...');
  const broadcastProgress = (stage) => {
    try {
      console.debug('[CodexCollect] progress', stage);
      const event = new CustomEvent('CODEX_OVERLAY_PROGRESS', { detail: { stage } });
      window.dispatchEvent(event);
    } catch (err) {
      console.debug('Progress broadcast skipped:', err?.message || err);
    }
  };

  broadcastProgress('Scanning Codex interface for version tabs…');

  // Get options from storage
  const summaryTemplateDefault =
    typeof defaultSummaryTemplate === 'string' && defaultSummaryTemplate.trim().length > 0
      ? defaultSummaryTemplate
      : '# Codex Buddy Review Summary\n\nCollected {{totalVersions}} PR versions with {{totalFiles}} total file changes';
  const summariesOnlyTemplateDefault =
    typeof defaultSummariesOnlyTemplate === 'string' &&
    defaultSummariesOnlyTemplate.trim().length > 0
      ? defaultSummariesOnlyTemplate
      : '# Codex Buddy Summaries\n\nCollected {{totalVersions}} PR versions';
  const reviewHeadingDefault =
    typeof defaultReviewHeading === 'string' && defaultReviewHeading.trim().length > 0
      ? defaultReviewHeading.trim()
      : 'Review Questions';
  const reviewQuestionsDefault =
    typeof defaultReviewQuestions === 'string' && defaultReviewQuestions.trim().length > 0
      ? defaultReviewQuestions
      : DEFAULT_REVIEW_QUESTIONS_TEXT;

  const applyTemplateInPage = (template, context) => {
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
  };

  const normalizeQuestionsInPage = (questions) => {
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
  };

  const buildReviewSectionInPage = (heading, questionsInput, context) => {
    const {
      lineSeparator = '\n---\n',
      separator = '\n\n',
      totalVersions = 0,
      totalFiles = 0,
    } = context || {};

    const normalizedHeading =
      heading && heading.trim().length > 0 ? heading.trim() : 'Review Questions';
    const headingWithMarkdown = normalizedHeading.startsWith('#')
      ? normalizedHeading
      : `## ${normalizedHeading}`;

    const metrics = { totalVersions, totalFiles };
    const questions = normalizeQuestionsInPage(questionsInput);
    const lines =
      questions.length > 0
        ? questions.map((question, index) => {
            const rendered = applyTemplateInPage(question, metrics);
            return `${index + 1}. ${rendered}`;
          })
        : ['1. Add your review questions in Options → Summary Template.'];

    return `${lineSeparator}\n${headingWithMarkdown}${separator}${lines.join('\n')}\n`;
  };

  const options = await new Promise((resolve) => {
    chrome.storage.sync.get(
      {
        currentVersionOnly: false,
        includeReviewQuestions: true,
        compactMode: false,
        summaryTemplate: summaryTemplateDefault,
        summariesOnlyTemplate: summariesOnlyTemplateDefault,
        reviewHeading: reviewHeadingDefault,
        reviewQuestions: reviewQuestionsDefault,
      },
      resolve
    );
  });
  options.summariesOnly = false;
  options.includeTesting = true;

  console.log('Using options:', options);

  // Find version buttons - look for unique ones
  const allButtons = [...document.querySelectorAll('button')].filter(
    (btn) =>
      btn.textContent?.includes('Version') ||
      btn.textContent?.match(/^V\d+$/) ||
      btn.textContent?.match(/^PR\s*\d+$/)
  );

  console.log(`Found ${allButtons.length} total version buttons`);
  broadcastProgress(`Found ${allButtons.length} possible version tabs. De-duplicating…`);

  // Deduplicate by button text - keep first occurrence of each version
  const uniqueVersions = new Map();
  allButtons.forEach((btn) => {
    const text = btn.textContent?.trim();
    if (text && !uniqueVersions.has(text)) {
      uniqueVersions.set(text, btn);
    }
  });

  let buttons = Array.from(uniqueVersions.values());
  console.log(`Found ${buttons.length} unique version buttons:`, Array.from(uniqueVersions.keys()));
  broadcastProgress(
    `Preparing to capture ${buttons.length || 1} version${buttons.length === 1 ? '' : 's'}…`
  );

  // If currentVersionOnly is enabled, only process the current version
  if (options.currentVersionOnly) {
    console.log('Current version only mode enabled');
    broadcastProgress('Capturing the currently visible version…');
    // The current version is already displayed, so we don't need to click any buttons
    buttons = []; // Empty array means we'll only collect the current view
  }

  const results = [];

  // Helper to get current content including diffs
  async function getCurrentContent(options) {
    const content = {
      task: '',
      summary: '',
      testing: '',
      files: [],
    };

    // Wait a bit for content to stabilize
    await new Promise((resolve) => setTimeout(resolve, 800));
    broadcastProgress('Extracting summary and testing notes…');

    // Try to find the original task
    const taskElement = document.querySelector(
      'div.self-end.bg-token-bg-tertiary div.px-4.text-sm.break-words.whitespace-pre-wrap'
    );
    if (taskElement) {
      content.task = taskElement.textContent?.trim() || '';
      console.log('Found task:', content.task.substring(0, 100) + '...');
    } else {
      // Fallback: look for any element that might contain the task
      const possibleTaskElements = document.querySelectorAll('div.whitespace-pre-wrap');
      for (const el of possibleTaskElements) {
        const text = el.textContent?.trim() || '';
        // Tasks often start with imperative verbs or contain specific patterns
        if (
          text.length > 50 &&
          text.length < 5000 &&
          (text.match(/^(create|add|implement|fix|update|build|make|write|design|develop)/i) ||
            text.includes('endpoint') ||
            text.includes('function') ||
            text.includes('page'))
        ) {
          content.task = text;
          console.log('Found task via fallback:', text.substring(0, 100) + '...');
          break;
        }
      }
    }

    // Look for the markdown content div
    const markdownDiv = document.querySelector(
      'div.p-0\\!.px-4.text-sm.leading-5.markdown.prose.dark\\:prose-invert.w-full.break-words.light'
    );

    if (markdownDiv) {
      // Find Summary section
      const summaryP = [...markdownDiv.querySelectorAll('p, strong')].find(
        (el) => el.textContent?.trim().toLowerCase() === 'summary'
      );

      if (summaryP) {
        const summaryParts = [];
        let nextEl = summaryP.closest('p')?.nextElementSibling || summaryP.nextElementSibling;

        while (nextEl) {
          // Stop if we hit Testing or another section
          if (
            nextEl.textContent?.trim().toLowerCase() === 'testing' ||
            (nextEl.querySelector &&
              nextEl.querySelector('strong')?.textContent?.trim().toLowerCase() === 'testing')
          ) {
            break;
          }

          // Collect text from p and li elements
          if (nextEl.tagName === 'UL' || nextEl.tagName === 'OL') {
            const listItems = nextEl.querySelectorAll('li');
            listItems.forEach((li) => {
              const text = li.textContent?.trim();
              if (text) {
                // Add bullet point for unordered lists, number for ordered lists
                if (nextEl.tagName === 'UL') {
                  summaryParts.push(`• ${text}`);
                } else {
                  summaryParts.push(`${Array.from(listItems).indexOf(li) + 1}. ${text}`);
                }
              }
            });
          } else if (nextEl.tagName === 'P' && nextEl.textContent?.trim()) {
            summaryParts.push(nextEl.textContent.trim());
          }

          nextEl = nextEl.nextElementSibling;
        }

        content.summary = summaryParts.join('\n');
      }

      // Find Testing section
      const testingP = [...markdownDiv.querySelectorAll('p, strong')].find(
        (el) => el.textContent?.trim().toLowerCase() === 'testing'
      );

      if (testingP && options.includeTesting) {
        const testingParts = [];
        let nextEl = testingP.closest('p')?.nextElementSibling || testingP.nextElementSibling;

        while (nextEl) {
          // Stop if we hit Notes or another section
          if (
            nextEl.textContent?.trim().toLowerCase() === 'notes' ||
            (nextEl.querySelector &&
              nextEl.querySelector('strong')?.textContent?.trim().toLowerCase() === 'notes')
          ) {
            break;
          }

          // Collect text from p and li elements
          if (nextEl.tagName === 'UL' || nextEl.tagName === 'OL') {
            const listItems = nextEl.querySelectorAll('li');
            listItems.forEach((li) => {
              const text = li.textContent?.trim();
              if (text) {
                // Add bullet point for unordered lists, number for ordered lists
                if (nextEl.tagName === 'UL') {
                  testingParts.push(`• ${text}`);
                } else {
                  testingParts.push(`${Array.from(listItems).indexOf(li) + 1}. ${text}`);
                }
              }
            });
          } else if (nextEl.tagName === 'P' && nextEl.textContent?.trim()) {
            testingParts.push(nextEl.textContent.trim());
          }

          nextEl = nextEl.nextElementSibling;
        }

        content.testing = testingParts.join('\n');
      }
    }

    // Fallback to old method if markdown div not found
    if (!content.summary) {
      const summaryHeading = [...document.querySelectorAll('h2, h3, h4, p strong')].find((h) =>
        h.textContent?.toLowerCase().includes('summary')
      );
      if (summaryHeading) {
        let nextEl =
          summaryHeading.parentElement?.nextElementSibling || summaryHeading.nextElementSibling;
        const summaryParts = [];
        while (
          nextEl &&
          !['H2', 'H3', 'H4'].includes(nextEl.tagName) &&
          !nextEl.textContent?.toLowerCase().includes('testing')
        ) {
          if (nextEl.textContent?.trim()) {
            summaryParts.push(nextEl.textContent.trim());
          }
          nextEl = nextEl.nextElementSibling;
        }
        content.summary = summaryParts.join('\n');
      }
    }

    // Find file diffs - targeting the specific structure
    broadcastProgress('Collecting code diffs and file changes…');
    console.log('Looking for file diffs...');

    // Create a map to track unique diffs
    const uniqueDiffs = new Map();

    // Look for diff containers with data-diff-header attribute
    const diffContainers = document.querySelectorAll('[data-diff-header]');
    console.log(`Found ${diffContainers.length} diff containers with data-diff-header`);

    if (diffContainers.length > 0) {
      // Process each diff container
      diffContainers.forEach((container, idx) => {
        // Get filename from data-diff-header attribute
        const fileName = container.getAttribute('data-diff-header');
        console.log(`Processing diff ${idx + 1}: ${fileName}`);

        // Find the diff content - look for the table with diff lines
        const diffTable = container.querySelector('table.unified-diff-table');
        let diffContent = '';

        if (diffTable) {
          // Extract the diff content from the table rows
          const diffLines = diffTable.querySelectorAll('tr.diff-line');
          const lines = [];

          diffLines.forEach((line) => {
            // Get the line content
            const contentCell = line.querySelector('.diff-line-content');
            if (contentCell) {
              const operator =
                contentCell.querySelector('.diff-line-content-operator')?.textContent || '';
              const content = contentCell.querySelector('.diff-line-syntax-raw')?.textContent || '';
              if (operator || content) {
                lines.push(operator + content);
              }
            }
          });

          diffContent = lines.join('');
          console.log(`Extracted ${lines.length} lines for ${fileName}`);
        } else {
          // Fallback: get all text content from the container
          diffContent = container.textContent?.trim() || '';
        }

        if (diffContent && fileName) {
          uniqueDiffs.set(fileName, {
            name: fileName,
            patch: diffContent,
          });
        }
      });
    } else {
      // Fallback to the old method
      console.log('No data-diff-header containers found, using fallback method...');

      // First, let's try to get filenames from the file list structure
      const fileButtons = document.querySelectorAll(
        'div.bg-token-bg-primary.flex.flex-col.rounded-2xl.border.border-token-border-heavy.outline-2 ul li span button'
      );
      const fileNames = Array.from(fileButtons)
        .map((btn) => btn.textContent?.trim())
        .filter(Boolean);
      console.log(`Found ${fileNames.length} file names from buttons:`, fileNames);

      // Also try a more general selector for file buttons
      if (fileNames.length === 0) {
        const altFileButtons = document.querySelectorAll('button');
        altFileButtons.forEach((btn) => {
          const text = btn.textContent?.trim() || '';
          // Look for buttons that contain file extensions
          if (text.match(/\.(js|ts|jsx|tsx|json|py|md|css|scss|html|xml)$/)) {
            fileNames.push(text);
          }
        });
        console.log(`Found ${fileNames.length} file names from alt search:`, fileNames);
      }

      // Strategy 1: Look for parent containers of diff elements
      const diffContainerSet = new Set();

      // Find elements with class containing 'diff' but filter to get containers
      const diffElements = document.querySelectorAll('[class*="diff"]');
      console.log(`Found ${diffElements.length} elements with diff class`);

      // Group diff elements by their container
      diffElements.forEach((el) => {
        // Find the container that holds a complete diff block
        let container = el;
        while (container && container.parentElement) {
          const parent = container.parentElement;
          const siblings = Array.from(parent.children);

          // If parent has many children with diff class, it's likely the container
          const diffChildren = siblings.filter((s) => s.className && s.className.includes('diff'));
          if (diffChildren.length > 5) {
            diffContainerSet.add(parent);
            break;
          }
          container = parent;
        }
      });

      console.log(`Found ${diffContainerSet.size} diff containers`);

      // Process each container
      let containerIndex = 0;
      const diffArray = Array.from(diffContainerSet);

      diffArray.forEach((container, idx) => {
        const text = container.textContent?.trim() || '';

        // Skip if too small
        if (text.length < 100) return;

        containerIndex++;

        // Look for filename
        let fileName = null;

        // First, check if we have a corresponding filename from the file buttons
        if (fileNames.length > idx) {
          fileName = fileNames[idx];
          console.log(`Using filename from button list: ${fileName}`);
        }

        // If not found, check if there's a filename element before this container
        if (!fileName) {
          let prevEl = container.previousElementSibling;
          let searchDepth = 0;
          while (prevEl && searchDepth < 5 && !fileName) {
            const prevText = prevEl.textContent?.trim() || '';
            if (prevText.length < 100) {
              // Short text that might be a filename
              const fileMatch = prevText.match(
                /\b([^\s]+\.(js|ts|jsx|tsx|json|py|md|css|scss|html|xml))\b/
              );
              if (fileMatch) {
                fileName = fileMatch[1];
                console.log(`Found filename in previous element: ${fileName}`);
                break;
              }
            }
            prevEl = prevEl.previousElementSibling;
            searchDepth++;
          }
        }

        // Check for filename patterns in the text
        if (!fileName) {
          const filePatterns = [
            /\b(src\/[^\s]+\.(js|ts|jsx|tsx))\b/,
            /\b([^\s/]+\.(js|ts|jsx|tsx|json|py|md|css|scss|html|xml))\b/,
          ];

          // Look in first few lines of the diff
          const firstLines = text.split('\n').slice(0, 5).join('\n');
          for (const pattern of filePatterns) {
            const match = firstLines.match(pattern);
            if (match) {
              fileName = match[1];
              console.log(`Found filename in diff content: ${fileName}`);
              break;
            }
          }
        }

        // Add to our collection
        const key = fileName || `Diff${containerIndex}`;
        if (!uniqueDiffs.has(key)) {
          uniqueDiffs.set(key, {
            name: fileName || `Code Block ${containerIndex}`,
            patch: text, // Don't truncate
          });
        }
      });

      // Strategy 2: If no containers found, look for hljs elements
      if (uniqueDiffs.size === 0) {
        console.log('No diff containers found, looking for hljs elements...');

        const hljsElements = document.querySelectorAll('[class*="hljs"]');
        const hljsContainers = new Set();

        // Find parent containers of hljs elements
        hljsElements.forEach((el) => {
          let parent = el.parentElement;
          while (parent) {
            // Check if this parent contains substantial code
            const text = parent.textContent || '';
            if (
              text.length > 200 &&
              (text.includes('import') || text.includes('function') || text.includes('old line'))
            ) {
              hljsContainers.add(parent);
              break;
            }
            parent = parent.parentElement;
          }
        });

        console.log(`Found ${hljsContainers.size} hljs containers`);

        hljsContainers.forEach((container, idx) => {
          const text = container.textContent?.trim() || '';

          // Extract filename if present
          let fileName = null;
          const fileMatch = text.match(
            /\b(src\/[^\s]+\.(js|ts|jsx|tsx)|[^\s]+\.(js|ts|jsx|tsx|json|py|md|css|scss|html|xml))\b/
          );
          if (fileMatch) {
            fileName = fileMatch[1];
          }

          uniqueDiffs.set(`hljs${idx}`, {
            name: fileName || `Code Block ${idx + 1}`,
            patch: text, // Don't truncate
          });
        });
      }

      // Strategy 3: As last resort, look for code-like content in any element
      if (uniqueDiffs.size === 0) {
        console.log('Still no diffs found, doing broad search...');

        // Look for elements containing code patterns
        const allElements = document.querySelectorAll('*');
        allElements.forEach((el, idx) => {
          // Skip if element has many children (not a leaf node)
          if (el.children.length > 10) return;

          const text = el.textContent?.trim() || '';

          // Must be substantial and look like code
          if (
            text.length > 500 &&
            text.length < 5000 &&
            (text.includes('old line number') ||
              text.includes('import ') ||
              text.includes('function '))
          ) {
            // Extract filename if possible
            let fileName = null;
            const fileMatch = text.match(
              /\b(src\/[^\s]+\.(js|ts|jsx|tsx)|[^\s]+\.(js|ts|jsx|tsx|json|py|md|css|scss|html|xml))\b/
            );
            if (fileMatch) {
              fileName = fileMatch[1];
            }

            const key = fileName || `Element${idx}`;
            if (!uniqueDiffs.has(key)) {
              uniqueDiffs.set(key, {
                name: fileName || `Code Block ${uniqueDiffs.size + 1}`,
                patch: text, // Don't truncate
              });
              console.log(`Found code in element ${idx}, file: ${fileName || 'unknown'}`);
            }
          }
        });
      }
    }

    content.files = Array.from(uniqueDiffs.values());
    console.log(`Final: Collected ${content.files.length} unique file diffs`);

    return content;
  }

  // If currentVersionOnly, collect just the current view
  if (options.currentVersionOnly) {
    console.log('Collecting current version only...');
    const content = await getCurrentContent(options);
    results.push({
      version: 'Current Version',
      ...content,
    });
    broadcastProgress('Formatting consolidated summary…');
    console.log(`Collected current version: ${content.files.length} files`);
  } else {
    // Click each button and collect content
    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i];
      const buttonText = btn.textContent?.trim() || `Version ${i + 1}`;

      console.log(`Clicking ${buttonText}...`);
      broadcastProgress(`Capturing ${buttonText} (${i + 1} of ${buttons.length})…`);
      btn.click();

      // Wait for content to update
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const content = await getCurrentContent(options);
      results.push({
        version: buttonText,
        ...content,
      });
      console.log(`Collected content for ${buttonText}: ${content.files.length} files`);
      broadcastProgress(`Captured ${buttonText}; summarizing changes…`);
    }
  }

  console.log(`Collected ${results.length} PR versions`);
  broadcastProgress('Formatting consolidated summary…');

  // Format output based on options
  const compactMode = Boolean(options.compactMode);
  const separator = compactMode ? '\n' : '\n\n';
  const lineSeparator = compactMode ? '---' : '\n---\n';
  const totalVersions = results.length;
  const totalFiles = results.reduce(
    (sum, r) => sum + (Array.isArray(r.files) ? r.files.length : 0),
    0
  );
  const templateSource = (options.summaryTemplate || '').trim() || summaryTemplateDefault;

  let output = applyTemplateInPage(templateSource, {
    totalVersions,
    totalFiles,
  }).replace(/\s+$/, '');
  output += separator;

  // Add the task once at the beginning (it's the same for all versions)
  const task = results.find((r) => r.task && r.task.length > 0)?.task;
  if (task) {
    output += `## Task${separator}${task}${separator}`;
    output += lineSeparator + '\n';
  }

  results.forEach((result, i) => {
    output += `## ${result.version}${separator}`;

    if (result.summary && result.summary.length > 0) {
      if (compactMode) {
        output += `${result.summary}${separator}`;
      } else {
        output += `**Summary:**${separator}${result.summary}${separator}`;
      }
    }

    if (result.testing && result.testing.length > 0) {
      output += `**Testing:**${separator}${result.testing}${separator}`;
    }

    if (result.files.length > 0) {
      output += `### Changed Files (${result.files.length})${separator}`;

      result.files.forEach((file) => {
        output += `#### ${file.name}\n`;
        output += '```diff\n';
        output += file.patch;
        output += '\n```' + separator;
      });
    } else {
      output += `*No file changes detected*${separator}`;
    }

    if (i < results.length - 1) {
      output += lineSeparator + '\n';
    }
  });

  // Add review questions if enabled
  broadcastProgress('Finalizing summary and review questions…');
  if (options.includeReviewQuestions) {
    output += buildReviewSectionInPage(
      options.reviewHeading || reviewHeadingDefault,
      options.reviewQuestions || reviewQuestionsDefault,
      {
        lineSeparator,
        separator,
        totalVersions,
        totalFiles,
      }
    );
  }

  return output;
}

async function showInformationalOverlay(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: injectInformationalOverlay,
      args: [chrome.runtime.getURL('assets/brand-mark.svg')],
    });
  } catch (err) {
    console.warn('Unable to inject informational overlay:', err);
    chrome.notifications.create({
      type: 'basic',
      iconUrl: '/icon.png',
      title: 'Open a Codex task',
      message:
        'Visit https://chatgpt.com/codex/tasks/... and run Codex Helper again. Options has setup help.',
    });
  }
}

function injectInformationalOverlay(brandIconUrl) {
  const overlayId = 'codex-info-overlay';
  const styleId = 'codex-info-overlay-style';
  const existing = document.getElementById(overlayId);
  if (existing) existing.remove();

  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      #${overlayId} {
        position: fixed;
        inset: 0;
        z-index: 999999;
        display: grid;
        place-items: center;
        font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      #${overlayId} .codex-info-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(10, 16, 24, 0.55);
        backdrop-filter: blur(4px);
      }
      #${overlayId} .codex-info-card {
        position: relative;
        width: min(440px, calc(100% - 48px));
        padding: 32px;
        border-radius: 22px;
        background: rgba(248, 247, 244, 0.96);
        border: 1px solid rgba(31, 41, 51, 0.08);
        box-shadow: 0 24px 48px rgba(10, 16, 24, 0.24);
        display: flex;
        flex-direction: column;
        gap: 18px;
      }
      #${overlayId} h2 {
        margin: 0;
        font-size: 22px;
        letter-spacing: 0.04em;
      }
      #${overlayId} p {
        margin: 0;
        font-size: 15px;
        line-height: 1.6;
        color: rgba(31, 42, 51, 0.72);
      }
      #${overlayId} .codex-info-actions {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }
      #${overlayId} button {
        border: 1px solid rgba(31, 82, 67, 0.28);
        border-radius: 999px;
        padding: 12px 22px;
        font-size: 14px;
        letter-spacing: 0.02em;
        color: #1f5243;
        background: rgba(31, 82, 67, 0.12);
        cursor: pointer;
      }
      #${overlayId} button:hover,
      #${overlayId} button:focus-visible {
        border-color: rgba(31, 82, 67, 0.42);
        background: rgba(31, 82, 67, 0.18);
      }
      #${overlayId} .codex-info-close {
        position: absolute;
        top: 16px;
        right: 16px;
        background: rgba(26, 31, 36, 0.06);
        border: 1px solid rgba(26, 31, 36, 0.12);
        border-radius: 12px;
        padding: 4px 10px;
        font-size: 13px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: rgba(26, 31, 36, 0.68);
        display: inline-flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
      }
      #${overlayId} .codex-info-close:hover,
      #${overlayId} .codex-info-close:focus-visible {
        background: rgba(26, 31, 36, 0.12);
        border-color: rgba(26, 31, 36, 0.22);
      }
      #${overlayId} .codex-info-link {
        color: #1f5243;
        text-decoration: underline;
      }
      #${overlayId} .codex-info-brand {
        width: 52px;
        height: 52px;
        border-radius: 16px;
        background: rgba(47, 79, 64, 0.12);
        display: grid;
        place-items: center;
        border: 1px solid rgba(31, 41, 51, 0.08);
      }
      #${overlayId} .codex-info-brand img {
        width: 28px;
        height: 28px;
      }
      #${overlayId} .codex-made-by {
        font-size: 12px;
        color: #1f5243;
        text-decoration: none;
        letter-spacing: 0.05em;
        align-self: flex-start;
      }
      #${overlayId} .codex-made-by:hover,
      #${overlayId} .codex-made-by:focus-visible {
        text-decoration: underline;
      }
    `;
    document.head.appendChild(style);
  }

  const overlay = document.createElement('div');
  overlay.id = overlayId;
  overlay.innerHTML = `
    <div class="codex-info-backdrop" data-element="backdrop"></div>
    <div class="codex-info-card" role="dialog" aria-modal="true" aria-labelledby="codex-info-title">
      <button class="codex-info-close" aria-label="Close">
        <span>Close</span>
      </button>
      <div class="codex-info-brand" aria-hidden="true">
        <img src="${brandIconUrl}" alt="" />
      </div>
      <h2 id="codex-info-title">Switch to a Codex task</h2>
      <p>
        Open Codex Helper while viewing a Codex review page at
        <a class="codex-info-link" href="https://chatgpt.com/codex/tasks" target="_blank" rel="noopener noreferrer">chatgpt.com/codex/tasks</a>.
      </p>
      <div class="codex-info-actions">
        <button type="button" data-action="open-options">Open Options</button>
        <button type="button" data-action="close">Got it</button>
      </div>
      <a
        class="codex-made-by"
        href="https://x.com/montakaoh"
        target="_blank"
        rel="noopener noreferrer"
      >made with 🤖 by @montakaoh</a>
    </div>
  `;

  const removeOverlay = () => {
    overlay.remove();
  };

  overlay.addEventListener('click', (event) => {
    if (
      event.target === overlay ||
      (event.target instanceof HTMLElement && event.target.dataset.element === 'backdrop')
    ) {
      removeOverlay();
    }
  });

  const closeBtn = overlay.querySelector('.codex-info-close');
  closeBtn?.addEventListener('click', removeOverlay);

  const openOptionsBtn = overlay.querySelector('[data-action="open-options"]');
  openOptionsBtn?.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
    }
    removeOverlay();
  });

  const closeActionBtn = overlay.querySelector('[data-action="close"]');
  closeActionBtn?.addEventListener('click', removeOverlay);

  document.addEventListener('keydown', function onKeyDown(event) {
    if (event.key === 'Escape') {
      removeOverlay();
      document.removeEventListener('keydown', onKeyDown);
    }
  });

  document.body.appendChild(overlay);
}

async function saveContentToStorage(content) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ prContent: content }, () => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

async function getActiveCodexTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const [tab] = tabs;
  if (!tab || !tab.id || !tab.url || !tab.url.includes('chatgpt.com/codex/tasks/')) {
    return null;
  }
  return tab;
}

async function collectSummaryFromTab(tabId) {
  lastCodexTabId = tabId;
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: collectPRsWithDiffs,
    args: [
      DEFAULT_SUMMARY_TEMPLATE,
      DEFAULT_SUMMARIES_ONLY_TEMPLATE,
      DEFAULT_REVIEW_HEADING,
      DEFAULT_REVIEW_QUESTIONS_TEXT,
    ],
  });
  if (!result || typeof result.result !== 'string' || result.result.length === 0) {
    throw new Error('No PR content was returned from the page.');
  }
  return result.result;
}

async function getCachedSummary() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['prContent'], (res) => {
      resolve(res?.prContent || '');
    });
  });
}

function showResultsPopup(content, brandIconUrl, tabId, isLoading = false, stage = null) {
  const targetTabId = tabId ?? lastCodexTabId;
  if (targetTabId == null) {
    console.warn('No target tab available for overlay.');
    return Promise.resolve();
  }

  return chrome.scripting
    .executeScript({
      target: { tabId: targetTabId },
      func: createOverlayPopup,
      args: [content || '', brandIconUrl, Boolean(isLoading), stage],
    })
    .catch((error) => {
      console.error('Failed to inject overlay:', error?.message || error);
    });
}

function createOverlayPopup(content, brandIconUrl, isLoading, stage) {
  const state = (window.__codexOverlayState = window.__codexOverlayState || {
    currentModel: 'gpt-5-pro',
    currentTokens: 0,
    lastProgressStage: null,
    progressListenerAttached: false,
    progressHandler: null,
  });

  if (stage) {
    state.lastProgressStage = stage;
  }
  const initialStage = state.lastProgressStage;
  state.defaultInstructions =
    state.defaultInstructions ||
    'Edit the summary if needed, copy it directly, or open gpt-5-pro or gpt-5-thinking to continue the review.';
  const defaultInstructions = state.defaultInstructions;
  // Remove any existing popup
  let overlay = document.getElementById('codex-pr-popup');
  const updateProgressStage = (stage) => {
    const normalized = typeof stage === 'string' ? stage.trim() : '';
    state.lastProgressStage = normalized;
    if (!overlay) return;
    const progressTextEl = overlay.querySelector('#codex-progress-text');
    if (progressTextEl) {
      progressTextEl.textContent = normalized || defaultInstructions;
    }
  };
  const styleId = 'codex-overlay-style';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      #codex-pr-popup {
        position: fixed;
        inset: 0;
        z-index: 999999;
        display: grid;
        place-items: center;
        font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      #codex-pr-popup .codex-overlay-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(8, 14, 18, 0.4);
        backdrop-filter: blur(4px);
      }
      #codex-pr-popup .codex-popup-shell {
        position: relative;
        width: min(1080px, calc(100% - 64px));
        height: min(92vh, 960px);
        display: flex;
        flex-direction: column;
        gap: 22px;
        padding: 36px;
        border-radius: 26px;
        background: rgba(249, 248, 245, 0.94);
        border: 1px solid rgba(31, 41, 51, 0.06);
        box-shadow: 0 32px 48px rgba(10, 16, 24, 0.12);
        overflow: hidden;
      }
      #codex-pr-popup .codex-popup-shell::after {
        content: '';
        flex: 0 0 24px;
      }
      #codex-pr-popup .codex-popup-header {
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: 18px;
      }
      #codex-pr-popup .codex-brand-icon {
        width: 68px;
        height: 68px;
        border-radius: 20px;
        display: grid;
        place-items: center;
        border: 1px solid rgba(31, 41, 51, 0.08);
        background: rgba(47, 79, 64, 0.1);
      }
      #codex-pr-popup .codex-brand-icon img {
        width: 34px;
        height: 34px;
      }
      #codex-pr-popup h2 {
        margin: 0;
        font-size: 27px;
        letter-spacing: 0.02em;
        color: #1a1f24;
      }
      #codex-pr-popup .codex-tagline {
        margin: 6px 0 0;
        font-size: 15px;
        color: rgba(26, 31, 36, 0.68);
      }
      #codex-pr-popup .codex-close {
        border: none;
        background: rgba(26, 31, 36, 0.05);
        border-radius: 50%;
        width: 40px;
        height: 40px;
        display: grid;
        place-items: center;
        cursor: pointer;
        transition: background 160ms ease;
      }
      #codex-pr-popup .codex-close svg {
        width: 20px;
        height: 20px;
        stroke: #1a1f24;
        stroke-width: 1.6;
      }
      #codex-pr-popup .codex-close:hover {
        background: rgba(26, 31, 36, 0.14);
      }
      #codex-pr-popup .codex-progress {
        display: none;
        align-items: center;
        gap: 12px;
        padding: 16px 20px;
        border-radius: 16px;
        border: 1px solid rgba(31, 41, 51, 0.1);
        background: rgba(47, 79, 64, 0.08);
        color: rgba(26, 31, 36, 0.75);
        font-size: 15px;
      }
      #codex-pr-popup .codex-progress.is-visible {
        display: inline-flex;
      }
      #codex-pr-popup .codex-spinner {
        width: 18px;
        height: 18px;
        border-radius: 50%;
        border: 2px solid rgba(26, 31, 36, 0.18);
        border-top-color: rgba(26, 31, 36, 0.78);
        animation: codex-spin 720ms linear infinite;
      }
      @keyframes codex-spin {
        to { transform: rotate(360deg); }
      }
      #codex-pr-popup .codex-card {
        display: flex;
        gap: 18px;
        padding: 24px;
        border-radius: 20px;
        border: 1px solid rgba(31, 41, 51, 0.05);
        background: rgba(255, 255, 255, 0.9);
        backdrop-filter: blur(12px);
        box-shadow: 0 16px 36px rgba(10, 16, 24, 0.1);
      }
      #codex-pr-popup .codex-card.codex-instructions {
        background: rgba(47, 79, 64, 0.05);
        border-color: rgba(47, 79, 64, 0.16);
      }
      #codex-pr-popup .codex-card.codex-content {
        flex: 1;
        min-height: 0;
        background: rgba(255, 255, 255, 0.92);
        display: flex;
      }
      #codex-pr-popup .codex-card.codex-content .codex-card-content {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      #codex-pr-popup .codex-card-icon {
        width: 44px;
        height: 44px;
        border-radius: 16px;
        display: grid;
        place-items: center;
        background: rgba(47, 79, 64, 0.08);
      }
      #codex-pr-popup .codex-card-icon svg {
        width: 20px;
        height: 20px;
        stroke: #2f4f40;
      }
      #codex-pr-popup .codex-card-content {
        display: flex;
        flex-direction: column;
        gap: 10px;
        flex: 1;
        min-height: 0;
      }
      #codex-pr-popup .codex-card-content strong {
        font-size: 15px;
        letter-spacing: 0.1em;
        color: #1a1f24;
      }
      #codex-pr-popup .codex-card-content p {
        margin: 0;
        font-size: 14.5px;
        line-height: 1.6;
        color: rgba(26, 31, 36, 0.78);
      }
      #codex-pr-popup .codex-instructions-body {
        color: rgba(26, 31, 36, 0.78);
      }
      #codex-pr-popup label {
        font-size: 12.5px;
        font-weight: 600;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: rgba(26, 31, 36, 0.68);
      }
      #codex-pr-popup textarea {
        flex: 1 1 auto;
        width: 100%;
        border: 1.5px solid rgba(31, 41, 51, 0.1);
        border-radius: 18px;
        padding: 22px;
        font-family: 'SF Mono', ui-monospace, 'JetBrains Mono', monospace;
        font-size: 14px;
        line-height: 1.62;
        resize: vertical;
        background: rgba(250, 250, 249, 0.94);
        color: #1a1f24;
        transition: border-color 180ms ease, box-shadow 180ms ease;
        overflow: auto;
        min-height: 180px;
        max-height: 100%;
      }
      #codex-pr-popup textarea:focus {
        outline: none;
        border-color: rgba(47, 79, 64, 0.5);
        box-shadow: 0 8px 18px rgba(47, 79, 64, 0.12);
      }
      #codex-pr-popup .codex-actions {
        position: relative;
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
        align-items: flex-end;
        padding-bottom: 32px;
        width: 100%;
        margin-top: auto;
      }
      #codex-pr-popup .codex-button-primary .codex-button-copy {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
      }
      #codex-pr-popup .codex-button-meta {
        font-size: 12.5px;
        font-weight: 500;
        letter-spacing: 0.04em;
        opacity: 0.82;
      }
      #codex-pr-popup .codex-model-picker {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 220px;
      }
      #codex-pr-popup .codex-model-picker label {
        font-size: 12.5px;
        font-weight: 600;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: rgba(26, 31, 36, 0.68);
      }
      #codex-pr-popup .codex-model-picker select {
        position: relative;
        border-radius: 999px;
        border: 1.5px solid rgba(47, 79, 64, 0.25);
        background: rgba(255, 255, 255, 0.92);
        padding: 12px 18px;
        font-size: 14.5px;
        font-weight: 500;
        color: #1a1f24;
        appearance: none;
        outline: none;
        min-width: 220px;
        padding-right: 52px;
        cursor: pointer;
      }
      #codex-pr-popup .codex-model-picker:hover select {
        border-color: rgba(47, 79, 64, 0.45);
        background-color: rgba(255, 255, 255, 0.98);
      }
      #codex-pr-popup .codex-model-picker::after {
        content: '';
        position: absolute;
        right: 18px;
        top: 50%;
        width: 12px;
        height: 12px;
        transform: translateY(-50%);
        pointer-events: none;
        background-image: url('data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" stroke="%231a1f24" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" viewBox="0 0 24 24"%3E%3Cpath d="M6 9l6 6 6-6"/%3E%3C/svg%3E');
        background-size: 12px 12px;
        background-repeat: no-repeat;
      }
      #codex-pr-popup .codex-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 12px 22px;
        border-radius: 999px;
        border: 1px solid transparent;
        font-size: 15px;
        font-weight: 500;
        letter-spacing: 0.01em;
        cursor: pointer;
        transition: transform 160ms ease, background 160ms ease;
        text-align: left;
      }
      #codex-pr-popup .codex-button svg {
        width: 18px;
        height: 18px;
        stroke-width: 1.6;
      }
      #codex-pr-popup .codex-button:disabled {
        opacity: 0.55;
        cursor: not-allowed;
        box-shadow: none;
      }
      #codex-pr-popup .codex-button-primary {
        background: rgba(47, 79, 64, 0.82);
        color: #fff;
      }
      #codex-pr-popup .codex-button-primary:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 10px 20px rgba(10, 16, 24, 0.14);
      }
      #codex-pr-popup .codex-button-subtle {
        background: rgba(255, 255, 255, 0.7);
        color: #1a1f24;
        border: 1px solid rgba(31, 41, 51, 0.12);
      }
      #codex-pr-popup .codex-button-subtle:hover:not(:disabled) {
        border-color: rgba(47, 79, 64, 0.3);
        background: rgba(47, 79, 64, 0.08);
      }
      #codex-pr-popup .codex-button-ghost {
        background: rgba(26, 31, 36, 0.05);
        color: #1a1f24;
        border: 1px solid rgba(31, 41, 51, 0.1);
      }
      #codex-pr-popup .codex-button-ghost:hover:not(:disabled) {
        background: rgba(26, 31, 36, 0.09);
        border-color: rgba(31, 41, 51, 0.18);
      }
      #codex-pr-popup .codex-status {
        position: absolute;
        right: 0;
        bottom: 0;
        display: inline-flex;
        align-items: center;
        gap: 10px;
        font-size: 14px;
        color: #2f4f40;
        padding: 12px 16px;
        border-radius: 12px;
        background: rgba(47, 79, 64, 0.06);
        border: 1px solid rgba(47, 79, 64, 0.15);
        opacity: 0;
        pointer-events: none;
        transition: opacity 160ms ease;
        min-width: 160px;
        justify-content: center;
        box-shadow: 0 12px 20px rgba(10, 16, 24, 0.12);
      }
      #codex-pr-popup .codex-status svg {
        width: 18px;
        height: 18px;
        stroke: #2f4f40;
      }
      #codex-pr-popup .codex-status.is-visible {
        opacity: 1;
      }
      #codex-pr-popup .codex-made-by {
        margin-top: -8px;
        align-self: center;
        font-size: 12.5px;
        color: #1f5243;
        letter-spacing: 0.05em;
        text-decoration: none;
      }
      #codex-pr-popup .codex-made-by:hover,
      #codex-pr-popup .codex-made-by:focus-visible {
        text-decoration: underline;
      }
      @media (max-width: 900px) {
        #codex-pr-popup .codex-popup-shell {
          width: calc(100% - 40px);
          max-height: calc(100vh - 32px);
          height: auto;
          padding: 28px;
          overflow-y: auto;
          scrollbar-gutter: stable both-edges;
        }
        #codex-pr-popup .codex-popup-header {
          grid-template-columns: 1fr auto;
          grid-template-rows: auto auto;
        }
        #codex-pr-popup .codex-brand-icon {
          display: none;
        }
        #codex-pr-popup .codex-actions .codex-button {
          flex: 1 1 100%;
        }
        #codex-pr-popup textarea {
          max-height: max(220px, min(90vh, calc(100vh - 360px)));
        }
      }
      @media (max-width: 600px) {
        #codex-pr-popup .codex-popup-shell {
          gap: 18px;
          padding: 22px 20px 26px;
          box-shadow: 0 24px 38px rgba(10, 16, 24, 0.16);
        }
        #codex-pr-popup h2 {
          font-size: 24px;
        }
        #codex-pr-popup .codex-tagline {
          font-size: 14px;
        }
        #codex-pr-popup .codex-card {
          padding: 18px;
          gap: 14px;
        }
        #codex-pr-popup textarea {
          padding: 18px;
          font-size: 13.5px;
          min-height: 160px;
          max-height: 100%;
        }
        #codex-pr-popup .codex-actions {
          gap: 12px;
          padding-bottom: 16px;
        }
        #codex-pr-popup .codex-model-picker {
          width: 100%;
          min-width: 0;
        }
        #codex-pr-popup .codex-model-picker select {
          min-width: 0;
          width: 100%;
        }
        #codex-pr-popup .codex-actions .codex-button {
          flex: 1 1 100%;
          justify-content: flex-start;
          padding: 16px 18px;
        }
        #codex-pr-popup .codex-button-primary .codex-button-copy {
          width: 100%;
        }
      }
    `;
    document.head.appendChild(style);
  }

  let textarea;
  let status;
  let copyBtn;
  let chatBtn;
  let closeBtn;
  let optionsBtn;
  let modelSelect;
  let tokenLabel;
  let progress;

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'codex-pr-popup';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="codex-overlay-backdrop" data-element="backdrop"></div>
      <div class="codex-popup-shell" role="document">
        <div class="codex-popup-header">
          <div class="codex-brand-icon" aria-hidden="true">
            <img src="${brandIconUrl}" alt="" />
          </div>
          <div>
            <h2>Codex Buddy</h2>
            <p class="codex-tagline">Collected review ready for hand-off to ChatGPT with a single, calm workspace.</p>
          </div>
          <button class="codex-close" id="close-btn" aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M6 6l12 12" stroke-linecap="round"/>
              <path d="M18 6L6 18" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
        <section class="codex-progress" id="codex-progress" role="status" aria-live="polite">
          <span class="codex-spinner" aria-hidden="true"></span>
          <span class="codex-progress-text" id="codex-progress-text">Capturing Codex task context…</span>
        </section>
        <section class="codex-card codex-instructions" aria-labelledby="codex-instructions-title">
          <div class="codex-card-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="8.5"/>
              <path d="M12 8.5v.01" stroke-linecap="round"/>
              <path d="M11.5 11h1v5" stroke-linecap="round"/>
            </svg>
          </div>
          <div class="codex-card-content">
            <strong id="codex-instructions-title">How to use</strong>
            <p id="codex-instructions-body" class="codex-instructions-body">Edit the summary if needed, copy it directly, or open gpt-5-pro or gpt-5-thinking to continue the review.<br /><strong>Note:</strong> Keep this window at least 800px wide for the best layout.</p>
          </div>
        </section>
        <section class="codex-card codex-content">
          <div class="codex-card-content">
            <label for="pr-content">Summary</label>
            <textarea id="pr-content" placeholder="Summary will appear here. You can adjust it before copying."></textarea>
          </div>
        </section>
        <div class="codex-actions" id="codex-actions">
          <div class="codex-model-picker">
            <label for="codex-model-select">Model</label>
            <select id="codex-model-select">
              <option value="gpt-5-pro">gpt-5-pro</option>
              <option value="gpt-5-thinking">gpt-5-thinking</option>
            </select>
          </div>
          <button id="copy-btn" class="codex-button codex-button-primary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M15 3H5a2 2 0 0 0-2 2v10" stroke-linecap="round"/>
              <rect x="7" y="7" width="14" height="14" rx="2" ry="2"/>
            </svg>
            <div class="codex-button-copy">
              <span>Copy Summary</span>
              <span class="codex-button-meta" id="codex-token-count-label">0 tokens</span>
            </div>
          </button>
          <button id="chatgpt-btn" class="codex-button codex-button-subtle">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M5 12h14" stroke-linecap="round"/>
              <path d="M13 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>Open gpt-5-pro</span>
          </button>
          <button id="options-btn" class="codex-button codex-button-ghost">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>Options</span>
          </button>
          <div class="codex-status" id="copy-status" role="status" aria-live="polite">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>Copied to clipboard</span>
          </div>
        </div>
        <a
          class="codex-made-by"
          href="https://x.com/montakaoh"
          target="_blank"
          rel="noopener noreferrer"
        >made with 🤖 by @montakaoh</a>
      </div>
    `;

    document.body.appendChild(overlay);

    textarea = overlay.querySelector('#pr-content');
    status = overlay.querySelector('#copy-status');
    copyBtn = overlay.querySelector('#copy-btn');
    chatBtn = overlay.querySelector('#chatgpt-btn');
    closeBtn = overlay.querySelector('#close-btn');
    optionsBtn = overlay.querySelector('#options-btn');
    modelSelect = overlay.querySelector('#codex-model-select');
    tokenLabel = overlay.querySelector('#codex-token-count-label');
    const applyTokenEstimate = (text) => {
      if (!tokenLabel) return;
      const tokens = estimateFromText(text);
      state.currentTokens = tokens;
      console.debug('[CodexOverlay] token estimate', tokens);
      tokenLabel.textContent = `${tokens.toLocaleString()} tokens`;
    };

    const estimateFromText = (text) => {
      if (!text) return 0;
      const normalized = text.trim();
      if (!normalized) return 0;
      const words = normalized.split(/\s+/g).filter(Boolean).length;
      const chars = normalized.replace(/\s+/g, ' ').length;
      const viaWords = words / 0.75;
      const viaChars = chars / 4;
      const estimate = Math.max(viaWords, viaChars);
      return Math.max(0, Math.round(estimate));
    };

    const syncModelButtonLabel = () => {
      const label = state.currentModel || 'gpt-5-pro';
      const span = chatBtn?.querySelector('span');
      if (span) span.textContent = `Open ${label}`;
    };

    const persistModelChoice = (value) => {
      state.currentModel = value || 'gpt-5-pro';
      syncModelButtonLabel();
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        try {
          chrome.storage.local.set({ codexPreferredModel: state.currentModel }, () => {
            const err = chrome.runtime?.lastError;
            if (err)
              console.debug('[CodexOverlay] model preference save skipped', err.message || err);
          });
        } catch (err) {
          console.debug('[CodexOverlay] model preference save skipped', err?.message || err);
        }
      }
    };

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get({ codexPreferredModel: state.currentModel }, (res) => {
        const saved = res?.codexPreferredModel;
        if (saved) state.currentModel = saved;
        if (modelSelect) modelSelect.value = state.currentModel;
        syncModelButtonLabel();
      });
    } else {
      if (modelSelect) modelSelect.value = state.currentModel;
      syncModelButtonLabel();
    }

    const updateCopyState = () => {
      if (!copyBtn || !textarea) return;
      copyBtn.disabled = false;
      applyTokenEstimate(textarea.value || '');
    };

    const handleCopy = async () => {
      textarea?.select();
      try {
        await navigator.clipboard.writeText(textarea?.value || '');
      } catch (err) {
        document.execCommand('copy');
      }
      if (status) {
        status.classList.add('is-visible');
        setTimeout(() => status.classList.remove('is-visible'), 2000);
      }
    };

    const handleChat = () => {
      const model = state.currentModel || 'gpt-5-pro';
      window.open(`https://chat.openai.com/?model=${encodeURIComponent(model)}`, '_blank');
    };

    if (state.progressHandler) {
      window.removeEventListener('CODEX_OVERLAY_PROGRESS', state.progressHandler);
    }
    state.progressHandler = (event) => {
      if (event?.detail && typeof event.detail.stage === 'string') {
        console.debug('[CodexOverlay] progress stage', event.detail.stage);
        updateProgressStage(event.detail.stage);
      }
    };
    window.addEventListener('CODEX_OVERLAY_PROGRESS', state.progressHandler);

    const handleClose = () => {
      overlay.remove();
      if (state.progressHandler) {
        window.removeEventListener('CODEX_OVERLAY_PROGRESS', state.progressHandler);
        state.progressHandler = null;
      }
      state.lastProgressStage = null;
      document.removeEventListener('keydown', escHandler);
    };

    const escHandler = (e) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    textarea?.addEventListener('input', updateCopyState);
    copyBtn?.addEventListener('click', () => {
      updateProgressStage('Copying summary to clipboard…');
      handleCopy();
      setTimeout(() => updateProgressStage('Summary ready. Review, edit, or export.'), 1200);
    });
    chatBtn?.addEventListener('click', () => {
      updateProgressStage(`Launching ${state.currentModel || 'gpt-5-pro'} in a new tab…`);
      handleChat();
      setTimeout(() => updateProgressStage('Summary ready. Review, edit, or export.'), 1800);
    });
    modelSelect?.addEventListener('change', (event) => {
      const target = event.target;
      const value = target && target.value ? target.value : 'gpt-5-pro';
      persistModelChoice(value);
    });
    optionsBtn?.addEventListener('click', () => {
      if (!optionsBtn) return;
      optionsBtn.disabled = true;
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        try {
          chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' }, () => {
            optionsBtn.disabled = false;
            if (chrome.runtime?.lastError) {
              console.debug(
                '[CodexOverlay] options page open skipped',
                chrome.runtime.lastError.message
              );
            }
          });
        } catch (err) {
          console.debug('[CodexOverlay] options page open skipped', err?.message || err);
          optionsBtn.disabled = false;
        }
      } else {
        optionsBtn.disabled = false;
      }
    });
    closeBtn?.addEventListener('click', handleClose);
    overlay.addEventListener('click', (e) => {
      if (
        e.target === overlay ||
        (e.target instanceof HTMLElement && e.target.dataset.element === 'backdrop')
      ) {
        handleClose();
      }
    });
    document.addEventListener('keydown', escHandler);

    updateCopyState();
    const startupStage = initialStage || 'Capturing Codex task context…';
    updateProgressStage(startupStage);
    if (textarea) {
      applyTokenEstimate(textarea.value || '');
    }
    overlay.dataset.initialized = 'true';
  }

  textarea = textarea ?? overlay.querySelector('#pr-content');
  progress = progress ?? overlay.querySelector('#codex-progress');
  copyBtn = copyBtn ?? overlay.querySelector('#copy-btn');
  chatBtn = chatBtn ?? overlay.querySelector('#chatgpt-btn');
  closeBtn = closeBtn ?? overlay.querySelector('#close-btn');
  optionsBtn = optionsBtn ?? overlay.querySelector('#options-btn');
  modelSelect = modelSelect ?? overlay.querySelector('#codex-model-select');
  tokenLabel = tokenLabel ?? overlay.querySelector('#codex-token-count-label');
  const brand = overlay.querySelector('.codex-brand-icon img');

  if (brand && brandIconUrl) {
    brand.setAttribute('src', brandIconUrl);
  }

  if (isLoading) {
    progress?.classList.add('is-visible');
    if (textarea) {
      textarea.value = content || '';
      const event = new Event('input', { bubbles: true, cancelable: false });
      textarea.dispatchEvent(event);
    }
    const stageText = state.lastProgressStage || 'Capturing Codex task context…';
    updateProgressStage(stageText || '');
    if (copyBtn) copyBtn.disabled = false;
    if (chatBtn) chatBtn.disabled = false;
    if (optionsBtn) optionsBtn.disabled = false;
    if (modelSelect) modelSelect.disabled = false;
  } else {
    progress?.classList.remove('is-visible');
    if (textarea) {
      textarea.value = content || 'No content collected yet.';
      textarea.scrollTop = 0;
      const event = new Event('input', { bubbles: true, cancelable: false });
      textarea.dispatchEvent(event);
    }
    if (copyBtn) copyBtn.disabled = false;
    if (chatBtn) chatBtn.disabled = false;
    if (optionsBtn) optionsBtn.disabled = false;
    if (modelSelect) modelSelect.disabled = false;
    if (modelSelect && !modelSelect.value) {
      modelSelect.value = state.currentModel;
    }
    if (typeof state.currentModel === 'string') {
      const span = chatBtn?.querySelector('span');
      if (span) span.textContent = `Open ${state.currentModel}`;
    }
    updateProgressStage('Summary ready. Review, edit, or export.');
  }
}
