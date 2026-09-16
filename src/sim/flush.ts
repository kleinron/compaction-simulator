import type { FlushCandidate, FlushReason } from './types.ts'

/** Tie-break when two reasons share a sim timestamp: data-driven M, then K, then timer S. */
const TIE_ORDER: Record<FlushReason, number> = { M: 0, K: 1, S: 2 }

/** Earliest-wins among S / K / M candidates. */
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
  kReachedAt: number | null
}): FlushCandidate | null {
  const candidates: FlushCandidate[] = []
  const sTime = state.openTime + state.S
  if (state.simTime + 1e-9 >= sTime) {
    candidates.push({ reason: 'S', time: sTime })
  }
  if (state.mReachedAt !== null && state.simTime + 1e-9 >= state.mReachedAt) {
    candidates.push({ reason: 'M', time: state.mReachedAt })
  }
  if (state.kReachedAt !== null && state.simTime + 1e-9 >= state.kReachedAt) {
    candidates.push({ reason: 'K', time: state.kReachedAt })
  }
  return earliestFlush(candidates)
}
