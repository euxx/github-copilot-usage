// @ts-nocheck
'use strict';

const vscode = require('vscode');
const { fetchUsage } = require('./api');

/** @type {vscode.StatusBarItem} */
let statusBarItem;
/** @type {NodeJS.Timeout | undefined} */
let refreshTimer;
/** @type {import('./api').UsageData | null} */
let lastData = null;
/** @type {Date | null} */
let lastUpdatedAt = null;
/** @type {boolean} */
let refreshInFlight = false;
/** @type {boolean} */
let pendingSignIn = false;
/** @type {boolean} */
let deactivated = false;
/** @type {boolean} */
let isOffline = false;
/** @type {Date | null} */
let offlineSince = null;
/** @type {NodeJS.Timeout | undefined} */
let recoveryTimer;
/** @type {boolean} */
let recoveryActive = false;

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
  deactivated = false;
  // Right, 100.099999: position adjacent to chat.statusBarEntry (Copilot icon, priority 100.1)
  statusBarItem = vscode.window.createStatusBarItem(
    'github-copilot-usage',
    vscode.StatusBarAlignment.Right,
    100.099999,
  );
  statusBarItem.name = 'GitHub Copilot Usage';
  context.subscriptions.push(statusBarItem);

  context.subscriptions.push(
    vscode.commands.registerCommand('githubCopilotUsage.refresh', () => refresh(false, true)),
    vscode.commands.registerCommand('githubCopilotUsage.signIn', () => refresh(true, true)),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('githubCopilotUsage')) {
        resetTimer();
        refresh();
      }
    }),
  );

  await refresh(true); // prompt for GitHub sign-in on startup if no session
  resetTimer();
}

function deactivate() {
  deactivated = true;
  isOffline = false;
  offlineSince = null;
  statusBarItem?.hide();
  clearTimer();
  clearRecoveryTimer();
}

// ---------------------------------------------------------------------------
// Core refresh logic
// ---------------------------------------------------------------------------

/**
 * @param {boolean} [promptSignIn]
 * @param {boolean} [isManual] Only show loading indicator for user-initiated refreshes.
 */
async function refresh(promptSignIn = false, isManual = false) {
  if (deactivated) return;
  if (promptSignIn) pendingSignIn = true; // record intent even if in-flight
  if (refreshInFlight) return;

  const doSignIn = pendingSignIn;
  pendingSignIn = false;
  refreshInFlight = true;
  if (isManual) showLoading();
  try {
    let session;
    try {
      session = await vscode.authentication.getSession('github', ['user:email', 'read:user'], {
        silent: !doSignIn,
        createIfNone: doSignIn,
      });
    } catch {
      // User cancelled the sign-in prompt (createIfNone: true throws on cancel)
      isOffline = false;
      offlineSince = null;
      showNoAuth();
      return;
    }

    if (!session) {
      isOffline = false;
      offlineSince = null;
      showNoAuth();
      return;
    }

    const data = await fetchUsage(session.accessToken);
    lastData = data;
    lastUpdatedAt = new Date();
    isOffline = false;
    offlineSince = null;
    clearRecoveryTimer();
    updateStatusBar(data);
  } catch (err) {
    const code = err?.code;

    // Any error that reached the server means we are online — clear offline state.
    if (code !== 'NETWORK_ERROR' && code !== 'TIMEOUT') {
      isOffline = false;
      offlineSince = null;
      clearRecoveryTimer();
    }

    if (code === 'AUTH') {
      showNoAuth();
    } else if (code === 'FORBIDDEN') {
      showError('Access denied — check Copilot subscription or org policy');
    } else if (code === 'RATE_LIMIT') {
      if (lastData) {
        // Keep last data but mark tooltip
        try {
          updateStatusBar(lastData, true);
        } catch {
          renderStatus({ text: '$(alert)', tooltip: 'Copilot Usage: Rate limited' });
        }
      } else {
        renderStatus({ text: '$(alert)', tooltip: 'Copilot Usage: Rate limited' });
      }
    } else if (code === 'SERVER_ERROR') {
      showError('API error (5xx)');
    } else if (code === 'NETWORK_ERROR' || code === 'TIMEOUT') {
      if (!isOffline) {
        isOffline = true;
        offlineSince = new Date();
        startRecoveryTimer();
      }
      if (lastData) {
        updateStatusBar(lastData);
      } else {
        renderStatus({
          text: '$(alert)',
          tooltip: 'Copilot Usage: Offline',
        });
      }
    } else {
      showError('Network / API error');
    }
  } finally {
    refreshInFlight = false;
    if (pendingSignIn) {
      // A sign-in was requested while the previous request was in-flight; honour it now.
      setTimeout(() => refresh(), 0);
    }
  }
}

// ---------------------------------------------------------------------------
// Status bar rendering
// ---------------------------------------------------------------------------

/**
 * Compute the display percentage for the status bar.
 * When overage is active, returns the actual total (e.g. 111 when 11% over quota).
 * @param {import('./api').UsageData} data
 * @returns {number}
 */
function computeDisplayPct(data) {
  if (data.overageEnabled && data.overageUsed > 0 && data.quota > 0) {
    return Math.round(100 + (data.overageUsed / data.quota) * 100);
  }
  return data.usedPct;
}

const BILLING_URL = 'https://github.com/settings/billing/premium_requests_usage';

/**
 * @param {import('./api').UsageData} data
 * @param {boolean} [isRateLimited]
 */
function updateStatusBar(data, isRateLimited = false) {
  const cfg = getConfig();
  const isStale = computeIsStale(isOffline, offlineSince);
  const staleIcon = isStale ? ' $(warning)' : '';

  if (data.noData) {
    const md = new vscode.MarkdownString('', true);
    md.isTrusted = { enabledCommands: ['githubCopilotUsage.refresh'] };
    md.appendMarkdown('**GitHub Copilot Usage**\n\nPlan: ');
    md.appendText(data.plan);
    md.appendMarkdown(`\n\nNo premium quota &nbsp;[$(graph)](${BILLING_URL})\n\n`);
    if (lastUpdatedAt) md.appendMarkdown(`Updated at ${formatTimestamp(lastUpdatedAt)} `);
    md.appendMarkdown(`[$(refresh)](command:githubCopilotUsage.refresh)`);
    if (isRateLimited) md.appendMarkdown('\n\nRate limit \u00b7 data may be outdated');
    if (isStale || isOffline) md.appendMarkdown('\n\nOffline \u00b7 data may be outdated');
    renderStatus({ text: `\u2014${staleIcon}`, tooltip: md });
    return;
  }

  if (data.unlimited) {
    renderStatus({ text: `\u221e${staleIcon}`, tooltip: buildTooltip(data, isRateLimited, isOffline, isStale) });
    return;
  }

  const pct = computeDisplayPct(data);
  let color;
  if (cfg.thresholdEnabled) {
    if (pct >= cfg.thresholdCritical) {
      color = new vscode.ThemeColor('editorError.foreground');
    } else if (pct >= cfg.thresholdWarning) {
      color = new vscode.ThemeColor('editorWarning.foreground');
    }
  }

  renderStatus({
    text: `${pct}%${staleIcon}`,
    tooltip: buildTooltip(data, isRateLimited, isOffline, isStale),
    color,
  });
}

/**
 * @param {import('./api').UsageData} data
 * @param {boolean} isRateLimited
 * @param {boolean} [isOfflineState]
 * @param {boolean} [isStale]
 * @returns {vscode.MarkdownString}
 */
function buildTooltip(data, isRateLimited, isOfflineState = false, isStale = false) {
  const md = new vscode.MarkdownString('', true);
  md.isTrusted = { enabledCommands: ['githubCopilotUsage.refresh'] };
  md.appendMarkdown('**GitHub Copilot Usage**\n\nPlan: ');
  md.appendText(data.plan);
  md.appendMarkdown('\n\n');

  if (data.unlimited) {
    md.appendMarkdown(`Quota: Unlimited &nbsp;[$(graph)](${BILLING_URL})\n\n`);
  } else {
    md.appendMarkdown(`Used: ${data.used} / ${data.quota} (${data.usedPct}%) &nbsp;[$(graph)](${BILLING_URL})\n\n`);
    if (data.overageEnabled && data.overageUsed > 0) {
      md.appendMarkdown(`Overage: ${data.overageUsed} requests\n\n`);
    }
    const resetStr = data.resetDate.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    md.appendMarkdown('Reset: ');
    md.appendText(resetStr);
    md.appendMarkdown('\n\n');
  }

  if (lastUpdatedAt) md.appendMarkdown(`Updated at ${formatTimestamp(lastUpdatedAt)} `);
  md.appendMarkdown('[$(refresh)](command:githubCopilotUsage.refresh)');
  if (isRateLimited) {
    md.appendMarkdown('\n\nRate limit \u00b7 data may be outdated');
  }
  if (isStale || isOfflineState) {
    md.appendMarkdown('\n\nOffline \u00b7 data may be outdated');
  }
  return md;
}

/** @param {Date} date @returns {string} yyyy-MM-dd HH:mm:ss, or HH:mm:ss if today */
function formatTimestamp(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  if (sameDay) return time;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${time}`;
}

function showLoading() {
  renderStatus({ text: '$(sync~spin)', tooltip: 'Loading Copilot usage…' });
}

/** @param {string} message */
function showError(message) {
  renderStatus({
    text: '$(error)',
    tooltip: `Copilot Usage: ${message}`,
    color: new vscode.ThemeColor('editorError.foreground'),
  });
}

function showNoAuth() {
  renderStatus({
    text: 'Sign in',
    tooltip: 'Click to sign in with GitHub',
    command: 'githubCopilotUsage.signIn',
  });
}

/**
 * @param {{ text: string, tooltip: string | vscode.MarkdownString, command?: string, color?: vscode.ThemeColor }} opts
 */
function renderStatus({ text, tooltip, command = undefined, color = undefined }) {
  if (deactivated) return;
  statusBarItem.text = text;
  statusBarItem.command = command;
  statusBarItem.color = color;
  statusBarItem.tooltip = tooltip;
  statusBarItem.show();
}

// ---------------------------------------------------------------------------
// Timer helpers
// ---------------------------------------------------------------------------

function resetTimer() {
  if (recoveryActive) return; // recovery mode owns the schedule; don't create a competing timer
  clearTimer();
  const { refreshIntervalMinutes } = getConfig();
  const n = Number(refreshIntervalMinutes);
  const ms = Math.max(1, Math.min(60, Number.isFinite(n) ? n : 5)) * 60 * 1000;
  refreshTimer = setInterval(() => refresh(), ms);
}

function clearTimer() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = undefined;
  }
}

const RECOVERY_INTERVAL_MS = 10 * 1000; // 10 s

function startRecoveryTimer() {
  if (recoveryActive) return; // already running
  clearTimer(); // pause normal refresh while in recovery mode
  recoveryActive = true;
  _scheduleNextRecovery();
}

/** Schedule one recovery attempt after RECOVERY_INTERVAL_MS.
 *  After the attempt completes (success, error, or timeout), reschedules itself
 *  if still in recovery mode — giving a clean 10 s gap after every outcome.
 */
function _scheduleNextRecovery() {
  recoveryTimer = setTimeout(async () => {
    recoveryTimer = undefined; // this timeout has fired
    if (!recoveryActive) return; // clearRecoveryTimer() was called while we were waiting
    if (!isOffline) {
      clearRecoveryTimer();
      return;
    }
    await refresh().catch(() => {}); // refresh() handles errors internally; .catch prevents stuck recovery on unexpected throw
    if (recoveryActive) _scheduleNextRecovery(); // still offline → retry in 10 s
  }, RECOVERY_INTERVAL_MS);
}

function clearRecoveryTimer() {
  if (!recoveryActive) return;
  recoveryActive = false;
  if (recoveryTimer) {
    clearTimeout(recoveryTimer);
    recoveryTimer = undefined;
  }
  if (!deactivated) resetTimer(); // restore normal refresh schedule
}

// ---------------------------------------------------------------------------
// Config helper
// ---------------------------------------------------------------------------

function getConfig() {
  const cfg = vscode.workspace.getConfiguration('githubCopilotUsage');
  const rawWarning = cfg.get('threshold.warning', 75);
  const rawCritical = cfg.get('threshold.critical', 90);
  // Coerce to number and fall back to defaults if non-numeric (e.g. user entered a string)
  const warning = Number.isFinite(Number(rawWarning)) ? Number(rawWarning) : 75;
  const critical = Number.isFinite(Number(rawCritical)) ? Number(rawCritical) : 90;
  return {
    refreshIntervalMinutes: cfg.get('refreshIntervalMinutes', 5),
    thresholdEnabled: cfg.get('threshold.enabled', true),
    // Clamp warning to at most critical so misconfiguration (warning > critical) degrades gracefully.
    thresholdWarning: Math.min(warning, critical),
    thresholdCritical: critical,
  };
}

/**
 * Pure helper: returns true only when offline for > 1 h.
 * @param {boolean} offline
 * @param {Date | null} since
 * @returns {boolean}
 */
function computeIsStale(offline, since) {
  return offline && since !== null && Date.now() - since.getTime() > 60 * 60 * 1000;
}

module.exports = {
  activate,
  deactivate,
  formatTimestamp,
  getConfig,
  buildTooltip,
  computeIsStale,
  computeDisplayPct,
  // Test-only: inspect and mutate module-level state.
  _setState: (s) => {
    if ('isOffline' in s) isOffline = s.isOffline;
    if ('offlineSince' in s) offlineSince = s.offlineSince;
    if ('lastData' in s) lastData = s.lastData;
    if ('lastUpdatedAt' in s) lastUpdatedAt = s.lastUpdatedAt;
  },
  _getState: () => ({
    isOffline,
    offlineSince,
    recoveryTimerActive: recoveryActive,
    refreshTimerActive: !!refreshTimer,
  }),
  // Test-only: directly invoke timer lifecycle.
  _startRecoveryTimer: startRecoveryTimer,
  _clearRecoveryTimer: clearRecoveryTimer,
  _resetTimer: resetTimer,
  _clearTimer: clearTimer,
};
