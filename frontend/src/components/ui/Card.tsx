import type { ComponentProps } from 'react'

import { cn } from '@/lib/cn'

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('rounded-card border border-slate-200 bg-white p-5 shadow-sm', className)}
      {...props}
    />
  )
}

export function CardTitle({ className, ...props }: ComponentProps<'h2'>) {
  return <h2 className={cn('text-base font-semibold', className)} {...props} />
}

export function CardBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('mt-3 text-sm text-slate-600', className)} {...props} />
}
