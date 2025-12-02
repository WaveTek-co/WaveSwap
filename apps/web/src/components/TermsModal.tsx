'use client'

import React, { useState } from 'react'
import { XMarkIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { useTerms } from '@/contexts/TermsContext'
import { useThemeConfig } from '@/lib/theme'

interface TermsModalProps {
  isOpen: boolean
  onClose: () => void
  onAccept: () => void
  onDecline: () => void
}

export function TermsModal({ isOpen, onClose, onAccept, onDecline }: TermsModalProps) {
  const { acceptTerms, declineTerms } = useTerms()
  const [accepted, setAccepted] = useState(false)
  const theme = useThemeConfig()

  if (!isOpen) return null

  const handleAccept = () => {
    setAccepted(true)
    acceptTerms()
    onClose()
  }

  const handleDecline = () => {
    declineTerms()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="rounded-lg p-6 max-w-md w-full mx-4"
        style={{
          background: theme.colors.surface,
          borderColor: theme.colors.border,
          borderWidth: '1px',
          borderStyle: 'solid'
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3
            className="text-lg font-semibold"
            style={{ color: theme.colors.textPrimary }}
          >
            WaveTek Terms.
          </h3>
          <button
            onClick={onClose}
            style={{ color: theme.colors.textMuted }}
            className="hover:opacity-70 transition-opacity"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-3 mb-6 text-sm" style={{ color: theme.colors.textSecondary }}>
          <div
            className="p-3 rounded-lg border"
            style={{
              backgroundColor: theme.name === 'dark' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(254, 226, 226, 0.8)',
              borderColor: theme.colors.error
            }}
          >
            <div className="flex items-center gap-2">
              <ExclamationTriangleIcon
                className="w-5 h-5"
                style={{ color: theme.colors.warning }}
              />
              <p
                className="font-medium"
                style={{ color: theme.colors.warning }}
              >
                Mainnet Audit Warning
              </p>
            </div>
            <p
              className="mt-1"
              style={{ color: theme.colors.warning }}
            >
              This platform has NOT been audited on mainnet yet. Only risk fund you are willing to let go of.
            </p>
          </div>

          <div className="space-y-2">
            <p><strong>User Responsibility:</strong> You transact at your own risk and are responsible for your wallet security.</p>
            <p><strong>No Warranty:</strong> Service provided "as is" without any guarantees.</p>
            <p><strong>Risk Acknowledgment:</strong> Cryptocurrency prices are volatile and losses can occur.</p>
            <p><strong>Legal Compliance:</strong> You must comply with local laws and regulations.</p>
            <p><strong>Privacy:</strong> Transactions are visible on blockchain; we don't store private keys.</p>
          </div>

          <div
            className="p-3 rounded-lg"
            style={{
              backgroundColor: theme.colors.glass,
              borderColor: theme.colors.glassBorder,
              borderWidth: '1px',
              borderStyle: 'solid'
            }}
          >
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="mt-1 rounded"
                style={{
                  accentColor: theme.colors.primary,
                  borderColor: theme.colors.border
                }}
              />
              <span className="text-xs" style={{ color: theme.colors.textSecondary }}>
                I have read and agree to the terms. I understand the risks and use this service at my own discretion.
              </span>
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleDecline}
            className="flex-1 px-4 py-2 rounded-lg transition-colors"
            style={{
              color: theme.colors.textPrimary,
              borderColor: theme.colors.border,
              borderWidth: '1px',
              borderStyle: 'solid',
              backgroundColor: theme.colors.surface,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = theme.colors.surfaceHover
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = theme.colors.surface
            }}
          >
            Decline
          </button>
          <button
            onClick={handleAccept}
            disabled={!accepted}
            className="flex-1 px-4 py-2 rounded-lg transition-colors"
            style={{
              backgroundColor: accepted ? theme.colors.primary : theme.colors.surface,
              color: accepted ? theme.colors.textInverse : theme.colors.textMuted,
              borderColor: accepted ? theme.colors.primary : theme.colors.border,
              borderWidth: '1px',
              borderStyle: 'solid',
              opacity: accepted ? 1 : 0.5,
              cursor: accepted ? 'pointer' : 'not-allowed'
            }}
            onMouseEnter={(e) => {
              if (accepted) {
                e.currentTarget.style.backgroundColor = theme.colors.primaryHover
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = accepted ? theme.colors.primary : theme.colors.surface
            }}
          >
            Accept & Continue
          </button>
        </div>
      </div>
    </div>
  )
}