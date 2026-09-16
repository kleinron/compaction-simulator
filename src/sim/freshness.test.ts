import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from './defaults.ts'
import { SimulationEngine } from './engine.ts'

const quiet = {
  ...DEFAULT_CONFIG,
  V_day: 0,
  S: 1_000,
  M: 1_000,
  S2: 1_000,
  M2: 1_000,
  timeoutJitter: false,
}

describe('avg freshness', () => {
  it('excludes pending views still sitting in an open batch', () => {
    const eng = new SimulationEngine(
      { ...quiet, stage2: false, N: 1, T: 8, M: 50, S: 99 },
      { seed: 21 },
    )
    eng.ingest('pg0')
    eng.ingest('pg1')
    const snap = eng.snapshot()
    expect(snap.pendingViews).toBe(2)
    expect(snap.stats.committedViews).toBe(0)
    expect(snap.stats.avgFreshness).toBe(0)
    expect(snap.stats.dbUpserts).toBe(0)
  })

  it('with stage 2 off, latency is time spent in the stage-1 batch', () => {
    const eng = new SimulationEngine(
      { ...quiet, stage2: false, N: 1, T: 8, M: 50, S: 5 },
      { seed: 22 },
    )
    eng.ingest('pg0')
    eng.advance(2)
    eng.ingest('pg1')
    expect(eng.snapshot().stats.committedViews).toBe(0)
    eng.advance(3.1)
    const snap = eng.snapshot()
    expect(snap.stats.lastWinner).toBe('S')
    expect(snap.pendingViews).toBe(0)
    expect(snap.stats.committedViews).toBe(2)
    // Batch opened at 0, flushed at S=5. Views ingested at 0 and 2.
    expect(snap.stats.avgFreshness).toBeCloseTo((5 + 3) / 2)
  })

  it('with stage 2 on, latency includes the mid-agg wait until DB publish', () => {
    const eng = new SimulationEngine(
      { ...quiet, stage2: true, N: 1, T: 8, M: 1, S: 99, M2: 50, S2: 5 },
      { seed: 23 },
    )
    eng.ingest('pg0')
    const afterRaw = eng.snapshot()
    expect(afterRaw.stats.aggPublishes).toBe(0)
    expect(afterRaw.stats.committedViews).toBe(0)
    expect(afterRaw.pendingViews).toBe(1)
    eng.advance(5.1)
    const snap = eng.snapshot()
    expect(snap.stats.lastFlushStage).toBe(2)
    expect(snap.pendingViews).toBe(0)
    expect(snap.stats.committedViews).toBe(1)
    expect(snap.stats.avgFreshness).toBeCloseTo(5)
  })

  it('does not flush leftover batches just to compute the mean', () => {
    const eng = new SimulationEngine(
      { ...quiet, stage2: false, N: 1, T: 8, M: 3, S: 99 },
      { seed: 24 },
    )
    eng.ingest('pg0')
    eng.ingest('pg0')
    eng.ingest('pg0')
    eng.ingest('pg1')
    const snap = eng.snapshot()
    expect(snap.stats.committedViews).toBe(3)
    expect(snap.pendingViews).toBe(1)
    expect(snap.stats.avgFreshness).toBe(0)
    expect(snap.stats.rawViews).toBe(4)
  })
})
