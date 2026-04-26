import { generateRationaleWithFallback } from "@/lib/integrations/reasoning-provider";
import type { RationaleContext } from "@/lib/integrations/gemini";

const context: RationaleContext = {
  profile: {
    annualConsumption: 6200,
    roofArea: 42,
    orientation: "south",
    electricityPrice: 0.35,
    hasEV: true,
    heatingType: "gas",
    householdSize: 4,
    hasHeatPump: false,
  },
  recommendation: {
    pvSizeKw: 8,
    batteryKwh: 10,
    recommendHeatPump: true,
    estimatedSelfConsumptionPct: 69,
    estimatedModuleCount: 18,
    roofUtilizationPct: 74,
  },
  financials: {
    installCost: 22000,
    annualSavings: 2600,
    paybackYears: 8.5,
    co2ReductionKg: 3200,
  },
  priority: "maximize_savings",
};

describe("generateRationaleWithFallback", () => {
  it("fails fast when Gemini unavailable and local endpoint missing", async () => {
    const original = process.env.GEMINI_API_KEY;
    const originalLocal = process.env.LOCAL_REASONING_ENDPOINT;
    delete process.env.GEMINI_API_KEY;
    delete process.env.LOCAL_REASONING_ENDPOINT;
    await expect(generateRationaleWithFallback(context)).rejects.toThrow(
      /Rationale generation failed/
    );
    process.env.GEMINI_API_KEY = original;
    process.env.LOCAL_REASONING_ENDPOINT = originalLocal;
  });
});
