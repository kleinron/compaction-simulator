import { SECONDS_PER_DAY } from './defaults.ts'

/** Shard size P = T/N (expected pages per raw shard). Never named S. */
export function shardSizeP(T: number, N: number): number {
  if (N <= 0) throw new Error('N must be positive')
  return T / N
}

/** λ = V_day / 86400 events per sim-second. */
export function arrivalRateLambda(V_day: number): number {
  return V_day / SECONDS_PER_DAY
}

/**
 * Single-hour occupancy: E[U] = P (1 − (1 − 1/P)^M)
 * expected distinct (hour, page) keys after M uniform throws into P bins.
 */
export function expectedUniqueKeys(P: number, M: number): number {
  if (P <= 0 || M <= 0) return 0
  return P * (1 - (1 - 1 / P) ** M)
}

/** Analytic C ≈ M / E[U] when only the M threshold fires (single hour). */
export function expectedCompactionC(P: number, M: number): number {
  const eu = expectedUniqueKeys(P, M)
  return eu === 0 ? 0 : M / eu
}

/** Monte Carlo occupancy: M uniform throws into P integer bins. */
export function uniqueAfterThrows(
  P: number,
  M: number,
  rng: () => number,
): number {
  const bins = Math.round(P)
  if (bins <= 0 || M <= 0) return 0
  const seen = new Uint8Array(bins)
  let unique = 0
  for (let i = 0; i < M; i++) {
    const bin = Math.min(bins - 1, Math.floor(rng() * bins))
    if (seen[bin] === 0) {
      seen[bin] = 1
      unique += 1
    }
  }
  return unique
}
