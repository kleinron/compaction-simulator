import { midQueueName, rawQueueName } from '../../sim/hash.ts'
import type { DiagramEdge, DiagramModel, DiagramNode } from './types.ts'

/** Collapse a collection of N peers into a stack glyph above this count. */
export const MAX_COLLECTION = 6

/** Sticky-hash caption on the ingest → shard edge, not a separate diagram. */
export const STICKY_CAPTION = 'page → one shard'

export const DIAGRAM = {
  colW: 168,
  colGap: 48,
  padX: 20,
  padY: 18,
  nodeH: 84,
  nodeGap: 10,
  stackH: 114,
  stackLayers: 3,
  stackOffset: 7,
  spoFMinH: 148,
  captionH: 24,
  nodeW: 154,
} as const

export type LayoutConfig = {
  N: number
  stage2: boolean
}

export type LayoutOptions = {
  maxCollection?: number
}

export function layout(config: LayoutConfig, options: LayoutOptions = {}): DiagramModel {
  const N = Math.max(1, Math.round(config.N))
  const stage2 = Boolean(config.stage2)
  const maxCollection = Math.max(1, Math.round(options.maxCollection ?? MAX_COLLECTION))
  const collapsed = N > maxCollection
  const layers = stackLayers(N)
  const stackExtra = collapsed ? (layers - 1) * DIAGRAM.stackOffset : 0

  const rawH = collapsed
    ? DIAGRAM.stackH + stackExtra
    : N * DIAGRAM.nodeH + Math.max(0, N - 1) * DIAGRAM.nodeGap
  const midH = stage2 ? rawH : 0
  const contentH = Math.max(DIAGRAM.spoFMinH, rawH, midH)
  const colTop = (colH: number) => DIAGRAM.padY + (contentH - colH) / 2

  const columns: Array<'ingest' | 'raw' | 'mid' | 'agg' | 'db'> = stage2
    ? ['ingest', 'raw', 'mid', 'agg', 'db']
    : ['ingest', 'raw', 'agg', 'db']
  const colX = (id: (typeof columns)[number]) =>
    DIAGRAM.padX + columns.indexOf(id) * (DIAGRAM.colW + DIAGRAM.colGap)

  const nodes: DiagramNode[] = []
  const edges: DiagramEdge[] = []

  const ingestX = colX('ingest')
  const rawX = colX('raw')
  const aggX = colX('agg')
  const dbX = colX('db')
  const midX = stage2 ? colX('mid') : 0

  nodes.push(
    box({
      id: 'ingest',
      kind: 'ingest',
      column: 'ingest',
      x: ingestX,
      y: colTop(DIAGRAM.spoFMinH),
      width: DIAGRAM.nodeW,
      height: DIAGRAM.spoFMinH,
      label: 'page views',
      spoF: true,
      collapsed: false,
    }),
  )

  const rawIds: string[] = []
  if (collapsed) {
    const id = 'raw-stack'
    rawIds.push(id)
    nodes.push(
      box({
        id,
        kind: 'stack',
        column: 'raw',
        collection: 'raw',
        count: N,
        layers,
        x: rawX + stackExtra,
        y: colTop(rawH) + stackExtra,
        width: DIAGRAM.nodeW - stackExtra,
        height: DIAGRAM.stackH,
        label: 'raw shards',
        spoF: false,
        collapsed: true,
      }),
    )
  } else {
    const top = colTop(rawH)
    for (let i = 0; i < N; i++) {
      const id = `raw-${i}`
      rawIds.push(id)
      nodes.push(
        box({
          id,
          kind: 'peer',
          column: 'raw',
          collection: 'raw',
          index: i,
          x: rawX,
          y: top + i * (DIAGRAM.nodeH + DIAGRAM.nodeGap),
          width: DIAGRAM.nodeW,
          height: DIAGRAM.nodeH,
          label: rawQueueName(i),
          spoF: false,
          collapsed: false,
        }),
      )
    }
  }

  const midIds: string[] = []
  if (stage2) {
    if (collapsed) {
      const id = 'mid-stack'
      midIds.push(id)
      nodes.push(
        box({
          id,
          kind: 'stack',
          column: 'mid',
          collection: 'mid',
          count: N,
          layers,
          x: midX + stackExtra,
          y: colTop(midH) + stackExtra,
          width: DIAGRAM.nodeW - stackExtra,
          height: DIAGRAM.stackH,
          label: 'mid-agg',
          spoF: false,
          collapsed: true,
        }),
      )
    } else {
      const top = colTop(midH)
      for (let i = 0; i < N; i++) {
        const id = `mid-${i}`
        midIds.push(id)
        nodes.push(
          box({
            id,
            kind: 'peer',
            column: 'mid',
            collection: 'mid',
            index: i,
            x: midX,
            y: top + i * (DIAGRAM.nodeH + DIAGRAM.nodeGap),
            width: DIAGRAM.nodeW,
            height: DIAGRAM.nodeH,
            label: midQueueName(i),
            spoF: false,
            collapsed: false,
          }),
        )
      }
    }
  }

  nodes.push(
    box({
      id: 'agg',
      kind: 'agg',
      column: 'agg',
      x: aggX,
      y: colTop(DIAGRAM.spoFMinH),
      width: DIAGRAM.nodeW,
      height: DIAGRAM.spoFMinH,
      label: 'page_views_agg',
      spoF: true,
      collapsed: false,
    }),
    box({
      id: 'db',
      kind: 'db',
      column: 'db',
      x: dbX,
      y: colTop(DIAGRAM.spoFMinH),
      width: DIAGRAM.nodeW,
      height: DIAGRAM.spoFMinH,
      label: 'DB writer',
      spoF: true,
      collapsed: false,
    }),
  )

  for (const id of rawIds) edges.push({ id: `e-ingest-${id}`, from: 'ingest', to: id })
  if (stage2) {
    if (collapsed) {
      edges.push({ id: 'e-raw-stack-mid-stack', from: 'raw-stack', to: 'mid-stack' })
      edges.push({ id: 'e-mid-stack-agg', from: 'mid-stack', to: 'agg' })
    } else {
      for (let i = 0; i < N; i++) {
        edges.push({ id: `e-raw-${i}-mid-${i}`, from: `raw-${i}`, to: `mid-${i}` })
        edges.push({ id: `e-mid-${i}-agg`, from: `mid-${i}`, to: 'agg' })
      }
    }
  } else {
    for (const id of rawIds) edges.push({ id: `e-${id}-agg`, from: id, to: 'agg' })
  }
  edges.push({ id: 'e-agg-db', from: 'agg', to: 'db' })

  const width = dbX + DIAGRAM.nodeW + DIAGRAM.padX
  const height = DIAGRAM.padY + contentH + DIAGRAM.captionH + DIAGRAM.padY
  const captionX = rawX + DIAGRAM.nodeW / 2
  const captionY = DIAGRAM.padY + contentH + 16

  return {
    width,
    height,
    maxCollection,
    stage2,
    N,
    rawCollapsed: collapsed,
    midCollapsed: stage2 && collapsed,
    caption: STICKY_CAPTION,
    captionX,
    captionY,
    nodes,
    edges,
  }
}

function stackLayers(N: number): number {
  return N >= 3 ? 3 : 2
}

function box(node: DiagramNode): DiagramNode {
  return node
}
