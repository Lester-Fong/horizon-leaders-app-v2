import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CopyPasswordButton } from './CopyPasswordButton'

function mockClipboard(writeText: (value: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn(writeText) },
  })
  return navigator.clipboard.writeText as ReturnType<typeof vi.fn>
}

describe('CopyPasswordButton', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('copies the exact password and confirms it', async () => {
    const writeText = mockClipboard(async () => undefined)
    render(<CopyPasswordButton value="Welcome2Horizon" />)

    await userEvent.click(screen.getByRole('button', { name: 'Copy password' }))

    expect(writeText).toHaveBeenCalledWith('Welcome2Horizon')
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('explains when the browser blocks copying', async () => {
    mockClipboard(async () => {
      throw new Error('denied')
    })
    render(<CopyPasswordButton value="Welcome2Horizon" />)

    await userEvent.click(screen.getByRole('button', { name: 'Copy password' }))

    expect(await screen.findByText('Copying is unavailable in this browser.')).toBeInTheDocument()
  })

  it('is disabled until a password is entered', () => {
    render(<CopyPasswordButton value="" />)
    expect(screen.getByRole('button', { name: 'Copy password' })).toBeDisabled()
  })
})
