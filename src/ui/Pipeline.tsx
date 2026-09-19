import type { SimSnapshot } from '../sim/index.ts'
import { Architecture } from './diagram/Architecture.tsx'
import { MAX_COLLECTION } from './diagram/layout.ts'

type Props = {
  snapshot: SimSnapshot
}

export function Pipeline({ snapshot }: Props) {
  const { config } = snapshot
  const stage2 = config.stage2
  const stacked = config.N > MAX_COLLECTION

  return (
    <section className="panel pipeline" aria-labelledby="pipe-title">
      <header className="panel-head">
        <h2 id="pipe-title">Pipeline</h2>
        <p className="muted">
          {stage2
            ? 'Ingest → N raw shards (S₁/M₁, depth Q) → N mid-agg on the same shard (S₂/M₂, unbounded) → page_views_agg → DB. Stage 2 is extra compaction, not reliability.'
            : 'Ingest → N raw shards (depth Q) → competing S/M flush → one blob on page_views_agg → additive DB upserts. Single boxes are SPOFs.'}
          {stacked ? ` N=${config.N} draws as a stack (N > ${MAX_COLLECTION}).` : ''}
        </p>
      </header>
      <Architecture snapshot={snapshot} />
    </section>
  )
}
