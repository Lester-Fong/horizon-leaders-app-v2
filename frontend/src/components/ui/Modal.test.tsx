import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Button } from './Button'
import { Modal } from './Modal'

beforeEach(() => {
  const root = document.createElement('div')
  root.id = 'root'
  document.body.append(root)
})

afterEach(() => {
  cleanup()
  document.getElementById('root')?.remove()
  document.body.style.overflow = ''
})

describe('Modal close behavior', () => {
  it('closes through child Cancel, the labelled close control, and the backdrop', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const view = render(
      <Modal isOpen onClose={onClose} title="Editable record">
        <form>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </form>
      </Modal>,
      { container: document.getElementById('root')! },
    )

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: 'Close dialog' }))
    expect(onClose).toHaveBeenCalledTimes(2)

    const overlay = screen.getByRole('dialog').parentElement
    expect(overlay).not.toBeNull()
    fireEvent.mouseDown(overlay!)
    expect(onClose).toHaveBeenCalledTimes(3)

    view.unmount()
  })

  it('lets Escape close only the top dialog and keeps the background locked', async () => {
    const user = userEvent.setup()
    const closeOuter = vi.fn()
    const closeInner = vi.fn()

    function NestedDialogs() {
      return (
        <>
          <Modal isOpen onClose={closeOuter} title="Outer dialog">
            Outer content
          </Modal>
          <Modal isOpen onClose={closeInner} title="Inner dialog">
            Inner content
          </Modal>
        </>
      )
    }

    const view = render(<NestedDialogs />, {
      container: document.getElementById('root')!,
    })
    await user.keyboard('{Escape}')
    expect(closeInner).toHaveBeenCalledOnce()
    expect(closeOuter).not.toHaveBeenCalled()

    view.rerender(
      <Modal isOpen onClose={closeOuter} title="Outer dialog">
        Outer content
      </Modal>,
    )
    await waitFor(() => {
      expect(document.body.style.overflow).toBe('hidden')
      expect(document.getElementById('root')).toHaveProperty('inert', true)
    })

    await user.keyboard('{Escape}')
    expect(closeOuter).toHaveBeenCalledOnce()
    view.unmount()
    expect(document.body.style.overflow).toBe('')
    expect(document.getElementById('root')).toHaveProperty('inert', false)
  })

  it('blocks every incidental close route only when close prevention is requested', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <Modal isOpen onClose={onClose} preventClose title="Saving record">
        Saving
      </Modal>,
      { container: document.getElementById('root')! },
    )

    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeDisabled()
    await user.keyboard('{Escape}')
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement!)
    expect(onClose).not.toHaveBeenCalled()
  })
})
