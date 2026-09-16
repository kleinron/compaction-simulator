import { useCallback, useEffect, useRef, useState } from 'react'
import { UI_EVENTS_PER_FRAME, SimulationEngine, type SimConfig, type SimSnapshot } from '../sim/index.ts'

export function useSimulation(config: SimConfig) {
  const engineRef = useRef<SimulationEngine | null>(null)
  const [snapshot, setSnapshot] = useState<SimSnapshot>(() =>
    new SimulationEngine(config, { seed: 1 }).snapshot(),
  )
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(25)
  const [wallElapsed, setWallElapsed] = useState(0)
  const [runSeed, setRunSeed] = useState(1)

  const rebuild = useCallback(
    (nextSeed: number) => {
      const engine = new SimulationEngine(config, { seed: nextSeed })
      engineRef.current = engine
      setSnapshot(engine.snapshot())
      setWallElapsed(0)
    },
    [config],
  )

  useEffect(() => {
    rebuild(runSeed)
  }, [rebuild, runSeed])

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      const dt = Math.min(0.08, (now - last) / 1000)
      last = now
      const engine = engineRef.current
      if (playing && engine) {
        engine.advance(dt * speed, UI_EVENTS_PER_FRAME)
        setWallElapsed((w) => w + dt)
        setSnapshot(engine.snapshot())
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing, speed])

  const reset = useCallback(() => {
    setRunSeed((s) => s + 1)
  }, [])

  return {
    snapshot,
    playing,
    setPlaying,
    speed,
    setSpeed,
    wallElapsed,
    reset,
  }
}
