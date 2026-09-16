export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function exponential(rng: () => number, lambda: number): number {
  if (!(lambda > 0)) return Number.POSITIVE_INFINITY
  const u = Math.max(rng(), Number.MIN_VALUE)
  return -Math.log(u) / lambda
}

export function pickPageIndex(rng: () => number, t: number): number {
  if (t < 1) throw new Error('T must be at least 1')
  return Math.min(t - 1, Math.floor(rng() * t))
}
