import { useCallback, useEffect, useRef, useState } from 'react'
import {
  EMPTY_ROLLING,
  RollingTracker,
  SimulationEngine,
  UI_EVENTS_PER_FRAME,
  windowSeconds,
  type RollingView,
  type SimConfig,
  type SimSnapshot,
} from '../sim/index.ts'
import { browserLocalStorage, readStoredSpeed, writeStoredSpeed } from './sessionStore.ts'

export function useSimulation(config: SimConfig) {
  const engineRef = useRef<SimulationEngine | null>(null)
  const trackerRef = useRef(new RollingTracker())
  const [snapshot, setSnapshot] = useState<SimSnapshot>(() =>
    new SimulationEngine(config, { seed: 1 }).snapshot(),
  )
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(() => readStoredSpeed(browserLocalStorage()))
  const [wallElapsed, setWallElapsed] = useState(0)
  const [runSeed, setRunSeed] = useState(1)
  const [rolling, setRolling] = useState<RollingView>(EMPTY_ROLLING)

  const speedRef = useRef(speed)
  speedRef.current = speed

  const record = useCallback((engine: SimulationEngine, nextSpeed: number) => {
    const snap = engine.snapshot()
    trackerRef.current.push({
      simTime: snap.simTime,
      rawViews: snap.stats.rawViews,
      dbUpserts: snap.stats.dbUpserts,
    })
    setSnapshot(snap)
    setRolling(trackerRef.current.view(windowSeconds(nextSpeed), snap.simTime))
  }, [])

  const rebuild = useCallback(
    (nextSeed: number) => {
      const engine = new SimulationEngine(config, { seed: nextSeed })
      engineRef.current = engine
      trackerRef.current.clear()
      setWallElapsed(0)
      record(engine, speedRef.current)
    },
    [config, record],
  )

  useEffect(() => {
    rebuild(runSeed)
  }, [rebuild, runSeed])

  useEffect(() => {
    writeStoredSpeed(browserLocalStorage(), speed)
  }, [speed])

  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    setRolling(trackerRef.current.view(windowSeconds(speed), engine.time))
  }, [speed])

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
        record(engine, speed)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing, speed, record])

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
    rolling,
  }
}
