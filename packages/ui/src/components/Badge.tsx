import React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary-600 text-white hover:bg-primary-700',
        secondary:
          'border-transparent bg-secondary-100 text-secondary-900 hover:bg-secondary-200',
        destructive:
          'border-transparent bg-error-600 text-white hover:bg-error-700',
        outline: 'text-foreground',
        success:
          'border-transparent bg-success-100 text-success-900 hover:bg-success-200',
        warning:
          'border-transparent bg-warning-100 text-warning-900 hover:bg-warning-200',
        privacy:
          'border-privacy-200 bg-privacy-100 text-privacy-900 hover:bg-privacy-200',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }