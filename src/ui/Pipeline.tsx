import type { FlushReason, ShardSnapshot, SimSnapshot } from '../sim/index.ts'

type Props = {
  snapshot: SimSnapshot
}

export function Pipeline({ snapshot }: Props) {
  const { shards, midShards, lambda, aggQueue, recentIngest, recentUpserts, stats, config } =
    snapshot
  const stage2 = config.stage2

  return (
    <section className="panel pipeline" aria-labelledby="pipe-title">
      <header className="panel-head">
        <h2 id="pipe-title">Pipeline</h2>
        <p className="muted">
          {stage2
            ? 'Ingest → N raw shards (S₁/M₁) → N mid-agg on the same shard (S₂/M₂) → page_views_agg → DB. Stage 2 is extra compaction, not reliability.'
            : 'Ingest → N raw shards → competing S/M flush → one blob on page_views_agg → additive DB upserts. Single boxes are SPOFs.'}
        </p>
      </header>

      <div className={stage2 ? 'pipe-ltr with-mid' : 'pipe-ltr'}>
        <article className="node spoF ingest">
          <p className="node-kicker">
            Ingest <span className="badge spo">SPOF</span>
          </p>
          <h3>page views</h3>
          <p className="mono">
            λ = {lambda.toFixed(3)}
            <small> / sim-s</small>
          </p>
          <p className="muted">{'{ page, timestamp ISO8601 UTC }'}</p>
          <ul className="ticker">
            {recentIngest.slice(-6).map((ev, i) => (
              <li key={`${ev.timestamp}-${ev.page}-${i}`}>
                <code>{ev.page}</code>
                <span>→ raw_{ev.shard}</span>
              </li>
            ))}
          </ul>
        </article>

        <div className="pipe-arrow" aria-hidden="true" />

        <div className="shard-col" tabIndex={0} aria-label="Raw shard queues">
          {shards.map((shard) => (
            <ShardCard
              key={shard.queueName}
              shard={shard}
              sLabel="S₁"
              mLabel="M₁"
            />
          ))}
        </div>

        <div className="pipe-arrow" aria-hidden="true" />

        {stage2 ? (
          <>
            <div className="shard-col mid-col" tabIndex={0} aria-label="Mid-agg shards">
              {midShards.map((shard) => (
                <ShardCard
                  key={shard.queueName}
                  shard={shard}
                  sLabel="S₂"
                  mLabel="M₂"
                  mid
                />
              ))}
            </div>
            <div className="pipe-arrow" aria-hidden="true" />
          </>
        ) : null}

        <article className="node spoF agg">
          <p className="node-kicker">
            <code>page_views_agg</code> <span className="badge spo">SPOF</span>
          </p>
          <h3>one blob / flush</h3>
          <p className="muted">
            {stats.aggPublishes} publishes · last {aggQueue.length} kept
          </p>
          <ol className="blob-list">
            {aggQueue
              .slice()
              .reverse()
              .slice(0, 5)
              .map((blob) => (
                <li key={blob.id}>
                  <span className={`winner-${blob.winner}`}>{blob.winner}</span>
                  <span>
                    {blob.stage === 2 ? 'mid' : 'raw'} {blob.shard} · {blob.messages}{' '}
                    views · {blob.distinctKeys} keys
                    {blob.stage === 2 ? ` · ${blob.sourceBlobs} blobs` : ''}
                  </span>
                </li>
              ))}
          </ol>
        </article>

        <div className="pipe-arrow" aria-hidden="true" />

        <article className="node spoF db">
          <p className="node-kicker">
            DB writer <span className="badge spo">SPOF</span>
          </p>
          <h3>additive upsert</h3>
          <p className="muted">
            one upsert / (hour, page) leaf · {snapshot.dbKeyCount} rows
          </p>
          <ul className="ticker">
            {recentUpserts
              .slice()
              .reverse()
              .slice(0, 6)
              .map((leaf, i) => (
                <li key={`${leaf.hour}-${leaf.page}-${i}`}>
                  <code>
                    {hourShort(leaf.hour)} · {leaf.page}
                  </code>
                  <span>={leaf.count}</span>
                </li>
              ))}
          </ul>
        </article>
      </div>
    </section>
  )
}

function ShardCard({
  shard,
  sLabel,
  mLabel,
  mid = false,
}: {
  shard: ShardSnapshot
  sLabel: string
  mLabel: string
  mid?: boolean
}) {
  const unit = shard.unit === 'blobs' ? 'blobs' : 'msgs'
  return (
    <article className={cardClass(shard, mid)}>
      <header>
        <code>{shard.queueName}</code>
        <span className="muted">
          {shard.messages} {unit} · {shard.distinctKeys} keys
        </span>
      </header>
      <div className="meters" aria-label={`Flush meters for ${shard.queueName}`}>
        <Meter reason="S" label={sLabel} fill={shard.meterS} />
        <Meter reason="M" label={mLabel} fill={shard.meterM} />
      </div>
    </article>
  )
}

function cardClass(shard: ShardSnapshot, mid: boolean): string {
  const parts = ['shard']
  if (mid) parts.push('mid')
  if (shard.flushPulse) parts.push('pulse')
  return parts.join(' ')
}

function Meter({
  reason,
  label,
  fill,
}: {
  reason: FlushReason
  label: string
  fill: number
}) {
  const pct = Math.round(fill * 100)
  return (
    <div className={`meter meter-${reason}`}>
      <span>{label}</span>
      <div
        className="meter-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={`${label} flush meter`}
      >
        <div className="meter-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="meter-pct">{pct}%</span>
    </div>
  )
}

function hourShort(iso: string): string {
  return iso.replace(':00:00Z', 'Z')
}
