/** Snap a typed/slider value onto the same min/max/step as the paired control. */
export function clampKnob(
  raw: number,
  spec: { min: number; max: number; step: number },
): number {
  if (!Number.isFinite(raw)) return spec.min
  const stepped = spec.min + Math.round((raw - spec.min) / spec.step) * spec.step
  const clamped = Math.min(spec.max, Math.max(spec.min, stepped))
  return Number(clamped.toFixed(decimalPlaces(spec.step)))
}

export function formatKnobNumber(value: number, step: number): string {
  return value.toFixed(decimalPlaces(step))
}

function decimalPlaces(step: number): number {
  if (!Number.isFinite(step) || step >= 1) return 0
  const text = step.toString()
  const dot = text.indexOf('.')
  return dot < 0 ? 0 : text.length - dot - 1
}
