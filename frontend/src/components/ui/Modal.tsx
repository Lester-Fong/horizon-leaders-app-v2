import { X } from 'lucide-react'
import {
  useEffect,
  useId,
  useRef,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'

import { cn } from '../../lib/cn'
import { Button } from './Button'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

let pageLockCount = 0
let lockedRoot: HTMLElement | null = null
let previousRootInert = false
let previousBodyOverflow = ''

function lockBackground() {
  if (pageLockCount === 0) {
    lockedRoot = document.getElementById('root')
    previousRootInert = lockedRoot?.inert ?? false
    previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    if (lockedRoot) lockedRoot.inert = true
  }
  pageLockCount += 1
}

function unlockBackground() {
  pageLockCount = Math.max(0, pageLockCount - 1)
  if (pageLockCount > 0) return

  document.body.style.overflow = previousBodyOverflow
  if (lockedRoot) lockedRoot.inert = previousRootInert
  lockedRoot = null
}

interface ModalProps {
  children: ReactNode
  className?: string
  description?: string
  isOpen: boolean
  onClose(): void
  preventClose?: boolean
  returnFocusRef?: RefObject<HTMLElement | null>
  title: string
}

export function Modal({
  children,
  className,
  description,
  isOpen,
  onClose,
  preventClose = false,
  returnFocusRef,
  title,
}: ModalProps) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const preventCloseRef = useRef(preventClose)

  useEffect(() => {
    onCloseRef.current = onClose
    preventCloseRef.current = preventClose
  }, [onClose, preventClose])

  useEffect(() => {
    if (!isOpen) return

    const previouslyFocused = returnFocusRef?.current ?? (
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    )
    lockBackground()

    const focusTimer = window.setTimeout(() => {
      const preferredFocus = dialogRef.current?.querySelector<HTMLElement>(
        '[data-modal-autofocus]',
      )
      const focusableElements =
        dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      preferredFocus?.focus()
      if (!preferredFocus) focusableElements?.[0]?.focus()
    }, 0)

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      const openDialogs = Array.from(
        document.querySelectorAll<HTMLElement>('[data-horizon-modal]'),
      )
      if (openDialogs.at(-1) !== dialogRef.current) return

      if (event.key === 'Escape' && !preventCloseRef.current) {
        event.preventDefault()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab') return

      const focusableElements = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
      ).filter((element) => !element.hidden)

      if (focusableElements.length === 0) {
        event.preventDefault()
        dialogRef.current?.focus()
        return
      }

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault()
        lastElement?.focus()
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault()
        firstElement?.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', handleKeyDown)
      unlockBackground()
      previouslyFocused?.focus()
      window.setTimeout(() => {
        if (
          previouslyFocused?.isConnected &&
          (document.activeElement === document.body || !document.activeElement)
        ) {
          previouslyFocused.focus()
        }
      }, 0)
    }
  }, [isOpen, returnFocusRef])

  if (!isOpen) return null

  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && !preventClose) onClose()
  }

  return createPortal(
    <div
      className="hm-overlay-enter fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-[var(--hm-overlay)] p-3 backdrop-blur-[2px] sm:p-6"
      onMouseDown={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        data-horizon-modal
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          'hm-dialog-enter relative my-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-xl overflow-y-auto rounded-modal border border-line bg-canvas p-5 shadow-soft sm:max-h-[calc(100dvh-3rem)] sm:p-7',
          className,
        )}
      >
        <div className="pr-10">
          <p className="hm-label">Horizon / Action</p>
          <h2 id={titleId} className="mt-2 text-xl font-semibold tracking-tight text-ink">
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className="mt-2 text-sm leading-6 text-muted">
              {description}
            </p>
          )}
        </div>
        <Button
          aria-label="Close dialog"
          className="absolute top-4 right-4 size-10 px-0"
          disabled={preventClose}
          onClick={onClose}
          size="sm"
          variant="ghost"
        >
          <X aria-hidden="true" className="size-4" />
        </Button>
        <div className="mt-6">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
