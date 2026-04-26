import { generateRecommendation } from "@/lib/design/engine";
import type { HouseholdProfile } from "@/types/design";

const baseProfile: HouseholdProfile = {
  annualConsumption: 6200,
  roofArea: 42,
  orientation: "south",
  electricityPrice: 0.35,
  hasEV: true,
  heatingType: "gas",
  householdSize: 4,
  hasHeatPump: false,
};

describe("generateRecommendation", () => {
  it("respects roof-based PV constraints", () => {
    const limitedRoofProfile = { ...baseProfile, roofArea: 12, orientation: "north" as const };
    const recommendation = generateRecommendation(limitedRoofProfile, "maximize_savings");
    expect(recommendation.pvSizeKw).toBeLessThanOrEqual((12 / 5) * 0.65);
  });

  it("reduces battery size when minimizing upfront cost", () => {
    const minUpfront = generateRecommendation(baseProfile, "minimize_upfront");
    const maxSelf = generateRecommendation(baseProfile, "maximize_self_consumption");
    expect(minUpfront.batteryKwh).toBeLessThan(maxSelf.batteryKwh);
  });

  it("increases module fit estimate with larger roof area", () => {
    const smallRoof = generateRecommendation({ ...baseProfile, roofArea: 20 }, "maximize_savings");
    const largeRoof = generateRecommendation({ ...baseProfile, roofArea: 60 }, "maximize_savings");
    expect(largeRoof.estimatedModuleCount).toBeGreaterThanOrEqual(smallRoof.estimatedModuleCount);
  });
});
