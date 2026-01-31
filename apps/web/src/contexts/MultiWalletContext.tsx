'use client'

import React, { createContext, useContext, ReactNode, useState, useCallback, useMemo, useEffect } from 'react'
import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js'
import { config } from '@/lib/config'

declare global {
  interface Window {
    phantom?: {
      solana?: {
        isPhantom?: boolean
        connect(): Promise<{ publicKey: PublicKey }>
        disconnect(): Promise<void>
        signTransaction(transaction: Transaction | VersionedTransaction): Promise<Transaction | VersionedTransaction>
        signAllTransactions(transactions: (Transaction | VersionedTransaction)[]): Promise<(Transaction | VersionedTransaction)[]>
        signMessage(message: Uint8Array, encoding: string): Promise<{ signature: Uint8Array }>
        publicKey?: PublicKey
      }
    }
    backpack?: {
      connect(): Promise<{ publicKey: PublicKey }>
      disconnect(): Promise<void>
      signTransaction(transaction: Transaction | VersionedTransaction): Promise<Transaction | VersionedTransaction>
      signAllTransactions(transactions: (Transaction | VersionedTransaction)[]): Promise<(Transaction | VersionedTransaction)[]>
      signMessage?(message: Uint8Array): Promise<{ signature: Uint8Array }>
      publicKey?: PublicKey
    }
    solflare?: {
      connect(): Promise<{ publicKey: PublicKey }>
      disconnect(): Promise<void>
      signTransaction(transaction: Transaction | VersionedTransaction): Promise<Transaction | VersionedTransaction>
      signAllTransactions(transactions: (Transaction | VersionedTransaction)[]): Promise<(Transaction | VersionedTransaction)[]>
      signMessage?(message: Uint8Array): Promise<{ signature: Uint8Array }>
      publicKey?: PublicKey
    }
  }
}

interface MultiWalletContextType {
  connection: Connection
  publicKey: PublicKey | null
  connected: boolean
  connecting: boolean
  disconnecting: boolean
  wallet: any | null
  walletName: string | null
  availableWallets: string[]
  error: string | null
  connect: (walletName: string) => Promise<void>
  disconnect: () => Promise<void>
  signMessage: (message: Uint8Array) => Promise<Uint8Array>
  signTransaction: (transaction: Transaction | VersionedTransaction) => Promise<Transaction | VersionedTransaction>
  signAllTransactions: (transactions: (Transaction | VersionedTransaction)[]) => Promise<(Transaction | VersionedTransaction)[]>
  getBalance: () => Promise<number>
  clearError: () => void
  checkConnectionHealth: () => Promise<boolean>
  getRpcEndpoint: () => string
}

const MultiWalletContext = createContext<MultiWalletContextType | undefined>(undefined)

export function MultiWalletProvider({ children }: { children: ReactNode }) {
  const [error, setError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [walletName, setWalletName] = useState<string | null>(null)
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null)
  const [connected, setConnected] = useState(false)

  const connection = useMemo(() => {
    return new Connection(config.rpc.url, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000,
    })
  }, [])

  const availableWallets = useMemo(() => ['phantom', 'backpack', 'solflare'], [])

  const getWalletProvider = useCallback(() => {
    if (typeof window === 'undefined') return null

    switch (walletName) {
      case 'phantom':
        return window.phantom?.solana
      case 'backpack':
        return window.backpack
      case 'solflare':
        return window.solflare
      default:
        return null
    }
  }, [walletName])

  const clearError = useCallback(() => setError(null), [])

  const checkConnectionHealth = useCallback(async (): Promise<boolean> => {
    try {
      await connection.getSlot()
      return true
    } catch {
      return false
    }
  }, [connection])

  const getRpcEndpoint = useCallback(() => config.rpc.url, [])

  const getBalance = useCallback(async (): Promise<number> => {
    if (!publicKey) throw new Error('Wallet not connected')
    return connection.getBalance(publicKey)
  }, [publicKey, connection])

  const handleConnect = useCallback(async (name: string) => {
    setConnecting(true)
    setError(null)

    try {
      if (typeof window === 'undefined') {
        throw new Error('Window not available')
      }

      let provider: any = null
      let response: any = null

      switch (name.toLowerCase()) {
        case 'phantom':
        case 'phantom-injected':
          provider = window.phantom?.solana
          if (!provider?.isPhantom) {
            throw new Error('Phantom wallet not installed. Please install from phantom.app')
          }
          response = await provider.connect()
          break

        case 'backpack':
          provider = window.backpack
          if (!provider) {
            throw new Error('Backpack wallet not installed. Please install from backpack.app')
          }
          response = await provider.connect()
          break

        case 'solflare':
          provider = window.solflare
          if (!provider) {
            throw new Error('Solflare wallet not installed. Please install from solflare.com')
          }
          response = await provider.connect()
          break

        default:
          throw new Error(`Unsupported wallet: ${name}`)
      }

      const pubkey = response?.publicKey || provider?.publicKey
      if (!pubkey) {
        throw new Error('No public key returned from wallet')
      }

      setWalletName(name.toLowerCase().replace('-injected', ''))
      setPublicKey(new PublicKey(pubkey.toString()))
      setConnected(true)
      console.log(`Connected to ${name}: ${pubkey.toString()}`)

    } catch (err: any) {
      const msg = err?.message || 'Connection failed'
      setError(msg)
      console.error('Wallet connection error:', msg)
      throw new Error(msg)
    } finally {
      setConnecting(false)
    }
  }, [])

  const handleDisconnect = useCallback(async () => {
    setDisconnecting(true)
    setError(null)

    try {
      const provider = getWalletProvider()
      if (provider?.disconnect) {
        await provider.disconnect()
      }

      setWalletName(null)
      setPublicKey(null)
      setConnected(false)
      console.log('Wallet disconnected')

    } catch (err: any) {
      const msg = err?.message || 'Disconnect failed'
      setError(msg)
      console.error('Wallet disconnect error:', msg)
    } finally {
      setDisconnecting(false)
    }
  }, [getWalletProvider])

  const signMessage = useCallback(async (message: Uint8Array): Promise<Uint8Array> => {
    const provider = getWalletProvider()
    if (!provider?.signMessage) {
      throw new Error('Wallet does not support message signing')
    }
    const { signature } = await provider.signMessage(message, 'utf8')
    return signature
  }, [getWalletProvider])

  const signTransaction = useCallback(async (
    transaction: Transaction | VersionedTransaction
  ): Promise<Transaction | VersionedTransaction> => {
    const provider = getWalletProvider()
    if (!provider?.signTransaction) {
      throw new Error('Wallet does not support transaction signing')
    }
    return provider.signTransaction(transaction)
  }, [getWalletProvider])

  const signAllTransactions = useCallback(async (
    transactions: (Transaction | VersionedTransaction)[]
  ): Promise<(Transaction | VersionedTransaction)[]> => {
    const provider = getWalletProvider()
    if (!provider?.signAllTransactions) {
      throw new Error('Wallet does not support batch signing')
    }
    return provider.signAllTransactions(transactions)
  }, [getWalletProvider])

  const contextValue: MultiWalletContextType = {
    connection,
    publicKey,
    connected,
    connecting,
    disconnecting,
    wallet: getWalletProvider(),
    walletName,
    availableWallets,
    error,
    connect: handleConnect,
    disconnect: handleDisconnect,
    signMessage,
    signTransaction,
    signAllTransactions,
    getBalance,
    clearError,
    checkConnectionHealth,
    getRpcEndpoint,
  }

  return (
    <MultiWalletContext.Provider value={contextValue}>
      {children}
    </MultiWalletContext.Provider>
  )
}

export function useMultiWallet() {
  const context = useContext(MultiWalletContext)
  if (context === undefined) {
    throw new Error('useMultiWallet must be used within a MultiWalletProvider')
  }
  return context
}

export default MultiWalletProvider
