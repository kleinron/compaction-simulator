import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from './defaults.ts'
import { SimulationEngine } from './engine.ts'
import { shardIndex } from './hash.ts'
import { floorToHourIso, simTimeToIso } from './time.ts'

const quiet = {
  ...DEFAULT_CONFIG,
  V_day: 0,
  S: 1_000,
  M: 1_000,
  S2: 1_000,
  M2: 1_000,
}

describe('stage 2 mid-aggregation', () => {
  it('keeps stage-1 → agg → DB behavior when stage 2 is off', () => {
    const eng = new SimulationEngine(
      { ...quiet, stage2: false, N: 1, T: 8, M: 2, S: 99 },
      { seed: 11 },
    )
    eng.ingest('p0')
    eng.ingest('p0')
    const snap = eng.snapshot()
    expect(snap.midShards).toHaveLength(0)
    expect(snap.stats.aggPublishes).toBe(1)
    expect(snap.stats.dbUpserts).toBe(1)
    expect(snap.stats.lastFlushStage).toBe(1)
    expect(snap.stats.C).toBe(2)
    expect(snap.dbTotalViews + snap.pendingViews).toBe(2)
  })

  it('merges successive stage-1 blobs on the same shard before the DB', () => {
    const eng = new SimulationEngine(
      { ...quiet, stage2: true, N: 1, T: 8, M: 2, S: 99, M2: 2, S2: 99 },
      { seed: 12 },
    )
    eng.ingest('p0')
    eng.ingest('p0')
    const afterFirst = eng.snapshot()
    expect(afterFirst.stats.dbUpserts).toBe(0)
    expect(afterFirst.stats.aggPublishes).toBe(0)
    expect(afterFirst.midShards).toHaveLength(1)
    expect(afterFirst.midShards[0].messages).toBe(1)
    expect(afterFirst.dbTotalViews + afterFirst.pendingViews).toBe(2)

    eng.ingest('p0')
    eng.ingest('p1')
    const snap = eng.snapshot()
    expect(snap.stats.aggPublishes).toBe(1)
    expect(snap.stats.lastFlushStage).toBe(2)
    expect(snap.stats.lastWinner).toBe('M')
    expect(snap.stats.dbUpserts).toBe(2)
    expect(snap.stats.rawViews).toBe(4)
    expect(snap.stats.C).toBe(2)
    const hour = floorToHourIso(simTimeToIso(0))
    expect(snap.aggQueue[0].payload[hour]).toEqual({ p0: 3, p1: 1 })
    expect(snap.aggQueue[0].sourceBlobs).toBe(2)
    expect(snap.aggQueue[0].stage).toBe(2)
    expect(snap.dbTotalViews).toBe(4)
    expect(snap.midShards[0].messages).toBe(0)
  })

  it('routes each stage-1 blob to mid-agg with the same shard index', () => {
    const N = 3
    const eng = new SimulationEngine(
      { ...quiet, stage2: true, N, T: 30, M: 1, S: 99, M2: 50, S2: 99 },
      { seed: 13 },
    )
    const pages = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5']
    for (const page of pages) eng.ingest(page)
    const snap = eng.snapshot()
    const expected = Array.from({ length: N }, () => 0)
    for (const page of pages) expected[shardIndex(page, N)] += 1
    expect(snap.midShards.map((s) => s.messages)).toEqual(expected)
    expect(snap.shards.every((s) => s.messages === 0)).toBe(true)
    expect(snap.stats.dbUpserts).toBe(0)
  })

  it('flushes mid-agg on M₂ blob count', () => {
    const eng = new SimulationEngine(
      { ...quiet, stage2: true, N: 1, T: 8, M: 1, S: 99, M2: 3, S2: 99 },
      { seed: 14 },
    )
    eng.ingest('p0')
    eng.ingest('p1')
    expect(eng.snapshot().stats.aggPublishes).toBe(0)
    eng.ingest('p2')
    const snap = eng.snapshot()
    expect(snap.stats.lastWinner).toBe('M')
    expect(snap.stats.midWins.M).toBe(1)
    expect(snap.stats.aggPublishes).toBe(1)
    expect(snap.aggQueue[0].sourceBlobs).toBe(3)
  })

  it('flushes mid-agg on S₂ timeout', () => {
    const eng = new SimulationEngine(
      { ...quiet, stage2: true, N: 1, T: 8, M: 1, S: 99, M2: 50, S2: 5 },
      { seed: 15 },
    )
    eng.ingest('p0')
    eng.advance(4.9)
    expect(eng.snapshot().stats.aggPublishes).toBe(0)
    eng.advance(0.2)
    const snap = eng.snapshot()
    expect(snap.stats.lastWinner).toBe('S')
    expect(snap.stats.midWins.S).toBe(1)
    expect(snap.stats.lastFlushStage).toBe(2)
    expect(snap.simTime).toBeCloseTo(5.1, 8)
  })

  it('prefers M₂ when S₂ and M₂ trip at the same sim time', () => {
    const eng = new SimulationEngine(
      { ...quiet, stage2: true, N: 1, T: 8, M: 1, S: 99, M2: 1, S2: 0.05 },
      { seed: 16 },
    )
    eng.ingest('p0')
    expect(eng.snapshot().stats.lastWinner).toBe('M')
    expect(eng.snapshot().stats.midWins.M).toBe(1)
    expect(eng.snapshot().stats.midWins.S).toBe(0)
  })
})
