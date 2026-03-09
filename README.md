# GitHub Copilot Usage

Displays GitHub Copilot Premium requests usage in the VS Code status bar, right next to the Copilot icon.

## Features

- **Status bar**: shows used percentage (`15%`), turns yellow/red near threshold
- **Hover tooltip**: plan, used / quota, reset date
- **Auto-refresh**: configurable interval (default 5 min)
- **Zero config**: uses your existing VS Code GitHub account sign-in

## Status bar states

| Display | Meaning |
|---------|---------|
| `25%` | Normal usage |
| `75%` (yellow) | Warning threshold reached |
| `90%` (red) | Critical threshold reached |
| `∞` | Unlimited plan |
| `—` | Plan has no premium quota (e.g. Free) |
| _(spinner)_ | Loading |
| `Sign in` | Not signed in — click to sign in |
| _(error icon)_ | API / network error |

## Requirements

Sign in to VS Code with your GitHub account (Account menu → bottom-left).

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `githubCopilotUsage.refreshIntervalMinutes` | `5` | Auto-refresh interval (1–60 min) |
| `githubCopilotUsage.warningThreshold` | `75` | Yellow warning threshold (%) |
| `githubCopilotUsage.criticalThreshold` | `90` | Red critical threshold (%) |

## Commands

- **Copilot Usage: Refresh Now** — force refresh immediately
- **Copilot Usage: Sign in with GitHub** — trigger GitHub sign-in

## Usage

Hover over the status bar item to see full details. Use the **$(refresh) icon** in the tooltip or run **Copilot Usage: Refresh Now** from the Command Palette to refresh manually.
