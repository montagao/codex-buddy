// This code will be injected directly into the page
(() => {
  console.log('Inline collector starting...');

  // Find version buttons
  const buttons = [...document.querySelectorAll('button')].filter(
    (btn) =>
      btn.textContent?.includes('Version') ||
      btn.textContent?.match(/^V\d+$/) ||
      btn.textContent?.match(/^PR\s*\d+$/)
  );

  console.log(`Found ${buttons.length} version buttons`);

  const results = [];
  let currentIndex = 0;

  function collectContent() {
    // Look for main content area
    const contentSelectors = [
      '.markdown.prose',
      '[class*="markdown"]',
      '[class*="prose"]',
      'main [class*="text-"]',
      'div[role="tabpanel"]',
    ];

    for (const selector of contentSelectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent?.length > 50) {
        return element.textContent.trim();
      }
    }

    // Fallback: find the largest text block
    const allDivs = [...document.querySelectorAll('div')];
    const sorted = allDivs
      .filter((div) => {
        const text = div.textContent?.trim() || '';
        return text.length > 200 && !div.querySelector('button');
      })
      .sort((a, b) => (b.textContent?.length || 0) - (a.textContent?.length || 0));

    return sorted[0]?.textContent?.trim() || '';
  }

  function processNextButton() {
    if (currentIndex >= buttons.length) {
      // All done, return results
      const output =
        results.join('\n\n---\n\n') +
        '\n\nWhich of these PRs solves the task at hand the best and why?' +
        '\nWhat additional inputs or BLOCKERS do you foresee?';

      // Copy to clipboard
      navigator.clipboard.writeText(output).then(() => {
        console.log('Copied to clipboard!');
        alert('PR summary copied to clipboard! Opening ChatGPT gpt-5-pro...');
      });

      // Send back to extension
      chrome.runtime.sendMessage({ type: 'COLLECTION_COMPLETE', payload: output });
      return;
    }

    const button = buttons[currentIndex];
    const buttonText = button.textContent?.trim() || `Button ${currentIndex + 1}`;

    console.log(`Processing: ${buttonText}`);

    // Click the button
    button.click();

    // Wait for content to load
    setTimeout(() => {
      const content = collectContent();
      results.push(`${buttonText}:\n${content}`);
      currentIndex++;
      processNextButton();
    }, 1000);
  }

  // If no buttons found, just collect current content
  if (buttons.length === 0) {
    const content = collectContent();
    const output = `Current Content:\n${content}\n\nWhich of these PRs solves the task at hand the best and why?\nWhat additional inputs or BLOCKERS do you foresee?`;
    navigator.clipboard.writeText(output);
    chrome.runtime.sendMessage({ type: 'COLLECTION_COMPLETE', payload: output });
  } else {
    processNextButton();
  }
})();
