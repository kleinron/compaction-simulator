import { describe, expect, it } from 'vitest'
import { earliestFlush, flushDue, rawCountFlushThreshold, rawQueueFull } from './flush.ts'

describe('raw queue cap helpers', () => {
  it('uses min(M, Q) as the raw count-flush threshold', () => {
    expect(rawCountFlushThreshold(400, 5_000)).toBe(400)
    expect(rawCountFlushThreshold(400, 80)).toBe(80)
    expect(rawCountFlushThreshold(10, 10)).toBe(10)
  })

  it('treats depth >= Q as full', () => {
    expect(rawQueueFull(0, 3)).toBe(false)
    expect(rawQueueFull(2, 3)).toBe(false)
    expect(rawQueueFull(3, 3)).toBe(true)
    expect(rawQueueFull(4, 3)).toBe(true)
  })
})

describe('flush earliest-of-two (S, M)', () => {
  it('picks the smallest sim timestamp', () => {
    const winner = earliestFlush([
      { reason: 'S', time: 12 },
      { reason: 'M', time: 9 },
    ])
    expect(winner).toEqual({ reason: 'M', time: 9 })
  })

  it('breaks ties M > S', () => {
    expect(
      earliestFlush([
        { reason: 'S', time: 5 },
        { reason: 'M', time: 5 },
      ])?.reason,
    ).toBe('M')
  })

  it('returns null when nothing is due', () => {
    expect(earliestFlush([])).toBeNull()
    expect(
      flushDue({
        openTime: 0,
        simTime: 3,
        S: 10,
        mReachedAt: null,
      }),
    ).toBeNull()
  })

  it('fires S when the timeout elapses first', () => {
    const due = flushDue({
      openTime: 2,
      simTime: 12,
      S: 10,
      mReachedAt: 20,
    })
    expect(due).toEqual({ reason: 'S', time: 12 })
  })

  it('fires M when the message threshold is reached first', () => {
    const due = flushDue({
      openTime: 0,
      simTime: 4,
      S: 10,
      mReachedAt: 4,
    })
    expect(due).toEqual({ reason: 'M', time: 4 })
  })

  it('prefers M when S and M are due at the same sim time', () => {
    const due = flushDue({
      openTime: 0,
      simTime: 5,
      S: 5,
      mReachedAt: 5,
    })
    expect(due).toEqual({ reason: 'M', time: 5 })
  })
})
