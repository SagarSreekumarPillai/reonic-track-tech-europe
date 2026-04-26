import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  type DesignRationale,
  type DesignRecommendation,
  type FinancialMetrics,
  type HouseholdProfile,
  type OptimizationPriority,
} from "@/types/design";

export interface RationaleContext {
  profile: HouseholdProfile;
  recommendation: DesignRecommendation;
  financials: FinancialMetrics;
  priority: OptimizationPriority;
}

export const fallbackRationale = (
  recommendation: DesignRecommendation,
  priority: OptimizationPriority,
  note = "Fallback rationale used due to unavailable Gemini response."
): DesignRationale => ({
  pvReason: `A ${recommendation.pvSizeKw} kWp system balances demand coverage with roof constraints and the selected optimization objective.`,
  batteryReason: `${recommendation.batteryKwh} kWh was selected to align with self-consumption targets under the current priority.`,
  heatPumpReason: recommendation.recommendHeatPump
    ? "Heat pump is recommended because current heating profile suggests strong decarbonization and savings potential."
    : "Heat pump is not prioritized in this scenario due to the current heating profile and optimization settings.",
  tradeoffSummary: `Optimization is currently set to ${priority.replaceAll("_", " ")}. Estimated module fit is ${recommendation.estimatedModuleCount} modules at ${recommendation.roofUtilizationPct}% roof utilization. Changing objective will rebalance system sizing and financial outcomes.`,
  assumptions: [note],
});

export async function generateGeminiRationale(params: RationaleContext): Promise<DesignRationale> {
  if (!process.env.GEMINI_API_KEY) {
    return fallbackRationale(params.recommendation, params.priority);
  }

  try {
    const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = client.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
You are an expert renewable installer assistant.
Use ONLY the provided values and do not invent numbers.
Return strict JSON with keys:
pvReason, batteryReason, heatPumpReason, tradeoffSummary, assumptions (string[]).

Profile: ${JSON.stringify(params.profile)}
Recommendation: ${JSON.stringify(params.recommendation)}
Financials: ${JSON.stringify(params.financials)}
Optimization priority: ${params.priority}
`;

    const result = await model.generateContent(prompt);
    const raw = result.response.text().replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(raw) as DesignRationale;

    if (
      !parsed.pvReason ||
      !parsed.batteryReason ||
      !parsed.heatPumpReason ||
      !parsed.tradeoffSummary ||
      !Array.isArray(parsed.assumptions)
    ) {
      return fallbackRationale(params.recommendation, params.priority);
    }

    return parsed;
  } catch {
    return fallbackRationale(params.recommendation, params.priority);
  }
}
