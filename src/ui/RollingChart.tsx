import type { RollingView } from '../sim/index.ts'

type Props = {
  rolling: RollingView
}

const WIDTH = 168
const HEIGHT = 52
const PAD_X = 2
const PAD_Y = 4

export function RollingChart({ rolling }: Props) {
  const { W, points, avg } = rolling
  const downsample = downsamplePoints(points, 96)
  const ys = downsample.map((p) => p.cW)
  const yMax = Math.max(1, avg, ...ys)
  const path = polyline(downsample, yMax)
  const avgY = PAD_Y + (1 - avg / yMax) * (HEIGHT - PAD_Y * 2)
  const avgLabel = downsample.length === 0 ? '—' : avg.toFixed(2)

  return (
    <div className="rolling" aria-label={`Rolling compaction over last ${formatW(W)} sim`}>
      <p className="eyebrow">C_W · last {formatW(W)} sim</p>
      <svg
        className="rolling-svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width={WIDTH}
        height={HEIGHT}
        role="img"
      >
        <title>{`C_W avg ${avgLabel} over last ${formatW(W)} sim`}</title>
        <line
          className="rolling-avg"
          x1={PAD_X}
          x2={WIDTH - PAD_X}
          y1={avgY}
          y2={avgY}
        />
        {path ? <polyline className="rolling-spark" points={path} /> : null}
      </svg>
      <p className="rolling-caption">
        <span className="rolling-avg-label">avg {avgLabel}</span>
        <span className="muted">C_W = Δraw / Δupserts</span>
      </p>
    </div>
  )
}

function formatW(W: number): string {
  return Number.isInteger(W) ? `${W} s` : `${W.toFixed(0)} s`
}

function downsamplePoints(
  points: RollingView['points'],
  max: number,
): RollingView['points'] {
  if (points.length <= max) return points
  const out = []
  for (let i = 0; i < max; i++) {
    const idx = Math.round((i / (max - 1)) * (points.length - 1))
    out.push(points[idx])
  }
  return out
}

function polyline(points: RollingView['points'], yMax: number): string {
  if (points.length === 0) return ''
  const t0 = points[0].t
  const t1 = points[points.length - 1].t
  const span = Math.max(1e-9, t1 - t0)
  const innerW = WIDTH - PAD_X * 2
  const innerH = HEIGHT - PAD_Y * 2
  return points
    .map((p) => {
      const x = PAD_X + ((p.t - t0) / span) * innerW
      const y = PAD_Y + (1 - p.cW / yMax) * innerH
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}
