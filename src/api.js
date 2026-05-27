// @ts-nocheck
"use strict";

const { version } = require("../package.json");

const PLAN_MAP = {
  free: "Free",
  individual: "Pro",
  individual_pro: "Pro+",
  individual_max: "Max",
  individual_edu: "Student",
  business: "Business",
  enterprise: "Enterprise",
};

/**
 * @typedef {Object} UsageData
 * @property {number} used
 * @property {number} quota
 * @property {number} usedPct  - already-used percentage (0–100+)
 * @property {boolean} unlimited
 * @property {boolean} hasQuota  - false signals pooled-entitlement exhaustion (enterprise unlimited)
 * @property {boolean} exhausted  - derived: unlimited pool drained with no overage; consumers should signal a hard error state
 * @property {boolean} noData  - true when the plan has no premium interactions quota
 * @property {boolean} overageEnabled
 * @property {number} overageUsed
 * @property {string} plan
 * @property {Date | undefined} resetDate  - undefined when the server provided no reset source; consumers should hide the row
 * @property {boolean} tokenBasedBilling  - true = UBB (credits) mode, false = legacy premium-requests mode
 */

/**
 * Fetch Copilot premium request usage via the internal API.
 * @param {string} token  VS Code GitHub session access token
 * @returns {Promise<UsageData>}
 */
async function fetchUsage(token) {
  const controller = new AbortController();
  // Keep the timer alive across both fetch() (headers) and res.json() (body)
  // so a stalled body can also be aborted. Cleared in finally below.
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    let res;
    try {
      res = await fetch("https://api.github.com/copilot_internal/user", {
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "User-Agent": `vscode-github-copilot-usage/${version}`,
        },
      });
    } catch (e) {
      const isTimeout = e?.name === "AbortError";
      throw makeError(
        isTimeout ? "TIMEOUT" : "NETWORK_ERROR",
        isTimeout ? "Request timed out" : "Network error",
      );
    }

    if (res.status === 401) {
      throw makeError("AUTH", "Not signed in (401)");
    }
    if (res.status === 403) {
      throw makeError("FORBIDDEN", `Forbidden (403)`);
    }

    if (res.status === 429) {
      throw makeError("RATE_LIMIT", "Rate limited");
    }

    if (!res.ok) {
      throw makeError(res.status >= 500 ? "SERVER_ERROR" : "API_ERROR", `API error: ${res.status}`);
    }

    let data;
    try {
      data = await res.json();
    } catch (e) {
      if (e?.name === "AbortError") {
        throw makeError("TIMEOUT", "Request timed out");
      }
      throw makeError("API_ERROR", "Invalid JSON from GitHub API");
    }
    const plan = PLAN_MAP[data.copilot_plan] ?? data.copilot_plan ?? "Unknown";

    const pi = data?.quota_snapshots?.premium_interactions;
    const tokenBasedBilling = !!data.token_based_billing;

    const parsedEntitlement = parseNonNegativeNumber(pi?.entitlement);
    const entitlement = parsedEntitlement ?? 0;

    // Two cases route to noData (no usable premium counter):
    //   1. Explicit zero entitlement (`entitlement: '0'` or `0`) — matches upstream parseQuotas
    //      `parsedEntitlement === 0` skip rule.
    //   2. Free CFI shape: entitlement field absent AND percent_remaining === 0. Upstream
    //      dashboard keeps this snapshot because chat/completions indicators give context;
    //      our single-value status bar would otherwise show "100% red" and falsely imply
    //      exhaustion to a user who never had a premium allowance.
    //      percent_remaining is coerced via parseNonNegativeNumber so a string "0" payload
    //      doesn't bypass this carve-out (the downstream Number(...) path is already lenient).
    const noEntitlement =
      !pi?.unlimited &&
      (parsedEntitlement === 0 ||
        (parsedEntitlement === undefined && parseNonNegativeNumber(pi?.percent_remaining) === 0));

    const resetDate = parseResetDate(data, pi, tokenBasedBilling);
    const unlimited = !!pi?.unlimited;
    const hasQuota = Boolean(pi?.has_quota ?? true);
    const overageEnabled = !!pi?.overage_permitted;
    const exhausted = unlimited && !hasQuota && !overageEnabled;
    const overageUsed = pi?.overage_count ?? 0;

    // Fields shared by both return shapes — keeps the per-branch returns focused
    // on the state-dependent fields (used, usedPct, noData).
    const shared = {
      quota: entitlement,
      unlimited,
      hasQuota,
      exhausted,
      overageEnabled,
      overageUsed,
      plan,
      resetDate,
      tokenBasedBilling,
    };

    if (!pi || pi.percent_remaining == null || noEntitlement) {
      return { ...shared, used: 0, usedPct: 0, noData: !unlimited };
    }

    const percentRemaining = Number(pi.percent_remaining);
    if (!Number.isFinite(percentRemaining)) {
      throw makeError("API_ERROR", "Invalid percent_remaining from GitHub API");
    }
    const usedPct = Math.max(0, Math.round((100 - percentRemaining) * 10) / 10);

    const quotaRemaining = parseNonNegativeNumber(pi.quota_remaining);
    const used =
      quotaRemaining !== undefined
        ? Math.max(0, entitlement - quotaRemaining)
        : entitlement > 0
          ? Math.max(0, (entitlement * (100 - percentRemaining)) / 100)
          : 0;

    return { ...shared, used, usedPct, noData: false };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Coerce a raw value to a finite non-negative number, or undefined if it
 * cannot be. Matches upstream parseQuotas behavior for `entitlement` and
 * `quota_remaining` (string or number both acceptable).
 *
 * @param {unknown} raw
 * @returns {number | undefined}
 */
function parseNonNegativeNumber(raw) {
  if (raw == null) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * Resolve resetDate by priority, returning the first source that yields a
 * valid Date — or `undefined` if none does. Mirrors upstream parseQuotas:
 *   1. UBB only: per-snapshot quota_reset_at (Unix seconds)
 *   2. Top-level quota_reset_date_utc
 *   3. Top-level quota_reset_date (local)
 *   4. Top-level limited_user_reset_date (Free SKU)
 *
 * Upstream returns undefined when no source is available; the dashboard hides
 * the "Resets …" line entirely. We follow the same shape and let consumers
 * decide what to render — simpler than synthesizing a misleading next-month date.
 *
 * Note: upstream `parseQuotas` keeps `resetAt` regardless of billing mode and
 * only narrows to UBB at the consumer (chatStatusDashboard). We narrow here
 * because this module's only consumer (the status bar) treats UBB as the sole
 * legitimate source of per-snapshot reset times. Behavior equivalent to upstream.
 *
 * @param {any} data  - top-level API response body
 * @param {any} pi    - quota_snapshots.premium_interactions (may be null/undefined)
 * @param {boolean} tokenBasedBilling
 * @returns {Date | undefined}
 */
function parseResetDate(data, pi, tokenBasedBilling) {
  if (tokenBasedBilling) {
    const parsedResetAt = Number(pi?.quota_reset_at);
    if (Number.isFinite(parsedResetAt) && parsedResetAt > 0) {
      return new Date(parsedResetAt * 1000);
    }
  }
  // Walk fallbacks: a malformed entry must not block the next one. limited_user_reset_date
  // is the Free-SKU-only field upstream uses last (see parseQuotas).
  for (const raw of [
    data?.quota_reset_date_utc,
    data?.quota_reset_date,
    data?.limited_user_reset_date,
  ]) {
    if (!raw) continue;
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d;
  }
  return undefined;
}

/** @param {string} code @param {string} message */
function makeError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

module.exports = { fetchUsage };
