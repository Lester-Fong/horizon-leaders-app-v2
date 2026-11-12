import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApiPage, ManagedUser, PageRequest, UserListFilters } from '../lib/api'
import { UsersPage } from './UsersPage'

const apiMock = vi.hoisted(() => ({
  getUsersPage: vi.fn<
    (accessToken: string, filters: UserListFilters, page: PageRequest) => Promise<ApiPage<ManagedUser>>
  >(),
}))

vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api')>()),
  getUsersPage: apiMock.getUsersPage,
}))

vi.mock('../lib/session', () => ({
  getAccessToken: vi.fn(async () => 'test-token'),
}))

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({
    actor: { id: 'admin-id', isActive: true, mustChangePassword: false, name: 'Ada Admin', role: 'admin' },
  }),
}))

const TOTAL_USERS = 132

function managedUser(index: number): ManagedUser {
  const number = String(index).padStart(3, '0')
  return {
    assignedLifeGroup: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    email: `user${number}@example.test`,
    id: `user-${number}`,
    isActive: true,
    lastSignInAt: null,
    name: `User ${number}`,
    role: 'leader',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

const allUsers = Array.from({ length: TOTAL_USERS }, (_, index) => managedUser(index))

/** Serves pages like the API: filtered first, then sliced by limit and offset. */
function serveUsersPage(_token: string, filters: UserListFilters, page: PageRequest) {
  const matching = filters.search
    ? allUsers.filter((user) => user.name.includes(filters.search ?? ''))
    : allUsers
  const items = matching.slice(page.offset, page.offset + page.limit)
  return Promise.resolve({
    items,
    meta: {
      hasMore: page.offset + items.length < matching.length,
      limit: page.limit,
      offset: page.offset,
      total: matching.length,
    },
  })
}

function userRows() {
  const table = screen.getByRole('table', { name: 'Staff user accounts' })
  return within(table).getAllByRole('row').slice(1)
}

describe('UsersPage Load more', () => {
  beforeEach(() => {
    apiMock.getUsersPage.mockImplementation(serveUsersPage)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('loads 50 at a time, announces progress, and hides the button at the end', async () => {
    const user = userEvent.setup()
    render(<UsersPage />)

    const progress = await screen.findByText('Showing 50 of 132')
    expect(progress).toHaveAttribute('role', 'status')
    expect(progress).toHaveAttribute('aria-live', 'polite')
    expect(userRows()).toHaveLength(50)
    expect(apiMock.getUsersPage).toHaveBeenLastCalledWith(
      'test-token',
      { search: '', status: 'active' },
      { limit: 50, offset: 0 },
    )

    await user.click(screen.getByRole('button', { name: 'Load more' }))
    expect(await screen.findByText('Showing 100 of 132')).toBeInTheDocument()
    expect(apiMock.getUsersPage).toHaveBeenLastCalledWith(
      'test-token',
      { search: '', status: 'active' },
      { limit: 50, offset: 50 },
    )

    await user.click(screen.getByRole('button', { name: 'Load more' }))
    expect(await screen.findByText('Showing 132 of 132')).toBeInTheDocument()
    expect(userRows()).toHaveLength(132)
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })

  it('resets to the first page when the search changes', async () => {
    const user = userEvent.setup()
    render(<UsersPage />)

    await screen.findByText('Showing 50 of 132')
    await user.click(screen.getByRole('button', { name: 'Load more' }))
    await screen.findByText('Showing 100 of 132')

    await user.type(screen.getByRole('searchbox', { name: /Search/ }), 'User 1')
    await user.click(screen.getByRole('button', { name: 'Search' }))

    // "User 1" matches only User 100–131.
    expect(await screen.findByText('Showing 32 of 32')).toBeInTheDocument()
    expect(apiMock.getUsersPage).toHaveBeenLastCalledWith(
      'test-token',
      { search: 'User 1', status: 'active' },
      { limit: 50, offset: 0 },
    )
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })

  it('keeps loaded rows and shows an error when a later page fails', async () => {
    const user = userEvent.setup()
    render(<UsersPage />)

    await screen.findByText('Showing 50 of 132')
    apiMock.getUsersPage.mockRejectedValueOnce(new Error('offline'))
    await user.click(screen.getByRole('button', { name: 'Load more' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'User data is unavailable right now. Please try again.',
    )
    expect(userRows()).toHaveLength(50)
    expect(screen.getByRole('button', { name: 'Load more' })).toBeEnabled()
  })
})
