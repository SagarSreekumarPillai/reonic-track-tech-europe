import fs from "node:fs/promises";
import path from "node:path";

const STATUS_FILES = [
  path.resolve("Reonic Data/Project Data/23c108b7/projects_status_quo.csv"),
  path.resolve("Reonic Data/Project Data/2a8ba8e2/projects_status_quo.csv"),
];

const PART_FILES = [
  path.resolve("Reonic Data/Project Data/23c108b7/project_options_parts.csv"),
  path.resolve("Reonic Data/Project Data/2a8ba8e2/project_options_parts.csv"),
];

const OUTPUT_FILE = path.resolve("src/data/reonic-training-dataset.json");

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
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toBoolean(value) {
  return String(value).toLowerCase() === "true";
}

function normalizeHeating(value) {
  const raw = String(value || "").toLowerCase();
  if (raw.includes("gas")) return "gas";
  if (raw.includes("oil")) return "oil";
  if (raw.includes("heatpump")) return "heatpump";
  if (raw.includes("district")) return "district";
  if (raw.includes("electric")) return "electric";
  if (!raw) return "unknown";
  return "other";
}

async function readStatusRows() {
  const rows = [];
  for (const file of STATUS_FILES) {
    const raw = await fs.readFile(file, "utf8");
    const lines = raw.split(/\r?\n/).filter(Boolean);
    const header = splitCsvLine(lines[0]);
    const idx = Object.fromEntries(header.map((h, i) => [h, i]));
    for (const line of lines.slice(1)) {
      const r = splitCsvLine(line);
      const energyWh = toNumber(r[idx.energy_demand_wh]);
      const priceWh = toNumber(r[idx.energy_price_per_wh]);
      rows.push({
        projectId: r[idx.project_id],
        annualConsumptionKwh: energyWh > 0 ? energyWh / 1000 : 0,
        electricityPrice: priceWh > 0 ? priceWh * 1000 : 0.35,
        hasEv: toBoolean(r[idx.has_ev]),
        heatingType: normalizeHeating(r[idx.heating_existing_type]),
        householdSize: Math.max(1, Math.round(toNumber(r[idx.num_inhabitants]) || 3)),
        hasHeatPump:
          normalizeHeating(r[idx.heating_existing_type]) === "heatpump" ||
          normalizeHeating(r[idx.heating_existing_type]) === "otherrenewable",
      });
    }
  }
  return rows.filter((r) => r.projectId && r.annualConsumptionKwh > 0);
}

async function readOptionRows() {
  const optionMap = new Map();
  for (const file of PART_FILES) {
    const raw = await fs.readFile(file, "utf8");
    const lines = raw.split(/\r?\n/).filter(Boolean);
    const header = splitCsvLine(lines[0]);
    const idx = Object.fromEntries(header.map((h, i) => [h, i]));
    for (const line of lines.slice(1)) {
      const r = splitCsvLine(line);
      const projectId = r[idx.project_id];
      const optionId = r[idx.option_id];
      const key = `${projectId}::${optionId}`;
      const rec =
        optionMap.get(key) ??
        {
          projectId,
          optionId,
          optionNumber: Math.max(1, Math.round(toNumber(r[idx.option_number]) || 1)),
          moduleCount: 0,
          pvKwp: 0,
          batteryKwh: 0,
          inverterKw: 0,
          hasHeatPumpComponent: false,
          components: new Set(),
        };

      const componentType = r[idx.component_type];
      const componentName = r[idx.component_name] || "Unknown component";
      const quantity = toNumber(r[idx.quantity]) || 1;
      const moduleWp = toNumber(r[idx.module_watt_peak]);
      const batteryKwhRaw = toNumber(r[idx.battery_capacity_kwh]);
      const inverterKw = toNumber(r[idx.inverter_power_kw]);
      const heatPumpKw = toNumber(r[idx.heatpump_nominal_power_kw]);

      if (componentType === "Module") {
        rec.moduleCount += quantity;
        const moduleKwp = moduleWp > 0 ? (quantity * moduleWp) / 1000 : 0;
        rec.pvKwp += moduleKwp;
      }
      if (componentType === "BatteryStorage") {
        const normalizedBatteryKwh = batteryKwhRaw > 100 ? batteryKwhRaw / 1000 : batteryKwhRaw;
        rec.batteryKwh += quantity * normalizedBatteryKwh;
      }
      if (componentType === "Inverter" && inverterKw > 0) {
        rec.inverterKw += quantity * inverterKw;
      }
      if (componentType === "HeatPump" || heatPumpKw > 0 || componentName.toLowerCase().includes("heatpump")) {
        rec.hasHeatPumpComponent = true;
      }

      if (rec.components.size < 8) rec.components.add(componentName);
      optionMap.set(key, rec);
    }
  }
  return Array.from(optionMap.values());
}

function objectiveFromOption(optionNumber) {
  if (optionNumber <= 1) return "maximize_savings";
  if (optionNumber === 2) return "minimize_upfront";
  return "maximize_self_consumption";
}

async function main() {
  const statusRows = await readStatusRows();
  const optionRows = await readOptionRows();
  const statusByProject = new Map(statusRows.map((row) => [row.projectId, row]));

  const records = optionRows
    .map((opt) => {
      const s = statusByProject.get(opt.projectId);
      if (!s) return null;
      const pvKwp =
        opt.pvKwp > 0
          ? Number(opt.pvKwp.toFixed(2))
          : Number((Math.max(opt.moduleCount, 1) * 0.45).toFixed(2));

      return {
        projectId: opt.projectId,
        optionId: opt.optionId,
        objectiveHint: objectiveFromOption(opt.optionNumber),
        features: {
          annualConsumptionKwh: s.annualConsumptionKwh,
          electricityPrice: s.electricityPrice,
          hasEv: s.hasEv,
          heatingType: s.heatingType,
          householdSize: s.householdSize,
          hasHeatPump: s.hasHeatPump,
        },
        labels: {
          pvKwp,
          batteryKwh: Number(opt.batteryKwh.toFixed(2)),
          recommendHeatPump: Boolean(opt.hasHeatPumpComponent || s.heatingType === "heatpump"),
          moduleCount: Math.max(4, Math.round(opt.moduleCount || pvKwp * 2.1)),
        },
        offer: {
          code: opt.optionId.slice(0, 8).toUpperCase(),
          title: `Reonic Variant ${opt.optionNumber}`,
          positioning: "Real variant extracted from Reonic option-component data.",
          components: Array.from(opt.components),
        },
      };
    })
    .filter(Boolean);

  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(records, null, 2), "utf8");
  console.log(`Wrote ${records.length} training rows to ${OUTPUT_FILE}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
