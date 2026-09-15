import type { FlushReason, SimSnapshot } from '../sim/index.ts'

type Props = {
  snapshot: SimSnapshot
  wallElapsed: number
  speed: number
  playing: boolean
  onToggle: () => void
  onReset: () => void
  onSpeed: (speed: number) => void
}

const SPEEDS = [1, 10, 25, 100, 400]

export function Metrics({
  snapshot,
  wallElapsed,
  speed,
  playing,
  onToggle,
  onReset,
  onSpeed,
}: Props) {
  const { stats, simIso, simTime } = snapshot
  const cLabel = stats.dbUpserts === 0 ? '—' : stats.C.toFixed(2)
  const ratio =
    stats.lastFlushMessages > 0 ? `${stats.lastFlushMessages} : 1` : '—'

  return (
    <section className="hero" aria-labelledby="hero-c">
      <div className="hero-c">
        <p className="eyebrow">Hero metric</p>
        <div className="c-row">
          <span id="hero-c" className="c-value">
            {cLabel}
          </span>
          <span className="c-formula">
            C = raw_views / db_upserts
            <small>
              {stats.rawViews.toLocaleString()} / {stats.dbUpserts.toLocaleString()}
            </small>
          </span>
        </div>
        <p className="muted tight">
          Live C is counted from the run. The M-only single-hour check is E[U] ={' '}
          {stats.expectedU.toFixed(2)}, C ≈ {stats.expectedC_M_only.toFixed(2)}.
        </p>
      </div>

      <dl className="stat-grid">
        <Stat label="Message ratio" value={ratio} hint="last batch msgs : 1 publish" />
        <Stat
          label="Last flush"
          value={stats.lastWinner ?? '—'}
          hint={winnerHint(stats.lastWinner)}
          tone={stats.lastWinner}
        />
        <Stat
          label="Cumulative ratio"
          value={stats.aggPublishes === 0 ? '—' : `${stats.messageRatio.toFixed(1)} : 1`}
          hint="raw views : agg publishes"
        />
        <Stat
          label="Wins S / K / M"
          value={`${stats.wins.S} / ${stats.wins.K} / ${stats.wins.M}`}
          hint="earliest-of-three"
        />
      </dl>

      <div className="clocks">
        <div>
          <p className="eyebrow">Sim clock</p>
          <p className="mono">{simIso}</p>
          <p className="muted">t = {simTime.toFixed(2)}s</p>
        </div>
        <div>
          <p className="eyebrow">Wall clock</p>
          <p className="mono">{wallElapsed.toFixed(2)}s elapsed</p>
          <p className="muted">
            {simTime.toFixed(1)}s sim ≠ {wallElapsed.toFixed(1)}s wall
          </p>
        </div>
        <div className="transport">
          <button type="button" className="btn primary" onClick={onToggle}>
            {playing ? 'Pause' : 'Play'}
          </button>
          <button type="button" className="btn" onClick={onReset}>
            Reset
          </button>
          <div className="speed" role="group" aria-label="Sim speed">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                className={s === speed ? 'btn active' : 'btn'}
                onClick={() => onSpeed(s)}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint: string
  tone?: FlushReason | null
}) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd className={tone ? `winner-${tone}` : undefined}>{value}</dd>
      <p className="muted">{hint}</p>
    </div>
  )
}

function winnerHint(winner: FlushReason | null): string {
  if (winner === 'S') return 'timeout (sim-seconds)'
  if (winner === 'K') return 'distinct (hour, page) keys'
  if (winner === 'M') return 'raw messages received'
  return 'no flush yet'
}
