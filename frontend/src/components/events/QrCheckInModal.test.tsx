import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SundayQrCheckInResult } from '../../lib/api'
import { QrCheckInModal } from './QrCheckInModal'

const scannerMock = vi.hoisted(() => ({
  callbacks: [] as Array<(result: { data: string }) => void>,
  destroy: vi.fn(),
  start: vi.fn<() => Promise<void>>(),
}))

vi.mock('qr-scanner', () => ({
  default: class MockQrScanner {
    constructor(
      _video: HTMLVideoElement,
      callback: (result: { data: string }) => void,
    ) {
      scannerMock.callbacks.push(callback)
    }

    destroy() {
      scannerMock.destroy()
    }

    start() {
      return scannerMock.start()
    }
  },
}))

const recordedResult: SundayQrCheckInResult = {
  member: {
    attendanceStatus: 'present',
    email: null,
    firstName: 'Ana',
    id: 'member-id',
    isActive: true,
    isPresent: true,
    lastName: 'Dela Cruz',
    lifeGroup: { id: 'group-id', name: 'North Life Group' },
    phone: null,
  },
  result: 'recorded',
}

function renderModal(
  checkIn = vi.fn<(qrToken: string) => Promise<SundayQrCheckInResult>>()
    .mockResolvedValue(recordedResult),
) {
  const onClose = vi.fn()
  const onRecorded = vi.fn()
  const view = render(
    <QrCheckInModal
      checkIn={checkIn}
      onClose={onClose}
      onRecorded={onRecorded}
    />,
  )
  return { checkIn, onClose, onRecorded, ...view }
}

describe('QrCheckInModal', () => {
  beforeEach(() => {
    scannerMock.callbacks.length = 0
    scannerMock.destroy.mockReset()
    scannerMock.start.mockReset().mockResolvedValue()
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: true,
    })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn() },
    })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('requests camera initialization only after explicit Start camera action', async () => {
    const user = userEvent.setup()
    renderModal()

    expect(scannerMock.start).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Start camera' }))

    await waitFor(() => expect(scannerMock.start).toHaveBeenCalledOnce())
    expect(screen.getByRole('button', { name: 'Stop camera' })).toBeVisible()
  })

  it('passes the decoded token unchanged and throttles only a recent repeat', async () => {
    const user = userEvent.setup()
    let currentTime = 1_000
    vi.spyOn(performance, 'now').mockImplementation(() => currentTime)
    const { checkIn } = renderModal()
    await user.click(screen.getByRole('button', { name: 'Start camera' }))
    const emit = scannerMock.callbacks[0]
    expect(emit).toBeDefined()

    await act(async () => emit?.({ data: ' raw-permanent-token ' }))
    expect(checkIn).toHaveBeenCalledWith(' raw-permanent-token ')
    expect(screen.queryByText('raw-permanent-token', { exact: true })).not.toBeInTheDocument()

    currentTime = 1_001
    await act(async () => emit?.({ data: ' raw-permanent-token ' }))
    expect(checkIn).toHaveBeenCalledTimes(1)

    currentTime = 3_000
    await act(async () => emit?.({ data: ' raw-permanent-token ' }))
    expect(checkIn).toHaveBeenCalledTimes(2)
  })

  it('keeps Scanner input as an Enter-submit fallback and clears its token', async () => {
    const user = userEvent.setup()
    const { checkIn } = renderModal()
    await user.click(screen.getByRole('button', { name: 'Scanner input' }))
    const input = screen.getByLabelText(/Member QR token/)
    await user.type(input, ' scanner-token ')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(checkIn).toHaveBeenCalledWith('scanner-token'))
    expect(input).toHaveValue('')
    expect(screen.getByRole('status')).toHaveTextContent(
      'Ana Dela Cruz: check-in recorded.',
    )
  })

  it('shows actionable permission and secure-context failures', async () => {
    const user = userEvent.setup()
    scannerMock.start.mockRejectedValueOnce(
      new DOMException('Permission denied', 'NotAllowedError'),
    )
    const first = renderModal()
    await user.click(screen.getByRole('button', { name: 'Start camera' }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Camera permission was denied',
      ),
    )
    first.unmount()

    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: false,
    })
    renderModal()
    await user.click(screen.getByRole('button', { name: 'Start camera' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Camera access requires HTTPS',
    )
  })

  it('destroys the scanner when stopped, closed, or unmounted', async () => {
    const user = userEvent.setup()
    const first = renderModal()
    await user.click(screen.getByRole('button', { name: 'Start camera' }))
    await user.click(screen.getByRole('button', { name: 'Stop camera' }))
    expect(scannerMock.destroy).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Start camera' }))
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(scannerMock.destroy).toHaveBeenCalledTimes(2)
    expect(first.onClose).toHaveBeenCalledOnce()
    first.unmount()

    const second = renderModal()
    await user.click(screen.getByRole('button', { name: 'Start camera' }))
    second.unmount()
    expect(scannerMock.destroy).toHaveBeenCalledTimes(3)
  })
})
