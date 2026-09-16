import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SPEED,
  SPEED_STORAGE_KEY,
  parseStoredSpeed,
  readStoredSpeed,
  writeStoredSpeed,
} from './sessionStore.ts'

describe('parseStoredSpeed', () => {
  it('falls back to 25× when missing or junk', () => {
    expect(parseStoredSpeed(null)).toBe(DEFAULT_SPEED)
    expect(parseStoredSpeed('')).toBe(DEFAULT_SPEED)
    expect(parseStoredSpeed('fast')).toBe(DEFAULT_SPEED)
  })

  it('restores an exact allowed speed', () => {
    expect(parseStoredSpeed('1')).toBe(1)
    expect(parseStoredSpeed('100')).toBe(100)
    expect(parseStoredSpeed('400')).toBe(400)
  })

  it('clamps onto the allowed 1×…400× range', () => {
    expect(parseStoredSpeed('0')).toBe(1)
    expect(parseStoredSpeed('999')).toBe(400)
    expect(parseStoredSpeed('50')).toBe(25)
    expect(parseStoredSpeed('70')).toBe(100)
  })
})

describe('read/writeStoredSpeed', () => {
  it('round-trips through a namespaced key and never throws', () => {
    const mem = new Map<string, string>()
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v)
      },
    }
    expect(readStoredSpeed(storage)).toBe(DEFAULT_SPEED)
    writeStoredSpeed(storage, 100)
    expect(mem.get(SPEED_STORAGE_KEY)).toBe('100')
    expect(readStoredSpeed(storage)).toBe(100)
    writeStoredSpeed(storage, 999)
    expect(readStoredSpeed(storage)).toBe(400)
  })

  it('swallows storage failures', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(readStoredSpeed(broken)).toBe(DEFAULT_SPEED)
    expect(() => writeStoredSpeed(broken, 10)).not.toThrow()
  })
})
