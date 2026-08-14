import {
  BookOpen,
  CalendarDays,
  HandHeart,
  HeartHandshake,
  LayoutDashboard,
  LogOut,
  Menu,
  UserPlus,
  Users,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'

import { useAuth } from '../auth/useAuth'
import { Button } from '../components/ui/Button'
import { StatusBadge } from '../components/ui/StatusBadge'
import { cn } from '../lib/cn'

interface NavigationItem {
  adminOnly?: boolean
  end?: boolean
  icon: LucideIcon
  label: string
  to: string
}

const navigationItems: NavigationItem[] = [
  { end: true, icon: LayoutDashboard, label: 'Dashboard', to: '/' },
  { icon: UsersRound, label: 'Members', to: '/members' },
  { icon: HandHeart, label: 'Ministries', to: '/ministries' },
  { icon: Users, label: 'Life Groups', to: '/life-groups' },
  { icon: CalendarDays, label: 'Events', to: '/events' },
  { icon: UserPlus, label: 'Visitors', to: '/visitors' },
  { icon: HeartHandshake, label: 'Follow Up', to: '/follow-up' },
  { icon: BookOpen, label: 'OpenCell', to: '/opencell' },
  { adminOnly: true, icon: Users, label: 'Users', to: '/users' },
]

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

interface NavigationProps {
  onNavigate?: () => void
}

function PrimaryNavigation({ onNavigate }: NavigationProps) {
  const { actor } = useAuth()
  const visibleItems = navigationItems.filter(
    (item) => !item.adminOnly || actor?.role === 'admin',
  )

  return (
    <nav aria-label="Primary navigation" className="mt-7 flex-1">
      <ul className="space-y-1">
        {visibleItems.map((item) => {
          const Icon = item.icon

          return (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'group flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold',
                    isActive
                      ? 'bg-primary-soft text-primary-strong'
                      : 'text-muted hover:bg-surface-subtle hover:text-ink',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      aria-hidden="true"
                      className={cn(
                        'size-5 shrink-0',
                        isActive
                          ? 'text-primary'
                          : 'text-muted group-hover:text-ink',
                      )}
                    />
                    <span>{item.label}</span>
                    {item.adminOnly && (
                      <span className="ml-auto text-[0.65rem] font-bold tracking-wider text-muted uppercase">
                        Admin
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-lg font-bold text-white shadow-sm">
        H
      </div>
      <div>
        <p className="font-bold tracking-tight text-ink">Horizon Church</p>
        <p className="text-xs font-medium text-muted">Leaders workspace</p>
      </div>
    </div>
  )
}

export function AuthenticatedLayout() {
  const { actor, logout } = useAuth()
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const drawerRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isMobileNavigationOpen) {
      return
    }

    const menuButton = menuButtonRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const focusableElements = drawerRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )
    focusableElements?.[0]?.focus()

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsMobileNavigationOpen(false)
        return
      }

      if (event.key !== 'Tab' || !focusableElements?.length) {
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
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow

      menuButton?.focus()
    }
  }, [isMobileNavigationOpen])

  async function handleLogout() {
    setIsSigningOut(true)

    try {
      await logout()
    } finally {
      setIsSigningOut(false)
    }
  }

  if (!actor) {
    return null
  }

  return (
    <div className="min-h-screen bg-canvas md:grid md:grid-cols-[17rem_minmax(0,1fr)]">
      <a
        href="#main-content"
        className="fixed top-3 left-3 z-[70] -translate-y-20 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white focus:translate-y-0"
      >
        Skip to main content
      </a>

      <aside className="hidden h-screen flex-col border-r border-line bg-surface px-4 py-5 md:sticky md:top-0 md:flex">
        <div className="px-2">
          <Brand />
        </div>
        <PrimaryNavigation />
        <div className="mt-5 border-t border-line pt-4">
          <div className="flex items-center gap-3 rounded-xl bg-surface-subtle p-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-bold text-primary-strong">
              {getInitials(actor.name)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{actor.name}</p>
              <p className="mt-0.5 text-xs capitalize text-muted">{actor.role}</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between border-b border-line bg-surface/95 px-4 backdrop-blur-sm sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              ref={menuButtonRef}
              variant="ghost"
              size="sm"
              className="-ml-2 px-2 md:hidden"
              aria-label="Open navigation"
              aria-expanded={isMobileNavigationOpen}
              aria-controls="mobile-navigation"
              onClick={() => setIsMobileNavigationOpen(true)}
            >
              <Menu aria-hidden="true" className="size-5" />
            </Button>
            <div className="md:hidden">
              <p className="truncate text-sm font-bold text-ink">Horizon Church</p>
              <p className="text-xs text-muted">Leaders workspace</p>
            </div>
            <p className="hidden text-sm font-semibold text-muted md:block">
              Horizon operations
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="max-w-52 truncate text-sm font-semibold text-ink">
                {actor.name}
              </p>
              <p className="text-xs capitalize text-muted">{actor.role}</p>
            </div>
            <StatusBadge tone="success" className="hidden lg:inline-flex">
              Active
            </StatusBadge>
            <Button
              variant="ghost"
              size="sm"
              isLoading={isSigningOut}
              className="hidden md:inline-flex"
              onClick={() => void handleLogout()}
            >
              <LogOut aria-hidden="true" className="size-4" />
              Sign out
            </Button>
          </div>
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-[80rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10"
        >
          <Outlet />
        </main>
      </div>

      {isMobileNavigationOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-ink/45"
            onClick={() => setIsMobileNavigationOpen(false)}
          />
          <div
            ref={drawerRef}
            id="mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-label="Main navigation"
            className="relative flex h-full w-[min(88vw,20rem)] flex-col bg-surface px-4 py-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 px-2">
              <Brand />
              <Button
                variant="ghost"
                size="sm"
                className="-mt-1 px-2"
                aria-label="Close navigation"
                onClick={() => setIsMobileNavigationOpen(false)}
              >
                <X aria-hidden="true" className="size-5" />
              </Button>
            </div>
            <PrimaryNavigation
              onNavigate={() => setIsMobileNavigationOpen(false)}
            />
            <div className="mt-5 border-t border-line pt-4">
              <div className="mb-3 flex items-center gap-3 px-2">
                <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-bold text-primary-strong">
                  {getInitials(actor.name)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">
                    {actor.name}
                  </p>
                  <p className="text-xs capitalize text-muted">{actor.role}</p>
                </div>
              </div>
              <Button
                variant="secondary"
                className="w-full"
                isLoading={isSigningOut}
                onClick={() => void handleLogout()}
              >
                <LogOut aria-hidden="true" className="size-4" />
                Sign out
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
