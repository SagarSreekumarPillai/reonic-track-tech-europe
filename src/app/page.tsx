"use client";

import { useMemo, useState } from "react";
import { RoofModelViewer } from "@/components/RoofModelViewer";
import type { DesignResponse, HouseholdProfile, OptimizationPriority } from "@/types/design";

const DEMO_PROFILE: HouseholdProfile = {
  annualConsumption: 6200,
  roofArea: 42,
  orientation: "south",
  electricityPrice: 0.35,
  hasEV: true,
  heatingType: "gas",
  householdSize: 4,
  hasHeatPump: false,
};

const priorityLabels: Record<OptimizationPriority, string> = {
  maximize_savings: "Maximize savings",
  minimize_upfront: "Minimize upfront cost",
  maximize_self_consumption: "Maximize self-consumption",
};

export default function Home() {
  const [profile, setProfile] = useState<HouseholdProfile>(DEMO_PROFILE);
  const [priority, setPriority] =
    useState<OptimizationPriority>("maximize_savings");
  const [priceOverride, setPriceOverride] = useState<number | "">("");
  const [evOverride, setEvOverride] = useState<"default" | "yes" | "no">("default");
  const [roofModel, setRoofModel] = useState<
    "brandenburg" | "hamburg" | "north_germany" | "ruhr"
  >("brandenburg");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DesignResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const effectivePrice = useMemo(
    () => (priceOverride === "" ? profile.electricityPrice : priceOverride),
    [priceOverride, profile.electricityPrice]
  );

  async function generateDesign() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile,
          optimizationPriority: priority,
          overrides: {
            electricityPriceOverride: priceOverride === "" ? undefined : priceOverride,
            evAssumptionOverride:
              evOverride === "default" ? undefined : evOverride === "yes",
          },
          roofModel,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate design.");
      }

      const data = (await response.json()) as DesignResponse;
      setResult(data);
    } catch {
      setError("Unable to generate design. Check API keys or input values.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 p-4 text-slate-100 lg:p-8">
      <div className="mx-auto mb-6 max-w-7xl">
        <h1 className="text-3xl font-bold">Reonic AI Renewable Designer</h1>
        <p className="mt-1 text-slate-300">
          AI copilot for installer-grade renewable system proposals.
        </p>
      </div>

      <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-3">
        <section className="panel">
          <h2 className="panel-title">Customer Inputs</h2>
          <button
            onClick={() => setProfile(DEMO_PROFILE)}
            className="btn-secondary mb-3"
          >
            Load Demo Profile
          </button>
          <div className="space-y-3">
            <LabeledNumber
              label="Annual consumption (kWh)"
              value={profile.annualConsumption}
              onChange={(value) => setProfile({ ...profile, annualConsumption: value })}
            />
            <LabeledNumber
              label="Roof area (m2)"
              value={profile.roofArea}
              onChange={(value) => setProfile({ ...profile, roofArea: value })}
            />
            <LabeledSelect
              label="Roof orientation"
              value={profile.orientation}
              options={["south", "south_east", "south_west", "east", "west", "north"]}
              onChange={(value) =>
                setProfile({ ...profile, orientation: value as HouseholdProfile["orientation"] })
              }
            />
            <LabeledNumber
              label="Electricity price (EUR/kWh)"
              value={profile.electricityPrice}
              step={0.01}
              onChange={(value) => setProfile({ ...profile, electricityPrice: value })}
            />
            <LabeledSelect
              label="EV ownership"
              value={profile.hasEV ? "yes" : "no"}
              options={["yes", "no"]}
              onChange={(value) => setProfile({ ...profile, hasEV: value === "yes" })}
            />
            <LabeledSelect
              label="Heating type"
              value={profile.heatingType}
              options={["gas", "oil", "electric", "district", "other"]}
              onChange={(value) =>
                setProfile({ ...profile, heatingType: value as HouseholdProfile["heatingType"] })
              }
            />
            <LabeledNumber
              label="Household size"
              value={profile.householdSize}
              onChange={(value) => setProfile({ ...profile, householdSize: value })}
            />
            <LabeledSelect
              label="Existing heat pump"
              value={profile.hasHeatPump ? "yes" : "no"}
              options={["yes", "no"]}
              onChange={(value) => setProfile({ ...profile, hasHeatPump: value === "yes" })}
            />
            <LabeledSelect
              label="3D roof model"
              value={roofModel}
              options={["brandenburg", "hamburg", "north_germany", "ruhr"]}
              onChange={(value) =>
                setRoofModel(
                  value as "brandenburg" | "hamburg" | "north_germany" | "ruhr"
                )
              }
            />
            <LabeledSelect
              label="Optimization priority"
              value={priority}
              options={[
                "maximize_savings",
                "minimize_upfront",
                "maximize_self_consumption",
              ]}
              onChange={(value) => setPriority(value as OptimizationPriority)}
            />
            <LabeledNumber
              label="Refinement: electricity price override"
              value={effectivePrice}
              step={0.01}
              onChange={(value) => setPriceOverride(value)}
            />
            <LabeledSelect
              label="Refinement: EV assumption override"
              value={evOverride}
              options={["default", "yes", "no"]}
              onChange={(value) => setEvOverride(value as "default" | "yes" | "no")}
            />
          </div>

          <button onClick={generateDesign} className="btn-primary mt-4 w-full" disabled={loading}>
            {loading ? "Generating..." : "Generate Design"}
          </button>
          {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
        </section>

        <section className="panel">
          <h2 className="panel-title">Proposed Renewable Design</h2>
          {!result ? (
            <p className="text-slate-400">Generate a design to view recommendations.</p>
          ) : (
            <div className="space-y-3">
              <RoofModelViewer modelKey={roofModel} />
              <MetricCard label="PV Size" value={`${result.recommendation.pvSizeKw} kWp`} />
              <MetricCard
                label="Battery Size"
                value={`${result.recommendation.batteryKwh} kWh`}
              />
              <MetricCard
                label="Heat Pump"
                value={result.recommendation.recommendHeatPump ? "Recommended" : "Not Recommended"}
              />
              <MetricCard
                label="Self-consumption"
                value={`${result.recommendation.estimatedSelfConsumptionPct}%`}
              />
              <MetricCard
                label="Estimated Module Fit"
                value={`${result.recommendation.estimatedModuleCount} modules`}
              />
              <MetricCard
                label="Roof Utilization"
                value={`${result.recommendation.roofUtilizationPct}%`}
              />
              {result.roofAnalysis ? (
                <MetricCard
                  label="Roof usable area (3D)"
                  value={`${result.roofAnalysis.usableRoofAreaM2} m2`}
                />
              ) : null}
              {result.moduleLayout ? (
                <MetricCard
                  label="3D layout grid"
                  value={`${result.moduleLayout.rows} x ${result.moduleLayout.columns}`}
                />
              ) : null}
              <MetricCard label="Install Cost" value={`EUR ${result.financials.installCost}`} />
              <MetricCard
                label="Annual Savings"
                value={`EUR ${result.financials.annualSavings}`}
              />
              <MetricCard label="Payback" value={`${result.financials.paybackYears} years`} />
              <MetricCard
                label="CO2 Reduction"
                value={`${result.financials.co2ReductionKg} kg/year`}
              />
              <article className="rounded-xl border border-emerald-600/50 bg-emerald-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-emerald-300">
                  Recommended Offer Variant
                </p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {result.offer.title} ({result.offer.code})
                </p>
                <p className="mt-1 text-sm text-slate-200">{result.offer.positioning}</p>
                <p className="mt-2 text-sm font-medium text-emerald-200">
                  Estimated package price: EUR {result.offer.estimatedPrice}
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-200">
                  {result.offer.components.map((component) => (
                    <li key={component}>{component}</li>
                  ))}
                </ul>
              </article>
              <article className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Alternative Variants
                </p>
                <div className="mt-2 space-y-2">
                  {result.alternatives.map((variant) => (
                    <div
                      key={variant.code}
                      className="rounded-md border border-slate-700 bg-slate-950 p-2 text-sm"
                    >
                      <p className="font-medium text-white">
                        {variant.title} ({variant.code})
                      </p>
                      <p className="text-slate-300">{variant.positioning}</p>
                      <p className="text-slate-400">
                        EUR {variant.estimatedPrice} - best for{" "}
                        {priorityLabels[variant.bestFor]}
                      </p>
                    </div>
                  ))}
                </div>
              </article>
            </div>
          )}
        </section>

        <section className="panel">
          <h2 className="panel-title">AI Design Rationale</h2>
          {!result ? (
            <p className="text-slate-400">Rationale appears after generation.</p>
          ) : (
            <div className="space-y-3">
              <RationaleCard title="PV sizing">{result.rationale.pvReason}</RationaleCard>
              <RationaleCard title="Battery sizing">{result.rationale.batteryReason}</RationaleCard>
              <RationaleCard title="Heat pump decision">
                {result.rationale.heatPumpReason}
              </RationaleCard>
              <RationaleCard title="Tradeoff summary">
                {result.rationale.tradeoffSummary}
              </RationaleCard>
              <RationaleCard title="Optimization priority">
                {priorityLabels[priority]}
              </RationaleCard>
              <RationaleCard title="Assumptions">
                <ul className="list-disc space-y-1 pl-4">
                  {result.assumptions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </RationaleCard>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function LabeledNumber(props: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
}) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input
        className="input"
        type="number"
        value={props.value}
        step={props.step ?? 1}
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
    </label>
  );
}

function LabeledSelect(props: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <select
        className="input"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      >
        {props.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function MetricCard(props: { label: string; value: string }) {
  return (
    <article className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-400">{props.label}</p>
      <p className="mt-1 text-xl font-semibold text-white">{props.value}</p>
    </article>
  );
}

function RationaleCard(props: { title: string; children: React.ReactNode }) {
  return (
    <article className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
      <p className="text-xs uppercase tracking-wide text-cyan-300">{props.title}</p>
      <div className="mt-2 text-sm leading-relaxed text-slate-200">{props.children}</div>
    </article>
  );
}
