import fs from "node:fs/promises";
import path from "node:path";

const INPUT = path.resolve("src/data/reonic-training-dataset.json");
const OUTPUT = path.resolve("src/data/reonic-offer-model.json");

function featureVector(row) {
  return [
    row.features.annualConsumptionKwh,
    row.features.electricityPrice,
    row.features.hasEv ? 1 : 0,
    row.features.householdSize,
    row.labels.pvKwp,
    row.labels.batteryKwh,
    row.labels.moduleCount,
  ];
}

function meanVector(vectors) {
  const size = vectors[0]?.length ?? 0;
  const out = new Array(size).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < size; i += 1) out[i] += v[i];
  }
  return out.map((x) => x / Math.max(vectors.length, 1));
}

async function main() {
  const rows = JSON.parse(await fs.readFile(INPUT, "utf8"));
  const familyMap = new Map();

  for (const row of rows) {
    const family = row.offer.title;
    const current =
      familyMap.get(family) ??
      {
        family,
        objectiveHint: row.objectiveHint,
        vectors: [],
        codes: [],
        components: row.offer.components.slice(0, 8),
      };
    current.vectors.push(featureVector(row));
    current.codes.push({
      code: row.offer.code,
      title: row.offer.title,
      positioning: row.offer.positioning,
      objectiveHint: row.objectiveHint,
      vector: featureVector(row),
      components: row.offer.components.slice(0, 8),
    });
    familyMap.set(family, current);
  }

  const families = Array.from(familyMap.values()).map((entry) => ({
    family: entry.family,
    objectiveHint: entry.objectiveHint,
    centroid: meanVector(entry.vectors),
    components: entry.components,
    codeCount: entry.codes.length,
    codes: entry.codes,
  }));

  const output = {
    generatedAt: new Date().toISOString(),
    familyCount: families.length,
    families,
  };

  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  await fs.writeFile(OUTPUT, JSON.stringify(output, null, 2), "utf8");
  console.log(`Wrote offer model with ${families.length} families to ${OUTPUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
