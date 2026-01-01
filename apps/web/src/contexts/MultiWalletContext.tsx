'use client'

import React, { createContext, useContext, ReactNode, useState, useCallback, useMemo, useEffect } from 'react'
import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js'
import { UnifiedWalletProvider } from '@jup-ag/wallet-adapter'
import dynamic from 'next/dynamic'
import * as LedgerSolana from '@ledgerhq/hw-app-solana'
import * as LedgerTransport from '@ledgerhq/hw-transport-webusb'

// Wallet interface declarations
declare global {
  interface Window {
    backpack?: {
      connect(): Promise<{ publicKey: PublicKey }>
      disconnect(): Promise<void>
      signTransaction(transaction: Transaction): Promise<Transaction>
      signAllTransactions(transactions: Transaction[]): Promise<Transaction[]>
    }
    solflare?: {
      connect(): Promise<{ publicKey: PublicKey }>
      disconnect(): Promise<void>
      signTransaction(transaction: Transaction): Promise<Transaction>
      signAllTransactions(transactions: Transaction[]): Promise<Transaction[]>
    }
    jupiter?: {
      connect(): Promise<{ publicKey: PublicKey }>
      disconnect(): Promise<void>
      signTransaction(transaction: Transaction): Promise<Transaction>
      signAllTransactions(transactions: Transaction[]): Promise<Transaction[]>
    }
    ethereum?: any // For WalletConnect compatibility
  }
}

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
import { BackpackWalletAdapter } from '@solana/wallet-adapter-backpack'
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare'
import getSolflare from '@solflare-wallet/sdk'
import { SignClient } from '@walletconnect/sign-client'
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

  // Wallet adapters
  backpackAdapter: BackpackWalletAdapter | null
  solflareAdapter: SolflareWalletAdapter | null
  walletConnectClient: any | null

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
    providers: ["google", "apple", "injected", "phantom"],
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
    providers: ["google", "apple", "injected", "phantom"
      
    ],
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

  // Wallet adapters
  const [backpackAdapter, setBackpackAdapter] = useState<BackpackWalletAdapter | null>(null)
  const [solflareAdapter, setSolflareAdapter] = useState<SolflareWalletAdapter | null>(null)
  const [walletConnectClient, setWalletConnectClient] = useState<any>(null)

  // Additional wallet connection state for non-Phantom wallets
  const [currentWalletType, setCurrentWalletType] = useState<string | null>(null)
  const [externalPublicKey, setExternalPublicKey] = useState<PublicKey | null>(null)
  const [externalConnected, setExternalConnected] = useState(false)

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

  // Get the first address as publicKey (from Phantom SDK or external wallets)
  const publicKey = useMemo(() => {
    // Priority: Phantom SDK addresses first, then external wallet connections
    if (addresses && addresses.length > 0) {
      return new PublicKey(addresses[0].address)
    }
    if (externalPublicKey) {
      return externalPublicKey
    }
    return null
  }, [addresses, externalPublicKey])

  // Available wallets with expanded options
  const availableWallets = useMemo(() => {
    return [
      "phantom",
      "google",
      "apple",
      "ledger",
      "backpack",
      "solflare",
      "walletconnect"
    ]
  }, [])

  // Initialize wallet adapters
  useEffect(() => {
    const initializeWalletAdapters = async () => {
      try {
        // Initialize Backpack adapter
        if (typeof window !== 'undefined') {
          const backpack = new BackpackWalletAdapter()
          setBackpackAdapter(backpack)

          // Initialize Solflare adapter
          const solflare = new SolflareWalletAdapter()
          setSolflareAdapter(solflare)

          // Initialize WalletConnect client
          try {
            const wcClient = await SignClient.init({
              projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'default-project-id',
              relayUrl: 'wss://relay.walletconnect.com'
            })
            setWalletConnectClient(wcClient)
          } catch (wcError) {
            console.warn('WalletConnect initialization failed:', wcError)
          }
        }
      } catch (error) {
        console.warn('Failed to initialize wallet adapters:', error)
      }
    }

    initializeWalletAdapters()
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
      console.error('Balance fetch error:', { error: err, publicKey: publicKey.toString() })

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

      console.log('=== Starting Phantom SDK wallet connection ===')
      console.log('Wallet name:', walletName)
      console.log('PHANTOM_CONFIG:', PHANTOM_CONFIG)

      // Handle different wallet types
      switch (walletName.toLowerCase()) {
        case 'phantom-embedded':
        case 'phantom-injected':
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
            case 'phantom-embedded':
              provider = 'phantom'
              break
            case 'phantom-injected':
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

          console.log('Provider mapped to:', provider)
          console.log('Auth options created:', authOptions)
          console.log('Current phantom extension detected:', !!(window as any).phantom?.solana)
          console.log('About to call connect() function...')

          try {
            console.log('Calling connect with authOptions:', authOptions)
            const result = await connect(authOptions)
            console.log('Connect returned:', result)
            console.log(`Successfully connected with Phantom SDK provider: ${provider}`)
          } catch (error) {
            console.log('=== ERROR CAUGHT ===')
            console.log('Error object:', error)
            console.log('Error type:', typeof error)
            console.log('Error message:', error?.message)
            console.log('Error name:', error?.name)
            console.log('Error stack:', error?.stack)
            console.log('Stringified error:', JSON.stringify(error, null, 2))
            throw error
          }
          break
        }

        case 'jupiter': {
          try {
            // Connect to Jupiter wallet extension using proper API
            if (typeof window !== 'undefined') {
              // Try to detect Jupiter wallet extension
              const jupiter = (window as any).jupiter

              if (!jupiter) {
                throw new Error('Jupiter wallet is not installed. Please install it from Chrome Web Store.')
              }

              console.log('Connecting to Jupiter wallet...')
              const response = await jupiter.connect()
              console.log('Jupiter wallet connected:', response)

              // Get public key
              const publicKey = response.publicKey || response
              if (!publicKey) {
                throw new Error('No public key returned from Jupiter wallet')
              }

              // Update connection state
              setCurrentWalletType('jupiter')
              setExternalConnected(true)
              setExternalPublicKey(new PublicKey(publicKey.toString()))

              console.log(`Successfully connected to Jupiter wallet: ${publicKey.toString()}`)
            } else {
              throw new Error('Window object not available.')
            }
          } catch (error: any) {
            console.error('Jupiter wallet connection failed:', error)
            throw new Error(`Jupiter wallet connection failed: ${error.message || 'Unknown error'}`)
          }
          break
        }

        case 'backpack': {
          // Backpack wallet
          if (typeof window !== 'undefined' && !(window as any).backpack) {
            throw new Error('Backpack wallet is not installed. Please install it first.')
          }

          try {
            console.log('Connecting to Backpack wallet...')
            const backpack = (window as any).backpack

            // Connect to Backpack
            const response = await backpack.connect()
            console.log('Backpack wallet connected:', response)

            // Get public key
            const publicKey = response.publicKey || response
            if (!publicKey) {
              throw new Error('No public key returned from Backpack wallet')
            }

            // Update connection state
            setCurrentWalletType('backpack')
            setExternalConnected(true)
            setExternalPublicKey(new PublicKey(publicKey.toString()))

            console.log(`Successfully connected to Backpack wallet: ${publicKey.toString()}`)
          } catch (error: any) {
            console.error('Backpack wallet connection failed:', error)
            throw new Error(`Backpack wallet connection failed: ${error.message || 'Unknown error'}`)
          }
          break
        }

        case 'solflare': {
          // Solflare wallet
          if (typeof window !== 'undefined' && !(window as any).solflare) {
            throw new Error('Solflare wallet is not installed. Please install it first.')
          }

          try {
            console.log('Connecting to Solflare wallet...')
            const solflare = (window as any).solflare

            // Connect to Solflare
            const response = await solflare.connect()
            console.log('Solflare wallet connected:', response)

            // Get public key
            const publicKey = response.publicKey || response
            if (!publicKey) {
              throw new Error('No public key returned from Solflare wallet')
            }

            // Update connection state
            setCurrentWalletType('solflare')
            setExternalConnected(true)
            setExternalPublicKey(new PublicKey(publicKey.toString()))

            console.log(`Successfully connected to Solflare wallet: ${publicKey.toString()}`)
          } catch (error: any) {
            console.error('Solflare wallet connection failed:', error)
            throw new Error(`Solflare wallet connection failed: ${error.message || 'Unknown error'}`)
          }
          break
        }

        case 'walletconnect': {
          // WalletConnect integration
          if (!walletConnectClient) {
            throw new Error('WalletConnect client not initialized. Please try again.')
          }

          try {
            const { uri } = await walletConnectClient.pair({
              uri: 'wc:a281567ba3e5547182f53e41806fd7a3cf4123c06433e5b53ae1c4ec8b7ae38f@2?relay-protocol=irn&symKey=339dfd8d6717cb378d664c5bc8c20eea5cd6b3392d3edc84129dd85b2f1a4791&publicKey=4ac19e31ba3329cac6131ebaa4a1a7a8d2f1ab3b3ce1ba0d9c698c7e4edbbcb3'
            })

            if (uri) {
              // For mobile, we would open deep link
              // For desktop, show QR code
              throw new Error(`WalletConnect QR code: ${uri}. Please scan with your mobile wallet.`)
            }

            console.log('Successfully initiated WalletConnect connection')
          } catch (error) {
            if (error instanceof Error && !error.message.includes('QR code')) {
              throw new Error(`Failed to connect with WalletConnect: ${error.message}`)
            }
            throw error
          }
          break
        }

        case 'ledger': {
          // Ledger hardware wallet using existing packages
          if (typeof window === 'undefined') {
            throw new Error('Ledger connection requires browser environment.')
          }

          try {
            // Check if WebUSB is supported
            const nav = navigator as any
            if (!nav.usb) {
              throw new Error('WebUSB is not supported in this browser. Please use Chrome or Edge.')
            }

            // Import Ledger libraries dynamically
            const ledgerSolana = await import('@ledgerhq/hw-app-solana')
            const ledgerTransport = await import('@ledgerhq/hw-transport-webusb')

            const transport = await (ledgerTransport as any).TransportWebUSB?.create()
            const appSolana = new ledgerSolana.default(transport)

            // Get public key
            const result = await (appSolana as any).getPublicKey("44'/501'/0'/0'")
            console.log('Successfully connected with Ledger')
            console.log('Ledger address:', result.address)

            // Close transport
            await transport.close()

            throw new Error('Ledger hardware wallet detected. Full Ledger integration coming soon.')
          } catch (error) {
            if (error instanceof Error && error.message.includes('No device selected')) {
              throw new Error('Please connect your Ledger device and unlock it.')
            }
            throw new Error(`Ledger connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
          }
        }

        default:
          throw new Error(`Unsupported wallet: ${walletName}`)
      }

    } catch (err) {
      console.error('Wallet connection error:', err)

      let errorMessage = 'Connection failed'
      if (err instanceof Error) {
        errorMessage = err.message
      } else if (typeof err === 'string') {
        errorMessage = err
      }

      setError(errorMessage)
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

      // Clear external wallet states
      setExternalConnected(false)
      setExternalPublicKey(null)
      setCurrentWalletType(null)

      // Disconnect Phantom SDK if connected
      if (isConnected) {
        await disconnect()
      }

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
  }, [disconnect, isConnected])

  const contextValue: MultiWalletContextType = {
    connection,
    publicKey,
    connected: isConnected || externalConnected,
    connecting: connecting || isConnecting,
    disconnecting: disconnecting || isDisconnecting,
    error,
    configError: configInitializationError,
    isUsingFallbackConfig: !!configInitializationError,
    wallet: solana || null,
    availableWallets,
    backpackAdapter,
    solflareAdapter,
    walletConnectClient,
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