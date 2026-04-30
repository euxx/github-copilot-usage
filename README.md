# GitHub Copilot Usage

<div>
  <p>Shows Copilot Premium request quota usage in the VS Code status bar, right next to the Copilot icon.</p>
  <p>e.g., <code>25%</code> normal · <code>75%</code> yellow warning · <code>95%</code> red critical.</p>
</div>

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-blue?logo=visual-studio-code&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=euxx.github-copilot-usage)

## Features

- **Status bar**: shows used percentage (`15%`), turns yellow/red near threshold
- **Hover tooltip**: plan, used / quota, overage (if any), reset date, last-updated timestamp — with a refresh button and a link to [Premium request analytics](https://github.com/settings/billing/premium_requests_usage)
- **Auto-refresh**: configurable interval (default 5 min)
- **Zero config**: uses your existing VS Code GitHub account sign-in

<!-- prettier-ignore -->
| | | |
| :---: | :---: | :---: |
| <img src=".github/assets/normal.png" alt="Normal (25%)" width="190"> | <img src=".github/assets/warning.png" alt="Warning (75%)" width="190"> | <img src=".github/assets/critical.png" alt="Critical (95%)" width="190"> |
| Normal | Warning | Critical |

## Status bar states

| Display        | Meaning                                            |
| -------------- | -------------------------------------------------- |
| `25%`          | Normal usage                                       |
| `75%` (yellow) | Warning threshold reached                          |
| `90%` (red)    | Critical threshold reached                         |
| `111%` (red)   | Overage — actual usage exceeds                     |
| `∞`            | Unlimited plan                                     |
| `—`            | No premium quota data (plan has no tracked limit)  |
| `⟳`            | Loading                                            |
| `✕`            | Server error or access denied                      |
| `⚠`            | Offline or rate limited — no cached data available |
| `25% ⚠`        | Last known data — offline for > 1 hour             |
| `Sign in`      | Not signed in — click to sign in                   |

## You may also like

- <img src="https://github.com/euxx/claude-skills-for-copilot/raw/main/images/icon.png" width="20" align="absmiddle"> [**Claude Skills for Copilot**](https://marketplace.visualstudio.com/items?itemName=euxx.claude-skills-for-copilot) - Agent skills for GitHub Copilot: code review, feature dev, frontend design, and more
- <img src="https://github.com/euxx/editor-tweaks/raw/main/images/icon.png" width="20" align="absmiddle"> [**Editor Tweaks**](https://marketplace.visualstudio.com/items?itemName=euxx.editor-tweaks) - A collection of small VS Code editor utilities packed into a single extension

## License

Under the [MIT](LICENSE) License.
