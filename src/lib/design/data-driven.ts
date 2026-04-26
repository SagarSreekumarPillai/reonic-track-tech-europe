import dataset from "@/data/reonic-training-dataset.json";
import offerModel from "@/data/reonic-offer-model.json";
import componentModel from "@/data/reonic-component-model.json";
import componentPredictor from "@/data/reonic-component-predictor.json";
import componentWeights from "@/data/reonic-component-weights.json";
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
type ComponentModel = {
  byFamily?: Record<string, Array<{ component: string; count: number }>>;
  byObjective?: Record<string, Array<{ component: string; count: number }>>;
  byFamilyBundles?: Record<
    string,
    Array<{
      components: string[];
      count: number;
    }>
  >;
  topCoOccurrencePairs?: Array<{ a: string; b: string; count: number }>;
};
const COMPONENT_MODEL = componentModel as ComponentModel;
type ComponentPredictor = {
  components: Array<{
    component: string;
    support: number;
    centroid: number[];
    spread: number[];
  }>;
};
const COMPONENT_PREDICTOR = componentPredictor as ComponentPredictor;
type ComponentWeights = {
  objectivePrior: number;
  familyPrior: number;
  bundleBoost: number;
  coOccurrence: number;
  predictor: number;
};
const COMPONENT_WEIGHTS = componentWeights as ComponentWeights;

function featureVectorForComponentPredictor(params: {
  profile: HouseholdProfile;
  objective: OptimizationPriority;
  pvKwp: number;
  batteryKwh: number;
  moduleCount: number;
  recommendHeatPump: boolean;
}) {
  return [
    params.profile.annualConsumption,
    params.profile.electricityPrice,
    params.profile.hasEV ? 1 : 0,
    params.profile.householdSize,
    params.objective === "maximize_savings" ? 1 : 0,
    params.objective === "minimize_upfront" ? 1 : 0,
    params.objective === "maximize_self_consumption" ? 1 : 0,
    params.pvKwp,
    params.batteryKwh,
    params.moduleCount,
    params.recommendHeatPump ? 1 : 0,
  ];
}

function gaussianScore(x: number[], centroid: number[], spread: number[]) {
  const len = Math.min(x.length, centroid.length, spread.length);
  let score = 0;
  for (let i = 0; i < len; i += 1) {
    const sigma = Math.max(0.05, spread[i]);
    const z = (x[i] - centroid[i]) / sigma;
    score += z * z;
  }
  return Math.exp(-0.5 * score / Math.max(1, len));
}

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

function aggregateComponents(
  nearest: DataRow[],
  profile: HouseholdProfile,
  objective: OptimizationPriority,
  selectedFamily?: string,
  predicted?: {
    pvKwp: number;
    batteryKwh: number;
    moduleCount: number;
    recommendHeatPump: boolean;
  }
): string[] {
  const scored = new Map<string, number>();
  const scoredNearest = [...nearest]
    .map((row) => ({ row, d: distance(row, profile, objective) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 10);

  for (const { row, d } of scoredNearest) {
    const w = 1 / (0.2 + d);
    for (const component of row.offer.components ?? []) {
      const key = component.trim();
      if (!key) continue;
      scored.set(key, (scored.get(key) ?? 0) + w);
    }
  }

  const objectivePriors =
    (COMPONENT_MODEL.byObjective?.[objective] as
      | Array<{ component: string; count: number }>
      | undefined) ?? [];
  for (const item of objectivePriors.slice(0, 18)) {
    scored.set(
      item.component,
      (scored.get(item.component) ?? 0) + item.count * COMPONENT_WEIGHTS.objectivePrior
    );
  }

  if (selectedFamily) {
    const familyPriors =
      (COMPONENT_MODEL.byFamily?.[selectedFamily] as
        | Array<{ component: string; count: number }>
        | undefined) ?? [];
    for (const item of familyPriors.slice(0, 18)) {
      scored.set(
        item.component,
        (scored.get(item.component) ?? 0) + item.count * COMPONENT_WEIGHTS.familyPrior
      );
    }
  }

  const provisional = [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name]) => name.toLowerCase());

  if (selectedFamily) {
    const bundles = COMPONENT_MODEL.byFamilyBundles?.[selectedFamily] ?? [];
    let bestBundle: string[] | null = null;
    let bestScore = -1;
    for (const bundle of bundles.slice(0, 6)) {
      const setA = new Set(provisional);
      const setB = new Set(bundle.components.map((x) => x.toLowerCase()));
      const overlap = [...setA].filter((x) => setB.has(x)).length;
      const union = new Set([...setA, ...setB]).size;
      const jaccard = union > 0 ? overlap / union : 0;
      const weighted = jaccard + bundle.count * 0.005;
      if (weighted > bestScore) {
        bestScore = weighted;
        bestBundle = bundle.components;
      }
    }
    if (bestBundle) {
      for (const c of bestBundle) {
        scored.set(c, (scored.get(c) ?? 0) + COMPONENT_WEIGHTS.bundleBoost);
      }
    }
  }

  const predictorX = featureVectorForComponentPredictor({
    profile,
    objective,
    pvKwp: predicted?.pvKwp ?? profile.annualConsumption / 1000,
    batteryKwh: predicted?.batteryKwh ?? (profile.hasEV ? 10 : 6),
    moduleCount: predicted?.moduleCount ?? Math.max(4, Math.round(profile.roofArea / 2)),
    recommendHeatPump:
      predicted?.recommendHeatPump ??
      (profile.heatingType === "gas" || profile.heatingType === "oil"),
  });
  for (const c of COMPONENT_PREDICTOR.components ?? []) {
    const s =
      gaussianScore(predictorX, c.centroid, c.spread) *
      Math.log1p(c.support) *
      COMPONENT_WEIGHTS.predictor;
    scored.set(c.component, (scored.get(c.component) ?? 0) + s);
  }

  const pairs = COMPONENT_MODEL.topCoOccurrencePairs ?? [];
  const topNow = [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name]) => name.toLowerCase());
  const topSet = new Set(topNow);
  for (const p of pairs.slice(0, 100)) {
    const aIn = topSet.has(p.a);
    const bIn = topSet.has(p.b);
    if (aIn && !bIn) {
      scored.set(
        p.b,
        (scored.get(p.b) ?? 0) + p.count * COMPONENT_WEIGHTS.coOccurrence
      );
    } else if (!aIn && bIn) {
      scored.set(
        p.a,
        (scored.get(p.a) ?? 0) + p.count * COMPONENT_WEIGHTS.coOccurrence
      );
    }
  }

  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name]) => name);
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
  const predictedComponents = aggregateComponents(
    nearest,
    profile,
    objective,
    chosenFamily?.family,
    {
      pvKwp: pvSizeKw,
      batteryKwh,
      moduleCount: estimatedModuleCount,
      recommendHeatPump,
    }
  );
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
    components:
      predictedComponents.length > 0
        ? predictedComponents.slice(0, 6)
        : (primary?.components ?? chosenFamily?.components ?? offerSource.components).slice(0, 6),
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
      components:
        predictedComponents.length > 0
          ? predictedComponents.slice(0, 6)
          : row.components.slice(0, 6),
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
