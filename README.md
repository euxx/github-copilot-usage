# GitHub Copilot Usage

<img src="images/icon.png" width="70" alt="GitHub Copilot Usage" align="left">

<div>
  <p>Shows Copilot Premium request quota usage in the VS Code status bar, right next to the Copilot icon.</p>
  <p>e.g., <code>25%</code> normal · <code>75%</code> yellow warning · <code>95%</code> red critical.</p>
</div>

## Features

- **Status bar**: shows used percentage (`15%`), turns yellow/red near threshold
- **Hover tooltip**: plan, used / quota, overage (if any), reset date
- **Auto-refresh**: configurable interval (default 5 min)
- **Zero config**: uses your existing VS Code GitHub account sign-in

| | | |
| :---: | :---: | :---: |
| <img src=".github/assets/normal.png" alt="Normal (25%)" width="280"> | <img src=".github/assets/warning.png" alt="Warning (75%)" width="280"> | <img src=".github/assets/critical.png" alt="Critical (95%)" width="280"> |
| Normal | Warning | Critical |

## Status bar states

| Display | Meaning |
|---------|---------|
| `25%` | Normal usage |
| `75%` (yellow) | Warning threshold reached |
| `90%` (red) | Critical threshold reached |
| `∞` | Unlimited plan |
| `—` | No premium quota data (plan has no tracked limit) |
| `Sign in` | Not signed in — click to sign in |
| _(spinner)_ | Loading |
| _(error icon)_ | API / network error |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `githubCopilotUsage.refreshIntervalMinutes` | `5` | Auto-refresh interval (1–60 min) |
| `githubCopilotUsage.warningThreshold` | `75` | Yellow warning threshold (%) |
| `githubCopilotUsage.criticalThreshold` | `90` | Red critical threshold (%) |

## License

Under the [MIT](LICENSE) License.
