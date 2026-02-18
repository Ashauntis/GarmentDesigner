import type { RoundingMode } from "../types/models";

export function applyRounding(raw: number, mode: RoundingMode, step: number): number {
  const safeStep = Math.max(step, 1);
  const normalized = raw / safeStep;
  let rounded = normalized;

  if (mode === "nearest") {
    rounded = Math.round(normalized);
  } else if (mode === "ceil") {
    rounded = Math.ceil(normalized);
  } else {
    rounded = Math.floor(normalized);
  }

  return Math.max(rounded * safeStep, safeStep);
}
