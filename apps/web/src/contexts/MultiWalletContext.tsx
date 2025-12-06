'use client'

import React, { createContext, useContext, ReactNode, useState, useCallback, useMemo } from 'react'
import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js'
import {
  PhantomProvider,
  usePhantom,
  useConnect,
  useDisconnect,
  useSolana,
  type PhantomSDKConfig,
  darkTheme,
  lightTheme,
  AddressType
} from '@phantom/react-sdk'
import { config } from '@/lib/config'
import { useThemeConfig } from '@/lib/theme'

interface MultiWalletContextType {
  // Connection state
  connection: Connection
  publicKey: PublicKey | null
  connected: boolean
  connecting: boolean
  disconnecting: boolean
  wallet: any | null

  // Available wallets
  availableWallets: string[]

  // Error handling and configuration state
  error: string | null
  configError: Error | null
  isUsingFallbackConfig: boolean

  // Core wallet functions
  connect: (walletName: string) => Promise<void>
  disconnect: () => Promise<void>

  // Solana functions
  signMessage: (message: Uint8Array) => Promise<Uint8Array>
  signTransaction: (transaction: Transaction | VersionedTransaction) => Promise<Transaction | VersionedTransaction>
  signAllTransactions: (transactions: (Transaction | VersionedTransaction)[]) => Promise<(Transaction | VersionedTransaction)[]>

  // Utility functions
  getBalance: () => Promise<number>
  clearError: () => void
  checkConnectionHealth: () => Promise<boolean>
  getRpcEndpoint: () => string
}

const MultiWalletContext = createContext<MultiWalletContextType | undefined>(undefined)

// Phantom SDK Configuration with environment variables and validation
const validatePhantomConfig = (): PhantomSDKConfig => {
  const appId = process.env.NEXT_PUBLIC_PHANTOM_APP_ID

  if (!appId) {
    throw new Error('NEXT_PUBLIC_PHANTOM_APP_ID is required but not defined in environment variables')
  }

  return {
    providers: ["google", "apple", "injected"],
    addressTypes: [AddressType.solana],
    appId: appId,
    embeddedWalletType: "user-wallet",
  }
}

// Initialize config with comprehensive error handling
let PHANTOM_CONFIG: PhantomSDKConfig
let configInitializationError: Error | null = null

try {
  PHANTOM_CONFIG = validatePhantomConfig()
  console.log('Phantom SDK configuration initialized successfully')
} catch (error) {
  configInitializationError = error instanceof Error ? error : new Error(String(error))
  console.error('Failed to initialize Phantom SDK configuration:', configInitializationError.message)

  // Fallback configuration for development
  PHANTOM_CONFIG = {
    providers: ["google", "apple", "injected"],
    addressTypes: [AddressType.solana],
    appId: "dev-fallback-app-id",
    embeddedWalletType: "user-wallet",
  }
  console.warn('Using fallback Phantom SDK configuration for development')
}

function MultiWalletContextInner({ children }: { children: ReactNode }) {
  const [error, setError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  // Create enhanced Solana connection with fallback RPC support
  const connection = useMemo(() => {
    const createConnectionWithFallback = () => {
      const allUrls = [config.rpc.url, ...(config.rpc.fallbackUrls || [])]

      return new Connection(config.rpc.url, {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: 60000, // 60 seconds timeout
        httpHeaders: {
          'Content-Type': 'application/json',
        },
        fetchMiddleware: async (url, options) => {
          try {
            // Add retry logic with fallback RPC support
            const maxRetries = 3
            let lastError: Error | null = null

            for (let attempt = 0; attempt < maxRetries; attempt++) {
              // Try different RPC endpoints on retry
              const rpcUrl = attempt === 0 ? url : allUrls[attempt % allUrls.length]

              try {
                const response = await fetch(rpcUrl, {
                  ...options,
                  signal: AbortSignal.timeout(15000) // 15 second timeout per request
                })

                if (!response.ok) {
                  throw new Error(`HTTP ${response.status}: ${response.statusText}`)
                }

                return response
              } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error))

                if (attempt < maxRetries - 1) {
                  // Exponential backoff: 1s, 2s, 4s
                  const delay = Math.pow(2, attempt) * 1000
                  console.warn(`RPC request attempt ${attempt + 1} failed using ${rpcUrl}, retrying in ${delay}ms:`, lastError.message)
                  await new Promise(resolve => setTimeout(resolve, delay))
                }
              }
            }

            throw lastError || new Error('Max retries exceeded with all RPC endpoints')
          } catch (error) {
            console.error('All RPC requests failed:', error)
            throw error
          }
        }
      })
    }

    return createConnectionWithFallback()
  }, [config.rpc.url, config.rpc.fallbackUrls])

  // Use Phantom SDK hooks
  const { isConnected, addresses } = usePhantom()
  const { connect, isConnecting } = useConnect()
  const { disconnect, isDisconnecting } = useDisconnect()
  const { solana } = useSolana()

  // Get the first address as publicKey
  const publicKey = useMemo(() => {
    if (addresses && addresses.length > 0) {
      return new PublicKey(addresses[0].address)
    }
    return null
  }, [addresses])

  // Available wallets with expanded options
  const availableWallets = useMemo(() => {
    return [
      "phantom",
      "google",
      "apple",
      "ledger",
      "jupiter",
      "backpack",
      "solflare"
    ]
  }, [])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  // Connection health check function
  const checkConnectionHealth = useCallback(async (): Promise<boolean> => {
    try {
      console.log('Checking RPC connection health...')
      const startTime = Date.now()
      const slot = await connection.getSlot()
      const latency = Date.now() - startTime

      console.log(`RPC health check successful. Current slot: ${slot}, Latency: ${latency}ms`)
      return true
    } catch (error) {
      console.error('RPC health check failed:', error)
      return false
    }
  }, [connection])

  // Get RPC endpoint for debugging
  const getRpcEndpoint = useCallback(() => {
    return config.rpc.url
  }, [])

  const getBalance = useCallback(async (): Promise<number> => {
    if (!isConnected || !publicKey) {
      throw new Error('Wallet not connected')
    }

    console.log('Fetching balance for account:', publicKey.toString())
    console.log('Using RPC endpoint:', config.rpc.url)

    try {
      // Test connection health first
      const slot = await connection.getSlot()
      console.log('Current slot:', slot)

      // Get account balance with enhanced error handling
      const balance = await connection.getBalance(publicKey, {
        commitment: 'confirmed'
      })

      console.log('Successfully fetched balance:', balance, 'lamports')
      return balance
    } catch (err) {
      let errorMessage: string

      if (err instanceof Error) {
        // Handle specific error types
        if (err.message.includes('Failed to fetch')) {
          errorMessage = 'Network connection failed. Please check your internet connection and try again.'
        } else if (err.message.includes('timeout')) {
          errorMessage = 'Request timed out. The Solana network may be experiencing high traffic. Please try again.'
        } else if (err.message.includes('429')) {
          errorMessage = 'Too many requests. Please wait a moment and try again.'
        } else if (err.message.includes('500') || err.message.includes('502') || err.message.includes('503')) {
          errorMessage = 'Solana network is temporarily unavailable. Please try again later.'
        } else {
          errorMessage = `Balance fetch failed: ${err.message}`
        }
      } else {
        errorMessage = 'An unexpected error occurred while fetching balance'
      }

      console.error('Balance fetch error:', { error: err, publicKey: publicKey.toString() })
      setError(errorMessage)
      throw new Error(errorMessage)
    }
  }, [isConnected, publicKey, connection])

  // Enhanced connect function with comprehensive wallet support
  const handleConnect = useCallback(async (walletName: string) => {
    setConnecting(true)
    setError(null)

    // Validate wallet name
    if (!walletName || typeof walletName !== 'string') {
      const error = 'Invalid wallet name provided'
      setError(error)
      setConnecting(false)
      throw new Error(error)
    }

    try {
      // Check if we have config initialization errors
      if (configInitializationError) {
        console.warn('Using fallback configuration due to initialization error:', configInitializationError.message)
      }

      console.log(`Attempting to connect with wallet: ${walletName}`)

      // Handle different wallet types
      switch (walletName.toLowerCase()) {
        case 'phantom':
        case 'google':
        case 'apple': {
          // Phantom SDK wallets
          let provider: string
          switch (walletName.toLowerCase()) {
            case 'google':
              provider = 'google'
              break
            case 'apple':
              provider = 'apple'
              break
            case 'phantom':
              provider = 'injected'
              break
            default:
              throw new Error(`Unsupported wallet provider: ${walletName}`)
          }

          // Validate provider is in allowed list
          if (!PHANTOM_CONFIG.providers.includes(provider as any)) {
            throw new Error(`Provider ${provider} is not configured in the allowed providers list`)
          }

          const authOptions: any = {
            provider: provider
          }

          await connect(authOptions)
          console.log(`Successfully connected with Phantom SDK provider: ${provider}`)
          break
        }

        case 'jupiter': {
          // Jupiter wallet - redirect to Jupiter Station
          throw new Error('Jupiter wallet integration is not available yet. Please use Jupiter Station directly at https://station.jup.ag/ for swapping.')
        }

        case 'backpack': {
          // Backpack wallet - direct window.solana
          if (typeof window === 'undefined' || !window.solana) {
            throw new Error('Backpack wallet is not installed. Please install it first.')
          }

          try {
            await window.solana.connect()
            console.log('Successfully connected with Backpack wallet')
          } catch (error) {
            throw new Error('Failed to connect to Backpack wallet')
          }
          break
        }

        case 'solflare': {
          // Solflare wallet - check for window.solflare
          if (typeof window === 'undefined' || !window.solflare) {
            throw new Error('Solflare wallet is not installed. Please install it first.')
          }

          try {
            await window.solflare.connect()
            console.log('Successfully connected with Solflare wallet')
          } catch (error) {
            throw new Error('Failed to connect to Solflare wallet')
          }
          break
        }

        case 'ledger': {
          // Ledger hardware wallet
          throw new Error('Ledger support is coming soon. Please use Phantom, Jupiter, or other supported wallets.')
        }

        default:
          throw new Error(`Unsupported wallet: ${walletName}`)
      }

    } catch (err) {
      let errorMessage: string

      if (err instanceof Error) {
        // Handle specific wallet errors
        if (err.message.includes('User rejected') || err.message.includes('User cancelled')) {
          errorMessage = 'Connection cancelled by user'
        } else if (err.message.includes('not installed')) {
          errorMessage = err.message
        } else if (err.message.includes('not ready') || err.message.includes('not unlocked')) {
          errorMessage = 'Wallet is not ready. Please ensure it is installed and unlocked.'
        } else if (err.message.includes('Network error')) {
          errorMessage = 'Network error occurred. Please check your connection and try again.'
        } else {
          errorMessage = `Connection failed: ${err.message}`
        }
      } else {
        errorMessage = 'An unexpected error occurred while connecting to wallet'
      }

      setError(errorMessage)
      console.error('Wallet connection error:', { walletName, error: err, errorMessage })
      throw new Error(errorMessage)
    } finally {
      setConnecting(false)
    }
  }, [connect])

  // Enhanced disconnect function with comprehensive error handling
  const handleDisconnect = useCallback(async () => {
    setDisconnecting(true)
    setError(null)

    try {
      console.log('Attempting to disconnect wallet')
      await disconnect()
      console.log('Successfully disconnected wallet')
    } catch (err) {
      let errorMessage: string

      if (err instanceof Error) {
        // Handle specific disconnection errors
        if (err.message.includes('No wallet connected')) {
          errorMessage = 'No wallet is currently connected'
        } else if (err.message.includes('User rejected')) {
          errorMessage = 'Disconnection cancelled by user'
        } else {
          errorMessage = `Disconnection failed: ${err.message}`
        }
      } else {
        errorMessage = 'An unexpected error occurred while disconnecting wallet'
      }

      setError(errorMessage)
      console.error('Wallet disconnection error:', { error: err, errorMessage })
      throw new Error(errorMessage)
    } finally {
      setDisconnecting(false)
    }
  }, [disconnect])

  const contextValue: MultiWalletContextType = {
    connection,
    publicKey,
    connected: isConnected,
    connecting: connecting || isConnecting,
    disconnecting: disconnecting || isDisconnecting,
    error,
    configError: configInitializationError,
    isUsingFallbackConfig: !!configInitializationError,
    wallet: solana || null,
    availableWallets,
    connect: handleConnect,
    disconnect: handleDisconnect,
    signMessage: solana?.signMessage ? solana.signMessage.bind(solana) : (() => Promise.reject(new Error('Not available'))),
    signTransaction: solana?.signTransaction ? solana.signTransaction.bind(solana) : (() => Promise.reject(new Error('Not available'))),
    signAllTransactions: solana?.signAllTransactions ? solana.signAllTransactions.bind(solana) : (() => Promise.reject(new Error('Not available'))),
    getBalance,
    clearError,
    checkConnectionHealth,
    getRpcEndpoint
  }

  return (
    <MultiWalletContext.Provider value={contextValue}>
      {children}
    </MultiWalletContext.Provider>
  )
}

export function MultiWalletProvider({ children }: { children: ReactNode }) {
  const theme = useThemeConfig()

  // Select theme based on current theme mode
  const phantomTheme = theme.name === 'dark' ? darkTheme : lightTheme

  return (
    <PhantomProvider
      config={PHANTOM_CONFIG}
      theme={phantomTheme}
      appIcon="/favicon.ico"
      appName="WaveSwap"
    >
      <MultiWalletContextInner>
        {children}
      </MultiWalletContextInner>
    </PhantomProvider>
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