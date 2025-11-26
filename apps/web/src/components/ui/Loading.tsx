'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'
import { Card } from './Card'

interface LoadingProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  text?: string
}

export function Loading({ size = 'md', className, text }: LoadingProps) {
  const sizes = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
    xl: 'h-12 w-12',
  }

  return (
    <div className={cn('flex items-center justify-center gap-2', className)}>
      <Loader2 className={cn('animate-spin', sizes[size])} />
      {text && <span className="text-sm text-muted-foreground">{text}</span>}
    </div>
  )
}

interface SkeletonProps {
  className?: string
  children?: React.ReactNode
  loading?: boolean
}

export function Skeleton({ className, children, loading = true }: SkeletonProps) {
  if (!loading) {
    return <>{children}</>
  }

  return <div className={cn('skeleton', className)} />
}

interface CardSkeletonProps {
  className?: string
}

export function CardSkeleton({ className }: CardSkeletonProps) {
  return (
    <div className={cn('rounded-2xl border bg-card p-6 space-y-4', className)}>
      <div className="flex items-center space-x-4">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-3 w-1/6" />
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    </div>
  )
}

interface TokenListSkeletonProps {
  items?: number
}

export function TokenListSkeleton({ items = 5 }: TokenListSkeletonProps) {
  return (
    <div className="space-y-2">
      {Array.from({ length: items }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 p-3 rounded-xl">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  )
}

interface SwapSkeletonProps {
  className?: string
}

export function SwapSkeleton({ className }: SwapSkeletonProps) {
  return (
    <div className={cn('max-w-2xl mx-auto', className)}>
      <Card className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-10 w-24" />
        </div>

        {/* Input token */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>

        {/* Switch button */}
        <div className="flex justify-center">
          <Skeleton className="h-10 w-10 rounded-full" />
        </div>

        {/* Output token */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>

        {/* Swap button */}
        <Skeleton className="h-14 w-full rounded-xl" />

        {/* Details */}
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex items-center justify-between">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

export function PageLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-6">
        <div className="relative w-24 h-24 mx-auto">
          <div className="absolute inset-0 bg-gradient-to-r from-primary to-primary-hover rounded-2xl animate-pulse" />
          <div className="absolute inset-1 bg-background rounded-xl flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-display font-bold bg-gradient-to-r from-primary via-primary-hover to-secondary bg-clip-text text-transparent">
            WaveSwap
          </h1>
          <p className="text-sm text-muted-foreground">
            Initializing your private swap experience...
          </p>
        </div>
      </div>
    </div>
  )
}

export default Loading