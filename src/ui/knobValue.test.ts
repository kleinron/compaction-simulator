import { describe, expect, it } from 'vitest'
import { clampKnob, formatKnobNumber } from './knobValue.ts'

describe('clampKnob', () => {
  const N = { min: 1, max: 12, step: 1 }
  const S = { min: 0.5, max: 120, step: 0.5 }
  const V = { min: 10_000, max: 8_000_000, step: 10_000 }

  it('snaps onto the slider step and stays inside min/max', () => {
    expect(clampKnob(7.4, N)).toBe(7)
    expect(clampKnob(7.6, N)).toBe(8)
    expect(clampKnob(0, N)).toBe(1)
    expect(clampKnob(99, N)).toBe(12)
    expect(clampKnob(10.24, S)).toBe(10)
    expect(clampKnob(10.26, S)).toBe(10.5)
    expect(clampKnob(15_000, V)).toBe(20_000)
    expect(clampKnob(9_999_999, V)).toBe(8_000_000)
  })

  it('rejects non-finite input by returning min', () => {
    expect(clampKnob(Number.NaN, N)).toBe(1)
    expect(clampKnob(Number.POSITIVE_INFINITY, S)).toBe(0.5)
  })

  it('formats integers and half-seconds without extra noise', () => {
    expect(formatKnobNumber(30, 1)).toBe('30')
    expect(formatKnobNumber(10, 0.5)).toBe('10.0')
    expect(formatKnobNumber(1_000_000, 10_000)).toBe('1000000')
  })
})
