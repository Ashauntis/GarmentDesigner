import { applyRounding } from "./rounding";
import type { RoundingPolicy } from "../types/models";

export interface GaugeInput {
  lengthCm: number;
  stitchesPer10Cm: number;
  rowsPer10Cm: number;
}

export function deriveGaugeCounts(input: GaugeInput, rounding: RoundingPolicy): { stitches: number; rows: number } {
  const rawStitches = (input.lengthCm / 10) * input.stitchesPer10Cm;
  const rawRows = (input.lengthCm / 10) * input.rowsPer10Cm;

  return {
    stitches: applyRounding(rawStitches, rounding.stitch.mode, rounding.stitch.step),
    rows: applyRounding(rawRows, rounding.row.mode, rounding.row.step)
  };
}
