# GitHub Copilot Usage

<div>
  <p>Shows Copilot Premium request quota usage in the VS Code status bar, right next to the Copilot icon.</p>
  <p>e.g., <code>25%</code> normal · <code>75%</code> yellow warning · <code>95%</code> red critical.</p>
</div>

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-blue?logo=visual-studio-code&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=euxx.github-copilot-usage)

## Features

- **Status bar**: shows used percentage (`15%`), turns yellow/red near threshold
- **Hover tooltip**: plan, used / quota, overage (if any), reset date
- **Auto-refresh**: configurable interval (default 5 min)
- **Zero config**: uses your existing VS Code GitHub account sign-in

| | | |
| :---: | :---: | :---: |
| <img src=".github/assets/normal.png" alt="Normal (25%)" width="190"> | <img src=".github/assets/warning.png" alt="Warning (75%)" width="190"> | <img src=".github/assets/critical.png" alt="Critical (95%)" width="190"> |
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

## License

Under the [MIT](LICENSE) License.
