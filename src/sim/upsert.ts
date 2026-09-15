import { hourPageKey } from './batch.ts'
import type { AggPayload, DbLeaf } from './types.ts'

export type DbState = Map<string, number>

/** One additive upsert per (hour, page) leaf in the payload. */
export function additiveUpsert(
  db: DbState,
  payload: AggPayload,
): { upserts: number; leaves: DbLeaf[] } {
  let upserts = 0
  const leaves: DbLeaf[] = []
  for (const [hour, pages] of Object.entries(payload)) {
    for (const [page, add] of Object.entries(pages)) {
      const key = hourPageKey(hour, page)
      const next = (db.get(key) ?? 0) + add
      db.set(key, next)
      upserts += 1
      leaves.push({ hour, page, count: next })
    }
  }
  return { upserts, leaves }
}

/** Hero metric C = raw_views / db_upserts. Zero until the first upsert. */
export function compactionC(rawViews: number, dbUpserts: number): number {
  if (dbUpserts <= 0) return 0
  return rawViews / dbUpserts
}

export function dbTotalViews(db: ReadonlyMap<string, number>): number {
  let sum = 0
  for (const v of db.values()) sum += v
  return sum
}
