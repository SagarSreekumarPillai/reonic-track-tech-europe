import {
  type DesignRecommendation,
  type FinancialMetrics,
  type HouseholdProfile,
} from "@/types/design";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function simulateFinancials(
  profile: HouseholdProfile,
  recommendation: DesignRecommendation
): FinancialMetrics {
  const pvCost = recommendation.pvSizeKw * 1350;
  const batteryCost = recommendation.batteryKwh * 680;
  const heatPumpCost = recommendation.recommendHeatPump ? 9800 : 0;
  const installCost = pvCost + batteryCost + heatPumpCost;

  const yearlyPvYield = recommendation.pvSizeKw * 920;
  const selfUseKwh =
    yearlyPvYield * (recommendation.estimatedSelfConsumptionPct / 100);
  const directSavings = selfUseKwh * profile.electricityPrice;
  const exportRevenue = (yearlyPvYield - selfUseKwh) * 0.08;
  const heatPumpSavings = recommendation.recommendHeatPump ? 700 : 0;
  const annualSavings = directSavings + exportRevenue + heatPumpSavings;

  const paybackYears = annualSavings > 0 ? installCost / annualSavings : 99;
  const gridFactor = 0.42;
  const co2ReductionKg = yearlyPvYield * gridFactor + (recommendation.recommendHeatPump ? 600 : 0);

  return {
    installCost: round2(installCost),
    annualSavings: round2(annualSavings),
    paybackYears: round2(paybackYears),
    co2ReductionKg: round2(co2ReductionKg),
  };
}
