'use client'

import React from 'react'
import dynamic from 'next/dynamic'
import { useWalletModal } from '@/contexts/WalletModalContext'
import { useThemeConfig } from '@/lib/theme'

interface PhantomConnectModalProps {
  isOpen: boolean
  onClose: () => void
}

// Dynamically import the modal content to avoid SSR issues
const PhantomModalContent = dynamic(
  () => import('./PhantomModalContent').then(mod => ({ default: mod.PhantomModalContent })),
  {
    ssr: false,
    loading: () => null
  }
)

export function PhantomConnectModal({ isOpen, onClose }: PhantomConnectModalProps) {
  const theme = useThemeConfig()

  if (!isOpen) return null

  const handleClose = () => {
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: theme.name === 'light'
            ? `${theme.colors.surface}f8`
            : `${theme.colors.surface}ee`,
          border: `1px solid ${theme.colors.primary}15`,
          backdropFilter: 'blur(24px) saturate(1.8)',
          boxShadow: `
            0 20px 40px ${theme.colors.shadow},
            inset 0 1px 0 rgba(255, 255, 255, 0.1)
          `,
          borderRadius: '16px',
          padding: '24px'
        }}
      >
        <PhantomModalContent onClose={onClose} />
      </div>
    </div>
  )
}