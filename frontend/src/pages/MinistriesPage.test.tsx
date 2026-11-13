import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Ministry, MinistryInput, MinistryListFilters } from '../lib/api'
import { MinistriesPage } from './MinistriesPage'

const testState = vi.hoisted(() => ({
  role: 'admin' as 'admin' | 'leader',
}))

const worship: Ministry = {
  createdAt: '2026-08-01T00:00:00.000Z',
  description: null,
  id: 'ministry-worship',
  isActive: true,
  name: 'Worship Ministry',
  updatedAt: '2026-08-01T00:00:00.000Z',
}

const ushers: Ministry = {
  ...worship,
  id: 'ministry-ushers',
  isActive: false,
  name: 'Ushers',
}

const apiMock = vi.hoisted(() => ({
  createMinistry: vi.fn<(accessToken: string, input: MinistryInput) => Promise<Ministry>>(),
  getMinistries: vi.fn<
    (accessToken: string, filters?: MinistryListFilters) => Promise<Ministry[]>
  >(),
  reactivateMinistry: vi.fn<(accessToken: string, ministryId: string) => Promise<Ministry>>(),
  updateMinistry: vi.fn<
    (accessToken: string, ministryId: string, input: MinistryInput) => Promise<Ministry>
  >(),
}))

vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api')>()),
  createMinistry: apiMock.createMinistry,
  getMinistries: apiMock.getMinistries,
  reactivateMinistry: apiMock.reactivateMinistry,
  updateMinistry: apiMock.updateMinistry,
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

function renderMinistriesPage(initialEntry = '/ministries') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <MinistriesPage />
    </MemoryRouter>,
  )
}

async function openRowMenu(ministryName: string) {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: `Actions for ${ministryName}` }))
  return user
}

describe('MinistriesPage reactivation', () => {
  beforeEach(() => {
    apiMock.getMinistries.mockResolvedValue([ushers, worship])
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('offers Reactivate only on archived rows for Admin and reloads after success', async () => {
    testState.role = 'admin'
    apiMock.reactivateMinistry.mockResolvedValue({ ...ushers, isActive: true })
    renderMinistriesPage('/ministries?status=all')

    let user = await openRowMenu('Worship Ministry')
    expect(screen.queryByRole('menuitem', { name: 'Reactivate Ministry' })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Archive Ministry' })).toBeInTheDocument()
    await user.keyboard('{Escape}')

    user = await openRowMenu('Ushers')
    expect(screen.queryByRole('menuitem', { name: 'Archive Ministry' })).not.toBeInTheDocument()
    const loadsBefore = apiMock.getMinistries.mock.calls.length
    await user.click(screen.getByRole('menuitem', { name: 'Reactivate Ministry' }))

    expect(
      await screen.findByText(
        'Ushers was reactivated. Its existing Member assignments are unchanged.',
      ),
    ).toBeInTheDocument()
    expect(apiMock.reactivateMinistry).toHaveBeenCalledWith('test-token', ushers.id)
    await waitFor(() =>
      expect(apiMock.getMinistries.mock.calls.length).toBeGreaterThan(loadsBefore),
    )
  })

  it('never offers Reactivate to a Leader', async () => {
    testState.role = 'leader'
    renderMinistriesPage()

    await openRowMenu('Ushers')
    expect(screen.getByRole('menuitem', { name: 'View Ministry details' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Reactivate Ministry' })).not.toBeInTheDocument()
  })

  it('explains in the archive dialog that an Admin can reactivate later', async () => {
    testState.role = 'admin'
    renderMinistriesPage()

    const user = await openRowMenu('Worship Ministry')
    await user.click(screen.getByRole('menuitem', { name: 'Archive Ministry' }))

    const dialog = await screen.findByRole('dialog', { name: 'Archive Ministry?' })
    expect(dialog).toHaveTextContent(
      'Archive Worship Ministry? New Member assignments will no longer be allowed until an Admin reactivates it.',
    )
    expect(dialog).not.toHaveTextContent('This phase does not include reactivation')
  })
})

describe('MinistriesPage duplicate-name warning', () => {
  beforeEach(() => {
    testState.role = 'admin'
    apiMock.getMinistries.mockResolvedValue([ushers, worship])
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('warns about a matching name without blocking the save', async () => {
    const user = userEvent.setup()
    apiMock.createMinistry.mockResolvedValue({ ...worship, id: 'ministry-new' })
    renderMinistriesPage()

    await user.click(await screen.findByRole('button', { name: 'New Ministry' }))
    await waitFor(() =>
      expect(apiMock.getMinistries).toHaveBeenCalledWith('test-token', { status: 'all' }),
    )
    const nameInput = screen.getByLabelText(/^Name/)
    await user.type(nameInput, '  ushers ')

    const warning = 'A Ministry named “Ushers” (archived) already exists. You can still save.'
    expect(await screen.findByText(warning)).toHaveAttribute('id', 'ministry-name-warning')
    expect(nameInput.getAttribute('aria-describedby')).toContain('ministry-name-warning')

    await user.click(screen.getByRole('button', { name: 'Create Ministry' }))
    expect(apiMock.createMinistry).toHaveBeenCalledWith('test-token', {
      description: null,
      name: 'ushers',
    })
  })

  it('does not warn about the Ministry being edited', async () => {
    const user = userEvent.setup()
    renderMinistriesPage()

    await openRowMenu('Worship Ministry')
    await user.click(screen.getByRole('menuitem', { name: 'Edit Ministry' }))
    await waitFor(() =>
      expect(apiMock.getMinistries).toHaveBeenCalledWith('test-token', { status: 'all' }),
    )

    expect(screen.getByLabelText(/^Name/)).toHaveValue('Worship Ministry')
    expect(document.getElementById('ministry-name-warning')).toHaveTextContent('')
  })
})
