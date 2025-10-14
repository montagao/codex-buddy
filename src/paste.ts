// paste.ts - Runs on ChatGPT gpt-5-* pages to auto-paste the prompt

chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg.type !== 'PASTE_PROMPT') return;

  // The text area is inside an editable div with role="textbox"
  const box = document.querySelector('[role="textbox"]') as HTMLElement | null;
  if (!box) {
    console.warn('Could not find textbox to paste into');
    return;
  }

  box.focus();

  // Try to use execCommand first
  const success = document.execCommand('insertText', false, msg.payload);

  if (!success) {
    // Fallback: set the text content and trigger input event
    box.textContent = msg.payload;
    box.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // Move cursor to end
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(box);
  range.collapse(false);
  selection?.removeAllRanges();
  selection?.addRange(range);

  // Trigger any necessary events
  box.dispatchEvent(new Event('input', { bubbles: true }));
  box.dispatchEvent(new Event('change', { bubbles: true }));
});
