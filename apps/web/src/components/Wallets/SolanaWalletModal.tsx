'use client'

import { useState } from 'react'
import { Wallet, AlertCircle, ChevronDown } from 'lucide-react'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletName } from '@solana/wallet-adapter-base'
import { useThemeConfig, createButtonStyles, createGlassStyles } from '@/lib/theme'
import { ConnectedWallet } from './ConnectedWallet'
import { Modal } from '@/components/ui/Modal'

interface SolanaWalletModalProps {
  isOpen: boolean
  onClose: () => void
}

export function SolanaWalletModal({ isOpen, onClose }: SolanaWalletModalProps) {
  const { select, wallets, connect, connecting, connected, publicKey, disconnect, wallet } = useWallet()
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null)
  const [showOtherWallets, setShowOtherWallets] = useState(false)
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
      await disconnect()
      onClose()
    } catch (error) {
      console.error('Failed to disconnect wallet:', error)
    }
  }

  // Enhanced wallet list with real icons and proper metadata
  const getPhantomWallet = () => {
    const phantomWallet = wallets.find((wallet) =>
      wallet?.adapter?.name === 'Phantom'
    )

    if (!phantomWallet) return null

    return {
      adapterName: phantomWallet.adapter.name,
      name: phantomWallet.adapter.name,
      description: getWalletDescription(phantomWallet.adapter.name),
      icon: getWalletIcon(phantomWallet),
      color: getWalletColor(phantomWallet.adapter.name),
      installUrl: getWalletInstallUrl(phantomWallet.adapter.name),
      isInstalled: phantomWallet.readyState === 'Installed',
      isRecommended: true,
      wallet: phantomWallet,
      category: 'installed'
    }
  }

  const getOtherWallets = () => {
    const otherWallets = wallets
      .filter((wallet) => {
        // Exclude Phantom and only include known Solana wallets
        return wallet?.adapter?.name &&
               typeof wallet.adapter.name === 'string' &&
               wallet.adapter.name !== 'Phantom' &&
               ['Solflare', 'Backpack', 'Coinbase', 'Trust', 'Ledger', 'Keystone', 'Glow', 'MathWallet'].includes(wallet.adapter.name)
      })
      .map((wallet) => ({
        adapterName: wallet.adapter.name,
        name: wallet.adapter.name,
        description: getWalletDescription(wallet.adapter.name),
        icon: getWalletIcon(wallet),
        color: getWalletColor(wallet.adapter.name),
        installUrl: getWalletInstallUrl(wallet.adapter.name),
        isInstalled: wallet.readyState === 'Installed',
        isRecommended: false,
        wallet: wallet,
        category: 'other'
      }))

    return otherWallets
  }

  const getWalletDescription = (name: string) => {
    const descriptions: Record<string, string> = {
      'Phantom': 'Most popular Solana wallet',
      'Solflare': 'Professional Solana wallet',
      'Backpack': 'Developer-focused wallet',
      'Coinbase': 'Connect with Coinbase Wallet',
      'Trust': 'Trusted multi-chain wallet',
      'Ledger': 'Hardware wallet security',
      'Keystone': 'Air-gapped hardware wallet',
      'Glow': 'Mobile-first Solana wallet',
      'MathWallet': 'Multi-chain crypto wallet'
    }
    return descriptions[name] || 'Connect your Solana wallet'
  }

  const getWalletIcon = (wallet: any) => {
    // Use real wallet icons from wallet adapter
    if (wallet?.adapter?.icon) {
      return wallet.adapter.icon
    }

    // Fallback for wallets without adapters
    const fallbackIcons: Record<string, string> = {
      'Phantom': 'data:image/svg+xml,' + encodeURIComponent(`
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="32" height="32" rx="8" fill="#AB9FF2"/>
          <path d="M8 12h16M8 16h16M8 20h12" stroke="white" stroke-width="2" stroke-linecap="round"/>
        </svg>
      `),
      'Solflare': 'data:image/svg+xml,' + encodeURIComponent(`
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="32" height="32" rx="8" fill="#F4B942"/>
          <circle cx="16" cy="16" r="8" fill="white"/>
          <circle cx="16" cy="16" r="4" fill="#F4B942"/>
        </svg>
      `)
    }

    return fallbackIcons[wallet.name] || `data:image/svg+xml,${encodeURIComponent(`
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" rx="8" fill="${getWalletColor(wallet.name)}"/>
        <text x="16" y="20" text-anchor="middle" fill="white" font-size="12" font-weight="bold" font-family="system-ui">
          ${wallet.name.substring(0, 2).toUpperCase()}
        </text>
      </svg>
    `)}`
  }

  const getWalletColor = (name: string) => {
    const colors: Record<string, string> = {
      'Phantom': '#AB9FF2',
      'Solflare': '#F4B942',
      'Backpack': '#8B5CF6',
      'Coinbase': '#0052FF',
      'Trust': '#328AF1',
      'Ledger': '#000000',
      'Keystone': '#F7931A',
      'Glow': '#FF6B6B',
      'MathWallet': '#333333'
    }
    return colors[name] || '#4A5568'
  }

  const getWalletInstallUrl = (name: string) => {
    const urls: Record<string, string> = {
      'Phantom': 'https://phantom.app/',
      'Solflare': 'https://solflare.com/',
      'Backpack': 'https://backpack.app/',
      'Coinbase': 'https://wallet.coinbase.com/',
      'Trust': 'https://trustwallet.com/',
      'Ledger': 'https://www.ledger.com/',
      'Keystone': 'https://keystone.io/',
      'Glow': 'https://glow.app/',
      'MathWallet': 'https://mathwallet.org/'
    }
    return urls[name] || 'https://phantom.app/'
  }

  const phantomWallet = getPhantomWallet()
const otherWallets = getOtherWallets()

  const handleWalletConnect = async (walletItem: any) => {
    // Prevent multiple connection attempts
    if (connecting) {
      return
    }

    // Check if wallet and adapter exist
    if (!walletItem || !walletItem.wallet || !walletItem.wallet.adapter) {
      console.error('Invalid wallet object:', walletItem)
      return
    }

    const adapterName = walletItem.wallet.adapter.name
    setSelectedWallet(adapterName)

    try {
      console.log('Connecting to wallet:', adapterName)

      // Check if wallet is already selected
      if (wallet?.adapter.name !== adapterName) {
        // Select the wallet first
        select(adapterName as WalletName)

        // Wait for selection to register
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      // Ensure wallet is selected before connecting
      if (!wallet) {
        throw new Error('Wallet not selected after selection attempt')
      }

      // Now connect to the selected wallet
      await connect()

      console.log('Wallet connected successfully')

      // Close modal after successful connection
      setTimeout(() => {
        onClose()
      }, 300)
    } catch (error) {
      console.error('Failed to connect wallet:', error)

      // Provide helpful error message to user
      if (error instanceof Error) {
        if (error.message.includes('not installed')) {
          alert(`${adapterName} wallet is not installed. Please install it first and try again.`)
        } else if (error.message.includes('User rejected') || error.message.includes('User rejected the request')) {
          // User cancelled - no action needed
          console.log('User cancelled wallet connection')
        } else if (error.name === 'WalletNotSelectedError' || error.message.includes('WalletNotSelectedError')) {
          console.log('Wallet not selected, retrying connection...')
          // Retry connection once after a brief delay
          setTimeout(async () => {
            try {
              if (wallet) {
                await connect()
                console.log('Retry connection successful')
                setTimeout(() => onClose(), 300)
              }
            } catch (retryError) {
              console.error('Retry connection failed:', retryError)
            }
          }, 1000)
        } else {
          alert(`Failed to connect to ${adapterName}: ${error.message}`)
        }
      } else {
        alert(`Failed to connect to ${adapterName}. Please try again.`)
      }

      setSelectedWallet(null)
    }
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
                {wallet?.adapter.name}
              </p>
            )}
          </div>
        </div>
        {/* Connected Wallet Display */}
        {connected && (
          <div style={{ marginBottom: '1.5rem' }}>
            <ConnectedWallet
              publicKey={publicKey}
              walletName={wallet?.adapter.name || 'Unknown'}
              onDisconnect={handleDisconnect}
              onCopyAddress={copyAddress}
            />
          </div>
        )}

        {/* Phantom Wallet - only show when not connected */}
        {!connected && phantomWallet && (
          <div style={{ marginBottom: '1rem' }}>
            <button
              onClick={() => handleWalletConnect(phantomWallet)}
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
                  onError={(e) => {
                    e.currentTarget.src = `data:image/svg+xml,${encodeURIComponent(`
                      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect width="36" height="36" rx="8" fill="#AB9FF2"/>
                        <path d="M9 13.5h18M9 18h18M9 22.5h13.5" stroke="white" stroke-width="2.25" stroke-linecap="round"/>
                      </svg>
                    `)}`
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
                {selectedWallet === 'Phantom' && connecting ? (
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

        {/* Other Wallets Dropdown - only show when not connected */}
        {!connected && otherWallets.length > 0 && (
          <div style={{ marginBottom: '1.5rem' }}>
            <button
              onClick={() => setShowOtherWallets(!showOtherWallets)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                padding: '1rem',
                borderRadius: '0.75rem',
                background: `
                  linear-gradient(135deg,
                    ${theme.colors.surface} 0%,
                    ${theme.colors.surfaceHover} 50%,
                    ${theme.colors.surface} 100%
                  ),
                  radial-gradient(circle at 30% 30%,
                    ${theme.colors.primary}05 0%,
                    transparent 60%
                  )
                `,
                border: `1px solid ${theme.colors.border}`,
                backdropFilter: 'blur(10px)',
                fontFamily: 'var(--font-helvetica)',
                fontWeight: 500,
                fontSize: '0.875rem',
                color: theme.colors.textSecondary,
                cursor: 'pointer',
                transition: `all ${theme.animations.duration} ${theme.animations.easing}`
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = `
                  linear-gradient(135deg,
                    ${theme.colors.surfaceHover} 0%,
                    ${theme.colors.surfaceHover}cc 50%,
                    ${theme.colors.surfaceHover} 100%
                  ),
                  radial-gradient(circle at 30% 30%,
                    ${theme.colors.primary}08 0%,
                    transparent 60%
                  )
                `
                e.currentTarget.style.borderColor = `${theme.colors.primary}30`
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = `
                  linear-gradient(135deg,
                    ${theme.colors.surface} 0%,
                    ${theme.colors.surfaceHover} 50%,
                    ${theme.colors.surface} 100%
                  ),
                  radial-gradient(circle at 30% 30%,
                    ${theme.colors.primary}05 0%,
                    transparent 60%
                  )
                `
                e.currentTarget.style.borderColor = theme.colors.border
              }}
            >
              <span>Other Wallets ({otherWallets.length})</span>
              <ChevronDown
                size={16}
                style={{
                  color: theme.colors.textMuted,
                  transition: `transform ${theme.animations.duration} ${theme.animations.easing}`,
                  transform: showOtherWallets ? 'rotate(180deg)' : 'rotate(0deg)'
                }}
              />
            </button>

            {/* Other Wallets List */}
            {showOtherWallets && (
              <div style={{
                marginTop: '0.75rem',
                maxHeight: '16rem',
                overflowY: 'auto',
                borderRadius: '0.75rem',
                border: `1px solid ${theme.colors.border}`,
                background: theme.name === 'light' ?
                  `linear-gradient(135deg, ${theme.colors.surface}f0 0%, ${theme.colors.surface}e0 100%)` :
                  `${theme.colors.surface}ee`,
                backdropFilter: 'blur(10px)'
              }}>
                {otherWallets.map((walletItem) => (
                  <button
                    key={`other-${walletItem.adapterName}`}
                    onClick={() => handleWalletConnect(walletItem)}
                    disabled={connecting || !walletItem.isInstalled}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.875rem',
                      padding: '0.875rem 1rem',
                      borderBottom: `1px solid ${theme.colors.border}30`,
                      background: 'transparent',
                      border: 'none',
                      cursor: connecting || !walletItem.isInstalled ? 'not-allowed' : 'pointer',
                      opacity: connecting || !walletItem.isInstalled ? 0.6 : 1,
                      transition: `all ${theme.animations.duration} ${theme.animations.easing}`,
                      fontFamily: 'var(--font-helvetica)'
                    }}
                    onMouseEnter={(e) => {
                      if (!connecting && walletItem.isInstalled) {
                        e.currentTarget.style.background = `${theme.colors.primary}08`
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    {/* Wallet Icon */}
                    <div style={{
                      width: '2.25rem',
                      height: '2.25rem',
                      borderRadius: '0.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: `${walletItem.color}15`,
                      border: `1px solid ${walletItem.color}25`,
                      overflow: 'hidden'
                    }}>
                      <img
                        src={walletItem.icon}
                        alt={walletItem.name}
                        style={{
                          width: '1.375rem',
                          height: '1.375rem',
                          filter: 'drop-shadow(0 1px 3px rgba(0, 0, 0, 0.2))'
                        }}
                        onError={(e) => {
                          e.currentTarget.src = `data:image/svg+xml,${encodeURIComponent(`
                            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <rect width="22" height="22" rx="4" fill="${walletItem.color}"/>
                              <text x="11" y="14" text-anchor="middle" fill="white" font-size="8" font-weight="bold" font-family="system-ui">
                                ${walletItem.name.substring(0, 2).toUpperCase()}
                              </text>
                            </svg>
                          `)}`
                        }}
                      />
                    </div>

                    {/* Wallet Info */}
                    <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                      <div style={{
                        fontWeight: 600,
                        fontSize: '0.875rem',
                        color: theme.colors.textPrimary,
                        fontFamily: 'var(--font-helvetica)',
                        marginBottom: '0.125rem'
                      }}>
                        {walletItem.name}
                      </div>
                      <div style={{
                        fontSize: '0.75rem',
                        color: theme.colors.textMuted,
                        fontFamily: 'var(--font-helvetica)'
                      }}>
                        {walletItem.description}
                      </div>
                    </div>

                    {/* Status */}
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      {selectedWallet === walletItem.adapterName && connecting ? (
                        <div style={{
                          width: '1rem',
                          height: '1rem',
                          borderRadius: '50%',
                          border: `2px solid ${theme.colors.primary}30`,
                          borderTopColor: theme.colors.primary,
                          animation: 'spin 1s linear infinite'
                        }} />
                      ) : walletItem.isInstalled ? (
                        <div style={{
                          width: '1rem',
                          height: '1rem',
                          borderRadius: '50%',
                          background: theme.colors.success,
                          border: `1px solid ${theme.colors.success}40`
                        }} />
                      ) : (
                        <span style={{
                          padding: '0.125rem 0.375rem',
                          fontSize: '0.625rem',
                          fontWeight: 500,
                          borderRadius: '0.25rem',
                          border: `1px solid ${theme.colors.warning}30`,
                          background: `${theme.colors.warning}10`,
                          color: theme.colors.warning,
                          fontFamily: 'var(--font-helvetica)'
                        }}>
                          Install
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
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