# Development

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [VS Code](https://code.visualstudio.com/) with the Extension Development Host

## Setup

1. Clone the repository
2. Install dependencies and set up git hooks:
   ```bash
   npm install
   ```

## Running the Extension

Open the project in VS Code and press **F5** to launch the Extension Development Host. The extension activates automatically on startup and shows Copilot usage in the status bar.

You must be signed in to GitHub (`githubCopilotUsage.signIn`) and have an active Copilot subscription.

## Scripts

| Command                | Description                           |
| ---------------------- | ------------------------------------- |
| `npm run ci`           | Run all checks (test + lint + format) |
| `npm test`             | Run tests (Vitest)                    |
| `npm run lint`         | Lint code (ESLint)                    |
| `npm run lint:fix`     | Lint and auto-fix                     |
| `npm run format`       | Format code with Prettier             |
| `npm run format:check` | Check code formatting                 |

## Project Structure

```
src/
├── api.js          # GitHub API call: fetch Copilot usage
└── extension.js    # VS Code extension: status bar, commands, timer
tests/
└── api.test.js     # Unit tests for api.js
```

## Testing

```bash
npm test     # Run all tests
npm run ci   # Run tests + lint + format check in one step
```

Tests use [Vitest](https://vitest.dev/) and mock `fetch` globally — no network calls are made.

## Key Technical Notes

- **API endpoint**: `GET https://api.github.com/copilot_internal/user`
- **Auth**: VS Code `authentication.getSession('github', ...)` — uses the user's existing GitHub session; cancellation handled gracefully via inner try/catch
- **Auto-refresh**: Configurable interval (1–60 min, default 5 min) via `githubCopilotUsage.refreshIntervalMinutes`
- **Status bar position**: Priority `100.099999` — places the indicator just to the right of the Copilot icon (`chat.statusBarEntry` at `100.1`)

## Local Packaging

To build a `.vsix` file for local installation:

```bash
npx @vscode/vsce package --no-dependencies
```

This generates `github-copilot-usage-<version>.vsix` in the project root.

To install it locally in VS Code:

```bash
code --install-extension github-copilot-usage-<version>.vsix
```

Or in VS Code: **Extensions** → **···** (top-right) → **Install from VSIX…**
