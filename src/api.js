// @ts-nocheck
"use strict";

const { version } = require("../package.json");

const PLAN_MAP = {
  free: "Free",
  individual: "Pro",
  individual_pro: "Pro+",
  business: "Business",
  enterprise: "Enterprise",
};

/**
 * @typedef {Object} UsageData
 * @property {number} used
 * @property {number} quota
 * @property {number} usedPct  - already-used percentage (0–100+)
 * @property {boolean} unlimited
 * @property {boolean} noData  - true when the plan has no premium interactions quota
 * @property {boolean} overageEnabled
 * @property {number} overageUsed
 * @property {string} plan
 * @property {Date} resetDate
 */

/**
 * Fetch Copilot premium request usage via the internal API.
 * @param {string} token  VS Code GitHub session access token
 * @returns {Promise<UsageData>}
 */
async function fetchUsage(token) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
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
    clearTimeout(timeout);
    const isTimeout = e?.name === "AbortError";
    throw makeError(
      isTimeout ? "TIMEOUT" : "NETWORK_ERROR",
      isTimeout ? "Request timed out" : "Network error",
    );
  }
  clearTimeout(timeout);

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
  } catch {
    throw makeError("API_ERROR", "Invalid JSON from GitHub API");
  }
  const plan = PLAN_MAP[data.copilot_plan] ?? data.copilot_plan ?? "Unknown";

  const pi = data?.quota_snapshots?.premium_interactions;
  if (!pi || pi.percent_remaining == null) {
    const unlimited = !!pi?.unlimited;
    return {
      used: 0,
      quota: pi?.entitlement ?? 0,
      usedPct: 0,
      unlimited,
      noData: !unlimited,
      overageEnabled: !!pi?.overage_permitted,
      overageUsed: pi?.overage_count ?? 0,
      plan,
      resetDate: getNextMonthReset(),
    };
  }

  const entitlement = pi.entitlement ?? 0;
  const percentRemaining = Number(pi.percent_remaining);
  if (!Number.isFinite(percentRemaining)) {
    throw makeError("API_ERROR", "Invalid percent_remaining from GitHub API");
  }
  const usedPct = Math.max(0, Math.round((100 - percentRemaining) * 10) / 10);
  const used =
    entitlement > 0 ? Math.max(0, Math.round((entitlement * (100 - percentRemaining)) / 100)) : 0;

  const rawResetDate = data.quota_reset_date ? new Date(data.quota_reset_date) : null;
  const resetDate =
    rawResetDate && !isNaN(rawResetDate.getTime()) ? rawResetDate : getNextMonthReset();

  return {
    used,
    quota: entitlement,
    usedPct,
    unlimited: !!pi.unlimited,
    noData: false,
    overageEnabled: !!pi.overage_permitted,
    overageUsed: pi.overage_count ?? 0,
    plan,
    resetDate,
  };
}

function getNextMonthReset() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/** @param {string} code @param {string} message */
function makeError(code, message) {
  const err = new Error(message);
  // @ts-ignore
  err.code = code;
  return err;
}

module.exports = { fetchUsage };
