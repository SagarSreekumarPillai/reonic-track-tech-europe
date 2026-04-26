import { createClient } from "@supabase/supabase-js";

const ORIENTATIONS = ["south", "south_east", "south_west", "east", "west", "north"];
const HEATING_TYPES = ["gas", "oil", "electric", "district", "other"];
const PRIORITIES = [
  "maximize_savings",
  "minimize_upfront",
  "maximize_self_consumption",
];

const ORIENTATION_FACTOR = {
  south: 1,
  south_east: 0.95,
  south_west: 0.95,
  east: 0.88,
  west: 0.88,
  north: 0.65,
};

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundToHalf(value) {
  return Math.round(value * 2) / 2;
}

function generateProfile() {
  return {
    annualConsumption: Math.round(rand(2400, 12000)),
    roofArea: Math.round(rand(20, 110)),
    orientation: pick(ORIENTATIONS),
    electricityPrice: Number(rand(0.21, 0.49).toFixed(2)),
    hasEV: Math.random() > 0.45,
    heatingType: pick(HEATING_TYPES),
    householdSize: Math.round(rand(1, 6)),
    hasHeatPump: Math.random() > 0.68,
  };
}

function generateRecommendation(profile, priority) {
  const orientationFactor = ORIENTATION_FACTOR[profile.orientation];
  const maxPvByRoof = (profile.roofArea / 5) * orientationFactor;
  const demandAdjusted = profile.annualConsumption / 820;
  const evBoost = profile.hasEV ? 0.8 : 0;
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
  const heatingIsFossil = profile.heatingType === "gas" || profile.heatingType === "oil";
  const recommendHeatPump =
    !profile.hasHeatPump &&
    heatingIsFossil &&
    (profile.annualConsumption > 4200 || profile.householdSize >= 3);

  const estimatedSelfConsumptionPct = Math.round(
    clamp(35 + batteryKwh * 2.8 + (profile.hasEV ? 4 : 0), 35, 92)
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
    estimatedSelfConsumptionPct,
    estimatedModuleCount,
    roofUtilizationPct,
  };
}

function simulateFinancials(profile, recommendation) {
  const pvCost = recommendation.pvSizeKw * 1350;
  const batteryCost = recommendation.batteryKwh * 680;
  const heatPumpCost = recommendation.recommendHeatPump ? 9800 : 0;
  const installCost = pvCost + batteryCost + heatPumpCost;

  const yearlyPvYield = recommendation.pvSizeKw * 920;
  const selfUseKwh = yearlyPvYield * (recommendation.estimatedSelfConsumptionPct / 100);
  const directSavings = selfUseKwh * profile.electricityPrice;
  const exportRevenue = (yearlyPvYield - selfUseKwh) * 0.08;
  const heatPumpSavings = recommendation.recommendHeatPump ? 700 : 0;
  const annualSavings = directSavings + exportRevenue + heatPumpSavings;

  const paybackYears = annualSavings > 0 ? installCost / annualSavings : 99;
  const gridFactor = 0.42;
  const co2ReductionKg =
    yearlyPvYield * gridFactor + (recommendation.recommendHeatPump ? 600 : 0);

  return {
    installCost: Number(installCost.toFixed(2)),
    annualSavings: Number(annualSavings.toFixed(2)),
    paybackYears: Number(paybackYears.toFixed(2)),
    co2ReductionKg: Number(co2ReductionKg.toFixed(2)),
  };
}

function buildRationale(profile, recommendation, financials, priority) {
  const objective =
    priority === "maximize_savings"
      ? "maximize annual bill reduction"
      : priority === "minimize_upfront"
        ? "reduce upfront investment"
        : "maximize on-site solar usage";

  return {
    pvReason: `${recommendation.pvSizeKw} kWp is selected against ${profile.annualConsumption} kWh demand while respecting roof fit (${recommendation.estimatedModuleCount} modules estimated).`,
    batteryReason: `${recommendation.batteryKwh} kWh supports the objective to ${objective}, balancing self-consumption (${recommendation.estimatedSelfConsumptionPct}%) with project economics.`,
    heatPumpReason: recommendation.recommendHeatPump
      ? "Heat pump is recommended because current heating profile indicates strong decarbonization and lifecycle savings potential."
      : "Heat pump is not recommended in this variant because the selected objective prioritizes other investment levers first.",
    tradeoffSummary: `This proposal emphasizes ${objective}. Estimated package CAPEX is EUR ${financials.installCost} with annual savings around EUR ${financials.annualSavings} and payback near ${financials.paybackYears} years.`,
    assumptions: [
      "Synthetic training scenario generated from deterministic logic.",
      "No external tariff-specific policy assumptions attached.",
    ],
  };
}

async function main() {
  const count = Number(process.argv[2] ?? "400");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const profile = generateProfile();
    const priority = pick(PRIORITIES);
    const recommendation = generateRecommendation(profile, priority);
    const financials = simulateFinancials(profile, recommendation);
    const rationale = buildRationale(profile, recommendation, financials, priority);
    rows.push({
      profile,
      optimization_priority: priority,
      recommendation,
      financials,
      rationale,
      assumptions: ["Rationale provider: synthetic-seeder"],
    });
  }

  const chunkSize = 100;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from("design_scenarios").insert(chunk);
    if (error) throw error;
    inserted += chunk.length;
  }
  console.log(`Inserted ${inserted} synthetic scenarios`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
