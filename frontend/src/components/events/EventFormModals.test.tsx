import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { HarvestEvent, SundayService } from '../../lib/api'
import { HarvestEventFormModal } from './HarvestEventFormModal'
import { SundayServiceFormModal } from './SundayServiceFormModal'

const createdBy = { id: '11111111-1111-4111-8111-111111111111', name: 'Ada Admin' }
const closedService: SundayService = {
  attendanceCount: 3, countsForAbsence: true, createdAt: '2026-11-01T00:00:00Z', createdBy, description: null,
  eligibilityCount: 3, eventDate: '2026-11-08', id: '22222222-2222-4222-8222-222222222222', location: null,
  status: 'closed', title: 'Sunday Service', updatedAt: '2026-11-01T00:00:00Z', visitorCount: 0,
}
const activeHarvest: HarvestEvent = {
  countsForAbsence: false, createdAt: '2026-11-01T00:00:00Z', createdBy, description: null, eventDate: '2026-11-07',
  id: '33333333-3333-4333-8333-333333333333', location: null, participationCount: 2, status: 'open', title: 'Harvest',
  type: 'harvest', updatedAt: '2026-11-01T00:00:00Z',
}

afterEach(cleanup)

describe('Event form modals', () => {
  it('omits the unchanged date when editing a closed Sunday Service', async () => {
    const onSave = vi.fn(async () => closedService)
    render(<SundayServiceFormModal context={{ event: closedService, mode: 'edit' }} onClose={vi.fn()} onSave={onSave} onSaved={vi.fn()} />)

    await userEvent.click(screen.getByLabelText(/Counts for Sunday absence/))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(onSave).toHaveBeenCalledWith({ countsForAbsence: false, description: null, location: null, title: 'Sunday Service' })
  })

  it('sends the date when creating a Sunday Service', async () => {
    const onSave = vi.fn(async () => closedService)
    render(<SundayServiceFormModal context={{ mode: 'create' }} onClose={vi.fn()} onSave={onSave} onSaved={vi.fn()} />)

    await userEvent.type(screen.getByLabelText(/Date/), '2026-11-15')
    await userEvent.click(screen.getByRole('button', { name: 'Create Service' }))

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ eventDate: '2026-11-15' }))
  })

  it('omits the unchanged date when renaming a Harvest with participation', async () => {
    const onSave = vi.fn(async () => activeHarvest)
    render(<HarvestEventFormModal context={{ event: activeHarvest, mode: 'edit' }} onClose={vi.fn()} onSave={onSave} onSaved={vi.fn()} />)

    const title = screen.getByLabelText(/Title/)
    await userEvent.clear(title)
    await userEvent.type(title, 'Harvest Night')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(onSave).toHaveBeenCalledWith({ description: null, location: null, title: 'Harvest Night' })
  })
})
