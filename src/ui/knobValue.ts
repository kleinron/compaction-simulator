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

/** Compact readout next to the V_day text box. The text box still shows the full integer. */
export function formatVDayPretty(v: number): string {
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`
  return `${Math.round(v / 1000)}k`
}

/** Compact readout for Q (and similar integer knobs). Full integer stays in the text box. */
export function formatQPretty(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000) return `${Math.round(v / 1000)}k`
  return String(Math.round(v))
}

function decimalPlaces(step: number): number {
  if (!Number.isFinite(step) || step >= 1) return 0
  const text = step.toString()
  const dot = text.indexOf('.')
  return dot < 0 ? 0 : text.length - dot - 1
}
