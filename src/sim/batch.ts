import type { AggPayload } from './types.ts'

export function hourPageKey(hour: string, page: string): string {
  return `${hour}|${page}`
}

export function parseHourPageKey(key: string): { hour: string; page: string } {
  const split = key.indexOf('|')
  if (split < 0) throw new Error(`invalid hour-page key: ${key}`)
  return { hour: key.slice(0, split), page: key.slice(split + 1) }
}

export function countDistinctKeys(payload: AggPayload): number {
  let n = 0
  for (const pages of Object.values(payload)) {
    n += Object.keys(pages).length
  }
  return n
}

export function mergeView(payload: AggPayload, hour: string, page: string): void {
  const bucket = payload[hour] ?? (payload[hour] = {})
  bucket[page] = (bucket[page] ?? 0) + 1
}

export function countsToPayload(counts: ReadonlyMap<string, number>): AggPayload {
  const payload: AggPayload = {}
  for (const [key, count] of counts) {
    const { hour, page } = parseHourPageKey(key)
    const bucket = payload[hour] ?? (payload[hour] = {})
    bucket[page] = (bucket[page] ?? 0) + count
  }
  return payload
}

export function clonePayload(payload: AggPayload): AggPayload {
  const out: AggPayload = {}
  for (const [hour, pages] of Object.entries(payload)) {
    out[hour] = { ...pages }
  }
  return out
}

export function payloadRawViews(payload: AggPayload): number {
  let n = 0
  for (const pages of Object.values(payload)) {
    for (const count of Object.values(pages)) n += count
  }
  return n
}

export function mergePayloadIntoCounts(
  counts: Map<string, number>,
  payload: AggPayload,
): void {
  for (const [hour, pages] of Object.entries(payload)) {
    for (const [page, add] of Object.entries(pages)) {
      const key = hourPageKey(hour, page)
      counts.set(key, (counts.get(key) ?? 0) + add)
    }
  }
}

export function countsTotal(counts: ReadonlyMap<string, number>): number {
  let n = 0
  for (const v of counts.values()) n += v
  return n
}
