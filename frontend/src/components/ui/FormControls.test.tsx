import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { FormField, Select, TextArea, TextInput } from './FormControls'

afterEach(cleanup)

describe('FormField', () => {
  it('announces the visible hint with the control inside it', () => {
    render(
      <FormField id="search" label="Search" description="Name or email">
        <TextInput id="search" />
      </FormField>,
    )

    expect(screen.getByLabelText('Search')).toHaveAccessibleDescription('Name or email')
  })

  it('announces the hint and the error for selects and text areas', () => {
    render(
      <>
        <FormField id="status" label="Status" description="Pick one" error="Required">
          <Select id="status">
            <option value="">None</option>
          </Select>
        </FormField>
        <FormField id="notes" label="Notes" description="Optional">
          <TextArea id="notes" />
        </FormField>
      </>,
    )

    expect(screen.getByLabelText('Status')).toHaveAttribute(
      'aria-describedby',
      'status-description status-error',
    )
    expect(screen.getByLabelText('Notes')).toHaveAccessibleDescription('Optional')
  })

  it('keeps a description the page wires itself', () => {
    render(
      <>
        <p id="custom-hint">Custom hint</p>
        <FormField id="email" label="Email" description="Work email">
          <TextInput id="email" aria-describedby="custom-hint" />
        </FormField>
      </>,
    )

    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Custom hint')
  })

  it('adds no description when the field has no hint or error', () => {
    render(
      <FormField id="name" label="Name">
        <TextInput id="name" />
      </FormField>,
    )

    expect(screen.getByLabelText('Name')).not.toHaveAttribute('aria-describedby')
  })
})
