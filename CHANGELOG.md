# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.5.5] - 2026-09-01

### Changed

- Tooltip analytics links now open GitHub's current [AI usage](https://github.com/settings/billing/ai_usage) page and expose a `View AI usage` hover title.

### Fixed

- Finite quotas now ignore aggregate `credits_used` values that have no entitlement denominator, continuing to derive usage from `quota_remaining` or `percent_remaining` in line with VS Code.
- Active quotas now prefer their category-specific `quota_reset_at`; exhausted organization pools retain the existing reset behavior for legacy and token-based billing modes.

## [0.5.4] - 2026-07-31

### Changed

- Unlimited plans now show consumed credits in the tooltip when GitHub returns `credits_used`, for example `Used: 1,284 / Unlimited`, together with the relevant reset time. The status bar remains `∞`, and pooled-exhaustion warnings still take priority.

### Fixed

- Preserve defined quota snapshot fields across partial API responses for the same account and tracking identity, including explicit `0` and `false` updates.
- Clear cached quota and offline usage data when snapshots disappear, authentication ends, or the active GitHub account changes, preventing stale values from leaking across accounts.

## [0.5.3] - 2026-06-18

### Changed

- Tooltip now shows the additional usage budget when GitHub returns `overage_entitlement`, e.g. `Additional credits: 5 / 50`, while preserving the previous display for older API responses.

## [0.5.1] - 2026-06-03

### Fixed

- Free token-based Copilot accounts now show their Credits usage instead of `—`. GitHub can report these accounts as `copilot_plan=individual` with `access_type_sku=free_limited_copilot`, while the usable Credits quota lives in `quota_snapshots.chat` instead of `quota_snapshots.premium_interactions`.

## [0.5.0] - 2026-05-27

### Added

- **Token-based billing (UBB) support**: auto-detects GitHub's new credit-based billing mode via the `token_based_billing` field. The tooltip title switches between **Copilot Premium Requests** (legacy) and **Copilot Credits** (UBB), so the count line stays a familiar `Used: 90 / 300 (30%)`. Overage line still labels its unit (`Overage: 5 requests` vs `Additional credits: 5`).
- **`individual_max` (Max) and `individual_edu` (Student) plans** in the plan-name map.
- **Per-snapshot `quota_reset_at`** (Unix seconds) read with top priority under UBB; falls back to `quota_reset_date_utc` then `quota_reset_date`. Shared by all return paths so pooled-exhausted users still see real reset times.
- **Precise `used` calculation** via `quota_remaining` when present (avoids float precision loss from percentage-based reverse calculation). Tooltip formats `used`, `quota`, and overage values with `Intl.NumberFormat({ maximumFractionDigits: 2 })` to preserve fractional precision (e.g. `195.9` instead of `196`), matching upstream's `quotaCreditsFormatter`.
- **Pooled entitlement exhaustion**: enterprise unlimited plans signaling `has_quota=false` (without overage) now display `100%` red instead of misleadingly showing `∞`. Tooltip surfaces "Quota: Unlimited · pool exhausted" with the reset date.

### Changed

- `entitlement` parse handles string values (`'300'`) emitted under UBB; `entitlement: '0'` (not unlimited) now correctly routes to the no-data state, matching upstream `parseQuotas` behavior. Missing `entitlement` (`undefined`) is preserved as a distinct case and stays on the normal path.

## [0.4.4] - 2026-04-30

### Changed

- README: use Marketplace links in "You may also like" section

## [0.4.3] - 2026-04-30

### Fixed

- **Status bar refresh deadlock** when the API response body stalls: the 15s timeout now covers `res.json()` body reading, not only the headers. Previously a hung response body could leave `refreshInFlight` stuck `true`, blocking all subsequent manual and automatic refreshes until VS Code reload.

## [0.4.2] - 2026-03-16

### Changed

- **Overage percentage in status bar**: when quota is exceeded and overage is active, the status bar now shows the actual usage percentage (e.g. `111%`) instead of `100%`, making overage visible at a glance without opening the tooltip.

## [0.4.1] - 2026-03-16

### Added

- **Automatic offline recovery**: when a network error or timeout occurs, a 10-second polling loop retries the API automatically. Once connectivity is restored, the normal refresh schedule resumes — no manual intervention required.

## [0.4.0] - 2026-03-15

### Added

- **Offline graceful degradation**: when the network is unavailable, the last known usage data is preserved in the status bar instead of showing an error icon
- **Stale data indicator**: a `$(warning)` suffix is appended to the status bar text after 1 hour offline (e.g. `25% ⚠`), signalling that cached data may be outdated
- **Rate-limit resilience**: when rate-limited by the API, last known data is likewise preserved with a tooltip notice instead of showing a red error icon
- **`$(alert)` icon** when offline or rate-limited with no cached data available (consistent with VS Code's own offline status bar behaviour)

### Changed

- Tooltip notices ("Offline · data may be outdated", "Rate limit · data may be outdated") are now plain text, positioned as the last line of the tooltip
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
