import { NextResponse } from "next/server";
import { z } from "zod";
import { generateLocalModelRationale } from "@/lib/integrations/local-model";

const schema = z.object({
  task: z.literal("generate_design_rationale"),
  context: z.object({
    profile: z.object({
      annualConsumption: z.number(),
      roofArea: z.number(),
      orientation: z.enum(["south", "south_east", "south_west", "east", "west", "north"]),
      electricityPrice: z.number(),
      hasEV: z.boolean(),
      heatingType: z.enum(["gas", "oil", "electric", "district", "other"]),
      householdSize: z.number(),
      hasHeatPump: z.boolean(),
    }),
    recommendation: z.object({
      pvSizeKw: z.number(),
      batteryKwh: z.number(),
      recommendHeatPump: z.boolean(),
      estimatedSelfConsumptionPct: z.number(),
      estimatedModuleCount: z.number(),
      roofUtilizationPct: z.number(),
    }),
    financials: z.object({
      installCost: z.number(),
      annualSavings: z.number(),
      paybackYears: z.number(),
      co2ReductionKg: z.number(),
    }),
    priority: z.enum([
      "maximize_savings",
      "minimize_upfront",
      "maximize_self_consumption",
    ]),
  }),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = schema.parse(body);
    const rationale = generateLocalModelRationale(parsed.context);
    return NextResponse.json({ rationale });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    return NextResponse.json({ error: "Local model failure" }, { status: 500 });
  }
}
