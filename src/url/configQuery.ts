import {
  CONFIG_LIMITS,
  DEFAULT_CONFIG,
  normalizeConfig,
  type SimConfig,
} from '../sim/index.ts'

/** Knob / toggle keys that belong in a shareable URL. Play and speed do not. */
export const QUERY_CONFIG_KEYS = [
  'T',
  'N',
  'M',
  'Q',
  'S',
  'V_day',
  'stage2',
  'S2',
  'M2',
  'timeoutJitter',
] as const

const NUMERIC_KEYS = ['T', 'N', 'M', 'Q', 'S', 'V_day', 'S2', 'M2'] as const

/** Debounce for history.replaceState so slider drags do not spam the URL. */
export const QUERY_REPLACE_DEBOUNCE_MS = 200

function queryBody(search: string): string {
  return search.startsWith('?') ? search.slice(1) : search
}

/** `1` / `0` / `true` / `false` (case-insensitive). Anything else is ignored. */
export function parseBoolParam(raw: string | null): boolean | undefined {
  if (raw === null) return undefined
  const v = raw.trim().toLowerCase()
  if (v === '1' || v === 'true') return true
  if (v === '0' || v === 'false') return false
  return undefined
}

function clampToConfigLimits(input: SimConfig): SimConfig {
  const next = { ...input }
  for (const key of NUMERIC_KEYS) {
    const lim = CONFIG_LIMITS[key]
    next[key] = Math.min(lim.max, Math.max(lim.min, next[key]))
  }
  return next
}

/**
 * Overlay known query keys onto `base` (defaults). Unknown keys, play, and
 * speed are ignored. `jitter` is an alias of `timeoutJitter` (canonical name
 * wins when both are present). Values are clamped via CONFIG_LIMITS then
 * `normalizeConfig`.
 */
export function parseConfigQuery(
  search: string,
  base: SimConfig = DEFAULT_CONFIG,
): SimConfig {
  const params = new URLSearchParams(queryBody(search))
  const next: SimConfig = { ...base }

  for (const key of NUMERIC_KEYS) {
    const raw = params.get(key)
    if (raw === null) continue
    const trimmed = raw.trim()
    if (trimmed === '') continue
    const n = Number(trimmed)
    if (!Number.isFinite(n)) continue
    next[key] = n
  }

  const stage2 = parseBoolParam(params.get('stage2'))
  if (stage2 !== undefined) next.stage2 = stage2

  const jitter =
    parseBoolParam(params.get('timeoutJitter')) ?? parseBoolParam(params.get('jitter'))
  if (jitter !== undefined) next.timeoutJitter = jitter

  return normalizeConfig(clampToConfigLimits(next))
}

function formatQueryNumber(n: number): string {
  if (Number.isInteger(n)) return String(n)
  const trimmed = n.toFixed(6).replace(/\.?0+$/, '')
  return trimmed.length > 0 ? trimmed : '0'
}

/** Canonical query body (no leading `?`). Booleans are `1` / `0`. */
export function serializeConfigQuery(config: SimConfig): string {
  const normalized = normalizeConfig(clampToConfigLimits(config))
  const params = new URLSearchParams()
  for (const key of QUERY_CONFIG_KEYS) {
    const value = normalized[key]
    if (typeof value === 'boolean') {
      params.set(key, value ? '1' : '0')
    } else if (key === 'S' || key === 'S2') {
      params.set(key, formatQueryNumber(value))
    } else {
      params.set(key, String(value))
    }
  }
  return params.toString()
}

/** Path + canonical query + hash. Does not touch play/speed. */
export function shareableLocation(pathname: string, hash: string, config: SimConfig): string {
  return `${pathname}?${serializeConfigQuery(config)}${hash}`
}

/** Absolute shareable URL for clipboard / navigator.share. Play and speed stay out. */
export function shareableHref(
  origin: string,
  pathname: string,
  hash: string,
  config: SimConfig,
): string {
  return `${origin}${shareableLocation(pathname, hash, config)}`
}
