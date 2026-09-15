import { describe, expect, it } from 'vitest'
import {
  arrivalRateLambda,
  expectedCompactionC,
  expectedUniqueKeys,
  shardSizeP,
  uniqueAfterThrows,
} from './analytics.ts'
import { SECONDS_PER_DAY } from './defaults.ts'
import { mulberry32 } from './rng.ts'

describe('shard size P = T/N', () => {
  it('is T divided by N and is never named S', () => {
    expect(shardSizeP(100, 4)).toBe(25)
    expect(shardSizeP(200, 8)).toBe(25)
    expect(shardSizeP(10, 3)).toBeCloseTo(10 / 3)
  })
})

describe('single-hour occupancy E[U] and C ≈ M/E[U]', () => {
  it('matches E[U] = P(1-(1-1/P)^M)', () => {
    const P = 25
    const M = 30
    const expected = P * (1 - (1 - 1 / P) ** M)
    expect(expectedUniqueKeys(P, M)).toBeCloseTo(expected, 12)
  })

  it('gives analytic C = M / E[U] when only M fires', () => {
    const P = 25
    const M = 30
    const eu = expectedUniqueKeys(P, M)
    expect(expectedCompactionC(P, M)).toBeCloseTo(M / eu, 12)
    expect(expectedCompactionC(P, M)).toBeGreaterThan(1)
  })

  it('Monte Carlo unique count tracks E[U]', () => {
    const P = 10
    const M = 20
    const rng = mulberry32(0x51a7)
    const trials = 4000
    let sum = 0
    for (let i = 0; i < trials; i++) {
      sum += uniqueAfterThrows(P, M, rng)
    }
    const mean = sum / trials
    expect(mean).toBeCloseTo(expectedUniqueKeys(P, M), 1)
  })

  it('derives λ = V_day / 86400', () => {
    expect(arrivalRateLambda(86_400)).toBe(1)
    expect(arrivalRateLambda(1_000_000)).toBeCloseTo(1_000_000 / SECONDS_PER_DAY)
  })
})
