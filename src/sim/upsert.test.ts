import { describe, expect, it } from 'vitest'
import { compactionC } from './upsert.ts'
import { additiveUpsert, dbTotalViews } from './upsert.ts'

describe('additive upserts', () => {
  it('performs one upsert per (hour, page) leaf and adds counts', () => {
    const db = new Map<string, number>()
    const first = additiveUpsert(db, {
      '2026-08-20T18:00:00Z': { a: 10 },
    })
    expect(first.upserts).toBe(1)
    expect(db.get('2026-08-20T18:00:00Z|a')).toBe(10)

    const second = additiveUpsert(db, {
      '2026-08-20T18:00:00Z': { a: 5, c: 21 },
    })
    expect(second.upserts).toBe(2)
    expect(db.get('2026-08-20T18:00:00Z|a')).toBe(15)
    expect(db.get('2026-08-20T18:00:00Z|c')).toBe(21)
    expect(dbTotalViews(db)).toBe(36)
    expect(compactionC(36, 3)).toBe(12)
  })

  it('does not treat a repeated leaf across blobs as one upsert', () => {
    const db = new Map<string, number>()
    additiveUpsert(db, { '2026-08-20T18:00:00Z': { home: 4 } })
    additiveUpsert(db, { '2026-08-20T18:00:00Z': { home: 7 } })
    expect(db.get('2026-08-20T18:00:00Z|home')).toBe(11)
    expect(compactionC(11, 2)).toBeCloseTo(5.5)
  })

  it('returns C = 0 before any upsert', () => {
    expect(compactionC(12, 0)).toBe(0)
  })
})
