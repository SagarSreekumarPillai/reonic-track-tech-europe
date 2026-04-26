"use client";

import { useEffect, useMemo, useState } from "react";
import { RoofModelViewer } from "@/components/RoofModelViewer";
import { downloadProposalPdf } from "@/lib/proposal-pdf";
import {
  appleMapsSearchUrl,
  googleMapsSearchUrl,
  siteMapsQuery,
} from "@/lib/maps-links";
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
  siteAddress: "Unter den Linden 1, 10117 Berlin",
};

const priorityLabels: Record<OptimizationPriority, string> = {
  maximize_savings: "Maximize savings",
  minimize_upfront: "Minimize upfront cost",
  maximize_self_consumption: "Maximize self-consumption",
};

const orientationLabels: Record<HouseholdProfile["orientation"], string> = {
  south: "South",
  south_east: "South-east",
  south_west: "South-west",
  east: "East",
  west: "West",
  north: "North",
};

const roofModelLabels: Record<string, string> = {
  brandenburg: "Brandenburg",
  hamburg: "Hamburg",
  north_germany: "North Germany",
  ruhr: "Ruhr",
};

const COMPONENT_LABELS: Record<string, string> = {
  battery_storage: "Battery storage",
  mounting_structure: "Mounting structure",
  scaffolding_setup_removal: "Scaffolding (setup & removal)",
  hybrid_inverter: "Hybrid inverter",
  system_planning: "System planning",
  smart_meter_or_cabinet: "Smart meter / cabinet",
  pv_modules: "PV modules",
  string_inverter: "String inverter",
  ev_charger: "EV charger",
  heat_pump: "Heat pump",
};

function formatEur(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function humanizeComponent(slug: string): string {
  const key = slug.trim().toLowerCase();
  if (COMPONENT_LABELS[key]) return COMPONENT_LABELS[key];
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

type WorkspaceTab = "quote" | "explain" | "ops";

type ManagerChecklistState = {
  customerApproved: boolean;
  permitDocsReady: boolean;
  installationSlotBooked: boolean;
  financingVerified: boolean;
  /** After manager review, installer checks this to unlock customer URL / PDF */
  releasedToCustomer: boolean;
};

const MANAGER_CHECKLIST_DEFAULT: ManagerChecklistState = {
  customerApproved: false,
  permitDocsReady: false,
  installationSlotBooked: false,
  financingVerified: false,
  releasedToCustomer: false,
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
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("quote");
  const [managerChecklist, setManagerChecklist] =
    useState<ManagerChecklistState>(MANAGER_CHECKLIST_DEFAULT);

  const effectivePrice = useMemo(
    () => (priceOverride === "" ? profile.electricityPrice : priceOverride),
    [priceOverride, profile.electricityPrice]
  );

  const mapsQuery = useMemo(() => siteMapsQuery(profile), [profile.siteAddress]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("reonic.managerChecklist");
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<ManagerChecklistState>;
      setManagerChecklist({
        ...MANAGER_CHECKLIST_DEFAULT,
        ...parsed,
        releasedToCustomer: parsed.releasedToCustomer === true,
      });
    } catch {
      // ignore corrupt local state
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("reonic.managerChecklist", JSON.stringify(managerChecklist));
  }, [managerChecklist]);

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
      setWorkspaceTab("quote");
      setManagerChecklist((prev) => ({ ...prev, releasedToCustomer: false }));
    } catch {
      setError("Unable to generate design. Check API keys or input values.");
    } finally {
      setLoading(false);
    }
  }

  function buildSharePayload(audience: "customer" | "manager") {
    if (!result) return null;
    const payload = {
      audience,
      createdAt: new Date().toISOString(),
      priority,
      profile,
      result,
      managerChecklist,
    };
    return encodeURIComponent(btoa(JSON.stringify(payload)));
  }

  function copyShareLink(audience: "customer" | "manager") {
    if (audience === "customer" && !managerChecklist.releasedToCustomer) {
      setShareMessage(
        "Customer share is locked until manager approval is confirmed below."
      );
      return;
    }
    const encoded = buildSharePayload(audience);
    if (!encoded) return;
    const origin =
      typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    const url = `${origin}/share?data=${encoded}`;
    navigator.clipboard
      .writeText(url)
      .then(() =>
        setShareMessage(
          `Copied read-only /share URL (${audience} snapshot). Paste into a browser to open.`
        )
      )
      .catch(() => setShareMessage("Share link copy failed."));
  }

  function downloadProposalPacket(audience: "customer" | "manager") {
    if (!result) return;
    if (audience === "customer" && !managerChecklist.releasedToCustomer) {
      setShareMessage(
        "Customer PDF is locked until manager approval is confirmed below."
      );
      return;
    }
    downloadProposalPdf({
      audience,
      priorityLabel: priorityLabels[priority],
      result,
      managerChecklist,
      humanizeComponent,
      siteAddress: profile.siteAddress,
    });
    setShareMessage(`Downloaded ${audience} proposal PDF.`);
  }

  const readinessInline = useMemo(() => {
    if (!result) return null;
    const roof =
      result.roofAnalysis && result.roofAnalysis.confidence >= 0.75 ? "Roof OK" : "Verify roof";
    const handoff =
      result.offer.components.length >= 5 && result.assumptions.length >= 3
        ? "Handoff ready"
        : "Add context";
    return { roof, handoff };
  }, [result]);

  return (
    <main className="flex h-[100dvh] flex-col overflow-hidden bg-slate-950 text-slate-100">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800/80 px-3 py-2 md:px-4">
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold tracking-tight text-white md:text-lg">
            Reonic · Installer workspace
          </h1>
          <p className="hidden text-xs text-slate-500 sm:block">
            Site profile and tariffs · 3D quote and KPIs · Explainable rationale · Share and handoff
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {loading ? (
            <div className="loader-lottie-ish shrink-0" aria-label="Generating design" />
          ) : null}
          <button
            type="button"
            onClick={generateDesign}
            className="btn-primary px-3 py-1.5 text-xs md:text-sm"
            disabled={loading}
          >
            {loading ? "…" : "Generate"}
          </button>
        </div>
      </header>

      {result ? (
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-800/60 px-3 py-1.5 text-[11px] text-slate-400 md:px-4">
          <span className="font-medium text-slate-300">{priorityLabels[priority]}</span>
          <span>{formatEur(result.financials.installCost)} capex</span>
          <span>{formatEur(result.financials.annualSavings)}/yr</span>
          <span>{result.financials.paybackYears}y payback</span>
          {readinessInline ? (
            <>
              <span className="text-slate-500">·</span>
              <span>{readinessInline.roof}</span>
              <span>{readinessInline.handoff}</span>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 gap-2 p-2 md:gap-3 md:p-3">
        <aside className="panel flex w-[min(100%,280px)] shrink-0 flex-col py-3 md:w-[300px]">
          <div className="mb-2 px-1">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Site & tariff
            </h2>
          </div>
          <div className="dash-col-scroll space-y-2 px-1">
            <LabeledNumber
              compact
              label="Annual consumption (kWh)"
              value={profile.annualConsumption}
              onChange={(value) => setProfile({ ...profile, annualConsumption: value })}
            />
            <LabeledNumber
              compact
              label="Roof area (m²)"
              value={profile.roofArea}
              onChange={(value) => setProfile({ ...profile, roofArea: value })}
            />
            <LabeledSelect
              compact
              label="Orientation"
              value={profile.orientation}
              options={["south", "south_east", "south_west", "east", "west", "north"]}
              formatOption={(v) => orientationLabels[v as HouseholdProfile["orientation"]]}
              onChange={(value) =>
                setProfile({ ...profile, orientation: value as HouseholdProfile["orientation"] })
              }
            />
            <LabeledNumber
              compact
              label="Electricity price (€/kWh)"
              value={profile.electricityPrice}
              step={0.01}
              onChange={(value) => setProfile({ ...profile, electricityPrice: value })}
            />
            <LabeledSelect
              compact
              label="EV"
              value={profile.hasEV ? "yes" : "no"}
              options={["yes", "no"]}
              formatOption={(v) => (v === "yes" ? "Yes" : "No")}
              onChange={(value) => setProfile({ ...profile, hasEV: value === "yes" })}
            />
            <LabeledSelect
              compact
              label="Heating"
              value={profile.heatingType}
              options={["gas", "oil", "electric", "district", "other"]}
              onChange={(value) =>
                setProfile({ ...profile, heatingType: value as HouseholdProfile["heatingType"] })
              }
            />
            <LabeledNumber
              compact
              label="Household size"
              value={profile.householdSize}
              onChange={(value) => setProfile({ ...profile, householdSize: value })}
            />
            <LabeledSelect
              compact
              label="Heat pump installed"
              value={profile.hasHeatPump ? "yes" : "no"}
              options={["yes", "no"]}
              formatOption={(v) => (v === "yes" ? "Yes" : "No")}
              onChange={(value) => setProfile({ ...profile, hasHeatPump: value === "yes" })}
            />
            <LabeledSelect
              compact
              label="Roof 3D model"
              value={roofModel}
              options={["brandenburg", "hamburg", "north_germany", "ruhr"]}
              formatOption={(v) => roofModelLabels[v] ?? v}
              onChange={(value) =>
                setRoofModel(value as "brandenburg" | "hamburg" | "north_germany" | "ruhr")
              }
            />
            <LabeledSelect
              compact
              label="Objective"
              value={priority}
              options={[
                "maximize_savings",
                "minimize_upfront",
                "maximize_self_consumption",
              ]}
              formatOption={(v) => priorityLabels[v as OptimizationPriority]}
              onChange={(value) => setPriority(value as OptimizationPriority)}
            />
            <LabeledNumber
              compact
              label="Price override (€/kWh)"
              value={effectivePrice}
              step={0.01}
              onChange={(value) => setPriceOverride(value)}
            />
            <LabeledSelect
              compact
              label="EV override"
              value={evOverride}
              options={["default", "yes", "no"]}
              formatOption={(v) =>
                v === "default" ? "Profile default" : v === "yes" ? "Force EV" : "Force no EV"
              }
              onChange={(value) => setEvOverride(value as "default" | "yes" | "no")}
            />
            <LabeledText
              compact
              label="Install site (maps)"
              placeholder="Address, place, or lat,lng"
              value={profile.siteAddress ?? ""}
              onChange={(value) =>
                setProfile({
                  ...profile,
                  siteAddress: value.trim() === "" ? undefined : value,
                })
              }
            />
          </div>
          {error ? <p className="mt-2 px-1 text-xs text-red-300">{error}</p> : null}
        </aside>

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 shadow-xl">
          <div className="flex shrink-0 items-center gap-1 border-b border-slate-800 p-1.5">
            {(
              [
                ["quote", "Quote & 3D"],
                ["explain", "Rationale"],
                ["ops", "Share & ops"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                disabled={!result && id !== "quote"}
                onClick={() => setWorkspaceTab(id)}
                className={
                  workspaceTab === id ? "btn-tab-active" : "btn-tab disabled:opacity-40"
                }
              >
                {label}
              </button>
            ))}
          </div>

          <div className="dash-col-scroll px-2 pb-3 pt-2 md:px-3">
            {!result ? (
              <p className="text-sm text-slate-500">
                Run <strong>Generate</strong> to load the quote, model-viewer roof, and design
                rationale. Tabs keep the page within one viewport height.
              </p>
            ) : workspaceTab === "quote" ? (
              <div className="space-y-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:gap-4">
                <div className="min-w-0 flex-1 space-y-2">
                  <RoofModelViewer modelKey={roofModel} viewerHeight={200} />
                  <dl className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    <Kpi label="PV" value={`${result.recommendation.pvSizeKw} kWp`} />
                    <Kpi label="Battery" value={`${result.recommendation.batteryKwh} kWh`} />
                    <Kpi
                      label="Heat pump"
                      value={result.recommendation.recommendHeatPump ? "Yes" : "No"}
                    />
                    <Kpi label="Self-use" value={`${result.recommendation.estimatedSelfConsumptionPct}%`} />
                    <Kpi label="Modules" value={`${result.recommendation.estimatedModuleCount}`} />
                    <Kpi label="Roof use" value={`${result.recommendation.roofUtilizationPct}%`} />
                    {result.roofAnalysis ? (
                      <Kpi label="Usable roof" value={`${result.roofAnalysis.usableRoofAreaM2} m²`} />
                    ) : null}
                    {result.moduleLayout ? (
                      <Kpi
                        label="Array grid"
                        value={`${result.moduleLayout.rows}×${result.moduleLayout.columns}`}
                      />
                    ) : null}
                    <Kpi label="Capex" value={formatEur(result.financials.installCost)} />
                    <Kpi label="Saving / yr" value={formatEur(result.financials.annualSavings)} />
                    <Kpi label="Payback" value={`${result.financials.paybackYears} y`} />
                    <Kpi label="CO₂" value={`${result.financials.co2ReductionKg} kg/yr`} />
                  </dl>
                </div>
                <div className="min-w-0 flex-1 space-y-2 lg:max-w-md">
                  <article className="rounded-xl border border-emerald-700/40 bg-emerald-950/25 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-300/90">
                      Primary offer
                    </p>
                    <p className="mt-1 text-sm font-semibold text-white">
                      {result.offer.title}
                    </p>
                    <p className="text-[11px] text-slate-500">{result.offer.code}</p>
                    <p className="mt-1 text-xs leading-snug text-slate-300">
                      {result.offer.positioning}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-emerald-100">
                      Package total {formatEur(result.offer.estimatedPrice)}
                      <span className="ml-1 text-[10px] font-normal text-slate-500">
                        (aligned to modeled install cost)
                      </span>
                    </p>
                    <ul className="mt-2 flex flex-wrap gap-1">
                      {result.offer.components.map((c) => (
                        <li
                          key={c}
                          className="rounded-md border border-slate-700/80 bg-slate-950/80 px-2 py-0.5 text-[11px] text-slate-200"
                        >
                          {humanizeComponent(c)}
                        </li>
                      ))}
                    </ul>
                  </article>
                  <article className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Alternates
                    </p>
                    <ul className="mt-1 space-y-1.5">
                      {result.alternatives.map((variant) => (
                        <li
                          key={variant.code}
                          className="text-xs leading-snug text-slate-300"
                        >
                          <span className="font-medium text-slate-200">{variant.title}</span>
                          <span className="text-slate-500"> · </span>
                          {formatEur(variant.estimatedPrice)}
                          <span className="text-slate-500"> · </span>
                          {priorityLabels[variant.bestFor]}
                        </li>
                      ))}
                    </ul>
                  </article>
                </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Share proposal
                  </p>
                  <p className="mt-1 text-[10px] leading-snug text-slate-500">
                    Confirm office approval below to unlock customer link and PDF.
                  </p>

                  <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-slate-800/80 bg-slate-900/50 p-2">
                    <input
                      type="checkbox"
                      checked={managerChecklist.releasedToCustomer}
                      onChange={(e) =>
                        setManagerChecklist((prev) => ({
                          ...prev,
                          releasedToCustomer: e.target.checked,
                        }))
                      }
                      className="mt-0.5 rounded border-slate-600"
                    />
                    <span className="text-[11px] leading-snug text-slate-300">
                      <strong className="text-slate-200">Manager approved</strong> — this quote may
                      be shared with the customer (unlocks customer link and PDF).
                    </span>
                  </label>

                  <div className="mt-3 space-y-2">
                    <p className="text-[10px] font-medium uppercase text-slate-500">Customer</p>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        disabled={!managerChecklist.releasedToCustomer}
                        className="btn-secondary py-1.5 text-[11px] disabled:cursor-not-allowed disabled:opacity-40"
                        title={
                          managerChecklist.releasedToCustomer
                            ? "Read-only /share URL (customer snapshot)"
                            : "Confirm manager approval above first"
                        }
                        onClick={() => copyShareLink("customer")}
                      >
                        Share to customer (copy link)
                      </button>
                      <button
                        type="button"
                        disabled={!managerChecklist.releasedToCustomer}
                        className="btn-secondary py-1.5 text-[11px] disabled:cursor-not-allowed disabled:opacity-40"
                        title={
                          managerChecklist.releasedToCustomer
                            ? "Download customer-facing PDF"
                            : "Confirm manager approval above first"
                        }
                        onClick={() => downloadProposalPacket("customer")}
                      >
                        Share to customer (PDF)
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : workspaceTab === "explain" ? (
              <div className="space-y-2">
                <RationaleBlock title="PV" body={result.rationale.pvReason} />
                <RationaleBlock title="Battery" body={result.rationale.batteryReason} />
                <RationaleBlock title="Heat pump" body={result.rationale.heatPumpReason} />
                <RationaleBlock title="Tradeoffs" body={result.rationale.tradeoffSummary} />
                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2">
                  <p className="text-[10px] font-semibold uppercase text-slate-500">Assumptions</p>
                  <ul className="mt-1 list-inside list-disc text-[11px] leading-relaxed text-slate-400">
                    {result.assumptions.slice(0, 12).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-800/80 bg-gradient-to-r from-slate-900/95 to-cyan-950/20 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-cyan-400/90">
                    Field handoff · manager first
                  </p>
                  <p className="mt-1 text-[11px] leading-snug text-slate-400">
                    On site: after <strong className="text-slate-300">Generate</strong>, send this run
                    to the office before the homeowner gets a customer link.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      className="btn-primary py-1.5 text-[11px] font-semibold sm:px-3"
                      title="Copy read-only /share URL for your manager (includes this quote snapshot)"
                      onClick={() => copyShareLink("manager")}
                    >
                      Share with manager (link)
                    </button>
                    <button
                      type="button"
                      className="btn-secondary py-1.5 text-[11px] sm:px-3"
                      title="Download manager PDF for email or WhatsApp"
                      onClick={() => downloadProposalPacket("manager")}
                    >
                      Share with manager (PDF)
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  <WorkflowChip label="Lead" active />
                  <WorkflowChip label="Roof" active={Boolean(result.roofAnalysis)} />
                  <WorkflowChip label="Quote" active />
                  <WorkflowChip label="Ops" active={result.assumptions.length > 2} />
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-2">
                  <p className="text-[10px] font-semibold uppercase text-slate-500">Navigate to site</p>
                  {mapsQuery ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <a
                        href={appleMapsSearchUrl(mapsQuery)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary inline-flex items-center justify-center py-1.5 text-[11px] no-underline"
                      >
                        Apple Maps
                      </a>
                      <a
                        href={googleMapsSearchUrl(mapsQuery)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary inline-flex items-center justify-center py-1.5 text-[11px] no-underline"
                      >
                        Google Maps
                      </a>
                    </div>
                  ) : (
                    <p className="mt-1 text-[10px] leading-snug text-slate-500">
                      Add <strong>Install site (maps)</strong> in the left column (address, place
                      name, or coordinates like 52.52,13.405).
                    </p>
                  )}
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2">
                  <p className="text-[10px] font-semibold uppercase text-slate-500">Handoff checklist</p>
                  <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                    <ChecklistRow
                      label="Customer approved"
                      checked={managerChecklist.customerApproved}
                      onChange={(checked) =>
                        setManagerChecklist((prev) => ({ ...prev, customerApproved: checked }))
                      }
                    />
                    <ChecklistRow
                      label="Permit docs"
                      checked={managerChecklist.permitDocsReady}
                      onChange={(checked) =>
                        setManagerChecklist((prev) => ({ ...prev, permitDocsReady: checked }))
                      }
                    />
                    <ChecklistRow
                      label="Install slot"
                      checked={managerChecklist.installationSlotBooked}
                      onChange={(checked) =>
                        setManagerChecklist((prev) => ({
                          ...prev,
                          installationSlotBooked: checked,
                        }))
                      }
                    />
                    <ChecklistRow
                      label="Financing verified"
                      checked={managerChecklist.financingVerified}
                      onChange={(checked) =>
                        setManagerChecklist((prev) => ({ ...prev, financingVerified: checked }))
                      }
                    />
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-2">
                  <p className="text-[10px] font-semibold uppercase text-slate-500">Customer share gate</p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {managerChecklist.releasedToCustomer
                      ? "Customer link and PDF are unlocked."
                      : "Locked — confirm manager approval on the quote screen, then send to the customer."}
                  </p>
                </div>
              </div>
            )}
            {shareMessage ? (
              <p className="mt-2 px-1 text-[11px] text-emerald-400">{shareMessage}</p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function LabeledText(props: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  return (
    <label className={`field ${props.compact ? "field-compact" : ""}`}>
      <span>{props.label}</span>
      <input
        className="input"
        type="text"
        value={props.value}
        placeholder={props.placeholder}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
  );
}

function LabeledNumber(props: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  compact?: boolean;
}) {
  return (
    <label className={`field ${props.compact ? "field-compact" : ""}`}>
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
  formatOption?: (value: string) => string;
  compact?: boolean;
}) {
  return (
    <label className={`field ${props.compact ? "field-compact" : ""}`}>
      <span>{props.label}</span>
      <select
        className="input"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      >
        {props.options.map((option) => (
          <option key={option} value={option}>
            {props.formatOption ? props.formatOption(option) : option}
          </option>
        ))}
      </select>
    </label>
  );
}

function Kpi(props: { label: string; value: string }) {
  return (
    <div className="kpi-cell">
      <dt>{props.label}</dt>
      <dd>{props.value}</dd>
    </div>
  );
}

function RationaleBlock(props: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-cyan-400/90">
        {props.title}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-300">{props.body}</p>
    </div>
  );
}

function WorkflowChip(props: { label: string; active: boolean }) {
  return (
    <span
      className={`rounded-md border px-2 py-0.5 ${
        props.active
          ? "border-emerald-600/50 bg-emerald-950/40 text-emerald-200"
          : "border-slate-800 bg-slate-950 text-slate-500"
      }`}
    >
      {props.label}
    </span>
  );
}

function ChecklistRow(props: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[11px] text-slate-300">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
        className="rounded border-slate-600"
      />
      <span>{props.label}</span>
    </label>
  );
}
