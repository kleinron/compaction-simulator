/** Namespaced so this origin can host other tools later. */
export const SPEED_STORAGE_KEY = 'compaction-simulator:speed'

export const ALLOWED_SPEEDS = [1, 10, 25, 100, 400] as const
export const DEFAULT_SPEED = 25

export type SpeedStorage = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** Restore a stored speed, snapped onto the allowed 1×…400× buttons. */
export function parseStoredSpeed(raw: string | null): number {
  if (raw === null) return DEFAULT_SPEED
  const trimmed = raw.trim()
  if (trimmed === '') return DEFAULT_SPEED
  const n = Number(trimmed)
  if (!Number.isFinite(n)) return DEFAULT_SPEED
  const min = ALLOWED_SPEEDS[0]
  const max = ALLOWED_SPEEDS[ALLOWED_SPEEDS.length - 1]
  const clamped = Math.min(max, Math.max(min, n))
  let best: number = ALLOWED_SPEEDS[0]
  let bestDist = Math.abs(clamped - best)
  for (const speed of ALLOWED_SPEEDS) {
    const dist = Math.abs(clamped - speed)
    if (dist < bestDist) {
      best = speed
      bestDist = dist
    }
  }
  return best
}

export function readStoredSpeed(storage: SpeedStorage | null): number {
  if (!storage) return DEFAULT_SPEED
  try {
    return parseStoredSpeed(storage.getItem(SPEED_STORAGE_KEY))
  } catch {
    return DEFAULT_SPEED
  }
}

export function writeStoredSpeed(storage: SpeedStorage | null, speed: number): void {
  if (!storage) return
  try {
    storage.setItem(SPEED_STORAGE_KEY, String(parseStoredSpeed(String(speed))))
  } catch {
    // private mode / quota — speed still works for this session
  }
}

export function browserLocalStorage(): SpeedStorage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}
