import type { ModuleLayout } from "@/types/design";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function computeModuleLayout(params: {
  usableRoofAreaM2: number;
  desiredModuleCount: number;
  moduleAreaM2?: number;
}): ModuleLayout {
  const moduleAreaM2 = params.moduleAreaM2 ?? 1.92;
  const maxModules = Math.max(4, Math.floor(params.usableRoofAreaM2 / moduleAreaM2));
  const moduleCount = clamp(params.desiredModuleCount, 4, maxModules);
  const columns = Math.max(2, Math.ceil(Math.sqrt(moduleCount)));
  const rows = Math.max(2, Math.ceil(moduleCount / columns));
  const coverageM2 = Number((moduleCount * moduleAreaM2).toFixed(2));

  return {
    moduleCount,
    rows,
    columns,
    moduleAreaM2,
    coverageM2,
  };
}
