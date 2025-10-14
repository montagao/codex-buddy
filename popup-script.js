const textarea = document.getElementById('content');
const copyBtn = document.getElementById('copyBtn');
const chatgptBtn = document.getElementById('chatgptBtn');
const loadingState = document.getElementById('loadingState');
const errorState = document.getElementById('errorState');
const errorMessage = document.getElementById('errorMessage');
const overlayBtn = document.getElementById('overlayBtn');

copyBtn.disabled = true;
overlayBtn.disabled = true;

let overlayRequested = false;

chrome.storage.local.get(['prContent'], (result) => {
  if (result.prContent) {
    updateContent(result.prContent);
    copyBtn.disabled = false;
    overlayBtn.disabled = false;
  }
  requestLatestSummary();
});

function requestLatestSummary() {
  setLoading(true);
  hideError();
  chrome.runtime.sendMessage({ type: 'COLLECT_SUMMARY' }, (response) => {
    if (chrome.runtime.lastError) {
      showError('Unable to reach the extension service worker.');
      setLoading(false);
      return;
    }
    if (!response?.ok) {
      showError(response?.error || 'Failed to collect PR summary.');
      setLoading(false);
      return;
    }
    updateContent(response.payload);
    const hasContent = Boolean(response.payload);
    copyBtn.disabled = !hasContent;
    overlayBtn.disabled = !hasContent;
    setLoading(false);

    if (hasContent && !overlayRequested) {
      overlayRequested = true;
      openOverlay(true);
    }
  });
}

copyBtn.addEventListener('click', async () => {
  textarea.select();
  try {
    await navigator.clipboard.writeText(textarea.value);
    showCopySuccess();
  } catch (err) {
    document.execCommand('copy');
    showCopySuccess();
  }
});

chatgptBtn.addEventListener('click', () => {
  window.open('https://chat.openai.com/?model=gpt-5-pro', '_blank');
});

overlayBtn.addEventListener('click', () => {
  openOverlay(false);
});

function updateContent(value) {
  textarea.value = value || 'No content collected yet.';
  textarea.scrollTop = 0;
}

function setLoading(isLoading) {
  if (!loadingState) return;
  loadingState.classList.toggle('is-visible', isLoading);
  copyBtn.disabled = isLoading;
  overlayBtn.disabled = isLoading;
}

function openOverlay(autoTrigger) {
  const invoke = () => {
    overlayBtn.disabled = true;
    chrome.runtime.sendMessage({ type: 'SHOW_OVERLAY' }, (response) => {
      overlayBtn.disabled = false;
      if (chrome.runtime.lastError) {
        showError(
          autoTrigger
            ? 'Unable to launch the full view automatically.'
            : 'Unable to open the full view.'
        );
        return;
      }
      if (!response?.ok) {
        showError(response?.error || 'Could not open the full summary view.');
        return;
      }
      if (!autoTrigger) {
        overlayRequested = true;
      }
    });
  };

  if (autoTrigger) {
    setTimeout(invoke, 150);
  } else {
    invoke();
  }
}

function showError(message) {
  if (!errorState) return;
  if (errorMessage) {
    errorMessage.textContent = message;
  }
  errorState.classList.add('is-visible');
}

function hideError() {
  if (!errorState) return;
  errorState.classList.remove('is-visible');
}

function showCopySuccess() {
  const success = document.getElementById('copySuccess');
  if (!success) return;
  success.classList.add('is-visible');
  setTimeout(() => {
    success.classList.remove('is-visible');
  }, 2000);
}
