# Development

## Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [VS Code](https://code.visualstudio.com/) with the Extension Development Host

## Setup

1. Clone the repository
2. Install dependencies and set up git hooks:
   ```bash
   npm install
   ```

## Running the Extension

Open the project in VS Code and press **F5** to launch the Extension Development Host. The extension activates automatically on startup.

## Scripts

| Command                | Description                                    |
| ---------------------- | ---------------------------------------------- |
| `npm test`             | Run tests (Vitest)                             |
| `npm run ci`           | Run all checks (syntax + lint + format + test) |
| `npm run syntax`       | Check source files for syntax errors           |
| `npm run lint`         | Lint code (oxlint)                             |
| `npm run format`       | Format code (oxfmt)                            |
| `npm run format:check` | Check code formatting                          |
| `npm run package`      | Package extension as `.vsix`                   |

## Testing

```bash
npm test     # Run all tests
npm run ci   # Run syntax + lint + format + test in one step
```

Tests use [Vitest](https://vitest.dev/).

## Local Packaging

```bash
npm run package
```

This produces a `.vsix` file. To install it locally:

```bash
code --install-extension my-extension-0.0.1.vsix
```

Or use **Extensions: Install from VSIX** in the VS Code UI.

<!-- END-SHARED -->

## Notes

You must be signed in to GitHub (`githubCopilotUsage.signIn`) and have an active Copilot subscription.

Tests mock `fetch` globally — no network calls are made.

### Key Technical Notes

- **API endpoint**: `GET https://api.github.com/copilot_internal/user`
- **Auth**: VS Code `authentication.getSession('github', ...)` — uses the user's existing GitHub session; cancellation handled gracefully via inner try/catch
- **Auto-refresh**: Configurable interval (1–60 min, default 5 min) via `githubCopilotUsage.refreshIntervalMinutes`
- **Status bar position**: Priority `100.099999` — places the indicator just to the right of the Copilot icon (`chat.statusBarEntry` at `100.1`)

### Upstream Reference (vscode)

This extension parses the same `copilot_internal/user` payload the VS Code Copilot UI consumes. When the API or field semantics change, these are the upstream files worth diffing — clone [microsoft/vscode](https://github.com/microsoft/vscode) alongside this repo and check them periodically.

| Path                                                                       | What to watch for                                                                                                                                                                |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/vs/workbench/services/chat/common/chatEntitlementService.ts`          | `parseQuotas` — source of truth for field priority, types, and edge cases (entitlement string→number, `quota_reset_at`, Free CFI shape, etc.).                                   |
| `src/vs/workbench/contrib/chat/test/common/chatEntitlementService.test.ts` | Upstream test cases for `parseQuotas` — the canonical fixture set; new payload shapes usually land here first.                                                                   |
| `src/vs/workbench/contrib/chat/browser/chatStatus/chatStatusDashboard.ts`  | How the dashboard renders unlimited / pooled-exhausted / overage / UBB states — useful when deciding what our single-value status bar shows.                                     |
| `src/vs/workbench/contrib/chat/test/browser/chatStatusDashboard.test.ts`   | Dashboard render expectations — mirrors what end users see in VS Code.                                                                                                           |
| `src/vs/platform/defaultAccount/common/defaultAccount.ts`                  | `IDefaultAccount` field types — confirms shape of `chat_*`, `quota_*`, and `token_based_billing` flags.                                                                          |
| `src/vs/base/common/defaultAccount.ts`                                     | Plan ID enum (`free` / `individual` / `individual_pro` / `individual_max` / `individual_edu` / `business` / `enterprise`) — keep `PLAN_MAP` in [src/api.js](src/api.js) in sync. |

Quick check: `git -C ../vscode log --since=<last-check> -- src/vs/workbench/services/chat/common/chatEntitlementService.ts src/vs/platform/defaultAccount/common/defaultAccount.ts` surfaces relevant changes without scanning the whole tree.
