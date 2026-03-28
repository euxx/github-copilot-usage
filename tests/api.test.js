"use strict";

const { fetchUsage } = require("../src/api");

// Helper: build a minimal mock Response
const mockRes = (status, data) => ({
  status,
  ok: status >= 200 && status < 300,
  json: () => Promise.resolve(data),
});

// Minimal valid API response body
const BASE_BODY = {
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

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchUsage", () => {
  describe("normal quota data", () => {
    it("returns correct UsageData for a 70% remaining response", async () => {
      fetch.mockResolvedValue(mockRes(200, BASE_BODY));
      const data = await fetchUsage("test-token");
      expect(data.plan).toBe("Pro");
      expect(data.usedPct).toBe(30); // 100 - 70
      expect(data.used).toBe(90); // round(300 * 30 / 100)
      expect(data.quota).toBe(300);
      expect(data.unlimited).toBe(false);
      expect(data.noData).toBe(false);
      expect(data.resetDate).toEqual(new Date("2026-04-01T00:00:00Z"));
    });

    it("clamps usedPct to 0 when percent_remaining > 100", async () => {
      const body = {
        ...BASE_BODY,
        quota_snapshots: {
          premium_interactions: {
            ...BASE_BODY.quota_snapshots.premium_interactions,
            percent_remaining: 110,
          },
        },
      };
      fetch.mockResolvedValue(mockRes(200, body));
      const data = await fetchUsage("test-token");
      expect(data.usedPct).toBe(0);
      expect(data.used).toBe(0);
    });

    it("sets overageEnabled and overageUsed from response", async () => {
      const body = {
        ...BASE_BODY,
        quota_snapshots: {
          premium_interactions: {
            ...BASE_BODY.quota_snapshots.premium_interactions,
            overage_permitted: true,
            overage_count: 15,
          },
        },
      };
      fetch.mockResolvedValue(mockRes(200, body));
      const data = await fetchUsage("test-token");
      expect(data.overageEnabled).toBe(true);
      expect(data.overageUsed).toBe(15);
    });

    it("uses getNextMonthReset() when quota_reset_date is absent", async () => {
      const body = { ...BASE_BODY };
      delete body.quota_reset_date;
      fetch.mockResolvedValue(mockRes(200, { ...body }));
      const data = await fetchUsage("test-token");
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
      nextMonth.setHours(0, 0, 0, 0);
      expect(data.resetDate.getFullYear()).toBe(nextMonth.getFullYear());
      expect(data.resetDate.getMonth()).toBe(nextMonth.getMonth());
    });
  });

  describe("plan mapping", () => {
    const cases = [
      ["free", "Free"],
      ["individual", "Pro"],
      ["individual_pro", "Pro+"],
      ["business", "Business"],
      ["enterprise", "Enterprise"],
    ];
    it.each(cases)('maps copilot_plan "%s" to "%s"', async (apiPlan, expectedPlan) => {
      fetch.mockResolvedValue(mockRes(200, { ...BASE_BODY, copilot_plan: apiPlan }));
      const data = await fetchUsage("test-token");
      expect(data.plan).toBe(expectedPlan);
    });

    it("passes through unknown plan names", async () => {
      fetch.mockResolvedValue(mockRes(200, { ...BASE_BODY, copilot_plan: "team" }));
      const data = await fetchUsage("test-token");
      expect(data.plan).toBe("team");
    });
  });

  describe("noData cases", () => {
    it("returns noData=true when quota_snapshots is missing", async () => {
      fetch.mockResolvedValue(mockRes(200, { copilot_plan: "free", quota_reset_date: null }));
      const data = await fetchUsage("test-token");
      expect(data.noData).toBe(true);
      expect(data.unlimited).toBe(false);
    });

    it("returns unlimited=true when pi.unlimited is set", async () => {
      const body = {
        copilot_plan: "enterprise",
        quota_snapshots: { premium_interactions: { unlimited: true } },
      };
      fetch.mockResolvedValue(mockRes(200, body));
      const data = await fetchUsage("test-token");
      expect(data.unlimited).toBe(true);
      expect(data.noData).toBe(false);
    });
  });

  describe("HTTP error handling", () => {
    it("throws AUTH on 401", async () => {
      fetch.mockResolvedValue(mockRes(401, {}));
      await expect(fetchUsage("bad-token")).rejects.toMatchObject({ code: "AUTH" });
    });

    it("throws FORBIDDEN on 403", async () => {
      fetch.mockResolvedValue(mockRes(403, {}));
      await expect(fetchUsage("token")).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("throws RATE_LIMIT on 429", async () => {
      fetch.mockResolvedValue(mockRes(429, {}));
      await expect(fetchUsage("token")).rejects.toMatchObject({ code: "RATE_LIMIT" });
    });

    it("throws SERVER_ERROR on 500", async () => {
      fetch.mockResolvedValue(mockRes(500, {}));
      await expect(fetchUsage("token")).rejects.toMatchObject({ code: "SERVER_ERROR" });
    });
  });

  describe("network failure handling", () => {
    it("throws NETWORK_ERROR when fetch rejects", async () => {
      fetch.mockRejectedValue(new Error("Network failure"));
      await expect(fetchUsage("token")).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    });

    it("throws TIMEOUT when fetch is aborted", async () => {
      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";
      fetch.mockRejectedValue(abortError);
      await expect(fetchUsage("token")).rejects.toMatchObject({ code: "TIMEOUT" });
    });

    it("aborts fetch after 15 seconds via built-in timeout", async () => {
      vi.useFakeTimers();
      // Hang until the signal fires the abort event
      fetch.mockImplementation((_url, { signal }) => {
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            const err = new Error("The operation was aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      });
      // Set up the rejection handler BEFORE advancing timers to avoid unhandled rejection warning
      const assertion = expect(fetchUsage("token")).rejects.toMatchObject({ code: "TIMEOUT" });
      await vi.advanceTimersByTimeAsync(15_001);
      await assertion;
      vi.useRealTimers();
    });
  });

  describe("malformed response handling", () => {
    it("throws API_ERROR when response JSON is invalid", async () => {
      fetch.mockResolvedValue({
        status: 200,
        ok: true,
        json: () => Promise.reject(new SyntaxError("Unexpected token")),
      });
      await expect(fetchUsage("token")).rejects.toMatchObject({ code: "API_ERROR" });
    });

    it("throws API_ERROR when percent_remaining is non-finite", async () => {
      const body = {
        ...BASE_BODY,
        quota_snapshots: {
          premium_interactions: {
            ...BASE_BODY.quota_snapshots.premium_interactions,
            percent_remaining: "bad",
          },
        },
      };
      fetch.mockResolvedValue(mockRes(200, body));
      await expect(fetchUsage("token")).rejects.toMatchObject({ code: "API_ERROR" });
    });

    it("throws API_ERROR on non-standard 4xx status", async () => {
      fetch.mockResolvedValue(mockRes(418, {}));
      await expect(fetchUsage("token")).rejects.toMatchObject({ code: "API_ERROR" });
    });

    it("uses getNextMonthReset() when quota_reset_date is an invalid date string", async () => {
      fetch.mockResolvedValue(mockRes(200, { ...BASE_BODY, quota_reset_date: "not-a-date" }));
      const data = await fetchUsage("token");
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
      expect(data.resetDate.getMonth()).toBe(nextMonth.getMonth());
    });

    it("returns used=0 when entitlement is 0", async () => {
      const body = {
        ...BASE_BODY,
        quota_snapshots: {
          premium_interactions: {
            ...BASE_BODY.quota_snapshots.premium_interactions,
            entitlement: 0,
          },
        },
      };
      fetch.mockResolvedValue(mockRes(200, body));
      const data = await fetchUsage("token");
      expect(data.used).toBe(0);
      expect(data.quota).toBe(0);
    });

    it('uses "Unknown" when copilot_plan is absent', async () => {
      const body = { ...BASE_BODY };
      delete body.copilot_plan;
      fetch.mockResolvedValue(mockRes(200, { ...body }));
      const data = await fetchUsage("token");
      expect(data.plan).toBe("Unknown");
    });

    it("returns used=0 when entitlement is missing from normal-path response", async () => {
      const piWithout = { ...BASE_BODY.quota_snapshots.premium_interactions };
      delete piWithout.entitlement;
      const body = { ...BASE_BODY, quota_snapshots: { premium_interactions: piWithout } };
      fetch.mockResolvedValue(mockRes(200, body));
      const data = await fetchUsage("token");
      expect(data.quota).toBe(0);
      expect(data.used).toBe(0);
    });

    it("returns unlimited=true when pi.unlimited is set alongside percent_remaining", async () => {
      const body = {
        ...BASE_BODY,
        quota_snapshots: {
          premium_interactions: {
            ...BASE_BODY.quota_snapshots.premium_interactions,
            unlimited: true,
          },
        },
      };
      fetch.mockResolvedValue(mockRes(200, body));
      const data = await fetchUsage("token");
      expect(data.unlimited).toBe(true);
      expect(data.noData).toBe(false);
    });
  });
});
