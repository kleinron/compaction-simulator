import { useEffect, useState } from 'react'
import { DEFAULT_CONFIG, type SimConfig } from '../sim/index.ts'
import {
  QUERY_REPLACE_DEBOUNCE_MS,
  parseConfigQuery,
  shareableLocation,
} from '../url/configQuery.ts'

/**
 * First load reads `window.location.search` into knobs. Later knob/toggle
 * changes rewrite the query with debounced `history.replaceState` (shareable,
 * no extra history entries). Play and speed stay session-only.
 */
export function useShareableConfig(): [SimConfig, (next: SimConfig) => void] {
  const [config, setConfig] = useState<SimConfig>(() =>
    typeof window === 'undefined' ? DEFAULT_CONFIG : parseConfigQuery(window.location.search),
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const id = window.setTimeout(() => {
      const next = shareableLocation(window.location.pathname, window.location.hash, config)
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
      if (next === current) return
      window.history.replaceState(window.history.state, '', next)
    }, QUERY_REPLACE_DEBOUNCE_MS)
    return () => window.clearTimeout(id)
  }, [config])

  return [config, setConfig]
}
