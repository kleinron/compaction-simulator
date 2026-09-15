import type { SimConfig } from '../sim/index.ts'
import { arrivalRateLambda, shardSizeP } from '../sim/index.ts'

type Knob = {
  key: keyof SimConfig
  label: string
  hint: string
  min: number
  max: number
  step: number
  format: (v: number) => string
}

const KNOBS: Knob[] = [
  {
    key: 'T',
    label: 'T · pages',
    hint: 'Distinct page catalog. Shard size P = T/N.',
    min: 10,
    max: 2000,
    step: 10,
    format: (v) => String(v),
  },
  {
    key: 'N',
    label: 'N · shards',
    hint: 'Raw queues page_views_raw_0 … N−1.',
    min: 1,
    max: 12,
    step: 1,
    format: (v) => String(v),
  },
  {
    key: 'M',
    label: 'M · messages',
    hint: 'Flush when the batch has received M raw views.',
    min: 1,
    max: 400,
    step: 1,
    format: (v) => String(v),
  },
  {
    key: 'S',
    label: 'S · timeout (s)',
    hint: 'Sim-seconds since the batch opened. Timeout knob, not shard size.',
    min: 0.5,
    max: 120,
    step: 0.5,
    format: (v) => v.toFixed(1),
  },
  {
    key: 'K',
    label: 'K · keys',
    hint: 'Flush at K distinct (hour, page) keys in the merge.',
    min: 1,
    max: 400,
    step: 1,
    format: (v) => String(v),
  },
  {
    key: 'V_day',
    label: 'V_day · API/day',
    hint: 'Throughput. λ = V_day / 86400 events per sim-second.',
    min: 10_000,
    max: 8_000_000,
    step: 10_000,
    format: (v) =>
      v >= 1_000_000 ? `${(v / 1_000_000).toFixed(2)}M` : `${Math.round(v / 1000)}k`,
  },
]

type Props = {
  value: SimConfig
  onChange: (next: SimConfig) => void
}

export function Knobs({ value, onChange }: Props) {
  const P = shardSizeP(value.T, value.N)
  const lambda = arrivalRateLambda(value.V_day)

  return (
    <section className="panel knobs" aria-labelledby="knobs-title">
      <header className="panel-head">
        <h2 id="knobs-title">Knobs</h2>
        <p className="muted">
          P = T/N = <strong>{formatP(P)}</strong>
          <span className="dot">·</span>λ = <strong>{lambda.toFixed(3)}</strong> / sim-s
        </p>
      </header>
      <div className="knob-grid">
        {KNOBS.map((knob) => (
          <label key={knob.key} className="knob">
            <span className="knob-top">
              <span>{knob.label}</span>
              <output>{knob.format(value[knob.key])}</output>
            </span>
            <input
              type="range"
              min={knob.min}
              max={knob.max}
              step={knob.step}
              value={value[knob.key]}
              aria-label={knob.label}
              onChange={(e) =>
                onChange({ ...value, [knob.key]: Number(e.target.value) })
              }
            />
            <span className="knob-hint">{knob.hint}</span>
          </label>
        ))}
      </div>
    </section>
  )
}

function formatP(P: number): string {
  return Number.isInteger(P) ? String(P) : P.toFixed(2)
}
