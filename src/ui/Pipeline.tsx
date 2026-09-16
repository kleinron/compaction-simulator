import type { FlushReason, ShardSnapshot, SimSnapshot } from '../sim/index.ts'

type Props = {
  snapshot: SimSnapshot
}

export function Pipeline({ snapshot }: Props) {
  const { shards, lambda, aggQueue, recentIngest, recentUpserts, stats } = snapshot

  return (
    <section className="panel pipeline" aria-labelledby="pipe-title">
      <header className="panel-head">
        <h2 id="pipe-title">Pipeline</h2>
        <p className="muted">
          Ingest → N raw shards → competing S/M flush → one blob on{' '}
          <code>page_views_agg</code> → additive DB upserts. Single boxes are SPOFs.
        </p>
      </header>

      <div className="pipe-ltr">
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

        <div className="shard-col">
          {shards.map((shard) => (
            <ShardCard key={shard.queueName} shard={shard} />
          ))}
        </div>

        <div className="pipe-arrow" aria-hidden="true" />

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
                    shard {blob.shard} · {blob.messages} msgs · {blob.distinctKeys} keys
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

function ShardCard({ shard }: { shard: ShardSnapshot }) {
  return (
    <article className={shard.flushPulse ? 'shard pulse' : 'shard'}>
      <header>
        <code>{shard.queueName}</code>
        <span className="muted">
          {shard.messages} msgs · {shard.distinctKeys} keys
        </span>
      </header>
      <div className="meters" aria-label={`Flush meters for ${shard.queueName}`}>
        <Meter reason="S" fill={shard.meterS} />
        <Meter reason="M" fill={shard.meterM} />
      </div>
    </article>
  )
}

function Meter({ reason, fill }: { reason: FlushReason; fill: number }) {
  const pct = Math.round(fill * 100)
  return (
    <div className={`meter meter-${reason}`}>
      <span>{reason}</span>
      <div
        className="meter-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={`${reason} flush meter`}
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
