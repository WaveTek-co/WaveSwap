'use client'

import React, { useState } from 'react'
import { useWallet } from '@/hooks/useWalletAdapter'
import { useWalletModal } from '@/contexts/WalletModalContext'
import { useThemeConfig } from '@/lib/theme'
import { X, Wallet, ExternalLink, Check } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'

interface CompactWalletModalProps {
  isOpen: boolean
  onClose: () => void
}

// Wallet configurations with minimal info
const WALLET_OPTIONS = [
  {
    name: 'phantom',
    displayName: 'Phantom',
    description: 'Popular Solana wallet',
    icon: 'data:image/svg+xml,' + encodeURIComponent(`
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="20" height="20" rx="4" fill="#AB9FF2"/>
        <path d="M5 7.5h10M5 10h10M5 12.5h7.5" stroke="white" stroke-width="1.2" stroke-linecap="round"/>
      </svg>
    `),
    installUrl: 'https://phantom.app/',
    isRecommended: true
  },
  {
    name: 'google',
    displayName: 'Google',
    description: 'Sign in with Google',
    icon: 'data:image/svg+xml,' + encodeURIComponent(`
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="20" height="20" rx="4" fill="white"/>
        <path d="M14 10c0-1.7-.9-3.2-2.3-4l.2-2.8c-1.5-.3-2.8.4-3.7 1.2-1-.2-2.2-.2-3.2 0-.9-.8-2.2-1.5-3.7-1.2l.2 2.8C6.3 7 5.3 8.5 5.3 10c0 2.8 2.8 5 6.5 5h1.8c3.7 0 6.5-2.2 6.5-5z" fill="#4285F4"/>
      </svg>
    `),
    installUrl: '#',
    comingSoon: true
  },
  {
    name: 'apple',
    displayName: 'Apple',
    description: 'Sign in with Apple',
    icon: 'data:image/svg+xml,' + encodeURIComponent(`
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="20" height="20" rx="4" fill="black"/>
        <path d="M14 8c0-1.7-.9-3.2-2.3-4l.2-2.8c-1.5-.3-2.8.4-3.7 1.2-1-.2-2.2-.2-3.2 0-.9-.8-2.2-1.5-3.7-1.2l.2 2.8c1.4.8 2.3 2.3 2.3 4z" fill="white"/>
      </svg>
    `),
    installUrl: '#',
    comingSoon: true
  }
]

export function CompactWalletModal({ isOpen, onClose }: CompactWalletModalProps) {
  const { connect, connecting, connected } = useWallet()
  const { closeModal } = useWalletModal()
  const theme = useThemeConfig()
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null)

  const handleWalletConnect = async (walletName: string) => {
    if (connecting) return

    try {
      setSelectedWallet(walletName)
      console.log(`Connecting to ${walletName} wallet...`)

      const walletOption = WALLET_OPTIONS.find(w => w.name === walletName)
      if (walletOption?.comingSoon) {
        alert(`${walletOption.displayName} is coming soon!`)
        return
      }

      await connect(walletName)
      console.log(`${walletName} wallet connected successfully`)
      onClose()
    } catch (error) {
      console.error(`Failed to connect to ${walletName}:`, error)
      if (error instanceof Error) {
        if (error.message.includes('not installed')) {
          const walletOption = WALLET_OPTIONS.find(w => w.name === walletName)
          if (walletOption && walletOption.installUrl !== '#') {
            const shouldInstall = confirm(`${walletOption.displayName} is not installed. Would you like to install it?`)
            if (shouldInstall) {
              window.open(walletOption.installUrl, '_blank')
            }
          } else {
            alert(`${walletOption.displayName} is not installed. Please install it and try again.`)
          }
        } else if (error.message.includes('User rejected')) {
          console.log('User cancelled wallet connection')
        } else {
          alert(`Failed to connect to ${walletName}: ${error.message}`)
        }
      } else {
        alert(`Failed to connect to ${walletName}. Please try again.`)
      }
    } finally {
      setSelectedWallet(null)
    }
  }

  if (connected) {
    return null // Don't show modal if already connected
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      showCloseButton={true}
      title="Connect Wallet"
    >
      <div style={{ padding: '1rem' }}>
        {/* Minimal header */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div
            style={{
              width: '3rem',
              height: '3rem',
              borderRadius: '0.75rem',
              background: `linear-gradient(135deg, ${theme.colors.primary}20, ${theme.colors.primary}10)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 0.75rem',
              border: `1px solid ${theme.colors.primary}20`,
            }}
          >
            <Wallet
              size={18}
              style={{ color: theme.colors.primary }}
            />
          </div>
          <h2
            style={{
              fontSize: '1.25rem',
              fontWeight: 600,
              color: theme.colors.textPrimary,
              margin: 0,
              fontFamily: 'var(--font-helvetica)'
            }}
          >
            Connect Wallet
          </h2>
        </div>

        {/* Compact wallet options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {WALLET_OPTIONS.map((wallet) => {
            const isConnecting = connecting && selectedWallet === wallet.name

            return (
              <button
                key={wallet.name}
                onClick={() => handleWalletConnect(wallet.name)}
                disabled={isConnecting || wallet.comingSoon}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.875rem 1rem',
                  borderRadius: '0.5rem',
                  background: wallet.comingSoon
                    ? theme.colors.surface
                    : theme.name === 'light'
                      ? 'white'
                      : `${theme.colors.surface}80`,
                  border: `1px solid ${wallet.comingSoon ? theme.colors.border : theme.colors.primary}20`,
                  fontFamily: 'var(--font-helvetica)',
                  fontSize: '0.875rem',
              fontWeight: 500,
                  color: wallet.comingSoon ? theme.colors.textMuted : theme.colors.textPrimary,
                  cursor: wallet.comingSoon ? 'not-allowed' : 'pointer',
                  opacity: (isConnecting && selectedWallet !== wallet.name) ? 0.6 : 1,
                  transition: `all ${theme.animations.duration} ${theme.animations.easing}`,
                  textAlign: 'left'
                }}
                onMouseEnter={(e) => {
                  if (!wallet.comingSoon && !isConnecting) {
                    e.currentTarget.style.background = theme.name === 'light'
                      ? `${theme.colors.primary}10`
                      : `${theme.colors.primary}15`
                    e.currentTarget.style.borderColor = theme.colors.primary
                    e.currentTarget.style.transform = 'translateY(-1px)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!wallet.comingSoon && !isConnecting) {
                    e.currentTarget.style.background = theme.name === 'light'
                      ? 'white'
                      : `${theme.colors.surface}80`
                    e.currentTarget.style.borderColor = `${theme.colors.primary}20`
                    e.currentTarget.style.transform = 'translateY(0)'
                  }
                }}
              >
                {/* Wallet Icon */}
                <div
                  style={{
                    width: '2rem',
                    height: '2rem',
                    borderRadius: '0.375rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: wallet.comingSoon
                      ? `${theme.colors.surface}60`
                      : theme.name === 'light'
                        ? `${theme.colors.primary}10`
                        : `${theme.colors.primary}20`,
                    flexShrink: 0
                  }}
                >
                  <div
                    dangerouslySetInnerHTML={{ __html: wallet.icon }}
                  />
                </div>

                {/* Wallet Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginBottom: '0.125rem'
                  }}>
                    <span style={{ fontWeight: 600 }}>
                      {wallet.displayName}
                    </span>
                    {wallet.isRecommended && (
                      <span
                        style={{
                          padding: '0.125rem 0.375rem',
                          fontSize: '0.625rem',
                          fontWeight: 600,
                          borderRadius: '9999px',
                          background: `${theme.colors.primary}20`,
                          color: theme.colors.primary,
                          lineHeight: 1
                        }}
                      >
                        Popular
                      </span>
                    )}
                    {wallet.comingSoon && (
                      <span
                        style={{
                          padding: '0.125rem 0.375rem',
                          fontSize: '0.625rem',
                          fontWeight: 600,
                          borderRadius: '9999px',
                          background: `${theme.colors.warning}20`,
                          color: theme.colors.warning,
                          lineHeight: 1
                        }}
                      >
                        Soon
                      </span>
                    )}
                  </div>
                  <div style={{
                    fontSize: '0.75rem',
                    color: theme.colors.textMuted,
                    lineHeight: 1.3
                  }}>
                    {wallet.description}
                  </div>
                </div>

                {/* Status */}
                <div style={{ flexShrink: 0 }}>
                  {isConnecting ? (
                    <div
                      style={{
                        width: '1rem',
                        height: '1rem',
                        borderRadius: '50%',
                        border: `1.5px solid ${theme.colors.primary}30`,
                        borderTopColor: theme.colors.primary,
                        animation: 'spin 1s linear infinite'
                      }}
                    />
                  ) : wallet.comingSoon ? null : (
                    <div
                      style={{
                        width: '1rem',
                        height: '1rem',
                        borderRadius: '50%',
                        background: `${theme.colors.success}20`,
                        border: `1px solid ${theme.colors.success}40`,
                        position: 'relative'
                      }}
                    >
                      <Check
                        size={6}
                        style={{
                          position: 'absolute',
                          top: '50%',
                          left: '50%',
                          transform: 'translate(-50%, -50%)',
                          color: theme.colors.success
                        }}
                      />
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* Minimal footer */}
        <div style={{
          marginTop: '1.5rem',
          textAlign: 'center',
          paddingTop: '1rem',
          borderTop: `1px solid ${theme.colors.border}`
        }}>
          <p
            style={{
              fontSize: '0.75rem',
              color: theme.colors.textMuted,
              margin: 0,
              fontFamily: 'var(--font-helvetica)'
            }}
          >
            By connecting, you agree to our Terms of Service
          </p>
        </div>
      </div>
    </Modal>
  )
}

export default CompactWalletModal