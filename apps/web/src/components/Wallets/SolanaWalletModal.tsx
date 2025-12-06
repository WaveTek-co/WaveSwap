'use client'

import React from 'react'
import { Wallet, AlertCircle } from 'lucide-react'
import { useWallet } from '@/hooks/useWalletAdapter'
import { useThemeConfig, createButtonStyles, createGlassStyles } from '@/lib/theme'
import { ConnectedWallet } from './ConnectedWallet'
import { Modal } from '@/components/ui/Modal'

interface SolanaWalletModalProps {
  isOpen: boolean
  onClose: () => void
}

export function SolanaWalletModal({ isOpen, onClose }: SolanaWalletModalProps) {
  const { connect, connecting, connected, publicKey, disconnect, wallet } = useWallet()
  const theme = useThemeConfig()

  // Wallet utility functions
  const copyAddress = async () => {
    if (publicKey) {
      try {
        await navigator.clipboard.writeText(publicKey.toString())
      } catch (error) {
        console.error('Failed to copy address:', error)
      }
    }
  }

  const handleDisconnect = async () => {
    try {
      console.log('Disconnecting wallet...')
      await disconnect()
      console.log('Wallet disconnected successfully')
      onClose()
    } catch (error) {
      console.error('Failed to disconnect wallet:', error)
      // Still close the modal even if disconnect fails
      onClose()
    }
  }

  const handleConnect = async () => {
    try {
      console.log('Connecting to Phantom wallet...')
      await connect()
      console.log('Wallet connection successful')
      setTimeout(() => {
        onClose()
      }, 500)
    } catch (error) {
      console.error('Failed to connect wallet:', error)
      if (error instanceof Error) {
        if (error.message.includes('not installed')) {
          alert('Phantom wallet is not installed. Please install it and make sure it\'s unlocked.')
        } else if (error.message.includes('User rejected')) {
          // User cancelled - no action needed
          console.log('User cancelled wallet connection')
        } else {
          alert(`Failed to connect to Phantom: ${error.message}`)
        }
      } else {
        alert('Failed to connect to Phantom. Please try again.')
      }
    }
  }

  // Check if Phantom is installed
  const isPhantomInstalled = typeof window !== 'undefined' && !!(window as any).phantom?.solana?.isPhantom

  // Simplified wallet info for Phantom SDK
  const phantomWallet = {
    adapterName: 'Phantom',
    name: 'Phantom',
    description: 'Most popular Solana wallet',
    icon: 'data:image/svg+xml,' + encodeURIComponent(`
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" rx="8" fill="#AB9FF2"/>
        <path d="M8 12h16M8 16h16M8 20h12" stroke="white" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `),
    color: '#AB9FF2',
    installUrl: 'https://phantom.app/',
    isInstalled: isPhantomInstalled,
    isRecommended: true,
    wallet: wallet,
  }

  const handleWalletConnect = async () => {
    await handleConnect()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      showCloseButton={true}
      title="Sign in with Solana"
    >
      <div style={{ padding: '1.5rem' }}>
        {/* Custom Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <div
            style={{
              width: '3rem',
              height: '3rem',
              borderRadius: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              ...createGlassStyles(theme),
              position: 'relative' as const
            }}
          >
            <Wallet
              size={24}
              style={{
                color: theme.colors.primary,
                filter: 'drop-shadow(0 0 8px rgba(33, 188, 255, 0.4))'
              }}
            />
          </div>
          <div>
            <h2
              style={{
                fontSize: '1.25rem',
                fontWeight: 600,
                letterSpacing: '0.025em',
                color: theme.colors.textPrimary,
                fontFamily: 'var(--font-helvetica)'
              }}
            >
              {connected ? 'Wallet Connected' : 'Connect Wallet'}
            </h2>
            {connected && (
              <p
                style={{
                  fontSize: '0.875rem',
                  marginTop: '0.25rem',
                  color: theme.colors.textMuted,
                  fontFamily: 'var(--font-helvetica)'
                }}
              >
                {wallet?.adapter?.name || 'Phantom'}
              </p>
            )}
          </div>
        </div>

        {/* Connected Wallet Display */}
        {connected && (
          <div style={{ marginBottom: '1.5rem' }}>
            <ConnectedWallet
              publicKey={publicKey}
              walletName={wallet?.adapter?.name || 'Phantom'}
              onDisconnect={handleDisconnect}
              onCopyAddress={copyAddress}
            />
          </div>
        )}

        {/* Phantom Wallet - only show when not connected */}
        {!connected && phantomWallet && (
          <div style={{ marginBottom: '1rem' }}>
            <button
              onClick={handleWalletConnect}
              disabled={connecting || !phantomWallet.isInstalled}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '1.25rem',
                borderRadius: '0.875rem',
                background: `
                  linear-gradient(135deg,
                    ${theme.colors.primary}25 0%,
                    ${theme.colors.primary}15 50%,
                    ${theme.colors.primary}25 100%
                  ),
                  radial-gradient(circle at 30% 30%,
                    ${theme.colors.primary}20 0%,
                    transparent 60%
                  )
                `,
                border: `2px solid ${theme.colors.primary}40`,
                backdropFilter: 'blur(20px) saturate(1.8)',
                boxShadow: `
                  0 12px 40px ${theme.colors.primary}25,
                  inset 0 1px 0 rgba(255, 255, 255, 0.2),
                  0 0 0 1px ${theme.colors.primary}15
                `,
                fontFamily: 'var(--font-helvetica)',
                fontWeight: 600,
                fontSize: '1rem',
                color: theme.colors.textPrimary,
                cursor: connecting || !phantomWallet.isInstalled ? 'not-allowed' : 'pointer',
                opacity: connecting || !phantomWallet.isInstalled ? 0.6 : 1,
                transition: `all ${theme.animations.duration} ${theme.animations.easing}`,
                transform: 'scale(1)',
                position: 'relative'
              }}
              onMouseEnter={(e) => {
                if (!connecting && phantomWallet.isInstalled) {
                  e.currentTarget.style.transform = 'scale(1.02)'
                  e.currentTarget.style.borderColor = `${theme.colors.primary}60`
                  e.currentTarget.style.boxShadow = `
                    0 16px 48px ${theme.colors.primary}35,
                    inset 0 1px 0 rgba(255, 255, 255, 0.25),
                    0 0 0 1px ${theme.colors.primary}25
                  `
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)'
                e.currentTarget.style.borderColor = `${theme.colors.primary}40`
                e.currentTarget.style.boxShadow = `
                  0 12px 40px ${theme.colors.primary}25,
                  inset 0 1px 0 rgba(255, 255, 255, 0.2),
                  0 0 0 1px ${theme.colors.primary}15
                `
              }}
            >
              {/* Phantom Icon */}
              <div
                style={{
                  width: '3.5rem',
                  height: '3.5rem',
                  borderRadius: '0.875rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: `linear-gradient(135deg, ${theme.colors.primary}20, ${theme.colors.primary}10)`,
                  border: `1px solid ${theme.colors.primary}30`,
                  backdropFilter: 'blur(10px)'
                }}
              >
                <img
                  src={phantomWallet.icon}
                  alt="Phantom Wallet"
                  style={{
                    width: '2.25rem',
                    height: '2.25rem',
                    filter: 'drop-shadow(0 2px 8px rgba(0, 0, 0, 0.3))'
                  }}
                />
              </div>

              {/* Phantom Info */}
              <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
                  <span style={{
                    fontWeight: 700,
                    fontSize: '1.125rem',
                    letterSpacing: '0.025em',
                    color: theme.colors.textPrimary,
                    fontFamily: 'var(--font-helvetica)'
                  }}>
                    Phantom
                  </span>
                  <span style={{
                    padding: '0.1875rem 0.625rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    borderRadius: '9999px',
                    background: `${theme.colors.primary}20`,
                    color: theme.colors.primary,
                    border: `1px solid ${theme.colors.primary}30`,
                    fontFamily: 'var(--font-helvetica)'
                  }}>
                    Recommended
                  </span>
                  {!phantomWallet.isInstalled && (
                    <span style={{
                      padding: '0.1875rem 0.625rem',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      borderRadius: '9999px',
                      border: `1px solid ${theme.colors.warning}40`,
                      background: `${theme.colors.warning}15`,
                      color: theme.colors.warning,
                      fontFamily: 'var(--font-helvetica)'
                    }}>
                      Install
                    </span>
                  )}
                </div>
                <p style={{
                  fontSize: '0.875rem',
                  lineHeight: '1.5',
                  color: theme.colors.textSecondary,
                  fontFamily: 'var(--font-helvetica)',
                  margin: 0
                }}>
                  Most popular Solana wallet • Fast & secure
                </p>
              </div>

              {/* Connection Status */}
              <div style={{ display: 'flex', alignItems: 'center' }}>
                {connecting ? (
                  <div style={{
                    width: '1.5rem',
                    height: '1.5rem',
                    borderRadius: '50%',
                    border: `2.5px solid ${theme.colors.primary}30`,
                    borderTopColor: theme.colors.primary,
                    animation: 'spin 1s linear infinite'
                  }} />
                ) : phantomWallet.isInstalled ? (
                  <div style={{
                    width: '1.5rem',
                    height: '1.5rem',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: `${theme.colors.success}25`,
                    border: `1.5px solid ${theme.colors.success}40`
                  }}>
                    <div style={{
                      width: '0.75rem',
                      height: '0.75rem',
                      borderRadius: '50%',
                      background: theme.colors.success
                    }} />
                  </div>
                ) : (
                  <div style={{
                    width: '1.5rem',
                    height: '1.5rem',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: `${theme.colors.primary}15`,
                    border: `1.5px solid ${theme.colors.primary}25`
                  }}>
                    <Wallet size={14} style={{ color: theme.colors.primary }} />
                  </div>
                )}
              </div>
            </button>
          </div>
        )}

        {/* Install Phantom Section - show when Phantom not installed */}
        {!connected && (!phantomWallet || !phantomWallet.isInstalled) && (
          <div
            style={{
              padding: '1rem',
              borderRadius: '0.75rem',
              background: `${theme.colors.primary}08`,
              border: `1px solid ${theme.colors.primary}20`,
              fontFamily: 'var(--font-helvetica)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <AlertCircle size={14} style={{ color: theme.colors.primary }} />
              <span style={{
                fontSize: '0.875rem',
                fontWeight: 600,
                color: theme.colors.textPrimary
              }}>
                Get Phantom Wallet
              </span>
            </div>
            <p style={{
              fontSize: '0.75rem',
              color: theme.colors.textSecondary,
              marginBottom: '0.75rem',
              lineHeight: '1.4'
            }}>
              New to Solana? Phantom is the most popular wallet with the best experience
            </p>
            <a
              href="https://phantom.app/"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.375rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                padding: '0.375rem 0.875rem',
                borderRadius: '0.5rem',
                background: theme.colors.primary,
                color: 'white',
                textDecoration: 'none',
                transition: `all ${theme.animations.duration} ${theme.animations.easing}`,
                fontFamily: 'var(--font-helvetica)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)'
                e.currentTarget.style.background = `${theme.colors.primary}cc`
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)'
                e.currentTarget.style.background = theme.colors.primary
              }}
            >
              Get Phantom →
            </a>
          </div>
        )}

        {/* Connected State Footer */}
        {connected && (
          <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
            <button
              onClick={onClose}
              style={{
                ...createButtonStyles(theme, 'secondary', 'sm'),
                padding: '0.5rem 1.5rem',
                fontFamily: 'var(--font-helvetica)',
                fontSize: '0.875rem',
                fontWeight: 500,
                ...createGlassStyles(theme),
                border: `1px solid ${theme.colors.border}`
              }}
            >
              Done
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}

export default SolanaWalletModal