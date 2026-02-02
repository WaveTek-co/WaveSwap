'use client'

import React, { createContext, useContext, ReactNode, useState, useCallback, useMemo, useEffect } from 'react'
import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js'
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

// Get wallet provider from window
function getPhantomProvider() {
  if (typeof window === 'undefined') return null
  return (window as any).phantom?.solana || (window as any).solana
}

function getBackpackProvider() {
  if (typeof window === 'undefined') return null
  return (window as any).backpack
}

function getSolflareProvider() {
  if (typeof window === 'undefined') return null
  return (window as any).solflare
}

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

  const getProvider = useCallback(() => {
    switch (walletName) {
      case 'phantom': return getPhantomProvider()
      case 'backpack': return getBackpackProvider()
      case 'solflare': return getSolflareProvider()
      default: return null
    }
  }, [walletName])

  // Check for existing connection on mount
  useEffect(() => {
    const checkExisting = () => {
      const phantom = getPhantomProvider()
      if (phantom?.publicKey) {
        console.log('Found existing Phantom connection')
        setWalletName('phantom')
        setPublicKey(new PublicKey(phantom.publicKey.toString()))
        setConnected(true)
      }
    }
    setTimeout(checkExisting, 500)
  }, [])

  const clearError = useCallback(() => setError(null), [])
  const checkConnectionHealth = useCallback(async () => {
    try { await connection.getSlot(); return true } catch { return false }
  }, [connection])
  const getRpcEndpoint = useCallback(() => config.rpc.url, [])
  const getBalance = useCallback(async () => {
    if (!publicKey) throw new Error('Not connected')
    return connection.getBalance(publicKey)
  }, [publicKey, connection])

  const handleConnect = useCallback(async (name: string) => {
    setConnecting(true)
    setError(null)

    try {
      let provider: any
      const walletType = name.toLowerCase().replace('-injected', '')

      switch (walletType) {
        case 'phantom':
          provider = getPhantomProvider()
          if (!provider) {
            window.open('https://phantom.app/', '_blank')
            throw new Error('Phantom not installed. Opening download page...')
          }
          break
        case 'backpack':
          provider = getBackpackProvider()
          if (!provider) {
            window.open('https://backpack.app/', '_blank')
            throw new Error('Backpack not installed. Opening download page...')
          }
          break
        case 'solflare':
          provider = getSolflareProvider()
          if (!provider) {
            window.open('https://solflare.com/', '_blank')
            throw new Error('Solflare not installed. Opening download page...')
          }
          break
        default:
          throw new Error(`Unknown wallet: ${name}`)
      }

      // Check if already connected
      if (provider.publicKey) {
        console.log('Already connected to', walletType)
        setWalletName(walletType)
        setPublicKey(new PublicKey(provider.publicKey.toString()))
        setConnected(true)
        return
      }

      console.log(`Requesting ${walletType} connection...`)

      // Direct connect call
      const resp = await provider.connect()
      const pubkey = resp?.publicKey || provider.publicKey

      if (!pubkey) {
        throw new Error('No public key returned')
      }

      console.log(`Connected to ${walletType}:`, pubkey.toString())
      setWalletName(walletType)
      setPublicKey(new PublicKey(pubkey.toString()))
      setConnected(true)

    } catch (err: any) {
      console.error('Connect error:', err)

      // Check if user rejected
      if (err?.code === 4001 || err?.message?.includes('rejected') || err?.message?.includes('denied')) {
        setError('Connection rejected by user')
      } else {
        setError(err?.message || 'Connection failed')
      }
      throw err
    } finally {
      setConnecting(false)
    }
  }, [])

  const handleDisconnect = useCallback(async () => {
    setDisconnecting(true)
    try {
      const provider = getProvider()
      if (provider?.disconnect) {
        await provider.disconnect()
      }
    } catch (e) {
      console.error('Disconnect error:', e)
    }
    setWalletName(null)
    setPublicKey(null)
    setConnected(false)
    setDisconnecting(false)
  }, [getProvider])

  const signMessage = useCallback(async (message: Uint8Array) => {
    const provider = getProvider()
    if (!provider?.signMessage) throw new Error('Not supported')
    const { signature } = await provider.signMessage(message, 'utf8')
    return signature
  }, [getProvider])

  const signTransaction = useCallback(async (tx: Transaction | VersionedTransaction) => {
    const provider = getProvider()
    if (!provider?.signTransaction) throw new Error('Not supported')
    return provider.signTransaction(tx)
  }, [getProvider])

  const signAllTransactions = useCallback(async (txs: (Transaction | VersionedTransaction)[]) => {
    const provider = getProvider()
    if (!provider?.signAllTransactions) throw new Error('Not supported')
    return provider.signAllTransactions(txs)
  }, [getProvider])

  return (
    <MultiWalletContext.Provider value={{
      connection, publicKey, connected, connecting, disconnecting,
      wallet: getProvider(), walletName, availableWallets, error,
      connect: handleConnect, disconnect: handleDisconnect,
      signMessage, signTransaction, signAllTransactions,
      getBalance, clearError, checkConnectionHealth, getRpcEndpoint,
    }}>
      {children}
    </MultiWalletContext.Provider>
  )
}

export function useMultiWallet() {
  const context = useContext(MultiWalletContext)
  if (!context) throw new Error('useMultiWallet must be within MultiWalletProvider')
  return context
}

export default MultiWalletProvider
