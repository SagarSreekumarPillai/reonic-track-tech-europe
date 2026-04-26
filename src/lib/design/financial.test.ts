import { simulateFinancials } from "@/lib/design/financial";
import type { DesignRecommendation, HouseholdProfile } from "@/types/design";

const profile: HouseholdProfile = {
  annualConsumption: 6200,
  roofArea: 42,
  orientation: "south",
  electricityPrice: 0.35,
  hasEV: true,
  heatingType: "gas",
  householdSize: 4,
  hasHeatPump: false,
};

const recommendation: DesignRecommendation = {
  pvSizeKw: 8,
  batteryKwh: 10,
  recommendHeatPump: true,
  estimatedSelfConsumptionPct: 68,
  estimatedModuleCount: 18,
  roofUtilizationPct: 74,
};

describe("simulateFinancials", () => {
  it("returns positive annual savings and reasonable payback", () => {
    const financials = simulateFinancials(profile, recommendation);
    expect(financials.annualSavings).toBeGreaterThan(0);
    expect(financials.paybackYears).toBeGreaterThan(0);
    expect(financials.paybackYears).toBeLessThan(25);
  });
});
