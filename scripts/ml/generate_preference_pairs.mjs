import fs from "node:fs/promises";
import path from "node:path";

const sftPath = path.resolve("ml/data/sft_rationale_dataset.jsonl");
const outPath = path.resolve("ml/data/preference_pairs.jsonl");

function weakenRationale(jsonString) {
  const parsed = JSON.parse(jsonString);
  parsed.tradeoffSummary = "This is a generic recommendation.";
  parsed.assumptions = ["Generic assumptions."];
  return JSON.stringify(parsed);
}

async function main() {
  const raw = await fs.readFile(sftPath, "utf8");
  const rows = raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  const pairs = rows.map((row, idx) => {
    const preferred = row.messages.at(-1).content;
    const rejected = weakenRationale(preferred);
    return {
      id: `pair-${idx + 1}`,
      prompt: row.messages[1].content,
      chosen: preferred,
      rejected,
      meta: row.meta,
    };
  });

  await fs.writeFile(
    outPath,
    pairs.map((x) => JSON.stringify(x)).join("\n") + (pairs.length ? "\n" : ""),
    "utf8"
  );
  console.log(`Generated ${pairs.length} preference pairs at ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
