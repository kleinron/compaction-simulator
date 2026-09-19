import { describe, expect, it } from 'vitest'
import { clampKnob, formatKnobNumber, formatVDayPretty } from './knobValue.ts'

describe('clampKnob', () => {
  const N = { min: 1, max: 100, step: 1 }
  const T = { min: 10, max: 10_000, step: 10 }
  const S = { min: 0.5, max: 120, step: 0.5 }
  const M = { min: 1, max: 5_000, step: 1 }
  const Q = { min: 1, max: 50_000, step: 1 }
  const V = { min: 10_000, max: 10_000_000_000, step: 10_000 }

  it('snaps onto the slider step and stays inside min/max', () => {
    expect(clampKnob(7.4, N)).toBe(7)
    expect(clampKnob(7.6, N)).toBe(8)
    expect(clampKnob(0, N)).toBe(1)
    expect(clampKnob(99, N)).toBe(99)
    expect(clampKnob(250, N)).toBe(100)
    expect(clampKnob(400, M)).toBe(400)
    expect(clampKnob(5_000, M)).toBe(5_000)
    expect(clampKnob(5_001, M)).toBe(5_000)
    expect(clampKnob(2_000, Q)).toBe(2_000)
    expect(clampKnob(50_001, Q)).toBe(50_000)
    expect(clampKnob(0, Q)).toBe(1)
    expect(clampKnob(10_000, T)).toBe(10_000)
    expect(clampKnob(50_000, T)).toBe(10_000)
    expect(clampKnob(10.24, S)).toBe(10)
    expect(clampKnob(10.26, S)).toBe(10.5)
    expect(clampKnob(15_000, V)).toBe(20_000)
    expect(clampKnob(100_000_000, V)).toBe(100_000_000)
    expect(clampKnob(10_000_000_000, V)).toBe(10_000_000_000)
    expect(clampKnob(50_000_000_000, V)).toBe(10_000_000_000)
  })

  it('rejects non-finite input by returning min', () => {
    expect(clampKnob(Number.NaN, N)).toBe(1)
    expect(clampKnob(Number.POSITIVE_INFINITY, S)).toBe(0.5)
  })

  it('formats integers and half-seconds without extra noise', () => {
    expect(formatKnobNumber(30, 1)).toBe('30')
    expect(formatKnobNumber(10, 0.5)).toBe('10.0')
    expect(formatKnobNumber(1_000_000, 10_000)).toBe('1000000')
    expect(formatKnobNumber(10_000_000_000, 10_000)).toBe('10000000000')
  })

  it('pretty-prints large V_day while the text box keeps the full integer', () => {
    expect(formatVDayPretty(10_000_000_000)).toBe('10.00B')
    expect(formatVDayPretty(100_000_000)).toBe('100.00M')
    expect(formatVDayPretty(1_000_000)).toBe('1.00M')
    expect(formatVDayPretty(50_000)).toBe('50k')
    expect(formatKnobNumber(10_000_000_000, 10_000)).toBe('10000000000')
  })
})
