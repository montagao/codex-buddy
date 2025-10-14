// background.js
console.log('Background script loaded');

chrome.action.onClicked.addListener(async (tab) => {
  console.log('Extension clicked on tab:', tab.url);

  // Check if we're on a valid Codex page
  if (!tab.url || !tab.url.includes('chatgpt.com/codex/tasks/')) {
    console.error('Not on a Codex task page');
    return;
  }

  try {
    // First, try to ping the content script
    let contentScriptExists = false;
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
      contentScriptExists = true;
    } catch (e) {
      console.log('Content script not loaded, injecting it...');
    }

    // If content script doesn't exist, inject it
    if (!contentScriptExists) {
      console.log('Injecting content script...');
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['src/content.js'],
        });
        // Give it a moment to initialize
        await new Promise((resolve) => setTimeout(resolve, 500));
        console.log('Content script injected successfully');
      } catch (injectError) {
        console.error('Failed to inject content script:', injectError);
        // Try a direct code injection as fallback
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              console.log('Direct injection: Content script loaded');
              window.postMessage({ type: 'CODEX_EXTENSION_LOADED' }, '*');
            },
          });
        } catch (e) {
          console.error('Direct injection also failed:', e);
        }
        return;
      }
    }

    console.log('Sending message to content script...');
    let response;
    try {
      response = await chrome.tabs.sendMessage(tab.id, { type: 'COLLECT_PR_INFO' });
      console.log('Response from content script:', response);
    } catch (msgError) {
      console.error('Failed to send message to content script:', msgError);
      // Last resort: try reloading the tab
      console.log('Attempting to reload the tab and retry...');
      await chrome.tabs.reload(tab.id);
      return;
    }

    if (!response?.ok) {
      console.error('Failed to collect PR info:', response?.error);
      return;
    }

    // 1. Copy to clipboard using the active tab
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (text) => {
        navigator.clipboard.writeText(text);
      },
      args: [response.payload],
    });

    // 2. Open ChatGPT gpt-5-pro in a new tab (primary review target)
    const dest = await chrome.tabs.create({ url: 'https://chat.openai.com/?model=gpt-5-pro' });

    // 3. Give the new tab a moment to load, then send the text for pasting
    chrome.tabs.onUpdated.addListener(function listener(id, info) {
      if (id === dest.id && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        chrome.tabs.sendMessage(id, { type: 'PASTE_PROMPT', payload: response.payload });
      }
    });
  } catch (error) {
    console.error('Extension error:', error);
  }
});
