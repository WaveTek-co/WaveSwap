'use client'

import { useState, useCallback, useEffect } from 'react'

// TypeScript definitions for Solana wallet
interface SolanaWindow {
  solana?: {
    isPhantom?: boolean
    isConnected?: () => boolean
    connect: (options?: any) => Promise<{ publicKey: { toString(): string; toBase58(): string } }>
    disconnect: () => Promise<void>
    publicKey?: { toString(): string; toBase58(): string }
  }
  phantom?: {
    solana?: {
      isPhantom?: boolean
      isConnected?: () => boolean
      connect: (options?: any) => Promise<{ publicKey: { toString(): string; toBase58(): string } }>
      disconnect: () => Promise<void>
      publicKey?: { toString(): string; toBase58(): string }
    }
    isPhantom?: boolean
    isConnected?: () => boolean
    connect: (options?: any) => Promise<{ publicKey: { toString(): string; toBase58(): string } }>
    disconnect: () => Promise<void>
    publicKey?: { toString(): string; toBase58(): string }
  }
  solflare?: {
    solana?: {
      isSolflare?: boolean
      isConnected?: () => boolean
      connect: (options?: any) => Promise<{ publicKey: { toString(): string; toBase58(): string } }>
      disconnect: () => Promise<void>
      publicKey?: { toString(): string; toBase58(): string }
    }
    isSolflare?: boolean
    isConnected?: () => boolean
    connect: (options?: any) => Promise<{ publicKey: { toString(): string; toBase58(): string } }>
    disconnect: () => Promise<void>
    publicKey?: { toString(): string; toBase58(): string }
    name?: string
  }
}

declare global {
  interface Window extends SolanaWindow {}
}

// Simple PublicKey class
export class PublicKey {
  constructor(private key: string) {}

  toString() {
    return this.key
  }
}

export function useSolanaWallet() {
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Auto-check connection on mount
  useEffect(() => {
    checkExistingConnection()
  }, [])

  const checkExistingConnection = () => {
    try {
      // Try phantom first
      if (window.phantom?.isConnected?.()) {
        // For now, we'll skip auto-reconnect to avoid errors
        console.log('Phantom is installed but not auto-connecting')
        return
      }

      // Then try generic solana
      if (window.solana?.isConnected?.()) {
        console.log('Solana adapter is installed but not auto-connecting')
        return
      }
    } catch (err) {
      console.log('No existing connection found')
    }
  }

  const connectWallet = useCallback(async (walletId: string) => {
    setIsConnecting(true)
    setError(null)

    try {
      let wallet: any = null

      // Enhanced wallet selection with better fallbacks
      switch (walletId) {
        case 'phantom':
          // Try different Phantom wallet structures
          wallet = window.phantom?.solana || window.phantom || window.solana
          break
        case 'solflare':
          // Try different Solflare wallet structures
          wallet = window.solflare?.solana || window.solflare
          break
        default:
          throw new Error('Wallet not supported')
      }

      console.log('Selected wallet:', walletId, wallet)

      if (!wallet) {
        throw new Error(`${walletId} wallet not found. Please install it first.`)
      }

      // Enhanced connection attempt
      let response: any
      try {
        // Try connecting with options first
        response = await wallet.connect({ onlyIfTrusted: false })
      } catch (connectError) {
        console.log('Direct connect failed, trying alternative:', connectError)
        // Fallback to simple connect
        response = await wallet.connect()
      }

      console.log('Connect response: <ENCRYPTED>')

      // Get public key from response or wallet object
      let key = response?.publicKey
      if (!key && wallet?.publicKey) {
        key = wallet.publicKey
      }

      if (!key) {
        throw new Error('Failed to get public key from wallet')
      }

      // Handle different key formats
      let keyString: string
      if (typeof key === 'string') {
        keyString = key
      } else if (typeof key.toString === 'function') {
        keyString = key.toString()
      } else if (typeof key.toBase58 === 'function') {
        keyString = key.toBase58()
      } else {
        throw new Error('Invalid public key format')
      }

      console.log('Wallet connected with key: <ENCRYPTED>')

      setPublicKey(new PublicKey(keyString))
    } catch (err: any) {
      console.error('Connection error:', err)

      // Better error messages
      if (err.message?.includes('User rejected')) {
        setError('Connection cancelled by user')
      } else if (err.message?.includes('not found')) {
        setError(`${walletId} wallet not found. Please install it first.`)
      } else {
        setError(err.message || 'Failed to connect wallet')
      }
      throw err
    } finally {
      setIsConnecting(false)
    }
  }, [])

  const disconnectWallet = useCallback(async () => {
    try {
      console.log('Attempting to disconnect wallet...')

      // Try all possible wallet objects for disconnection
      const wallets = [
        window.phantom?.solana,
        window.phantom,
        window.solana,
        window.solflare?.solana,
        window.solflare
      ].filter(Boolean)

      for (const wallet of wallets) {
        try {
          if (wallet?.isConnected?.()) {
            await wallet.disconnect?.()
            console.log('Disconnected from wallet:', wallet)
          }
        } catch (disconnectError) {
          console.log('Disconnect attempt failed for wallet:', wallet, disconnectError)
        }
      }

      setPublicKey(null)
      console.log('Wallet disconnected successfully')
    } catch (err: any) {
      console.error('Disconnect error:', err)
      setError(err.message || 'Failed to disconnect wallet')
      throw err
    }
  }, [])

  return {
    publicKey,
    isConnecting,
    error,
    connectWallet,
    disconnectWallet,
    isConnected: !!publicKey,
    clearError: () => setError(null)
  }
}

export default useSolanaWallet