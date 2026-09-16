import { describe, expect, it } from 'vitest'
import {
  RollingTracker,
  compactionCW,
  meanCW,
  rollingSeries,
  windowSeconds,
} from './rolling.ts'

describe('windowSeconds', () => {
  it('clamps 15 × speed into [30, 600] sim-seconds', () => {
    expect(windowSeconds(1)).toBe(30)
    expect(windowSeconds(10)).toBe(150)
    expect(windowSeconds(25)).toBe(375)
    expect(windowSeconds(100)).toBe(600)
    expect(windowSeconds(400)).toBe(600)
    expect(windowSeconds(0)).toBe(30)
    expect(windowSeconds(Number.NaN)).toBe(30)
  })
})

describe('compactionCW', () => {
  it('is Δraw / Δupserts', () => {
    expect(compactionCW(10, 2)).toBe(5)
    expect(compactionCW(30, 10)).toBe(3)
  })

  it('is 0 when the window has no upserts', () => {
    expect(compactionCW(12, 0)).toBe(0)
    expect(compactionCW(12, -1)).toBe(0)
    expect(compactionCW(0, 0)).toBe(0)
  })
})

describe('rollingSeries', () => {
  it('returns 0 C_W while upserts stay flat', () => {
    const samples = [
      { simTime: 0, rawViews: 0, dbUpserts: 0 },
      { simTime: 5, rawViews: 8, dbUpserts: 0 },
      { simTime: 10, rawViews: 20, dbUpserts: 0 },
    ]
    const points = rollingSeries(samples, 10, 10)
    expect(points.every((p) => p.cW === 0)).toBe(true)
    expect(meanCW(points)).toBe(0)
  })

  it('uses totals W sim-seconds earlier as the baseline', () => {
    const samples = [
      { simTime: 0, rawViews: 0, dbUpserts: 0 },
      { simTime: 10, rawViews: 100, dbUpserts: 10 },
      { simTime: 20, rawViews: 200, dbUpserts: 20 },
      { simTime: 30, rawViews: 260, dbUpserts: 40 },
    ]
    const points = rollingSeries(samples, 30, 10)
    const at20 = points.find((p) => p.t === 20)
    const at30 = points.find((p) => p.t === 30)
    expect(at20?.cW).toBe(10)
    expect(at30?.cW).toBeCloseTo(60 / 20)
  })

  it('averages C_W samples currently in the window', () => {
    const points = [
      { t: 1, cW: 2 },
      { t: 2, cW: 4 },
      { t: 3, cW: 6 },
    ]
    expect(meanCW(points)).toBe(4)
    expect(meanCW([])).toBe(0)
  })
})

describe('RollingTracker', () => {
  it('rebuilds the view when W changes without losing samples', () => {
    const tr = new RollingTracker()
    tr.push({ simTime: 0, rawViews: 0, dbUpserts: 0 })
    tr.push({ simTime: 40, rawViews: 80, dbUpserts: 8 })
    tr.push({ simTime: 80, rawViews: 160, dbUpserts: 16 })
    const wide = tr.view(60, 80)
    const tight = tr.view(30, 80)
    expect(wide.W).toBe(60)
    expect(tight.W).toBe(30)
    expect(tight.points.length).toBeGreaterThan(0)
    expect(tight.avg).toBeGreaterThan(0)
  })
})
