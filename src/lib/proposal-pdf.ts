import { jsPDF } from "jspdf";
import type { DesignResponse } from "@/types/design";

function formatEurPlain(n: number): string {
  return `EUR ${n.toLocaleString("de-DE", { maximumFractionDigits: 0 })}`;
}

function checklistLabel(key: string): string {
  const map: Record<string, string> = {
    customerApproved: "Customer approved proposal",
    permitDocsReady: "Permit documents prepared",
    installationSlotBooked: "Installation slot booked",
    financingVerified: "Financing verified",
    releasedToCustomer: "Manager approved customer-facing share",
  };
  return map[key] ?? key;
}

/**
 * Client-side A4 PDF (plain text). Uses ASCII-friendly currency strings for font compatibility.
 */
export function downloadProposalPdf(params: {
  audience: "customer" | "manager";
  priorityLabel: string;
  result: DesignResponse;
  managerChecklist: Record<string, boolean>;
  humanizeComponent: (slug: string) => string;
  siteAddress?: string;
}): void {
  const { audience, priorityLabel, result, managerChecklist, humanizeComponent, siteAddress } =
    params;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 14;
  const pageH = doc.internal.pageSize.getHeight();
  const pageW = doc.internal.pageSize.getWidth();
  const maxW = pageW - 2 * margin;
  let y = margin;
  const lineGap = 5.2;

  function ensureSpace(lines: number) {
    if (y + lines * lineGap > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  }

  function heading(text: string) {
    ensureSpace(2);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(text, margin, y);
    y += lineGap + 2;
  }

  function paragraph(text: string) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(text, maxW);
    for (const line of lines) {
      ensureSpace(1);
      doc.text(line, margin, y);
      y += lineGap;
    }
    y += 1;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(`Reonic proposal pack (${audience})`, margin, y);
  y += lineGap + 4;

  paragraph(`Generated: ${new Date().toISOString()}`);
  paragraph(`Objective: ${priorityLabel}`);
  const site = siteAddress?.trim();
  if (site) {
    paragraph(`Install site: ${site}`);
  }

  heading("Design");
  paragraph(`PV system size: ${result.recommendation.pvSizeKw} kWp`);
  paragraph(`Battery: ${result.recommendation.batteryKwh} kWh`);
  paragraph(
    `Heat pump: ${result.recommendation.recommendHeatPump ? "Recommended" : "Not recommended"}`
  );
  paragraph(`Estimated module count: ${result.recommendation.estimatedModuleCount}`);
  paragraph(`Roof utilization: ${result.recommendation.roofUtilizationPct}%`);

  heading("Financials");
  paragraph(`Install cost: ${formatEurPlain(result.financials.installCost)}`);
  paragraph(`Annual savings: ${formatEurPlain(result.financials.annualSavings)}`);
  paragraph(`Payback: ${result.financials.paybackYears} years`);
  paragraph(`CO2 reduction: ${result.financials.co2ReductionKg} kg/year`);

  heading("Offer");
  paragraph(`${result.offer.title} (${result.offer.code})`);
  paragraph(result.offer.positioning);
  paragraph(
    `Package total: ${formatEurPlain(result.offer.estimatedPrice)} (modeled install total)`
  );
  paragraph(
    `Components: ${result.offer.components.map((c) => humanizeComponent(c)).join(", ")}`
  );

  heading("Assumptions");
  for (const a of result.assumptions) {
    paragraph(`- ${a}`);
  }

  if (audience === "manager") {
    heading("Manager checklist");
    for (const [key, done] of Object.entries(managerChecklist)) {
      paragraph(`${done ? "[x]" : "[ ]"} ${checklistLabel(key)}`);
    }
  }

  doc.save(`reonic-proposal-${audience}.pdf`);
}
