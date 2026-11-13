import {
  createContext,
  useContext,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'

import { cn } from '../../lib/cn'

/**
 * IDs of the visible hint and error of the surrounding FormField, so a control
 * inside it is announced with them even when the page does not wire them itself.
 */
const FormFieldDescriptionContext = createContext<string | undefined>(undefined)

function useFieldDescribedBy(explicit: string | undefined) {
  const fieldDescribedBy = useContext(FormFieldDescriptionContext)
  return explicit ?? fieldDescribedBy
}

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
  const describedBy =
    [description ? `${id}-description` : null, error ? `${id}-error` : null]
      .filter(Boolean)
      .join(' ') || undefined

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
      <div className="mt-2">
        <FormFieldDescriptionContext.Provider value={describedBy}>
          {children}
        </FormFieldDescriptionContext.Provider>
      </div>
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
  /** React 19 passes `ref` as a prop; the spread hands it to the `<input>`. */
  ref?: Ref<HTMLInputElement>
}

export function TextInput({ className, hasError, ...inputProps }: TextInputProps) {
  const describedBy = useFieldDescribedBy(inputProps['aria-describedby'])
  return (
    <input
      {...inputProps}
      aria-describedby={describedBy}
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
  const describedBy = useFieldDescribedBy(selectProps['aria-describedby'])
  return (
    <select
      {...selectProps}
      aria-describedby={describedBy}
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
  const describedBy = useFieldDescribedBy(textAreaProps['aria-describedby'])
  return (
    <textarea
      {...textAreaProps}
      aria-describedby={describedBy}
      className={cn(
        'min-h-28 w-full resize-y rounded-input border bg-surface px-3 py-2 text-base text-ink placeholder:text-muted disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-muted sm:text-sm',
        hasError ? 'border-ink' : 'border-line-strong hover:border-muted',
        className,
      )}
    />
  )
}
