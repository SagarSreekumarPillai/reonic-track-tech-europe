import { NextResponse } from "next/server";
import { z } from "zod";
import { predictFromReonicDataset } from "@/lib/design/data-driven";
import { simulateFinancials } from "@/lib/design/financial";
import { analyzeRoofModel } from "@/lib/roof/analyzer";
import { computeModuleLayout } from "@/lib/roof/placement";
import { generateRationaleWithFallback } from "@/lib/integrations/reasoning-provider";
import { fetchTavilyAssumptions } from "@/lib/integrations/tavily";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { DesignResponse, HouseholdProfile } from "@/types/design";

const profileSchema = z.object({
  annualConsumption: z.number().min(1000).max(50000),
  roofArea: z.number().min(8).max(500),
  orientation: z.enum(["south", "south_east", "south_west", "east", "west", "north"]),
  electricityPrice: z.number().min(0.05).max(1),
  hasEV: z.boolean(),
  heatingType: z.enum(["gas", "oil", "electric", "district", "other"]),
  householdSize: z.number().min(1).max(10),
  hasHeatPump: z.boolean(),
});

const requestSchema = z.object({
  profile: profileSchema,
  optimizationPriority: z.enum([
    "maximize_savings",
    "minimize_upfront",
    "maximize_self_consumption",
  ]),
  overrides: z
    .object({
      electricityPriceOverride: z.number().min(0.05).max(1).optional(),
      evAssumptionOverride: z.boolean().optional(),
    })
    .optional(),
  roofModel: z
    .enum(["brandenburg", "hamburg", "north_germany", "ruhr"])
    .optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = requestSchema.parse(body);

    const workingProfile: HouseholdProfile = {
      ...parsed.profile,
      electricityPrice:
        parsed.overrides?.electricityPriceOverride ?? parsed.profile.electricityPrice,
      hasEV: parsed.overrides?.evAssumptionOverride ?? parsed.profile.hasEV,
    };

    const prediction = predictFromReonicDataset(
      workingProfile,
      parsed.optimizationPriority
    );
    const roofAnalysis = await analyzeRoofModel(parsed.roofModel);
    const moduleLayout = computeModuleLayout({
      usableRoofAreaM2: roofAnalysis.usableRoofAreaM2,
      desiredModuleCount: prediction.recommendation.estimatedModuleCount,
    });
    const recommendation = {
      ...prediction.recommendation,
      estimatedModuleCount: moduleLayout.moduleCount,
      roofUtilizationPct: Math.min(
        100,
        Math.round((moduleLayout.coverageM2 / Math.max(roofAnalysis.usableRoofAreaM2, 1)) * 100)
      ),
      pvSizeKw: Math.round((moduleLayout.moduleCount * 0.45) * 2) / 2,
    };
    const financials = simulateFinancials(workingProfile, recommendation);
    const offer = {
      ...prediction.offer,
      estimatedPrice: Math.round(financials.installCost),
    };
    const alternatives = prediction.alternatives.map((alt, idx) => ({
      ...alt,
      estimatedPrice: Math.round(financials.installCost + (idx === 0 ? 600 : 1400)),
    }));
    const [rationaleResult, assumptions] = await Promise.all([
      generateRationaleWithFallback({
        profile: workingProfile,
        recommendation,
        financials,
        priority: parsed.optimizationPriority,
      }),
      fetchTavilyAssumptions(),
    ]);
    const mergedAssumptions = [
      `Rationale provider: ${rationaleResult.provider}`,
      ...assumptions,
      ...rationaleResult.rationale.assumptions,
    ];

    const response: DesignResponse = {
      recommendation,
      financials,
      rationale: rationaleResult.rationale,
      assumptions: mergedAssumptions,
      offer,
      alternatives,
      roofAnalysis,
      moduleLayout,
    };

    const supabase = getSupabaseServerClient();
    if (supabase) {
      await supabase.from("design_scenarios").insert({
        profile: workingProfile,
        optimization_priority: parsed.optimizationPriority,
        recommendation,
        financials,
        rationale: rationaleResult.rationale,
        assumptions: mergedAssumptions,
      });
    }

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: error.issues },
        { status: 400 }
      );
    }

    if (error instanceof Error && error.message.includes("Rationale generation failed")) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    return NextResponse.json(
      {
        error: "Design generation failed.",
        details: error instanceof Error ? error.message : "unknown_error",
      },
      { status: 500 }
    );
  }
}
