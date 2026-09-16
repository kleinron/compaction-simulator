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

/** Hard caps shared by the engine and the slider/textbox knobs. */
export const CONFIG_LIMITS = {
  T: { min: 1, max: 10_000 },
  N: { min: 1, max: 100 },
  M: { min: 1, max: 400 },
  S: { min: 0.05, max: 120 },
  V_day: { min: 0, max: 100_000_000 },
} as const

/** Per animation-frame event budget so high λ does not stall the UI. */
export const UI_EVENTS_PER_FRAME = 4_000
