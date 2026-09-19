import type { FlushCandidate, FlushReason } from './types.ts'

/** Tie-break when S and M share a sim timestamp: message count M, then timeout S. */
const TIE_ORDER: Record<FlushReason, number> = { M: 0, S: 1 }

/** Raw count-flush threshold: M unless Q is tighter, so depth never exceeds Q. */
export function rawCountFlushThreshold(M: number, Q: number): number {
  return Math.min(M, Q)
}

/** True when this raw shard is already at the Q cap (next view must drop). */
export function rawQueueFull(depth: number, Q: number): boolean {
  return depth >= Q
}

/** Earliest-wins among S / M candidates. */
export function earliestFlush(
  candidates: readonly FlushCandidate[],
): FlushCandidate | null {
  if (candidates.length === 0) return null
  let best = candidates[0]
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i]
    if (
      c.time < best.time ||
      (c.time === best.time && TIE_ORDER[c.reason] < TIE_ORDER[best.reason])
    ) {
      best = c
    }
  }
  return best
}

export function flushDue(state: {
  openTime: number
  simTime: number
  S: number
  mReachedAt: number | null
}): FlushCandidate | null {
  const candidates: FlushCandidate[] = []
  const sTime = state.openTime + state.S
  if (state.simTime + 1e-9 >= sTime) {
    candidates.push({ reason: 'S', time: sTime })
  }
  if (state.mReachedAt !== null && state.simTime + 1e-9 >= state.mReachedAt) {
    candidates.push({ reason: 'M', time: state.mReachedAt })
  }
  return earliestFlush(candidates)
}
