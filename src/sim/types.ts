export type FlushReason = 'S' | 'M'

export type SimConfig = {
  /** Distinct page catalog size. */
  T: number
  /** Number of raw shard queues. */
  N: number
  /** Flush when this many raw messages have been received. */
  M: number
  /** Flush timeout in sim-seconds since the batch opened. */
  S: number
  /** Ingest API calls per calendar day. λ = V_day / 86400. */
  V_day: number
}

export type PageView = {
  page: string
  timestamp: string
}

export type AggPayload = Record<string, Record<string, number>>

export type AggBlob = {
  id: number
  shard: number
  publishedAt: number
  winner: FlushReason
  messages: number
  distinctKeys: number
  payload: AggPayload
}

export type DbLeaf = {
  hour: string
  page: string
  count: number
}

export type FlushCandidate = {
  reason: FlushReason
  time: number
}
