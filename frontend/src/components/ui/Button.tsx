import { LoaderCircle } from 'lucide-react'
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ComponentProps,
  type ReactNode,
} from 'react'
import { Link } from 'react-router-dom'

import { cn } from '../../lib/cn'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive'
type ButtonSize = 'sm' | 'md' | 'lg'

const baseClasses =
  'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-55'

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white shadow-sm hover:bg-primary-strong',
  secondary:
    'border border-line-strong bg-surface text-ink shadow-sm hover:bg-surface-subtle',
  ghost: 'text-muted hover:bg-primary-soft hover:text-primary-strong',
  destructive: 'bg-danger text-white shadow-sm hover:bg-danger-strong',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 text-sm',
  md: 'min-h-10 px-4 text-sm',
  lg: 'min-h-11 px-5 text-base',
}

function buttonClasses(
  variant: ButtonVariant,
  size: ButtonSize,
  className?: string,
) {
  return cn(baseClasses, variantClasses[variant], sizeClasses[size], className)
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean
  size?: ButtonSize
  variant?: ButtonVariant
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    className,
    disabled,
    isLoading = false,
    size = 'md',
    type,
    variant = 'primary',
    ...buttonProps
  },
  ref,
) {
  return (
    <button
      {...buttonProps}
      ref={ref}
      type={type ?? 'button'}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={buttonClasses(variant, size, className)}
    >
      {isLoading && (
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
      )}
      {children}
    </button>
  )
})

interface LinkButtonProps
  extends Omit<ComponentProps<typeof Link>, 'children' | 'className'> {
  children: ReactNode
  className?: string
  size?: ButtonSize
  variant?: ButtonVariant
}

export function LinkButton({
  children,
  className,
  size = 'md',
  variant = 'primary',
  ...linkProps
}: LinkButtonProps) {
  return (
    <Link
      {...linkProps}
      className={buttonClasses(variant, size, className)}
    >
      {children}
    </Link>
  )
}
