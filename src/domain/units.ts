import type { DisplayUnit } from "../types/models";

export const CM_PER_IN = 2.54;

export function toCm(value: number, from: DisplayUnit): number {
  if (from === "cm") {
    return value;
  }
  return value * CM_PER_IN;
}

export function fromCm(valueCm: number, to: DisplayUnit): number {
  if (to === "cm") {
    return valueCm;
  }
  return valueCm / CM_PER_IN;
}
