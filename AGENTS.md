# Project Conventions

## After Making Changes

After modifying code, ensure to run the following commands to maintain code quality:

- `npm run ci` - Run all checks (tests + lint + format check)

Or run individually:

- `npm run lint` - Lint code (ESLint)
- `npm run lint:fix` - Lint and auto-fix
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check formatting without writing

## Key Technical Details

- **API**: `GET https://api.github.com/copilot_internal/user` using the VS Code GitHub session token
- **Authentication**: Uses `vscode.authentication.getSession` with `github` provider; cancellation is handled gracefully via inner try/catch
- **Auto-refresh**: Configurable interval (1–60 min, default 5 min) via `githubCopilotUsage.refreshIntervalMinutes`
- **Status bar priority**: `100.099999` — positions usage indicator just to the right of the Copilot icon (`chat.statusBarEntry` at `100.1`)
