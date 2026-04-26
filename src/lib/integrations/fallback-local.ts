import type { DesignRationale } from "@/types/design";
import { type RationaleContext } from "@/lib/integrations/gemini";

function isValidRationale(value: unknown): value is DesignRationale {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<DesignRationale>;
  return Boolean(
    v.pvReason &&
      v.batteryReason &&
      v.heatPumpReason &&
      v.tradeoffSummary &&
      Array.isArray(v.assumptions)
  );
}

async function tryLocalModelEndpoint(
  params: RationaleContext
): Promise<DesignRationale | null> {
  const endpoint = process.env.LOCAL_REASONING_ENDPOINT;
  if (!endpoint) {
    return null;
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task: "generate_design_rationale",
        context: params,
        schema: {
          required: [
            "pvReason",
            "batteryReason",
            "heatPumpReason",
            "tradeoffSummary",
            "assumptions",
          ],
        },
      }),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { rationale?: unknown };
    if (!isValidRationale(payload.rationale)) return null;
    return payload.rationale;
  } catch {
    return null;
  }
}

export async function generateLocalFallbackRationale(
  params: RationaleContext
): Promise<DesignRationale> {
  if (!process.env.LOCAL_REASONING_ENDPOINT) {
    throw new Error(
      "LOCAL_REASONING_ENDPOINT is required for strict no-fallback mode."
    );
  }

  const endpointResult = await tryLocalModelEndpoint(params);
  if (endpointResult) {
    return endpointResult;
  }
  throw new Error(
    "Local model endpoint failed to return a valid rationale in strict no-fallback mode."
  );
}
