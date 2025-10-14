# Contributing to Codex Helper

Thanks for your interest in improving the Codex Helper extension! We welcome bug reports, feature suggestions, and pull requests. This guide explains how to get started.

## Code of Conduct

Please review our [Code of Conduct](./CODE_OF_CONDUCT.md) before participating. By contributing you agree to uphold it.

## Development Setup

1. Fork and clone the repository.
2. Install Node.js 20 (see `.tool-versions` or `.nvmrc` when present). We recommend [asdf](https://asdf-vm.com/) or [nvm](https://github.com/nvm-sh/nvm).
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the dev server:
   ```bash
   npm run dev
   ```
   Load the generated `dist/` folder as an unpacked extension at `chrome://extensions`.

### Test & Lint

Run the full check suite before opening a pull request:

```bash
npm run lint
npm run format:check
npm test
npm run build
```

CI will run the same commands on every PR.

## Issue Reporting

- Search the issue tracker first to avoid duplicates.
- Provide clear reproduction steps, expected vs. actual behavior, and environment details (browser version, OS, etc.).
- For security vulnerabilities, **do not** open a public issue. Email maintainers@codex-helper.dev instead.

## Pull Requests

- Open an issue before working on new features to gather feedback.
- Keep PRs focused. Separate unrelated changes into different branches.
- Update documentation (README, architecture notes) when behavior changes.
- Add tests when fixing bugs or adding features.
- Run the lint/test/build commands before pushing.
- Follow the existing TypeScript style (2 spaces, single quotes, arrow functions).

## Commit Messages

Use concise, present-tense summaries (e.g., `add overlay loading indicator`). If you need to reference an issue, include `Refs #123` in the body.

## Release Workflow

Maintainers bump the `manifest.json` version, update the changelog, run `npm run build`, and publish the zipped `dist/` folder to the Chrome Web Store.

## Questions?

Ping us in an issue, or email maintainers@codex-helper.dev. Thanks again for helping us ship a smoother PR review experience!
