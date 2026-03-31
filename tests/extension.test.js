"use strict";

const {
  formatTimestamp,
  getConfig,
  buildTooltip,
  computeIsStale,
  computeDisplayPct,
  activate,
  deactivate,
  _setState,
  _getState,
  _startRecoveryTimer,
  _clearRecoveryTimer,
  _resetTimer,
  _clearTimer,
  _refresh,
  _updateStatusBar,
} = require("../src/extension");

// ---------------------------------------------------------------------------
// formatTimestamp
// ---------------------------------------------------------------------------

describe("formatTimestamp", () => {
  it("returns HH:mm:ss only when the date is today", () => {
    const now = new Date();
    const result = formatTimestamp(now);
    // Should match HH:mm:ss (no date prefix)
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it("returns YYYY-MM-DD HH:mm:ss when the date is a different day", () => {
    const past = new Date("2025-01-15T09:05:03");
    const result = formatTimestamp(past);
    expect(result).toBe("2025-01-15 09:05:03");
  });

  it("zero-pads single-digit hours, minutes, seconds", () => {
    const past = new Date("2024-03-07T01:02:03");
    const result = formatTimestamp(past);
    expect(result).toBe("2024-03-07 01:02:03");
  });
});

// ---------------------------------------------------------------------------
// getConfig – numeric coercion and clamping (tests the NaN fix)
// ---------------------------------------------------------------------------

describe("getConfig", () => {
  function mockCfg(values) {
    const vscode = require("vscode");
    vscode.workspace.getConfiguration = () => ({
      get: (key, defaultValue) => (key in values ? values[key] : defaultValue),
    });
  }

  afterEach(() => {
    // Restore default: always returns the default value
    const vscode = require("vscode");
    vscode.workspace.getConfiguration = () => ({ get: (_key, def) => def });
  });

  it("returns numeric thresholds from valid config", () => {
    mockCfg({ "threshold.warning": 60, "threshold.critical": 85 });
    const cfg = getConfig();
    expect(cfg.thresholdWarning).toBe(60);
    expect(cfg.thresholdCritical).toBe(85);
  });

  it("falls back to defaults when threshold values are non-numeric strings", () => {
    mockCfg({ "threshold.warning": "off", "threshold.critical": "off" });
    const cfg = getConfig();
    // Both fall back to defaults (75, 90)
    expect(cfg.thresholdWarning).toBe(75);
    expect(cfg.thresholdCritical).toBe(90);
  });

  it("falls back to default 90 for critical when only critical is a string", () => {
    mockCfg({ "threshold.warning": 70, "threshold.critical": "invalid" });
    const cfg = getConfig();
    expect(cfg.thresholdCritical).toBe(90);
    expect(cfg.thresholdWarning).toBe(70); // valid warning, and 70 < 90
  });

  it("clamps warning to at most critical when warning > critical", () => {
    mockCfg({ "threshold.warning": 95, "threshold.critical": 80 });
    const cfg = getConfig();
    expect(cfg.thresholdWarning).toBe(80); // clamped to critical
    expect(cfg.thresholdCritical).toBe(80);
  });

  it("accepts numeric-string values by coercing them", () => {
    mockCfg({ "threshold.warning": "60", "threshold.critical": "85" });
    const cfg = getConfig();
    expect(cfg.thresholdWarning).toBe(60);
    expect(cfg.thresholdCritical).toBe(85);
  });
});

// ---------------------------------------------------------------------------
// buildTooltip
// ---------------------------------------------------------------------------

describe("buildTooltip", () => {
  const BASE_DATA = {
    plan: "Pro",
    unlimited: false,
    noData: false,
    used: 90,
    quota: 300,
    usedPct: 30,
    overageEnabled: false,
    overageUsed: 0,
    resetDate: new Date("2026-04-01T00:00:00Z"),
  };

  it("shows plan name and used/quota/pct for normal quota", () => {
    const md = buildTooltip(BASE_DATA, false);
    expect(md.value).toContain("Pro");
    expect(md.value).toContain("90 / 300 (30%)");
  });

  it("shows Unlimited for unlimited plan", () => {
    const md = buildTooltip({ ...BASE_DATA, unlimited: true }, false);
    expect(md.value).toContain("Unlimited");
  });

  it("includes rate-limit notice when isRateLimited is true", () => {
    const md = buildTooltip(BASE_DATA, true);
    expect(md.value).toContain("Rate limit");
  });

  it("does not include rate-limit notice when isRateLimited is false", () => {
    const md = buildTooltip(BASE_DATA, false);
    expect(md.value).not.toContain("Rate limit");
  });

  it("shows offline notice when isOfflineState is true but not stale", () => {
    const md = buildTooltip(BASE_DATA, false, true, false);
    expect(md.value).toContain("Offline");
    expect(md.value).not.toContain("1 h");
  });

  it("shows offline/stale notice when isStale is true", () => {
    const md = buildTooltip(BASE_DATA, false, true, true);
    expect(md.value).toContain("Offline");
    expect(md.value).toContain("outdated");
  });

  it("shows no offline notice when isOfflineState and isStale are both false", () => {
    const md = buildTooltip(BASE_DATA, false, false, false);
    expect(md.value).not.toContain("Offline");
  });

  it("includes overage count when overageEnabled and overageUsed > 0", () => {
    const data = { ...BASE_DATA, overageEnabled: true, overageUsed: 5 };
    const md = buildTooltip(data, false);
    expect(md.value).toContain("Overage: 5 requests");
  });

  it("omits overage section when overageUsed is 0", () => {
    const md = buildTooltip(BASE_DATA, false);
    expect(md.value).not.toContain("Overage");
  });
});

// ---------------------------------------------------------------------------
// computeIsStale — pure staleness helper
// ---------------------------------------------------------------------------

describe("computeIsStale", () => {
  const HOUR_MS = 60 * 60 * 1000;

  it("returns false when not offline", () => {
    const since = new Date(Date.now() - HOUR_MS - 1);
    expect(computeIsStale(false, since)).toBe(false);
  });

  it("returns false when offline but offlineSince is null", () => {
    expect(computeIsStale(true, null)).toBe(false);
  });

  it("returns false when offline for less than 1 hour", () => {
    const since = new Date(Date.now() - 30 * 60 * 1000); // 30 min ago
    expect(computeIsStale(true, since)).toBe(false);
  });

  it("returns false when offline for exactly 1 hour (boundary)", () => {
    const since = new Date(Date.now() - HOUR_MS); // exactly 1h — not ">" yet
    expect(computeIsStale(true, since)).toBe(false);
  });

  it("returns true when offline for more than 1 hour", () => {
    const since = new Date(Date.now() - HOUR_MS - 1); // 1h + 1ms
    expect(computeIsStale(true, since)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isOffline / offlineSince state transitions (via _setState / _getState)
// ---------------------------------------------------------------------------

describe("offline state transitions", () => {
  afterEach(() => {
    // Reset module state after each test so they don't bleed into each other.
    _setState({ isOffline: false, offlineSince: null, lastData: null, lastUpdatedAt: null });
  });

  it("initial state: isOffline false, offlineSince null", () => {
    const state = _getState();
    expect(state.isOffline).toBe(false);
    expect(state.offlineSince).toBeNull();
  });

  it("_setState sets isOffline and offlineSince independently", () => {
    const since = new Date();
    _setState({ isOffline: true, offlineSince: since });
    const state = _getState();
    expect(state.isOffline).toBe(true);
    expect(state.offlineSince).toBe(since);
  });

  it("going offline is not stale immediately (offlineSince just set)", () => {
    _setState({ isOffline: true, offlineSince: new Date() });
    const { isOffline, offlineSince } = _getState();
    expect(computeIsStale(isOffline, offlineSince)).toBe(false);
  });

  it("becomes stale only after offlineSince is >1 h in the past", () => {
    const since = new Date(Date.now() - 61 * 60 * 1000);
    _setState({ isOffline: true, offlineSince: since });
    const { isOffline, offlineSince } = _getState();
    expect(computeIsStale(isOffline, offlineSince)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Recovery timer lifecycle
// ---------------------------------------------------------------------------

describe("recovery timer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset all state and ensure no timer is running.
    _setState({ isOffline: false, offlineSince: null, lastData: null, lastUpdatedAt: null });
    _clearRecoveryTimer(); // may call resetTimer internally
    _clearTimer(); // ensure normal refresh timer is also cleared
  });

  afterEach(() => {
    _clearRecoveryTimer(); // may call resetTimer internally
    _clearTimer(); // clear any refreshTimer left by resetTimer()
    vi.useRealTimers();
  });

  it("startRecoveryTimer pauses the normal refresh timer (refreshTimerActive = false)", () => {
    _startRecoveryTimer();
    expect(_getState().refreshTimerActive).toBe(false);
  });

  it("calling startRecoveryTimer twice does not create a second timer", () => {
    _startRecoveryTimer();
    const spy = vi.spyOn(global, "setTimeout");
    _startRecoveryTimer();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("clearRecoveryTimer sets recoveryTimerActive = false", () => {
    _startRecoveryTimer();
    _clearRecoveryTimer();
    expect(_getState().recoveryTimerActive).toBe(false);
  });

  it("clearRecoveryTimer restores the normal refresh timer (refreshTimerActive = true)", () => {
    _startRecoveryTimer();
    _clearRecoveryTimer();
    expect(_getState().refreshTimerActive).toBe(true);
  });

  it("clearRecoveryTimer when no timer is active is a no-op", () => {
    expect(() => _clearRecoveryTimer()).not.toThrow();
    expect(_getState().recoveryTimerActive).toBe(false);
  });

  it("resetTimer is a no-op while recovery mode is active (no competing timer)", () => {
    _startRecoveryTimer();
    expect(_getState().refreshTimerActive).toBe(false);
    // Simulate onDidChangeConfiguration calling resetTimer while offline.
    _resetTimer();
    // Should still have only the recovery timer — no competing normal refresh timer.
    expect(_getState().refreshTimerActive).toBe(false);
    expect(_getState().recoveryTimerActive).toBe(true);
  });

  it("timer callback stops recovery and restores normal timer when back online", async () => {
    // isOffline is already false (default) — simulates connection restored before first tick.
    _startRecoveryTimer();
    expect(_getState().recoveryTimerActive).toBe(true);

    // Advance past the 10 s interval; the callback runs, sees !isOffline, stops recovery.
    await vi.advanceTimersByTimeAsync(10_000);

    expect(_getState().recoveryTimerActive).toBe(false);
    expect(_getState().refreshTimerActive).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// computeDisplayPct
// ---------------------------------------------------------------------------

describe("computeDisplayPct", () => {
  const base = { usedPct: 70, quota: 100, overageEnabled: false, overageUsed: 0 };

  it("returns usedPct when no overage", () => {
    expect(computeDisplayPct({ ...base, usedPct: 70 })).toBe(70);
  });

  it("returns usedPct when overageEnabled but overageUsed is 0", () => {
    expect(computeDisplayPct({ ...base, overageEnabled: true, overageUsed: 0 })).toBe(70);
  });

  it("returns usedPct when overageUsed > 0 but overageEnabled is false", () => {
    expect(computeDisplayPct({ ...base, overageEnabled: false, overageUsed: 10 })).toBe(70);
  });

  it("returns 110 when 10 of 100 quota used as overage", () => {
    expect(
      computeDisplayPct({
        ...base,
        usedPct: 100,
        overageEnabled: true,
        overageUsed: 10,
        quota: 100,
      }),
    ).toBe(110);
  });

  it("rounds the overage percentage", () => {
    // 5 overage out of 300 quota = 1.667% overage → rounds to 102
    expect(
      computeDisplayPct({
        ...base,
        usedPct: 100,
        overageEnabled: true,
        overageUsed: 5,
        quota: 300,
      }),
    ).toBe(102);
  });

  it("handles quota of 0 by falling back to usedPct", () => {
    expect(
      computeDisplayPct({ ...base, usedPct: 100, overageEnabled: true, overageUsed: 10, quota: 0 }),
    ).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Helper: vscode mock access and API mock
// ---------------------------------------------------------------------------

const vscode = require("vscode");

// Mock fetch globally (same pattern as api.test.js) so the real fetchUsage runs
// against controlled responses without needing vi.mock on the api module.
const mockRes = (status, data) => ({
  status,
  ok: status >= 200 && status < 300,
  json: () => Promise.resolve(data),
});

const API_BODY = {
  copilot_plan: "individual",
  quota_reset_date: "2026-04-01T00:00:00Z",
  quota_snapshots: {
    premium_interactions: {
      entitlement: 300,
      percent_remaining: 70,
      unlimited: false,
      overage_permitted: false,
      overage_count: 0,
    },
  },
};

const BASE_USAGE = {
  plan: "Pro",
  unlimited: false,
  noData: false,
  used: 90,
  quota: 300,
  usedPct: 30,
  overageEnabled: false,
  overageUsed: 0,
  resetDate: new Date("2026-04-01T00:00:00Z"),
};

/** Creates a minimal mock ExtensionContext. */
function makeContext() {
  const subs = [];
  return { subscriptions: { push: (...args) => subs.push(...args), _items: subs } };
}

/** Installs vi.fn() spies on the vscode mock and returns the captured statusBarItem. */
function installVscodeSpies() {
  const barItem = {
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn(),
    text: "",
    tooltip: undefined,
    color: undefined,
    command: undefined,
    name: undefined,
  };
  vscode.window.createStatusBarItem = vi.fn(() => barItem);
  vscode.commands.registerCommand = vi.fn(() => ({ dispose: vi.fn() }));
  vscode.workspace.onDidChangeConfiguration = vi.fn(() => ({ dispose: vi.fn() }));
  vscode.authentication.getSession = vi.fn().mockResolvedValue(null);
  return barItem;
}

function restoreVscodeMock() {
  vscode.window.createStatusBarItem = () => ({
    show: () => {},
    hide: () => {},
    dispose: () => {},
    text: "",
    tooltip: undefined,
    color: undefined,
    command: undefined,
  });
  vscode.commands.registerCommand = () => ({ dispose: () => {} });
  vscode.workspace.onDidChangeConfiguration = () => ({ dispose: () => {} });
  vscode.authentication.getSession = () => Promise.resolve(null);
  vscode.workspace.getConfiguration = () => ({ get: (_key, def) => def });
}

/** Resets all module-level state to initial values. */
function resetAllState() {
  _setState({
    isOffline: false,
    offlineSince: null,
    lastData: null,
    lastUpdatedAt: null,
    refreshInFlight: false,
    pendingSignIn: false,
    deactivated: false,
  });
}

// ---------------------------------------------------------------------------
// activate / deactivate lifecycle (#4)
// ---------------------------------------------------------------------------

describe("activate", () => {
  let barItem;
  let ctx;

  beforeEach(() => {
    barItem = installVscodeSpies();
    // Prevent actual refresh from making real calls; getSession returns null → showNoAuth path
    vscode.authentication.getSession.mockResolvedValue(null);
    ctx = makeContext();
  });

  afterEach(() => {
    deactivate();
    restoreVscodeMock();
    resetAllState();
  });

  it("creates a status bar item with correct id, alignment and priority", async () => {
    await activate(ctx);
    expect(vscode.window.createStatusBarItem).toHaveBeenCalledWith(
      "github-copilot-usage",
      vscode.StatusBarAlignment.Right,
      100.099999,
    );
  });

  it("registers refresh and signIn commands", async () => {
    await activate(ctx);
    const calls = vscode.commands.registerCommand.mock.calls.map((c) => c[0]);
    expect(calls).toContain("githubCopilotUsage.refresh");
    expect(calls).toContain("githubCopilotUsage.signIn");
  });

  it("listens for configuration changes", async () => {
    await activate(ctx);
    expect(vscode.workspace.onDidChangeConfiguration).toHaveBeenCalled();
  });

  it("pushes disposables into context.subscriptions", async () => {
    await activate(ctx);
    // statusBarItem + 3 disposables (2 commands + 1 config listener)
    expect(ctx.subscriptions._items.length).toBeGreaterThanOrEqual(4);
  });

  it("calls refresh on startup to attempt sign-in", async () => {
    // getSession called with createIfNone: true (promptSignIn=true on startup)
    vscode.authentication.getSession.mockResolvedValue(null);
    await activate(ctx);
    expect(vscode.authentication.getSession).toHaveBeenCalled();
  });

  it("shows sign-in status when no session exists", async () => {
    vscode.authentication.getSession.mockResolvedValue(null);
    await activate(ctx);
    expect(barItem.text).toBe("Sign in");
    expect(barItem.command).toBe("githubCopilotUsage.signIn");
  });
});

describe("deactivate", () => {
  let barItem;

  beforeEach(() => {
    barItem = installVscodeSpies();
    vscode.authentication.getSession.mockResolvedValue(null);
  });

  afterEach(() => {
    restoreVscodeMock();
    resetAllState();
  });

  it("hides the status bar item", async () => {
    await activate(makeContext());
    deactivate();
    expect(barItem.hide).toHaveBeenCalled();
  });

  it("clears offline state", async () => {
    await activate(makeContext());
    _setState({ isOffline: true, offlineSince: new Date() });
    deactivate();
    const { isOffline } = _getState();
    expect(isOffline).toBe(false);
    // offlineSince is reset to null inside deactivate
  });

  it("prevents subsequent renders after deactivation", async () => {
    await activate(makeContext());
    deactivate();
    barItem.show.mockClear();
    // _refresh should be a no-op when deactivated
    await _refresh();
    expect(barItem.show).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// refresh (#4 continued)
// ---------------------------------------------------------------------------

describe("refresh", () => {
  let barItem;

  beforeEach(() => {
    barItem = installVscodeSpies();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    deactivate();
    restoreVscodeMock();
    vi.unstubAllGlobals();
    resetAllState();
    _clearRecoveryTimer();
    _clearTimer();
  });

  it("shows sign-in status when silent getSession returns null", async () => {
    vscode.authentication.getSession.mockResolvedValue(null);
    await activate(makeContext());
    expect(barItem.text).toBe("Sign in");
  });

  it("fetches usage and updates status bar on successful auth", async () => {
    vscode.authentication.getSession.mockResolvedValue({ accessToken: "tok123" });
    fetch.mockResolvedValue(mockRes(200, API_BODY));
    await activate(makeContext());
    expect(fetch).toHaveBeenCalled();
    expect(barItem.text).toBe("30%");
  });

  it("stores lastData and clears offline after successful fetch", async () => {
    vscode.authentication.getSession.mockResolvedValue({ accessToken: "tok" });
    fetch.mockResolvedValue(mockRes(200, API_BODY));
    await activate(makeContext());
    const { isOffline } = _getState();
    expect(isOffline).toBe(false);
  });

  it("shows sign-in on AUTH error (401)", async () => {
    vscode.authentication.getSession.mockResolvedValue({ accessToken: "tok" });
    fetch.mockResolvedValue(mockRes(401, {}));
    await activate(makeContext());
    expect(barItem.text).toBe("Sign in");
  });

  it("shows error on FORBIDDEN (403)", async () => {
    vscode.authentication.getSession.mockResolvedValue({ accessToken: "tok" });
    fetch.mockResolvedValue(mockRes(403, {}));
    await activate(makeContext());
    expect(barItem.text).toBe("$(error)");
    expect(barItem.tooltip).toContain("Access denied");
  });

  it("shows alert on RATE_LIMIT (429) without prior data", async () => {
    vscode.authentication.getSession.mockResolvedValue({ accessToken: "tok" });
    fetch.mockResolvedValue(mockRes(429, {}));
    await activate(makeContext());
    expect(barItem.text).toBe("$(alert)");
  });

  it("shows error on SERVER_ERROR (5xx)", async () => {
    vscode.authentication.getSession.mockResolvedValue({ accessToken: "tok" });
    fetch.mockResolvedValue(mockRes(500, {}));
    await activate(makeContext());
    expect(barItem.text).toBe("$(error)");
  });

  it("enters offline state on NETWORK_ERROR", async () => {
    vscode.authentication.getSession.mockResolvedValue({ accessToken: "tok" });
    fetch.mockRejectedValue(new Error("Network failure"));
    await activate(makeContext());
    const { isOffline } = _getState();
    expect(isOffline).toBe(true);
  });

  it("enters offline state on TIMEOUT (AbortError)", async () => {
    vscode.authentication.getSession.mockResolvedValue({ accessToken: "tok" });
    const abortErr = new Error("aborted");
    abortErr.name = "AbortError";
    fetch.mockRejectedValue(abortErr);
    await activate(makeContext());
    const { isOffline } = _getState();
    expect(isOffline).toBe(true);
  });

  it("shows no-auth when user cancels sign-in (getSession throws)", async () => {
    vscode.authentication.getSession.mockRejectedValue(new Error("User cancelled"));
    await activate(makeContext());
    expect(barItem.text).toBe("Sign in");
  });

  it("honours pending sign-in requested while in-flight", async () => {
    vi.useFakeTimers();
    let resolveSession;
    vscode.authentication.getSession.mockImplementation(
      () => new Promise((r) => (resolveSession = r)),
    );
    const activatePromise = activate(makeContext());
    const secondRefresh = _refresh(true, true);
    resolveSession(null);
    await activatePromise;
    // Flush only the pending setTimeout(0) — not the repeating setInterval
    await vi.advanceTimersByTimeAsync(0);
    await secondRefresh;
    expect(vscode.authentication.getSession.mock.calls.length).toBeGreaterThanOrEqual(2);
    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// updateStatusBar (#9)
// ---------------------------------------------------------------------------

describe("updateStatusBar", () => {
  let barItem;

  beforeEach(() => {
    barItem = installVscodeSpies();
    // Activate to create statusBarItem
    vscode.authentication.getSession.mockResolvedValue(null);
  });

  afterEach(() => {
    deactivate();
    restoreVscodeMock();
    resetAllState();
  });

  it("renders dash for noData plan", async () => {
    await activate(makeContext());
    _updateStatusBar({ ...BASE_USAGE, noData: true });
    expect(barItem.text).toBe("\u2014");
  });

  it("renders infinity symbol for unlimited plan", async () => {
    await activate(makeContext());
    _updateStatusBar({ ...BASE_USAGE, unlimited: true });
    expect(barItem.text).toBe("\u221e");
  });

  it("renders percentage for normal quota", async () => {
    await activate(makeContext());
    _updateStatusBar({ ...BASE_USAGE, usedPct: 42 });
    expect(barItem.text).toBe("42%");
  });

  it("applies warning color when pct >= warning threshold", async () => {
    await activate(makeContext());
    _updateStatusBar({ ...BASE_USAGE, usedPct: 80 });
    expect(barItem.color).toBeDefined();
    expect(barItem.color.id).toBe("editorWarning.foreground");
  });

  it("applies critical color when pct >= critical threshold", async () => {
    await activate(makeContext());
    _updateStatusBar({ ...BASE_USAGE, usedPct: 95 });
    expect(barItem.color).toBeDefined();
    expect(barItem.color.id).toBe("editorError.foreground");
  });

  it("includes stale warning icon when offline > 1 hour", async () => {
    await activate(makeContext());
    _setState({ isOffline: true, offlineSince: new Date(Date.now() - 2 * 60 * 60 * 1000) });
    _updateStatusBar({ ...BASE_USAGE, usedPct: 30 });
    expect(barItem.text).toContain("$(warning)");
  });

  it("includes rate-limit notice in tooltip when isRateLimited", async () => {
    await activate(makeContext());
    _updateStatusBar({ ...BASE_USAGE }, true);
    expect(barItem.tooltip.value).toContain("Rate limit");
  });

  it("displays overage percentage when overage is active", async () => {
    await activate(makeContext());
    _updateStatusBar({
      ...BASE_USAGE,
      usedPct: 100,
      overageEnabled: true,
      overageUsed: 30,
      quota: 300,
    });
    expect(barItem.text).toBe("110%");
  });
});

// ---------------------------------------------------------------------------
// Integration: error → recovery → back online (#10)
// ---------------------------------------------------------------------------

describe("integration: error → recovery → back online", () => {
  let barItem;

  beforeEach(() => {
    barItem = installVscodeSpies();
    vi.stubGlobal("fetch", vi.fn());
    vscode.authentication.getSession.mockResolvedValue({ accessToken: "tok" });
  });

  afterEach(() => {
    deactivate();
    restoreVscodeMock();
    vi.unstubAllGlobals();
    resetAllState();
    _clearRecoveryTimer();
    _clearTimer();
    vi.useRealTimers();
  });

  it("goes offline, starts recovery, then recovers on success", async () => {
    // Step 1: first fetch fails with network error → goes offline
    fetch.mockRejectedValue(new Error("Network failure"));
    await activate(makeContext());

    expect(_getState().isOffline).toBe(true);
    expect(_getState().recoveryTimerActive).toBe(true);
    expect(_getState().refreshTimerActive).toBe(false);

    // Step 2: simulate another failed recovery attempt (via direct refresh call)
    fetch.mockRejectedValue(new Error("Network failure"));
    await _refresh();
    expect(_getState().isOffline).toBe(true);
    expect(_getState().recoveryTimerActive).toBe(true);

    // Step 3: next attempt succeeds → goes back online
    fetch.mockResolvedValue(mockRes(200, API_BODY));
    await _refresh();

    expect(_getState().isOffline).toBe(false);
    expect(_getState().recoveryTimerActive).toBe(false);
    expect(_getState().refreshTimerActive).toBe(true);
    expect(barItem.text).toBe("30%");
  });

  it("preserves last data while offline", async () => {
    // Step 1: successful fetch
    fetch.mockResolvedValue(mockRes(200, API_BODY));
    await activate(makeContext());
    expect(barItem.text).toBe("30%");

    // Step 2: next refresh fails with network error → enters offline but keeps data
    fetch.mockRejectedValue(new Error("Network failure"));
    await _refresh();

    expect(_getState().isOffline).toBe(true);
    // Status bar should still show 30% (preserved last data)
    expect(barItem.text).toContain("30%");
  });
});
