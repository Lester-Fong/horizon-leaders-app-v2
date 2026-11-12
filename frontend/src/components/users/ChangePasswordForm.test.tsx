import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../lib/api'
import { ChangePasswordForm, PASSWORD_CHANGED_SIGN_IN_MESSAGE } from './ChangePasswordForm'

const mocks = vi.hoisted(() => ({
  changeMyPassword: vi.fn(),
  getAccessToken: vi.fn(),
  getSession: vi.fn(),
  login: vi.fn(),
}))

vi.mock('../../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api')>()),
  changeMyPassword: mocks.changeMyPassword,
}))
vi.mock('../../lib/session', () => ({ getAccessToken: mocks.getAccessToken }))
vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}))
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ login: mocks.login }) }))

const CURRENT = 'OldPassword1'
const NEXT = 'NewPassword2'

async function fillForm(current: string, next: string, confirmation = next) {
  const user = userEvent.setup()
  if (current) await user.type(screen.getByLabelText(/^Current password/), current)
  if (next) await user.type(screen.getByLabelText(/^New password/), next)
  if (confirmation) await user.type(screen.getByLabelText(/^Confirm new password/), confirmation)
  await user.click(screen.getByRole('button', { name: 'Change password' }))
}

function fieldError(fieldId: string) {
  return document.getElementById(`${fieldId}-error`)
}

beforeEach(() => {
  mocks.getAccessToken.mockResolvedValue('token')
  mocks.getSession.mockResolvedValue({ data: { session: { user: { email: 'leader@example.test' } } } })
  mocks.changeMyPassword.mockResolvedValue(undefined)
  mocks.login.mockResolvedValue({ ok: true })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ChangePasswordForm validation', () => {
  it('rejects a confirmation that does not match', async () => {
    render(<ChangePasswordForm />)
    await fillForm(CURRENT, NEXT, 'Different3Pass')

    expect(fieldError('new-password-confirmation')).toHaveTextContent('The passwords do not match.')
    expect(mocks.changeMyPassword).not.toHaveBeenCalled()
  })

  it('rejects a weak new password', async () => {
    render(<ChangePasswordForm />)
    await fillForm(CURRENT, 'weakpass')

    expect(screen.getByLabelText(/^New password/)).toHaveAttribute('aria-invalid', 'true')
    expect(fieldError('new-password')).toHaveTextContent(/Use 10-72 characters/)
    expect(mocks.changeMyPassword).not.toHaveBeenCalled()
  })

  it('rejects a new password equal to the current one', async () => {
    render(<ChangePasswordForm />)
    await fillForm(CURRENT, CURRENT)

    expect(fieldError('new-password')).toHaveTextContent(
      'Choose a password that is different from the current one.',
    )
    expect(mocks.changeMyPassword).not.toHaveBeenCalled()
  })
})

describe('ChangePasswordForm submission', () => {
  it('shows CURRENT_PASSWORD_INCORRECT on the current-password field', async () => {
    mocks.changeMyPassword.mockRejectedValue(
      new ApiError(422, 'CURRENT_PASSWORD_INCORRECT', 'Your current password is incorrect.'),
    )
    render(<ChangePasswordForm />)
    await fillForm(CURRENT, NEXT)

    const currentField = screen.getByLabelText(/^Current password/)
    await waitFor(() => expect(currentField).toHaveAttribute('aria-invalid', 'true'))
    expect(fieldError('current-password')).toHaveTextContent('Your current password is incorrect.')
    expect(currentField.getAttribute('aria-describedby')).toContain('current-password-error')
    expect(mocks.login).not.toHaveBeenCalled()
  })

  it('signs back in with the new password, reports busy state, and calls onChanged', async () => {
    const onChanged = vi.fn()
    const onBusyChange = vi.fn()
    render(<ChangePasswordForm onChanged={onChanged} onBusyChange={onBusyChange} />)
    await fillForm(CURRENT, NEXT)

    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce())
    expect(mocks.changeMyPassword).toHaveBeenCalledWith('token', CURRENT, NEXT)
    expect(mocks.login).toHaveBeenCalledWith('leader@example.test', NEXT, {
      failureMessage: PASSWORD_CHANGED_SIGN_IN_MESSAGE,
    })
    expect(onBusyChange).toHaveBeenCalledWith(true)
    expect(onBusyChange).toHaveBeenLastCalledWith(false)
  })

  it('does not call onChanged when signing back in fails', async () => {
    mocks.login.mockResolvedValue({ ok: false, message: PASSWORD_CHANGED_SIGN_IN_MESSAGE })
    const onChanged = vi.fn()
    render(<ChangePasswordForm onChanged={onChanged} />)
    await fillForm(CURRENT, NEXT)

    await waitFor(() => expect(mocks.login).toHaveBeenCalled())
    expect(onChanged).not.toHaveBeenCalled()
  })
})
