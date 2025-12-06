'use client'

import React, { useState } from 'react'
import { Wallet, AlertCircle, ExternalLink, Check, Star, Shield, Zap, Users, Globe } from 'lucide-react'
import { useWallet } from '@/hooks/useWalletAdapter'
import { useWalletModal } from '@/contexts/WalletModalContext'
import { useThemeConfig, createGlassStyles } from '@/lib/theme'
import { Modal } from '@/components/ui/Modal'

interface MultiWalletModalProps {
  isOpen: boolean
  onClose: () => void
}

interface WalletOption {
  name: string
  description: string
  icon: string
  installUrl: string
  isRecommended?: boolean
  features?: string[]
  userCount?: string
  category?: 'browser' | 'mobile' | 'hardware'
  isInstalled?: boolean
  comingSoon?: boolean
}

const WALLET_OPTIONS: WalletOption[] = [
  {
    name: 'Phantom',
    description: 'Most popular Solana wallet with DeFi focus',
    icon: 'data:image/svg+xml,' + encodeURIComponent(`
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" rx="8" fill="#AB9FF2"/>
        <path d="M8 12h16M8 16h16M8 20h12" stroke="white" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `),
    installUrl: 'https://phantom.app/',
    isRecommended: true,
    features: ['NFT Support', 'DeFi Apps', 'Staking', 'Multi-chain'],
    userCount: '10M+ users',
    category: 'browser'
  },
  {
    name: 'Backpack',
    description: 'Professional wallet with advanced features',
    icon: '/assets/wallets/backpack.svg',
    installUrl: 'https://backpack.app/',
    features: ['Advanced Trading', 'xNFTs', 'Social Features'],
    userCount: '1M+ users',
    category: 'browser'
  },
  {
    name: 'Google',
    description: 'Sign in with your Google account',
    icon: '/assets/wallets/google.svg',
    installUrl: '#',
    isRecommended: true,
    features: ['Familiar Sign-in', 'Google Security', 'Easy Recovery'],
    userCount: '2B+ users',
    category: 'browser',
    comingSoon: true
  },
  {
    name: 'Apple',
    description: 'Sign in with your Apple ID',
    icon: '/assets/wallets/apple.svg',
    installUrl: '#',
    features: ['Face ID / Touch ID', 'Apple Security', 'iCloud Sync'],
    userCount: '1B+ users',
    category: 'browser',
    comingSoon: true
  },
  {
    name: 'Jupiter',
    description: 'Jupiter aggregator wallet integration',
    icon: '/assets/wallets/jupiter.svg',
    installUrl: 'https://jup.ag/',
    features: ['Best Swap Rates', 'DEX Aggregation', 'Low Slippage'],
    userCount: '2M+ users',
    category: 'browser',
    comingSoon: true
  },
  {
    name: 'Ledger',
    description: 'Hardware wallet with maximum security',
    icon: '/assets/wallets/ledger.svg',
    installUrl: 'https://www.ledger.com/',
    features: ['Cold Storage', 'Hardware Security', 'Multi-chain'],
    userCount: '5M+ devices',
    category: 'hardware'
  }
]

export function MultiWalletModal({ isOpen, onClose }: MultiWalletModalProps) {
  const { connect, connecting, connected, wallets } = useWallet()
  const { closeModal } = useWalletModal()
  const theme = useThemeConfig()
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null)

  const handleWalletConnect = async (walletName: string) => {
    if (connecting) return

    try {
      setSelectedWallet(walletName)
      console.log(`Connecting to ${walletName} wallet...`)

      // For wallets that aren't available yet
      const walletOption = WALLET_OPTIONS.find(w => w.name === walletName)
      if (walletOption?.comingSoon) {
        alert(`${walletName} wallet support is coming soon!`)
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
            const shouldInstall = confirm(`${walletName} wallet is not installed. Would you like to install it?`)
            if (shouldInstall) {
              window.open(walletOption.installUrl, '_blank')
            }
          } else {
            alert(`${walletName} wallet is not installed. Please install it and try again.`)
          }
        } else if (error.message.includes('User rejected')) {
          // User cancelled - no action needed
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

  const handleInstallWallet = (wallet: WalletOption) => {
    if (wallet.installUrl && wallet.installUrl !== '#') {
      window.open(wallet.installUrl, '_blank')
    }
  }

  const filterWallets = () => {
    // Show all wallets regardless of installation status
    return WALLET_OPTIONS
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      showCloseButton={true}
      title="Connect Wallet"
    >
      <div style={{ padding: '1.5rem' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div
            style={{
              width: '4rem',
              height: '4rem',
              borderRadius: '1rem',
              background: `linear-gradient(135deg, ${theme.colors.primary}25, ${theme.colors.primary}15)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1rem',
              border: `2px solid ${theme.colors.primary}30`,
              backdropFilter: 'blur(20px)'
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
          <h2
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              color: theme.colors.textPrimary,
              marginBottom: '0.5rem',
              fontFamily: 'var(--font-helvetica)'
            }}
          >
            Connect Your Wallet
          </h2>
          <p
            style={{
              fontSize: '0.875rem',
              color: theme.colors.textSecondary,
              fontFamily: 'var(--font-helvetica)'
            }}
          >
            Choose your preferred wallet to connect to WaveSwap
          </p>
        </div>

        {/* Wallet Options */}
        <div style={{ display: 'grid', gap: '1rem', marginBottom: '1.5rem' }}>
          {filterWallets().map((wallet) => {
            const isInstalled = wallets.some(w => w.adapter.name === wallet.name && w.adapter.readyState === 'Installed')
            const isConnecting = connecting && selectedWallet === wallet.name

            return (
              <div
                key={wallet.name}
                style={{
                  position: 'relative'
                }}
              >
                {wallet.comingSoon && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '0.5rem',
                      right: '0.5rem',
                      padding: '0.25rem 0.75rem',
                      background: `${theme.colors.warning}15`,
                      color: theme.colors.warning,
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      borderRadius: '9999px',
                      border: `1px solid ${theme.colors.warning}30`,
                      fontFamily: 'var(--font-helvetica)',
                      zIndex: 10
                    }}
                  >
                    Coming Soon
                  </div>
                )}

                <button
                  onClick={() => wallet.comingSoon ? handleInstallWallet(wallet) : handleWalletConnect(wallet.name)}
                  disabled={isConnecting || (!isInstalled && !wallet.comingSoon)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    padding: '1.25rem',
                    borderRadius: '0.875rem',
                    background: wallet.comingSoon
                      ? `${theme.colors.surface}50`
                      : isInstalled
                        ? `linear-gradient(135deg,
                            ${theme.colors.primary}15 0%,
                            ${theme.colors.primary}08 50%,
                            ${theme.colors.primary}15 100%
                          )`
                        : `${theme.colors.surface}30`,
                    border: wallet.comingSoon
                      ? `1px solid ${theme.colors.border}`
                      : isInstalled
                        ? `2px solid ${theme.colors.primary}30`
                        : `1px solid ${theme.colors.border}`,
                    backdropFilter: 'blur(20px)',
                    boxShadow: isInstalled
                      ? `0 8px 24px ${theme.colors.primary}20`
                      : `0 4px 12px ${theme.colors.shadow}`,
                    fontFamily: 'var(--font-helvetica)',
                    fontWeight: 500,
                    fontSize: '1rem',
                    color: theme.colors.textPrimary,
                    cursor: wallet.comingSoon ? 'pointer' : (isConnecting ? 'not-allowed' : 'pointer'),
                    opacity: (isConnecting && selectedWallet !== wallet.name) ? 0.6 : 1,
                    transition: `all ${theme.animations.duration} ${theme.animations.easing}`,
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                  onMouseEnter={(e) => {
                    if (!isConnecting && (!wallet.comingSoon || isInstalled)) {
                      e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)'
                      e.currentTarget.style.borderColor = isInstalled ? `${theme.colors.primary}50` : `${theme.colors.primary}30`
                      e.currentTarget.style.boxShadow = isInstalled
                        ? `0 12px 32px ${theme.colors.primary}30`
                        : `0 8px 20px ${theme.colors.shadow}`
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0) scale(1)'
                    e.currentTarget.style.borderColor = isInstalled ? `${theme.colors.primary}30` : `${theme.colors.border}`
                    e.currentTarget.style.boxShadow = isInstalled
                      ? `0 8px 24px ${theme.colors.primary}20`
                      : `0 4px 12px ${theme.colors.shadow}`
                  }}
                >
                  {/* Wallet Icon */}
                  <div
                    style={{
                      width: '3rem',
                      height: '3rem',
                      borderRadius: '0.75rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: isInstalled
                        ? `linear-gradient(135deg, ${theme.colors.primary}20, ${theme.colors.primary}10)`
                        : `${theme.colors.surface}50`,
                      border: isInstalled
                        ? `1px solid ${theme.colors.primary}30`
                        : `1px solid ${theme.colors.border}`,
                      position: 'relative'
                    }}
                  >
                    {wallet.icon && (
                      <img
                        src={wallet.icon}
                        alt={wallet.name}
                        style={{
                          width: '1.75rem',
                          height: '1.75rem',
                          filter: wallet.name === 'Phantom' ? 'none' : 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2))'
                        }}
                        onError={(e) => {
                          // Fallback to generic wallet icon if image fails
                          e.currentTarget.style.display = 'none'
                          e.currentTarget.parentElement!.innerHTML = `
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="${theme.colors.textMuted}" stroke-width="2">
                              <rect x="2" y="5" width="20" height="14" rx="2"/>
                              <path d="M2 10h20"/>
                            </svg>
                          `
                        }}
                      />
                    )}

                    {wallet.isRecommended && !wallet.comingSoon && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '-0.25rem',
                          right: '-0.25rem',
                          width: '1.25rem',
                          height: '1.25rem',
                          borderRadius: '50%',
                          background: theme.colors.warning,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: `2px solid ${theme.colors.surface}`
                        }}
                      >
                        <Star size={10} style={{ color: 'white' }} fill="white" />
                      </div>
                    )}
                  </div>

                  {/* Wallet Info */}
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: '1.125rem',
                          color: theme.colors.textPrimary,
                          fontFamily: 'var(--font-helvetica)'
                        }}
                      >
                        {wallet.name}
                      </span>
                      {wallet.isRecommended && !wallet.comingSoon && (
                        <span
                          style={{
                            padding: '0.1875rem 0.625rem',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            borderRadius: '9999px',
                            background: `${theme.colors.warning}20`,
                            color: theme.colors.warning,
                            border: `1px solid ${theme.colors.warning}30`,
                            fontFamily: 'var(--font-helvetica)'
                          }}
                        >
                          Recommended
                        </span>
                      )}
                      {isInstalled && (
                        <span
                          style={{
                            padding: '0.1875rem 0.625rem',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            borderRadius: '9999px',
                            background: `${theme.colors.success}20`,
                            color: theme.colors.success,
                            border: `1px solid ${theme.colors.success}30`,
                            fontFamily: 'var(--font-helvetica)'
                          }}
                        >
                          Installed
                        </span>
                      )}
                    </div>
                    <p
                      style={{
                        fontSize: '0.875rem',
                        color: theme.colors.textSecondary,
                        fontFamily: 'var(--font-helvetica)',
                        margin: 0,
                        lineHeight: '1.4'
                      }}
                    >
                      {wallet.description}
                    </p>
                    {wallet.userCount && (
                      <p
                        style={{
                          fontSize: '0.75rem',
                          color: theme.colors.textMuted,
                          fontFamily: 'var(--font-helvetica)',
                          margin: '0.25rem 0 0'
                        }}
                      >
                        {wallet.userCount}
                      </p>
                    )}
                  </div>

                  {/* Connection Status */}
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    {isConnecting ? (
                      <div
                        style={{
                          width: '1.5rem',
                          height: '1.5rem',
                          borderRadius: '50%',
                          border: `2.5px solid ${theme.colors.primary}30`,
                          borderTopColor: theme.colors.primary,
                          animation: 'spin 1s linear infinite'
                        }}
                      />
                    ) : wallet.comingSoon ? (
                      <div
                        style={{
                          width: '1.5rem',
                          height: '1.5rem',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: `${theme.colors.warning}15`,
                          border: `1.5px solid ${theme.colors.warning}30`
                        }}
                      >
                        <AlertCircle size={14} style={{ color: theme.colors.warning }} />
                      </div>
                    ) : isInstalled ? (
                      <div
                        style={{
                          width: '1.5rem',
                          height: '1.5rem',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: `${theme.colors.success}25`,
                          border: `1.5px solid ${theme.colors.success}40`
                        }}
                      >
                        <Check size={12} style={{ color: theme.colors.success }} />
                      </div>
                    ) : (
                      <div
                        style={{
                          width: '1.5rem',
                          height: '1.5rem',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: `${theme.colors.primary}15`,
                          border: `1.5px solid ${theme.colors.primary}25`
                        }}
                      >
                        <Wallet size={14} style={{ color: theme.colors.primary }} />
                      </div>
                    )}
                  </div>
                </button>
              </div>
            )
          })}
        </div>

        {/* Help Section */}
        <div
          style={{
            padding: '1rem',
            borderRadius: '0.75rem',
            background: `${theme.colors.primary}08`,
            border: `1px solid ${theme.colors.primary}20`,
            fontFamily: 'var(--font-helvetica)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <AlertCircle size={16} style={{ color: theme.colors.primary }} />
            <span
              style={{
                fontSize: '0.875rem',
                fontWeight: 600,
                color: theme.colors.textPrimary
              }}
            >
              New to crypto wallets?
            </span>
          </div>
          <p
            style={{
              fontSize: '0.75rem',
              color: theme.colors.textSecondary,
              marginBottom: '0.75rem',
              lineHeight: '1.4'
            }}
          >
            A crypto wallet lets you store and manage your digital assets. We recommend Phantom for beginners.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
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
              Get Phantom
              <ExternalLink size={12} />
            </a>
            <a
              href="https://docs.solana.com/wallet-guide"
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
                background: 'transparent',
                color: theme.colors.primary,
                textDecoration: 'none',
                border: `1px solid ${theme.colors.primary}30`,
                transition: `all ${theme.animations.duration} ${theme.animations.easing}`,
                fontFamily: 'var(--font-helvetica)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = `${theme.colors.primary}10`
                e.currentTarget.style.borderColor = `${theme.colors.primary}50`
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.borderColor = `${theme.colors.primary}30`
              }}
            >
              Learn More
              <ExternalLink size={12} />
            </a>
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default MultiWalletModal