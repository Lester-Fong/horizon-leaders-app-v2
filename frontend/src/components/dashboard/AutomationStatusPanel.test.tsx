import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import type { DashboardAutomationStatus } from '../../lib/api'
import { AutomationStatusPanel } from './AutomationStatusPanel'

function renderPanel(status: DashboardAutomationStatus) {
  return render(<MemoryRouter><AutomationStatusPanel status={status} /></MemoryRouter>)
}

describe('AutomationStatusPanel', () => {
  it('shows a clear empty state when no run has happened', () => {
    renderPanel({ lastRun: null, pendingServiceCount: 0, pendingServices: [] })

    expect(screen.getByText('No automation runs yet')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Sunday Services awaiting retry' })).not.toBeInTheDocument()
  })

  it('shows a successful run in Manila time', () => {
    renderPanel({
      lastRun: { errorCount: 0, errorSummary: null, finishedAt: '2026-11-12T19:00:04Z', jobName: 'sunday_reconciliation', processedCount: 2, startedAt: '2026-11-12T19:00:00Z', status: 'succeeded' },
      pendingServiceCount: 0,
      pendingServices: [],
    })

    expect(screen.getByText('Succeeded')).toBeInTheDocument()
    expect(screen.getByText(/Nov 13, 2026/)).toBeInTheDocument()
    expect(screen.getByText('2 · 0')).toBeInTheDocument()
  })

  it('lists failed Services awaiting retry with the error summary', () => {
    renderPanel({
      lastRun: { errorCount: 1, errorSummary: 'abc: boom', finishedAt: null, jobName: 'sunday_reconciliation', processedCount: 0, startedAt: '2026-11-12T19:00:00Z', status: 'failed' },
      pendingServiceCount: 7,
      pendingServices: [{ date: '2026-11-08', eventId: 'event-1', title: 'Sunday Service' }],
    })

    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(screen.getByText('abc: boom')).toBeInTheDocument()
    const list = screen.getByRole('list', { name: 'Sunday Services awaiting retry' })
    expect(within(list).getByRole('link', { name: /Sunday Service/ })).toHaveAttribute('href', '/events/event-1')
    expect(within(list).getByText('and 6 more')).toBeInTheDocument()
  })
})
