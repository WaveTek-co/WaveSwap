'use client'

import { useMemo } from 'react'
import { usePhantomWallet } from '@/contexts/PhantomWalletContext'
import { Transaction, VersionedTransaction } from '@solana/web3.js'

export interface WalletAdapterState {
  connected: boolean
  connecting: boolean
  disconnecting: boolean
  publicKey: {
    toBuffer: () => Buffer
    toBase58: () => string
    toString: () => string
  } | null
  autoConnect: boolean
}

export interface WalletAdapterMethods {
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  signTransaction: (transaction: Transaction | VersionedTransaction) => Promise<Transaction | VersionedTransaction>
  signAllTransactions: (transactions: (Transaction | VersionedTransaction)[]) => Promise<(Transaction | VersionedTransaction)[]>
  signMessage: (message: Uint8Array) => Promise<Uint8Array>
}

export interface WalletAdapter extends WalletAdapterState, WalletAdapterMethods {
  wallet: {
    adapter: {
      name: string
    }
  } | null
}

export function usePhantomWalletAdapter(): WalletAdapter {
  const phantomWallet = usePhantomWallet()

  return useMemo(() => {
    // Transform publicKey to match expected interface
    const transformedPublicKey = phantomWallet.publicKey
      ? {
          toBuffer: () => phantomWallet.publicKey!.toBuffer(),
          toBase58: () => phantomWallet.publicKey!.toBase58(),
          toString: () => phantomWallet.publicKey!.toBase58()
        }
      : null

    return {
      connected: phantomWallet.isConnected,
      connecting: phantomWallet.connecting,
      disconnecting: phantomWallet.disconnecting,
      publicKey: transformedPublicKey,
      autoConnect: false, // We handle auto-connect manually

      connect: async () => {
        await phantomWallet.connect()
      },

      disconnect: async () => {
        await phantomWallet.disconnect()
      },

      signTransaction: async (transaction: Transaction | VersionedTransaction) => {
        return await phantomWallet.signTransaction(transaction)
      },

      signAllTransactions: async (transactions: (Transaction | VersionedTransaction)[]) => {
        return await phantomWallet.signAllTransactions(transactions)
      },

      signMessage: async (message: Uint8Array) => {
        return await phantomWallet.signMessage(message)
      },

      wallet: {
        adapter: {
          name: 'Phantom'
        }
      }
    }
  }, [
    phantomWallet.isConnected,
    phantomWallet.connecting,
    phantomWallet.publicKey,
    phantomWallet.connect,
    phantomWallet.disconnect,
    phantomWallet.signTransaction,
    phantomWallet.signAllTransactions,
    phantomWallet.signMessage
  ])
}

export default usePhantomWalletAdapter