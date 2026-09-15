import { describe, expect, it } from 'vitest'
import { expectedCompactionC, shardSizeP } from './analytics.ts'
import { DEFAULT_CONFIG } from './defaults.ts'
import { SimulationEngine } from './engine.ts'
import { pageName, shardIndex } from './hash.ts'
import { floorToHourIso, simTimeToIso } from './time.ts'

const quiet = {
  ...DEFAULT_CONFIG,
  V_day: 0,
  S: 1_000,
  K: 1_000,
  M: 1_000,
}

describe('discrete-event engine', () => {
  it('shards injected pages with abs(hash) mod N', () => {
    const N = 5
    const eng = new SimulationEngine({ ...quiet, N, T: 40 }, { seed: 1 })
    for (let i = 0; i < 20; i++) {
      eng.ingest(pageName(i))
    }
    const snap = eng.snapshot()
    const expected = Array.from({ length: N }, () => 0)
    for (let i = 0; i < 20; i++) {
      expected[shardIndex(pageName(i), N)] += 1
    }
    expect(snap.shards.map((s) => s.messages)).toEqual(expected)
    expect(snap.stats.rawViews).toBe(20)
    expect(snap.simTime).toBe(0)
  })

  it('flushes on M, publishes one agg blob, and upserts each leaf', () => {
    const eng = new SimulationEngine(
      { ...quiet, N: 1, T: 8, M: 3, S: 99, K: 99 },
      { seed: 2 },
    )
    eng.ingest('p0')
    eng.ingest('p1')
    expect(eng.snapshot().stats.aggPublishes).toBe(0)
    eng.ingest('p0')
    const snap = eng.snapshot()
    expect(snap.stats.lastWinner).toBe('M')
    expect(snap.stats.aggPublishes).toBe(1)
    expect(snap.stats.lastFlushMessages).toBe(3)
    expect(snap.stats.lastFlushKeys).toBe(2)
    expect(snap.stats.dbUpserts).toBe(2)
    expect(snap.stats.C).toBeCloseTo(3 / 2)
    expect(snap.aggQueue).toHaveLength(1)
    const hour = floorToHourIso(simTimeToIso(0))
    expect(snap.aggQueue[0].payload[hour]).toEqual({ p0: 2, p1: 1 })
    expect(snap.shards[0].messages).toBe(0)
  })

  it('flushes on K when distinct (hour, page) keys hit first', () => {
    const eng = new SimulationEngine(
      { ...quiet, N: 1, T: 10, K: 2, M: 50, S: 99 },
      { seed: 3 },
    )
    eng.ingest('p0')
    eng.ingest('p1')
    expect(eng.snapshot().stats.lastWinner).toBe('K')
    expect(eng.snapshot().stats.dbUpserts).toBe(2)
  })

  it('flushes on S when the sim-second timeout elapses first', () => {
    const eng = new SimulationEngine(
      { ...quiet, N: 1, T: 10, S: 5, M: 50, K: 50 },
      { seed: 4 },
    )
    eng.ingest('p0')
    eng.advance(4.9)
    expect(eng.snapshot().stats.aggPublishes).toBe(0)
    eng.advance(0.2)
    const snap = eng.snapshot()
    expect(snap.stats.lastWinner).toBe('S')
    expect(snap.stats.aggPublishes).toBe(1)
    expect(snap.simTime).toBeCloseTo(5.1, 8)
    expect(snap.simIso).not.toBe(new Date().toISOString())
  })

  it('prefers M when M and K trip on the same ingest', () => {
    const eng = new SimulationEngine(
      { ...quiet, N: 1, T: 10, M: 2, K: 2, S: 99 },
      { seed: 5 },
    )
    eng.ingest('p0')
    eng.ingest('p1')
    expect(eng.snapshot().stats.lastWinner).toBe('M')
  })

  it('keeps live C = raw_views / db_upserts and preserves view totals', () => {
    const eng = new SimulationEngine(
      { ...DEFAULT_CONFIG, T: 40, N: 2, M: 8, S: 100, K: 100, V_day: 86_400 },
      { seed: 6 },
    )
    eng.runUntil(80)
    const snap = eng.snapshot()
    expect(snap.stats.rawViews).toBeGreaterThan(0)
    expect(snap.stats.dbUpserts).toBeGreaterThan(0)
    expect(snap.dbTotalViews).toBe(snap.stats.rawViews)
    expect(snap.stats.C).toBeCloseTo(snap.stats.rawViews / snap.stats.dbUpserts)
    expect(snap.P).toBe(shardSizeP(40, 2))
  })

  it('approaches M/E[U] when only M fires in a single hour (N=1)', () => {
    const T = 20
    const M = 5
    const eng = new SimulationEngine(
      { T, N: 1, M, S: 1e9, K: 1e9, V_day: 86_400 },
      { seed: 7 },
    )
    let guard = 0
    while (eng.snapshot().stats.aggPublishes < 250 && guard < 4000) {
      eng.advance(20)
      guard += 1
    }
    const snap = eng.snapshot()
    expect(snap.stats.aggPublishes).toBeGreaterThanOrEqual(250)
    expect(snap.stats.wins.M).toBe(snap.stats.aggPublishes)
    expect(snap.stats.wins.S).toBe(0)
    expect(snap.stats.wins.K).toBe(0)
    const analytic = expectedCompactionC(T, M)
    expect(snap.stats.C).toBeCloseTo(analytic, 1)
  })
})
