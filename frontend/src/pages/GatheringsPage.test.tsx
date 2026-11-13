import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ApiError,
  type GatheringAttendanceMember,
  type LifeGroupGathering,
} from '../lib/api'
import { GatheringsPage } from './GatheringsPage'

const LIFE_GROUP_ID = 'group-north'
const lifeGroup = { id: LIFE_GROUP_ID, isActive: true, name: 'North Group' }

const gathering: LifeGroupGathering = {
  attendanceCount: 1,
  createdAt: '2026-08-01T00:00:00.000Z',
  createdBy: { id: 'actor-id', name: 'Lina Leader' },
  gatheringDate: '2026-08-01',
  id: 'gathering-1',
  lifeGroup,
  location: null,
  notes: null,
  title: 'Weekly gathering',
  updatedAt: '2026-08-01T00:00:00.000Z',
}

function member(
  id: string,
  firstName: string,
  isPresent: boolean,
): GatheringAttendanceMember {
  return {
    currentLifeGroup: { id: LIFE_GROUP_ID, name: 'North Group' },
    email: null,
    firstName,
    id,
    isActive: true,
    isEligible: true,
    isPresent,
    lastName: 'Member',
    phone: null,
  }
}

const apiMock = vi.hoisted(() => ({
  createGathering: vi.fn(),
  getGatheringAttendance: vi.fn(),
  getGatheringsPage: vi.fn(),
  markGatheringAttendance: vi.fn(),
  markGatheringVisitorAttendance: vi.fn(),
  removeGatheringAttendance: vi.fn(),
}))

vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api')>()),
  createGathering: apiMock.createGathering,
  getGatheringAttendance: apiMock.getGatheringAttendance,
  getGatheringsPage: apiMock.getGatheringsPage,
  markGatheringAttendance: apiMock.markGatheringAttendance,
  markGatheringVisitorAttendance: apiMock.markGatheringVisitorAttendance,
  removeGatheringAttendance: apiMock.removeGatheringAttendance,
}))

vi.mock('../lib/session', () => ({
  getAccessToken: vi.fn(async () => 'test-token'),
}))

function renderGatheringsPage() {
  return render(
    <MemoryRouter initialEntries={[`/life-groups/${LIFE_GROUP_ID}/gatherings`]}>
      <Routes>
        <Route path="/life-groups/:lifeGroupId/gatherings" element={<GatheringsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

async function openAttendance() {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Actions for Weekly gathering' }))
  await user.click(screen.getByRole('menuitem', { name: 'Manage attendance' }))
  await screen.findByRole('checkbox', { name: /Ana Member/ })
  return user
}

describe('GatheringsPage attendance conflicts', () => {
  beforeEach(() => {
    apiMock.getGatheringsPage.mockResolvedValue({
      items: [gathering],
      lifeGroup,
      meta: { hasMore: false, limit: 50, offset: 0, total: 1 },
    })
    apiMock.getGatheringAttendance.mockResolvedValue({
      members: [member('member-ana', 'Ana', false), member('member-ben', 'Ben', true)],
      visitors: [],
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows the saved state when the person was already marked present', async () => {
    apiMock.markGatheringAttendance.mockRejectedValue(
      new ApiError(409, 'ATTENDANCE_ALREADY_RECORDED', 'Attendance is already recorded.'),
    )
    renderGatheringsPage()
    const user = await openAttendance()

    await user.click(screen.getByRole('checkbox', { name: /Ana Member/ }))

    expect(
      await screen.findByText(
        'Ana Member was already marked present. The list now shows the saved attendance.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Ana Member/ })).toBeChecked()
    expect(screen.getByText('2 present', { selector: 'p' })).toBeInTheDocument()
    expect(screen.queryByText('Attendance is already recorded.')).not.toBeInTheDocument()
  })

  it('shows the saved state when the attendance was already removed', async () => {
    apiMock.removeGatheringAttendance.mockRejectedValue(
      new ApiError(404, 'ATTENDANCE_NOT_FOUND', 'Attendance was not found.'),
    )
    renderGatheringsPage()
    const user = await openAttendance()

    await user.click(screen.getByRole('checkbox', { name: /Ben Member/ }))

    expect(
      await screen.findByText(
        'Ben Member was already marked not present. The list now shows the saved attendance.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Ben Member/ })).not.toBeChecked()
    expect(screen.getByText('0 present', { selector: 'p' })).toBeInTheDocument()
  })

  it('keeps other attendance errors as errors', async () => {
    apiMock.markGatheringAttendance.mockRejectedValue(
      new ApiError(422, 'INACTIVE_MEMBER', 'Attendance requires an active Member.'),
    )
    renderGatheringsPage()
    const user = await openAttendance()

    await user.click(screen.getByRole('checkbox', { name: /Ana Member/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Attendance requires an active Member.',
    )
    expect(screen.getByRole('checkbox', { name: /Ana Member/ })).not.toBeChecked()
  })
})

describe('GatheringsPage start from last Gathering', () => {
  const previousGathering: LifeGroupGathering = {
    ...gathering,
    location: 'Ana’s house',
    notes: 'Prayer requests and minutes',
    title: 'Last week topic',
  }

  function pageWith(items: LifeGroupGathering[]) {
    apiMock.getGatheringsPage.mockResolvedValue({
      items,
      lifeGroup,
      meta: { hasMore: false, limit: 50, offset: 0, total: items.length },
    })
  }

  async function openCreateForm() {
    const user = userEvent.setup()
    renderGatheringsPage()
    await user.click(await screen.findByRole('button', { name: /New Gathering/ }))
    return { user, dialog: await screen.findByRole('dialog') }
  }

  beforeEach(() => {
    apiMock.getGatheringAttendance.mockResolvedValue({
      members: [
        member('member-ana', 'Ana', true),
        member('member-ben', 'Ben', true),
        member('member-cid', 'Cid', false),
        { ...member('member-old', 'Old', true), isActive: false, isEligible: false },
      ],
      visitors: [
        {
          currentLifeGroup: { id: LIFE_GROUP_ID, name: 'North Group' },
          email: null,
          firstName: 'Vee',
          id: 'visitor-vee',
          isEligible: true,
          isPresent: true,
          lastName: 'Visitor',
          phone: null,
          status: 'active',
        },
      ],
    })
    apiMock.createGathering.mockImplementation(async (_token, _groupId, input) => ({
      ...gathering,
      ...input,
      attendanceCount: 0,
      id: 'gathering-new',
    }))
    apiMock.markGatheringAttendance.mockResolvedValue({ isPresent: true })
    apiMock.markGatheringVisitorAttendance.mockResolvedValue({ isPresent: true })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('does not offer the control when there is no previous Gathering', async () => {
    pageWith([])
    const { dialog } = await openCreateForm()

    expect(within(dialog).queryByRole('button', { name: 'Use last Gathering' })).not.toBeInTheDocument()
  })

  it('does not offer the control when editing a Gathering', async () => {
    pageWith([previousGathering])
    const user = userEvent.setup()
    renderGatheringsPage()
    await user.click(await screen.findByRole('button', { name: 'Actions for Last week topic' }))
    await user.click(screen.getByRole('menuitem', { name: 'Edit Gathering' }))
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).queryByRole('button', { name: 'Use last Gathering' })).not.toBeInTheDocument()
  })

  it('copies location and eligible attendees but not topic or notes', async () => {
    pageWith([previousGathering])
    const { user, dialog } = await openCreateForm()

    expect(within(dialog).getByLabelText('Location')).toHaveValue('')
    await user.click(within(dialog).getByRole('button', { name: 'Use last Gathering' }))

    expect(await within(dialog).findByRole('checkbox', { name: /Ana Member/ })).toBeChecked()
    expect(within(dialog).getByRole('checkbox', { name: /Ben Member/ })).toBeChecked()
    expect(within(dialog).getByRole('checkbox', { name: /Vee Visitor/ })).toBeChecked()
    expect(within(dialog).queryByRole('checkbox', { name: /Cid Member/ })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('checkbox', { name: /Old Member/ })).not.toBeInTheDocument()
    expect(
      within(dialog).getByText(
        '1 person from last time can no longer be marked in this Life Group and was left out.',
      ),
    ).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Location')).toHaveValue('Ana’s house')
    expect(within(dialog).getByLabelText(/Topic or title/)).toHaveValue('')
    expect(within(dialog).getByLabelText(/Notes/)).toHaveValue('')
    expect(within(dialog).getByLabelText(/Date/)).toHaveValue('')
  })

  it('marks only the ticked attendees after creating the Gathering', async () => {
    pageWith([previousGathering])
    const { user, dialog } = await openCreateForm()
    await user.click(within(dialog).getByRole('button', { name: 'Use last Gathering' }))
    await user.click(await within(dialog).findByRole('checkbox', { name: /Ben Member/ }))
    await user.type(within(dialog).getByLabelText(/Date/), '2026-08-08')
    await user.click(within(dialog).getByRole('button', { name: 'Create Gathering' }))

    expect(
      await screen.findByText(
        'Gathering on Aug 8, 2026 was created. 2 people were marked present.',
        { exact: false },
      ),
    ).toBeInTheDocument()
    expect(apiMock.createGathering).toHaveBeenCalledWith('test-token', LIFE_GROUP_ID, {
      gatheringDate: '2026-08-08',
      location: 'Ana’s house',
      notes: null,
      title: null,
    })
    expect(apiMock.markGatheringAttendance).toHaveBeenCalledTimes(1)
    expect(apiMock.markGatheringAttendance).toHaveBeenCalledWith(
      'test-token', LIFE_GROUP_ID, 'gathering-new', 'member-ana',
    )
    expect(apiMock.markGatheringVisitorAttendance).toHaveBeenCalledWith(
      'test-token', LIFE_GROUP_ID, 'gathering-new', 'visitor-vee',
    )
  })

  it('reports attendees the server rejects instead of failing the save', async () => {
    pageWith([previousGathering])
    apiMock.markGatheringAttendance.mockImplementation(async (_t, _g, _id, memberId) => {
      if (memberId === 'member-ben') {
        throw new ApiError(422, 'INACTIVE_MEMBER', 'Attendance requires an active Member.')
      }
      return { isPresent: true }
    })
    const { user, dialog } = await openCreateForm()
    await user.click(within(dialog).getByRole('button', { name: 'Use last Gathering' }))
    await within(dialog).findByRole('checkbox', { name: /Ana Member/ })
    await user.type(within(dialog).getByLabelText(/Date/), '2026-08-08')
    await user.click(within(dialog).getByRole('button', { name: 'Create Gathering' }))

    expect(
      await screen.findByText(
        /2 people were marked present\. 1 could not be marked; use Manage attendance to review\./,
      ),
    ).toBeInTheDocument()
  })

  it('clears attendees and undoes the copy', async () => {
    pageWith([previousGathering])
    const { user, dialog } = await openCreateForm()
    await user.click(within(dialog).getByRole('button', { name: 'Use last Gathering' }))
    await within(dialog).findByRole('checkbox', { name: /Ana Member/ })

    await user.click(within(dialog).getByRole('button', { name: 'Clear attendees' }))
    expect(within(dialog).getByRole('checkbox', { name: /Ana Member/ })).not.toBeChecked()
    expect(within(dialog).getByText('0 selected')).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Undo' }))
    expect(within(dialog).queryByRole('checkbox', { name: /Ana Member/ })).not.toBeInTheDocument()
    expect(within(dialog).getByLabelText('Location')).toHaveValue('')

    await user.type(within(dialog).getByLabelText(/Date/), '2026-08-08')
    await user.click(within(dialog).getByRole('button', { name: 'Create Gathering' }))
    await screen.findByText(/was created\.$/)
    expect(apiMock.markGatheringAttendance).not.toHaveBeenCalled()
    expect(apiMock.markGatheringVisitorAttendance).not.toHaveBeenCalled()
  })
})
