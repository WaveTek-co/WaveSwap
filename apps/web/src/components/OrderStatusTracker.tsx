'use client'

import { useState, useEffect } from 'react'
import { CheckCircleIcon, ClockIcon, XCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { EncifherOrderStatus } from '@/types/token'

interface OrderStatusTrackerProps {
  orderStatusIdentifier: string
  onComplete?: () => void
  onError?: (error: string) => void
  className?: string
}

interface TrackingStatus {
  status: 'pending' | 'completed' | 'failed'
  progress: number
  message: string
  estimatedTime: string
  timestamp?: number
}

export function OrderStatusTracker({
  orderStatusIdentifier,
  onComplete,
  onError,
  className = ''
}: OrderStatusTrackerProps) {
  const [status, setStatus] = useState<TrackingStatus>({
    status: 'pending',
    progress: 0,
    message: 'Initializing private transaction...',
    estimatedTime: '2-5 minutes'
  })
  const [isPolling, setIsPolling] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const maxAttempts = 120 // 120 attempts * 3 seconds = 6 minutes max

  useEffect(() => {
    if (!orderStatusIdentifier) return undefined

    setIsPolling(true)
    setAttempts(0)

    const pollStatus = async () => {
      // Increment attempts for each poll
      setAttempts(prev => {
        const newAttempts = prev + 1

        if (newAttempts >= maxAttempts) {
          setStatus({
            status: 'failed',
            progress: 0,
            message: 'Private swap timed out - please check your transaction history',
            estimatedTime: 'Timed out'
          })
          setIsPolling(false)
          onError?.('Private swap timed out - please check your transaction history')
          return newAttempts
        }

        return newAttempts
      })

      try {
        const response = await fetch('/api/v1/encifher/status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ orderStatusIdentifier }),
        })

        const data = await response.json()

        if (data.success && data.status) {
          setStatus({
            status: data.status.status,
            progress: data.status.progress || 0,
            message: data.status.message || getStatusMessage(data.status.status),
            estimatedTime: data.status.estimatedTime || '2-5 minutes',
            timestamp: data.status.timestamp
          })

          if (data.status.status === 'completed') {
            setIsPolling(false)
            onComplete?.()
          } else if (data.status.status === 'failed') {
            setIsPolling(false)
            onError?.(data.status.details?.error || 'Private transaction failed')
          }
        } else {
          throw new Error(data.error || 'Failed to get status')
        }
      } catch (error) {
        console.error('Error polling order status:', error)

        // Don't show timeout error here - it's handled in the attempts counter
        // Just log the error and continue polling
      }
    }

    // Initial poll
    pollStatus()

    // Set up polling interval
    const interval = setInterval(() => {
      if (isPolling) {
        pollStatus()
      }
    }, 3000) // Poll every 3 seconds

    return () => {
      clearInterval(interval)
      setIsPolling(false)
    }
  }, [orderStatusIdentifier, isPolling, attempts, maxAttempts, onComplete, onError])

  const getStatusMessage = (status: string): string => {
    switch (status) {
      case 'pending':
        return 'Processing private transaction...'
      case 'completed':
        return 'Private transaction completed successfully!'
      case 'failed':
        return 'Private transaction failed'
      default:
        return 'Checking transaction status...'
    }
  }

  const getStatusIcon = () => {
    switch (status.status) {
      case 'completed':
        return <CheckCircleIcon className="w-5 h-5 text-emerald-400" />
      case 'failed':
        return <XCircleIcon className="w-5 h-5 text-red-400" />
      case 'pending':
        return <ClockIcon className="w-5 h-5 text-blue-400 animate-spin" />
      default:
        return <ClockIcon className="w-5 h-5" style={{ color: 'var(--wave-text-muted)' }} />
    }
  }

  const getStatusColor = () => {
    switch (status.status) {
      case 'completed':
        return 'border-emerald-500/20 bg-emerald-500/10'
      case 'failed':
        return 'border-red-500/20 bg-red-500/10'
      case 'pending':
        return 'border-blue-500/20 bg-blue-500/10'
      default:
        return 'border-gray-500/20'
    }
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Main Status Card */}
      <div className={`relative rounded-2xl border-2 p-6 backdrop-blur-xl transition-all duration-300 ${getStatusColor()}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {getStatusIcon()}
            <div>
              <h3 className="text-lg font-semibold text-white">Private Transaction</h3>
              <p className="text-sm capitalize" style={{ color: 'var(--wave-text-secondary)' }}>{status.status}</p>
            </div>
          </div>

          <div className="text-right">
            <p className="text-sm font-medium" style={{ color: 'var(--wave-text-secondary)' }}>
              {status.estimatedTime}
            </p>
            {status.timestamp && (
              <p className="text-xs" style={{ color: 'var(--wave-text-muted)' }}>
                {new Date(status.timestamp).toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm" style={{ color: 'var(--wave-text-secondary)' }}>Progress</span>
            <span className="text-sm" style={{ color: 'var(--wave-text-secondary)' }}>{status.progress}%</span>
          </div>
          <div className="w-full rounded-full h-2" style={{ backgroundColor: 'var(--wave-glass-border)' }}>
            <div
              className={`h-2 rounded-full transition-all duration-500 ${
                status.status === 'completed'
                  ? 'bg-emerald-500'
                  : status.status === 'failed'
                  ? 'bg-red-500'
                  : 'bg-blue-500'
              }`}
              style={{ width: `${status.progress}%` }}
            />
          </div>
        </div>

        {/* Status Message */}
        <div className="flex items-start gap-3">
          <ExclamationTriangleIcon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--wave-text-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--wave-text-secondary)' }}>{status.message}</p>
        </div>

        {/* Order ID */}
        <div className="mt-4 p-3 rounded-xl" style={{ backgroundColor: 'var(--wave-glass-bg)' }}>
          <p className="text-xs mb-1" style={{ color: 'var(--wave-text-muted)' }}>Order Identifier</p>
          <p className="text-xs font-mono break-all" style={{ color: 'var(--wave-text-secondary)' }}>{orderStatusIdentifier}</p>
        </div>
      </div>

      {/* Information Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="backdrop-blur-xl rounded-xl border p-4" style={{ backgroundColor: 'var(--wave-glass-bg)', borderColor: 'var(--wave-glass-border)' }}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <ClockIcon className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--wave-text-primary)' }}>Processing Time</p>
              <p className="text-xs" style={{ color: 'var(--wave-text-muted)' }}>Usually 2-5 minutes</p>
            </div>
          </div>
        </div>

        <div className="backdrop-blur-xl rounded-xl border p-4" style={{ backgroundColor: 'var(--wave-glass-bg)', borderColor: 'var(--wave-glass-border)' }}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center">
              <CheckCircleIcon className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--wave-text-primary)' }}>Privacy Level</p>
              <p className="text-xs" style={{ color: 'var(--wave-text-muted)' }}>Maximum encryption</p>
            </div>
          </div>
        </div>

        <div className="backdrop-blur-xl rounded-xl border p-4" style={{ backgroundColor: 'var(--wave-glass-bg)', borderColor: 'var(--wave-glass-border)' }}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 bg-primary-500/20 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-primary-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--wave-text-primary)' }}>Security</p>
              <p className="text-xs" style={{ color: 'var(--wave-text-muted)' }}>Zero-knowledge proofs</p>
            </div>
          </div>
        </div>
      </div>

      {/* Additional Information */}
      <div className="backdrop-blur-xl rounded-xl border p-4" style={{ backgroundColor: 'var(--wave-glass-bg)', borderColor: 'var(--wave-glass-border)' }}>
        <div className="flex items-start gap-3">
          <ExclamationTriangleIcon className="w-5 w-5 text-yellow-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm" style={{ color: 'var(--wave-text-secondary)' }}>
            <p className="font-medium text-yellow-400 mb-1">Important Note</p>
            <p style={{ color: 'var(--wave-text-muted)' }}>
              Private transactions may take longer than public transactions as they require additional encryption and privacy protocols.
              The status will update automatically as your transaction progresses through the Encifher network.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}