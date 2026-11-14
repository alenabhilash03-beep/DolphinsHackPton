/** Logarithmic UI mappings; these are slider ranges, not scientific model bounds. */

export const KINETIC_RANGES = {
  "binding.association_nM_inv_h_inv": { min: 1e-4, max: 1e4, unit: "nM⁻¹ h⁻¹" },
  "binding.dissociation_h_inv": { min: 1e-6, max: 1e2, unit: "h⁻¹" },
  "binding.affinity_nM": { min: 1e-6, max: 1e2, unit: "nM" },
} as const;

export type KineticField = keyof typeof KINETIC_RANGES;

export function toLogPosition(value: number, min: number, max: number): number {
  if (![value, min, max].every(Number.isFinite) || value <= 0 || min <= 0 || max <= min) {
    throw new Error("Logarithmic controls require finite positive values and an increasing range.");
  }
  const position = (Math.log(value) - Math.log(min)) / (Math.log(max) - Math.log(min));
  return Math.max(0, Math.min(1, position));
}

export function fromLogPosition(position: number, min: number, max: number): number {
  if (![position, min, max].every(Number.isFinite) || min <= 0 || max <= min) {
    throw new Error("Logarithmic controls require a finite position and positive range.");
  }
  const clamped = Math.max(0, Math.min(1, position));
  return Math.exp(Math.log(min) + clamped * (Math.log(max) - Math.log(min)));
}
