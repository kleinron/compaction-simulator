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
      <button type="button" className="btn" onClick={() => void onShare()}>
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
