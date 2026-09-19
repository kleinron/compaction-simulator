/** Q range-slider increment. Text box still accepts any integer in [Q.min, Q.max]. */
export const Q_SLIDER_STEP = 100

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

/**
 * Snap a range-slider drag onto `sliderStep`, then clamp into the knob's
 * real [min, max]. Slider origin is 0 so default/max Q (5000 / 50000) sit
 * on 100-wide ticks even though typed min is 1.
 */
export function clampSliderKnob(
  raw: number,
  spec: { min: number; max: number; sliderStep: number },
): number {
  const snapped = clampKnob(raw, { min: 0, max: spec.max, step: spec.sliderStep })
  return Math.min(spec.max, Math.max(spec.min, snapped))
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
