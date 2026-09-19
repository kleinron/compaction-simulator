import { useEffect, useState } from 'react'
import type { SimConfig } from '../sim/index.ts'
import { arrivalRateLambda, CONFIG_LIMITS, shardSizeP } from '../sim/index.ts'
import { clampKnob, formatKnobNumber, formatQPretty, formatVDayPretty } from './knobValue.ts'

type NumericKnobKey = Exclude<keyof SimConfig, 'stage2' | 'timeoutJitter'>

type Knob = {
  key: NumericKnobKey
  label: string
  hint: string
  min: number
  max: number
  step: number
  pretty?: (v: number) => string
  wide?: boolean
}

const CORE_KNOBS: Knob[] = [
  {
    key: 'T',
    label: 'T · pages',
    hint: 'Distinct page catalog. Shard size P = T/N.',
    min: 10,
    max: CONFIG_LIMITS.T.max,
    step: 10,
  },
  {
    key: 'N',
    label: 'N · shards',
    hint: 'Raw queues page_views_raw_0 … N−1. Stage 2 uses the same N.',
    min: 1,
    max: CONFIG_LIMITS.N.max,
    step: 1,
  },
  {
    key: 'V_day',
    label: 'V_day · API/day',
    hint: 'Throughput. λ = V_day / 86400 events per sim-second.',
    min: 10_000,
    max: CONFIG_LIMITS.V_day.max,
    step: 10_000,
    pretty: formatVDayPretty,
    wide: true,
  },
]

const STAGE1_KNOBS: Knob[] = [
  {
    key: 'S',
    label: 'S₁ · timeout (s)',
    hint: 'Stage 1: sim-seconds since the raw batch opened. Not shard size.',
    min: 0.5,
    max: CONFIG_LIMITS.S.max,
    step: 0.5,
  },
  {
    key: 'M',
    label: 'M₁ · messages',
    hint: 'Stage 1: flush when the raw batch has received M views.',
    min: 1,
    max: CONFIG_LIMITS.M.max,
    step: 1,
  },
  {
    key: 'Q',
    label: 'Q · raw depth',
    hint: 'Hard cap per raw shard (open batch). Overflow drops. Count-flush is min(M, Q). No Q₂ on mid.',
    min: CONFIG_LIMITS.Q.min,
    max: CONFIG_LIMITS.Q.max,
    step: 1,
    pretty: formatQPretty,
  },
]

const STAGE2_KNOBS: Knob[] = [
  {
    key: 'S2',
    label: 'S₂ · timeout (s)',
    hint: 'Stage 2: sim-seconds since the mid-agg batch opened.',
    min: 0.5,
    max: CONFIG_LIMITS.S2.max,
    step: 0.5,
  },
  {
    key: 'M2',
    label: 'M₂ · blobs',
    hint: 'Stage 2: flush when this many stage-1 blobs have arrived (not raw views).',
    min: CONFIG_LIMITS.M2.min,
    max: CONFIG_LIMITS.M2.max,
    step: 1,
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
        {CORE_KNOBS.map((knob) => (
          <KnobControl
            key={knob.key}
            knob={knob}
            value={value[knob.key]}
            onCommit={(next) => onChange({ ...value, [knob.key]: next })}
          />
        ))}
        {STAGE1_KNOBS.map((knob) => (
          <KnobControl
            key={knob.key}
            knob={knob}
            value={value[knob.key]}
            onCommit={(next) => onChange({ ...value, [knob.key]: next })}
          />
        ))}
        <label className="knob-toggle">
          <input
            type="checkbox"
            checked={value.timeoutJitter}
            onChange={(e) => onChange({ ...value, timeoutJitter: e.target.checked })}
          />
          <span>
            <strong>Jitter timeouts ±10%</strong>
            <span className="knob-hint">
              One global switch for every timeout (stage-1 S and stage-2 S₂).
              Off: exact S / S₂. On: each new batch samples deadline = configured
              timeout × U(0.9, 1.1).
            </span>
          </span>
        </label>
        <label className="knob-toggle">
          <input
            type="checkbox"
            checked={value.stage2}
            onChange={(e) => onChange({ ...value, stage2: e.target.checked })}
          />
          <span>
            <strong>Enable stage 2</strong>
            <span className="knob-hint">
              Extra compaction / deeper buffering on the same shard. Same N,
              sticky hash i → i. This is not reliability or SPOF protection.
            </span>
          </span>
        </label>
        {STAGE2_KNOBS.map((knob) => (
          <KnobControl
            key={knob.key}
            knob={knob}
            value={value[knob.key]}
            disabled={!value.stage2}
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
  disabled = false,
}: {
  knob: Knob
  value: number
  onCommit: (next: number) => void
  disabled?: boolean
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
    <div className={disabled ? 'knob dim' : 'knob'}>
      <div className="knob-top">
        <label htmlFor={labelId}>{knob.label}</label>
        <span className="knob-inputs">
          {knob.pretty ? <span className="knob-pretty">{knob.pretty(value)}</span> : null}
          <input
            id={textId}
            className={knob.wide ? 'knob-text knob-text-wide' : 'knob-text'}
            type="text"
            inputMode={knob.step < 1 ? 'decimal' : 'numeric'}
            value={focused ? draft : formatKnobNumber(value, knob.step)}
            aria-label={knob.label}
            disabled={disabled}
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
        disabled={disabled}
        onChange={(e) => commit(Number(e.target.value))}
      />
      <span className="knob-hint">{knob.hint}</span>
    </div>
  )
}

function formatP(P: number): string {
  return Number.isInteger(P) ? String(P) : P.toFixed(2)
}
