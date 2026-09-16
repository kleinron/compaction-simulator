import { arrivalRateLambda, expectedCompactionC, expectedUniqueKeys, shardSizeP } from './analytics.ts'
import { countsToPayload, hourPageKey } from './batch.ts'
import { DEFAULT_CONFIG } from './defaults.ts'
import { flushDue } from './flush.ts'
import { pageName, rawQueueName, shardIndex } from './hash.ts'
import { exponential, mulberry32, pickPageIndex } from './rng.ts'
import { floorToHourIso, simTimeToIso } from './time.ts'
import type { AggBlob, DbLeaf, FlushReason, SimConfig } from './types.ts'
import type { DbState } from './upsert.ts'
import { additiveUpsert, compactionC, dbTotalViews } from './upsert.ts'

export type EventKind = 'ingest' | 'timeout'

export type SimEvent = {
  time: number
  seq: number
  kind: EventKind
  shard: number
  generation: number
}

type ShardState = {
  generation: number
  openTime: number | null
  messages: number
  counts: Map<string, number>
  mReachedAt: number | null
  kReachedAt: number | null
  lastWinner: FlushReason | null
  lastFlushSimTime: number | null
}

export type ShardSnapshot = {
  index: number
  queueName: string
  messages: number
  distinctKeys: number
  openTime: number | null
  meterS: number
  meterK: number
  meterM: number
  lastWinner: FlushReason | null
  flushPulse: boolean
}

export type SimSnapshot = {
  simTime: number
  simIso: string
  config: SimConfig
  lambda: number
  P: number
  shards: ShardSnapshot[]
  aggQueue: AggBlob[]
  recentIngest: { page: string; shard: number; timestamp: string }[]
  recentUpserts: DbLeaf[]
  dbKeyCount: number
  dbTotalViews: number
  pendingViews: number
  stats: {
    rawViews: number
    dbUpserts: number
    aggPublishes: number
    C: number
    lastWinner: FlushReason | null
    lastFlushMessages: number
    lastFlushKeys: number
    wins: Record<FlushReason, number>
    expectedU: number
    expectedC_M_only: number
    messageRatio: number
  }
}

const MAX_EVENTS_PER_ADVANCE = 80_000
const AGG_KEEP = 10
const INGEST_KEEP = 12
const UPSERT_KEEP = 12
const PULSE_WINDOW = 0.45

function compareEvents(a: SimEvent, b: SimEvent): number {
  if (a.time !== b.time) return a.time - b.time
  if (a.kind !== b.kind) return a.kind === 'ingest' ? -1 : 1
  return a.seq - b.seq
}

class EventHeap {
  private readonly data: SimEvent[] = []

  get size(): number {
    return this.data.length
  }

  peek(): SimEvent | undefined {
    return this.data[0]
  }

  push(ev: SimEvent): void {
    this.data.push(ev)
    this.bubbleUp(this.data.length - 1)
  }

  pop(): SimEvent | undefined {
    const n = this.data.length
    if (n === 0) return undefined
    const top = this.data[0]
    const last = this.data.pop()!
    if (n > 1) {
      this.data[0] = last
      this.sink(0)
    }
    return top
  }

  private bubbleUp(i: number): void {
    const data = this.data
    while (i > 0) {
      const p = (i - 1) >> 1
      if (compareEvents(data[i], data[p]) >= 0) break
      const tmp = data[p]
      data[p] = data[i]
      data[i] = tmp
      i = p
    }
  }

  private sink(i: number): void {
    const data = this.data
    const n = data.length
    for (;;) {
      const l = i * 2 + 1
      const r = l + 1
      let smallest = i
      if (l < n && compareEvents(data[l], data[smallest]) < 0) smallest = l
      if (r < n && compareEvents(data[r], data[smallest]) < 0) smallest = r
      if (smallest === i) break
      const tmp = data[smallest]
      data[smallest] = data[i]
      data[i] = tmp
      i = smallest
    }
  }
}

function emptyShard(): ShardState {
  return {
    generation: 0,
    openTime: null,
    messages: 0,
    counts: new Map(),
    mReachedAt: null,
    kReachedAt: null,
    lastWinner: null,
    lastFlushSimTime: null,
  }
}

export class SimulationEngine {
  readonly config: SimConfig
  private simTime = 0
  private seq = 0
  private readonly rng: () => number
  private readonly events = new EventHeap()
  private readonly shards: ShardState[]
  private readonly db: DbState = new Map()
  private readonly aggQueue: AggBlob[] = []
  private readonly recentIngest: SimSnapshot['recentIngest'] = []
  private readonly recentUpserts: DbLeaf[] = []
  private rawViews = 0
  private dbUpserts = 0
  private aggPublishes = 0
  private lastWinner: FlushReason | null = null
  private lastFlushMessages = 0
  private lastFlushKeys = 0
  private readonly wins: Record<FlushReason, number> = { S: 0, K: 0, M: 0 }
  private blobId = 0

  constructor(config: SimConfig = DEFAULT_CONFIG, opts?: { seed?: number }) {
    this.config = normalizeConfig(config)
    this.rng = mulberry32(opts?.seed ?? 0xc0ffee)
    this.shards = Array.from({ length: this.config.N }, () => emptyShard())
    const lambda = arrivalRateLambda(this.config.V_day)
    if (lambda > 0) {
      this.events.push({
        time: exponential(this.rng, lambda),
        seq: this.seq++,
        kind: 'ingest',
        shard: -1,
        generation: 0,
      })
    }
  }

  get time(): number {
    return this.simTime
  }

  /** Inject a page view at the current sim time (tests / manual). */
  ingest(page: string): void {
    this.handlePageView(page, this.simTime)
  }

  advance(simDt: number): void {
    if (simDt <= 0) return
    this.runUntil(this.simTime + simDt)
  }

  runUntil(targetTime: number): void {
    let processed = 0
    while (processed < MAX_EVENTS_PER_ADVANCE) {
      const next = this.events.peek()
      if (!next || next.time > targetTime + 1e-9) break
      this.events.pop()
      this.simTime = next.time
      this.dispatch(next)
      processed += 1
    }
    this.simTime = Math.max(this.simTime, targetTime)
  }

  snapshot(): SimSnapshot {
    const { config } = this
    const P = shardSizeP(config.T, config.N)
    const lambda = arrivalRateLambda(config.V_day)
    const shards = this.shards.map((shard, index) => this.snapshotShard(shard, index))
    const pendingViews = shards.reduce((sum, shard) => sum + shard.messages, 0)
    return {
      simTime: this.simTime,
      simIso: simTimeToIso(this.simTime),
      config,
      lambda,
      P,
      shards,
      aggQueue: this.aggQueue.slice(-AGG_KEEP),
      recentIngest: this.recentIngest.slice(-INGEST_KEEP),
      recentUpserts: this.recentUpserts.slice(-UPSERT_KEEP),
      dbKeyCount: this.db.size,
      dbTotalViews: dbTotalViews(this.db),
      pendingViews,
      stats: {
        rawViews: this.rawViews,
        dbUpserts: this.dbUpserts,
        aggPublishes: this.aggPublishes,
        C: compactionC(this.rawViews, this.dbUpserts),
        lastWinner: this.lastWinner,
        lastFlushMessages: this.lastFlushMessages,
        lastFlushKeys: this.lastFlushKeys,
        wins: { ...this.wins },
        expectedU: expectedUniqueKeys(P, config.M),
        expectedC_M_only: expectedCompactionC(P, config.M),
        messageRatio:
          this.aggPublishes === 0 ? 0 : this.rawViews / this.aggPublishes,
      },
    }
  }

  private snapshotShard(shard: ShardState, index: number): ShardSnapshot {
    const { S, K, M } = this.config
    const open = shard.openTime !== null
    const elapsed = open ? Math.max(0, this.simTime - shard.openTime!) : 0
    return {
      index,
      queueName: rawQueueName(index),
      messages: shard.messages,
      distinctKeys: shard.counts.size,
      openTime: shard.openTime,
      meterS: open && S > 0 ? Math.min(1, elapsed / S) : 0,
      meterK: K > 0 ? Math.min(1, shard.counts.size / K) : 0,
      meterM: M > 0 ? Math.min(1, shard.messages / M) : 0,
      lastWinner: shard.lastWinner,
      flushPulse:
        shard.lastFlushSimTime !== null &&
        this.simTime - shard.lastFlushSimTime <= PULSE_WINDOW,
    }
  }

  private dispatch(ev: SimEvent): void {
    if (ev.kind === 'ingest') {
      const page = pageName(pickPageIndex(this.rng, this.config.T))
      this.handlePageView(page, ev.time)
      const lambda = arrivalRateLambda(this.config.V_day)
      if (lambda > 0) {
        this.events.push({
          time: ev.time + exponential(this.rng, lambda),
          seq: this.seq++,
          kind: 'ingest',
          shard: -1,
          generation: 0,
        })
      }
      return
    }
    const shard = this.shards[ev.shard]
    if (!shard || shard.generation !== ev.generation) return
    if (shard.openTime === null || shard.messages === 0) return
    const due = flushDue({
      openTime: shard.openTime,
      simTime: ev.time,
      S: this.config.S,
      mReachedAt: shard.mReachedAt,
      kReachedAt: shard.kReachedAt,
    })
    if (due) this.flushShard(ev.shard, due.reason, due.time)
  }

  private handlePageView(page: string, time: number): void {
    const timestamp = simTimeToIso(time)
    const hour = floorToHourIso(timestamp)
    const shardId = shardIndex(page, this.config.N)
    const shard = this.shards[shardId]
    if (shard.openTime === null) {
      shard.openTime = time
      this.events.push({
        time: time + this.config.S,
        seq: this.seq++,
        kind: 'timeout',
        shard: shardId,
        generation: shard.generation,
      })
    }
    const key = hourPageKey(hour, page)
    shard.counts.set(key, (shard.counts.get(key) ?? 0) + 1)
    shard.messages += 1
    this.rawViews += 1
    this.recentIngest.push({ page, shard: shardId, timestamp })
    if (this.recentIngest.length > INGEST_KEEP) this.recentIngest.shift()

    if (shard.messages >= this.config.M && shard.mReachedAt === null) {
      shard.mReachedAt = time
    }
    if (shard.counts.size >= this.config.K && shard.kReachedAt === null) {
      shard.kReachedAt = time
    }

    const due = flushDue({
      openTime: shard.openTime,
      simTime: time,
      S: this.config.S,
      mReachedAt: shard.mReachedAt,
      kReachedAt: shard.kReachedAt,
    })
    if (due) this.flushShard(shardId, due.reason, due.time)
  }

  private flushShard(shardId: number, winner: FlushReason, time: number): void {
    const shard = this.shards[shardId]
    if (shard.messages === 0 || shard.counts.size === 0) return
    const payload = countsToPayload(shard.counts)
    const distinctKeys = shard.counts.size
    const messages = shard.messages
    const blob: AggBlob = {
      id: ++this.blobId,
      shard: shardId,
      publishedAt: time,
      winner,
      messages,
      distinctKeys,
      payload,
    }
    this.aggQueue.push(blob)
    if (this.aggQueue.length > AGG_KEEP * 3) {
      this.aggQueue.splice(0, this.aggQueue.length - AGG_KEEP)
    }
    this.aggPublishes += 1
    const { upserts, leaves } = additiveUpsert(this.db, payload)
    this.dbUpserts += upserts
    for (const leaf of leaves) {
      this.recentUpserts.push(leaf)
      if (this.recentUpserts.length > UPSERT_KEEP) this.recentUpserts.shift()
    }
    this.lastWinner = winner
    this.lastFlushMessages = messages
    this.lastFlushKeys = distinctKeys
    this.wins[winner] += 1
    shard.lastWinner = winner
    shard.lastFlushSimTime = time

    shard.generation += 1
    shard.openTime = null
    shard.messages = 0
    shard.counts = new Map()
    shard.mReachedAt = null
    shard.kReachedAt = null
  }
}

export function normalizeConfig(input: SimConfig): SimConfig {
  return {
    T: Math.max(1, Math.round(input.T)),
    N: Math.max(1, Math.round(input.N)),
    M: Math.max(1, Math.round(input.M)),
    S: Math.max(0.05, input.S),
    K: Math.max(1, Math.round(input.K)),
    V_day: Math.max(0, input.V_day),
  }
}
