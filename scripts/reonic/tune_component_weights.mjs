import fs from "node:fs/promises";
import path from "node:path";

const INPUT_FILE = path.resolve("src/data/reonic-training-dataset.json");
const COMPONENT_MODEL_FILE = path.resolve("src/data/reonic-component-model.json");
const COMPONENT_PREDICTOR_FILE = path.resolve("src/data/reonic-component-predictor.json");
const OUTPUT_FILE = path.resolve("src/data/reonic-component-weights.json");

function f1ComponentOverlap(predicted, truth) {
  const a = new Set((predicted ?? []).map((x) => String(x).toLowerCase()));
  const b = new Set((truth ?? []).map((x) => String(x).toLowerCase()));
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = [...a].filter((x) => b.has(x)).length;
  const precision = intersection / Math.max(a.size, 1);
  const recall = intersection / Math.max(b.size, 1);
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

function distance(row, sample) {
  const objective = sample.objectiveHint;
  const demand = Math.abs(row.features.annualConsumptionKwh - sample.features.annualConsumptionKwh) / 12000;
  const price = Math.abs(row.features.electricityPrice - sample.features.electricityPrice) / 0.5;
  const ev = row.features.hasEv === sample.features.hasEv ? 0 : 0.5;
  const heating = row.features.heatingType === sample.features.heatingType ? 0 : 1;
  const household = Math.abs(row.features.householdSize - sample.features.householdSize) / 6;
  const objectivePenalty = row.objectiveHint === objective ? 0 : 0.35;
  return demand + price + ev + heating + household + objectivePenalty;
}

function gaussianScore(x, centroid, spread) {
  const len = Math.min(x.length, centroid.length, spread.length);
  let score = 0;
  for (let i = 0; i < len; i += 1) {
    const sigma = Math.max(0.05, spread[i]);
    const z = (x[i] - centroid[i]) / sigma;
    score += z * z;
  }
  return Math.exp((-0.5 * score) / Math.max(1, len));
}

function aggregateComponents(nearest, sample, componentModel, componentPredictor, weights) {
  const scores = new Map();
  for (let i = 0; i < Math.min(nearest.length, 10); i += 1) {
    const row = nearest[i];
    const weight = 1 / (0.2 + i * 0.15);
    for (const component of row.offer.components ?? []) {
      const key = String(component).trim();
      if (!key) continue;
      scores.set(key, (scores.get(key) ?? 0) + weight);
    }
  }
  const family = nearest[0]?.offer?.title ?? "";
  const objectivePriors = componentModel.byObjective?.[sample.objectiveHint] ?? [];
  for (const item of objectivePriors.slice(0, 18)) {
    scores.set(item.component, (scores.get(item.component) ?? 0) + item.count * weights.objectivePrior);
  }
  const familyPriors = componentModel.byFamily?.[family] ?? [];
  for (const item of familyPriors.slice(0, 18)) {
    scores.set(item.component, (scores.get(item.component) ?? 0) + item.count * weights.familyPrior);
  }
  const provisional = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name]) => String(name).toLowerCase());
  const bundles = componentModel.byFamilyBundles?.[family] ?? [];
  let bestBundle = null;
  let bestScore = -1;
  for (const bundle of bundles.slice(0, 6)) {
    const setA = new Set(provisional);
    const setB = new Set(bundle.components.map((x) => String(x).toLowerCase()));
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
    for (const c of bestBundle) scores.set(c, (scores.get(c) ?? 0) + weights.bundleBoost);
  }
  const topSet = new Set(
    [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name]) => String(name).toLowerCase())
  );
  for (const pair of (componentModel.topCoOccurrencePairs ?? []).slice(0, 100)) {
    const aIn = topSet.has(pair.a);
    const bIn = topSet.has(pair.b);
    if (aIn && !bIn) scores.set(pair.b, (scores.get(pair.b) ?? 0) + pair.count * weights.coOccurrence);
    else if (!aIn && bIn) scores.set(pair.a, (scores.get(pair.a) ?? 0) + pair.count * weights.coOccurrence);
  }

  const pvPred = nearest.reduce((s, r) => s + r.labels.pvKwp, 0) / Math.max(nearest.length, 1);
  const batteryPred = nearest.reduce((s, r) => s + r.labels.batteryKwh, 0) / Math.max(nearest.length, 1);
  const modulesPred = nearest.reduce((s, r) => s + r.labels.moduleCount, 0) / Math.max(nearest.length, 1);
  const heatPred = nearest.some((r) => r.labels.recommendHeatPump);

  const predictorX = [
    sample.features.annualConsumptionKwh,
    sample.features.electricityPrice,
    sample.features.hasEv ? 1 : 0,
    sample.features.householdSize,
    sample.objectiveHint === "maximize_savings" ? 1 : 0,
    sample.objectiveHint === "minimize_upfront" ? 1 : 0,
    sample.objectiveHint === "maximize_self_consumption" ? 1 : 0,
    pvPred,
    batteryPred,
    modulesPred,
    heatPred ? 1 : 0,
  ];
  for (const item of componentPredictor.components ?? []) {
    const s = gaussianScore(predictorX, item.centroid, item.spread) * Math.log1p(item.support);
    scores.set(item.component, (scores.get(item.component) ?? 0) + s * weights.predictor);
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k]) => k);
}

async function main() {
  const dataset = JSON.parse(await fs.readFile(INPUT_FILE, "utf8"));
  const componentModel = JSON.parse(await fs.readFile(COMPONENT_MODEL_FILE, "utf8"));
  const componentPredictor = JSON.parse(await fs.readFile(COMPONENT_PREDICTOR_FILE, "utf8"));
  const shuffled = [...dataset].sort(() => Math.random() - 0.5);
  const split = Math.floor(shuffled.length * 0.8);
  const train = shuffled.slice(0, split);
  const test = shuffled.slice(split);

  const grid = [];
  for (const objectivePrior of [0.12, 0.18, 0.24]) {
    for (const familyPrior of [0.18, 0.24, 0.3]) {
      for (const bundleBoost of [1.8, 2.3, 2.8]) {
        for (const coOccurrence of [0.006, 0.01, 0.015]) {
          for (const predictor of [0.7, 0.9, 1.1]) {
            grid.push({ objectivePrior, familyPrior, bundleBoost, coOccurrence, predictor });
          }
        }
      }
    }
  }

  let best = null;
  for (const w of grid) {
    const f1s = [];
    for (const sample of test) {
      const nearest = [...train]
        .sort((a, b) => distance(a, sample) - distance(b, sample))
        .slice(0, 12);
      const pred = aggregateComponents(nearest, sample, componentModel, componentPredictor, w);
      f1s.push(f1ComponentOverlap(pred, sample.offer.components));
    }
    const meanF1 = f1s.reduce((s, x) => s + x, 0) / Math.max(f1s.length, 1);
    if (!best || meanF1 > best.meanF1) best = { ...w, meanF1 };
  }

  await fs.writeFile(OUTPUT_FILE, JSON.stringify(best, null, 2), "utf8");
  console.log("best", best);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
