/** Lookback W = clamp(15 × speed, 30, 600) sim-seconds. */
export const WINDOW_SPEED_FACTOR = 15
export const WINDOW_MIN_S = 30
export const WINDOW_MAX_S = 600

export type TotalsSample = {
  simTime: number
  rawViews: number
  dbUpserts: number
}

export type RollingPoint = {
  t: number
  cW: number
}

export type RollingView = {
  W: number
  points: RollingPoint[]
  avg: number
}

export const EMPTY_ROLLING: RollingView = { W: WINDOW_MIN_S, points: [], avg: 0 }

export function windowSeconds(speed: number): number {
  if (!Number.isFinite(speed) || speed <= 0) return WINDOW_MIN_S
  return Math.min(WINDOW_MAX_S, Math.max(WINDOW_MIN_S, WINDOW_SPEED_FACTOR * speed))
}

/** C_W = Δraw / Δupserts; 0 when the window has no upserts. */
export function compactionCW(deltaRaw: number, deltaUpserts: number): number {
  if (!(deltaUpserts > 0)) return 0
  return deltaRaw / deltaUpserts
}

export function meanCW(points: readonly RollingPoint[]): number {
  if (points.length === 0) return 0
  let sum = 0
  for (const p of points) sum += p.cW
  return sum / points.length
}

/**
 * C_W(t) for each sample with t in (now − W, now], using the last sample at
 * or before t − W as the baseline (oldest sample if the window is not full).
 */
export function rollingSeries(
  samples: readonly TotalsSample[],
  now: number,
  W: number,
): RollingPoint[] {
  if (samples.length === 0 || !(W > 0)) return []
  const start = now - W
  const points: RollingPoint[] = []
  let baseline = 0
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]
    while (baseline + 1 < samples.length && samples[baseline + 1].simTime <= s.simTime - W) {
      baseline += 1
    }
    if (s.simTime < start - 1e-9) continue
    const prev = samples[baseline]
    points.push({
      t: s.simTime,
      cW: compactionCW(s.rawViews - prev.rawViews, s.dbUpserts - prev.dbUpserts),
    })
  }
  return points
}

/** Keep enough history to compute C_W at the left edge of a max-length window. */
const RETAIN_S = WINDOW_MAX_S * 2

export class RollingTracker {
  private readonly samples: TotalsSample[] = []
  readonly capacity: number

  constructor(capacity = 4_096) {
    this.capacity = capacity
  }

  clear(): void {
    this.samples.length = 0
  }

  push(sample: TotalsSample): void {
    const last = this.samples[this.samples.length - 1]
    if (last && sample.simTime < last.simTime - 1e-12) {
      this.samples.length = 0
    }
    const prev = this.samples[this.samples.length - 1]
    if (prev && Math.abs(sample.simTime - prev.simTime) < 1e-12) {
      prev.rawViews = sample.rawViews
      prev.dbUpserts = sample.dbUpserts
    } else {
      this.samples.push({ ...sample })
    }
    const newest = this.samples[this.samples.length - 1]
    const cutoff = newest.simTime - RETAIN_S
    while (this.samples.length > 1 && this.samples[0].simTime < cutoff) {
      this.samples.shift()
    }
    while (this.samples.length > this.capacity) this.samples.shift()
  }

  view(W: number, now: number): RollingView {
    const points = rollingSeries(this.samples, now, W)
    return { W, points, avg: meanCW(points) }
  }
}
