import { describe, expect, it } from 'vitest'
import { earliestFlush, flushDue } from './flush.ts'

describe('flush earliest-of-three (S, K, M)', () => {
  it('picks the smallest sim timestamp', () => {
    const winner = earliestFlush([
      { reason: 'S', time: 12 },
      { reason: 'K', time: 9 },
      { reason: 'M', time: 15 },
    ])
    expect(winner).toEqual({ reason: 'K', time: 9 })
  })

  it('breaks ties M > K > S', () => {
    expect(
      earliestFlush([
        { reason: 'S', time: 5 },
        { reason: 'K', time: 5 },
        { reason: 'M', time: 5 },
      ])?.reason,
    ).toBe('M')
    expect(
      earliestFlush([
        { reason: 'S', time: 5 },
        { reason: 'K', time: 5 },
      ])?.reason,
    ).toBe('K')
  })

  it('returns null when nothing is due', () => {
    expect(earliestFlush([])).toBeNull()
    expect(
      flushDue({
        openTime: 0,
        simTime: 3,
        S: 10,
        mReachedAt: null,
        kReachedAt: null,
      }),
    ).toBeNull()
  })

  it('fires S when the timeout elapses first', () => {
    const due = flushDue({
      openTime: 2,
      simTime: 12,
      S: 10,
      mReachedAt: 20,
      kReachedAt: 18,
    })
    expect(due).toEqual({ reason: 'S', time: 12 })
  })

  it('fires M when the message threshold is reached first', () => {
    const due = flushDue({
      openTime: 0,
      simTime: 4,
      S: 10,
      mReachedAt: 4,
      kReachedAt: null,
    })
    expect(due).toEqual({ reason: 'M', time: 4 })
  })

  it('fires K when distinct keys hit first', () => {
    const due = flushDue({
      openTime: 0,
      simTime: 3.2,
      S: 30,
      mReachedAt: null,
      kReachedAt: 3.2,
    })
    expect(due).toEqual({ reason: 'K', time: 3.2 })
  })
})
