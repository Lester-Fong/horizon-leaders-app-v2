import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'

import { cn } from '../../lib/cn'

interface FormFieldProps {
  children: ReactNode
  description?: string
  error?: string | null
  id: string
  label: string
  required?: boolean
}

export function FormField({
  children,
  description,
  error,
  id,
  label,
  required = false,
}: FormFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-1 text-muted">
            (required)
          </span>
        )}
      </label>
      {description && (
        <p id={`${id}-description`} className="mt-1 text-sm text-muted">
          {description}
        </p>
      )}
      <div className="mt-2">{children}</div>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-2 text-sm font-medium text-ink">
          Error: {error}
        </p>
      )}
    </div>
  )
}

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean
}

export function TextInput({ className, hasError, ...inputProps }: TextInputProps) {
  return (
    <input
      {...inputProps}
      className={cn(
        'min-h-11 w-full rounded-input border bg-surface px-3 py-2 text-base text-ink placeholder:text-muted disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-muted sm:text-sm',
        hasError ? 'border-ink' : 'border-line-strong hover:border-muted',
        className,
      )}
    />
  )
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  hasError?: boolean
}

export function Select({ className, hasError, ...selectProps }: SelectProps) {
  return (
    <select
      {...selectProps}
      className={cn(
        'min-h-11 w-full rounded-input border bg-surface px-3 py-2 text-base text-ink disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-muted sm:text-sm',
        hasError ? 'border-ink' : 'border-line-strong hover:border-muted',
        className,
      )}
    />
  )
}

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean
}

export function TextArea({ className, hasError, ...textAreaProps }: TextAreaProps) {
  return (
    <textarea
      {...textAreaProps}
      className={cn(
        'min-h-28 w-full resize-y rounded-input border bg-surface px-3 py-2 text-base text-ink placeholder:text-muted disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-muted sm:text-sm',
        hasError ? 'border-ink' : 'border-line-strong hover:border-muted',
        className,
      )}
    />
  )
}
