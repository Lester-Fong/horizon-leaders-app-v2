import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { DashboardData } from '../lib/api'
import { DashboardPage } from './DashboardPage'

const apiMock = vi.hoisted(() => ({ getDashboard: vi.fn<() => Promise<DashboardData>>() }))

vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api')>()),
  getDashboard: apiMock.getDashboard,
  getLifeGroups: vi.fn(async () => []),
}))
vi.mock('../lib/session', () => ({ getAccessToken: vi.fn(async () => 'test-token') }))
vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({ actor: { id: 'leader-id', isActive: true, mustChangePassword: false, name: 'Lina Leader', role: 'leader' } }),
}))

function dashboard(isUnassignedLeader: boolean): DashboardData {
  return {
    isUnassignedLeader,
    memberSnapshot: { age: [], gender: [] },
    metrics: { activeFollowUps: 2, activeOpenCellProgrammes: 1, myLifeGroupMembers: 0, myLifeGroupVisitors: 0 },
    needsAttention: { byReason: [], total: 0 },
    openCell: { activeProgrammes: 1, currentParticipants: 4 },
    recentUpcoming: { recent: [], upcoming: [] },
    sundayAttendance: { averageRate: null, points: [] },
  }
}

afterEach(() => { cleanup(); apiMock.getDashboard.mockReset() })

describe('DashboardPage', () => {
  it('renders the normal dashboard with a neutral note for a Leader without a Life Group', async () => {
    apiMock.getDashboard.mockResolvedValue(dashboard(true))
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeTruthy()
    expect(screen.getAllByText('You are not assigned to a Life Group yet.').length).toBeGreaterThan(0)
    expect(screen.getByText('Active OpenCell Programmes')).toBeTruthy()
    expect(screen.queryByText('No qualifying Sunday history')).toBeNull()
  })

  it('shows no assignment note for a Leader with a Life Group', async () => {
    apiMock.getDashboard.mockResolvedValue(dashboard(false))
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)

    expect(await screen.findByText('No qualifying Sunday history')).toBeTruthy()
    expect(screen.queryByText('You are not assigned to a Life Group yet.')).toBeNull()
  })
})
