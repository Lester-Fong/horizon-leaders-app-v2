import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  ApiPage,
  FollowUp,
  FollowUpListFilters,
  FollowUpStatus,
  LifeGroup,
  PageRequest,
} from '../lib/api'
import { FollowUpsPage } from './FollowUpsPage'

const LIFE_GROUP_ID = '6f1c1e2a-3b4d-4c5e-8f60-718293a4b5c6'

const testState = vi.hoisted(() => ({
  role: 'leader' as 'admin' | 'leader',
}))

const apiMock = vi.hoisted(() => ({
  getFollowUpsPage: vi.fn<
    (
      accessToken: string,
      status: FollowUpStatus,
      page: PageRequest,
      filters?: FollowUpListFilters,
    ) => Promise<ApiPage<FollowUp>>
  >(),
  getLifeGroups: vi.fn<(accessToken: string) => Promise<LifeGroup[]>>(async () => []),
}))

vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api')>()),
  getFollowUpsPage: apiMock.getFollowUpsPage,
  getLifeGroups: apiMock.getLifeGroups,
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

function emptyPage(page: PageRequest): ApiPage<FollowUp> {
  return { items: [], meta: { hasMore: false, limit: page.limit, offset: page.offset, total: 0 } }
}

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location-search">{location.search}</output>
}

function renderPage(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <FollowUpsPage />
      <LocationProbe />
    </MemoryRouter>,
  )
}

function lastFilters() {
  return apiMock.getFollowUpsPage.mock.calls.at(-1)?.[3]
}

describe('FollowUpsPage filters', () => {
  beforeEach(() => {
    apiMock.getFollowUpsPage.mockImplementation(async (_token, _status, page) => emptyPage(page))
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('loads the unfiltered shared list by default', async () => {
    testState.role = 'leader'
    renderPage('/follow-up')
    expect(await screen.findByRole('heading', { name: 'No active Follow Ups' })).toBeInTheDocument()
    expect(apiMock.getFollowUpsPage).toHaveBeenCalledWith('test-token', 'active', { limit: 50, offset: 0 }, {})
  })

  it('reads filters from the URL and ignores the Admin-only Life Group for a Leader', async () => {
    testState.role = 'leader'
    renderPage(`/follow-up?reason=harvest_sunday_interest&lifeGroup=mine&from=2026-11-01&to=2026-11-30&lifeGroupId=${LIFE_GROUP_ID}`)
    expect(await screen.findByRole('heading', { name: 'No active Follow Ups match these filters' })).toBeInTheDocument()
    expect(lastFilters()).toEqual({
      from: '2026-11-01',
      lifeGroup: 'mine',
      reason: 'harvest_sunday_interest',
      to: '2026-11-30',
    })
    expect(screen.getByLabelText('Reason')).toHaveValue('harvest_sunday_interest')
    expect(screen.getByLabelText('Life Group')).toHaveValue('mine')
  })

  it('writes Leader filter changes to the URL and reloads with them', async () => {
    testState.role = 'leader'
    const user = userEvent.setup()
    renderPage('/follow-up')
    await screen.findByRole('heading', { name: 'No active Follow Ups' })

    await user.selectOptions(screen.getByLabelText('Reason'), 'consecutive_sunday_absence')
    await user.selectOptions(screen.getByLabelText('Life Group'), 'mine')

    await waitFor(() => expect(lastFilters()).toEqual({ lifeGroup: 'mine', reason: 'consecutive_sunday_absence' }))
    const search = new URLSearchParams(screen.getByTestId('location-search').textContent ?? '')
    expect(search.get('reason')).toBe('consecutive_sunday_absence')
    expect(search.get('lifeGroup')).toBe('mine')
  })

  it('offers Admins any Life Group and sends it as lifeGroupId', async () => {
    testState.role = 'admin'
    apiMock.getLifeGroups.mockResolvedValue([
      { id: LIFE_GROUP_ID, isActive: true, name: 'North' } as LifeGroup,
    ])
    const user = userEvent.setup()
    renderPage('/follow-up?lifeGroup=mine')
    await screen.findByRole('option', { name: 'North' })
    // `lifeGroup=mine` is the Leader option and is ignored for an Admin.
    expect(lastFilters()).toEqual({})

    await user.selectOptions(screen.getByLabelText('Life Group'), LIFE_GROUP_ID)
    await waitFor(() => expect(lastFilters()).toEqual({ lifeGroupId: LIFE_GROUP_ID }))
  })

  it('shows an inverted date range error without requesting the list, and clears filters', async () => {
    testState.role = 'leader'
    const user = userEvent.setup()
    renderPage('/follow-up?from=2026-12-01&to=2026-11-01&reason=opencell_high_participation')
    expect(await screen.findByRole('alert')).toHaveTextContent('The From date must be on or before the To date.')
    expect(apiMock.getFollowUpsPage).not.toHaveBeenCalled()

    await user.clear(screen.getByLabelText('Triggered from'))
    await waitFor(() => expect(lastFilters()).toEqual({ reason: 'opencell_high_participation', to: '2026-11-01' }))
    await user.click(await screen.findByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(lastFilters()).toEqual({}))
    expect(screen.getByTestId('location-search')).toHaveTextContent(/^$/)
  })
})
