import fs from "node:fs/promises";
import path from "node:path";

const INPUT = path.resolve("src/data/reonic-training-dataset.json");
const OUTPUT = path.resolve("src/data/reonic-component-predictor.json");

function vec(row) {
  return [
    row.features.annualConsumptionKwh,
    row.features.electricityPrice,
    row.features.hasEv ? 1 : 0,
    row.features.householdSize,
    row.objectiveHint === "maximize_savings" ? 1 : 0,
    row.objectiveHint === "minimize_upfront" ? 1 : 0,
    row.objectiveHint === "maximize_self_consumption" ? 1 : 0,
    row.labels.pvKwp,
    row.labels.batteryKwh,
    row.labels.moduleCount,
    row.labels.recommendHeatPump ? 1 : 0,
  ];
}

function mean(vectors) {
  const n = vectors.length;
  const d = vectors[0]?.length ?? 0;
  const out = new Array(d).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < d; i += 1) out[i] += v[i];
  }
  return out.map((x) => x / Math.max(1, n));
}

function std(vectors, centroid) {
  const n = vectors.length;
  const d = centroid.length;
  const out = new Array(d).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < d; i += 1) {
      const dx = v[i] - centroid[i];
      out[i] += dx * dx;
    }
  }
  return out.map((x) => Math.sqrt(x / Math.max(1, n)));
}

async function main() {
  const rows = JSON.parse(await fs.readFile(INPUT, "utf8"));
  const componentRows = new Map();

  for (const row of rows) {
    const x = vec(row);
    const uniqueComponents = [...new Set(row.offer.components ?? [])].slice(0, 8);
    for (const comp of uniqueComponents) {
      const key = String(comp).toLowerCase();
      if (!componentRows.has(key)) componentRows.set(key, []);
      componentRows.get(key).push(x);
    }
  }

  const components = [];
  for (const [component, vectors] of componentRows.entries()) {
    if (vectors.length < 20) continue;
    const centroid = mean(vectors);
    const spread = std(vectors, centroid);
    components.push({
      component,
      support: vectors.length,
      centroid,
      spread,
    });
  }

  const output = {
    generatedAt: new Date().toISOString(),
    featureSchema: [
      "annualConsumptionKwh",
      "electricityPrice",
      "hasEv",
      "householdSize",
      "obj_max_savings",
      "obj_min_upfront",
      "obj_max_self_consumption",
      "pvKwp",
      "batteryKwh",
      "moduleCount",
      "recommendHeatPump",
    ],
    minSupport: 20,
    components,
  };

  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  await fs.writeFile(OUTPUT, JSON.stringify(output, null, 2), "utf8");
  console.log(`Wrote predictor with ${components.length} components to ${OUTPUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
