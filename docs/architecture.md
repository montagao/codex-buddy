# Architecture Overview

This document describes how the Codex Helper extension is structured and how messages flow between its components.

## High-Level Diagram

```
┌─────────────┐       ┌────────────────────┐         ┌────────────────────────┐
│ Codex page  │◄────►│ content.ts script   │◄───────►│ background-simple.js    │
│ (chatgpt.com│       │ • collects versions │         │ • orchestrates scraping │
│ /codex/...) │       │ • extracts summary  │         │ • caches summary        │
└─────────────┘       └─────────▲──────────┘         └───────▲────────────────┘
                                │                              │
                                │ messages                     │ messages
                                │                              │
                         ┌──────┴─────────┐             ┌──────┴────────────┐
                         │ popup.html /   │             │ options.html /    │
                         │ popup-script.js│             │ options.js        │
                         │ • displays UI  │             │ • stores settings │
                         │ • copy to clip │             │ • customize text  │
                         └───────────────┘             └────────────────────┘
```

## Key Modules

| File                             | Responsibility                                                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `background-simple.js`           | Service worker entry point. Handles toolbar clicks, coordinates execution of `collectPRsWithDiffs` inside the active tab, and manages cached summaries. |
| `src/content.ts`                 | Injected into Codex review pages. It discovers “Version” buttons, extracts page content, and sends progress events back to the background script.       |
| `popup.html` / `popup-script.js` | Presents the summary to the user, supports copy-to-clipboard, deep links to ChatGPT, and triggers the overlay modal.                                    |
| `options.html` / `options.js`    | Provides a settings UI where users can customize summary templates and review questions. Values are stored in `chrome.storage.sync`.                    |
| `src/paste.ts`                   | Runs on `chat.openai.com` to automatically paste the generated summary into a new chat when requested.                                                  |
| `docs/architecture.md`           | This document.                                                                                                                                          |

## Data Flow

1. **User clicks the extension icon** (or opens the popup).  
   `background-simple.js` checks that the active tab is a Codex task, injects `collectPRsWithDiffs`, and shows loading status in both popup and overlay.

2. **`collectPRsWithDiffs` runs inside the Codex tab**.  
   It fetches user settings from `chrome.storage.sync`, traverses all version tabs, and emits `CustomEvent('CODEX_OVERLAY_PROGRESS')` events for UI updates.

3. **When scraping completes**, the background worker:
   - Saves the markdown summary to `chrome.storage.local`.

- Updates the popup textarea and overlay with the final content.
- Estimates token usage for display.

4. **Popup actions**:
   - `Copy Summary` copies the prepared markdown to the clipboard.
- `Open gpt-5-…` opens ChatGPT with either gpt-5-pro or gpt-5-thinking, whichever the user selected.
   - `Full View` triggers `SHOW_OVERLAY`, reusing cached summary if possible.

5. **Options page**:  
   Users customize headings and review questions. Inputs are debounced and persisted in `chrome.storage.sync`. The next time `collectPRsWithDiffs` runs, it applies the saved templates.

## Storage Keys

| Key                      | Type                   | Description                                           |
| ------------------------ | ---------------------- | ----------------------------------------------------- |
| `prContent`              | `chrome.storage.local` | Cached markdown summary. Cleared or replaced per run. |
| `currentVersionOnly`     | `chrome.storage.sync`  | Whether to limit scraping to the active tab.          |
| `includeReviewQuestions` | `chrome.storage.sync`  | Toggles the questions block.                          |
| `summaryTemplate`        | `chrome.storage.sync`  | Markdown header template for full output.             |
| `summariesOnlyTemplate`  | `chrome.storage.sync`  | Reserved for legacy consumers (not used in the UI).   |
| `reviewHeading`          | `chrome.storage.sync`  | Heading text (no markdown prefix required).           |
| `reviewQuestions`        | `chrome.storage.sync`  | Newline-separated question list.                      |

## Testing Strategy

| Layer       | Tool           | Coverage                                           |
| ----------- | -------------- | -------------------------------------------------- |
| Unit        | Vitest + jsdom | Template utilities and UI helpers.                 |
| Integration | Manual         | Chrome extension flows (due to WebExtension APIs). |

See `README.md` for how to run the automated checks.

## Future Enhancements

- Add automated browser tests using Playwright for popup/overlay flows.
- Localize text strings and surface a dark theme to match ChatGPT.
- Explore using MV3 `action.openPopup()` once stable to improve overlay onboarding.
