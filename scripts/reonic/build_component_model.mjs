import fs from "node:fs/promises";
import path from "node:path";

const INPUT = path.resolve("src/data/reonic-training-dataset.json");
const OUTPUT = path.resolve("src/data/reonic-component-model.json");

function inc(map, key, n = 1) {
  map.set(key, (map.get(key) ?? 0) + n);
}

function topEntries(map, limit = 20) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([component, count]) => ({ component, count }));
}

function serializeBundle(components) {
  return [...new Set(components.map((x) => String(x).trim().toLowerCase()))]
    .filter(Boolean)
    .sort()
    .join("|");
}

async function main() {
  const rows = JSON.parse(await fs.readFile(INPUT, "utf8"));
  const global = new Map();
  const byFamily = new Map();
  const byObjective = new Map();
  const byFamilyBundles = new Map();
  const coOccurrence = new Map();

  for (const row of rows) {
    const family = row.offer.title;
    const objective = row.objectiveHint;
    if (!byFamily.has(family)) byFamily.set(family, new Map());
    if (!byObjective.has(objective)) byObjective.set(objective, new Map());
    if (!byFamilyBundles.has(family)) byFamilyBundles.set(family, new Map());

    const comps = [...new Set((row.offer.components ?? []).map((x) => String(x).trim()))]
      .filter(Boolean)
      .slice(0, 8);

    for (const comp of comps) {
      inc(global, comp);
      inc(byFamily.get(family), comp);
      inc(byObjective.get(objective), comp);
    }

    const bundleKey = serializeBundle(comps);
    if (bundleKey) {
      inc(byFamilyBundles.get(family), bundleKey);
    }

    for (let i = 0; i < comps.length; i += 1) {
      for (let j = i + 1; j < comps.length; j += 1) {
        const a = comps[i].toLowerCase();
        const b = comps[j].toLowerCase();
        const key = a < b ? `${a}__${b}` : `${b}__${a}`;
        inc(coOccurrence, key);
      }
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    globalTop: topEntries(global, 30),
    byFamily: Object.fromEntries(
      [...byFamily.entries()].map(([family, map]) => [family, topEntries(map, 25)])
    ),
    byObjective: Object.fromEntries(
      [...byObjective.entries()].map(([objective, map]) => [objective, topEntries(map, 25)])
    ),
    byFamilyBundles: Object.fromEntries(
      [...byFamilyBundles.entries()].map(([family, map]) => [
        family,
        [...map.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([bundleKey, count]) => ({
            components: bundleKey.split("|"),
            count,
          })),
      ])
    ),
    topCoOccurrencePairs: [...coOccurrence.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 120)
      .map(([pair, count]) => {
        const [a, b] = pair.split("__");
        return { a, b, count };
      }),
  };

  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  await fs.writeFile(OUTPUT, JSON.stringify(output, null, 2), "utf8");
  console.log(`Wrote component model to ${OUTPUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
