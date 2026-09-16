import { describe, expect, it } from 'vitest'
import { CONFIG_LIMITS, DEFAULT_CONFIG } from '../sim/index.ts'
import {
  parseBoolParam,
  parseConfigQuery,
  QUERY_CONFIG_KEYS,
  serializeConfigQuery,
  shareableLocation,
} from './configQuery.ts'

describe('parseBoolParam', () => {
  it('accepts 1/0/true/false and ignores the rest', () => {
    expect(parseBoolParam('1')).toBe(true)
    expect(parseBoolParam('0')).toBe(false)
    expect(parseBoolParam('true')).toBe(true)
    expect(parseBoolParam('FALSE')).toBe(false)
    expect(parseBoolParam(' yes ')).toBeUndefined()
    expect(parseBoolParam('')).toBeUndefined()
    expect(parseBoolParam(null)).toBeUndefined()
  })
})

describe('parseConfigQuery', () => {
  it('returns defaults for an empty search', () => {
    expect(parseConfigQuery('')).toEqual(DEFAULT_CONFIG)
    expect(parseConfigQuery('?')).toEqual(DEFAULT_CONFIG)
  })

  it('overlays known keys and ignores unknown, play, and speed', () => {
    const cfg = parseConfigQuery(
      '?T=80&N=2&M=12&S=8.5&V_day=500000&stage2=1&S2=40&M2=5&timeoutJitter=true&play=0&speed=400&foo=bar',
    )
    expect(cfg.T).toBe(80)
    expect(cfg.N).toBe(2)
    expect(cfg.M).toBe(12)
    expect(cfg.S).toBe(8.5)
    expect(cfg.V_day).toBe(500_000)
    expect(cfg.stage2).toBe(true)
    expect(cfg.S2).toBe(40)
    expect(cfg.M2).toBe(5)
    expect(cfg.timeoutJitter).toBe(true)
    expect(cfg).not.toHaveProperty('play')
    expect(cfg).not.toHaveProperty('speed')
  })

  it('accepts jitter as an alias of timeoutJitter; canonical name wins', () => {
    expect(parseConfigQuery('?jitter=1').timeoutJitter).toBe(true)
    expect(parseConfigQuery('?jitter=0').timeoutJitter).toBe(false)
    expect(parseConfigQuery('?timeoutJitter=0&jitter=1').timeoutJitter).toBe(false)
    expect(parseConfigQuery('?timeoutJitter=1&jitter=0').timeoutJitter).toBe(true)
  })

  it('ignores invalid numbers and boolean junk, keeping the base value', () => {
    const cfg = parseConfigQuery('?T=nope&S=&stage2=yes&M2=abc', DEFAULT_CONFIG)
    expect(cfg.T).toBe(DEFAULT_CONFIG.T)
    expect(cfg.S).toBe(DEFAULT_CONFIG.S)
    expect(cfg.stage2).toBe(DEFAULT_CONFIG.stage2)
    expect(cfg.M2).toBe(DEFAULT_CONFIG.M2)
  })

  it('clamps numeric keys through CONFIG_LIMITS', () => {
    const high = parseConfigQuery(
      `?T=99999&N=250&M=999&S=500&V_day=500000000&S2=500&M2=999`,
    )
    expect(high.T).toBe(CONFIG_LIMITS.T.max)
    expect(high.N).toBe(CONFIG_LIMITS.N.max)
    expect(high.M).toBe(CONFIG_LIMITS.M.max)
    expect(high.S).toBe(CONFIG_LIMITS.S.max)
    expect(high.V_day).toBe(CONFIG_LIMITS.V_day.max)
    expect(high.S2).toBe(CONFIG_LIMITS.S2.max)
    expect(high.M2).toBe(CONFIG_LIMITS.M2.max)

    const low = parseConfigQuery('?T=0&N=0&M=0&S=0&V_day=-1&S2=0&M2=1')
    expect(low.T).toBe(CONFIG_LIMITS.T.min)
    expect(low.N).toBe(CONFIG_LIMITS.N.min)
    expect(low.M).toBe(CONFIG_LIMITS.M.min)
    expect(low.S).toBe(CONFIG_LIMITS.S.min)
    expect(low.V_day).toBe(CONFIG_LIMITS.V_day.min)
    expect(low.S2).toBe(CONFIG_LIMITS.S2.min)
    expect(low.M2).toBe(CONFIG_LIMITS.M2.min)
  })
})

describe('serializeConfigQuery', () => {
  it('writes canonical keys with 1/0 booleans and never play/speed', () => {
    const qs = serializeConfigQuery({
      ...DEFAULT_CONFIG,
      T: 80,
      stage2: true,
      timeoutJitter: true,
    })
    expect(qs).toContain('T=80')
    expect(qs).toContain('stage2=1')
    expect(qs).toContain('timeoutJitter=1')
    expect(qs).not.toContain('jitter=')
    expect(qs).not.toContain('play=')
    expect(qs).not.toContain('speed=')
    expect(qs.split('&').map((part) => part.split('=')[0])).toEqual([...QUERY_CONFIG_KEYS])
  })

  it('round-trips through parse', () => {
    const original = parseConfigQuery(
      '?T=80&N=2&M=12&S=8.5&V_day=500000&stage2=1&S2=40&M2=5&timeoutJitter=1',
    )
    expect(parseConfigQuery(`?${serializeConfigQuery(original)}`)).toEqual(original)
  })

  it('builds a shareable path+query without touching the hash', () => {
    const loc = shareableLocation(
      '/compaction-simulator/',
      '#hero',
      { ...DEFAULT_CONFIG, N: 8, timeoutJitter: true },
    )
    expect(loc.startsWith('/compaction-simulator/?')).toBe(true)
    expect(loc.endsWith('#hero')).toBe(true)
    expect(loc).toContain('N=8')
    expect(loc).toContain('timeoutJitter=1')
  })
})
