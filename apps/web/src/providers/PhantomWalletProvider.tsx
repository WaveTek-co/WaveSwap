'use client'

import React, { createContext, useContext, ReactNode } from 'react'
import { usePhantomConnect } from '@/contexts/PhantomConnectContext'

interface WalletContextState {
  connected: boolean
  connecting: boolean
  disconnecting: boolean
  publicKey: {
    toBuffer: () => Buffer
    toBase58: () => string
    toString: () => string
  } | null
  wallets: Array<{
    adapter: {
      name: string
    }
  }>
  wallet: {
    adapter: {
      name: string
    }
  } | null
}

interface WalletContextActions {
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  select: (walletName: string) => void
  signTransaction: (transaction: any) => Promise<any>
  signAllTransactions: (transactions: any[]) => Promise<any[]>
  signMessage: (message: Uint8Array | string) => Promise<Uint8Array>
}

export type WalletContext = WalletContextState & WalletContextActions

const WalletContext = createContext<WalletContext | null>(null)

export function WalletProvider({ children }: { children: ReactNode }) {
  // Create a simple mock wallet context to prevent errors
  const walletContext: WalletContext = {
    connected: false,
    connecting: false,
    disconnecting: false,
    publicKey: null,

    // Always include Phantom in wallets array
    wallets: [{
      adapter: {
        name: 'Phantom',
        icon: '/assets/Phantom/Phantom-Icon-Purple.svg'
      },
      readyState: 'Installed'
    }],

    wallet: {
      adapter: {
        name: 'Phantom',
        icon: '/assets/Phantom/Phantom-Icon-Purple.svg'
      },
      readyState: 'Installed'
    },

    connect: async () => {
      // TODO: Implement wallet connection when Phantom SDK is fixed
      console.log('Wallet connection not yet implemented')
    },

    disconnect: async () => {
      console.log('Wallet disconnection not yet implemented')
    },

    select: (walletName: string) => {
      console.log('Wallet selection not yet implemented:', walletName)
    },

    signTransaction: async (transaction: any) => {
      throw new Error('Transaction signing not yet implemented')
    },

    signAllTransactions: async (transactions: any[]) => {
      throw new Error('Multiple transaction signing not yet implemented')
    },

    signMessage: async (message: Uint8Array | string) => {
      throw new Error('Message signing not yet implemented')
    }
  }

  return (
    <WalletContext.Provider value={walletContext}>
      {children}
    </WalletContext.Provider>
  )
}

export function useWallet() {
  const context = useContext(WalletContext)
  if (!context) {
    // Return a mock context instead of throwing an error to prevent app crashes
    console.warn('useWallet called outside of WalletProvider, returning mock context')
    return {
      connected: false,
      connecting: false,
      disconnecting: false,
      publicKey: null,
      wallets: [{
        adapter: {
          name: 'Phantom',
          icon: '/assets/Phantom/Phantom-Icon-Purple.svg'
        },
        readyState: 'Installed'
      }],
      wallet: {
        adapter: {
          name: 'Phantom',
          icon: '/assets/Phantom/Phantom-Icon-Purple.svg'
        },
        readyState: 'Installed'
      },
      connect: async () => {
        console.log('Mock wallet connect called')
      },
      disconnect: async () => {
        console.log('Mock wallet disconnect called')
      },
      select: (walletName: string) => {
        console.log('Mock wallet select called:', walletName)
      },
      signTransaction: async (transaction: any) => {
        throw new Error('Transaction signing not available in mock mode')
      },
      signAllTransactions: async (transactions: any[]) => {
        throw new Error('Multiple transaction signing not available in mock mode')
      },
      signMessage: async (message: Uint8Array | string) => {
        throw new Error('Message signing not available in mock mode')
      }
    }
  }
  return context
}

export default WalletProvider