'use client'

import { createContext, useContext, useEffect, useState, useCallback, ReactNode, useMemo } from 'react'

// Simplified interfaces based on defuse implementation
interface NearWalletContextValue {
  accountId: string | null
  isConnected: boolean
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  signMessage: (message: { message: string; recipient: string; nonce: string }) => Promise<any>
  signAndSendTransactions: (params: any) => Promise<any>
}

const NearWalletContext = createContext<NearWalletContextValue | null>(null)

interface NearWalletProviderProps {
  children: ReactNode
}

export function NearWalletProvider({ children }: NearWalletProviderProps) {
  const [accountId, setAccountId] = useState<string | null>(null)
  const [connector, setConnector] = useState<any>(null)

  const init = useCallback(async () => {
    if (typeof window === 'undefined') return null

    try {
      // Dynamic import of near-connect to avoid SSR issues
      const { NearConnector } = await import('@hot-labs/near-connect')

      const newConnector = new NearConnector({
        network: 'mainnet',
        walletConnect: {
          projectId: process.env.NEXT_NEAR_WALLETCONNECT_PROJECT_ID || 'default-project-id',
          metadata: {
            name: 'WavePortal',
            description: 'WavePortal Bridge',
            url: typeof window !== 'undefined' ? window.location.origin : 'https://waveswap.io',
            icons: ['https://waveswap.io/icon.png']
          }
        }
      })

      // Set up event listeners
      newConnector.on('wallet:signOut', () => {
        setAccountId(null)
      })

      newConnector.on('wallet:signIn', (data: any) => {
        setAccountId(data.accounts?.[0]?.accountId ?? null)
      })

      // Check for existing connection
      try {
        const wallet = await newConnector.wallet()
        const accounts = await wallet.getAccounts()
        if (accounts.length > 0 && accounts[0]) {
          setAccountId(accounts[0].accountId)
        }
      } catch (err) {
        console.warn('Failed to check existing NEAR connection:', err)
      }

      setConnector(newConnector)
      return newConnector
    } catch (err) {
      console.error('Failed to initialize NEAR connector:', err)
      return null
    }
  }, [])

  // Initialize on mount
  useEffect(() => {
    init()
  }, [init])

  const connect = useCallback(async () => {
    try {
      const conn = connector || await init()
      if (!conn) {
        throw new Error('Failed to initialize NEAR connector')
      }
      await conn.connect()
      localStorage.setItem('walletConnected', 'near')
    } catch (err) {
      console.error('Failed to connect NEAR wallet:', err)
      throw err
    }
  }, [connector, init])

  const disconnect = useCallback(async () => {
    try {
      if (!connector) return
      await connector.disconnect()
      setAccountId(null)
      localStorage.removeItem('walletConnected')
    } catch (err) {
      console.error('Failed to disconnect NEAR wallet:', err)
    }
  }, [connector])

  const signMessage = useCallback(async (message: { message: string; recipient: string; nonce: string }) => {
    if (!connector) {
      throw new Error('Connector not initialized')
    }

    try {
      const wallet = await connector.wallet()
      const signatureData = await wallet.signMessage(message)
      return {
        signatureData,
        signedData: message
      }
    } catch (err) {
      console.error('Failed to sign message:', err)
      throw err
    }
  }, [connector])

  const signAndSendTransactions = useCallback(async (params: any) => {
    if (!connector) {
      throw new Error('Connector not initialized')
    }

    try {
      const wallet = await connector.wallet()
      return wallet.signAndSendTransactions(params)
    } catch (err) {
      console.error('Failed to sign and send transactions:', err)
      throw err
    }
  }, [connector])

  const value = useMemo<NearWalletContextValue>(() => ({
    accountId,
    isConnected: !!accountId,
    connect,
    disconnect,
    signMessage,
    signAndSendTransactions
  }), [accountId, connect, disconnect, signMessage, signAndSendTransactions])

  return (
    <NearWalletContext.Provider value={value}>
      {children}
    </NearWalletContext.Provider>
  )
}

export function useNearWallet() {
  const ctx = useContext(NearWalletContext)
  if (!ctx) {
    throw new Error('useNearWallet must be used within a NearWalletProvider')
  }
  return ctx
}