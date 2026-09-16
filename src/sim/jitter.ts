/** Uniform half-width: ±10% around the configured timeout. */
export const TIMEOUT_JITTER_FRAC = 0.1

/**
 * Timeout deadline for a newly opened batch.
 *
 * - timeoutJitter **off** (default): exactly `S` for raw batches, exactly `S₂`
 *   for mid-agg. One global toggle; there is no per-stage switch.
 * - timeoutJitter **on**: sample `deadline = S * U(0.9, 1.1)` independently
 *   each time a batch opens (raw uses S, mid-agg uses S₂). Flush is still
 *   earliest of that sampled timeout vs M / M₂.
 */
export function jitteredTimeout(S: number, jitter: boolean, rng: () => number): number {
  if (!jitter) return S
  return S * (1 - TIMEOUT_JITTER_FRAC + rng() * (2 * TIMEOUT_JITTER_FRAC))
}
