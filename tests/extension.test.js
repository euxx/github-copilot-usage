'use strict';

const { formatTimestamp, getConfig, buildTooltip } = require('../src/extension');

// ---------------------------------------------------------------------------
// formatTimestamp
// ---------------------------------------------------------------------------

describe('formatTimestamp', () => {
  it('returns HH:mm:ss only when the date is today', () => {
    const now = new Date();
    const result = formatTimestamp(now);
    // Should match HH:mm:ss (no date prefix)
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it('returns YYYY-MM-DD HH:mm:ss when the date is a different day', () => {
    const past = new Date('2025-01-15T09:05:03');
    const result = formatTimestamp(past);
    expect(result).toBe('2025-01-15 09:05:03');
  });

  it('zero-pads single-digit hours, minutes, seconds', () => {
    const past = new Date('2024-03-07T01:02:03');
    const result = formatTimestamp(past);
    expect(result).toBe('2024-03-07 01:02:03');
  });
});

// ---------------------------------------------------------------------------
// getConfig – numeric coercion and clamping (tests the NaN fix)
// ---------------------------------------------------------------------------

describe('getConfig', () => {
  function mockCfg(values) {
    const vscode = require('vscode');
    vscode.workspace.getConfiguration = () => ({
      get: (key, defaultValue) => (key in values ? values[key] : defaultValue),
    });
  }

  afterEach(() => {
    // Restore default: always returns the default value
    const vscode = require('vscode');
    vscode.workspace.getConfiguration = () => ({ get: (_key, def) => def });
  });

  it('returns numeric thresholds from valid config', () => {
    mockCfg({ 'threshold.warning': 60, 'threshold.critical': 85 });
    const cfg = getConfig();
    expect(cfg.thresholdWarning).toBe(60);
    expect(cfg.thresholdCritical).toBe(85);
  });

  it('falls back to defaults when threshold values are non-numeric strings', () => {
    mockCfg({ 'threshold.warning': 'off', 'threshold.critical': 'off' });
    const cfg = getConfig();
    // Both fall back to defaults (75, 90)
    expect(cfg.thresholdWarning).toBe(75);
    expect(cfg.thresholdCritical).toBe(90);
  });

  it('falls back to default 90 for critical when only critical is a string', () => {
    mockCfg({ 'threshold.warning': 70, 'threshold.critical': 'invalid' });
    const cfg = getConfig();
    expect(cfg.thresholdCritical).toBe(90);
    expect(cfg.thresholdWarning).toBe(70); // valid warning, and 70 < 90
  });

  it('clamps warning to at most critical when warning > critical', () => {
    mockCfg({ 'threshold.warning': 95, 'threshold.critical': 80 });
    const cfg = getConfig();
    expect(cfg.thresholdWarning).toBe(80); // clamped to critical
    expect(cfg.thresholdCritical).toBe(80);
  });

  it('accepts numeric-string values by coercing them', () => {
    mockCfg({ 'threshold.warning': '60', 'threshold.critical': '85' });
    const cfg = getConfig();
    expect(cfg.thresholdWarning).toBe(60);
    expect(cfg.thresholdCritical).toBe(85);
  });
});

// ---------------------------------------------------------------------------
// buildTooltip
// ---------------------------------------------------------------------------

describe('buildTooltip', () => {
  const BASE_DATA = {
    plan: 'Pro',
    unlimited: false,
    noData: false,
    used: 90,
    quota: 300,
    usedPct: 30,
    overageEnabled: false,
    overageUsed: 0,
    resetDate: new Date('2026-04-01T00:00:00Z'),
  };

  it('shows plan name and used/quota/pct for normal quota', () => {
    const md = buildTooltip(BASE_DATA, false);
    expect(md.value).toContain('Pro');
    expect(md.value).toContain('90 / 300 (30%)');
  });

  it('shows Unlimited for unlimited plan', () => {
    const md = buildTooltip({ ...BASE_DATA, unlimited: true }, false);
    expect(md.value).toContain('Unlimited');
  });

  it('includes rate-limit notice when isRateLimited is true', () => {
    const md = buildTooltip(BASE_DATA, true);
    expect(md.value).toContain('Rate limited');
  });

  it('does not include rate-limit notice when isRateLimited is false', () => {
    const md = buildTooltip(BASE_DATA, false);
    expect(md.value).not.toContain('Rate limited');
  });

  it('includes overage count when overageEnabled and overageUsed > 0', () => {
    const data = { ...BASE_DATA, overageEnabled: true, overageUsed: 5 };
    const md = buildTooltip(data, false);
    expect(md.value).toContain('Overage: 5 requests');
  });

  it('omits overage section when overageUsed is 0', () => {
    const md = buildTooltip(BASE_DATA, false);
    expect(md.value).not.toContain('Overage');
  });
});
