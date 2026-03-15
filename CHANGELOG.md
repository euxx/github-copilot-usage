# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.4.0] - 2026-03-15

### Added

- **Offline graceful degradation**: when the network is unavailable, the last known usage data is preserved in the
  status bar instead of showing an error icon
- **Stale data indicator**: a `$(warning)` suffix is appended to the status bar text after 1 hour offline (e.g.
  `25% ⚠`), signalling that cached data may be outdated
- **Rate-limit resilience**: when rate-limited by the API, last known data is likewise preserved with a tooltip
  notice instead of showing a red error icon
- **`$(alert)` icon** when offline or rate-limited with no cached data available (consistent with VS Code's own
  offline status bar behaviour)

### Changed

- Tooltip notices ("Offline · data may be outdated", "Rate limit · data may be outdated") are now plain text,
  positioned as the last line of the tooltip
- Unlimited plan tooltip now includes a link to Premium request analytics
- README: updated status bar states table with the new states and Unicode icon representations

## [0.3.3] - 2026-03-14

### Changed

- Standardized icon spec
- Synced config and docs from template

## [0.3.2] - 2026-03-13

- Update icon image to a clearer version
- Fix: `threshold.warning`/`threshold.critical` values now coerced to numbers — non-numeric config strings (e.g. `"off"`) no longer produce `NaN` and silently break status bar coloring
- Fix: rate-limit handler no longer lets `updateStatusBar` errors escape as unhandled promise rejections
- Add unit tests for `formatTimestamp`, `getConfig`, and `buildTooltip`

## [0.3.1] - 2026-03-12

- Packaging: exclude dev files (tests, configs, dotfiles) from the published extension

## [0.3.0] - 2026-03-11

- ⏱️ Show last-updated timestamp in tooltip (`Updated at HH:mm:ss`, or full date across days)
- 📊 Add link icon in tooltip to open Premium request analytics on GitHub

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
