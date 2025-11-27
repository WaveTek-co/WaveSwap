'use client'

import React, { useState, useEffect, ReactNode } from 'react'
import { useThemeConfig, createGlassStyles } from '@/lib/theme'

// Define StarkNet wallet types
export interface StarknetAccount {
  address: string
  chainId: string
  connected: boolean
}

// Common StarkNet wallet apps
interface StarknetWallet {
  id: string
  name: string
  url: string
  icon: string
  isMobile?: boolean
}

const STARKNET_WALLETS: StarknetWallet[] = [
  {
    id: 'argentX',
    name: 'Argent X',
    url: 'https://argent.xyz/download',
    icon: '/static/icons/wallets/argentx.svg'
  },
  {
    id: 'braavos',
    name: 'Braavos',
    url: 'https://braavos.app/download',
    icon: '/static/icons/wallets/braavos.svg'
  },
  {
    id: 'argentMobile',
    name: 'Argent Mobile',
    url: 'https://argent.link/app',
    icon: '/static/icons/wallets/argent.svg',
    isMobile: true
  }
]

interface StarknetWalletContextType {
  account: StarknetAccount | null
  isConnected: boolean
  isConnecting: boolean
  connect: (walletId: string) => Promise<void>
  disconnect: () => void
  switchChain: (chainId: string) => Promise<void>
  provider: any | null
}

const StarknetWalletContext = React.createContext<StarknetWalletContextType | null>(null)

export function useStarknetWallet() {
  const context = React.useContext(StarknetWalletContext)
  if (!context) {
    throw new Error('useStarknetWallet must be used within StarknetWalletProvider')
  }
  return context
}

interface StarknetWalletProviderProps {
  children: ReactNode
}

export function StarknetWalletProvider({ children }: StarknetWalletProviderProps) {
  const [account, setAccount] = useState<StarknetAccount | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [provider, setProvider] = useState<any>(null)
  const theme = useThemeConfig()

  useEffect(() => {
    // Auto-connect if wallet is already connected
    checkExistingConnection()
  }, [])

  const checkExistingConnection = async () => {
    try {
      if (typeof window === 'undefined') return

      // Check for common wallet extensions
      const wallets = [
        (window as any).starknet_argentX,
        (window as any).starknet_braavos,
        (window as any).starknet
      ].filter(Boolean)

      for (const wallet of wallets) {
        if (wallet?.isConnected && wallet?.selectedAddress) {
          const chainId = await wallet.provider.getChainId()
          setAccount({
            address: wallet.selectedAddress,
            chainId: chainId,
            connected: true
          })
          setProvider(wallet.provider)
          break
        }
      }
    } catch (error) {
      console.error('Failed to check existing connection:', error)
    }
  }

  const connect = async (walletId: string) => {
    if (typeof window === 'undefined') return

    setIsConnecting(true)
    try {
      let wallet: any = null

      // Get the wallet object based on walletId
      switch (walletId) {
        case 'argentX':
          wallet = (window as any).starknet_argentX
          break
        case 'braavos':
          wallet = (window as any).starknet_braavos
          break
        default:
          // Try starknet global object as fallback
          wallet = (window as any).starknet
      }

      if (!wallet) {
        throw new Error(`${walletId} wallet not found. Please install the wallet extension.`)
      }

      // Check if wallet is installed
      if (!wallet.isPreauthorized) {
        throw new Error(`${walletId} wallet is not authorized. Please install and authorize the wallet.`)
      }

      // Request connection
      await wallet.enable()

      // Get account and provider
      const address = wallet.selectedAddress || wallet.account?.address
      const chainId = await wallet.provider.getChainId()

      if (!address) {
        throw new Error('No account found. Please create or import an account in your wallet.')
      }

      setAccount({
        address,
        chainId,
        connected: true
      })

      setProvider(wallet.provider)

    } catch (error: any) {
      console.error('Failed to connect StarkNet wallet:', error)

      // Handle different error types
      if (error.message.includes('not found')) {
        throw new Error('Wallet not found. Please install Argent X or Braavos wallet.')
      } else if (error.message.includes('User rejected')) {
        throw new Error('Connection rejected by user.')
      } else {
        throw new Error('Failed to connect wallet. Please try again.')
      }
    } finally {
      setIsConnecting(false)
    }
  }

  const disconnect = async () => {
    try {
      // Most StarkNet wallets don't have a programmatic disconnect
      // Just clear the state
      setAccount(null)
      setProvider(null)
    } catch (error) {
      console.error('Failed to disconnect:', error)
    }
  }

  const switchChain = async (chainId: string) => {
    if (!account || !provider) return

    try {
      // Note: Chain switching might need to be implemented based on specific wallet
      // For now, just update the account's chainId
      setAccount(prev => prev ? { ...prev, chainId } : null)
    } catch (error) {
      console.error('Failed to switch chain:', error)
      throw new Error('Failed to switch chain. Please try switching in your wallet.')
    }
  }

  const contextValue: StarknetWalletContextType = {
    account,
    isConnected: !!account,
    isConnecting,
    connect,
    disconnect,
    switchChain,
    provider
  }

  return (
    <StarknetWalletContext.Provider value={contextValue}>
      {children}
    </StarknetWalletContext.Provider>
  )
}

// Modal for selecting and connecting StarkNet wallets
interface StarknetWalletModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function StarknetWalletModal({ isOpen, onClose, onSuccess }: StarknetWalletModalProps) {
  const { connect, isConnecting } = useStarknetWallet()
  const theme = useThemeConfig()

  if (!isOpen) return null

  const handleWalletSelect = async (walletId: string) => {
    try {
      await connect(walletId)
      onSuccess()
      onClose()
    } catch (error: any) {
      console.error('Wallet connection failed:', error)
      // You might want to show an error toast here
    }
  }

  const handleDownloadWallet = (url: string) => {
    window.open(url, '_blank')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
        onClick={onClose}
      />

      {/* Modal Content */}
      <div
        className="relative w-full max-w-md rounded-2xl p-6 shadow-2xl"
        style={{
          ...createGlassStyles(theme),
          border: `1px solid ${theme.colors.border}`,
          maxWidth: '420px'
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold" style={{ color: theme.colors.textPrimary }}>
              Connect StarkNet Wallet
            </h2>
            <p className="text-sm mt-1" style={{ color: theme.colors.textSecondary }}>
              Select your wallet provider
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <svg className="w-5 h-5" style={{ color: theme.colors.textMuted }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Wallet Options */}
        <div className="space-y-3">
          {STARKNET_WALLETS.map((wallet) => (
            <button
              key={wallet.id}
              onClick={() => handleWalletSelect(wallet.id)}
              disabled={isConnecting}
              className="w-full flex items-center gap-4 p-4 rounded-xl transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                ...createGlassStyles(theme),
                borderColor: theme.colors.border,
                borderWidth: '1px',
                borderStyle: 'solid'
              }}
            >
              {/* Wallet Icon */}
              <div className="w-12 h-12 rounded-lg bg-white/10 flex items-center justify-center">
                <img
                  src={wallet.icon}
                  alt={wallet.name}
                  className="w-8 h-8"
                  onError={(e) => {
                    e.currentTarget.src = '/icons/default-token.svg'
                  }}
                />
              </div>

              {/* Wallet Info */}
              <div className="flex-1 text-left">
                <h3 className="font-semibold" style={{ color: theme.colors.textPrimary }}>
                  {wallet.name}
                </h3>
                <p className="text-sm" style={{ color: theme.colors.textMuted }}>
                  {wallet.isMobile ? 'Mobile wallet' : 'Browser extension'}
                </p>
              </div>

              {/* Action */}
              {isConnecting ? (
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/30 border-t-white"></div>
              ) : (
                <svg className="w-5 h-5" style={{ color: theme.colors.primary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              )}
            </button>
          ))}
        </div>

        {/* Help Section */}
        <div className="mt-6 p-4 rounded-xl" style={{
          background: `${theme.colors.primary}10`,
          border: `1px solid ${theme.colors.primary}20`
        }}>
          <h4 className="font-medium mb-2" style={{ color: theme.colors.primary }}>
            Don't have a wallet?
          </h4>
          <p className="text-sm mb-3" style={{ color: theme.colors.textSecondary }}>
            Get a StarkNet wallet to bridge assets between Solana and StarkNet.
          </p>
          <div className="flex gap-3">
            {STARKNET_WALLETS.filter(w => !w.isMobile).map((wallet) => (
              <button
                key={wallet.id}
                onClick={() => handleDownloadWallet(wallet.url)}
                className="text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
                style={{
                  color: theme.colors.primary,
                  borderColor: theme.colors.primary,
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  backgroundColor: 'transparent'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = `${theme.colors.primary}10`
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                Get {wallet.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

