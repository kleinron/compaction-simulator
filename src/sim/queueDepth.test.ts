import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from './defaults.ts'
import { SimulationEngine } from './engine.ts'
import { compactionC } from './upsert.ts'

const quiet = {
  ...DEFAULT_CONFIG,
  V_day: 0,
  S: 1_000,
  M: 1_000,
  S2: 1_000,
  M2: 1_000,
  stage2: false,
  timeoutJitter: false,
}

/** Hold the raw batch so a test can sit at Q without the min(M, Q) flush clearing it. */
function holdRawFlush(eng: SimulationEngine): () => void {
  const held = eng as unknown as { flushRaw: (...args: unknown[]) => void }
  const original = held.flushRaw.bind(eng)
  held.flushRaw = () => {}
  return () => {
    held.flushRaw = original
  }
}

describe('raw queue depth Q', () => {
  it('enqueues when the raw shard is below Q', () => {
    const eng = new SimulationEngine({ ...quiet, N: 1, T: 8, Q: 5, M: 100 }, { seed: 41 })
    eng.ingest('pg0')
    eng.ingest('pg1')
    eng.ingest('pg0')
    const snap = eng.snapshot()
    expect(snap.shards[0].messages).toBe(3)
    expect(snap.shards[0].meterQ).toBeCloseTo(3 / 5)
    expect(snap.stats.dropped).toBe(0)
    expect(snap.stats.rawViews).toBe(3)
    expect(snap.stats.aggPublishes).toBe(0)
    expect(snap.pendingViews).toBe(3)
  })

  it('drops the incoming view when that raw shard is already at Q', () => {
    const eng = new SimulationEngine({ ...quiet, N: 1, T: 8, Q: 2, M: 100 }, { seed: 42 })
    const restore = holdRawFlush(eng)
    try {
      eng.ingest('pg0')
      eng.ingest('pg1')
      expect(eng.snapshot().shards[0].messages).toBe(2)
      expect(eng.snapshot().stats.rawViews).toBe(2)

      eng.ingest('pg2')
      const snap = eng.snapshot()
      expect(snap.shards[0].messages).toBe(2)
      expect(snap.stats.dropped).toBe(1)
      expect(snap.stats.rawViews).toBe(2)
      expect(snap.pendingViews).toBe(2)
      expect(snap.recentIngest.some((ev) => ev.page === 'pg2')).toBe(false)
    } finally {
      restore()
    }
  })

  it('increments dropped on each overflow and never counts drops in rawViews or C', () => {
    const eng = new SimulationEngine(
      { ...quiet, N: 1, T: 8, Q: 2, M: 2, S: 99 },
      { seed: 43 },
    )
    const restore = holdRawFlush(eng)
    try {
      eng.ingest('pg0')
      eng.ingest('pg1')
      eng.ingest('pg0')
      eng.ingest('pg2')
      const snap = eng.snapshot()
      expect(snap.stats.dropped).toBe(2)
      expect(snap.stats.rawViews).toBe(2)
      expect(snap.stats.dbUpserts).toBe(0)
      expect(snap.stats.C).toBe(0)
      expect(snap.dbTotalViews + snap.pendingViews).toBe(snap.stats.rawViews)
    } finally {
      restore()
    }

    const flushed = new SimulationEngine(
      { ...quiet, N: 1, T: 8, Q: 3, M: 3, S: 99 },
      { seed: 44 },
    )
    flushed.ingest('pg0')
    flushed.ingest('pg1')
    flushed.ingest('pg0')
    const afterM = flushed.snapshot()
    expect(afterM.stats.rawViews).toBe(3)
    expect(afterM.stats.dropped).toBe(0)
    expect(afterM.stats.dbUpserts).toBe(2)
    expect(afterM.stats.C).toBeCloseTo(compactionC(3, 2))
    expect(afterM.stats.C).toBeCloseTo(afterM.stats.rawViews / afterM.stats.dbUpserts)
  })

  it('flushes on the Q-th message when Q < M (effective count-flush = min(M, Q))', () => {
    const eng = new SimulationEngine(
      { ...quiet, N: 1, T: 8, Q: 3, M: 10, S: 99 },
      { seed: 45 },
    )
    eng.ingest('pg0')
    eng.ingest('pg1')
    expect(eng.snapshot().stats.aggPublishes).toBe(0)
    expect(eng.snapshot().shards[0].messages).toBe(2)

    eng.ingest('pg2')
    const snap = eng.snapshot()
    expect(snap.stats.lastWinner).toBe('M')
    expect(snap.stats.aggPublishes).toBe(1)
    expect(snap.stats.lastFlushMessages).toBe(3)
    expect(snap.shards[0].messages).toBe(0)
    expect(snap.stats.rawViews).toBe(3)
    expect(snap.stats.dropped).toBe(0)
    expect(snap.stats.expectedC_M_only).toBeGreaterThan(0)
  })

  it('does not flush early when Q > M; M still wins at M', () => {
    const eng = new SimulationEngine(
      { ...quiet, N: 1, T: 8, Q: 50, M: 3, S: 99 },
      { seed: 46 },
    )
    eng.ingest('pg0')
    eng.ingest('pg1')
    expect(eng.snapshot().stats.aggPublishes).toBe(0)
    eng.ingest('pg0')
    const snap = eng.snapshot()
    expect(snap.stats.lastWinner).toBe('M')
    expect(snap.stats.lastFlushMessages).toBe(3)
    expect(snap.stats.dropped).toBe(0)
  })

  it('leaves stage-2 mid queues unbounded (no Q₂)', () => {
    const eng = new SimulationEngine(
      { ...quiet, stage2: true, N: 1, T: 8, Q: 2, M: 1, S: 99, M2: 50, S2: 99 },
      { seed: 47 },
    )
    for (let i = 0; i < 8; i++) eng.ingest('pg0')
    const snap = eng.snapshot()
    expect(snap.shards[0].messages).toBe(0)
    expect(snap.midShards[0].messages).toBe(8)
    expect(snap.midShards[0].meterQ).toBe(0)
    expect(snap.stats.dropped).toBe(0)
    expect(snap.stats.rawViews).toBe(8)
    expect(snap.stats.dbUpserts).toBe(0)
    expect(snap.pendingViews).toBe(8)
  })

  it('keeps avg freshness and pending blind to dropped views', () => {
    const eng = new SimulationEngine(
      { ...quiet, N: 1, T: 8, Q: 1, M: 50, S: 5 },
      { seed: 48 },
    )
    const restore = holdRawFlush(eng)
    try {
      eng.ingest('pg0')
      eng.ingest('pg1')
      eng.ingest('pg2')
      const held = eng.snapshot()
      expect(held.stats.dropped).toBe(2)
      expect(held.pendingViews).toBe(1)
      expect(held.stats.committedViews).toBe(0)
      expect(held.stats.avgFreshness).toBe(0)
      expect(held.stats.rawViews).toBe(1)
    } finally {
      restore()
    }
  })
})
