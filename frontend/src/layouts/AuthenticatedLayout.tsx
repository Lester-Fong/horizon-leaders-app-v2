import {
  ArrowUpRight,
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
import { ThemeToggle } from '../components/ui/ThemeToggle'
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
    <nav aria-label="Primary navigation" className="mt-8 flex-1">
      <p className="hm-label px-3">Workspace</p>
      <ul className="mt-3 space-y-0.5">
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
                    'group relative flex min-h-10 items-center gap-3 rounded-control px-3 text-sm transition-colors duration-200 ease-out',
                    isActive
                      ? 'font-semibold text-ink'
                      : 'font-medium text-muted hover:text-ink',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      aria-hidden="true"
                      className={cn(
                        'absolute left-0 h-4 w-px bg-ink transition-opacity',
                        isActive ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <Icon
                      aria-hidden="true"
                      strokeWidth={1.7}
                      className="size-[1.05rem] shrink-0 text-muted transition-colors group-hover:text-ink"
                    />
                    <span>{item.label}</span>
                    {item.adminOnly && (
                      <span className="ml-auto font-mono text-[0.6rem] font-semibold tracking-[0.1em] text-muted uppercase">
                        Admin
                      </span>
                    )}
                    {isActive && (
                      <ArrowUpRight aria-hidden="true" className="ml-auto size-3.5" />
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
      <div className="grid size-9 shrink-0 place-items-center rounded-control border border-ink bg-ink font-mono text-sm font-semibold text-canvas">
        H
      </div>
      <div>
        <p className="text-sm font-semibold tracking-tight text-ink">Horizon Church</p>
        <p className="mt-0.5 font-mono text-[0.625rem] tracking-[0.08em] text-muted uppercase">
          Leaders workspace
        </p>
      </div>
    </div>
  )
}

interface UserAreaProps {
  actor: { name: string; role: string }
  isSigningOut: boolean
  onLogout(): void
}

function UserArea({ actor, isSigningOut, onLogout }: UserAreaProps) {
  return (
    <div className="border-t border-line pt-4">
      <div className="flex items-center gap-3 px-2">
        <div className="grid size-8 shrink-0 place-items-center rounded-full border border-line-strong font-mono text-[0.65rem] font-semibold text-ink">
          {getInitials(actor.name)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{actor.name}</p>
          <p className="mt-0.5 font-mono text-[0.625rem] tracking-[0.08em] text-muted uppercase">
            {actor.role}
          </p>
        </div>
      </div>
      <ThemeToggle className="mt-4 px-2" />
      <Button
        variant="ghost"
        className="mt-2 w-full justify-start"
        isLoading={isSigningOut}
        onClick={onLogout}
      >
        <LogOut aria-hidden="true" className="size-4" />
        Sign out
      </Button>
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
    if (!isMobileNavigationOpen) return

    const menuButton = menuButtonRef.current
    const appRoot = document.getElementById('main-content')
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    if (appRoot) appRoot.inert = true

    const focusableElements = drawerRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )
    focusableElements?.[0]?.focus()

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsMobileNavigationOpen(false)
        return
      }

      if (event.key !== 'Tab' || !focusableElements?.length) return

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
      if (appRoot) appRoot.inert = false
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

  if (!actor) return null

  return (
    <div className="min-h-screen bg-canvas md:grid md:grid-cols-[14rem_minmax(0,1fr)]">
      <a
        href="#main-content"
        className="fixed top-3 left-3 z-[120] -translate-y-20 rounded-control bg-ink px-4 py-2 text-sm font-semibold text-canvas focus:translate-y-0"
      >
        Skip to main content
      </a>

      <aside className="hidden h-screen flex-col border-r border-line bg-canvas px-4 py-5 md:sticky md:top-0 md:flex">
        <div className="px-2 pt-1"><Brand /></div>
        <PrimaryNavigation />
        <UserArea
          actor={actor}
          isSigningOut={isSigningOut}
          onLogout={() => void handleLogout()}
        />
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex min-h-14 items-center justify-between border-b border-line bg-canvas/95 px-4 backdrop-blur-sm sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              ref={menuButtonRef}
              variant="ghost"
              size="sm"
              className="-ml-2 size-10 px-0 md:hidden"
              aria-label="Open navigation"
              aria-expanded={isMobileNavigationOpen}
              aria-controls="mobile-navigation"
              onClick={() => setIsMobileNavigationOpen(true)}
            >
              <Menu aria-hidden="true" className="size-5" />
            </Button>
            <div className="md:hidden"><Brand /></div>
            <p className="hm-label hidden md:block">Horizon / Operations</p>
          </div>

          <div className="flex items-center gap-3">
            <p className="hidden max-w-52 truncate text-xs font-medium text-muted sm:block">
              {actor.name}
            </p>
            <span className="size-1.5 rounded-full bg-ink" aria-label="Account active" />
          </div>
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-[76rem] px-4 py-7 sm:px-6 sm:py-9 lg:px-8 lg:py-11"
        >
          <Outlet />
        </main>
      </div>

      {isMobileNavigationOpen && (
        <div className="hm-overlay-enter fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-[var(--hm-overlay)] backdrop-blur-[2px]"
            onClick={() => setIsMobileNavigationOpen(false)}
          />
          <div
            ref={drawerRef}
            id="mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-label="Main navigation"
            className="hm-dialog-enter relative flex h-full w-[min(88vw,20rem)] flex-col border-r border-line bg-canvas px-4 py-5 shadow-soft"
          >
            <div className="flex items-start justify-between gap-3 px-2">
              <Brand />
              <Button
                variant="ghost"
                size="sm"
                className="-mt-1 size-10 px-0"
                aria-label="Close navigation"
                onClick={() => setIsMobileNavigationOpen(false)}
              >
                <X aria-hidden="true" className="size-5" />
              </Button>
            </div>
            <PrimaryNavigation onNavigate={() => setIsMobileNavigationOpen(false)} />
            <UserArea
              actor={actor}
              isSigningOut={isSigningOut}
              onLogout={() => void handleLogout()}
            />
          </div>
        </div>
      )}
    </div>
  )
}
