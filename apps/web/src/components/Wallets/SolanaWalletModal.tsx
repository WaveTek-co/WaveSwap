'use client'

import { useState } from 'react'
import { Wallet, AlertCircle } from 'lucide-react'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletName } from '@solana/wallet-adapter-base'
import { useThemeConfig, createButtonStyles, createGlassStyles } from '@/lib/theme'
import { WalletList } from './WalletList'
import { WalletSearch } from './WalletSearch'
import { ConnectedWallet } from './ConnectedWallet'
import { Modal } from '@/components/ui/Modal'

interface SolanaWalletModalProps {
  isOpen: boolean
  onClose: () => void
}

export function SolanaWalletModal({ isOpen, onClose }: SolanaWalletModalProps) {
  const { select, wallets, connect, connecting, connected, publicKey, disconnect, wallet } = useWallet()
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
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
  const getAvailableWallets = () => {
    // Filter only actual Solana wallet adapters to avoid duplicates and non-Solana wallets
    const adapterWallets = wallets
      .filter((wallet) => {
        // Only include wallets that have proper adapter structure and are known Solana wallets
        return wallet?.adapter?.name &&
               typeof wallet.adapter.name === 'string' &&
               ['Phantom', 'Solflare', 'Backpack', 'Coinbase', 'Trust', 'Ledger', 'Keystone', 'Glow', 'MathWallet'].includes(wallet.adapter.name)
      })
      .map((wallet) => ({
        adapterName: wallet.adapter.name,
        name: wallet.adapter.name,
        description: getWalletDescription(wallet.adapter.name),
        icon: getWalletIcon(wallet),
        color: getWalletColor(wallet.adapter.name),
        installUrl: getWalletInstallUrl(wallet.adapter.name),
        isInstalled: wallet.readyState === 'Installed',
        isRecommended: wallet.adapter.name === 'Phantom',
        wallet: wallet,
        category: 'installed'
      }))

    return adapterWallets
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

  const ALL_WALLETS = getAvailableWallets()

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

      // Select the wallet first
      select(adapterName as WalletName)

      // Wait a bit for selection to complete and check if wallet is ready
      await new Promise(resolve => setTimeout(resolve, 500))

      // Check if the selected wallet matches what we're trying to connect to
      const currentWallet = wallet
      if (currentWallet?.adapter.name !== adapterName) {
        console.error('Wallet selection failed. Expected:', adapterName, 'Got:', currentWallet?.adapter.name)
        setSelectedWallet(null)
        return
      }

      // Then connect
      await connect()

      console.log('Wallet connected successfully')

      // Close modal after successful connection
      setTimeout(() => {
        onClose()
      }, 300)
    } catch (error) {
      console.error('Failed to connect wallet:', error)
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

        {/* Search Bar - only show when not connected */}
        {!connected && (
          <div style={{ marginBottom: '1.5rem' }}>
            <WalletSearch
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              placeholder="Search wallets..."
            />
          </div>
        )}

        {/* Wallet List - only show when not connected */}
        {!connected && (
          <>
            <WalletList
              wallets={ALL_WALLETS}
              selectedWallet={selectedWallet}
              connecting={connecting}
              onWalletConnect={handleWalletConnect}
              searchQuery={searchQuery}
            />

            {/* Footer - install links */}
            <div
              style={{
                marginTop: '1.5rem',
                paddingTop: '1rem',
                borderTop: `1px solid ${theme.colors.border}`,
                fontFamily: 'var(--font-helvetica)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <AlertCircle size={12} style={{ color: theme.colors.primary }} />
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: theme.colors.textSecondary
                  }}
                >
                  New to Solana? We recommend Phantom for the best experience
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: theme.colors.textMuted
                  }}
                >
                  Fast • Easy to use
                </span>
                <a
                  href="https://phantom.app/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    padding: '0.25rem 0.75rem',
                    borderRadius: '0.5rem',
                    transition: `all ${theme.animations.duration} ${theme.animations.easing}`,
                    background: `${theme.colors.primary}10`,
                    color: theme.colors.primary,
                    border: `1px solid ${theme.colors.primary}20`,
                    textDecoration: 'none',
                    fontFamily: 'var(--font-helvetica)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.05)'
                    e.currentTarget.style.background = `${theme.colors.primary}15`
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)'
                    e.currentTarget.style.background = `${theme.colors.primary}10`
                  }}
                >
                  Get Phantom →
                </a>
              </div>
            </div>
          </>
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