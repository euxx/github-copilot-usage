"use strict";

const { fetchUsage, clearQuotaSnapshotCache } = require("../src/api");

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
      entitlement: "300",
      percent_remaining: 70,
      unlimited: false,
      overage_permitted: false,
      overage_count: 0,
      overage_entitlement: 0,
    },
  },
};

beforeEach(() => {
  clearQuotaSnapshotCache();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("fetchUsage", () => {
  describe("normal quota data", () => {
    it("returns correct UsageData for a 70% remaining response", async () => {
      fetch.mockResolvedValue(mockRes(200, BASE_BODY));
      const data = await fetchUsage("test-token");
      expect(data.plan).toBe("Pro");
      expect(data.usedPct).toBe(30); // 100 - 70
      expect(data.used).toBe(90); // 300 * 30 / 100
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

    it("sets overageLimit from overage_entitlement", async () => {
      const body = {
        ...BASE_BODY,
        quota_snapshots: {
          premium_interactions: {
            ...BASE_BODY.quota_snapshots.premium_interactions,
            overage_permitted: true,
            overage_count: 3,
            overage_entitlement: 50,
          },
        },
      };
      fetch.mockResolvedValue(mockRes(200, body));
      const data = await fetchUsage("test-token");
      expect(data.overageEnabled).toBe(true);
      expect(data.overageUsed).toBe(3);
      expect(data.overageLimit).toBe(50);
    });

    it("returns resetDate=undefined when no reset source is available", async () => {
      // Mirrors upstream parseQuotas: no fallback synthesis. Consumers hide the row.
      const body = { ...BASE_BODY };
      delete body.quota_reset_date;
      fetch.mockResolvedValue(mockRes(200, { ...body }));
      const data = await fetchUsage("test-token");
      expect(data.resetDate).toBeUndefined();
    });

    it("uses quota_remaining for used calculation when present", async () => {
      const body = {
        ...BASE_BODY,
        token_based_billing: true,
        quota_snapshots: {
          premium_interactions: {
            entitlement: "20000",
            quota_remaining: 1501,
            percent_remaining: 7.5,
            unlimited: false,
            overage_permitted: false,
            overage_count: 0,
          },
        },
      };
      fetch.mockResolvedValue(mockRes(200, body));
      const data = await fetchUsage("test-token");
      expect(data.used).toBe(18499); // 20000 - 1501, exact value from quota_remaining
      expect(data.quota).toBe(20000);
      // usedPct stays sourced from percent_remaining (server-rounded), not derived from used/quota.
      // Slight divergence (18499/20000 = 92.495% vs reported 92.5%) is intentional.
      expect(data.usedPct).toBe(92.5);
      expect(data.tokenBasedBilling).toBe(true);
    });

    it("accepts quota_remaining as string", async () => {
      const body = {
        ...BASE_BODY,
        quota_snapshots: {
          premium_interactions: {
            ...BASE_BODY.quota_snapshots.premium_interactions,
            entitlement: "20000",
            quota_remaining: "1501",
          },
        },
      };
      fetch.mockResolvedValue(mockRes(200, body));
      const data = await fetchUsage("test-token");
      expect(data.used).toBe(18499);
    });

    it("uses per-snapshot quota_reset_at (Unix seconds) when token_based_billing is true", async () => {
      const resetAt = 1751328000; // 2025-07-01T00:00:00Z
      const body = {
        ...BASE_BODY,
        token_based_billing: true,
        quota_snapshots: {
          premium_interactions: {
            ...BASE_BODY.quota_snapshots.premium_interactions,
            quota_reset_at: resetAt,
          },
        },
      };
      fetch.mockResolvedValue(mockRes(200, body));
      const data = await fetchUsage("test-token");
      expect(data.resetDate).toEqual(new Date(resetAt * 1000));
    });

    it("ignores quota_reset_at when token_based_billing is false (legacy mode)", async () => {
      const body = {
        ...BASE_BODY,
        quota_reset_date: "2026-04-01T00:00:00Z",
        quota_snapshots: {
          premium_interactions: {
            ...BASE_BODY.quota_snapshots.premium_interactions,
            credits_used: 12,
            quota_reset_at: 1751328000,
          },
        },
      };
      fetch.mockResolvedValue(mockRes(200, body));
      const data = await fetchUsage("test-token");
      expect(data.resetDate).toEqual(new Date("2026-04-01T00:00:00Z"));
      expect(data.creditsUsed).toBe(12);
    });

    it("prefers quota_reset_date_utc over quota_reset_date", async () => {
      const body = {
        ...BASE_BODY,
        quota_reset_date: "2026-04-01T00:00:00Z",
        quota_reset_date_utc: "2026-05-15T12:30:00Z",
      };
      fetch.mockResolvedValue(mockRes(200, body));
      const data = await fetchUsage("test-token");
      expect(data.resetDate).toEqual(new Date("2026-05-15T12:30:00Z"));
    });

    it("falls back to limited_user_reset_date when other reset fields are absent (Free SKU)", async () => {
      // Mirror upstream parseQuotas: free responses sometimes only carry limited_user_reset_date.
      const body = {
        copilot_plan: "free",
        token_based_billing: true,
        limited_user_reset_date: "2026-07-01T00:00:00Z",
        quota_snapshots: {
          premium_interactions: {
            entitlement: "0",
            percent_remaining: 0,
            unlimited: false,
          },
        },
      };
      fetch.mockResolvedValue(mockRes(200, body));
      const data = await fetchUsage("test-token");
      expect(data.noData).toBe(true);
      expect(data.resetDate).toEqual(new Date("2026-07-01T00:00:00Z"));
    });

    it("skips malformed quota_reset_date_utc and accepts the next valid fallback", async () => {
      const body = {
        ...BASE_BODY,
        quota_reset_date_utc: "not-a-date",
        quota_reset_date: "2026-04-01T00:00:00Z",
      };
      fetch.mockResolvedValue(mockRes(200, body));
      const data = await fetchUsage("test-token");
      expect(data.resetDate).toEqual(new Date("2026-04-01T00:00:00Z"));
    });

    it("falls back to quota_reset_date_utc when UBB quota_reset_at is non-finite", async () => {
      // parseResetDate's UBB branch only returns when quota_reset_at is finite & > 0;
      // otherwise it must fall through to the upstream-aligned fallback chain.
      const body = {
        ...BASE_BODY,
        token_based_billing: true,
        quota_reset_date_utc: "2026-09-01T00:00:00Z",
        quota_snapshots: {
          premium_interactions: {
            ...BASE_BODY.quota_snapshots.premium_interactions,
            quota_reset_at: "not-a-number",
          },
        },
      };
      fetch.mockResolvedValue(mockRes(200, body));
      const data = await fetchUsage("test-token");
      expect(data.resetDate).toEqual(new Date("2026-09-01T00:00:00Z"));
    });

    it("falls back to entitlement * percent formula when quota_remaining is non-finite", async () => {
      // parseNonNegativeNumber returns undefined for non-finite or negative inputs;
      // the consumer must then derive `used` from entitlement and percent_remaining
      // (the legacy code path that pre-dates UBB's quota_remaining field).
      const body = {
        ...BASE_BODY,
        quota_snapshots: {
          premium_interactions: {
            ...BASE_BODY.quota_snapshots.premium_interactions,
            quota_remaining: "abc",
          },
        },
      };
      fetch.mockResolvedValue(mockRes(200, body));
      const data = await fetchUsage("test-token");
      // entitlement=300, percent_remaining=70 → used = 300 * 30 / 100 = 90
      expect(data.used).toBe(90);
    });

    it("preserves fractional precision in `used` (matches vscode dashboard)", async () => {
      // Upstream chatStatusDashboard stores `used` as a float and formats with
      // Intl.NumberFormat({ maximumFractionDigits: 2 }) at render time. We mirror
      // that by not pre-rounding here. Concrete case: entitlement=300, percent_remaining=34.7
      // → used = 300 * 65.3 / 100 = 195.9 (vscode shows 195.9, not 196).
      const body = {
        ...BASE_BODY,
        quota_snapshots: {
          premium_interactions: {
            ...BASE_BODY.quota_snapshots.premium_interactions,
            percent_remaining: 34.7,
            quota_remaining: undefined,
          },
        },
      };
      fetch.mockResolvedValue(mockRes(200, body));
      const data = await fetchUsage("test-token");
      expect(data.used).toBeCloseTo(195.9, 5);
    });
  });

  describe("credits used", () => {
    it("parses credits_used and its snapshot reset outside token-based billing", async () => {
      const resetAt = 1783260000;
      const body = {
        copilot_plan: "business",
        quota_snapshots: {
          premium_interactions: {
            percent_remaining: 100,
            unlimited: true,
            has_quota: true,
            credits_used: "1284",
            quota_reset_at: resetAt,
          },
        },
      };
      fetch.mockResolvedValue(mockRes(200, body));

      const data = await fetchUsage("test-token");

      expect(data.creditsUsed).toBe(1284);
      expect(data.resetDate).toEqual(new Date(resetAt * 1000));
      expect(data.tokenBasedBilling).toBe(false);
    });

    it("keeps zero credits_used as an explicit value", async () => {
      const body = {
        copilot_plan: "business",
        quota_snapshots: {
          premium_interactions: {
            percent_remaining: 100,
            unlimited: true,
            credits_used: 0,
          },
        },
      };
      fetch.mockResolvedValue(mockRes(200, body));

      const data = await fetchUsage("test-token");

      expect(data.creditsUsed).toBe(0);
    });

    it("uses the global reset when the pool is exhausted and credits used is hidden", async () => {
      const body = {
        copilot_plan: "business",
        token_based_billing: false,
        quota_reset_date: "2026-09-01T00:00:00Z",
        quota_snapshots: {
          premium_interactions: {
            percent_remaining: 0,
            unlimited: true,
            has_quota: false,
            credits_used: 1284,
            quota_reset_at: 1783260000,
          },
        },
      };
      fetch.mockResolvedValue(mockRes(200, body));

      const data = await fetchUsage("test-token");

      expect(data.exhausted).toBe(true);
      expect(data.resetDate).toEqual(new Date("2026-09-01T00:00:00Z"));
    });

    it.each([undefined, -1, Number.POSITIVE_INFINITY, "not-a-number"])(
      "returns undefined for invalid credits_used value %s",
      async (creditsUsed) => {
        const body = {
          ...BASE_BODY,
          quota_snapshots: {
            premium_interactions: {
              ...BASE_BODY.quota_snapshots.premium_interactions,
              credits_used: creditsUsed,
            },
          },
        };
        fetch.mockResolvedValue(mockRes(200, body));

        const data = await fetchUsage("test-token");

        expect(data.creditsUsed).toBeUndefined();
      },
    );
  });

  describe("quota snapshot cache", () => {
    const fullSnapshot = {
      percent_remaining: 90,
      unlimited: true,
      has_quota: true,
      quota_reset_at: 100,
      entitlement: 1000,
      quota_remaining: 900,
      credits_used: 100,
    };

    it("preserves defined fields missing from a later snapshot for the same account", async () => {
      fetch
        .mockResolvedValueOnce(
          mockRes(200, {
            copilot_plan: "business",
            analytics_tracking_id: "account-a",
            quota_snapshots: { premium_interactions: fullSnapshot },
          }),
        )
        .mockResolvedValueOnce(
          mockRes(200, {
            copilot_plan: "business",
            analytics_tracking_id: "account-a",
            quota_snapshots: {
              premium_interactions: { percent_remaining: 80, unlimited: true },
            },
          }),
        );

      await fetchUsage("test-token");
      const merged = await fetchUsage("test-token");

      expect(merged).toMatchObject({
        usedPct: 20,
        used: 100,
        quota: 1000,
        unlimited: true,
        hasQuota: true,
        creditsUsed: 100,
        resetDate: new Date(100 * 1000),
      });
    });

    it("lets explicit zero and false values overwrite cached fields", async () => {
      fetch
        .mockResolvedValueOnce(
          mockRes(200, {
            copilot_plan: "business",
            analytics_tracking_id: "account-a",
            quota_snapshots: { premium_interactions: fullSnapshot },
          }),
        )
        .mockResolvedValueOnce(
          mockRes(200, {
            copilot_plan: "business",
            analytics_tracking_id: "account-a",
            quota_snapshots: {
              premium_interactions: {
                percent_remaining: 0,
                unlimited: false,
                has_quota: false,
                quota_reset_at: 200,
                entitlement: 1000,
                quota_remaining: 0,
                credits_used: 0,
              },
            },
          }),
        );

      await fetchUsage("test-token");
      const updated = await fetchUsage("test-token");

      expect(updated).toMatchObject({
        quota: 1000,
        used: 1000,
        unlimited: false,
        hasQuota: false,
        creditsUsed: 0,
      });
    });

    it("removes a finite zero-entitlement snapshot before a later partial response", async () => {
      fetch
        .mockResolvedValueOnce(
          mockRes(200, {
            copilot_plan: "individual",
            analytics_tracking_id: "account-a",
            quota_snapshots: {
              premium_interactions: {
                percent_remaining: 90,
                unlimited: false,
                entitlement: 1000,
                quota_remaining: 900,
              },
            },
          }),
        )
        .mockResolvedValueOnce(
          mockRes(200, {
            copilot_plan: "individual",
            analytics_tracking_id: "account-a",
            quota_snapshots: {
              premium_interactions: {
                percent_remaining: 0,
                unlimited: false,
                entitlement: 0,
              },
            },
          }),
        )
        .mockResolvedValueOnce(
          mockRes(200, {
            copilot_plan: "individual",
            analytics_tracking_id: "account-a",
            quota_snapshots: {
              premium_interactions: {
                percent_remaining: 80,
                unlimited: false,
              },
            },
          }),
        );

      await fetchUsage("test-token");
      const zero = await fetchUsage("test-token");
      const partial = await fetchUsage("test-token");

      expect(zero).toMatchObject({ quota: 0, used: 0, noData: true });
      expect(partial).toMatchObject({ quota: 0, used: 0, usedPct: 20, noData: false });
    });

    it("removes cached data when the whole snapshot disappears", async () => {
      fetch
        .mockResolvedValueOnce(
          mockRes(200, {
            copilot_plan: "business",
            analytics_tracking_id: "account-a",
            quota_snapshots: { premium_interactions: fullSnapshot },
          }),
        )
        .mockResolvedValueOnce(
          mockRes(200, {
            copilot_plan: "business",
            analytics_tracking_id: "account-a",
          }),
        );

      await fetchUsage("test-token");
      const removed = await fetchUsage("test-token");

      expect(removed).toMatchObject({ quota: 0, used: 0, noData: true });
      expect(removed.creditsUsed).toBeUndefined();
    });

    it("does not reuse cached fields after the session account changes", async () => {
      fetch
        .mockResolvedValueOnce(
          mockRes(200, {
            copilot_plan: "business",
            analytics_tracking_id: "shared-tracking-id",
            quota_snapshots: { premium_interactions: fullSnapshot },
          }),
        )
        .mockResolvedValueOnce(
          mockRes(200, {
            copilot_plan: "individual",
            analytics_tracking_id: "shared-tracking-id",
            quota_snapshots: {
              premium_interactions: { percent_remaining: 80, unlimited: false },
            },
          }),
        );

      await fetchUsage("test-token", "session-account-a");
      const switched = await fetchUsage("test-token", "session-account-b");

      expect(switched).toMatchObject({ quota: 0, used: 0, unlimited: false });
      expect(switched.creditsUsed).toBeUndefined();
    });

    it("does not reuse cached fields after the API tracking identity changes", async () => {
      fetch
        .mockResolvedValueOnce(
          mockRes(200, {
            copilot_plan: "business",
            analytics_tracking_id: "tracking-a",
            quota_snapshots: { premium_interactions: fullSnapshot },
          }),
        )
        .mockResolvedValueOnce(
          mockRes(200, {
            copilot_plan: "individual",
            analytics_tracking_id: "tracking-b",
            quota_snapshots: {
              premium_interactions: { percent_remaining: 80, unlimited: false },
            },
          }),
        );

      await fetchUsage("test-token", "session-account");
      const switched = await fetchUsage("test-token", "session-account");

      expect(switched).toMatchObject({ quota: 0, used: 0, unlimited: false });
      expect(switched.creditsUsed).toBeUndefined();
    });

    it("does not commit snapshot fields from a response that fails validation", async () => {
      fetch
        .mockResolvedValueOnce(
          mockRes(200, {
            copilot_plan: "individual",
            analytics_tracking_id: "account-a",
            quota_snapshots: {
              premium_interactions: {
                percent_remaining: "invalid",
                unlimited: false,
                entitlement: 999,
              },
            },
          }),
        )
        .mockResolvedValueOnce(
          mockRes(200, {
            copilot_plan: "individual",
            analytics_tracking_id: "account-a",
            quota_snapshots: {
              premium_interactions: { percent_remaining: 80, unlimited: false },
            },
          }),
        );

      await expect(fetchUsage("test-token")).rejects.toMatchObject({ code: "API_ERROR" });
      const next = await fetchUsage("test-token");

      expect(next).toMatchObject({ quota: 0, used: 0, usedPct: 20 });
    });
  });

  describe("plan mapping", () => {
    const cases = [
      ["free", "Free"],
      ["individual", "Pro"],
      ["individual_pro", "Pro+"],
      ["individual_max", "Max"],
      ["individual_edu", "Student"],
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

    it("maps free_limited_copilot SKU to Free before copilot_plan", async () => {
      fetch.mockResolvedValue(
        mockRes(200, {
          ...BASE_BODY,
          access_type_sku: "free_limited_copilot",
          copilot_plan: "individual",
        }),
      );
      const data = await fetchUsage("test-token");
      expect(data.plan).toBe("Free");
    });

    it("maps free_educational_quota SKU to Student before copilot_plan", async () => {
      fetch.mockResolvedValue(
        mockRes(200, {
          ...BASE_BODY,
          access_type_sku: "free_educational_quota",
          copilot_plan: "individual",
        }),
      );
      const data = await fetchUsage("test-token");
      expect(data.plan).toBe("Student");
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

    it("propagates has_quota=false from pooled enterprise snapshot", async () => {
      const body = {
        copilot_plan: "enterprise",
        token_based_billing: true,
        quota_reset_date_utc: "2026-08-01T00:00:00Z",
        quota_snapshots: {
          premium_interactions: { unlimited: true, has_quota: false },
        },
      };
      fetch.mockResolvedValue(mockRes(200, body));
      const data = await fetchUsage("test-token");
      expect(data.unlimited).toBe(true);
      expect(data.hasQuota).toBe(false);
      // Pooled drained (has_quota=false) → exhausted is true
      expect(data.exhausted).toBe(true);
      // Pooled-exhausted users must still get the real server reset time,
      // NOT a synthesized next-month fallback.
      expect(data.resetDate).toEqual(new Date("2026-08-01T00:00:00Z"));
    });

    it("sets exhausted=true on normal path (percent_remaining present, unlimited+!hasQuota+!overage)", async () => {
      // Mirrors upstream chatEntitlementService.test.ts pooled-exhausted sample,
      // which has percent_remaining present (=0) so this hits the normal branch,
      // not the noData branch.
      const body = {
        copilot_plan: "enterprise",
        token_based_billing: true,
        quota_reset_date_utc: "2026-08-01T00:00:00Z",
        quota_snapshots: {
          premium_interactions: {
            entitlement: "0",
            percent_remaining: 0,
            unlimited: true,
            has_quota: false,
            overage_permitted: false,
            overage_count: 0,
          },
        },
      };
      fetch.mockResolvedValue(mockRes(200, body));
      const data = await fetchUsage("test-token");
      expect(data.unlimited).toBe(true);
      expect(data.hasQuota).toBe(false);
      expect(data.exhausted).toBe(true);
      expect(data.noData).toBe(false);
      expect(data.resetDate).toEqual(new Date("2026-08-01T00:00:00Z"));
    });

    it("sets exhausted=true when pooled hasQuota=false even if overage is permitted", async () => {
      // has_quota=false on a pooled (unlimited) plan is the authoritative
      // "org budget blocked" signal and overrides overage — mirrors upstream #318831.
      const body = {
        copilot_plan: "enterprise",
        token_based_billing: true,
        quota_snapshots: {
          premium_interactions: { unlimited: true, has_quota: false, overage_permitted: true },
        },
      };
      fetch.mockResolvedValue(mockRes(200, body));
      const data = await fetchUsage("test-token");
      expect(data.hasQuota).toBe(false);
      expect(data.exhausted).toBe(true);
    });

    it("sets exhausted=false for plain unlimited (hasQuota=true)", async () => {
      const body = {
        copilot_plan: "enterprise",
        quota_snapshots: { premium_interactions: { unlimited: true } },
      };
      fetch.mockResolvedValue(mockRes(200, body));
      const data = await fetchUsage("test-token");
      expect(data.unlimited).toBe(true);
      expect(data.exhausted).toBe(false);
    });

    it("defaults hasQuota=true when has_quota field is absent", async () => {
      fetch.mockResolvedValue(mockRes(200, BASE_BODY));
      const data = await fetchUsage("test-token");
      expect(data.hasQuota).toBe(true);
    });

    it("coerces hasQuota to boolean even if server returns truthy non-boolean", async () => {
      // Defensive: server contract says boolean but we Boolean()-coerce so UsageData.hasQuota
      // stays a strict boolean for downstream consumers and tooling.
      const body = {
        ...BASE_BODY,
        quota_snapshots: {
          premium_interactions: {
            ...BASE_BODY.quota_snapshots.premium_interactions,
            has_quota: "yes",
          },
        },
      };
      fetch.mockResolvedValue(mockRes(200, body));
      const data = await fetchUsage("test-token");
      expect(typeof data.hasQuota).toBe("boolean");
      expect(data.hasQuota).toBe(true);
    });

    it("returns noData when entitlement is '0' string and not unlimited (UBB free tier)", async () => {
      const body = {
        copilot_plan: "free",
        token_based_billing: true,
        quota_snapshots: {
          premium_interactions: {
            entitlement: "0",
            percent_remaining: 0,
            unlimited: false,
            overage_permitted: false,
            overage_count: 0,
          },
        },
      };
      fetch.mockResolvedValue(mockRes(200, body));
      const data = await fetchUsage("test-token");
      expect(data.noData).toBe(true);
      expect(data.quota).toBe(0);
      expect(data.tokenBasedBilling).toBe(true);
    });

    it("uses chat credits for Free token-based billing when premium_interactions has zero entitlement", async () => {
      const body = {
        copilot_plan: "free",
        token_based_billing: true,
        limited_user_reset_date: "2026-07-01T00:00:00Z",
        quota_snapshots: {
          chat: {
            entitlement: "200",
            percent_remaining: 100,
            quota_remaining: "200",
            unlimited: false,
          },
          completions: {
            entitlement: "2000",
            percent_remaining: 100,
            quota_remaining: "2000",
            unlimited: false,
          },
          premium_interactions: {
            entitlement: "0",
            percent_remaining: 0,
            unlimited: false,
            overage_permitted: false,
            overage_count: 0,
          },
        },
      };
      fetch.mockResolvedValue(mockRes(200, body));
      const data = await fetchUsage("test-token");
      expect(data.noData).toBe(false);
      expect(data.quota).toBe(200);
      expect(data.used).toBe(0);
      expect(data.usedPct).toBe(0);
      expect(data.resetDate).toEqual(new Date("2026-07-01T00:00:00Z"));
      expect(data.tokenBasedBilling).toBe(true);
    });

    it("uses chat credits when Free CFI is reported as individual plan", async () => {
      const body = {
        copilot_plan: "individual",
        access_type_sku: "free_limited_copilot",
        token_based_billing: true,
        quota_reset_date_utc: "2026-07-01T00:00:00.000Z",
        quota_snapshots: {
          chat: {
            entitlement: 200,
            percent_remaining: 100,
            quota_remaining: 200,
            unlimited: false,
            has_quota: false,
          },
          completions: {
            entitlement: 2000,
            percent_remaining: 99.8,
            quota_remaining: 1996,
            unlimited: false,
            has_quota: false,
          },
          premium_interactions: {
            entitlement: 0,
            percent_remaining: 0,
            quota_remaining: 0,
            unlimited: false,
            has_quota: false,
            overage_permitted: false,
            overage_count: 0,
          },
        },
      };
      fetch.mockResolvedValue(mockRes(200, body));
      const data = await fetchUsage("test-token");
      expect(data.noData).toBe(false);
      expect(data.plan).toBe("Free");
      expect(data.quota).toBe(200);
      expect(data.used).toBe(0);
      expect(data.usedPct).toBe(0);
      expect(data.resetDate).toEqual(new Date("2026-07-01T00:00:00.000Z"));
    });

    it("does not use Free token-based chat snapshot without entitlement", async () => {
      const body = {
        copilot_plan: "free",
        access_type_sku: "free_limited_copilot",
        token_based_billing: true,
        quota_reset_date_utc: "2026-07-01T00:00:00.000Z",
        quota_snapshots: {
          chat: {
            percent_remaining: 98.7,
            unlimited: false,
          },
          premium_interactions: {
            percent_remaining: 0,
            unlimited: false,
          },
        },
      };
      fetch.mockResolvedValue(mockRes(200, body));
      const data = await fetchUsage("test-token");
      expect(data.noData).toBe(true);
      expect(data.quota).toBe(0);
      expect(data.used).toBe(0);
      expect(data.usedPct).toBe(0);
    });

    it("uses premium interactions when educational SKU conflicts with free copilot_plan", async () => {
      const body = {
        copilot_plan: "free",
        access_type_sku: "free_educational_quota",
        token_based_billing: true,
        quota_snapshots: {
          chat: {
            entitlement: 200,
            percent_remaining: 100,
            quota_remaining: 200,
            unlimited: false,
          },
          premium_interactions: {
            entitlement: 300,
            percent_remaining: 70,
            quota_remaining: 210,
            unlimited: false,
          },
        },
      };
      fetch.mockResolvedValue(mockRes(200, body));
      const data = await fetchUsage("test-token");
      expect(data.noData).toBe(false);
      expect(data.plan).toBe("Student");
      expect(data.quota).toBe(300);
      expect(data.used).toBe(90);
      expect(data.usedPct).toBe(30);
    });

    it("does not use chat quota for Free when token_based_billing is absent", async () => {
      const body = {
        copilot_plan: "free",
        limited_user_reset_date: "2026-07-01T00:00:00Z",
        quota_snapshots: {
          chat: {
            entitlement: "200",
            percent_remaining: 100,
            quota_remaining: "200",
            unlimited: false,
          },
          premium_interactions: {
            entitlement: "0",
            percent_remaining: 0,
            unlimited: false,
          },
        },
      };
      fetch.mockResolvedValue(mockRes(200, body));
      const data = await fetchUsage("test-token");
      expect(data.noData).toBe(true);
      expect(data.quota).toBe(0);
      expect(data.used).toBe(0);
      expect(data.usedPct).toBe(0);
      expect(data.tokenBasedBilling).toBe(false);
    });

    it("does not use legacy Free chat quota without token-based billing", async () => {
      const body = {
        copilot_plan: "free",
        quota_reset_date: "2026-07-01T00:00:00Z",
        monthly_quotas: { chat: 200, completions: 2000 },
        limited_user_quotas: { chat: 200, completions: 2000 },
      };
      fetch.mockResolvedValue(mockRes(200, body));
      const data = await fetchUsage("test-token");
      expect(data.noData).toBe(true);
      expect(data.quota).toBe(0);
      expect(data.used).toBe(0);
      expect(data.usedPct).toBe(0);
      expect(data.resetDate).toEqual(new Date("2026-07-01T00:00:00Z"));
    });

    it("returns noData when entitlement='0' even if percent_remaining is non-zero", async () => {
      // Regression: noEntitlement check must depend ONLY on parsedEntitlement === 0,
      // NOT short-circuit on percent_remaining. Anomalous server response (e.g. stale
      // percent_remaining alongside zeroed entitlement) still routes to noData.
      const body = {
        ...BASE_BODY,
        quota_snapshots: {
          premium_interactions: {
            ...BASE_BODY.quota_snapshots.premium_interactions,
            entitlement: "0",
            percent_remaining: 50,
          },
        },
      };
      fetch.mockResolvedValue(mockRes(200, body));
      const data = await fetchUsage("test-token");
      expect(data.noData).toBe(true);
      expect(data.quota).toBe(0);
      expect(data.usedPct).toBe(0);
    });

    it("Free CFI without entitlement field but percent_remaining=0 routes to noData", async () => {
      // Upstream parseQuotas keeps this snapshot because the dashboard shows chat/completions
      // alongside premium_interactions for context. The status bar's single-value display
      // would otherwise show "100% red" and falsely imply exhaustion to a user who never had
      // a premium allowance — we extend noEntitlement to cover this shape.
      const body = {
        copilot_plan: "free",
        token_based_billing: true,
        quota_snapshots: {
          premium_interactions: {
            overage_count: 0,
            overage_permitted: false,
            percent_remaining: 0,
            unlimited: false,
          },
        },
      };
      fetch.mockResolvedValue(mockRes(200, body));
      const data = await fetchUsage("test-token");
      expect(data.noData).toBe(true);
      expect(data.quota).toBe(0);
    });

    it("Free CFI with string percent_remaining='0' also routes to noData", async () => {
      // Defensive: noEntitlement carve-out coerces percent_remaining the same way
      // entitlement and quota_remaining are coerced, so a string "0" payload doesn't
      // slip past and render as 100% red.
      const body = {
        copilot_plan: "free",
        token_based_billing: true,
        quota_snapshots: {
          premium_interactions: {
            overage_count: 0,
            overage_permitted: false,
            percent_remaining: "0",
            unlimited: false,
          },
        },
      };
      fetch.mockResolvedValue(mockRes(200, body));
      const data = await fetchUsage("test-token");
      expect(data.noData).toBe(true);
      expect(data.usedPct).toBe(0);
    });

    it("missing entitlement with non-zero percent_remaining stays on normal path (legacy compat)", async () => {
      // Backward-compat guard: only `percent_remaining === 0` AND missing entitlement triggers
      // the Free CFI noData route. A non-zero percent_remaining means the user actually has
      // usable allowance — show it.
      const piWithout = {
        ...BASE_BODY.quota_snapshots.premium_interactions,
        percent_remaining: 70,
      };
      delete piWithout.entitlement;
      const body = { ...BASE_BODY, quota_snapshots: { premium_interactions: piWithout } };
      fetch.mockResolvedValue(mockRes(200, body));
      const data = await fetchUsage("test-token");
      expect(data.noData).toBe(false);
      expect(data.usedPct).toBe(30); // 100 - 70
      expect(data.quota).toBe(0);
    });
  });

  describe("token-based billing", () => {
    it("sets tokenBasedBilling=false when field is absent", async () => {
      fetch.mockResolvedValue(mockRes(200, BASE_BODY));
      const data = await fetchUsage("test-token");
      expect(data.tokenBasedBilling).toBe(false);
    });

    it("sets tokenBasedBilling=true when token_based_billing is true", async () => {
      fetch.mockResolvedValue(mockRes(200, { ...BASE_BODY, token_based_billing: true }));
      const data = await fetchUsage("test-token");
      expect(data.tokenBasedBilling).toBe(true);
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

    it("times out when response body (res.json) hangs past the 15s deadline", async () => {
      vi.useFakeTimers();
      // Headers come back fine, but the body never resolves until abort fires.
      fetch.mockImplementation((_url, { signal }) => {
        return Promise.resolve({
          status: 200,
          ok: true,
          json: () =>
            new Promise((_resolve, reject) => {
              signal.addEventListener("abort", () => {
                const err = new Error("The operation was aborted");
                err.name = "AbortError";
                reject(err);
              });
            }),
        });
      });
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

    it("returns resetDate=undefined when quota_reset_date is an invalid date string", async () => {
      fetch.mockResolvedValue(mockRes(200, { ...BASE_BODY, quota_reset_date: "not-a-date" }));
      const data = await fetchUsage("token");
      expect(data.resetDate).toBeUndefined();
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
      // entitlement === 0 (not unlimited) → noData branch (matches upstream parseQuotas)
      expect(data.noData).toBe(true);
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
      // Missing entitlement (undefined) is NOT treated as "explicit zero" — stays on normal path
      expect(data.noData).toBe(false);
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
