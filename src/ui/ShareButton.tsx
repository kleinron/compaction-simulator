import { useState } from 'react'
import type { SimConfig } from '../sim/index.ts'
import { shareableHref } from '../url/configQuery.ts'

type Props = {
  config: SimConfig
}

export function ShareButton({ config }: Props) {
  const [feedback, setFeedback] = useState<string | null>(null)

  const onShare = async () => {
    const url = shareableHref(
      window.location.origin,
      window.location.pathname,
      window.location.hash,
      config,
    )
    try {
      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({ title: 'Compaction simulator', url })
          flash('Shared')
          return
        } catch (err) {
          if (isAbort(err)) return
        }
      }
      await copyText(url)
      flash('Copied')
    } catch {
      flash('Copy failed')
    }
  }

  const flash = (text: string) => {
    setFeedback(text)
    window.setTimeout(() => setFeedback((cur) => (cur === text ? null : cur)), 1600)
  }

  return (
    <span className="share-wrap">
      <button type="button" className="share-btn" onClick={() => void onShare()}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
        Share
      </button>
      {feedback ? (
        <span className="share-toast" role="status">
          {feedback}
        </span>
      ) : null}
    </span>
  )
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError'
}

async function copyText(text: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return
    }
  } catch {
    // Permissions or non-secure context — fall through to execCommand.
  }
  const el = document.createElement('textarea')
  el.value = text
  el.setAttribute('readonly', '')
  el.style.position = 'fixed'
  el.style.opacity = '0'
  document.body.appendChild(el)
  el.select()
  const ok = document.execCommand('copy')
  document.body.removeChild(el)
  if (!ok) throw new Error('copy failed')
}
