import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const outDir = path.resolve("ml/data");
const outPath = path.join(outDir, "raw_scenarios.jsonl");

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("design_scenarios")
    .select("*")
    .order("id", { ascending: true });
  if (error) throw error;

  await fs.mkdir(outDir, { recursive: true });
  const lines = (data ?? []).map((row) => JSON.stringify(row)).join("\n");
  await fs.writeFile(outPath, lines ? `${lines}\n` : "", "utf8");
  console.log(`Exported ${data?.length ?? 0} rows to ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
