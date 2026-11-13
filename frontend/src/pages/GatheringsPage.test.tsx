import { cleanup, render, screen } from '@testing-library/react'
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
  getGatheringAttendance: vi.fn(),
  getGatheringsPage: vi.fn(),
  markGatheringAttendance: vi.fn(),
  removeGatheringAttendance: vi.fn(),
}))

vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api')>()),
  getGatheringAttendance: apiMock.getGatheringAttendance,
  getGatheringsPage: apiMock.getGatheringsPage,
  markGatheringAttendance: apiMock.markGatheringAttendance,
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
