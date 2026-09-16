import { useEffect, useState } from 'react'
import type { SimConfig } from '../sim/index.ts'
import { arrivalRateLambda, shardSizeP } from '../sim/index.ts'
import { clampKnob, formatKnobNumber } from './knobValue.ts'

type Knob = {
  key: keyof SimConfig
  label: string
  hint: string
  min: number
  max: number
  step: number
  pretty?: (v: number) => string
}

const KNOBS: Knob[] = [
  {
    key: 'T',
    label: 'T · pages',
    hint: 'Distinct page catalog. Shard size P = T/N.',
    min: 10,
    max: 2000,
    step: 10,
  },
  {
    key: 'N',
    label: 'N · shards',
    hint: 'Raw queues page_views_raw_0 … N−1.',
    min: 1,
    max: 12,
    step: 1,
  },
  {
    key: 'M',
    label: 'M · messages',
    hint: 'Flush when the batch has received M raw views.',
    min: 1,
    max: 400,
    step: 1,
  },
  {
    key: 'S',
    label: 'S · timeout (s)',
    hint: 'Sim-seconds since the batch opened. Timeout knob, not shard size.',
    min: 0.5,
    max: 120,
    step: 0.5,
  },
  {
    key: 'V_day',
    label: 'V_day · API/day',
    hint: 'Throughput. λ = V_day / 86400 events per sim-second.',
    min: 10_000,
    max: 8_000_000,
    step: 10_000,
    pretty: (v) =>
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
          <KnobControl
            key={knob.key}
            knob={knob}
            value={value[knob.key]}
            onCommit={(next) => onChange({ ...value, [knob.key]: next })}
          />
        ))}
      </div>
    </section>
  )
}

function KnobControl({
  knob,
  value,
  onCommit,
}: {
  knob: Knob
  value: number
  onCommit: (next: number) => void
}) {
  const [draft, setDraft] = useState(formatKnobNumber(value, knob.step))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setDraft(formatKnobNumber(value, knob.step))
  }, [value, focused, knob.step])

  const commit = (raw: number) => {
    onCommit(clampKnob(raw, knob))
  }

  const commitDraft = () => {
    const parsed = Number(draft)
    if (!Number.isFinite(parsed)) {
      setDraft(formatKnobNumber(value, knob.step))
      return
    }
    const next = clampKnob(parsed, knob)
    onCommit(next)
    setDraft(formatKnobNumber(next, knob.step))
  }

  const labelId = `knob-${knob.key}`
  const textId = `knob-${knob.key}-text`

  return (
    <div className="knob">
      <div className="knob-top">
        <label htmlFor={labelId}>{knob.label}</label>
        <span className="knob-inputs">
          {knob.pretty ? <span className="knob-pretty">{knob.pretty(value)}</span> : null}
          <input
            id={textId}
            className="knob-text"
            type="text"
            inputMode={knob.step < 1 ? 'decimal' : 'numeric'}
            value={focused ? draft : formatKnobNumber(value, knob.step)}
            aria-label={`${knob.label} value`}
            onFocus={() => {
              setFocused(true)
              setDraft(formatKnobNumber(value, knob.step))
            }}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              setFocused(false)
              commitDraft()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
          />
        </span>
      </div>
      <input
        id={labelId}
        type="range"
        min={knob.min}
        max={knob.max}
        step={knob.step}
        value={value}
        aria-label={knob.label}
        onChange={(e) => commit(Number(e.target.value))}
      />
      <span className="knob-hint">{knob.hint}</span>
    </div>
  )
}

function formatP(P: number): string {
  return Number.isInteger(P) ? String(P) : P.toFixed(2)
}
