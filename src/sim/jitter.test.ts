import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from './defaults.ts'
import { SimulationEngine } from './engine.ts'
import { TIMEOUT_JITTER_FRAC, jitteredTimeout } from './jitter.ts'
import { mulberry32 } from './rng.ts'

const quiet = {
  ...DEFAULT_CONFIG,
  V_day: 0,
  S: 1_000,
  M: 1_000,
  S2: 1_000,
  M2: 1_000,
}

describe('jitteredTimeout', () => {
  it('returns S unchanged and does not call rng when the toggle is off', () => {
    let calls = 0
    const rng = () => {
      calls += 1
      return 0.5
    }
    expect(jitteredTimeout(10, false, rng)).toBe(10)
    expect(calls).toBe(0)
  })

  it('samples S × U(0.9, 1.1) when the toggle is on', () => {
    expect(TIMEOUT_JITTER_FRAC).toBe(0.1)
    expect(jitteredTimeout(10, true, () => 0)).toBeCloseTo(9)
    expect(jitteredTimeout(10, true, () => 1)).toBeCloseTo(11)
    expect(jitteredTimeout(10, true, () => 0.5)).toBeCloseTo(10)
  })
})

describe('global timeout jitter', () => {
  it('flushes at exact S when the global toggle is off', () => {
    const eng = new SimulationEngine(
      { ...quiet, N: 1, T: 8, S: 5, M: 50, timeoutJitter: false },
      { seed: 31 },
    )
    eng.ingest('pg0')
    eng.advance(4.99)
    expect(eng.snapshot().stats.aggPublishes).toBe(0)
    eng.advance(0.02)
    const snap = eng.snapshot()
    expect(snap.stats.lastWinner).toBe('S')
    expect(snap.stats.aggPublishes).toBe(1)
    expect(snap.simTime).toBeCloseTo(5.01, 8)
  })

  it('samples S × U(0.9, 1.1) once per newly opened raw batch', () => {
    const seed = 32
    const S = 10
    const rng = mulberry32(seed)
    const sampled = jitteredTimeout(S, true, rng)
    expect(sampled).toBeGreaterThanOrEqual(S * 0.9)
    expect(sampled).toBeLessThanOrEqual(S * 1.1)

    const eng = new SimulationEngine(
      { ...quiet, N: 1, T: 8, S, M: 50, timeoutJitter: true },
      { seed },
    )
    eng.ingest('pg0')
    eng.advance(sampled - 0.01)
    expect(eng.snapshot().stats.aggPublishes).toBe(0)
    eng.advance(0.02)
    const snap = eng.snapshot()
    expect(snap.stats.lastWinner).toBe('S')
    expect(snap.stats.aggPublishes).toBe(1)
    expect(snap.simTime).toBeCloseTo(sampled + 0.01, 8)
  })

  it('samples independently for each new raw batch', () => {
    const seed = 34
    const S = 10
    const rng = mulberry32(seed)
    const first = jitteredTimeout(S, true, rng)
    const second = jitteredTimeout(S, true, rng)

    const eng = new SimulationEngine(
      { ...quiet, N: 1, T: 8, S, M: 50, timeoutJitter: true },
      { seed },
    )
    eng.ingest('pg0')
    eng.advance(first + 0.01)
    expect(eng.snapshot().stats.aggPublishes).toBe(1)

    eng.ingest('pg0')
    eng.advance(second - 0.01)
    expect(eng.snapshot().stats.aggPublishes).toBe(1)
    eng.advance(0.02)
    expect(eng.snapshot().stats.aggPublishes).toBe(2)
    expect(eng.snapshot().stats.wins.S).toBe(2)
  })

  it('uses the same global toggle for stage-2 S₂ (no per-stage switch)', () => {
    const seed = 33
    const S = 99
    const S2 = 8
    const rng = mulberry32(seed)
    jitteredTimeout(S, true, rng)
    const midTimeout = jitteredTimeout(S2, true, rng)
    expect(midTimeout).toBeGreaterThanOrEqual(S2 * 0.9)
    expect(midTimeout).toBeLessThanOrEqual(S2 * 1.1)

    const eng = new SimulationEngine(
      {
        ...quiet,
        stage2: true,
        N: 1,
        T: 8,
        M: 1,
        S,
        M2: 50,
        S2,
        timeoutJitter: true,
      },
      { seed },
    )
    eng.ingest('pg0')
    expect(eng.snapshot().stats.aggPublishes).toBe(0)
    expect(eng.snapshot().pendingViews).toBe(1)
    eng.advance(midTimeout - 0.01)
    expect(eng.snapshot().stats.aggPublishes).toBe(0)
    eng.advance(0.02)
    const snap = eng.snapshot()
    expect(snap.stats.lastFlushStage).toBe(2)
    expect(snap.stats.lastWinner).toBe('S')
    expect(snap.stats.midWins.S).toBe(1)
    expect(snap.simTime).toBeCloseTo(midTimeout + 0.01, 8)
  })

  it('keeps stage-2 S₂ exact when the global toggle is off', () => {
    const eng = new SimulationEngine(
      {
        ...quiet,
        stage2: true,
        N: 1,
        T: 8,
        M: 1,
        S: 99,
        M2: 50,
        S2: 5,
        timeoutJitter: false,
      },
      { seed: 35 },
    )
    eng.ingest('pg0')
    eng.advance(4.99)
    expect(eng.snapshot().stats.aggPublishes).toBe(0)
    eng.advance(0.02)
    const snap = eng.snapshot()
    expect(snap.stats.lastFlushStage).toBe(2)
    expect(snap.stats.lastWinner).toBe('S')
    expect(snap.simTime).toBeCloseTo(5.01, 8)
  })
})
