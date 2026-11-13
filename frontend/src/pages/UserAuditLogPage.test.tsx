import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, type ApiPage, type PageRequest, type UserActivityEvent } from '../lib/api'
import { UserAuditLogPage } from './UserAuditLogPage'

const apiMock = vi.hoisted(() => ({
  getUserAuditPage: vi.fn<
    (accessToken: string, page: PageRequest) => Promise<ApiPage<UserActivityEvent>>
  >(),
}))

vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api')>()),
  getUserAuditPage: apiMock.getUserAuditPage,
}))

vi.mock('../lib/session', () => ({
  getAccessToken: vi.fn(async () => 'test-token'),
}))

const TOTAL_EVENTS = 60

function auditEvent(index: number): UserActivityEvent {
  return {
    action: index === 0 ? 'user_updated' : 'user_created',
    actorId: 'admin-id',
    actorName: 'Ada Admin',
    // 2026-11-12T16:30Z is Nov 13, 12:30 AM in Manila.
    createdAt: '2026-11-12T16:30:00.000Z',
    details: index === 0 ? { changes: { role: { from: 'leader', to: 'admin' } } } : {},
    id: `event-${String(index).padStart(3, '0')}`,
    targetName: `Target ${index}`,
    targetUserId: `user-${index}`,
  }
}

const allEvents = Array.from({ length: TOTAL_EVENTS }, (_, index) => auditEvent(index))

function serveAuditPage(_token: string, page: PageRequest) {
  const items = allEvents.slice(page.offset, page.offset + page.limit)
  return Promise.resolve({
    items,
    meta: {
      hasMore: page.offset + items.length < allEvents.length,
      limit: page.limit,
      offset: page.offset,
      total: allEvents.length,
    },
  })
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/users/activity']}>
      <UserAuditLogPage />
    </MemoryRouter>,
  )
}

describe('UserAuditLogPage', () => {
  beforeEach(() => {
    apiMock.getUserAuditPage.mockReset()
  })

  afterEach(cleanup)

  it('lists account changes with labels, change summaries, and Manila times', async () => {
    apiMock.getUserAuditPage.mockImplementation(serveAuditPage)
    renderPage()

    expect(await screen.findByText('Details updated')).toBeInTheDocument()
    expect(screen.getByText('role: leader → admin')).toBeInTheDocument()
    expect(screen.getByText('Target 0')).toBeInTheDocument()
    expect(screen.getAllByText(/Nov 13, 2026/).length).toBeGreaterThan(0)
    expect(screen.getByRole('table', { name: /Staff account activity/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Back to Users/ })).toHaveAttribute('href', '/users')
    expect(apiMock.getUserAuditPage).toHaveBeenCalledWith('test-token', { limit: 50, offset: 0 })
  })

  it('loads the next page on request', async () => {
    apiMock.getUserAuditPage.mockImplementation(serveAuditPage)
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByText('Showing 50 of 60')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Load more' }))

    expect(await screen.findByText('Showing 60 of 60')).toBeInTheDocument()
    expect(screen.getByText('Target 59')).toBeInTheDocument()
    expect(apiMock.getUserAuditPage).toHaveBeenLastCalledWith('test-token', {
      limit: 50,
      offset: 50,
    })
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })

  it('shows an empty state when nothing has been recorded', async () => {
    apiMock.getUserAuditPage.mockResolvedValue({
      items: [],
      meta: { hasMore: false, limit: 50, offset: 0, total: 0 },
    })
    renderPage()

    expect(await screen.findByText('No account activity yet')).toBeInTheDocument()
  })

  it('shows the API error and retries', async () => {
    apiMock.getUserAuditPage
      .mockRejectedValueOnce(new ApiError(403, 'FORBIDDEN', 'Admins only.'))
      .mockImplementation(serveAuditPage)
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByText('Activity could not be loaded')).toBeInTheDocument()
    expect(screen.getByText('Admins only.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Details updated')).toBeInTheDocument()
  })
})
