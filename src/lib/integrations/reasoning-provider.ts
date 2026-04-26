import { generateGeminiRationale, type RationaleContext } from "@/lib/integrations/gemini";
import { generateLocalFallbackRationale } from "@/lib/integrations/fallback-local";
import type { DesignRationale } from "@/types/design";

type ProviderName = "gemini" | "local-fallback";

export interface RationaleResult {
  rationale: DesignRationale;
  provider: ProviderName;
}

function isValidRationale(value: DesignRationale): boolean {
  return (
    Boolean(value.pvReason) &&
    Boolean(value.batteryReason) &&
    Boolean(value.heatPumpReason) &&
    Boolean(value.tradeoffSummary) &&
    Array.isArray(value.assumptions)
  );
}

export async function generateRationaleWithFallback(
  context: RationaleContext
): Promise<RationaleResult> {
  try {
    const rationale = await generateGeminiRationale(context);
    if (isValidRationale(rationale) && process.env.GEMINI_API_KEY) {
      return { rationale, provider: "gemini" };
    }
  } catch {
    // Move to local fallback on failure.
  }

  try {
    const local = await generateLocalFallbackRationale(context);
    if (isValidRationale(local)) {
      return { rationale: local, provider: "local-fallback" };
    }
  } catch {
    // Strict mode: handled below.
  }

  throw new Error(
    "Rationale generation failed: Gemini unavailable and LOCAL_REASONING_ENDPOINT did not return a valid response."
  );
}
