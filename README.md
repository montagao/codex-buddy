# Codex Buddy

[![CI](https://github.com/codex-helper/codex-helper/actions/workflows/ci.yml/badge.svg)](https://github.com/codex-helper/codex-helper/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Codex Buddy is a Chrome extension that collects every “Version” tab on a ChatGPT Codex review page, composes a markdown summary, and hands it off to ChatGPT’s gpt-5-pro or gpt-5-thinking models with one click.

https://github.com/codex-helper/codex-helper/assets/demo.gif

## Features

- 🔍 Automatically scans Codex review pages and extracts task details, summaries, testing notes, and file diffs
- 📋 Copies a neatly formatted markdown report (with customizable headings and review questions) and launches gpt-5-pro or gpt-5-thinking on demand
- 🪟 Overlay workspace that shows progress in real time while the extension scrapes
- ⚙️ Options page for configuring templates and review prompts
- 📤 Paste helper for ChatGPT so the summary drops straight into a new conversation

## Quick Start

```bash
git clone https://github.com/codex-helper/codex-helper.git
cd codex-helper
npm install
npm run dev
```

1. Open `chrome://extensions`, enable **Developer Mode**, and click **Load unpacked**.
2. Select the `dist/` folder Vite generated.
3. Navigate to a Codex task (`https://chatgpt.com/codex/tasks/<id>`) and click the toolbar icon.

## Scripts

| Command                                   | Description                                                                 |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| `npm run dev`                             | Vite in watch mode; rebuilds into `dist/`.                                  |
| `npm run build`                           | Production build (minified assets in `dist/`).                              |
| `npm run preview`                         | Serves the built extension locally.                                         |
| `npm run lint`                            | Runs ESLint on TypeScript/JavaScript sources.                               |
| `npm run format` / `npm run format:check` | Format (or verify formatting) with Prettier.                                |
| `npm test`                                | Executes Vitest unit tests.                                                 |
| `npm run check`                           | Convenience task that runs lint, format check, test, and build in sequence. |

## Project Layout

```
.
├── background-simple.js      # MV3 service worker (UI orchestration, caching)
├── popup.html / popup-script.js
├── options.html / options.js # Options UI + template customization
├── src/
│   ├── content.ts            # Scrapes Codex version tabs
│   ├── paste.ts              # Paste helper for chat.openai.com
│   └── collect-inline.js     # Legacy in-page helper
├── docs/architecture.md      # Component + message flow reference
└── manifest.json             # Permissions & entry points
```

Refer to [docs/architecture.md](./docs/architecture.md) for a deeper walkthrough of the messaging flow and storage keys.

## Testing & QA

- Unit tests run with Vitest (`npm test`).
- Linting and formatting keep the codebase consistent (`npm run check`).
- Manual QA checklist (recommended before release):
  - Collect multiple versions on a live Codex task page.
  - Verify the overlay progress updates.
  - Copy the summary to the clipboard and paste into ChatGPT.
  - Adjust templates in Options and confirm they apply to the next run.

## Contributing

We welcome issues and pull requests! Please review our [Code of Conduct](./CODE_OF_CONDUCT.md) and [Contributing Guide](./CONTRIBUTING.md) before getting started. Bug reports and feature requests can be filed using the templates in `.github/ISSUE_TEMPLATE/`.

To propose a change:

1. Create a feature branch from `master`.
2. Ensure `npm run check` passes.
3. Open a PR describing the change, tests, and manual QA.

## Release Process

1. Update `manifest.json`’s `version`.
2. Run `npm run check && npm run build`.
3. Zip the contents of `dist/`.
4. Publish/update the Chrome Web Store listing.

## License

Codex Buddy is released under the [MIT License](./LICENSE).

made with 🤖 by [@montakaoh](https://x.com/montakaoh)
