import { arrivalRateLambda, expectedCompactionC, expectedUniqueKeys, shardSizeP } from './analytics.ts'
import { countsToPayload, countsTotal, hourPageKey, mergePayloadIntoCounts } from './batch.ts'
import { CONFIG_LIMITS, DEFAULT_CONFIG } from './defaults.ts'
import { flushDue, rawCountFlushThreshold, rawQueueFull } from './flush.ts'
import { midQueueName, pageName, rawQueueName, shardIndex } from './hash.ts'
import { jitteredTimeout } from './jitter.ts'
import { exponential, mulberry32, pickPageIndex } from './rng.ts'
import { floorToHourIso, simTimeToIso } from './time.ts'
import type { AggBlob, AggPayload, DbLeaf, FlushReason, SimConfig } from './types.ts'
import type { DbState } from './upsert.ts'
import { additiveUpsert, compactionC, dbTotalViews } from './upsert.ts'

export type EventKind = 'ingest' | 'timeout' | 'timeout2'

export type SimEvent = {
  time: number
  seq: number
  kind: EventKind
  shard: number
  generation: number
}

type BatchState = {
  generation: number
  openTime: number | null
  /** Sampled (or exact) timeout length in sim-seconds for this open batch. */
  timeoutS: number
  messages: number
  counts: Map<string, number>
  ingestTimes: number[]
  mReachedAt: number | null
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
  meterM: number
  /** Raw depth / Q. Always 0 on mid shards (no Q₂). */
  meterQ: number
  lastWinner: FlushReason | null
  flushPulse: boolean
  unit: 'msgs' | 'blobs'
}

export type SimSnapshot = {
  simTime: number
  simIso: string
  config: SimConfig
  lambda: number
  P: number
  shards: ShardSnapshot[]
  midShards: ShardSnapshot[]
  aggQueue: AggBlob[]
  recentIngest: { page: string; shard: number; timestamp: string }[]
  recentUpserts: DbLeaf[]
  dbKeyCount: number
  dbTotalViews: number
  pendingViews: number
  stats: {
    rawViews: number
    dropped: number
    dbUpserts: number
    aggPublishes: number
    C: number
    lastWinner: FlushReason | null
    lastFlushStage: 1 | 2 | null
    lastFlushMessages: number
    lastFlushKeys: number
    wins: Record<FlushReason, number>
    midWins: Record<FlushReason, number>
    expectedU: number
    expectedC_M_only: number
    messageRatio: number
    avgFreshness: number
    committedViews: number
  }
}

const MAX_EVENTS_PER_ADVANCE = 80_000
const AGG_KEEP = 10
const INGEST_KEEP = 12
const UPSERT_KEEP = 12
const PULSE_WINDOW = 0.45
const KIND_ORDER: Record<EventKind, number> = { ingest: 0, timeout: 1, timeout2: 2 }

function compareEvents(a: SimEvent, b: SimEvent): number {
  if (a.time !== b.time) return a.time - b.time
  if (a.kind !== b.kind) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
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

function emptyBatch(): BatchState {
  return {
    generation: 0,
    openTime: null,
    timeoutS: 0,
    messages: 0,
    counts: new Map(),
    ingestTimes: [],
    mReachedAt: null,
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
  private readonly shards: BatchState[]
  private readonly midShards: BatchState[]
  private readonly db: DbState = new Map()
  private readonly aggQueue: AggBlob[] = []
  private readonly recentIngest: SimSnapshot['recentIngest'] = []
  private readonly recentUpserts: DbLeaf[] = []
  private rawViews = 0
  private dropped = 0
  private dbUpserts = 0
  private aggPublishes = 0
  private lastWinner: FlushReason | null = null
  private lastFlushStage: 1 | 2 | null = null
  private lastFlushMessages = 0
  private lastFlushKeys = 0
  private readonly wins: Record<FlushReason, number> = { S: 0, M: 0 }
  private readonly midWins: Record<FlushReason, number> = { S: 0, M: 0 }
  private blobId = 0
  private freshnessSum = 0
  private freshnessCount = 0

  constructor(config: SimConfig = DEFAULT_CONFIG, opts?: { seed?: number }) {
    this.config = normalizeConfig(config)
    this.rng = mulberry32(opts?.seed ?? 0xc0ffee)
    this.shards = Array.from({ length: this.config.N }, () => emptyBatch())
    this.midShards = Array.from({ length: this.config.N }, () => emptyBatch())
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

  advance(simDt: number, maxEvents = MAX_EVENTS_PER_ADVANCE): void {
    if (simDt <= 0) return
    this.runUntil(this.simTime + simDt, maxEvents)
  }

  runUntil(targetTime: number, maxEvents = MAX_EVENTS_PER_ADVANCE): void {
    let processed = 0
    let capped = false
    while (processed < maxEvents) {
      const next = this.events.peek()
      if (!next || next.time > targetTime + 1e-9) break
      this.events.pop()
      this.simTime = next.time
      this.dispatch(next)
      processed += 1
      if (processed >= maxEvents) capped = true
    }
    if (!capped) this.simTime = Math.max(this.simTime, targetTime)
  }

  snapshot(): SimSnapshot {
    const { config } = this
    const P = shardSizeP(config.T, config.N)
    const lambda = arrivalRateLambda(config.V_day)
    const shards = this.shards.map((shard, index) =>
      this.snapshotBatch(shard, index, rawQueueName(index), config.S, config.M, 'msgs', config.Q),
    )
    const midShards = config.stage2
      ? this.midShards.map((shard, index) =>
          this.snapshotBatch(shard, index, midQueueName(index), config.S2, config.M2, 'blobs'),
        )
      : []
    const pendingStage1 = shards.reduce((sum, shard) => sum + shard.messages, 0)
    const pendingMid = config.stage2
      ? this.midShards.reduce((sum, shard) => sum + countsTotal(shard.counts), 0)
      : 0
    return {
      simTime: this.simTime,
      simIso: simTimeToIso(this.simTime),
      config,
      lambda,
      P,
      shards,
      midShards,
      aggQueue: this.aggQueue.slice(-AGG_KEEP),
      recentIngest: this.recentIngest.slice(-INGEST_KEEP),
      recentUpserts: this.recentUpserts.slice(-UPSERT_KEEP),
      dbKeyCount: this.db.size,
      dbTotalViews: dbTotalViews(this.db),
      pendingViews: pendingStage1 + pendingMid,
      stats: {
        rawViews: this.rawViews,
        dropped: this.dropped,
        dbUpserts: this.dbUpserts,
        aggPublishes: this.aggPublishes,
        C: compactionC(this.rawViews, this.dbUpserts),
        lastWinner: this.lastWinner,
        lastFlushStage: this.lastFlushStage,
        lastFlushMessages: this.lastFlushMessages,
        lastFlushKeys: this.lastFlushKeys,
        wins: { ...this.wins },
        midWins: { ...this.midWins },
        expectedU: expectedUniqueKeys(P, rawCountFlushThreshold(config.M, config.Q)),
        expectedC_M_only: expectedCompactionC(P, rawCountFlushThreshold(config.M, config.Q)),
        messageRatio:
          this.aggPublishes === 0 ? 0 : this.rawViews / this.aggPublishes,
        avgFreshness:
          this.freshnessCount === 0 ? 0 : this.freshnessSum / this.freshnessCount,
        committedViews: this.freshnessCount,
      },
    }
  }

  private snapshotBatch(
    shard: BatchState,
    index: number,
    queueName: string,
    S: number,
    M: number,
    unit: ShardSnapshot['unit'],
    Q?: number,
  ): ShardSnapshot {
    const open = shard.openTime !== null
    const elapsed = open ? Math.max(0, this.simTime - shard.openTime!) : 0
    const timeoutS = open && shard.timeoutS > 0 ? shard.timeoutS : S
    return {
      index,
      queueName,
      messages: shard.messages,
      distinctKeys: shard.counts.size,
      openTime: shard.openTime,
      meterS: open && timeoutS > 0 ? Math.min(1, elapsed / timeoutS) : 0,
      meterM: M > 0 ? Math.min(1, shard.messages / M) : 0,
      meterQ: Q && Q > 0 ? Math.min(1, shard.messages / Q) : 0,
      lastWinner: shard.lastWinner,
      flushPulse:
        shard.lastFlushSimTime !== null &&
        this.simTime - shard.lastFlushSimTime <= PULSE_WINDOW,
      unit,
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
    if (ev.kind === 'timeout2') {
      const mid = this.midShards[ev.shard]
      if (!mid || mid.generation !== ev.generation) return
      if (mid.openTime === null || mid.messages === 0) return
      const due = flushDue({
        openTime: mid.openTime,
        simTime: ev.time,
        S: mid.timeoutS,
        mReachedAt: mid.mReachedAt,
      })
      if (due) this.flushMid(ev.shard, due.reason, due.time)
      return
    }
    const shard = this.shards[ev.shard]
    if (!shard || shard.generation !== ev.generation) return
    if (shard.openTime === null || shard.messages === 0) return
    const due = flushDue({
      openTime: shard.openTime,
      simTime: ev.time,
      S: shard.timeoutS,
      mReachedAt: shard.mReachedAt,
    })
    if (due) this.flushRaw(ev.shard, due.reason, due.time)
  }

  private handlePageView(page: string, time: number): void {
    const shardId = shardIndex(page, this.config.N)
    const shard = this.shards[shardId]
    if (rawQueueFull(shard.messages, this.config.Q)) {
      this.dropped += 1
      return
    }
    const timestamp = simTimeToIso(time)
    const hour = floorToHourIso(timestamp)
    if (shard.openTime === null) {
      shard.openTime = time
      shard.timeoutS = jitteredTimeout(this.config.S, this.config.timeoutJitter, this.rng)
      this.events.push({
        time: time + shard.timeoutS,
        seq: this.seq++,
        kind: 'timeout',
        shard: shardId,
        generation: shard.generation,
      })
    }
    const key = hourPageKey(hour, page)
    shard.counts.set(key, (shard.counts.get(key) ?? 0) + 1)
    shard.ingestTimes.push(time)
    shard.messages += 1
    this.rawViews += 1
    this.recentIngest.push({ page, shard: shardId, timestamp })
    if (this.recentIngest.length > INGEST_KEEP) this.recentIngest.shift()

    const countFlush = rawCountFlushThreshold(this.config.M, this.config.Q)
    if (shard.messages >= countFlush && shard.mReachedAt === null) {
      shard.mReachedAt = time
    }

    const due = flushDue({
      openTime: shard.openTime,
      simTime: time,
      S: shard.timeoutS,
      mReachedAt: shard.mReachedAt,
    })
    if (due) this.flushRaw(shardId, due.reason, due.time)
  }

  private flushRaw(shardId: number, winner: FlushReason, time: number): void {
    const shard = this.shards[shardId]
    if (shard.messages === 0 || shard.counts.size === 0) return
    const payload = countsToPayload(shard.counts)
    const distinctKeys = shard.counts.size
    const messages = shard.messages
    const ingestTimes = shard.ingestTimes
    this.wins[winner] += 1
    shard.lastWinner = winner
    shard.lastFlushSimTime = time
    shard.generation += 1
    shard.openTime = null
    shard.messages = 0
    shard.counts = new Map()
    shard.ingestTimes = []
    shard.mReachedAt = null
    shard.timeoutS = 0

    if (this.config.stage2) {
      this.ingestMidBlob(shardId, payload, ingestTimes, time)
      return
    }
    this.publishAgg({
      shard: shardId,
      winner,
      messages,
      distinctKeys,
      payload,
      stage: 1,
      sourceBlobs: 1,
      publishedAt: time,
      ingestTimes,
    })
  }

  private ingestMidBlob(
    shardId: number,
    payload: AggPayload,
    ingestTimes: number[],
    time: number,
  ): void {
    const mid = this.midShards[shardId]
    if (mid.openTime === null) {
      mid.openTime = time
      mid.timeoutS = jitteredTimeout(this.config.S2, this.config.timeoutJitter, this.rng)
      this.events.push({
        time: time + mid.timeoutS,
        seq: this.seq++,
        kind: 'timeout2',
        shard: shardId,
        generation: mid.generation,
      })
    }
    mergePayloadIntoCounts(mid.counts, payload)
    mid.ingestTimes.push(...ingestTimes)
    mid.messages += 1
    if (mid.messages >= this.config.M2 && mid.mReachedAt === null) {
      mid.mReachedAt = time
    }
    const due = flushDue({
      openTime: mid.openTime,
      simTime: time,
      S: mid.timeoutS,
      mReachedAt: mid.mReachedAt,
    })
    if (due) this.flushMid(shardId, due.reason, due.time)
  }

  private flushMid(shardId: number, winner: FlushReason, time: number): void {
    const mid = this.midShards[shardId]
    if (mid.messages === 0 || mid.counts.size === 0) return
    const payload = countsToPayload(mid.counts)
    const distinctKeys = mid.counts.size
    const sourceBlobs = mid.messages
    const messages = countsTotal(mid.counts)
    const ingestTimes = mid.ingestTimes
    this.midWins[winner] += 1
    mid.lastWinner = winner
    mid.lastFlushSimTime = time
    mid.generation += 1
    mid.openTime = null
    mid.messages = 0
    mid.counts = new Map()
    mid.ingestTimes = []
    mid.mReachedAt = null
    mid.timeoutS = 0
    this.publishAgg({
      shard: shardId,
      winner,
      messages,
      distinctKeys,
      payload,
      stage: 2,
      sourceBlobs,
      publishedAt: time,
      ingestTimes,
    })
  }

  private publishAgg(args: {
    shard: number
    winner: FlushReason
    messages: number
    distinctKeys: number
    payload: AggPayload
    stage: 1 | 2
    sourceBlobs: number
    publishedAt: number
    ingestTimes: readonly number[]
  }): void {
    const blob: AggBlob = {
      id: ++this.blobId,
      shard: args.shard,
      publishedAt: args.publishedAt,
      winner: args.winner,
      messages: args.messages,
      distinctKeys: args.distinctKeys,
      payload: args.payload,
      stage: args.stage,
      sourceBlobs: args.sourceBlobs,
    }
    this.aggQueue.push(blob)
    if (this.aggQueue.length > AGG_KEEP * 3) {
      this.aggQueue.splice(0, this.aggQueue.length - AGG_KEEP)
    }
    this.aggPublishes += 1
    const { upserts, leaves } = additiveUpsert(this.db, args.payload)
    this.dbUpserts += upserts
    for (const leaf of leaves) {
      this.recentUpserts.push(leaf)
      if (this.recentUpserts.length > UPSERT_KEEP) this.recentUpserts.shift()
    }
    this.lastWinner = args.winner
    this.lastFlushStage = args.stage
    this.lastFlushMessages = args.messages
    this.lastFlushKeys = args.distinctKeys
    for (const ingestedAt of args.ingestTimes) {
      this.freshnessSum += args.publishedAt - ingestedAt
      this.freshnessCount += 1
    }
  }
}

export function normalizeConfig(input: SimConfig): SimConfig {
  return {
    T: clampInt(input.T, CONFIG_LIMITS.T.min, CONFIG_LIMITS.T.max),
    N: clampInt(input.N, CONFIG_LIMITS.N.min, CONFIG_LIMITS.N.max),
    M: clampInt(input.M, CONFIG_LIMITS.M.min, CONFIG_LIMITS.M.max),
    Q: clampInt(input.Q ?? DEFAULT_CONFIG.Q, CONFIG_LIMITS.Q.min, CONFIG_LIMITS.Q.max),
    S: Math.max(CONFIG_LIMITS.S.min, input.S),
    V_day: clampInt(input.V_day, CONFIG_LIMITS.V_day.min, CONFIG_LIMITS.V_day.max),
    stage2: Boolean(input.stage2),
    S2: Math.max(CONFIG_LIMITS.S2.min, input.S2 ?? DEFAULT_CONFIG.S2),
    M2: Math.max(1, Math.round(input.M2 ?? DEFAULT_CONFIG.M2)),
    timeoutJitter: Boolean(input.timeoutJitter),
  }
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}
