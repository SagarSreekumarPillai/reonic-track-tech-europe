import {
  type DesignRecommendation,
  type HouseholdProfile,
  type OptimizationPriority,
} from "@/types/design";
import priors from "@/data/reonic-recommendation-priors.json";

const ORIENTATION_FACTOR: Record<HouseholdProfile["orientation"], number> = {
  south: 1,
  south_east: 0.95,
  south_west: 0.95,
  east: 0.88,
  west: 0.88,
  north: 0.65,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

export function generateRecommendation(
  profile: HouseholdProfile,
  priority: OptimizationPriority
): DesignRecommendation {
  const demandDivisor = Math.max(780, Math.min(980, priors.demand.pvDemandDivisor || 860));
  const evMultiplier = Math.max(0.85, Math.min(1.2, priors.demand.evMultiplier || 1.05));
  const orientationFactor = ORIENTATION_FACTOR[profile.orientation];
  const maxPvByRoof = (profile.roofArea / 5) * orientationFactor;
  const demandAdjusted = profile.annualConsumption / demandDivisor;
  const evBoost = profile.hasEV ? 0.8 * evMultiplier : 0;
  const priorityPvDelta =
    priority === "maximize_savings"
      ? 0.6
      : priority === "minimize_upfront"
        ? -0.4
        : 0.2;

  const pvSizeKw = roundToHalf(
    clamp(demandAdjusted + evBoost + priorityPvDelta, 2, maxPvByRoof)
  );

  const baseBattery = pvSizeKw * 1.05;
  const priorityBatteryFactor =
    priority === "maximize_savings"
      ? 1.1
      : priority === "maximize_self_consumption"
        ? 1.25
        : 0.72;
  const evBatteryBonus = profile.hasEV ? 1.2 : 0;
  const batteryKwh = roundToHalf(
    clamp(baseBattery * priorityBatteryFactor + evBatteryBonus, 2, 22)
  );

  const heatingIsFossil =
    profile.heatingType === "gas" || profile.heatingType === "oil";
  const heatingDemandHint =
    profile.heatingType === "gas"
      ? priors.heating.gas?.avgDemandKwh ?? 4300
      : profile.heatingType === "oil"
        ? priors.heating.oil?.avgDemandKwh ?? 4400
        : 4500;
  const recommendHeatPump =
    !profile.hasHeatPump &&
    heatingIsFossil &&
    (profile.annualConsumption > heatingDemandHint || profile.householdSize >= 3);

  const estimatedSelfConsumptionPct = clamp(
    35 + batteryKwh * 2.8 + (profile.hasEV ? 4 : 0),
    35,
    92
  );
  const usableRoofAreaM2 = profile.roofArea * (profile.orientation === "north" ? 0.68 : 0.82);
  const moduleAreaM2 = 1.9;
  const estimatedModuleCount = Math.max(4, Math.floor(usableRoofAreaM2 / moduleAreaM2));
  const usedAreaForPv = pvSizeKw * 5;
  const roofUtilizationPct = Math.round(
    clamp((usedAreaForPv / Math.max(usableRoofAreaM2, 1)) * 100, 20, 100)
  );

  return {
    pvSizeKw,
    batteryKwh,
    recommendHeatPump,
    estimatedSelfConsumptionPct: Math.round(estimatedSelfConsumptionPct),
    estimatedModuleCount,
    roofUtilizationPct,
  };
}
