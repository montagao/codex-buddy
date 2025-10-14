// content.ts - Runs on ChatGPT Codex task pages
console.log('Content script loaded on:', window.location.href);

/* Smart selector strategies - try multiple approaches */
const findVersionButtons = (): HTMLButtonElement[] => {
  // Strategy 1: Look for buttons with "Version" text
  const allButtons = [...document.querySelectorAll('button')] as HTMLButtonElement[];
  const versionButtons = allButtons.filter(
    (btn) =>
      btn.textContent?.includes('Version') ||
      btn.textContent?.match(/^V\d+$/) ||
      btn.textContent?.match(/^PR\s*\d+$/)
  );

  if (versionButtons.length > 0) {
    console.log('Found version buttons by text content');
    return versionButtons;
  }

  // Strategy 2: Look for tab-like structures with role attributes
  const tabButtons = [...document.querySelectorAll('[role="tab"]')] as HTMLButtonElement[];
  if (tabButtons.length > 0) {
    console.log('Found tabs by role attribute');
    return tabButtons;
  }

  // Strategy 3: Look for buttons in a horizontal list/nav structure
  const navButtons = [
    ...document.querySelectorAll('nav button, [role="tablist"] button'),
  ] as HTMLButtonElement[];
  if (navButtons.length > 0) {
    console.log('Found buttons in nav/tablist');
    return navButtons;
  }

  // Strategy 4: Debug - log all button texts to help identify pattern
  console.log(
    'All button texts on page:',
    allButtons.map((b) => b.textContent?.trim()).filter(Boolean)
  );

  return [];
};

const findContentPanel = (): HTMLElement | null => {
  // Try multiple strategies to find the content
  const strategies = [
    () => document.querySelector('[role="tabpanel"]'),
    () => document.querySelector('.markdown.prose'),
    () => document.querySelector('[class*="markdown"]'),
    () => document.querySelector('div[class*="prose"]'),
    () => {
      // Find the largest text block that's likely the main content
      const textBlocks = [...document.querySelectorAll('div')].filter((div) => {
        const text = div.textContent?.trim() || '';
        return text.length > 200 && !div.querySelector('button');
      });
      return textBlocks.sort(
        (a, b) => (b.textContent?.length || 0) - (a.textContent?.length || 0)
      )[0];
    },
  ];

  for (const strategy of strategies) {
    const result = strategy();
    if (result) return result as HTMLElement;
  }

  return null;
};

function extractPanelText(): string {
  const panel = findContentPanel();
  if (!panel) {
    console.log('No content panel found');
    return '';
  }

  const text = panel.textContent?.trim() ?? '';
  console.log('Extracted text preview:', text.substring(0, 100) + '...');
  return text;
}

// Visual debugging helper
function highlightElement(element: HTMLElement | null, color = 'red') {
  if (!element) return;
  const oldBorder = element.style.border;
  element.style.border = `3px solid ${color}`;
  setTimeout(() => {
    element.style.border = oldBorder;
  }, 2000);
}

async function waitForContentChange(): Promise<void> {
  return new Promise((resolve) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    }, 2000); // Max wait 2 seconds

    const observer = new MutationObserver(() => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        observer.disconnect();
        resolve();
      }
    });

    // Observe the entire document body for changes
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  });
}

// Alternative approach: just grab everything visible
function getAllVisibleContent(): string {
  console.log('Attempting to grab all visible content...');

  // Find all text containers that might have PR content
  const contentSelectors = [
    '[role="tabpanel"]',
    '.markdown',
    '[class*="prose"]',
    'div[class*="text-"]',
    'main div',
  ];

  const contents: string[] = [];
  for (const selector of contentSelectors) {
    const elements = document.querySelectorAll(selector);
    elements.forEach((el, idx) => {
      const text = el.textContent?.trim();
      if (text && text.length > 50) {
        // Only meaningful content
        console.log(`Found content in ${selector}[${idx}]:`, text.substring(0, 50) + '...');
        contents.push(text);
      }
    });
  }

  // Deduplicate by finding unique content blocks
  const unique = [...new Set(contents)];
  console.log(`Found ${unique.length} unique content blocks`);

  return unique.join('\n\n---\n\n');
}

async function collectAllVersions(): Promise<string> {
  console.log('Starting to collect versions...');
  console.log('Current URL:', window.location.href);
  console.log('Page title:', document.title);

  const out: string[] = [];

  const buttons = findVersionButtons();
  console.log('Found version buttons:', buttons.length);

  // Debug: Show what buttons we found
  buttons.forEach((btn, i) => {
    console.log(
      `Button ${i}: text="${btn.textContent?.trim()}", aria-selected="${btn.getAttribute('aria-selected')}"`
    );
    highlightElement(btn, 'blue');
  });

  if (buttons.length === 0) {
    console.log('No version buttons found, trying alternative content collection...');

    // Try to get all visible content
    const allContent = getAllVisibleContent();
    if (allContent) {
      return `Collected Content:\n${allContent}\n\nWhich of these PRs solves the task at hand the best and why?\nWhat additional inputs or BLOCKERS do you foresee?`;
    }

    throw new Error('No version buttons or content found on page');
  }

  // Store initial state
  const initialPanel = findContentPanel();
  highlightElement(initialPanel, 'green');

  for (const [i, btn] of buttons.entries()) {
    console.log(`\n--- Processing button ${i + 1}: "${btn.textContent?.trim()}" ---`);

    // Skip if already selected
    if (btn.getAttribute('aria-selected') === 'true') {
      console.log('Button already selected, capturing current content');
      const content = extractPanelText();
      out.push(`PR ${i + 1} (${btn.textContent?.trim() || `Tab ${i + 1}`}):\n${content}`);
      continue;
    }

    // Click and wait for content to load
    console.log('Clicking button...');
    btn.click();

    // Wait for any changes
    await waitForContentChange();
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Find and highlight the new content panel
    const newPanel = findContentPanel();
    highlightElement(newPanel, 'green');

    const content = extractPanelText();
    if (!content) {
      console.warn(`No content found for button ${i + 1}`);
    }

    out.push(
      `PR ${i + 1} (${btn.textContent?.trim() || `Tab ${i + 1}`}):\n${content || '[No content found]'}`
    );
  }

  return (
    out.join('\n\n') +
    '\n\nWhich of these PRs solves the task at hand the best and why?' +
    '\nWhat additional inputs or BLOCKERS do you foresee?'
  );
}

// Debug helper - dumps page structure
function debugPageStructure() {
  console.log('=== PAGE STRUCTURE DEBUG ===');

  // Find all buttons and their hierarchy
  const allButtons = document.querySelectorAll('button');
  console.log(`Total buttons on page: ${allButtons.length}`);

  allButtons.forEach((btn, i) => {
    const text = btn.textContent?.trim();
    if (text) {
      const parent = btn.parentElement;
      const grandparent = parent?.parentElement;
      console.log(`Button ${i}: "${text}"`);
      console.log(`  Parent: ${parent?.tagName}.${parent?.className}`);
      console.log(`  Grandparent: ${grandparent?.tagName}.${grandparent?.className}`);
      console.log(
        `  Attributes:`,
        [...btn.attributes].map((a) => `${a.name}="${a.value}"`).join(', ')
      );
    }
  });

  // Find potential content areas
  console.log('\n=== POTENTIAL CONTENT AREAS ===');
  const contentAreas = document.querySelectorAll(
    'div[class*="prose"], div[class*="markdown"], [role="tabpanel"], main > div > div'
  );
  contentAreas.forEach((area, i) => {
    const text = area.textContent?.trim().substring(0, 100);
    console.log(`Content area ${i}: ${area.tagName}.${area.className}`);
    console.log(`  Preview: ${text}...`);
    highlightElement(area as HTMLElement, 'purple');
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  console.log('Content script received message:', msg);

  if (msg?.type === 'PING') {
    sendResponse({ ok: true });
    return false; // Sync response
  }

  if (msg?.type === 'DEBUG') {
    debugPageStructure();
    sendResponse({ ok: true });
    return false;
  }

  if (msg?.type === 'COLLECT_PR_INFO') {
    // First run debug to understand the page
    debugPageStructure();

    // Handle async collection
    collectAllVersions()
      .then((payload) => {
        console.log('Collected payload length:', payload.length);
        console.log('First 200 chars:', payload.substring(0, 200));
        sendResponse({ ok: true, payload });
      })
      .catch((error) => {
        console.error('Collection error:', error);
        sendResponse({ ok: false, error: String(error) });
      });
    return true; // Keep the message channel open for async response
  }
});
