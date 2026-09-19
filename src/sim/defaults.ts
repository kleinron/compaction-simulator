import type { SimConfig } from './types.ts'

/** Empty-URL defaults: P = T/N = 400, λ = V_day/86400 ≈ 1157. */
export const DEFAULT_CONFIG: SimConfig = {
  T: 10_000,
  N: 25,
  M: 400,
  S: 20,
  V_day: 100_000_000,
  stage2: true,
  S2: 90,
  M2: 10,
  timeoutJitter: true,
}

export const SECONDS_PER_DAY = 86_400

/** Hard caps shared by the engine and the slider/textbox knobs. */
export const CONFIG_LIMITS = {
  T: { min: 1, max: 10_000 },
  N: { min: 1, max: 100 },
  M: { min: 1, max: 5_000 },
  S: { min: 0.05, max: 120 },
  V_day: { min: 0, max: 10_000_000_000 },
  S2: { min: 0.05, max: 120 },
  M2: { min: 2, max: 400 },
} as const

/** Per animation-frame event budget so high λ does not stall the UI.
 *  At V_day = 10B, λ ≈ 1.16e5 / sim-s; runUntil must not jump the clock
 *  when this cap is hit. */
export const UI_EVENTS_PER_FRAME = 4_000
