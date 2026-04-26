import dataset from "@/data/reonic-training-dataset.json";
import offerModel from "@/data/reonic-offer-model.json";
import type {
  HouseholdProfile,
  OptimizationPriority,
  OfferVariant,
} from "@/types/design";

interface DataRow {
  objectiveHint: OptimizationPriority;
  features: {
    annualConsumptionKwh: number;
    electricityPrice: number;
    hasEv: boolean;
    heatingType: string;
    householdSize: number;
    hasHeatPump: boolean;
  };
  labels: {
    pvKwp: number;
    batteryKwh: number;
    recommendHeatPump: boolean;
    moduleCount: number;
  };
  offer: {
    code: string;
    title: string;
    positioning: string;
    components: string[];
  };
}

const TRAINING_ROWS = dataset as DataRow[];
type OfferModelCode = {
  code: string;
  title: string;
  positioning: string;
  objectiveHint: OptimizationPriority;
  vector: number[];
  components: string[];
};
type OfferFamily = {
  family: string;
  objectiveHint: OptimizationPriority;
  centroid: number[];
  components: string[];
  codeCount: number;
  codes: OfferModelCode[];
};
const OFFER_FAMILIES = (offerModel.families as OfferFamily[]) ?? [];

function euclidean(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < len; i += 1) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

function heatingDistance(a: string, b: string): number {
  return a === b ? 0 : 1;
}

function distance(row: DataRow, profile: HouseholdProfile, objective: OptimizationPriority): number {
  const demand = Math.abs(row.features.annualConsumptionKwh - profile.annualConsumption) / 12000;
  const price = Math.abs(row.features.electricityPrice - profile.electricityPrice) / 0.5;
  const ev = row.features.hasEv === profile.hasEV ? 0 : 0.5;
  const heating = heatingDistance(row.features.heatingType, profile.heatingType);
  const household = Math.abs(row.features.householdSize - profile.householdSize) / 6;
  const hp = row.features.hasHeatPump === profile.hasHeatPump ? 0 : 0.4;
  const objectivePenalty = row.objectiveHint === objective ? 0 : 0.35;
  return demand + price + ev + heating + household + hp + objectivePenalty;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

export function predictFromReonicDataset(
  profile: HouseholdProfile,
  objective: OptimizationPriority
) {
  if (TRAINING_ROWS.length < 100) {
    throw new Error("Insufficient real Reonic training rows for strict data-driven mode.");
  }

  const nearest = [...TRAINING_ROWS]
    .sort((a, b) => distance(a, profile, objective) - distance(b, profile, objective))
    .slice(0, 12);

  const weight = (d: number) => 1 / (0.15 + d);
  let wSum = 0;
  let pv = 0;
  let battery = 0;
  let modules = 0;
  let heatVotes = 0;

  for (const row of nearest) {
    const d = distance(row, profile, objective);
    const w = weight(d);
    wSum += w;
    pv += row.labels.pvKwp * w;
    battery += row.labels.batteryKwh * w;
    modules += row.labels.moduleCount * w;
    heatVotes += (row.labels.recommendHeatPump ? 1 : -1) * w;
  }

  const orientationFactor =
    profile.orientation === "south"
      ? 1
      : profile.orientation === "south_east" || profile.orientation === "south_west"
        ? 0.95
        : profile.orientation === "east" || profile.orientation === "west"
          ? 0.88
          : 0.65;
  const maxPvByRoof = (profile.roofArea / 5) * orientationFactor;

  const objectivePvAdj = objective === "maximize_savings" ? 0.4 : objective === "minimize_upfront" ? -0.5 : 0.15;
  const objectiveBatteryFactor =
    objective === "maximize_self_consumption" ? 1.18 : objective === "minimize_upfront" ? 0.75 : 1.0;

  const pvSizeKw = roundToHalf(clamp(pv / Math.max(wSum, 1) + objectivePvAdj, 2, maxPvByRoof));
  const batteryKwh = roundToHalf(
    clamp((battery / Math.max(wSum, 1)) * objectiveBatteryFactor, 2, 26)
  );
  const estimatedModuleCount = Math.max(
    4,
    Math.round((modules / Math.max(wSum, 1)) * (pvSizeKw / Math.max(pv / Math.max(wSum, 1), 1)))
  );
  const recommendHeatPump = heatVotes > 0 && !profile.hasHeatPump;
  const usableRoofAreaM2 = profile.roofArea * (profile.orientation === "north" ? 0.68 : 0.82);
  const roofUtilizationPct = Math.round(clamp(((pvSizeKw * 5) / Math.max(usableRoofAreaM2, 1)) * 100, 20, 100));
  const estimatedSelfConsumptionPct = Math.round(
    clamp(35 + batteryKwh * 2.7 + (profile.hasEV ? 4 : 0), 35, 92)
  );

  const offerSource =
    nearest.find((row) => row.objectiveHint === objective)?.offer ?? nearest[0].offer;
  const query = [
    profile.annualConsumption,
    profile.electricityPrice,
    profile.hasEV ? 1 : 0,
    profile.householdSize,
    pvSizeKw,
    batteryKwh,
    estimatedModuleCount,
  ];
  const scoredFamilies = OFFER_FAMILIES.map((family) => {
    const objectivePenalty = family.objectiveHint === objective ? 0 : 0.8;
    return { family, score: euclidean(family.centroid, query) + objectivePenalty };
  })
    .sort((a, b) => a.score - b.score)
    .slice(0, 3);

  const chosenFamily = scoredFamilies[0]?.family;
  const familyCodes = (chosenFamily?.codes ?? []).map((code) => ({
    ...code,
    score:
      euclidean(code.vector, query) +
      (code.objectiveHint === objective ? 0 : 0.3),
  }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 3);

  const primary = familyCodes[0];
  const offer: OfferVariant = {
    code: primary?.code ?? offerSource.code,
    title: primary?.title ?? offerSource.title,
    positioning: primary?.positioning ?? offerSource.positioning,
    components: (primary?.components ?? chosenFamily?.components ?? offerSource.components).slice(0, 6),
    estimatedPrice: 0,
    bestFor: objective,
  };
  const alternatives: OfferVariant[] = familyCodes
    .filter((row) => row.code !== offer.code)
    .slice(0, 2)
    .map((row) => ({
      code: row.code,
      title: row.title,
      positioning: row.positioning,
      components: row.components.slice(0, 6),
      estimatedPrice: 0,
      bestFor: row.objectiveHint,
    }));
  while (alternatives.length < 2) {
    alternatives.push({
      code: `${offer.code}-ALT-${alternatives.length + 1}`,
      title: offer.title,
      positioning: offer.positioning,
      components: offer.components,
      estimatedPrice: 0,
      bestFor: objective,
    });
  }

  return {
    recommendation: {
      pvSizeKw,
      batteryKwh,
      recommendHeatPump,
      estimatedSelfConsumptionPct,
      estimatedModuleCount,
      roofUtilizationPct,
    },
    offer,
    alternatives,
  };
}
