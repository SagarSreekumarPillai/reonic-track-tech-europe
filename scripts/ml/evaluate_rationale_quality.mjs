import fs from "node:fs/promises";
import path from "node:path";

const inputPath = path.resolve("ml/data/sft_rationale_dataset.jsonl");
const reportPath = path.resolve("ml/data/eval_report.json");

function extractNumbers(text) {
  return text.match(/-?\d+(\.\d+)?/g) ?? [];
}

function parseAssistant(content) {
  if (typeof content === "string") {
    return JSON.parse(content);
  }
  return content;
}

function groundingScore(contextText, rationaleText) {
  const contextNums = new Set(extractNumbers(contextText));
  const rationaleNums = extractNumbers(rationaleText);
  if (rationaleNums.length === 0) return 1;
  const grounded = rationaleNums.filter((n) => contextNums.has(n)).length;
  return grounded / rationaleNums.length;
}

function schemaLikeScore(parsed) {
  const keys = ["pvReason", "batteryReason", "heatPumpReason", "tradeoffSummary", "assumptions"];
  const present = keys.filter((k) => k in parsed).length;
  return present / keys.length;
}

async function main() {
  const raw = await fs.readFile(inputPath, "utf8");
  const rows = raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  const scores = rows.map((row) => {
    const context = row.messages[1].content;
    const assistant = row.messages[2].content;
    const parsed = parseAssistant(assistant);
    return {
      schemaScore: schemaLikeScore(parsed),
      groundingScore: groundingScore(context, assistant),
      hasAssumptions: Array.isArray(parsed.assumptions) ? 1 : 0,
    };
  });

  const avg = (arr, key) =>
    arr.reduce((sum, x) => sum + x[key], 0) / Math.max(arr.length, 1);

  const report = {
    sampleCount: scores.length,
    schemaScoreAvg: Number(avg(scores, "schemaScore").toFixed(4)),
    groundingScoreAvg: Number(avg(scores, "groundingScore").toFixed(4)),
    assumptionsPresenceRate: Number(avg(scores, "hasAssumptions").toFixed(4)),
    generatedAt: new Date().toISOString(),
  };

  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`Wrote report to ${reportPath}`);
  console.log(report);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
