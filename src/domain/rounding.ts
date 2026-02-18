import type { RoundingMode } from "../types/models";

export function applyRounding(raw: number, mode: RoundingMode, step: number): number {
  const safeStep = Math.max(step, 1);
  const normalized = raw / safeStep;
  const round = mode === "nearest" ? Math.round : mode === "ceil" ? Math.ceil : Math.floor;
  return Math.max(round(normalized) * safeStep, safeStep);
}
