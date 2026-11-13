import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { LeaderOption, LifeGroup, LifeGroupInput } from '../lib/api'
import { LifeGroupsPage } from './LifeGroupsPage'

const testState = vi.hoisted(() => ({
  role: 'admin' as 'admin' | 'leader',
}))

const ACTOR_ID = 'actor-id'

function lifeGroup(
  id: string,
  name: string,
  leader: Partial<LifeGroup['leader']> & { id: string; name: string },
  isActive = true,
): LifeGroup {
  return {
    createdAt: '2026-08-01T00:00:00.000Z',
    description: null,
    id,
    isActive,
    leader: { isActive: true, isDeleted: false, ...leader },
    name,
    updatedAt: '2026-08-01T00:00:00.000Z',
  }
}

const northGroup = lifeGroup('group-north', 'North Group', { id: ACTOR_ID, name: 'Lina Leader' })
const southGroup = lifeGroup('group-south', 'South Group', { id: 'leader-sam', name: 'Sam Shepherd' })
const westGroup = lifeGroup(
  'group-west',
  'West Group',
  { id: 'leader-dee', isActive: false, isDeleted: true, name: 'Dee Removed' },
  false,
)

const leaderOptions: LeaderOption[] = [
  {
    assignedLifeGroup: { id: northGroup.id, isActive: true, name: northGroup.name },
    id: ACTOR_ID,
    isActive: true,
    isDeleted: false,
    name: 'Lina Leader',
  },
  {
    assignedLifeGroup: { id: southGroup.id, isActive: true, name: southGroup.name },
    id: 'leader-sam',
    isActive: true,
    isDeleted: false,
    name: 'Sam Shepherd',
  },
  {
    assignedLifeGroup: null,
    id: 'leader-free',
    isActive: true,
    isDeleted: false,
    name: 'Fay Free',
  },
]

const apiMock = vi.hoisted(() => ({
  createLifeGroup: vi.fn<(accessToken: string, input: LifeGroupInput) => Promise<LifeGroup>>(),
  getLeaderOptions: vi.fn<(accessToken: string) => Promise<LeaderOption[]>>(),
  getLifeGroups: vi.fn<(accessToken: string) => Promise<LifeGroup[]>>(),
}))

vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api')>()),
  createLifeGroup: apiMock.createLifeGroup,
  getLeaderOptions: apiMock.getLeaderOptions,
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

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location-search">{location.search}</output>
}

function renderLifeGroupsPage(initialEntry = '/life-groups') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LifeGroupsPage />
      <LocationProbe />
    </MemoryRouter>,
  )
}

async function groupNames() {
  const table = await screen.findByRole('table')
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0].querySelector('p')?.textContent)
}

describe('LifeGroupsPage search and status in the URL', () => {
  beforeEach(() => {
    testState.role = 'admin'
    apiMock.getLifeGroups.mockResolvedValue([northGroup, southGroup, westGroup])
    apiMock.getLeaderOptions.mockResolvedValue(leaderOptions)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows every Life Group to Admin by default', async () => {
    renderLifeGroupsPage()

    expect(await groupNames()).toEqual(['North Group', 'South Group', 'West Group'])
    expect(screen.getByLabelText('Status', { selector: 'select' })).toHaveValue('all')
    expect(screen.getByText('3 Life Groups')).toHaveAttribute('role', 'status')
  })

  it('applies status and search from the URL', async () => {
    renderLifeGroupsPage('/life-groups?status=archived&search=west')

    expect(await groupNames()).toEqual(['West Group'])
    expect(screen.getByLabelText('Status', { selector: 'select' })).toHaveValue('archived')
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('west')
    expect(screen.getByText('1 Life Group')).toHaveAttribute('role', 'status')
  })

  it('falls back to All for an unknown status', async () => {
    renderLifeGroupsPage('/life-groups?status=bogus')

    expect(await groupNames()).toEqual(['North Group', 'South Group', 'West Group'])
    expect(screen.getByLabelText('Status', { selector: 'select' })).toHaveValue('all')
  })

  it('matches the Leader name as well as the Life Group name', async () => {
    renderLifeGroupsPage('/life-groups?search=SHEPHERD')

    expect(await groupNames()).toEqual(['South Group'])
  })

  it('updates the URL when the status changes', async () => {
    const user = userEvent.setup()
    renderLifeGroupsPage()

    await groupNames()
    await user.selectOptions(screen.getByLabelText('Status', { selector: 'select' }), 'active')

    expect(screen.getByTestId('location-search')).toHaveTextContent('?status=active')
    expect(await groupNames()).toEqual(['North Group', 'South Group'])
  })

  it('shows a filtered empty state whose Clear returns focus to the search', async () => {
    const user = userEvent.setup()
    renderLifeGroupsPage('/life-groups?search=nobody')

    const heading = await screen.findByRole('heading', { name: 'No Life Groups match “nobody”' })
    expect(screen.getByText('0 Life Groups')).toHaveAttribute('role', 'status')
    const emptyState = within(heading.closest('section') as HTMLElement)
    await user.click(emptyState.getByRole('button', { name: 'Clear search' }))

    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveFocus()
    expect(screen.getByTestId('location-search')).toHaveTextContent('')
    expect(await groupNames()).toEqual(['North Group', 'South Group', 'West Group'])
  })

  it('shows a filter empty state for a status with no Life Groups', async () => {
    apiMock.getLifeGroups.mockResolvedValue([northGroup, southGroup])
    renderLifeGroupsPage('/life-groups?status=archived')

    expect(
      await screen.findByRole('heading', { name: 'No Life Groups match these filters' }),
    ).toBeInTheDocument()
  })
})

describe('LifeGroupsPage for a Leader', () => {
  beforeEach(() => {
    testState.role = 'leader'
    apiMock.getLifeGroups.mockResolvedValue([northGroup, southGroup])
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('has no status filter and ignores a status in the URL', async () => {
    renderLifeGroupsPage('/life-groups?status=archived')

    expect(await groupNames()).toEqual(['North Group', 'South Group'])
    expect(screen.queryByLabelText('Status', { selector: 'select' })).not.toBeInTheDocument()
    expect(screen.getByText('Scope: Active Life Groups / Read only')).toBeInTheDocument()
    expect(apiMock.getLeaderOptions).not.toHaveBeenCalled()
  })

  it('offers Gatherings and the roster only for the Leader’s own Life Group', async () => {
    const user = userEvent.setup()
    renderLifeGroupsPage()

    await groupNames()
    expect(screen.queryByRole('button', { name: 'Actions for South Group' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Actions for North Group' }))
    expect(screen.getByRole('menuitem', { name: 'View Gatherings' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'View current roster' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Edit Life Group' })).not.toBeInTheDocument()
  })
})

describe('LifeGroupsPage Leader markers and form', () => {
  beforeEach(() => {
    testState.role = 'admin'
    apiMock.getLifeGroups.mockResolvedValue([northGroup, southGroup, westGroup])
    apiMock.getLeaderOptions.mockResolvedValue(leaderOptions)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('marks a deleted Leader of an archived Life Group only once', async () => {
    renderLifeGroupsPage()

    await groupNames()
    const westRow = screen.getByText('West Group').closest('tr') as HTMLElement
    expect(within(westRow).getByText('Dee Removed (deleted)')).toBeInTheDocument()
    expect(within(westRow).queryByText(/Leader profile/)).not.toBeInTheDocument()
  })

  it('warns about a duplicate name without blocking the save', async () => {
    const user = userEvent.setup()
    const created = lifeGroup('group-new', 'north group', { id: 'leader-free', name: 'Fay Free' })
    apiMock.createLifeGroup.mockResolvedValue(created)
    renderLifeGroupsPage()

    await groupNames()
    await user.click(screen.getByRole('button', { name: 'New Life Group' }))
    const nameInput = screen.getByLabelText(/^Name/)
    await user.type(nameInput, ' North group ')

    const warning = 'A Life Group named “North Group” already exists. You can still save.'
    expect(screen.getByText(warning)).toHaveAttribute('id', 'life-group-name-warning')
    expect(nameInput).toHaveAttribute('aria-describedby', 'life-group-name-warning')

    await user.selectOptions(screen.getByLabelText(/^Leader/), 'leader-free')
    await user.click(screen.getByRole('button', { name: 'Create Life Group' }))

    expect(apiMock.createLifeGroup).toHaveBeenCalledWith('test-token', {
      description: null,
      leaderProfileId: 'leader-free',
      name: 'North group',
    })
    expect(await screen.findByText('north group was created.')).toBeInTheDocument()
  })

  it('does not warn about the Life Group being edited', async () => {
    const user = userEvent.setup()
    renderLifeGroupsPage()

    await groupNames()
    await user.click(screen.getByRole('button', { name: 'Actions for South Group' }))
    await user.click(screen.getByRole('menuitem', { name: 'Edit Life Group' }))

    expect(screen.getByLabelText(/^Name/)).toHaveValue('South Group')
    expect(document.getElementById('life-group-name-warning')).toHaveTextContent('')
  })

  it('reports a Leader list refresh failure on the page after a save', async () => {
    const user = userEvent.setup()
    apiMock.getLeaderOptions
      .mockResolvedValueOnce(leaderOptions)
      .mockRejectedValueOnce(new Error('offline'))
    apiMock.createLifeGroup.mockResolvedValue(
      lifeGroup('group-east', 'East Group', { id: 'leader-free', name: 'Fay Free' }),
    )
    renderLifeGroupsPage()

    await groupNames()
    await user.click(screen.getByRole('button', { name: 'New Life Group' }))
    await user.type(screen.getByLabelText(/^Name/), 'East Group')
    await user.selectOptions(screen.getByLabelText(/^Leader/), 'leader-free')
    await user.click(screen.getByRole('button', { name: 'Create Life Group' }))

    expect(
      await screen.findByText(
        'The Life Group was saved, but the Leader list could not be refreshed. Use Refresh to try again.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await groupNames()).toEqual(['East Group', 'North Group', 'South Group', 'West Group'])
  })
})
