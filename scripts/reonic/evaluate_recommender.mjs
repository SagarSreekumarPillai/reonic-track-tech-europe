import fs from "node:fs/promises";
import path from "node:path";

const INPUT_FILE = path.resolve("src/data/reonic-training-dataset.json");
const COMPONENT_MODEL_FILE = path.resolve("src/data/reonic-component-model.json");
const COMPONENT_PREDICTOR_FILE = path.resolve("src/data/reonic-component-predictor.json");
const COMPONENT_WEIGHTS_FILE = path.resolve("src/data/reonic-component-weights.json");
const OUT_FILE = path.resolve("ml/data/reonic_recommender_eval.json");

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

function aggregateComponents(nearest, objective, family, componentModel, componentWeights) {
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
  const objectivePriors = componentModel.byObjective?.[objective] ?? [];
  for (const item of objectivePriors.slice(0, 18)) {
    scores.set(
      item.component,
      (scores.get(item.component) ?? 0) + item.count * componentWeights.objectivePrior
    );
  }
  const familyPriors = componentModel.byFamily?.[family] ?? [];
  for (const item of familyPriors.slice(0, 18)) {
    scores.set(
      item.component,
      (scores.get(item.component) ?? 0) + item.count * componentWeights.familyPrior
    );
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
    for (const c of bestBundle) {
      scores.set(c, (scores.get(c) ?? 0) + componentWeights.bundleBoost);
    }
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
    if (aIn && !bIn) {
      scores.set(
        pair.b,
        (scores.get(pair.b) ?? 0) + pair.count * componentWeights.coOccurrence
      );
    } else if (!aIn && bIn) {
      scores.set(
        pair.a,
        (scores.get(pair.a) ?? 0) + pair.count * componentWeights.coOccurrence
      );
    }
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k]) => k);
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

function predict(rows, sample, componentModel, componentPredictor, componentWeights) {
  const objective = sample.objectiveHint;
  const distance = (row) => {
    const demand = Math.abs(row.features.annualConsumptionKwh - sample.features.annualConsumptionKwh) / 12000;
    const price = Math.abs(row.features.electricityPrice - sample.features.electricityPrice) / 0.5;
    const ev = row.features.hasEv === sample.features.hasEv ? 0 : 0.5;
    const heating = row.features.heatingType === sample.features.heatingType ? 0 : 1;
    const household = Math.abs(row.features.householdSize - sample.features.householdSize) / 6;
    const objectivePenalty = row.objectiveHint === objective ? 0 : 0.35;
    return demand + price + ev + heating + household + objectivePenalty;
  };
  const nearest = [...rows].sort((a, b) => distance(a) - distance(b)).slice(0, 12);
  const w = (d) => 1 / (0.15 + d);
  let pv = 0;
  let battery = 0;
  let modules = 0;
  let heat = 0;
  let sum = 0;
  for (const n of nearest) {
    const d = distance(n);
    const wt = w(d);
    sum += wt;
    pv += n.labels.pvKwp * wt;
    battery += n.labels.batteryKwh * wt;
    modules += n.labels.moduleCount * wt;
    heat += (n.labels.recommendHeatPump ? 1 : -1) * wt;
  }
  const pvPred = pv / Math.max(sum, 1);
  const batteryPred = battery / Math.max(sum, 1);
  const modulesPred = modules / Math.max(sum, 1);
  const offerTop = nearest.slice(0, 6).map((n) => n.offer.code);
  const offerFamilyTop = nearest.slice(0, 6).map((n) => n.offer.title);
  const offerFamilyTop1 = nearest[0]?.offer?.title ?? "";
  const predictedComponents = aggregateComponents(
    nearest,
    sample.objectiveHint,
    offerFamilyTop1,
    componentModel,
    componentWeights
  );
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
    heat > 0 ? 1 : 0,
  ];
  const merged = new Map(predictedComponents.map((c, i) => [c, 10 - i]));
  for (const item of componentPredictor.components ?? []) {
    const s = gaussianScore(predictorX, item.centroid, item.spread) * Math.log1p(item.support);
    merged.set(item.component, (merged.get(item.component) ?? 0) + s * componentWeights.predictor);
  }
  const predictorComponents = [...merged.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k]) => k);
  return {
    pv: pvPred,
    battery: batteryPred,
    modules: modulesPred,
    heatPump: heat > 0,
    offerTop,
    offerFamilyTop,
    offerFamilyTop1,
    predictedComponents: predictorComponents,
  };
}

function mean(arr) {
  return arr.reduce((s, x) => s + x, 0) / Math.max(arr.length, 1);
}

async function main() {
  const dataset = JSON.parse(await fs.readFile(INPUT_FILE, "utf8"));
  const componentModel = JSON.parse(await fs.readFile(COMPONENT_MODEL_FILE, "utf8"));
  const componentPredictor = JSON.parse(
    await fs.readFile(COMPONENT_PREDICTOR_FILE, "utf8")
  );
  const componentWeights = JSON.parse(await fs.readFile(COMPONENT_WEIGHTS_FILE, "utf8"));
  const shuffled = [...dataset].sort(() => Math.random() - 0.5);
  const split = Math.floor(shuffled.length * 0.8);
  const train = shuffled.slice(0, split);
  const test = shuffled.slice(split);

  const pvAbsErr = [];
  const pvSqErr = [];
  const batAbsErr = [];
  const batSqErr = [];
  const hpAcc = [];
  const offerTop3 = [];
  const offerFamilyTop3 = [];
  const offerFamilyTop1 = [];
  const componentF1 = [];

  for (const sample of test) {
    const pred = predict(
      train,
      sample,
      componentModel,
      componentPredictor,
      componentWeights
    );
    const pvErr = Math.abs(pred.pv - sample.labels.pvKwp);
    const batErr = Math.abs(pred.battery - sample.labels.batteryKwh);
    pvAbsErr.push(pvErr);
    pvSqErr.push(pvErr ** 2);
    batAbsErr.push(batErr);
    batSqErr.push(batErr ** 2);
    hpAcc.push(pred.heatPump === sample.labels.recommendHeatPump ? 1 : 0);
    offerTop3.push(pred.offerTop.includes(sample.offer.code) ? 1 : 0);
    offerFamilyTop3.push(pred.offerFamilyTop.includes(sample.offer.title) ? 1 : 0);
    offerFamilyTop1.push(pred.offerFamilyTop1 === sample.offer.title ? 1 : 0);
    componentF1.push(f1ComponentOverlap(pred.predictedComponents, sample.offer.components));
  }

  const totalCodes = new Set(dataset.map((x) => x.offer.code)).size;
  const uniqueCodeCount = dataset.filter(
    (x, i, arr) => arr.findIndex((y) => y.offer.code === x.offer.code) === i
  ).length;
  const exactCodeLearnability = uniqueCodeCount === totalCodes ? "non_identifiable" : "learnable";

  const report = {
    trainSize: train.length,
    testSize: test.length,
    datasetDiagnostics: {
      totalCodes,
      uniqueCodeCount,
      exactCodeLearnability,
    },
    metrics: {
      pv_mae: Number(mean(pvAbsErr).toFixed(3)),
      pv_rmse: Number(Math.sqrt(mean(pvSqErr)).toFixed(3)),
      battery_mae: Number(mean(batAbsErr).toFixed(3)),
      battery_rmse: Number(Math.sqrt(mean(batSqErr)).toFixed(3)),
      heatpump_accuracy: Number(mean(hpAcc).toFixed(3)),
      offer_top3_accuracy: Number(mean(offerTop3).toFixed(3)),
      offer_family_top3_accuracy: Number(mean(offerFamilyTop3).toFixed(3)),
      offer_family_top1_accuracy: Number(mean(offerFamilyTop1).toFixed(3)),
      component_overlap_f1: Number(mean(componentF1).toFixed(3)),
    },
    generatedAt: new Date().toISOString(),
  };

  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify(report, null, 2), "utf8");
  console.log(report);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
