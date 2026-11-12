import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '../ui/Button'

interface CopyPasswordButtonProps {
  disabled?: boolean
  value: string
}

type CopyState = 'idle' | 'copied' | 'failed'

const RESET_AFTER_MS = 2000

/** Copies a password the Admin typed so it can be shared exactly as entered. */
export function CopyPasswordButton({ disabled = false, value }: CopyPasswordButtonProps) {
  const [state, setState] = useState<CopyState>('idle')

  useEffect(() => {
    if (state === 'idle') return
    const timer = window.setTimeout(() => setState('idle'), RESET_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [state])

  async function copy() {
    try {
      // The Clipboard API is unavailable on insecure origins or when permission is denied.
      await navigator.clipboard.writeText(value)
      setState('copied')
    } catch {
      setState('failed')
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <Button
        variant="secondary"
        disabled={disabled || value === ''}
        onClick={() => void copy()}
      >
        {state === 'copied' ? (
          <Check aria-hidden="true" className="size-4" />
        ) : (
          <Copy aria-hidden="true" className="size-4" />
        )}
        {state === 'copied' ? 'Copied' : 'Copy password'}
      </Button>
      <span role="status" aria-live="polite" className="text-xs text-muted">
        {state === 'failed' ? 'Copying is unavailable in this browser.' : ''}
      </span>
    </div>
  )
}
