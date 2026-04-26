export type RoofOrientation =
  | "south"
  | "south_east"
  | "south_west"
  | "east"
  | "west"
  | "north";

export type HeatingType = "gas" | "oil" | "electric" | "district" | "other";

export type OptimizationPriority =
  | "maximize_savings"
  | "minimize_upfront"
  | "maximize_self_consumption";

export interface HouseholdProfile {
  annualConsumption: number;
  roofArea: number;
  orientation: RoofOrientation;
  electricityPrice: number;
  hasEV: boolean;
  heatingType: HeatingType;
  householdSize: number;
  hasHeatPump: boolean;
  /** Optional install site: street/city, place name, or coordinates like "52.52,13.405" for map apps */
  siteAddress?: string;
}

export interface RefinementOverrides {
  electricityPriceOverride?: number;
  evAssumptionOverride?: boolean;
}

export interface DesignRecommendation {
  pvSizeKw: number;
  batteryKwh: number;
  recommendHeatPump: boolean;
  estimatedSelfConsumptionPct: number;
  estimatedModuleCount: number;
  roofUtilizationPct: number;
}

export interface RoofAnalysis {
  modelName: string;
  usableRoofAreaM2: number;
  obstructionScore: number;
  confidence: number;
}

export interface ModuleLayout {
  moduleCount: number;
  rows: number;
  columns: number;
  moduleAreaM2: number;
  coverageM2: number;
}

export interface FinancialMetrics {
  installCost: number;
  annualSavings: number;
  paybackYears: number;
  co2ReductionKg: number;
}

export interface DesignRationale {
  pvReason: string;
  batteryReason: string;
  heatPumpReason: string;
  tradeoffSummary: string;
  assumptions: string[];
}

export interface OfferVariant {
  code: string;
  title: string;
  positioning: string;
  components: string[];
  estimatedPrice: number;
  bestFor: OptimizationPriority;
}

export interface DesignResponse {
  recommendation: DesignRecommendation;
  financials: FinancialMetrics;
  rationale: DesignRationale;
  assumptions: string[];
  offer: OfferVariant;
  alternatives: OfferVariant[];
  roofAnalysis?: RoofAnalysis;
  moduleLayout?: ModuleLayout;
}
