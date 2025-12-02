'use client'

import React, { createContext, useContext, ReactNode, useState, useCallback, useEffect } from 'react'
import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js'
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import { config } from '@/lib/config'

interface PhantomWalletContextType {
  connection: Connection
  publicKey: PublicKey | null
  isConnected: boolean
  connecting: boolean
  disconnecting: boolean
  error: string | null
  wallet: PhantomWalletAdapter | null
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  signMessage: (message: Uint8Array) => Promise<Uint8Array>
  signTransaction: (transaction: Transaction | VersionedTransaction) => Promise<Transaction | VersionedTransaction>
  signAllTransactions: (transactions: (Transaction | VersionedTransaction)[]) => Promise<(Transaction | VersionedTransaction)[]>
  getBalance: () => Promise<number>
  clearError: () => void
}

const PhantomWalletContext = createContext<PhantomWalletContextType | undefined>(undefined)

export function PhantomWalletProvider({ children }: { children: ReactNode }) {
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [wallet, setWallet] = useState<PhantomWalletAdapter | null>(null)

  // Create Solana connection
  const connection = new Connection(config.rpc.url, {
    commitment: 'confirmed'
  })

  // Initialize wallet adapter
  useEffect(() => {
    const phantomAdapter = new PhantomWalletAdapter({
      network: WalletAdapterNetwork.Mainnet,
      connection
    })

    // Auto-connect if previously connected
    const checkAutoConnect = async () => {
      const wasConnected = localStorage.getItem('phantom-wallet-connected')
      if (wasConnected === 'true') {
        try {
          await phantomAdapter.connect()
          setWallet(phantomAdapter)
        } catch (err) {
          console.log('Auto-connect failed:', err)
          localStorage.removeItem('phantom-wallet-connected')
        }
      }
    }

    // Listen for wallet events
    const handleConnect = () => {
      console.log('Phantom wallet connected')
      localStorage.setItem('phantom-wallet-connected', 'true')
    }

    const handleDisconnect = () => {
      console.log('Phantom wallet disconnected')
      localStorage.removeItem('phantom-wallet-connected')
      setWallet(null)
    }

    const handleError = (error: any) => {
      console.error('Phantom wallet error:', error)
      setError(error.message || 'Wallet error occurred')
    }

    phantomAdapter.on('connect', handleConnect)
    phantomAdapter.on('disconnect', handleDisconnect)
    phantomAdapter.on('error', handleError)

    checkAutoConnect()

    return () => {
      phantomAdapter.off('connect', handleConnect)
      phantomAdapter.off('disconnect', handleDisconnect)
      phantomAdapter.off('error', handleError)
    }
  }, [connection])

  const publicKey = wallet?.publicKey || null
  const isConnected = wallet?.connected || false

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  const connect = useCallback(async () => {
    if (!wallet) {
      setError('Phantom wallet not available. Please install Phantom wallet.')
      return
    }

    setConnecting(true)
    setError(null)

    try {
      await wallet.connect()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect to Phantom wallet'
      setError(errorMessage)
      console.error('Phantom connection error:', err)
    } finally {
      setConnecting(false)
    }
  }, [wallet])

  const disconnect = useCallback(async () => {
    if (!wallet) {
      return
    }

    setDisconnecting(true)
    setError(null)

    try {
      await wallet.disconnect()
      clearError()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to disconnect from Phantom wallet'
      setError(errorMessage)
      console.error('Phantom disconnection error:', err)
    } finally {
      setDisconnecting(false)
    }
  }, [wallet, clearError])

  const signMessage = useCallback(async (message: Uint8Array): Promise<Uint8Array> => {
    if (!wallet || !wallet.connected) {
      throw new Error('Wallet not connected')
    }

    try {
      const signature = await wallet.signMessage(message)
      return signature
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to sign message'
      setError(errorMessage)
      throw new Error(errorMessage)
    }
  }, [wallet])

  const signTransaction = useCallback(async (transaction: Transaction | VersionedTransaction): Promise<Transaction | VersionedTransaction> => {
    if (!wallet || !wallet.connected) {
      throw new Error('Wallet not connected')
    }

    try {
      const signedTransaction = await wallet.signTransaction(transaction)
      return signedTransaction
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to sign transaction'
      setError(errorMessage)
      throw new Error(errorMessage)
    }
  }, [wallet])

  const signAllTransactions = useCallback(async (transactions: (Transaction | VersionedTransaction)[]): Promise<(Transaction | VersionedTransaction)[]> => {
    if (!wallet || !wallet.connected) {
      throw new Error('Wallet not connected')
    }

    try {
      const signedTransactions = await wallet.signAllTransactions(transactions)
      return signedTransactions
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to sign transactions'
      setError(errorMessage)
      throw new Error(errorMessage)
    }
  }, [wallet])

  const getBalance = useCallback(async (): Promise<number> => {
    if (!wallet || !wallet.connected || !publicKey) {
      throw new Error('Wallet not connected')
    }

    try {
      const balance = await connection.getBalance(publicKey)
      return balance
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get balance'
      setError(errorMessage)
      throw new Error(errorMessage)
    }
  }, [wallet, publicKey, connection])

  const contextValue: PhantomWalletContextType = {
    connection,
    publicKey,
    isConnected,
    connecting,
    disconnecting,
    error,
    wallet,
    connect,
    disconnect,
    signMessage,
    signTransaction,
    signAllTransactions,
    getBalance,
    clearError
  }

  return (
    <PhantomWalletContext.Provider value={contextValue}>
      {children}
    </PhantomWalletContext.Provider>
  )
}

export function usePhantomWallet() {
  const context = useContext(PhantomWalletContext)
  if (context === undefined) {
    throw new Error('usePhantomWallet must be used within a PhantomWalletProvider')
  }
  return context
}

export default PhantomWalletProvider