import fs from "node:fs/promises";
import path from "node:path";

const INPUT_FILES = [
  path.resolve("Reonic Data/Project Data/23c108b7/projects_status_quo.csv"),
  path.resolve("Reonic Data/Project Data/2a8ba8e2/projects_status_quo.csv"),
];
const OUTPUT_FILE = path.resolve("src/data/reonic-recommendation-priors.json");

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeBoolean(value) {
  return String(value).toLowerCase() === "true";
}

async function main() {
  let rows = 0;
  let demandSum = 0;
  let demandCount = 0;
  let evDemandSum = 0;
  let evDemandCount = 0;
  let nonEvDemandSum = 0;
  let nonEvDemandCount = 0;
  const heatingStats = {};

  for (const filePath of INPUT_FILES) {
    const raw = await fs.readFile(filePath, "utf8");
    const lines = raw.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) continue;
    const header = splitCsvLine(lines[0]);
    const idx = Object.fromEntries(header.map((key, i) => [key, i]));

    for (const line of lines.slice(1)) {
      const row = splitCsvLine(line);
      rows += 1;
      const demandWh = toNumber(row[idx.energy_demand_wh]);
      const demandKwh = demandWh > 0 ? demandWh / 1000 : 0;
      if (!demandKwh) continue;

      demandSum += demandKwh;
      demandCount += 1;

      const hasEv = normalizeBoolean(row[idx.has_ev]);
      if (hasEv) {
        evDemandSum += demandKwh;
        evDemandCount += 1;
      } else {
        nonEvDemandSum += demandKwh;
        nonEvDemandCount += 1;
      }

      const heating = (row[idx.heating_existing_type] || "unknown").toLowerCase();
      if (!heatingStats[heating]) heatingStats[heating] = { count: 0, demandSum: 0 };
      heatingStats[heating].count += 1;
      heatingStats[heating].demandSum += demandKwh;
    }
  }

  const avgDemand = demandSum / Math.max(1, demandCount);
  const avgEvDemand = evDemandSum / Math.max(1, evDemandCount);
  const avgNonEvDemand = nonEvDemandSum / Math.max(1, nonEvDemandCount);
  const evMultiplier = avgEvDemand > 0 ? avgEvDemand / Math.max(1, avgNonEvDemand) : 1.08;

  const output = {
    sourceRows: rows,
    demand: {
      avgKwh: Number(avgDemand.toFixed(2)),
      evAvgKwh: Number(avgEvDemand.toFixed(2)),
      nonEvAvgKwh: Number(avgNonEvDemand.toFixed(2)),
      evMultiplier: Number(evMultiplier.toFixed(3)),
      pvDemandDivisor: Number((avgDemand / 5.5).toFixed(2)),
    },
    heating: Object.fromEntries(
      Object.entries(heatingStats).map(([k, v]) => [
        k,
        {
          count: v.count,
          avgDemandKwh: Number((v.demandSum / Math.max(1, v.count)).toFixed(2)),
        },
      ])
    ),
  };

  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf8");
  console.log(`Wrote priors to ${OUTPUT_FILE}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
