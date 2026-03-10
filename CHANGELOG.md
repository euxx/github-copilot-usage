# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.2.0] - 2026-03-10

- ⚙️ Reorganize threshold settings under `threshold.*` namespace (`threshold.enabled`, `threshold.warning`, `threshold.critical`)
- 🔕 Add `threshold.enabled` toggle to disable status bar coloring
- 💫 Show loading spinner only on manual refresh (auto-refresh updates silently)

## [0.1.0] - 2026-03-10

- 📊 Show GitHub Copilot Premium requests usage in the VS Code status bar
- 🔄 Auto-refresh with configurable interval (default: 5 minutes)
- 🟡 Warning threshold indicator (default: 75%)
- 🔴 Critical threshold indicator (default: 90%)
- 🔐 GitHub OAuth authentication via VS Code built-in auth provider
- ⚡ Manual refresh command: "Copilot Usage: Refresh Now"
