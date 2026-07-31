// @ts-nocheck
"use strict";

const { version } = require("../package.json");

const QUOTA_SNAPSHOT_KEYS = ["chat", "completions", "premium_interactions"];

/** @type {string | undefined} */
let cachedQuotaIdentity;
/** @type {Record<string, any>} */
let cachedQuotaSnapshots = {};

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
 * @property {boolean} exhausted  - derived: unlimited pool drained (has_quota=false); consumers should signal a hard error state. Overrides overage — mirrors upstream #318831.
 * @property {boolean} noData  - true when the plan has no primary quota to display
 * @property {boolean} overageEnabled
 * @property {number} overageUsed
 * @property {number} overageLimit
 * @property {number | undefined} creditsUsed
 * @property {string} plan
 * @property {Date | undefined} resetDate  - undefined when the server provided no reset source; consumers should hide the row
 * @property {boolean} tokenBasedBilling  - true = UBB (credits) mode, false = legacy premium-requests mode
 */

/**
 * Fetch Copilot premium request usage via the internal API.
 * @param {string} token  VS Code GitHub session access token
 * @param {string | undefined} [accountId]  VS Code authentication account ID used to scope snapshot caching
 * @returns {Promise<UsageData>}
 */
async function fetchUsage(token, accountId) {
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
    const plan = resolvePlan(data);

    const tokenBasedBilling = !!data.token_based_billing;
    const premiumInteractions = data?.quota_snapshots?.premium_interactions;
    const quotaSnapshotUpdate = mergeQuotaSnapshots(data, accountId);
    const quotaSnapshots = quotaSnapshotUpdate.snapshots;
    const pi = selectPrimaryQuotaSnapshot(data, tokenBasedBilling, quotaSnapshots);

    const parsedEntitlement = parseNonNegativeNumber(pi?.entitlement);
    const entitlement = parsedEntitlement ?? 0;
    const creditsUsed = parseNonNegativeNumber(pi?.credits_used);
    const unlimited = !!pi?.unlimited;

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

    const hasQuota = Boolean(pi?.has_quota ?? true);
    // For pooled (unlimited) plans, has_quota=false is the authoritative "org budget
    // exhausted / usage blocked" signal — it overrides overage. A Business/Enterprise
    // member can't use Copilot once the org pool is blocked, even if overage is permitted.
    // Mirrors upstream #318831 (chatStatusDashboard.ts / chatStatusEntry.ts): the
    // `!additionalUsageEnabled` guard was dropped so hasQuota=false alone marks exhaustion.
    const exhausted = unlimited && !hasQuota;
    const resetDate = parseResetDate(
      data,
      pi,
      tokenBasedBilling || (unlimited && !exhausted && creditsUsed !== undefined),
    );
    const overageEnabled = !!premiumInteractions?.overage_permitted;
    const overageUsed = premiumInteractions?.overage_count ?? 0;
    const overageLimit = premiumInteractions?.overage_entitlement ?? 0;

    // Fields shared by both return shapes — keeps the per-branch returns focused
    // on the state-dependent fields (used, usedPct, noData).
    const shared = {
      quota: entitlement,
      unlimited,
      hasQuota,
      exhausted,
      overageEnabled,
      overageUsed,
      overageLimit,
      creditsUsed,
      plan,
      resetDate,
      tokenBasedBilling,
    };

    if (!pi || pi.percent_remaining == null || noEntitlement) {
      commitQuotaSnapshots(quotaSnapshotUpdate);
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

    commitQuotaSnapshots(quotaSnapshotUpdate);
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
 * Cache only parsed quota snapshot fields. Overage values remain sourced from
 * each current response, matching upstream's IQuotas merge boundary.
 *
 * @param {any} data
 * @param {string | undefined} accountId
 * @returns {{ identity: string | undefined, snapshots: Record<string, any> }}
 */
function mergeQuotaSnapshots(data, accountId) {
  const incomingSnapshots = data?.quota_snapshots;
  const identity = quotaIdentity(data, accountId);
  const previous =
    identity !== undefined && identity === cachedQuotaIdentity ? cachedQuotaSnapshots : {};
  const next = {};

  if (incomingSnapshots && typeof incomingSnapshots === "object") {
    for (const key of QUOTA_SNAPSHOT_KEYS) {
      const current = normalizeQuotaSnapshot(incomingSnapshots[key]);
      if (current) next[key] = mergeDefinedSnapshot(previous[key], current);
    }
  }

  return { identity, snapshots: next };
}

/**
 * @param {{ identity: string | undefined, snapshots: Record<string, any> }} update
 */
function commitQuotaSnapshots(update) {
  cachedQuotaIdentity = update.identity;
  cachedQuotaSnapshots = update.identity === undefined ? {} : update.snapshots;
}

/**
 * @param {any} data
 * @param {string | undefined} accountId
 * @returns {string | undefined}
 */
function quotaIdentity(data, accountId) {
  const parts = [];
  if (typeof accountId === "string" && accountId) parts.push(`account:${accountId}`);
  if (typeof data?.analytics_tracking_id === "string" && data.analytics_tracking_id) {
    parts.push(`tracking:${data.analytics_tracking_id}`);
  }
  return parts.length > 0 ? parts.join("|") : undefined;
}

/**
 * @param {any} snapshot
 * @returns {Record<string, any> | undefined}
 */
function normalizeQuotaSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return undefined;
  const entitlement = parseNonNegativeNumber(snapshot.entitlement);
  if (!snapshot.unlimited && entitlement === 0) return undefined;
  return {
    percent_remaining: snapshot.percent_remaining,
    unlimited: snapshot.unlimited,
    has_quota: snapshot.has_quota,
    quota_reset_at: snapshot.quota_reset_at || undefined,
    entitlement,
    quota_remaining: parseNonNegativeNumber(snapshot.quota_remaining),
    credits_used: parseNonNegativeNumber(snapshot.credits_used),
  };
}

/**
 * @param {Record<string, any> | undefined} previous
 * @param {Record<string, any>} current
 * @returns {Record<string, any>}
 */
function mergeDefinedSnapshot(previous, current) {
  const result = { ...previous, ...current };
  for (const key of Object.keys(current)) {
    if (current[key] === undefined && previous?.[key] !== undefined) {
      result[key] = previous[key];
    }
  }
  return result;
}

function clearQuotaSnapshotCache() {
  cachedQuotaIdentity = undefined;
  cachedQuotaSnapshots = {};
}

/**
 * @param {any} data
 * @returns {string}
 */
function resolvePlan(data) {
  if (isFreeLimitedCopilotSku(data)) return PLAN_MAP.free;
  if (isFreeEducationalSku(data)) return PLAN_MAP.individual_edu;
  return PLAN_MAP[data?.copilot_plan] ?? data?.copilot_plan ?? "Unknown";
}

/**
 * VS Code renders Free + token-based billing credits from the chat snapshot;
 * premium_interactions is zero/absent for that SKU and would make our compact
 * status entry fall into the no-data dash state.
 *
 * @param {any} data
 * @param {boolean} tokenBasedBilling
 * @param {any} quotaSnapshots
 * @returns {any}
 */
function selectPrimaryQuotaSnapshot(data, tokenBasedBilling, quotaSnapshots) {
  const chat = quotaSnapshots?.chat;
  if (isFreePlan(data) && tokenBasedBilling && hasPositiveEntitlement(chat)) {
    return quotaSnapshots.chat;
  }
  return quotaSnapshots?.premium_interactions;
}

/**
 * @param {any} data
 * @returns {boolean}
 */
function isFreePlan(data) {
  if (isFreeLimitedCopilotSku(data)) return true;
  if (isFreeEducationalSku(data)) return false;
  return data?.copilot_plan === "free";
}

/**
 * GitHub may report Free CFI as copilot_plan=individual with
 * access_type_sku=free_limited_copilot.
 *
 * @param {any} data
 * @returns {boolean}
 */
function isFreeLimitedCopilotSku(data) {
  return data?.access_type_sku === "free_limited_copilot";
}

/**
 * VS Code maps this SKU to ChatEntitlement.EDU before checking copilot_plan.
 *
 * @param {any} data
 * @returns {boolean}
 */
function isFreeEducationalSku(data) {
  return data?.access_type_sku === "free_educational_quota";
}

/**
 * @param {any} quotaSnapshot
 * @returns {boolean}
 */
function hasPositiveEntitlement(quotaSnapshot) {
  const entitlement = parseNonNegativeNumber(quotaSnapshot?.entitlement);
  return entitlement !== undefined && entitlement > 0;
}

/**
 * Resolve resetDate by priority, returning the first source that yields a
 * valid Date — or `undefined` if none does. Mirrors upstream parseQuotas:
 *   1. UBB or unlimited credits-used display: per-snapshot quota_reset_at (Unix seconds)
 *   2. Top-level quota_reset_date_utc
 *   3. Top-level quota_reset_date (local)
 *   4. Top-level limited_user_reset_date (Free SKU)
 *
 * Upstream returns undefined when no source is available; the dashboard hides
 * the "Resets …" line entirely. We follow the same shape and let consumers
 * decide what to render — simpler than synthesizing a misleading next-month date.
 *
 * Upstream also uses the per-snapshot reset for unlimited plans with
 * `credits_used`, even when the top-level UBB flag is false.
 *
 * @param {any} data  - top-level API response body
 * @param {any} pi    - selected primary quota snapshot (may be null/undefined)
 * @param {boolean} preferSnapshotReset
 * @returns {Date | undefined}
 */
function parseResetDate(data, pi, preferSnapshotReset) {
  if (preferSnapshotReset) {
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

module.exports = { fetchUsage, clearQuotaSnapshotCache };
