import fs from "node:fs/promises";
import path from "node:path";

const rawPath = path.resolve("ml/data/raw_scenarios.jsonl");
const outPath = path.resolve("ml/data/sft_rationale_dataset.jsonl");

function toSftRecord(row) {
  const context = {
    profile: row.profile,
    recommendation: row.recommendation,
    financials: row.financials,
    optimizationPriority: row.optimization_priority,
    offer: row.offer,
  };
  const assistant = row.rationale;
  if (!assistant) return null;
  const hasRequiredKeys =
    typeof assistant === "object" &&
    assistant !== null &&
    "pvReason" in assistant &&
    "batteryReason" in assistant &&
    "heatPumpReason" in assistant &&
    "tradeoffSummary" in assistant &&
    "assumptions" in assistant;
  if (!hasRequiredKeys) return null;

  return {
    messages: [
      {
        role: "system",
        content:
          "You are an expert renewable installer assistant. Return strict JSON and never invent numbers not present in context.",
      },
      {
        role: "user",
        content: `Generate installer rationale from this context:\n${JSON.stringify(context)}`,
      },
      {
        role: "assistant",
        content: JSON.stringify(assistant),
      },
    ],
    meta: {
      scenarioId: row.id,
      source: "supabase_design_scenarios",
    },
  };
}

async function main() {
  const raw = await fs.readFile(rawPath, "utf8");
  const rows = raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  const mapped = rows.map(toSftRecord);
  const records = mapped.filter(Boolean);
  const skipped = mapped.length - records.length;
  await fs.mkdir(path.resolve("ml/data"), { recursive: true });
  await fs.writeFile(
    outPath,
    records.map((x) => JSON.stringify(x)).join("\n") + (records.length ? "\n" : ""),
    "utf8"
  );
  console.log(`Built ${records.length} SFT examples at ${outPath} (skipped ${skipped})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
