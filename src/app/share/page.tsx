"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  appleMapsSearchUrl,
  googleMapsSearchUrl,
  siteMapsQuery,
} from "@/lib/maps-links";
import type { DesignResponse, HouseholdProfile, OptimizationPriority } from "@/types/design";

const priorityLabels: Record<OptimizationPriority, string> = {
  maximize_savings: "Maximize savings",
  minimize_upfront: "Minimize upfront cost",
  maximize_self_consumption: "Maximize self-consumption",
};

type SharedPayload = {
  audience: "customer" | "manager";
  createdAt: string;
  priority: OptimizationPriority;
  profile: HouseholdProfile;
  result: DesignResponse;
  managerChecklist?: Record<string, boolean>;
};

export default function SharePage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-3xl p-8 text-slate-100">
          <h1 className="text-2xl font-bold">Loading shared proposal...</h1>
        </main>
      }
    >
      <SharePayloadView />
    </Suspense>
  );
}

function SharePayloadView() {
  const searchParams = useSearchParams();
  const payload = useMemo(() => {
    const encoded = searchParams.get("data");
    if (!encoded) return null;
    try {
      return JSON.parse(atob(decodeURIComponent(encoded))) as SharedPayload;
    } catch {
      return null;
    }
  }, [searchParams]);

  if (!payload) {
    return (
      <main className="mx-auto max-w-3xl p-8 text-slate-100">
        <h1 className="text-2xl font-bold">Shared proposal unavailable</h1>
        <p className="mt-2 text-slate-300">The share link is invalid or incomplete.</p>
      </main>
    );
  }

  const { result, profile } = payload;
  const shareMapsQuery = siteMapsQuery(profile);
  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6 text-slate-100">
      <header className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <h1 className="text-2xl font-bold">
          Reonic Shared Proposal ({payload.audience === "customer" ? "Customer" : "Manager"})
        </h1>
        <p className="mt-1 text-sm text-slate-300">
          Generated {new Date(payload.createdAt).toLocaleString()} - Objective:{" "}
          {priorityLabels[payload.priority]}
        </p>
      </header>

      {shareMapsQuery ? (
        <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Install site</p>
          <p className="mt-1 text-sm text-slate-200">{profile.siteAddress}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={appleMapsSearchUrl(shareMapsQuery)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-200 no-underline hover:bg-slate-800"
            >
              Open in Apple Maps
            </a>
            <a
              href={googleMapsSearchUrl(shareMapsQuery)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-200 no-underline hover:bg-slate-800"
            >
              Open in Google Maps
            </a>
          </div>
        </section>
      ) : null}

      <section className="grid gap-3 md:grid-cols-2">
        <Card label="PV size" value={`${result.recommendation.pvSizeKw} kWp`} />
        <Card label="Battery size" value={`${result.recommendation.batteryKwh} kWh`} />
        <Card
          label="Heat pump"
          value={result.recommendation.recommendHeatPump ? "Recommended" : "Not recommended"}
        />
        <Card label="Self-consumption" value={`${result.recommendation.estimatedSelfConsumptionPct}%`} />
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <p className="text-xs uppercase tracking-wide text-slate-400">Financial Overview</p>
        <ul className="mt-2 space-y-1 text-sm text-slate-200">
          <li>Install cost: EUR {result.financials.installCost}</li>
          <li>Annual savings: EUR {result.financials.annualSavings}</li>
          <li>Payback: {result.financials.paybackYears} years</li>
          <li>CO2 reduction: {result.financials.co2ReductionKg} kg/year</li>
        </ul>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <p className="text-xs uppercase tracking-wide text-slate-400">Offer</p>
        <p className="mt-1 font-semibold text-white">
          {result.offer.title} ({result.offer.code})
        </p>
        <p className="text-sm text-slate-300">{result.offer.positioning}</p>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-200">
          {result.offer.components.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <p className="text-xs uppercase tracking-wide text-slate-400">Assumptions</p>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-200">
          {result.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function Card(props: { label: string; value: string }) {
  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-400">{props.label}</p>
      <p className="mt-1 text-xl font-semibold text-white">{props.value}</p>
    </article>
  );
}
