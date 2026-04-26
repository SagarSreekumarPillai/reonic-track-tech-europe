import { buildOfferVariants } from "@/lib/design/offers";
import type { DesignRecommendation, FinancialMetrics } from "@/types/design";

const recommendation: DesignRecommendation = {
  pvSizeKw: 8,
  batteryKwh: 10,
  recommendHeatPump: true,
  estimatedSelfConsumptionPct: 70,
  estimatedModuleCount: 18,
  roofUtilizationPct: 76,
};

const financials: FinancialMetrics = {
  installCost: 23000,
  annualSavings: 2900,
  paybackYears: 7.9,
  co2ReductionKg: 3600,
};

describe("buildOfferVariants", () => {
  it("returns one primary offer and two alternatives", () => {
    const result = buildOfferVariants({
      priority: "minimize_upfront",
      recommendation,
      financials,
    });
    expect(result.offer.code.length).toBeGreaterThan(0);
    expect(result.alternatives).toHaveLength(2);
    expect(result.alternatives[0].code).not.toBe(result.offer.code);
  });
});
