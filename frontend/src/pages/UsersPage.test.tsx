import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ApiError,
  type ApiPage,
  type ManagedUser,
  type PageRequest,
  type UserListFilters,
} from '../lib/api'
import { UsersPage } from './UsersPage'

const apiMock = vi.hoisted(() => ({
  deleteUser: vi.fn<(accessToken: string, userId: string) => Promise<{ id: string }>>(),
  getUser: vi.fn<(accessToken: string, userId: string) => Promise<ManagedUser>>(),
  getUserActivity: vi.fn(async () => []),
  getUsersPage: vi.fn<
    (accessToken: string, filters: UserListFilters, page: PageRequest) => Promise<ApiPage<ManagedUser>>
  >(),
  setUserActive: vi.fn<
    (accessToken: string, userId: string, isActive: boolean) => Promise<ManagedUser>
  >(),
}))

vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api')>()),
  deleteUser: apiMock.deleteUser,
  getUser: apiMock.getUser,
  getUserActivity: apiMock.getUserActivity,
  getUsersPage: apiMock.getUsersPage,
  setUserActive: apiMock.setUserActive,
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
    deletedAt: null,
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

/** Shows the current query string so tests can assert what the page wrote to the URL. */
function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location-search">{location.search}</output>
}

function renderUsersPage(initialEntry = '/users') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <UsersPage />
      <LocationProbe />
    </MemoryRouter>,
  )
}

function currentSearch() {
  return screen.getByTestId('location-search').textContent
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
    renderUsersPage()

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
    renderUsersPage()

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
    renderUsersPage()

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

describe('UsersPage search and filters in the URL', () => {
  beforeEach(() => {
    apiMock.getUsersPage.mockImplementation(serveUsersPage)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('sets a document title without search terms', async () => {
    renderUsersPage('/users?search=ana')
    await screen.findByRole('heading', { name: 'Users', level: 1 })
    expect(document.title).toBe('Users · Horizon')
  })

  it('applies the search and status from the initial URL', async () => {
    renderUsersPage('/users?search=ana&status=inactive')

    await screen.findByText('No Users match these filters')
    expect(apiMock.getUsersPage).toHaveBeenNthCalledWith(
      1,
      'test-token',
      { search: 'ana', status: 'inactive' },
      { limit: 50, offset: 0 },
    )
    expect(screen.getByRole('searchbox', { name: /Search/ })).toHaveValue('ana')
    expect(screen.getByLabelText('Status')).toHaveValue('inactive')
  })

  it('falls back to the default status for an unknown value', async () => {
    renderUsersPage('/users?status=bogus')

    await screen.findByText('Showing 50 of 132')
    expect(apiMock.getUsersPage).toHaveBeenNthCalledWith(
      1,
      'test-token',
      { search: '', status: 'active' },
      { limit: 50, offset: 0 },
    )
    expect(screen.getByLabelText('Status')).toHaveValue('active')
  })

  it('writes a submitted search and status change to the URL', async () => {
    const user = userEvent.setup()
    renderUsersPage()
    await screen.findByText('Showing 50 of 132')
    expect(currentSearch()).toBe('')

    await user.type(screen.getByRole('searchbox', { name: /Search/ }), '  User 1 ')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(currentSearch()).toBe('?search=User+1')

    await user.selectOptions(screen.getByLabelText('Status'), 'all')
    expect(currentSearch()).toBe('?search=User+1&status=all')

    await user.selectOptions(screen.getByLabelText('Status'), 'active')
    expect(currentSearch()).toBe('?search=User+1')
  })

  it('keeps the count live region mounted while loading', async () => {
    renderUsersPage()
    expect(screen.getByText('Loading…')).toHaveAttribute('role', 'status')
    expect(await screen.findByText('132 Users')).toHaveAttribute('role', 'status')
  })

  it('offers Clear search when only the search excludes every User', async () => {
    const user = userEvent.setup()
    renderUsersPage('/users?search=zzz')

    const heading = await screen.findByRole('heading', { name: 'No Users match “zzz”' })
    const emptyState = within(heading.closest('section') as HTMLElement)
    expect(emptyState.getByText('Check the spelling or search by name or email.')).toBeInTheDocument()
    // The inline search Clear and the empty-state action both clear the search.
    expect(screen.getAllByRole('button', { name: 'Clear search' })).toHaveLength(2)

    await user.click(emptyState.getByRole('button', { name: 'Clear search' }))
    expect(currentSearch()).toBe('')
    expect(screen.getByRole('searchbox', { name: /Search/ })).toHaveFocus()
    expect(screen.getByRole('searchbox', { name: /Search/ })).toHaveValue('')
    expect(await screen.findByText('Showing 50 of 132')).toBeInTheDocument()
  })

  it('truncates a long search in the empty-state title', async () => {
    renderUsersPage(`/users?search=${'x'.repeat(45)}`)
    expect(
      await screen.findByRole('heading', { name: `No Users match “${'x'.repeat(40)}…”` }),
    ).toBeInTheDocument()
  })

  it('offers Clear filters when a filter excludes every User', async () => {
    const user = userEvent.setup()
    renderUsersPage('/users?search=zzz&status=inactive')

    expect(
      await screen.findByRole('heading', { name: 'No Users match these filters' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Change or clear the filters to see more Users.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(currentSearch()).toBe('')
    expect(screen.getByRole('searchbox', { name: /Search/ })).toHaveFocus()
    expect(screen.getByLabelText('Status')).toHaveValue('active')
  })

  it('returns focus to the search field after the inline Clear', async () => {
    const user = userEvent.setup()
    renderUsersPage('/users?search=User+1')
    await screen.findByText('Showing 32 of 32')

    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(currentSearch()).toBe('')
    expect(screen.getByRole('searchbox', { name: /Search/ })).toHaveFocus()
  })
})

describe('UsersPage deleted users', () => {
  const deletedUser: ManagedUser = {
    ...managedUser(900),
    deletedAt: '2026-11-10T02:00:00.000Z',
    email: 'gone@example.test',
    isActive: false,
    name: 'Gina Gone',
  }

  function serveSinglePage(users: ManagedUser[]) {
    return Promise.resolve({
      items: users,
      meta: { hasMore: false, limit: 50, offset: 0, total: users.length },
    })
  }

  beforeEach(() => {
    const root = document.createElement('div')
    root.id = 'root'
    document.body.append(root)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    document.getElementById('root')?.remove()
    document.body.style.overflow = ''
  })

  it('lists deleted users read-only under the Deleted status', async () => {
    const user = userEvent.setup()
    apiMock.getUsersPage.mockImplementation(() => serveSinglePage([deletedUser]))
    apiMock.getUser.mockResolvedValue(deletedUser)
    renderUsersPage('/users?status=deleted')

    await screen.findByText('Gina Gone')
    expect(apiMock.getUsersPage).toHaveBeenLastCalledWith(
      'test-token',
      { search: '', status: 'deleted' },
      { limit: 50, offset: 0 },
    )
    expect(screen.getByLabelText('Status')).toHaveValue('deleted')
    const [row] = userRows()
    expect(within(row!).getByText('Deleted')).toBeInTheDocument()
    expect(within(row!).getByText('gone@example.test')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Actions for Gina Gone' }))
    const menu = screen.getByRole('menu', { name: 'Actions for Gina Gone' })
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'View profile',
    ])

    await user.click(within(menu).getByRole('menuitem', { name: 'View profile' }))
    const profile = await screen.findByRole('dialog', { name: 'Gina Gone profile' })
    expect(within(profile).getByText(/^Deleted .*2026/)).toBeInTheDocument()
    expect(within(profile).queryByRole('button', { name: 'Edit user' })).toBeNull()
    expect(apiMock.getUserActivity).toHaveBeenCalledWith('test-token', deletedUser.id)
  })

  it('deletes a user with the soft-delete copy and keeps their history', async () => {
    const user = userEvent.setup()
    const target = managedUser(7)
    apiMock.getUsersPage.mockImplementation(() => serveSinglePage([target]))
    apiMock.deleteUser.mockResolvedValue({ id: target.id })
    renderUsersPage()

    await screen.findByText('User 007')
    await user.click(screen.getByRole('button', { name: 'Actions for User 007' }))
    await user.click(screen.getByRole('menuitem', { name: 'Delete user' }))

    const dialog = screen.getByRole('dialog', { name: 'Delete user?' })
    expect(dialog).toHaveAccessibleDescription(
      "User 007's sign-in will be removed permanently and they will leave the Users list. Their name stays on past Horizon records and in the activity log, and the email can be used for a new account. This cannot be undone.",
    )
    expect(screen.queryByText(/cannot be deleted/)).toBeNull()

    await user.click(within(dialog).getByRole('button', { name: 'Delete user' }))
    expect(apiMock.deleteUser).toHaveBeenCalledWith('test-token', target.id)
    expect(await screen.findByText('User 007 was deleted. Their history was kept.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Delete user?' })).toBeNull()
    expect(screen.queryByRole('table', { name: 'Staff user accounts' })).toBeNull()
  })

  it('shows the last active Admin message when the server refuses a deactivation', async () => {
    const user = userEvent.setup()
    const otherAdmin = { ...managedUser(8), name: 'Other Admin', role: 'admin' as const }
    apiMock.getUsersPage.mockImplementation(() => serveSinglePage([otherAdmin]))
    apiMock.setUserActive.mockRejectedValue(
      new ApiError(409, 'LAST_ACTIVE_ADMIN', 'At least one active Admin is required.'),
    )
    renderUsersPage()

    await screen.findByText('Other Admin')
    await user.click(screen.getByRole('button', { name: 'Actions for Other Admin' }))
    await user.click(screen.getByRole('menuitem', { name: 'Deactivate user' }))
    const dialog = screen.getByRole('dialog', { name: 'Deactivate user?' })
    await user.click(within(dialog).getByRole('button', { name: 'Deactivate user' }))

    expect(
      await within(dialog).findByText('At least one active Admin is required.'),
    ).toBeInTheDocument()
  })
})
