'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { useThemeConfig, createGlassStyles } from '@/lib/theme'

interface ComingSoonModalProps {
  isOpen: boolean
  onClose: () => void
  feature: string
  description?: string
}

export function ComingSoonModal({ isOpen, onClose, feature, description }: ComingSoonModalProps) {
  const theme = useThemeConfig()

  const getFeatureMessage = (feature: string): string => {
    switch (feature.toLowerCase()) {
      case 'zcash':
      case 'zec':
        return 'Zcash bridges are coming soon! We\'re working hard to bring you secure ZEC↔SOL bridging with transparent privacy features.'
      case 'starknet':
      case 'starkgate':
        return 'StarkNet bridges are coming soon! We\'re integrating with StarkGate for secure SOL↔StarkNet transfers.'
      case 'near intents':
        return 'Near Intents bridges are coming soon! We\'re integrating with the Near Intents protocol for seamless cross-chain swaps.'
      case 'defuse':
        return 'Defuse bridges are coming soon! We\'re integrating with the Defuse protocol for enhanced bridging capabilities.'
      case 'deposit':
        return 'Deposits are coming soon! We\'re working on secure deposit functionality for your assets.'
      case 'withdrawal':
        return 'Withdrawals are coming soon! We\'re implementing secure withdrawal functionality.'
      case 'staking':
        return 'Staking is coming soon! We\'re working on bringing you high-yield staking opportunities.'
      case 'privacy':
        return 'Privacy features are coming soon! We\'re implementing advanced privacy-preserving transactions.'
      default:
        return `${feature} is coming soon! We're working hard to bring you this feature.`
    }
  }

  const getFeatureIcon = (feature: string): string => {
    switch (feature.toLowerCase()) {
      case 'zcash':
      case 'zec':
        return '🛡️'
      case 'starknet':
      case 'starkgate':
        return '⚡'
      case 'near intents':
        return '🌈'
      case 'defuse':
        return '🔮'
      case 'deposit':
        return '💰'
      case 'withdrawal':
        return '💸'
      case 'staking':
        return '🪙'
      case 'privacy':
        return '🔒'
      default:
        return '🚀'
    }
  }

  const message = description || getFeatureMessage(feature)
  const icon = getFeatureIcon(feature)

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div
        className="p-8 max-w-md mx-auto text-center"
        style={{
          ...createGlassStyles(theme),
          background: theme.colors.surface,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: '16px',
          boxShadow: `0 8px 32px ${theme.colors.shadow}`
        }}
      >
        <div className="mb-6">
          <div className="text-6xl mb-4">{icon}</div>
          <h2
            className="text-2xl font-bold mb-2"
            style={{ color: theme.colors.primary }}
          >
            {feature} - Coming Soon!
          </h2>
        </div>

        <p
          className="mb-6 leading-relaxed"
          style={{ color: theme.colors.secondary }}
        >
          {message}
        </p>

        <div
          className="mb-6 p-4 rounded-lg"
          style={{
            background: `${theme.colors.primary}10`,
            border: `1px solid ${theme.colors.primary}30`
          }}
        >
          <p
            className="text-sm font-medium"
            style={{ color: theme.colors.primary }}
          >
            💡 Stay tuned for updates!
          </p>
          <p
            className="text-sm mt-2 opacity-75"
            style={{ color: theme.colors.secondary }}
          >
            Follow our social channels for the latest announcements on feature releases.
          </p>
        </div>

        <div className="flex gap-3 justify-center">
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-lg font-medium transition-all hover:scale-105"
            style={{
              background: theme.colors.primary,
              color: theme.colors.background
            }}
          >
            Got it!
          </button>
        </div>
      </div>
    </Modal>
  )
}

export function useComingSoon() {
  const [modalState, setModalState] = useState<{
    isOpen: boolean
    feature: string
    description?: string
  }>({
    isOpen: false,
    feature: '',
    description: ''
  })

  const showComingSoon = (feature: string, description?: string) => {
    setModalState({
      isOpen: true,
      feature,
      description
    })
  }

  const hideComingSoon = () => {
    setModalState({
      isOpen: false,
      feature: '',
      description: ''
    })
  }

  return {
    showComingSoon,
    hideComingSoon,
    modalState
  }
}

export default ComingSoonModal