import { Knobs } from './Knobs.tsx'
import { Metrics } from './Metrics.tsx'
import { Pipeline } from './Pipeline.tsx'
import { useShareableConfig } from './useShareableConfig.ts'
import { useSimulation } from './useSimulation.ts'

export default function App() {
  const [config, setConfig] = useShareableConfig()
  const { snapshot, playing, setPlaying, speed, setSpeed, wallElapsed, reset, rolling } =
    useSimulation(config)

  return (
    <div className="app">
      <header className="mast">
        <div>
          <p className="eyebrow">Page-view analytics</p>
          <h1>Compaction simulator</h1>
        </div>
        <p className="lede">
          Discrete-event model of ingest → hashed raw shards → optional same-shard
          mid-agg → a single <code>page_views_agg</code> blob → additive DB
          upserts. Compaction <strong>C</strong> is how many raw views each
          upsert absorbed. Stage 2 is extra buffering, not a reliability feature.
        </p>
      </header>

      <Metrics
        snapshot={snapshot}
        rolling={rolling}
        config={config}
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
