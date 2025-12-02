'use client'

import { useMemo } from 'react'
import { usePhantomConnect } from '@/contexts/PhantomConnectContext'
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

export function usePhantomConnectAdapter(): WalletAdapter {
  const phantomConnect = usePhantomConnect()

  return useMemo(() => {
    // Get Solana address from Phantom Connect
    const solanaAddress = phantomConnect.solanaAddress

    // Transform address to match expected interface
    const transformedPublicKey = solanaAddress
      ? {
          toBuffer: () => solanaAddress.toBuffer(),
          toBase58: () => solanaAddress.toBase58(),
          toString: () => solanaAddress.toString()
        }
      : null

    return {
      connected: phantomConnect.isConnected,
      connecting: phantomConnect.isConnecting,
      disconnecting: false, // Phantom Connect doesn't expose disconnecting state
      publicKey: transformedPublicKey,
      autoConnect: false, // We handle auto-connect manually

      connect: async () => {
        await phantomConnect.connect()
      },

      disconnect: async () => {
        await phantomConnect.disconnect()
      },

      signTransaction: async (transaction: Transaction | VersionedTransaction) => {
        return await phantomConnect.signTransaction(transaction)
      },

      signAllTransactions: async (transactions: (Transaction | VersionedTransaction)[]) => {
        // Phantom Connect SDK may not have this method
        throw new Error('signAllTransactions not supported')
      },

      signMessage: async (message: Uint8Array) => {
        return await phantomConnect.signMessage(message)
      },

      wallet: {
        adapter: {
          name: 'Phantom Connect'
        }
      }
    }
  }, [
    phantomConnect.isConnected,
    phantomConnect.isConnecting,
    phantomConnect.solanaAddress,
    phantomConnect.connect,
    phantomConnect.disconnect,
    phantomConnect.signTransaction,
    phantomConnect.signMessage
  ])
}

export default usePhantomConnectAdapter