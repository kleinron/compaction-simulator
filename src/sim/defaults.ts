import type { SimConfig } from './types.ts'

/** Competitive S/M defaults: P = T/N = 25, λ = V_day/86400 ≈ 11.57. */
export const DEFAULT_CONFIG: SimConfig = {
  T: 100,
  N: 4,
  M: 30,
  S: 10,
  V_day: 1_000_000,
}

export const SECONDS_PER_DAY = 86_400
