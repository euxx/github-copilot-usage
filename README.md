# GitHub Copilot Usage

Show GitHub Copilot usage in the VS Code status bar, right next to the Copilot icon. Supports Premium Requests and Credits.

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-blue?logo=visual-studio-code&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=euxx.github-copilot-usage)

## Features

- **Status bar**: shows used percentage (`15%`), turns yellow/red near threshold
- **Hover tooltip**: shows plan, usage, overage, reset date, last update, refresh button, and [AI usage](https://github.com/settings/billing/ai_usage)
- **Auto-refresh**: configurable interval (default 5 min)
- **Zero config**: uses your existing VS Code GitHub account sign-in

<!-- prettier-ignore -->
| | | |
| :---: | :---: | :---: |
| <img src=".github/assets/normal.png" alt="Normal (25%)" width="190"> | <img src=".github/assets/warning.png" alt="Warning (75%)" width="190"> | <img src=".github/assets/critical.png" alt="Critical (95%)" width="190"> |
| Normal | Warning | Critical |

## Status bar states

| Display        | Meaning                                                         |
| -------------- | --------------------------------------------------------------- |
| `25%`          | Normal usage                                                    |
| `75%` (yellow) | Warning threshold reached                                       |
| `90%` (red)    | Critical threshold reached                                      |
| `100%` (red)   | Pooled entitlement exhausted (enterprise unlimited, no overage) |
| `111%` (red)   | Overage — actual usage exceeds quota                            |
| `∞`            | Unlimited plan                                                  |
| `—`            | No quota data to display                                        |
| `⟳`            | Loading                                                         |
| `✕`            | Server error or access denied                                   |
| `⚠`            | Offline or rate limited — no cached data available              |
| `25% ⚠`        | Last known data — offline for > 1 hour                          |
| `Sign in`      | Not signed in — click to sign in                                |

## You may also like

- <img src="https://github.com/euxx/claude-skills-for-copilot/raw/main/images/icon.png" width="20" align="absmiddle"> [**Claude Skills for Copilot**](https://marketplace.visualstudio.com/items?itemName=euxx.claude-skills-for-copilot) - Agent skills for GitHub Copilot: code review, feature dev, frontend design, and more
- <img src="https://github.com/euxx/editor-tweaks/raw/main/images/icon.png" width="20" align="absmiddle"> [**Editor Tweaks**](https://marketplace.visualstudio.com/items?itemName=euxx.editor-tweaks) - A collection of small VS Code editor utilities packed into a single extension

## License

Under the [MIT](LICENSE) License.
