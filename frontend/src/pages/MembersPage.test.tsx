import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ApiError,
  type ApiPage,
  type LifeGroup,
  type MemberListFilters,
  type MemberSummary,
  type PageRequest,
} from '../lib/api'
import { MembersPage } from './MembersPage'

const LIFE_GROUP_ID = '6f1c1e2a-3b4d-4c5e-8f60-718293a4b5c6'

const testState = vi.hoisted(() => ({
  role: 'admin' as 'admin' | 'leader',
}))

const apiMock = vi.hoisted(() => ({
  archiveMember: vi.fn<(accessToken: string, memberId: string) => Promise<MemberSummary>>(),
  getLifeGroups: vi.fn<(accessToken: string) => Promise<LifeGroup[]>>(async () => []),
  getMembersPage: vi.fn<
    (
      accessToken: string,
      filters: MemberListFilters,
      page: PageRequest,
    ) => Promise<ApiPage<MemberSummary>>
  >(),
}))

vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api')>()),
  archiveMember: apiMock.archiveMember,
  getLifeGroups: apiMock.getLifeGroups,
  getMembersPage: apiMock.getMembersPage,
}))

vi.mock('../lib/session', () => ({
  getAccessToken: vi.fn(async () => 'test-token'),
}))

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({
    actor: {
      id: 'actor-id',
      isActive: true,
      mustChangePassword: false,
      name: 'Test Actor',
      role: testState.role,
    },
  }),
}))

function emptyPage(page: PageRequest): ApiPage<MemberSummary> {
  return { items: [], meta: { hasMore: false, limit: page.limit, offset: page.offset, total: 0 } }
}

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location-search">{location.search}</output>
}

function renderMembersPage(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <MembersPage />
      <LocationProbe />
    </MemoryRouter>,
  )
}

describe('MembersPage URL filters', () => {
  beforeEach(() => {
    apiMock.getMembersPage.mockImplementation(async (_token, _filters, page) => emptyPage(page))
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('ignores Admin-only status and Life Group params for a Leader', async () => {
    testState.role = 'leader'
    renderMembersPage(`/members?status=archived&lifeGroupId=${LIFE_GROUP_ID}`)

    // Without a role-allowed filter, an empty list is the no-records state.
    expect(await screen.findByRole('heading', { name: 'No Members yet' })).toBeInTheDocument()
    expect(apiMock.getMembersPage).toHaveBeenCalledTimes(1)
    expect(apiMock.getMembersPage).toHaveBeenCalledWith(
      'test-token',
      {},
      { limit: 50, offset: 0 },
    )
    expect(document.title).toBe('Members · Horizon')
  })

  it('sends Admin filters from the URL and ignores a malformed Life Group ID', async () => {
    testState.role = 'admin'
    renderMembersPage('/members?status=archived&lifeGroupId=not-a-uuid&gender=female&age=bogus')

    await screen.findByRole('heading', { name: 'No Members match these filters' })
    expect(apiMock.getMembersPage).toHaveBeenCalledWith(
      'test-token',
      { gender: 'female', status: 'archived' },
      { limit: 50, offset: 0 },
    )
  })

  it('clears every filter from the empty state and focuses the search', async () => {
    testState.role = 'admin'
    const user = userEvent.setup()
    renderMembersPage(`/members?search=ana&gender=male&lifeGroupId=${LIFE_GROUP_ID}`)

    const heading = await screen.findByRole('heading', { name: 'No Members match these filters' })
    const emptyState = within(heading.closest('section') as HTMLElement)
    expect(
      emptyState.getByText('Change or clear the filters to see more Members.'),
    ).toBeInTheDocument()

    await user.click(emptyState.getByRole('button', { name: 'Clear filters' }))

    expect(screen.getByTestId('location-search').textContent).toBe('')
    expect(screen.getByRole('searchbox', { name: /Search/ })).toHaveFocus()
    expect(screen.getByRole('searchbox', { name: /Search/ })).toHaveValue('')
    expect(await screen.findByRole('heading', { name: 'No Members yet' })).toBeInTheDocument()
    expect(apiMock.getMembersPage).toHaveBeenLastCalledWith(
      'test-token',
      { status: 'active' },
      { limit: 50, offset: 0 },
    )
  })
})

describe('MembersPage archive', () => {
  const lifeGroup: LifeGroup = {
    createdAt: '2026-11-01T00:00:00.000Z',
    description: null,
    id: LIFE_GROUP_ID,
    isActive: true,
    leader: { id: 'leader-id', isActive: true, isDeleted: false, name: 'Lee Leader' },
    name: 'North',
    updatedAt: '2026-11-01T00:00:00.000Z',
  }
  const member: MemberSummary = {
    address: null,
    birthDate: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    email: null,
    firstName: 'Ana',
    gender: null,
    id: '7a2d2f3b-4c5e-4d6f-8a71-8293a4b5c6d7',
    isActive: true,
    lastName: 'Cruz',
    lifeGroup: { id: LIFE_GROUP_ID, isActive: true, name: 'North' },
    phone: null,
    updatedAt: '2026-11-01T00:00:00.000Z',
  }

  beforeEach(() => {
    testState.role = 'admin'
    apiMock.getLifeGroups.mockResolvedValue([lifeGroup])
    apiMock.getMembersPage.mockImplementation(async (_token, _filters, page) => ({
      items: [member],
      meta: { hasMore: false, limit: page.limit, offset: page.offset, total: 1 },
    }))
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows an archive failure inside the open dialog without blocking New Member', async () => {
    const user = userEvent.setup()
    apiMock.archiveMember.mockRejectedValueOnce(
      new ApiError(409, 'MEMBER_NOT_ACTIVE', 'This Member is already archived.'),
    )
    renderMembersPage('/members')

    await user.click(await screen.findByRole('button', { name: 'Actions for Ana Cruz' }))
    await user.click(screen.getByRole('menuitem', { name: 'Archive Member' }))
    const dialog = screen.getByRole('dialog', { name: 'Archive Member?' })
    await user.click(within(dialog).getByRole('button', { name: 'Archive Member' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'This Member is already archived.',
    )
    expect(screen.getByRole('button', { name: 'New Member' })).toBeEnabled()

    // Closing and reopening the dialog starts without the old error.
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Actions for Ana Cruz' }))
    await user.click(screen.getByRole('menuitem', { name: 'Archive Member' }))
    expect(
      within(screen.getByRole('dialog', { name: 'Archive Member?' })).queryByRole('alert'),
    ).not.toBeInTheDocument()
  })
})
