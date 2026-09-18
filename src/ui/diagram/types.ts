/** Topology-only diagram. Live meters and tickers are bound later in React. */

export type CollectionId = 'raw' | 'mid'

export type NodeKind = 'ingest' | 'peer' | 'stack' | 'agg' | 'db'

export type DiagramNode = {
  id: string
  kind: NodeKind
  /** Logical column. Peers/stacks also set `collection`. */
  column: 'ingest' | CollectionId | 'agg' | 'db'
  collection?: CollectionId
  /** Shard index for an expanded peer. */
  index?: number
  /** True N for a collapsed stack. */
  count?: number
  /** Overlapping cards behind the front stack card (2 or 3). */
  layers?: number
  x: number
  y: number
  width: number
  height: number
  label: string
  spoF: boolean
  collapsed: boolean
}

export type DiagramEdge = {
  id: string
  from: string
  to: string
}

export type DiagramModel = {
  width: number
  height: number
  maxCollection: number
  stage2: boolean
  N: number
  rawCollapsed: boolean
  midCollapsed: boolean
  caption: string
  captionX: number
  captionY: number
  nodes: DiagramNode[]
  edges: DiagramEdge[]
}
