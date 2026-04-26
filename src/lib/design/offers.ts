import type {
  DesignRecommendation,
  FinancialMetrics,
  OfferVariant,
  OptimizationPriority,
} from "@/types/design";
import reonicOffers from "@/data/reonic-offers.json";

interface CatalogOffer {
  code: string;
  title: string;
  positioning: string;
  components: string[];
  moduleCount: number;
  batteryKwh: number;
  inverterKw: number;
  bestFor: OptimizationPriority;
}

const BASE_OFFERS: OfferVariant[] = [
  {
    code: "ECO-BASE",
    title: "Eco Start",
    positioning: "Lower entry cost with future-ready expansion path.",
    components: [
      "Tier-1 PV modules",
      "Hybrid inverter",
      "Compact LFP battery",
      "Smart monitoring gateway",
    ],
    estimatedPrice: 0,
    bestFor: "minimize_upfront",
  },
  {
    code: "BALANCE-PLUS",
    title: "Balanced Performer",
    positioning: "Balanced ROI and resilience for mainstream households.",
    components: [
      "Tier-1 PV modules",
      "Hybrid inverter",
      "Mid-capacity LFP battery",
      "EMS with EV charge scheduling",
    ],
    estimatedPrice: 0,
    bestFor: "maximize_savings",
  },
  {
    code: "AUTARKY-PRO",
    title: "Autarky Pro",
    positioning: "Maximum self-consumption and evening autonomy focus.",
    components: [
      "High-efficiency PV module set",
      "Bi-directional hybrid inverter",
      "High-capacity LFP battery",
      "Advanced home energy manager",
    ],
    estimatedPrice: 0,
    bestFor: "maximize_self_consumption",
  },
];

const CATALOG_OFFERS = (reonicOffers as CatalogOffer[]).filter(
  (offer) => offer.components.length > 0
);

function estimatePrice(baseInstallCost: number, bestFor: OptimizationPriority): number {
  const delta =
    bestFor === "maximize_self_consumption"
      ? 1700
      : bestFor === "minimize_upfront"
        ? -1000
        : 450;
  return Math.round(baseInstallCost + delta);
}

function toOfferVariant(
  offer: CatalogOffer,
  baseInstallCost: number
): OfferVariant {
  return {
    code: offer.code,
    title: offer.title,
    positioning: offer.positioning,
    components: offer.components.slice(0, 6),
    estimatedPrice: estimatePrice(baseInstallCost, offer.bestFor),
    bestFor: offer.bestFor,
  };
}

function scoreOfferMatch(
  offer: CatalogOffer,
  recommendation: DesignRecommendation,
  priority: OptimizationPriority
): number {
  const moduleGap = Math.abs(offer.moduleCount - recommendation.estimatedModuleCount);
  const batteryGap = Math.abs(offer.batteryKwh - recommendation.batteryKwh);
  const priorityPenalty = offer.bestFor === priority ? 0 : 2.5;
  return moduleGap / 4 + batteryGap + priorityPenalty;
}

export function buildOfferVariants(params: {
  priority: OptimizationPriority;
  recommendation: DesignRecommendation;
  financials: FinancialMetrics;
}): { offer: OfferVariant; alternatives: OfferVariant[] } {
  if (CATALOG_OFFERS.length > 20) {
    const rankedAll = [...CATALOG_OFFERS]
      .sort(
        (a, b) =>
          scoreOfferMatch(a, params.recommendation, params.priority) -
          scoreOfferMatch(b, params.recommendation, params.priority)
      )
      .slice(0, 30)
      .map((offer) => toOfferVariant(offer, params.financials.installCost));

    const rankedPriority = [...CATALOG_OFFERS]
      .filter((offer) => offer.bestFor === params.priority)
      .sort(
        (a, b) =>
          scoreOfferMatch(a, params.recommendation, params.priority) -
          scoreOfferMatch(b, params.recommendation, params.priority)
      )
      .slice(0, 1)
      .map((offer) => toOfferVariant(offer, params.financials.installCost));

    const preferred = rankedPriority[0] ?? rankedAll[0];
    const alternatives = rankedAll
      .filter((offer) => offer.code !== preferred.code)
      .slice(0, 2);
    return {
      offer: preferred,
      alternatives,
    };
  }

  const enriched = BASE_OFFERS.map((offer) => {
    const batteryDelta =
      offer.bestFor === "maximize_self_consumption"
        ? 1800
        : offer.bestFor === "minimize_upfront"
          ? -1200
          : 0;
    const gridControllerDelta = offer.bestFor === "maximize_savings" ? 650 : 350;

    return {
      ...offer,
      estimatedPrice: Math.round(
        params.financials.installCost + batteryDelta + gridControllerDelta
      ),
    };
  });

  const offer =
    enriched.find((item) => item.bestFor === params.priority) ?? enriched[1];
  const alternatives = enriched.filter((item) => item.code !== offer.code);

  return { offer, alternatives };
}
