import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { LeaderOption, ManagedUser } from '../../lib/api'
import { DeactivateUserDialog } from './DeactivateUserDialog'

const apiMock = vi.hoisted(() => ({
  getLeaderOptions: vi.fn<(accessToken: string) => Promise<LeaderOption[]>>(),
}))

vi.mock('../../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api')>()),
  getLeaderOptions: apiMock.getLeaderOptions,
}))

vi.mock('../../lib/session', () => ({
  getAccessToken: vi.fn(async () => 'test-token'),
}))

function leaderUser(id: string, name: string, groupName: string): ManagedUser {
  return {
    assignedLifeGroup: { id: `${id}-group`, isActive: true, name: groupName },
    createdAt: '2026-01-01T00:00:00.000Z',
    email: `${id}@example.test`,
    id,
    isActive: true,
    lastSignInAt: null,
    name,
    role: 'leader',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function leaderOption(id: string, name: string): LeaderOption {
  return { assignedLifeGroup: null, id, isActive: true, name }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const leaderA = leaderUser('leader-a', 'Ana Leader', 'North Group')
const leaderB = leaderUser('leader-b', 'Ben Leader', 'South Group')

function renderDialog(user: ManagedUser, onConfirm = vi.fn()) {
  const view = render(
    <DeactivateUserDialog
      key={user.id}
      user={user}
      error={null}
      isSubmitting={false}
      onClose={vi.fn()}
      onConfirm={onConfirm}
    />,
  )
  return { onConfirm, view }
}

function deactivateButton() {
  return screen.getByRole('button', { name: 'Deactivate user' })
}

beforeEach(() => {
  const root = document.createElement('div')
  root.id = 'root'
  document.body.append(root)
})

afterEach(() => {
  cleanup()
  apiMock.getLeaderOptions.mockReset()
  document.getElementById('root')?.remove()
  document.body.style.overflow = ''
})

describe('DeactivateUserDialog', () => {
  it('keeps Deactivate disabled until the Admin chooses a successor or reassign later', async () => {
    apiMock.getLeaderOptions.mockResolvedValue([
      leaderOption('leader-a', 'Ana Leader'),
      leaderOption('successor', 'Sam Successor'),
    ])
    const { onConfirm } = renderDialog(leaderA)

    expect(deactivateButton()).toBeDisabled()
    const select = screen.getByRole('combobox', { name: /New Leader/ })
    expect(select).toBeRequired()
    expect(select).toHaveAttribute('aria-describedby', 'replacement-leader-description')

    await screen.findByRole('option', { name: 'Sam Successor' })
    expect(within(select).getByRole('option', { name: 'Choose who leads North Group…' }))
      .toBeInTheDocument()
    expect(within(select).queryByRole('option', { name: 'Ana Leader' })).toBeNull()
    expect(deactivateButton()).toBeDisabled()

    await userEvent.selectOptions(select, 'Sam Successor')
    expect(deactivateButton()).toBeEnabled()
    await userEvent.click(deactivateButton())
    expect(onConfirm).toHaveBeenLastCalledWith('successor')

    await userEvent.selectOptions(
      select,
      'Reassign later — leave North Group without a Leader for now',
    )
    await userEvent.click(deactivateButton())
    expect(onConfirm).toHaveBeenLastCalledWith('')
  })

  it('preselects reassign later when no unassigned active Leaders exist', async () => {
    apiMock.getLeaderOptions.mockResolvedValue([leaderOption('leader-a', 'Ana Leader')])
    renderDialog(leaderA)

    expect(
      await screen.findByText(
        'No unassigned active Leaders are available. North Group will need a new Leader in Life Groups.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /New Leader/ })).toHaveValue('reassign-later')
    expect(deactivateButton()).toBeEnabled()
  })

  it('ignores a late Leader list from a previous deactivate target', async () => {
    const forA = deferred<LeaderOption[]>()
    const forB = deferred<LeaderOption[]>()
    apiMock.getLeaderOptions
      .mockReturnValueOnce(forA.promise)
      .mockReturnValueOnce(forB.promise)

    const first = renderDialog(leaderA)
    first.view.unmount()
    renderDialog(leaderB)

    // A's response still includes B, who must never be offered as B's own successor.
    await act(async () => forA.resolve([leaderOption('leader-b', 'Ben Leader')]))
    const select = screen.getByRole('combobox', { name: /New Leader/ })
    expect(within(select).queryByRole('option', { name: 'Ben Leader' })).toBeNull()
    expect(deactivateButton()).toBeDisabled()

    await act(async () => forB.resolve([leaderOption('successor', 'Sam Successor')]))
    expect(within(select).getByRole('option', { name: 'Sam Successor' })).toBeInTheDocument()
    expect(within(select).queryByRole('option', { name: 'Ben Leader' })).toBeNull()
  })

  it('lets a non-leading user be deactivated without loading Leaders', async () => {
    renderDialog({ ...leaderA, assignedLifeGroup: null })

    expect(screen.queryByRole('combobox')).toBeNull()
    expect(deactivateButton()).toBeEnabled()
    expect(apiMock.getLeaderOptions).not.toHaveBeenCalled()
  })
})
