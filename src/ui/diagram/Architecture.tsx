import type { ShardSnapshot, SimSnapshot } from '../../sim/index.ts'
import { formatVDayPretty } from '../knobValue.ts'
import { layout } from './layout.ts'
import type { DiagramEdge, DiagramNode } from './types.ts'

type Props = {
  snapshot: SimSnapshot
}

export function Architecture({ snapshot }: Props) {
  const { config } = snapshot
  const model = layout(config)
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]))

  return (
    <div className="diagram-wrap">
      <svg
        className="diagram-svg"
        viewBox={`0 0 ${model.width} ${model.height}`}
        role="img"
        aria-labelledby="diagram-title diagram-desc"
      >
        <title id="diagram-title">Compaction pipeline architecture</title>
        <desc id="diagram-desc">
          {model.stage2
            ? `Ingest, ${model.N} raw shards, ${model.N} mid-agg shards, page_views_agg, and DB.`
            : `Ingest, ${model.N} raw shards, page_views_agg, and DB.`}{' '}
          {model.caption}.
        </desc>
        <defs>
          <marker
            id="diagram-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="diagram-arrow-head" />
          </marker>
        </defs>

        {model.edges.map((edge) => (
          <EdgePath key={edge.id} edge={edge} nodeById={nodeById} />
        ))}

        {model.nodes.map((node) => (
          <NodeGlyph key={node.id} node={node} snapshot={snapshot} />
        ))}

        <text
          className="diagram-caption"
          x={model.captionX}
          y={model.captionY}
          textAnchor="middle"
        >
          {model.caption}
        </text>
      </svg>
    </div>
  )
}

function EdgePath({
  edge,
  nodeById,
}: {
  edge: DiagramEdge
  nodeById: Map<string, DiagramNode>
}) {
  const from = nodeById.get(edge.from)
  const to = nodeById.get(edge.to)
  if (!from || !to) return null
  const x1 = from.x + from.width
  const y1 = from.y + from.height / 2
  const x2 = to.x
  const y2 = to.y + to.height / 2
  const mx = (x1 + x2) / 2
  return (
    <path
      className="diagram-edge"
      d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
      markerEnd="url(#diagram-arrow)"
    />
  )
}

function NodeGlyph({ node, snapshot }: { node: DiagramNode; snapshot: SimSnapshot }) {
  const layers = node.kind === 'stack' ? (node.layers ?? 3) : 1
  const offset = 7
  const cards = []
  for (let i = layers - 1; i >= 1; i--) {
    cards.push(
      <rect
        key={`back-${i}`}
        className={`diagram-card ${node.column === 'mid' ? 'mid' : ''}`}
        x={node.x - i * offset}
        y={node.y - i * offset}
        width={node.width}
        height={node.height}
        rx={10}
        ry={10}
      />,
    )
  }

  const pulse = nodePulse(node, snapshot)
  const spof = node.spoF

  return (
    <g className={`diagram-node${pulse ? ' pulse' : ''}${spof ? ' spof' : ''}`}>
      {cards}
      <rect
        className={`diagram-card front ${node.column === 'mid' ? 'mid' : ''} ${spof ? 'spof' : ''}`}
        x={node.x}
        y={node.y}
        width={node.width}
        height={node.height}
        rx={10}
        ry={10}
      />
      {spof ? <SpoBadge x={node.x + node.width - 44} y={node.y + 8} /> : null}
      {node.kind === 'stack' ? (
        <Badge
          x={node.x + node.width - 48}
          y={node.y + (spof ? 26 : 8)}
          text={`N=${node.count}`}
        />
      ) : null}
      <NodeBody node={node} snapshot={snapshot} />
    </g>
  )
}

function NodeBody({ node, snapshot }: { node: DiagramNode; snapshot: SimSnapshot }) {
  const { x, y, width } = node
  const tx = x + 10
  const { config, lambda, stats } = snapshot

  if (node.kind === 'ingest') {
    return (
      <>
        <text className="diagram-kicker" x={tx} y={y + 18}>
          Ingest
        </text>
        <text className="diagram-title" x={tx} y={y + 38}>
          {node.label}
        </text>
        <text className="diagram-meta" x={tx} y={y + 56}>
          {`T=${config.T} · ${formatVDayPretty(config.V_day)}/day`}
        </text>
        <text className="diagram-meta mono" x={tx} y={y + 72}>
          {`λ=${lambda.toFixed(1)} /s`}
        </text>
        <text className="diagram-meta" x={tx} y={y + 90}>
          {config.timeoutJitter ? 'jitter ±10% on S/S₂' : 'timeouts exact'}
        </text>
        <RecentLines
          x={tx}
          y={y + 108}
          lines={snapshot.recentIngest.slice(-2).map((ev) => `${ev.page} → raw_${ev.shard}`)}
        />
      </>
    )
  }

  if (node.kind === 'agg') {
    return (
      <>
        <text className="diagram-kicker" x={tx} y={y + 18}>
          one blob / flush
        </text>
        <text className="diagram-title code" x={tx} y={y + 38}>
          page_views_agg
        </text>
        <text className="diagram-meta" x={tx} y={y + 56}>
          {`${stats.aggPublishes} publishes`}
        </text>
        <RecentLines
          x={tx}
          y={y + 76}
          lines={snapshot.aggQueue
            .slice()
            .reverse()
            .slice(0, 3)
            .map((b) => `${b.winner} · ${b.stage === 2 ? 'mid' : 'raw'}_${b.shard}`)}
        />
      </>
    )
  }

  if (node.kind === 'db') {
    return (
      <>
        <text className="diagram-kicker" x={tx} y={y + 18}>
          additive upsert
        </text>
        <text className="diagram-title" x={tx} y={y + 38}>
          DB writer
        </text>
        <text className="diagram-meta" x={tx} y={y + 56}>
          {`${snapshot.dbKeyCount} rows`}
        </text>
        <RecentLines
          x={tx}
          y={y + 76}
          lines={snapshot.recentUpserts
            .slice()
            .reverse()
            .slice(0, 3)
            .map((leaf) => `${leaf.page}=${leaf.count}`)}
        />
      </>
    )
  }

  const shards = node.collection === 'mid' ? snapshot.midShards : snapshot.shards
  const raw = node.collection === 'raw'
  const sLabel = node.collection === 'mid' ? 'S₂' : 'S₁'
  const mLabel = node.collection === 'mid' ? 'M₂' : 'M₁'
  const bound = bindShards(node, shards)
  const title = node.kind === 'stack' ? node.label : node.label.replace('page_views_', '')
  // Top copy starts at +16; keep at least that much air under the last meter.
  const padY = 16
  const meterH = 7
  const meterGap = 16
  const bottom = y + node.height - padY - meterH
  const meterQ = raw ? bottom : null
  const meterM = raw ? bottom - meterGap : bottom
  const meterS = meterM - meterGap

  return (
    <>
      <text className="diagram-kicker" x={tx} y={y + padY}>
        {node.collection === 'mid' ? 'mid-agg' : 'raw'}
      </text>
      <text className="diagram-title code" x={tx} y={y + 34}>
        {clip(title, width - 56)}
      </text>
      <text className="diagram-meta" x={tx} y={y + 50}>
        {clip(bound.summary, width - 24)}
      </text>
      <MeterBar x={tx} y={meterS} width={width - 20} label={sLabel} fill={bound.meterS} kind="S" />
      <MeterBar x={tx} y={meterM} width={width - 20} label={mLabel} fill={bound.meterM} kind="M" />
      {meterQ !== null ? (
        <MeterBar x={tx} y={meterQ} width={width - 20} label="Q" fill={bound.meterQ} kind="Q" />
      ) : null}
    </>
  )
}

function bindShards(node: DiagramNode, shards: ShardSnapshot[]) {
  if (node.kind === 'peer' && node.index !== undefined) {
    const shard = shards[node.index]
    if (!shard) return { meterS: 0, meterM: 0, meterQ: 0, summary: '—' }
    const unit = shard.unit === 'blobs' ? 'blobs' : 'msgs'
    return {
      meterS: shard.meterS,
      meterM: shard.meterM,
      meterQ: shard.meterQ,
      summary: `${shard.messages} ${unit} · ${shard.distinctKeys} keys`,
    }
  }
  if (shards.length === 0) {
    return { meterS: 0, meterM: 0, meterQ: 0, summary: `${node.count ?? 0} shards` }
  }
  const meterS = shards.reduce((s, sh) => s + sh.meterS, 0) / shards.length
  const meterM = shards.reduce((s, sh) => s + sh.meterM, 0) / shards.length
  const meterQ = shards.reduce((s, sh) => s + sh.meterQ, 0) / shards.length
  const msgs = shards.reduce((s, sh) => s + sh.messages, 0)
  const maxDepth = shards.reduce((s, sh) => Math.max(s, sh.messages), 0)
  const unit = shards[0]?.unit === 'blobs' ? 'blobs' : 'msgs'
  const meanPct = Math.round(Math.min(1, Math.max(0, meterQ)) * 100)
  const summary =
    node.collection === 'raw'
      ? `mean ${meanPct}% · max ${maxDepth}`
      : `${msgs} ${unit} · mean meters`
  return { meterS, meterM, meterQ, summary }
}

function nodePulse(node: DiagramNode, snapshot: SimSnapshot): boolean {
  const shards = node.collection === 'mid' ? snapshot.midShards : snapshot.shards
  if (node.kind === 'peer' && node.index !== undefined) return Boolean(shards[node.index]?.flushPulse)
  if (node.kind === 'stack') return shards.some((s) => s.flushPulse)
  return false
}

function MeterBar({
  x,
  y,
  width,
  label,
  fill,
  kind,
}: {
  x: number
  y: number
  width: number
  label: string
  fill: number
  kind: 'S' | 'M' | 'Q'
}) {
  const trackX = x + 22
  const trackW = Math.max(20, width - 56)
  const pct = Math.round(Math.min(1, Math.max(0, fill)) * 100)
  return (
    <g className={`diagram-meter meter-${kind}`}>
      <text className="diagram-meter-label" x={x} y={y + 8}>
        {label}
      </text>
      <rect className="diagram-meter-track" x={trackX} y={y} width={trackW} height={7} rx={4} />
      <rect
        className="diagram-meter-fill"
        x={trackX}
        y={y}
        width={(pct / 100) * trackW}
        height={7}
        rx={4}
      />
      <text className="diagram-meter-pct" x={trackX + trackW + 4} y={y + 8}>
        {pct}%
      </text>
    </g>
  )
}

function SpoBadge({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <rect className="diagram-spo-bg" width={36} height={14} rx={7} />
      <text className="diagram-spo-text" x={18} y={10} textAnchor="middle">
        SPOF
      </text>
    </g>
  )
}

function Badge({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <rect className="diagram-n-bg" width={40} height={14} rx={7} />
      <text className="diagram-n-text" x={20} y={10} textAnchor="middle">
        {text}
      </text>
    </g>
  )
}

function RecentLines({ x, y, lines }: { x: number; y: number; lines: string[] }) {
  return (
    <>
      {lines.map((line, i) => (
        <text key={`${line}-${i}`} className="diagram-tick" x={x} y={y + i * 12}>
          {clip(line, 140)}
        </text>
      ))}
    </>
  )
}

function clip(text: string, maxW: number): string {
  const budget = Math.max(8, Math.floor(maxW / 6.4))
  if (text.length <= budget) return text
  return `${text.slice(0, budget - 1)}…`
}
