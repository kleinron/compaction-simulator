/** Sim t=0 maps to this UTC instant so hour-flooring is easy to read. */
export const SIM_EPOCH_MS = Date.parse('2026-08-20T18:00:00Z')

export function toIsoUtc(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function simTimeToIso(simSeconds: number): string {
  return toIsoUtc(SIM_EPOCH_MS + simSeconds * 1000)
}

/** Floor an ISO-8601 UTC timestamp to the calendar hour. */
export function floorToHourIso(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    throw new Error(`invalid timestamp: ${iso}`)
  }
  const floored = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    d.getUTCHours(),
    0,
    0,
    0,
  )
  return toIsoUtc(floored)
}
