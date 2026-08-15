import { MoreHorizontal, type LucideIcon } from 'lucide-react'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'

import { Button } from './Button'

export interface RowAction {
  disabled?: boolean
  icon: LucideIcon
  label: string
  onSelect(): void
}

interface RowActionsMenuProps {
  actions: RowAction[]
  disabled?: boolean
  label: string
}

export function RowActionsMenu({
  actions,
  disabled = false,
  label,
}: RowActionsMenuProps) {
  const menuId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState({ left: 0, top: 0 })

  useEffect(() => {
    if (!isOpen) return

    const trigger = triggerRef.current
    const rect = trigger?.getBoundingClientRect()
    if (rect) {
      setPosition({
        left: Math.max(12, Math.min(rect.right - 180, window.innerWidth - 192)),
        top: Math.min(rect.bottom + 6, window.innerHeight - 132),
      })
    }

    const firstAction = menuRef.current?.querySelector<HTMLButtonElement>(
      'button:not([disabled])',
    )
    firstAction?.focus()

    function handlePointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !menuRef.current?.contains(event.target) &&
        !triggerRef.current?.contains(event.target)
      ) {
        setIsOpen(false)
      }
    }

    function closeForViewportChange() {
      setIsOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('resize', closeForViewportChange)
    window.addEventListener('scroll', closeForViewportChange, true)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('resize', closeForViewportChange)
      window.removeEventListener('scroll', closeForViewportChange, true)
    }
  }, [isOpen])

  function closeAndRestoreFocus() {
    setIsOpen(false)
    triggerRef.current?.focus()
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const menuButtons = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        'button:not([disabled])',
      ) ?? [],
    )
    const currentIndex = menuButtons.indexOf(
      document.activeElement as HTMLButtonElement,
    )

    if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape') event.preventDefault()
      closeAndRestoreFocus()
      return
    }

    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()

    if (event.key === 'Home') menuButtons[0]?.focus()
    if (event.key === 'End') menuButtons[menuButtons.length - 1]?.focus()
    if (event.key === 'ArrowDown') {
      menuButtons[(currentIndex + 1) % menuButtons.length]?.focus()
    }
    if (event.key === 'ArrowUp') {
      menuButtons[(currentIndex - 1 + menuButtons.length) % menuButtons.length]?.focus()
    }
  }

  return (
    <>
      <Button
        ref={triggerRef}
        aria-label={label}
        aria-controls={isOpen ? menuId : undefined}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="size-10 px-0"
        disabled={disabled}
        onClick={() => setIsOpen((current) => !current)}
        size="sm"
        variant="ghost"
      >
        <MoreHorizontal aria-hidden="true" className="size-5" />
      </Button>

      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            onKeyDown={handleMenuKeyDown}
            className="fixed z-[90] w-45 rounded-card border border-line bg-canvas p-1.5 shadow-soft"
            style={{ left: position.left, top: position.top }}
          >
            {actions.map((action) => {
              const Icon = action.icon
              return (
                <button
                  key={action.label}
                  type="button"
                  role="menuitem"
                  disabled={action.disabled}
                  onClick={() => {
                    closeAndRestoreFocus()
                    action.onSelect()
                  }}
                  className="flex min-h-10 w-full items-center gap-2.5 rounded-control px-3 text-left text-sm font-medium text-ink transition-colors hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Icon aria-hidden="true" className="size-4 text-muted" />
                  {action.label}
                </button>
              )
            })}
          </div>,
          document.body,
        )}
    </>
  )
}
