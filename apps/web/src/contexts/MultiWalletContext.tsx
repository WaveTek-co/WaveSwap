'use client'

import React, { createContext, useContext, ReactNode, useState, useCallback, useMemo, useEffect } from 'react'
import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js'
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom'
import { BackpackWalletAdapter } from '@solana/wallet-adapter-backpack'
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare'
import { WalletReadyState } from '@solana/wallet-adapter-base'
import { config } from '@/lib/config'

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
  const [activeAdapter, setActiveAdapter] = useState<PhantomWalletAdapter | BackpackWalletAdapter | SolflareWalletAdapter | null>(null)

  const connection = useMemo(() => {
    return new Connection(config.rpc.url, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000,
    })
  }, [])

  // Initialize wallet adapters
  const phantomAdapter = useMemo(() => new PhantomWalletAdapter(), [])
  const backpackAdapter = useMemo(() => new BackpackWalletAdapter(), [])
  const solflareAdapter = useMemo(() => new SolflareWalletAdapter(), [])

  const availableWallets = useMemo(() => {
    const wallets: string[] = []
    if (phantomAdapter.readyState === WalletReadyState.Installed || phantomAdapter.readyState === WalletReadyState.Loadable) {
      wallets.push('phantom')
    }
    if (backpackAdapter.readyState === WalletReadyState.Installed || backpackAdapter.readyState === WalletReadyState.Loadable) {
      wallets.push('backpack')
    }
    if (solflareAdapter.readyState === WalletReadyState.Installed || solflareAdapter.readyState === WalletReadyState.Loadable) {
      wallets.push('solflare')
    }
    // Always show these as options
    if (!wallets.includes('phantom')) wallets.push('phantom')
    if (!wallets.includes('backpack')) wallets.push('backpack')
    if (!wallets.includes('solflare')) wallets.push('solflare')
    return wallets
  }, [phantomAdapter.readyState, backpackAdapter.readyState, solflareAdapter.readyState])

  // Listen for adapter connection changes
  useEffect(() => {
    const handleConnect = () => {
      if (activeAdapter?.publicKey) {
        setPublicKey(activeAdapter.publicKey)
        setConnected(true)
        console.log('Wallet connected:', activeAdapter.publicKey.toString())
      }
    }

    const handleDisconnect = () => {
      setPublicKey(null)
      setConnected(false)
      setWalletName(null)
      setActiveAdapter(null)
      console.log('Wallet disconnected')
    }

    const handleError = (err: Error) => {
      console.error('Wallet error:', err)
      setError(err.message)
    }

    if (activeAdapter) {
      activeAdapter.on('connect', handleConnect)
      activeAdapter.on('disconnect', handleDisconnect)
      activeAdapter.on('error', handleError)

      return () => {
        activeAdapter.off('connect', handleConnect)
        activeAdapter.off('disconnect', handleDisconnect)
        activeAdapter.off('error', handleError)
      }
    }
  }, [activeAdapter])

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
      let adapter: PhantomWalletAdapter | BackpackWalletAdapter | SolflareWalletAdapter

      switch (name.toLowerCase()) {
        case 'phantom':
        case 'phantom-injected':
          adapter = phantomAdapter
          break
        case 'backpack':
          adapter = backpackAdapter
          break
        case 'solflare':
          adapter = solflareAdapter
          break
        default:
          throw new Error(`Unsupported wallet: ${name}`)
      }

      if (adapter.readyState === WalletReadyState.NotDetected) {
        throw new Error(`${name} wallet not installed. Please install it first.`)
      }

      console.log(`Connecting to ${name}...`, adapter.readyState)
      await adapter.connect()

      if (adapter.publicKey) {
        setActiveAdapter(adapter)
        setWalletName(name.toLowerCase().replace('-injected', ''))
        setPublicKey(adapter.publicKey)
        setConnected(true)
        console.log(`Connected to ${name}:`, adapter.publicKey.toString())
      } else {
        throw new Error('No public key after connection')
      }

    } catch (err: any) {
      console.error('Connection error:', err)
      const msg = err?.message || 'Connection failed'
      setError(msg)
      throw new Error(msg)
    } finally {
      setConnecting(false)
    }
  }, [phantomAdapter, backpackAdapter, solflareAdapter])

  const handleDisconnect = useCallback(async () => {
    setDisconnecting(true)
    setError(null)

    try {
      if (activeAdapter) {
        await activeAdapter.disconnect()
      }
      setWalletName(null)
      setPublicKey(null)
      setConnected(false)
      setActiveAdapter(null)
      console.log('Wallet disconnected')
    } catch (err: any) {
      const msg = err?.message || 'Disconnect failed'
      setError(msg)
      console.error('Disconnect error:', msg)
    } finally {
      setDisconnecting(false)
    }
  }, [activeAdapter])

  const signMessage = useCallback(async (message: Uint8Array): Promise<Uint8Array> => {
    if (!activeAdapter?.signMessage) {
      throw new Error('Wallet does not support message signing')
    }
    return activeAdapter.signMessage(message)
  }, [activeAdapter])

  const signTransaction = useCallback(async (
    transaction: Transaction | VersionedTransaction
  ): Promise<Transaction | VersionedTransaction> => {
    if (!activeAdapter?.signTransaction) {
      throw new Error('Wallet does not support transaction signing')
    }
    return activeAdapter.signTransaction(transaction)
  }, [activeAdapter])

  const signAllTransactions = useCallback(async (
    transactions: (Transaction | VersionedTransaction)[]
  ): Promise<(Transaction | VersionedTransaction)[]> => {
    if (!activeAdapter?.signAllTransactions) {
      throw new Error('Wallet does not support batch signing')
    }
    return activeAdapter.signAllTransactions(transactions)
  }, [activeAdapter])

  const contextValue: MultiWalletContextType = {
    connection,
    publicKey,
    connected,
    connecting,
    disconnecting,
    wallet: activeAdapter,
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
