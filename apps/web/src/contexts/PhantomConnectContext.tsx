'use client'

import React, { createContext, useContext, ReactNode, useState, useCallback, useEffect } from 'react'
import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js'
import { config } from '@/lib/config'

interface PhantomConnectContextType {
  connection: Connection

  // Connection state
  isConnected: boolean
  isConnecting: boolean

  // Account information
  solanaAddress: PublicKey | null
  addresses: any[]

  // Connection methods
  connect: () => Promise<void>
  connectWithGoogle: () => Promise<void>
  connectWithApple: () => Promise<void>
  disconnect: () => Promise<void>

  // Transaction methods
  signMessage: (message: Uint8Array) => Promise<Uint8Array>
  signTransaction: (transaction: Transaction | VersionedTransaction) => Promise<Transaction | VersionedTransaction>

  // Utility methods
  getBalance: () => Promise<number>
  clearError: () => void

  // Error state
  error: string | null

  // Additional phantom data
  phantom: any
}

const PhantomConnectContext = createContext<PhantomConnectContextType | undefined>(undefined)

export function PhantomConnectProvider({ children }: { children: ReactNode }) {
  const [error, setError] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [solanaAddress, setSolanaAddress] = useState<PublicKey | null>(null)

  // Create Solana connection
  const connection = new Connection(config.rpc.url, {
    commitment: 'confirmed'
  })

  // Check for existing connection on mount
  useEffect(() => {
    const checkConnection = async () => {
      if (typeof window !== 'undefined' && window.phantom?.solana) {
        try {
          const phantom = window.phantom.solana
          const response = await phantom.connect({ onlyIfTrusted: true })
          if (response.publicKey) {
            setSolanaAddress(response.publicKey)
            setIsConnected(true)
          }
        } catch (err) {
          // No existing connection
        }
      }
    }
    checkConnection()
  }, [])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  const handleConnect = useCallback(async () => {
    try {
      setError(null)
      setIsConnecting(true)

      if (typeof window !== 'undefined' && window.phantom?.solana) {
        const phantom = window.phantom.solana
        const response = await phantom.connect()
        setSolanaAddress(response.publicKey)
        setIsConnected(true)
      } else {
        throw new Error('Phantom wallet not found. Please install Phantom extension.')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect wallet'
      setError(errorMessage)
      throw new Error(errorMessage)
    } finally {
      setIsConnecting(false)
    }
  }, [])

  const connectWithGoogle = useCallback(async () => {
    try {
      setError(null)
      setIsConnecting(true)

      // For now, fall back to regular Phantom connection
      // TODO: Implement Google OAuth via Phantom Connect SDK when available
      throw new Error('Google OAuth connection not yet implemented. Please use regular Phantom wallet connection.')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect with Google'
      setError(errorMessage)
      throw new Error(errorMessage)
    } finally {
      setIsConnecting(false)
    }
  }, [])

  const connectWithApple = useCallback(async () => {
    try {
      setError(null)
      setIsConnecting(true)

      // For now, fall back to regular Phantom connection
      // TODO: Implement Apple OAuth via Phantom Connect SDK when available
      throw new Error('Apple OAuth connection not yet implemented. Please use regular Phantom wallet connection.')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect with Apple'
      setError(errorMessage)
      throw new Error(errorMessage)
    } finally {
      setIsConnecting(false)
    }
  }, [])

  const handleDisconnect = useCallback(async () => {
    try {
      setError(null)
      if (typeof window !== 'undefined' && window.phantom?.solana) {
        const phantom = window.phantom.solana
        await phantom.disconnect()
      }
      setSolanaAddress(null)
      setIsConnected(false)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to disconnect'
      setError(errorMessage)
      throw new Error(errorMessage)
    }
  }, [])

  // Transaction signing methods
  const signMessage = useCallback(async (message: Uint8Array): Promise<Uint8Array> => {
    if (!isConnected || !solanaAddress) {
      throw new Error('Wallet not connected')
    }

    try {
      if (typeof window !== 'undefined' && window.phantom?.solana) {
        const phantom = window.phantom.solana
        const encodedMessage = new TextDecoder().decode(message)
        const { signature } = await phantom.signMessage(encodedMessage, 'utf8')
        return Uint8Array.from(Buffer.from(signature))
      }
      throw new Error('Phantom wallet not available')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to sign message'
      setError(errorMessage)
      throw new Error(errorMessage)
    }
  }, [isConnected, solanaAddress])

  const signTransaction = useCallback(async (transaction: Transaction | VersionedTransaction): Promise<Transaction | VersionedTransaction> => {
    if (!isConnected || !solanaAddress) {
      throw new Error('Wallet not connected')
    }

    try {
      if (typeof window !== 'undefined' && window.phantom?.solana) {
        const phantom = window.phantom.solana
        return await phantom.signTransaction(transaction)
      }
      throw new Error('Phantom wallet not available')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to sign transaction'
      setError(errorMessage)
      throw new Error(errorMessage)
    }
  }, [isConnected, solanaAddress])

  const getBalance = useCallback(async (): Promise<number> => {
    if (!isConnected || !solanaAddress) {
      throw new Error('Wallet not connected')
    }

    try {
      const balance = await connection.getBalance(solanaAddress)
      return balance
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get balance'
      setError(errorMessage)
      throw new Error(errorMessage)
    }
  }, [isConnected, solanaAddress, connection])

  const contextValue: PhantomConnectContextType = {
    connection,
    isConnected,
    isConnecting,
    solanaAddress,
    addresses: [],
    connect: handleConnect,
    connectWithGoogle,
    connectWithApple,
    disconnect: handleDisconnect,
    signMessage,
    signTransaction,
    getBalance,
    clearError,
    error,
    phantom: null
  }

  return (
    <PhantomConnectContext.Provider value={contextValue}>
      {children}
    </PhantomConnectContext.Provider>
  )
}

export function usePhantomConnect() {
  const context = useContext(PhantomConnectContext)
  if (context === undefined) {
    throw new Error('usePhantomConnect must be used within a PhantomConnectProvider')
  }
  return context
}

export default PhantomConnectProvider