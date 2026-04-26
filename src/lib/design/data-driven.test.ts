import { predictFromReonicDataset } from "@/lib/design/data-driven";
import type { HouseholdProfile } from "@/types/design";

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

describe("predictFromReonicDataset", () => {
  it("returns coherent recommendation and offers from real dataset", () => {
    const result = predictFromReonicDataset(profile, "maximize_savings");
    expect(result.recommendation.pvSizeKw).toBeGreaterThan(0);
    expect(result.recommendation.estimatedModuleCount).toBeGreaterThan(0);
    expect(result.offer.code.length).toBeGreaterThan(0);
    expect(result.alternatives.length).toBe(2);
  });
});
