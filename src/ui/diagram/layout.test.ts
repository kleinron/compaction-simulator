import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../../sim/defaults.ts'
import { layout, MAX_COLLECTION, STICKY_CAPTION } from './layout.ts'
import type { DiagramNode } from './types.ts'

const base = { N: DEFAULT_CONFIG.N, stage2: DEFAULT_CONFIG.stage2 }

function byKind(nodes: DiagramNode[], kind: DiagramNode['kind']) {
  return nodes.filter((n) => n.kind === kind)
}

function collection(nodes: DiagramNode[], id: 'raw' | 'mid') {
  return nodes.filter((n) => n.collection === id)
}

describe('layout()', () => {
  it('uses MAX_COLLECTION = 6 by default', () => {
    expect(MAX_COLLECTION).toBe(6)
  })

  it('stage2 off, N ≤ 6: N raw peers, no mid, no stack', () => {
    const m = layout({ N: 4, stage2: false })
    expect(m.stage2).toBe(false)
    expect(m.rawCollapsed).toBe(false)
    expect(m.midCollapsed).toBe(false)
    expect(collection(m.nodes, 'raw')).toHaveLength(4)
    expect(collection(m.nodes, 'raw').every((n) => n.kind === 'peer' && !n.collapsed)).toBe(true)
    expect(collection(m.nodes, 'mid')).toHaveLength(0)
    expect(byKind(m.nodes, 'stack')).toHaveLength(0)
    expect(m.nodes.filter((n) => n.id.includes('ellipsis') || n.label.includes('…'))).toHaveLength(0)
    expect(m.nodes.map((n) => n.index).filter((i) => i !== undefined).sort()).toEqual([0, 1, 2, 3])
  })

  it('stage2 off, N > 6: one raw stack glyph, not six fake slots', () => {
    const m = layout({ N: 25, stage2: false })
    expect(m.rawCollapsed).toBe(true)
    expect(m.midCollapsed).toBe(false)
    const raw = collection(m.nodes, 'raw')
    expect(raw).toHaveLength(1)
    expect(raw[0].kind).toBe('stack')
    expect(raw[0].collapsed).toBe(true)
    expect(raw[0].count).toBe(25)
    expect(raw[0].layers).toBe(3)
    expect(raw[0].label).toBe('raw shards')
    expect(raw[0].layers).toBeGreaterThanOrEqual(2)
    expect(raw[0].layers).toBeLessThanOrEqual(3)
    expect(byKind(m.nodes, 'peer')).toHaveLength(0)
    expect(collection(m.nodes, 'mid')).toHaveLength(0)
    expect(m.nodes.some((n) => n.id.includes('ellipsis'))).toBe(false)
  })

  it('stage2 on, N ≤ 6: N raw peers and N mid peers', () => {
    const m = layout({ N: 6, stage2: true })
    expect(m.rawCollapsed).toBe(false)
    expect(m.midCollapsed).toBe(false)
    expect(collection(m.nodes, 'raw')).toHaveLength(6)
    expect(collection(m.nodes, 'mid')).toHaveLength(6)
    expect(byKind(m.nodes, 'stack')).toHaveLength(0)
    expect(m.edges.some((e) => e.from === 'raw-2' && e.to === 'mid-2')).toBe(true)
  })

  it('stage2 on, N > 6: mid collapsed to a stack (same rule as raw)', () => {
    const m = layout({ ...base, N: 25, stage2: true })
    expect(m.rawCollapsed).toBe(true)
    expect(m.midCollapsed).toBe(true)
    const mid = collection(m.nodes, 'mid')
    expect(mid).toHaveLength(1)
    expect(mid[0].kind).toBe('stack')
    expect(mid[0].id).toBe('mid-stack')
    expect(mid[0].count).toBe(25)
    expect(mid[0].collapsed).toBe(true)
    expect(mid[0].label).toBe('mid-agg')
    expect(collection(m.nodes, 'raw')).toHaveLength(1)
    expect(m.edges.some((e) => e.from === 'raw-stack' && e.to === 'mid-stack')).toBe(true)
    expect(m.edges.some((e) => e.from === 'mid-stack' && e.to === 'agg')).toBe(true)
  })

  it('always includes the SPOF path page_views_agg → DB', () => {
    const variants = [
      layout({ N: 1, stage2: false }),
      layout({ N: 6, stage2: false }),
      layout({ N: 7, stage2: false }),
      layout({ N: 4, stage2: true }),
      layout({ N: 25, stage2: true }),
    ]
    for (const m of variants) {
      const agg = m.nodes.find((n) => n.id === 'agg')
      const db = m.nodes.find((n) => n.id === 'db')
      expect(agg).toMatchObject({ kind: 'agg', label: 'page_views_agg', spoF: true })
      expect(db).toMatchObject({ kind: 'db', spoF: true })
      expect(m.edges.some((e) => e.from === 'agg' && e.to === 'db')).toBe(true)
      expect(agg!.x).toBeLessThan(db!.x)
    }
  })

  it('places columns LTR: ingest → raw → (mid) → agg → db', () => {
    const off = layout({ N: 3, stage2: false })
    const xs = Object.fromEntries(off.nodes.map((n) => [n.id, n.x]))
    expect(xs.ingest).toBeLessThan(xs['raw-0'])
    expect(xs['raw-0']).toBeLessThan(xs.agg)
    expect(xs.agg).toBeLessThan(xs.db)

    const on = layout({ N: 3, stage2: true })
    const ys = Object.fromEntries(on.nodes.map((n) => [n.id, n.x]))
    expect(ys.ingest).toBeLessThan(ys['raw-0'])
    expect(ys['raw-0']).toBeLessThan(ys['mid-0'])
    expect(ys['mid-0']).toBeLessThan(ys.agg)
    expect(ys.agg).toBeLessThan(ys.db)
  })

  it('keeps the sticky-hash caption on the same skeleton', () => {
    const m = layout({ N: 8, stage2: true })
    expect(m.caption).toBe(STICKY_CAPTION)
    expect(m.caption).toBe('page → one shard')
  })

  it('collapses at N = MAX_COLLECTION + 1 and not at the max itself', () => {
    expect(layout({ N: MAX_COLLECTION, stage2: true }).rawCollapsed).toBe(false)
    expect(layout({ N: MAX_COLLECTION + 1, stage2: true }).rawCollapsed).toBe(true)
    expect(layout({ N: MAX_COLLECTION + 1, stage2: true }).midCollapsed).toBe(true)
  })
})
