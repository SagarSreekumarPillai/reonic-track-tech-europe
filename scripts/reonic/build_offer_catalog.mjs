import fs from "node:fs/promises";
import path from "node:path";

const INPUT_FILES = [
  path.resolve("Reonic Data/Project Data/23c108b7/project_options_parts.csv"),
  path.resolve("Reonic Data/Project Data/2a8ba8e2/project_options_parts.csv"),
];

const OUTPUT_FILE = path.resolve("src/data/reonic-offers.json");

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
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeKwh(raw) {
  if (!raw) return 0;
  return raw > 100 ? raw / 1000 : raw;
}

function classifyBestFor(entry) {
  if (entry.batteryKwh >= 12) return "maximize_self_consumption";
  if (entry.batteryKwh > 0 && entry.batteryKwh <= 7) return "minimize_upfront";
  return "maximize_savings";
}

async function parseFile(filePath, map) {
  const raw = await fs.readFile(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return;
  const header = splitCsvLine(lines[0]);
  const idx = Object.fromEntries(header.map((key, i) => [key, i]));

  for (const line of lines.slice(1)) {
    const row = splitCsvLine(line);
    const optionId = row[idx.option_id];
    if (!optionId) continue;

    const key = optionId;
    const current =
      map.get(key) ??
      {
        code: optionId.slice(0, 8).toUpperCase(),
        title: `Reonic Variant ${row[idx.option_number] || "1"}`,
        positioning: "Derived from historical sold/planned component bundles.",
        components: new Set(),
        moduleCount: 0,
        batteryKwh: 0,
        inverterKw: 0,
        sourceProjectId: row[idx.project_id],
      };

    const componentName = row[idx.component_name] || "Unknown component";
    if (current.components.size < 6) current.components.add(componentName);

    const componentType = row[idx.component_type];
    const quantity = toNumber(row[idx.quantity]);
    const moduleWatt = toNumber(row[idx.module_watt_peak]);
    const batteryCapacity = normalizeKwh(toNumber(row[idx.battery_capacity_kwh]));
    const inverterKw = toNumber(row[idx.inverter_power_kw]);

    if (componentType === "Module") {
      current.moduleCount += quantity || 0;
      if (moduleWatt > 0 && !current.moduleWattPeak) current.moduleWattPeak = moduleWatt;
    }
    if (componentType === "BatteryStorage") {
      current.batteryKwh += (quantity || 1) * batteryCapacity;
    }
    if (componentType === "Inverter" && inverterKw > 0) {
      current.inverterKw += (quantity || 1) * inverterKw;
    }

    map.set(key, current);
  }
}

async function main() {
  const map = new Map();
  for (const filePath of INPUT_FILES) {
    await parseFile(filePath, map);
  }

  const records = Array.from(map.values()).map((entry) => {
    const battery = Number(entry.batteryKwh.toFixed(2));
    return {
      code: entry.code,
      title: entry.title,
      positioning: entry.positioning,
      components: Array.from(entry.components),
      moduleCount: Math.round(entry.moduleCount),
      moduleWattPeak: entry.moduleWattPeak ?? 450,
      batteryKwh: battery,
      inverterKw: Number(entry.inverterKw.toFixed(2)),
      sourceProjectId: entry.sourceProjectId,
      bestFor: classifyBestFor({ batteryKwh: battery }),
    };
  });

  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(records, null, 2), "utf8");
  console.log(`Wrote ${records.length} offer variants to ${OUTPUT_FILE}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
