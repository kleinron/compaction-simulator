import { describe, expect, it } from 'vitest'
import { hashPage, midQueueName, pageName, rawQueueName, shardIndex } from './hash.ts'

describe('hash sharding', () => {
  it('is deterministic for the same page', () => {
    expect(hashPage('home')).toBe(hashPage('home'))
    expect(shardIndex('checkout', 7)).toBe(shardIndex('checkout', 7))
  })

  it('maps i = abs(hash(page)) mod N into [0, N)', () => {
    const n = 5
    for (let i = 0; i < 40; i++) {
      const idx = shardIndex(pageName(i), n)
      expect(idx).toBeGreaterThanOrEqual(0)
      expect(idx).toBeLessThan(n)
      expect(idx).toBe(Math.abs(hashPage(pageName(i))) % n)
    }
  })

  it('names raw queues page_views_raw_<i>', () => {
    expect(rawQueueName(0)).toBe('page_views_raw_0')
    expect(rawQueueName(3)).toBe('page_views_raw_3')
  })

  it('names catalog pages pgK', () => {
    expect(pageName(0)).toBe('pg0')
    expect(pageName(99)).toBe('pg99')
  })

  it('names mid-agg queues page_views_mid_<i>', () => {
    expect(midQueueName(0)).toBe('page_views_mid_0')
    expect(midQueueName(3)).toBe('page_views_mid_3')
  })

  it('keeps a page on one shard as N stays fixed', () => {
    const page = 'pg42'
    const a = shardIndex(page, 4)
    for (let i = 0; i < 8; i++) {
      expect(shardIndex(page, 4)).toBe(a)
    }
  })
})
