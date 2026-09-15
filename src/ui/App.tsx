import { useState } from 'react'
import { DEFAULT_CONFIG, type SimConfig } from '../sim/index.ts'
import { Knobs } from './Knobs.tsx'
import { Metrics } from './Metrics.tsx'
import { Pipeline } from './Pipeline.tsx'
import { useSimulation } from './useSimulation.ts'

export default function App() {
  const [config, setConfig] = useState<SimConfig>(DEFAULT_CONFIG)
  const { snapshot, playing, setPlaying, speed, setSpeed, wallElapsed, reset } =
    useSimulation(config)

  return (
    <div className="app">
      <header className="mast">
        <div>
          <p className="eyebrow">Page-view analytics</p>
          <h1>Compaction simulator</h1>
        </div>
        <p className="lede">
          Discrete-event model of ingest → hashed raw shards → per-shard batch
          merge → a single <code>page_views_agg</code> blob → additive DB
          upserts. Compaction <strong>C</strong> is how many raw views each
          upsert absorbed.
        </p>
      </header>

      <Metrics
        snapshot={snapshot}
        wallElapsed={wallElapsed}
        speed={speed}
        playing={playing}
        onToggle={() => setPlaying((p) => !p)}
        onReset={reset}
        onSpeed={setSpeed}
      />

      <Knobs value={config} onChange={setConfig} />
      <Pipeline snapshot={snapshot} />

      <footer className="foot">
        <p>
          Local: <code>npm install && npm run dev</code>. Live:{' '}
          <a href="https://kleinron.github.io/compaction-simulator/">
            kleinron.github.io/compaction-simulator
          </a>
        </p>
      </footer>
    </div>
  )
}
