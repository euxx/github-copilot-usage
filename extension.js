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
/** @type {boolean} */
let refreshInFlight = false;
/** @type {boolean} */
let pendingPromptLogin = false;
/** @type {boolean} */
let deactivated = false;

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
  deactivated = false;
  // Right, 100: just to the right of chat.statusBarEntry (Copilot icon, internal priority ~100.1)
  statusBarItem = vscode.window.createStatusBarItem(
    'github-copilot-usage',
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.name = 'GitHub Copilot Usage';
  context.subscriptions.push(statusBarItem);

  context.subscriptions.push(
    vscode.commands.registerCommand('githubCopilotUsage.refresh', () => refresh()),
    vscode.commands.registerCommand('githubCopilotUsage.login', () => refresh(true)),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('githubCopilotUsage')) {
        resetTimer();
        refresh();
      }
    })
  );

  showLoading();
  await refresh(true);  // prompt for GitHub login on startup if no session
  resetTimer();
}

function deactivate() {
  deactivated = true;
  statusBarItem?.hide();
  clearTimer();
}

// ---------------------------------------------------------------------------
// Core refresh logic
// ---------------------------------------------------------------------------

/**
 * @param {boolean} [promptLogin]
 */
async function refresh(promptLogin = false) {
  if (deactivated) return;
  if (promptLogin) pendingPromptLogin = true;   // record intent even if in-flight
  if (refreshInFlight) return;

  const doPromptLogin = pendingPromptLogin;
  pendingPromptLogin = false;
  refreshInFlight = true;
  showLoading();
  try {
    let session;
    try {
      session = await vscode.authentication.getSession(
        'github',
        ['user:email', 'read:user'],
        { silent: !doPromptLogin, createIfNone: doPromptLogin }
      );
    } catch {
      // User cancelled the sign-in prompt (createIfNone: true throws on cancel)
      showNoAuth();
      return;
    }

    if (!session) {
      showNoAuth();
      return;
    }

    const data = await fetchUsage(session.accessToken);
    lastData = data;
    updateStatusBar(data);
  } catch (err) {
    const code = err?.code;
    if (code === 'AUTH') {
      showNoAuth();
    } else if (code === 'FORBIDDEN') {
      showError('Access denied — check Copilot subscription or org policy');
    } else if (code === 'RATE_LIMIT') {
      if (lastData) {
        // Keep last data but mark tooltip
        updateStatusBar(lastData, true);
      } else {
        showError('Rate limited');
      }
    } else if (code === 'SERVER_ERROR') {
      showError('API error (5xx)');
    } else if (code === 'NETWORK_ERROR' || code === 'TIMEOUT') {
      showError('Network error');
    } else {
      showError('Network / API error');
    }
  } finally {
    refreshInFlight = false;
    if (pendingPromptLogin) {
      // A login was requested while the previous request was in-flight; honour it now.
      setTimeout(() => refresh(), 0);
    }
  }
}

// ---------------------------------------------------------------------------
// Status bar rendering
// ---------------------------------------------------------------------------

/**
 * @param {import('./api').UsageData} data
 * @param {boolean} [isRateLimited]
 */
function updateStatusBar(data, isRateLimited = false) {
  const cfg = getConfig();

  if (data.noData) {
    const md = new vscode.MarkdownString('', true);
    md.isTrusted = { enabledCommands: ['githubCopilotUsage.refresh'] };
    md.appendText(`No premium quota · Plan: ${data.plan}`);
    if (isRateLimited) md.appendMarkdown('\n\n_(Rate limited — showing last known data)_');
    md.appendMarkdown('\n\n[$(refresh)](command:githubCopilotUsage.refresh)');
    renderStatus({ text: '—', tooltip: md });
    return;
  }

  if (data.unlimited) {
    renderStatus({ text: '∞', tooltip: buildTooltip(data, isRateLimited) });
    return;
  }

  const pct = data.usedPct;
  let color;
  if (pct >= cfg.criticalThreshold) {
    color = new vscode.ThemeColor('editorError.foreground');
  } else if (pct >= cfg.warningThreshold) {
    color = new vscode.ThemeColor('editorWarning.foreground');
  }

  renderStatus({ text: `${pct}%`, tooltip: buildTooltip(data, isRateLimited), color });
}

/**
 * @param {import('./api').UsageData} data
 * @param {boolean} isRateLimited
 * @returns {vscode.MarkdownString}
 */
function buildTooltip(data, isRateLimited) {
  const md = new vscode.MarkdownString('', true);
  md.isTrusted = { enabledCommands: ['githubCopilotUsage.refresh'] };
  md.appendMarkdown('**GitHub Copilot Usage**\n\nPlan: ');
  md.appendText(data.plan);
  md.appendMarkdown('\n\n');

  if (data.unlimited) {
    md.appendMarkdown('Quota: Unlimited\n\n');
  } else {
    md.appendMarkdown(`Used: ${data.used} / ${data.quota} (${data.usedPct}%)\n\n`);
    if (data.overageEnabled && data.overageUsed > 0) {
      md.appendMarkdown(`Overage: ${data.overageUsed} requests\n\n`);
    }
    const resetStr = data.resetDate.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
    md.appendMarkdown('Reset: ');
    md.appendText(resetStr);
    md.appendMarkdown('\n\n');
  }

  if (isRateLimited) {
    md.appendMarkdown('_(Rate limited — showing last known data)_\n\n');
  }

  md.appendMarkdown('[$(refresh)](command:githubCopilotUsage.refresh)');
  return md;
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
    command: 'githubCopilotUsage.login',
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

// ---------------------------------------------------------------------------
// Config helper
// ---------------------------------------------------------------------------

function getConfig() {
  const cfg = vscode.workspace.getConfiguration('githubCopilotUsage');
  const warning = cfg.get('warningThreshold', 75);
  const critical = cfg.get('criticalThreshold', 90);
  return {
    refreshIntervalMinutes: cfg.get('refreshIntervalMinutes', 5),
    // Clamp warning to at most critical so misconfiguration (warning > critical) degrades gracefully.
    warningThreshold: Math.min(warning, critical),
    criticalThreshold: critical,
  };
}

module.exports = { activate, deactivate };
