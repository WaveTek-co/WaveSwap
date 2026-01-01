/**
 * React Hook for Swap Operations
 *
 * Provides comprehensive swap state management with privacy support
 * using Jupiter API and Encifher Private DeFi SDK.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { useConnection, useWallet } from '@/hooks/useWalletAdapter'
import { PublicKey, Connection, Transaction, VersionedTransaction, Keypair } from '@solana/web3.js'
import { useThemeConfig } from '@/lib/theme'
import { createSwapService, SwapServiceConfig, SwapRequest, SwapUtils as ServiceSwapUtils } from '@/services/swap'
import { JupiterAPI, JupiterUtils } from '@/lib/jupiter'
import { DefiClient, DefiClientConfig, DepositParams, SignedSwapParams, OrderStatusParams, Token as EncifherToken } from 'encifher-swap-sdk'
import { PrivateSwapService } from '@/lib/privateSwapService'
import { Token, SwapQuote, SwapStatus, SwapProgress, SwapMode, getAvailableTokens } from '@/types/token'
import { COMMON_TOKENS, CONFIDENTIAL_TOKENS } from '@/types/token'
import { getUserTokens, getDefaultTokens, getTokenBalance, enrichTokenIcons, clearBalanceCache } from '@/lib/tokens'
import { parseError, WaveSwapError } from '@/lib/errors'
import { formatTokenAmount } from '@/lib/token-formatting'
import nacl from 'tweetnacl'

// Helper function to get local fallback icon path
function getLocalFallbackIcon(symbol: string, address: string): string | null {
  const tokenIcons: { [key: string]: string | null } = {
    'WAVE': '/icons/fallback/token/wave.png',
    'SOL': '/icons/fallback/token/sol.png',
    'USDC': '/icons/fallback/token/usdc.png',
    'USDT': '/icons/fallback/token/usdt.png',
    'ZEC': '/icons/fallback/token/zec.png',
    'PUMP': '/icons/fallback/token/pump.png',
    'CASH': '/icons/fallback/token/cash.png',
    'WEALTH': '/icons/fallback/token/wealth.png',
    'FTP': '/icons/fallback/token/ftp.jpg',
    'AURA': '/icons/fallback/token/aura.png',
    'MEW': '/icons/fallback/token/mew.png',
    'STORE': '/icons/fallback/token/store.png'
  }

  return tokenIcons[symbol.toUpperCase()] || tokenIcons[address] || null
}

export interface SwapState {
  inputToken: Token | null
  outputToken: Token | null
  inputAmount: string
  outputAmount: string
  swapMode: SwapMode
  quote: SwapQuote | null
  balances: Map<string, string>
  isLoading: boolean
  error: string | null
  structuredError: WaveSwapError | null
  progress: SwapProgress | null
  availableTokens: Token[]
  lastDepositSignature: string | null
  needsRecovery: boolean
}

export interface SwapActions {
  setInputToken: (token: Token) => void
  setOutputToken: (token: Token) => void
  setInputAmount: (amount: string) => void
  setOutputAmount: (amount: string) => void
  setSwapMode: (mode: SwapMode) => void
  swap: () => Promise<void>
  getQuote: () => Promise<void>
  refreshBalances: () => Promise<void>
  clearQuote: () => void
  clearError: () => void
  cancelSwap: () => void
  withdrawConfidentialTokens: (tokenAddress: string, amount: number) => Promise<{ signature: string }>
  recoverTransaction: (depositSignature: string, transactionType?: 'deposit' | 'withdrawal') => Promise<void>
  clearRecovery: () => void
  recoverStuckFunds: () => Promise<{ success: boolean; message: string; instructions?: string[] }>
}

// Fetch confidential balances using the working Encifher Proxy API
async function fetchConfidentialBalances(userPublicKey: string): Promise<Map<string, string>> {
  try {
    console.log('[Confidential Balance] Fetching via API for:', userPublicKey)

    // Use GET request with userPublicKey as query parameter (the working format)
    // Add cache-busting timestamp to force fresh data
    const timestamp = Date.now()

    // Create a timeout controller to prevent hanging requests
    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      console.log('[Confidential Balance] Request timeout, aborting...')
      controller.abort()
    }, 20000) // 20 second timeout - reduced from 60s for better UX

    try {
      const response = await fetch(`/api/v1/confidential/balances?userPublicKey=${encodeURIComponent(userPublicKey)}&t=${timestamp}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (response.ok) {
      const result = await response.json()
      console.log('[Confidential Balance] Successfully fetched balances:', result)
      console.log('[Confidential Balance] Response structure:', {
        hasConfidentialBalances: !!result.confidentialBalances,
        confidentialBalancesType: Array.isArray(result.confidentialBalances) ? 'array' : typeof result.confidentialBalances,
        confidentialBalancesLength: result.confidentialBalances?.length || 0,
        fullResponse: result
      })

      // Convert the response to a Map of balances
      const confidentialBalances = new Map<string, string>()

      if (result.confidentialBalances && Array.isArray(result.confidentialBalances)) {
        result.confidentialBalances.forEach((balance: any) => {
          if (balance.tokenAddress) {
            // Handle special status values for confidential balances
            let balanceAmount: string
            if (balance.amount === 'AUTH_REQUIRED') {
              balanceAmount = 'AUTH_REQUIRED'
            } else if (balance.amount === 'DEPOSITED') {
              balanceAmount = 'DEPOSITED'
            } else {
              balanceAmount = balance.amount.toString()
            }

            // Include balance even if amount is '0' or requires authentication
            // This ensures users know they have tracked confidential tokens
            confidentialBalances.set(balance.tokenAddress, balanceAmount)
          }
        })
      }

      console.log('[Confidential Balance] Processed balances:', {
        totalBalances: confidentialBalances.size,
        balances: Object.fromEntries(confidentialBalances)
      })

      return confidentialBalances
      } else if (response.status === 401) {
        // Handle authentication required response
        console.log('[Confidential Balance] Authentication required for confidential balances')
        try {
          const authData = await response.json()
          console.log('[Confidential Balance] Authentication details:', authData)
          return new Map()
        } catch (jsonError) {
          console.log('[Confidential Balance] Authentication required but could not parse response')
          return new Map()
        }
      } else {
        console.error('[Confidential Balance] Failed to fetch balances:', response.status, response.statusText)
        return new Map()
      }
    } catch (fetchError) {
      clearTimeout(timeoutId)
      if (fetchError.name === 'AbortError') {
        console.warn('[Confidential Balance] Request timed out after 60 seconds')
        return new Map()
      }
      console.error('[Confidential Balance] Network error:', fetchError)
      return new Map()
    }
  } catch (error) {
    console.error('[Confidential Balance] Error fetching via Encifher Proxy API:', error)
    return new Map()
  }
}

// API-based function to track confidential token balances (disabled - no POST endpoint available)
async function updateConfidentialBalance(tokenAddress: string, amount: number, userPublicKey?: string) {
  if (!userPublicKey) return

  console.log('[Confidential Balance] Balance tracking disabled - no POST endpoint available')
  console.log('[Confidential Balance] Balance update would be:', { tokenAddress, amount, userPublicKey })

  // The /api/v1/confidential/balances endpoint only supports GET requests
  // Balance tracking should be handled by the frontend state only
  return
}

// API-based function to subtract confidential token balances (for withdrawals) - disabled
async function subtractConfidentialBalance(tokenAddress: string, amount: number, userPublicKey?: string) {
  if (!userPublicKey) return

  console.log('[Confidential Balance] Balance subtraction disabled - no POST endpoint available')
  console.log('[Confidential Balance] Balance subtraction would be:', { tokenAddress, amount, userPublicKey })

  // The /api/v1/confidential/balances endpoint only supports GET requests
  // Balance tracking should be handled by the frontend state only
  return
}

export function useSwap(privacyMode: boolean, publicKey: PublicKey | null): SwapState & SwapActions {
  console.log('[useSwap] Hook MOUNTED! privacyMode:', privacyMode, 'publicKey:', publicKey?.toString())
  const { connection } = useConnection()
  const { signTransaction, signAllTransactions } = useWallet()
  console.log('[useSwap] After wallet hooks - connection:', !!connection, 'signTransaction:', !!signTransaction)
  const theme = useThemeConfig()

  const debugPrivacyMode = privacyMode // Use actual privacy mode without debug override
  const swapServiceRef = useRef<any>(null)
  const privateSwapServiceRef = useRef<PrivateSwapService | null>(null)
  const defiClientRef = useRef<DefiClient | null>(null)

  // Core swap state - Initialize with empty tokens, will be populated by useEffect
  const [inputToken, setInputToken] = useState<Token | null>(null)
  const [outputToken, setOutputToken] = useState<Token | null>(null)
  const [inputAmount, setInputAmount] = useState('')
  const [outputAmount, setOutputAmount] = useState('')
  const [swapMode, setSwapMode] = useState<SwapMode>(privacyMode ? SwapMode.PRIVATE : SwapMode.NORMAL)
  const [quote, setQuote] = useState<SwapQuote | null>(null)
  const [balances, setBalances] = useState<Map<string, string>>(new Map())
  const [lastDepositSignature, setLastDepositSignature] = useState<string | null>(null)
  const [needsRecovery, setNeedsRecovery] = useState(false)

  // Sync swapMode with privacyMode prop changes
  useEffect(() => {
    const newSwapMode = privacyMode ? SwapMode.PRIVATE : SwapMode.NORMAL
    console.log('useSwap: privacyMode prop changed, updating swapMode from', swapMode, 'to', newSwapMode)
    setSwapMode(newSwapMode)

    // Clear existing quote when switching modes
    setQuote(null)
  }, [privacyMode])

  // UI state
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [structuredError, setStructuredError] = useState<WaveSwapError | null>(null)
  const [progress, setProgress] = useState<SwapProgress | null>(null)
  const [availableTokens, setAvailableTokens] = useState<Token[]>([])

  // Initialize tokens with enriched icons on mount
  useEffect(() => {
    const initializeTokens = async () => {
      const tokens = await getAvailableTokens(privacyMode)
      setAvailableTokens(tokens)

      // Force SOL as Send and WAVE as Receive - create fallback tokens if not found
      const solToken = tokens.find(t => t.address === 'So11111111111111111111111111111111111111112') || {
        address: 'So11111111111111111111111111111111111111112',
        chainId: 101,
        decimals: 9,
        name: 'Solana',
        symbol: 'SOL',
        logoURI: getLocalFallbackIcon('SOL', 'So11111111111111111111111111111111111111112') || '/icons/default-token.svg', // SOL fallback
        tags: ['native', 'solana'],
        isConfidentialSupported: true,
        isNative: true,
        addressable: true
      } as Token

      // Use CASH as receive token for ghost mode, otherwise use WAVE
      const defaultReceiveAddress = theme.name === 'ghost'
        ? 'CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH'
        : '4AGxpKxYnw7g1ofvYDs5Jq2a1ek5kB9jS2NTUaippump'

      const defaultReceiveSymbol = theme.name === 'ghost' ? 'CASH' : 'WAVE'
      const defaultReceiveName = theme.name === 'ghost' ? 'Cash' : 'Wave'
      const defaultReceiveDecimals = theme.name === 'ghost' ? 6 : 6

      const receiveToken = tokens.find(t => t.address === defaultReceiveAddress) || {
        address: defaultReceiveAddress,
        chainId: 101,
        decimals: defaultReceiveDecimals,
        name: defaultReceiveName,
        symbol: defaultReceiveSymbol,
        logoURI: getLocalFallbackIcon(defaultReceiveSymbol, defaultReceiveAddress) || '/icons/default-token.svg',
        tags: ['defi', 'dex'],
        isConfidentialSupported: true,
        isNative: false,
        addressable: true
      } as Token

      // Always set SOL as Send and theme-specific token as Receive
      setInputToken(solToken)
      setOutputToken(receiveToken)
    }

    initializeTokens()
  }, [privacyMode, theme.name]) // Re-run when privacy mode or theme changes

  // Initialize swap service when wallet is connected
  useEffect(() => {
    if (publicKey && connection) {
      try {
        const jupiterApi = JupiterAPI.createClient(connection)

        // Intercept fetch calls to route Encifher API requests and Jupiter API calls through our proxy
        const originalFetch = window.fetch
        window.fetch = async (input, init) => {
          const url = typeof input === 'string' ? input : input.toString()
          let newUrl = url

          // Intercept Encifher API calls and route through our proxy
          if (url.includes('authority.encrypt.trade')) {
            newUrl = url.replace('https://authority.encrypt.trade/api/v1',
              `${window.location.origin}/api/v1/encifher`)
            console.log(`[Fetch Interceptor] Routing Encifher ${url} -> ${newUrl}`)
          }
          // Intercept direct Jupiter API calls and route through our proxy
          else if (url.includes('lite-api.jup.ag') || url.includes('quote.jup.ag') || url.includes('quote-api.jup.ag')) {
            // Route Jupiter API calls through our proxy
            if (url.includes('lite-api.jup.ag/swap/v1/quote')) {
              newUrl = url.replace('https://lite-api.jup.ag/swap/v1/quote',
                `${window.location.origin}/api/v1/jupiter/swap/v1/quote`)
            } else if (url.includes('lite-api.jup.ag/swap/v1/swap')) {
              newUrl = url.replace('https://lite-api.jup.ag/swap/v1/swap',
                `${window.location.origin}/api/v1/jupiter/swap/v1/swap`)
            } else if (url.includes('lite-api.jup.ag/tokens/v2')) {
              newUrl = url.replace('https://lite-api.jup.ag',
                `${window.location.origin}/api/v1/jupiter`)
            } else if (url.includes('quote.jup.ag')) {
              newUrl = url.replace('https://quote.jup.ag/v1/quote',
                `${window.location.origin}/api/v1/jupiter/quote/v1/quote`)
            } else if (url.includes('quote-api.jup.ag/v6')) {
              // Handle old encifher SDK endpoint - route to new endpoint
              newUrl = url.replace('https://quote-api.jup.ag/v6',
                `${window.location.origin}/api/v1/jupiter/swap/v1`)
            } else if (url.includes('/ultra/v1/order')) {
              // Handle encifher SDK ultra endpoint - route to our quote endpoint
              // Extract query parameters and preserve them
              const urlObj = new URL(url)
              const searchParams = urlObj.searchParams.toString()
              newUrl = `${window.location.origin}/api/v1/jupiter/swap/v1/quote${searchParams ? '?' + searchParams : ''}`
            }

            if (newUrl !== url) {
              console.log(`[Fetch Interceptor] Routing Jupiter ${url} -> ${newUrl}`)
            }
          }

          // If we intercepted a call, modify the request
          if (newUrl !== url) {
            // Ensure proper headers for CORS and authentication
            const modifiedInit = {
              ...init,
              headers: {
                ...init?.headers,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                // Add proper User-Agent for Jupiter API
                'User-Agent': 'WaveSwap-Proxy/1.0'
              },
              // Ensure credentials are included for CORS
              credentials: 'include' as RequestCredentials
            }

            try {
              const response = await originalFetch(newUrl, modifiedInit)
              console.log(`[Fetch Interceptor] Response OK: ${response.status} for ${newUrl}`)
              return response
            } catch (error) {
              console.error(`[Fetch Interceptor] Error for ${newUrl}:`, error)
              // Fallback: try original URL (though this may fail due to CORS)
              console.log(`[Fetch Interceptor] Fallback to original URL: ${url}`)
              return originalFetch(url, init)
            }
          }

          return originalFetch(input, init)
        }

        // Initialize Encifher DefiClient for private swaps
        const defiClientConfig: DefiClientConfig = {
          encifherKey: process.env.NEXT_PUBLIC_ENCIFHER_SDK_KEY || '',
          rpcUrl: connection.rpcEndpoint,
          mode: 'Mainnet' // Add required mode property - use "Mainnet" for production
        }
        const defiClient = new DefiClient(defiClientConfig)
        defiClientRef.current = defiClient

        // Initialize PrivateSwapService for enhanced private swap flow (commented out until API is clear)
        // privateSwapServiceRef.current = new PrivateSwapService(connection, null)

        // Integrated wallet adapter with Jupiter API (without Encifher for now)
        swapServiceRef.current = createSwapService({
          connection,
          jupiterApi,
          userPublicKey: publicKey,
          signTransaction: async (tx: Transaction | VersionedTransaction) => {
            if (!signTransaction) {
              throw new Error('Wallet signing function not available')
            }
            try {
              return await signTransaction(tx)
            } catch (error: any) {
              // Handle wallet rejection gracefully
              if (error.name === 'WalletSignTransactionError' ||
                  error.message?.includes('User rejected the request') ||
                  error.message?.includes('rejected')) {
                throw new Error('Transaction cancelled by user')
              }
              throw error
            }
          },
          signAllTransactions: async (txs: (Transaction | VersionedTransaction)[]) => {
            if (!signAllTransactions) {
              throw new Error('Wallet batch signing function not available')
            }
            try {
              return await signAllTransactions(txs)
            } catch (error: any) {
              // Handle wallet rejection gracefully
              if (error.name === 'WalletSignTransactionError' ||
                  error.message?.includes('User rejected the request') ||
                  error.message?.includes('rejected')) {
                throw new Error('Transaction cancelled by user')
              }
              throw error
            }
          },
          onProgress: setProgress
        })

        console.log('Swap service initialized successfully with Jupiter API')
      } catch (error) {
        console.error('Failed to initialize swap service:', error)
        setError('Failed to initialize swap service')
      }
    }
  }, [publicKey, connection, signTransaction, signAllTransactions])

  // Update swap mode when privacy mode changes
  useEffect(() => {
    const newMode = privacyMode ? SwapMode.PRIVATE : SwapMode.NORMAL
    setSwapMode(newMode)
  }, [privacyMode])

  // In confidential mode, we use regular tokens with Encifher privacy wrapper
  const getJupiterToken = (token: Token): string => {
    // Always use the actual token address - Encifher handles the privacy wrapping
    return token.address
  }

  // Filter tokens based on swap mode
  useEffect(() => {
    const loadFilteredTokens = async () => {
      const filtered = await getAvailableTokens(privacyMode)
      setAvailableTokens(filtered)

      // Only update tokens if current ones are not supported in current mode
      // Preserve user selection when possible
      if (inputToken && !filtered.find((t: Token) => t.address === inputToken.address)) {
        const solToken = filtered.find(t => t.address === 'So11111111111111111111111111111111111111112')
        setInputToken(solToken || filtered[0] || null)
      }
      if (outputToken && !filtered.find((t: Token) => t.address === outputToken.address)) {
        const defaultOutputAddress = theme.name === 'ghost'
          ? 'CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH'
          : '4AGxpKxYnw7g1ofvYDs5Jq2a1ek5kB9jS2NTUaippump'

        const defaultOutputToken = filtered.find(t => t.address === defaultOutputAddress)
        setOutputToken(defaultOutputToken || filtered[1] || filtered[0] || null)
      }
    }

    loadFilteredTokens()
  }, [privacyMode, theme.name])

  // Load user's tokens when wallet connects or privacy mode changes
  useEffect(() => {
    console.log('[useSwap] Main wallet effect triggered - publicKey:', publicKey?.toString(), 'connection:', !!connection, 'privacyMode:', privacyMode)
    if (publicKey && connection) {
      console.log('[useSwap] Wallet connected, calling loadUserTokens()...')
      loadUserTokens()
    } else {
      console.log('[useSwap] No wallet connection, loading default tokens...')
      // No wallet, just show defaults
      const loadDefaultTokens = async () => {
        const defaultTokens = await getAvailableTokens(privacyMode)
        console.log('[useSwap] Loaded', defaultTokens.length, 'default tokens')
        setAvailableTokens(defaultTokens)
      }
      loadDefaultTokens()
    }
  }, [publicKey, connection, privacyMode])

  // Load user's wallet tokens
  const loadUserTokens = async () => {
    console.log('[useSwap] loadUserTokens called - publicKey:', publicKey?.toString(), 'connection:', !!connection)
    if (!publicKey || !connection) {
      console.log('[useSwap] loadUserTokens returning early - no publicKey or connection')
      return
    }

    try {
      console.log('[useSwap] Starting to load user tokens...')
      const userTokens = await getUserTokens(connection, publicKey)
      console.log('[useSwap] getUserTokens returned', userTokens.length, 'tokens')

      // Merge with available tokens based on privacy mode
      const tokenMap = new Map<string, Token>()

      // Add confidential tokens if in privacy mode
      if (privacyMode) {
        // First add predefined confidential tokens
        CONFIDENTIAL_TOKENS.forEach(token => tokenMap.set(token.address, token))

        // Then dynamically create confidential tokens for any token with a balance
        const confidentialBalances = await fetchConfidentialBalances(publicKey.toString())
        console.log('[useSwap] Creating dynamic confidential tokens from balances:', confidentialBalances)

        for (const [tokenAddress, balance] of confidentialBalances.entries()) {
          // Only show tokens with actual positive balances (numeric values)
          const hasActualBalance = balance &&
                                   balance !== '0' &&
                                   balance !== 'AUTH_REQUIRED' &&
                                   balance !== 'DEPOSITED' &&
                                   balance !== 'USER_REPORTED' &&
                                   !isNaN(parseFloat(balance)) &&
                                   parseFloat(balance) > 0

          console.log(`[useSwap] Token ${tokenAddress}: balance="${balance}" hasActualBalance=${hasActualBalance}`)

          if (hasActualBalance) {
            // Find the original token from userTokens or COMMON_TOKENS
            const originalToken = userTokens.find(t => t.address === tokenAddress) ||
                               COMMON_TOKENS.find(t => t.address === tokenAddress)

            if (originalToken) {
              // Create confidential version of the token
              const confidentialAddress = `c${tokenAddress}` // Add 'c' prefix
              const confidentialToken: Token = {
                ...originalToken,
                address: confidentialAddress,
                name: `Confidential ${originalToken.name}`,
                symbol: `c${originalToken.symbol}`,
                tags: ['confidential', 'wrapped', ...(originalToken.tags || [])],
                isConfidentialSupported: true,
                isNative: false,
                addressable: false
              }

              console.log('[useSwap] Created dynamic confidential token:', confidentialToken.symbol, 'for original:', originalToken.address)
              tokenMap.set(confidentialAddress, confidentialToken)
            } else {
              // Create a fallback token for unknown tokens from Encifher
              const confidentialAddress = `c${tokenAddress}` // Add 'c' prefix
              const fallbackToken: Token = {
                address: confidentialAddress,
                chainId: 101,
                decimals: 9, // Default decimals
                name: `Confidential Token ${tokenAddress.slice(0, 8)}...`,
                symbol: `c${tokenAddress.slice(0, 6)}...`,
                logoURI: getLocalFallbackIcon('', tokenAddress) || '/icons/default-token.svg',
                tags: ['confidential', 'unknown'],
                isConfidentialSupported: true,
                isNative: false,
                addressable: false,
                // Also create the original token for reference
              }

              console.log('[useSwap] Created fallback confidential token for unknown token:', tokenAddress)
              tokenMap.set(confidentialAddress, fallbackToken)

              // Also add the original token (non-confidential version) for reference
              const originalFallbackToken: Token = {
                ...fallbackToken,
                address: tokenAddress,
                name: fallbackToken.name.replace('Confidential ', ''),
                symbol: fallbackToken.symbol.replace('c', ''),
                tags: ['unknown'],
                isConfidentialSupported: false,
                addressable: true
              }
              tokenMap.set(tokenAddress, originalFallbackToken)
            }
          }
        }
      }

      // Add user tokens
      userTokens.forEach(token => tokenMap.set(token.address, token))

      // Add common tokens
      COMMON_TOKENS.forEach(token => {
        if (!tokenMap.has(token.address)) {
          tokenMap.set(token.address, token)
        }
      })

      const allTokens = Array.from(tokenMap.values())

      // Enrich all tokens with icons from Jupiter API
      const enrichedTokens = await enrichTokenIcons(allTokens)
      setAvailableTokens(enrichedTokens)

      console.log('[useSwap] Loaded', enrichedTokens.length, 'tokens:', enrichedTokens.map(t => t.symbol))
      console.log('[useSwap] About to call refreshBalances() after loading tokens...')
      // Refresh balances after tokens are loaded
      refreshBalances()
    } catch (error) {
      console.error('Error loading user tokens:', error)
      // Fall back to available tokens for current mode
      const fallbackTokens = await getAvailableTokens(privacyMode)
      setAvailableTokens(fallbackTokens)
      console.log('[useSwap] In error fallback, about to call refreshBalances()...')
      // Still try to refresh balances even with fallback tokens
      refreshBalances()
    }
  }

  // Debounced balance refresh to avoid excessive API calls
  useEffect(() => {
    console.log('[useSwap] Debounced effect triggered - publicKey:', !!publicKey, 'inputToken:', inputToken?.symbol, 'outputToken:', outputToken?.symbol)
    const timeoutId = setTimeout(() => {
      if (publicKey && (inputToken || outputToken)) {
        console.log('[useSwap] Debounced timeout calling refreshBalances()...')
        refreshBalances()
      } else {
        console.log('[useSwap] Debounced timeout skipped - no publicKey or tokens')
      }
    }, 500) // 500ms debounce

    return () => clearTimeout(timeoutId)
  }, [publicKey, inputToken, outputToken])

  // Initial balance fetch on wallet connection
  useEffect(() => {
    console.log('[useSwap] Initial balance effect triggered - publicKey:', !!publicKey, 'inputToken:', !!inputToken, 'outputToken:', !!outputToken, 'availableTokens.length:', availableTokens.length)
    if (publicKey && !inputToken && !outputToken && availableTokens.length > 0) {
      console.log('[useSwap] Initial balance fetch starting for top tokens...')
      // Fetch balances for top tokens by default
      const topTokens = availableTokens.slice(0, 6) // Fetch for 6 most common tokens
      fetchMultipleBalances(topTokens).then(newBalances => {
        console.log('[useSwap] Initial balance fetch completed for', newBalances.size, 'tokens')
        setBalances(prev => {
          const merged = new Map(prev)
          newBalances.forEach((balance, address) => {
            merged.set(address, balance)
          })
          return merged
        })
      })
    }
  }, [publicKey, availableTokens])

  const handleSetInputAmount = useCallback((amount: string) => {
    setInputAmount(amount)
    clearQuote()
  }, [])

  const handleSetOutputAmount = useCallback((amount: string) => {
    setOutputAmount(amount)
  }, [])

  const handleSetInputToken = useCallback((token: Token) => {
    setInputToken(token)
    clearQuote()

    if (token.address === outputToken?.address) {
      setOutputToken(inputToken || COMMON_TOKENS[1]!)
    }

    setInputAmount('')
    setOutputAmount('')
  }, [outputToken, inputToken])

  const handleSetOutputToken = useCallback((token: Token) => {
    setOutputToken(token)
    clearQuote()

    if (token.address === inputToken?.address) {
      setInputToken(outputToken || COMMON_TOKENS[0]!)
    }

    setInputAmount('')
    setOutputAmount('')
  }, [inputToken, outputToken])

  const handleSetSwapMode = useCallback((mode: SwapMode) => {
    setSwapMode(mode)
    clearQuote()

    // Check if tokens support the new mode
    if (mode === 'private' && inputToken && outputToken) {
      if (!ServiceSwapUtils.canSwapPrivately(inputToken, outputToken)) {
        setError('One or both tokens do not support private swaps')
      }
    }
  }, [inputToken, outputToken])

  
  const getQuote = useCallback(async () => {
    console.log('[getQuote] Called with privacyMode:', swapMode, 'SwapMode.PRIVATE:', SwapMode.PRIVATE)

    // Always fetch quotes - even in privacy mode we need price estimation
    // The API will route to Encifher or Jupiter based on privacyMode parameter

    // Prevent multiple rapid quote requests
    const now = Date.now()
    if (now - (getQuote as any).lastCall < 1000) { // 1 second debounce
      console.log('Quote request debounced, skipping...')
      return
    }
    (getQuote as any).lastCall = now
    if (!inputToken || !outputToken || !inputAmount || !publicKey) {
      setError('Missing required parameters for quote')
      return
    }

    // Prevent swapping the same token
    if (inputToken.address === outputToken.address) {
      setError('Cannot swap the same token. Please select different input and output tokens.')
      return
    }

    // Validate input amount
    const parsedAmount = parseFloat(inputAmount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Invalid amount')
      return
    }

    try {
      setIsLoading(true)
      setError(null)

      // Format amount as integer (smallest unit) with fallback decimals
      const inputDecimals = inputToken.decimals || 9
      const amountInSmallestUnit = Math.floor(parsedAmount * Math.pow(10, inputDecimals))
      
      // Map confidential tokens to their base tokens for Jupiter
      const jupiterInputMint = getJupiterToken(inputToken)
      const jupiterOutputMint = getJupiterToken(outputToken)
      
      console.log('Getting quote via API:', {
        inputMint: jupiterInputMint,
        outputMint: jupiterOutputMint,
        amount: amountInSmallestUnit.toString(),
        inputSymbol: inputToken.symbol,
        outputSymbol: outputToken.symbol,
        isConfidential: swapMode === 'private',
        originalInputMint: inputToken.address,
        originalOutputMint: outputToken.address
      })

      // In privacy mode, we get a Jupiter quote first for estimation, then use Encifher for execution
      // In normal mode, we use Jupiter API directly
      console.log('getQuote: swapMode is:', swapMode, '(privacyMode:', privacyMode, ')')
      console.log('getQuote: privacyMode type:', typeof privacyMode, 'value:', privacyMode)
      console.log('getQuote: privacyMode.toString():', privacyMode.toString())
      console.log('getQuote: privacyMode === true:', privacyMode === true)
      console.log('getQuote: Boolean(privacyMode):', Boolean(privacyMode))

      // Get Jupiter quote for price estimation (both for privacy and normal mode)
      const quoteUrl = `/api/v1/swap/quote?` + new URLSearchParams({
        inputMint: jupiterInputMint,
        outputMint: jupiterOutputMint,
        amount: amountInSmallestUnit.toString(),
        userPublicKey: publicKey.toString(),
        privacyMode: privacyMode.toString() // Use actual privacyMode prop
      })

      console.log('[useSwap] Fetching quote with URL:', quoteUrl)
      console.log('[useSwap] Privacy mode value:', privacyMode, 'type:', typeof privacyMode)

      const response = await fetch(quoteUrl)

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error')
        console.error('[useSwap] API Error Response:', {
          status: response.status,
          statusText: response.statusText,
          url: quoteUrl,
          errorText
        })

        let errorMessage = `HTTP ${response.status}`
        try {
          const errorData = JSON.parse(errorText)
          errorMessage = errorData.error || errorMessage
        } catch {
          errorMessage = errorText || errorMessage
        }

        throw new Error(errorMessage)
      }

      const data = await response.json()
      console.log('Quote API response:', data)

      if (!data.success || !data.quote) {
        throw new Error(data.error || 'Invalid response from API')
      }

      const jupiterQuote = data.quote

      if (swapMode === 'private') {
        console.log('Using Jupiter quote as estimate for Encifher private swap')
        // Use Jupiter quote as estimate, but mark for private execution
        const privateQuote = {
          ...jupiterQuote,
          privacyMode: true,
          privacySupported: true,
          routing: 'confidential'
        }
        setQuote(privateQuote)

        // Calculate output amount for display - Jupiter returns amounts in smallest units
        const outputDecimals = outputToken.decimals || 9
        const outputAmountHuman = parseFloat(jupiterQuote.outAmount) / Math.pow(10, outputDecimals)
        setOutputAmount(formatTokenAmount(outputAmountHuman, outputDecimals))
        return
      }

      // Normal mode - use Jupiter quote directly
      const newQuote: SwapQuote = {
        inputMint: jupiterQuote.inputMint,
        outputMint: jupiterQuote.outputMint,
        inputAmount: jupiterQuote.inAmount,
        outputAmount: jupiterQuote.outAmount,
        priceImpactPct: parseFloat(jupiterQuote.priceImpactPct) * 100,
        routePlan: jupiterQuote.routePlan
      }

      setQuote(newQuote)

      // Calculate output amount with fallback decimals - Jupiter returns amounts in smallest units
      const outputDecimals = outputToken.decimals || 9
      const output = parseFloat(newQuote.outputAmount) / Math.pow(10, outputDecimals)
      setOutputAmount(formatTokenAmount(output, outputDecimals))

    } catch (error) {
      console.error('Error getting quote:', error)

      // Handle rate limit errors more gracefully
      if (error instanceof Error) {
        let errorMessage = error.message
        let shouldRetry = false
        let retryDelay = 3000

        // Check for various rate limit and service unavailable errors
        if (error.message.includes('Rate limit exceeded') ||
            error.message.includes('429') ||
            error.message.includes('Jupiter API returned status 429') ||
            error.message.includes('Swap service is experiencing high demand') ||
            error.message.includes('Private swap service is temporarily unavailable')) {

          errorMessage = error.message.includes('Private swap service')
            ? 'Private swap service is experiencing high demand. Please try again shortly.'
            : 'Swap service is experiencing high demand. Please wait a moment and try again.'

          shouldRetry = true
          retryDelay = 4000 // Longer delay for privacy mode
        }

        setError(errorMessage)

        // Retry logic for rate limiting
        if (shouldRetry && inputAmount && parseFloat(inputAmount) > 0 && inputToken && outputToken && publicKey) {
          setTimeout(() => {
            setError(null)
            getQuote()
          }, retryDelay)
        }
        return
      }

      // For non-rate-limit errors, use the regular error parser
      const parsedError = parseError(error)
      setStructuredError(parsedError)
      setError(parsedError.message)
    } finally {
      setIsLoading(false)
    }
  }, [inputToken, outputToken, inputAmount, publicKey, swapMode])

  const swap = useCallback(async () => {
    if (!inputToken || !outputToken || !inputAmount || !publicKey) {
      const err = new Error('Missing swap parameters')
      const parsedError = parseError(err)
      setStructuredError(parsedError)
      setError(parsedError.message)
      return
    }

    try {
      setIsLoading(true)
      setError(null)
      setStructuredError(null)
      setProgress(null)

      console.log('Executing swap:', {
        inputToken: inputToken.symbol,
        outputToken: outputToken.symbol,
        amount: inputAmount,
        privacyMode: swapMode,
        provider: swapMode === 'private' ? 'Encifher' : 'Jupiter'
      })

      // Private swap mode - real implementation with Encifher SDK
      if (swapMode === SwapMode.PRIVATE) {
        console.log('[Private Swap] Executing real confidential swap...')

        if (!process.env.NEXT_PUBLIC_ENCIFHER_SDK_KEY) {
          throw new Error('Encifher SDK key not configured')
        }

        if (!defiClientRef.current) {
          throw new Error('Encifher client not initialized')
        }

        const defiClient = defiClientRef.current

        // Update progress for private swap
        setProgress({
          status: 'pending' as any,
          message: 'Initializing private swap...',
          currentStep: 1,
          totalSteps: 5
        })

        try {
          // Real Encifher SDK implementation - 3 step process: Deposit → Swap → Withdraw
          console.log('[Private Swap] Using real Encifher SDK workflow')

          const amountInBaseUnits = Math.floor(parseFloat(inputAmount) * Math.pow(10, inputToken.decimals))
          const amountInTokenUnits = amountInBaseUnits.toString()

          console.log('[Private Swap] Encifher swap parameters:', {
            inputToken: inputToken.address,
            outputToken: outputToken.address,
            inputAmount: inputAmount,
            amountInBaseUnits: amountInBaseUnits.toString(),
            amountInTokenUnits: amountInTokenUnits,
            decimals: inputToken.decimals
          })

          // Convert to Encifher token format
          const inputTokenEncifher: EncifherToken = {
            tokenMintAddress: inputToken.address,
            decimals: inputToken.decimals
          }
          const outputTokenEncifher: EncifherToken = {
            tokenMintAddress: outputToken.address,
            decimals: outputToken.decimals
          }

          // Step 1: Get swap quote from Encifher
          setProgress({
            status: 'pending' as any,
            message: 'Getting private swap quote...',
            currentStep: 1,
            totalSteps: 4
          })

          const quote = await defiClient.getSwapQuote({
            inMint: inputTokenEncifher.tokenMintAddress,
            outMint: outputTokenEncifher.tokenMintAddress,
            amountIn: amountInBaseUnits.toString()
          })

          console.log('[Private Swap] Encifher quote received:', quote)

          // Store deposit signature for recovery purposes
          let depositSignature: string | undefined

          // Step 2: Build and sign deposit transaction (if user hasn't deposited)
          setProgress({
            status: 'pending' as any,
            message: 'Preparing deposit transaction...',
            currentStep: 2,
            totalSteps: 4
          })

          const depositParams: DepositParams = {
            token: inputTokenEncifher,
            depositor: new PublicKey(publicKey),
            amount: amountInTokenUnits
          }

          // Build swap transaction
          const swapParams = {
            inMint: inputTokenEncifher.tokenMintAddress,
            outMint: outputTokenEncifher.tokenMintAddress,
            amountIn: amountInBaseUnits.toString(),
            senderPubkey: new PublicKey(publicKey),
            receiverPubkey: new PublicKey(publicKey)
          }

          // Get both deposit and swap transactions
          const depositTxn = await defiClient.getDepositTxn(depositParams)
          const swapTxn = await defiClient.getSwapTxn(swapParams)

          console.log('[Private Swap] Transactions built successfully')

          // Step 3: Execute transactions
          setProgress({
            status: 'pending' as any,
            message: 'Executing private swap...',
            currentStep: 3,
            totalSteps: 4
          })

          // Sign and execute deposit transaction (following documentation example)
          if (!signTransaction) {
            throw new Error('Wallet does not support transaction signing')
          }

          console.log('[Private Swap] Starting deposit transaction signing...')
          let signedDepositTxn
          try {
            // Add timeout to prevent hanging
            signedDepositTxn = await Promise.race([
              signTransaction(depositTxn),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Transaction signing timed out after 30 seconds')), 30000)
              )
            ])
            console.log('[Private Swap] Deposit transaction signed successfully')
          } catch (signError) {
            console.error('[Private Swap] Failed to sign deposit transaction:', signError)
            throw new Error(`Failed to sign deposit transaction: ${signError.message}`)
          }

          // Get latest blockhash for transaction using server-side proxy to avoid client-side timeout issues
          console.log('[Private Swap] Getting latest blockhash via server proxy...')

          const blockhashResponse = await Promise.race([
            fetch('/api/v1/blockhash'),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Failed to get blockhash from server: timeout after 30 seconds')), 30000)
            )
          ])

          if (!blockhashResponse.ok) {
            throw new Error(`Blockhash API error: ${blockhashResponse.status} - ${blockhashResponse.statusText}`)
          }

          const blockhashData = await blockhashResponse.json()

          if (!blockhashData.success) {
            throw new Error(`Blockhash API failed: ${blockhashData.error}`)
          }

          const {
            context: { slot: minContextSlot },
            blockhash,
            lastValidBlockHeight,
          } = blockhashData

          console.log('[Private Swap] Blockhash received via proxy:', blockhash)
          console.log('[Private Swap] Latest blockhash received')

          console.log('[Private Swap] Sending deposit transaction via server proxy...')

          // Use server-side proxy to avoid client-side network timeouts
          const depositSendResponse = await Promise.race([
            fetch('/api/v1/send-transaction', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              body: JSON.stringify({
                serializedTransaction: signedDepositTxn.serialize().toString('base64'),
                minContextSlot,
                preflightCommitment: 'confirmed',
                maxRetries: 3
              })
            }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Failed to send deposit transaction: timeout after 45 seconds')), 45000)
            )
          ])

          if (!depositSendResponse.ok) {
            const errorText = await depositSendResponse.text()
            throw new Error(`Deposit transaction API error: ${depositSendResponse.status} - ${errorText}`)
          }

          const depositResult = await depositSendResponse.json()

          if (!depositResult.success) {
            throw new Error(`Deposit transaction failed: ${depositResult.error}`)
          }

          depositSignature = depositResult.signature
          console.log('[Private Swap] Deposit transaction sent via proxy:', depositSignature)

          // Confirm deposit transaction with proper block height checking (as per documentation)
          let depositConfirmation
          let retryCount = 0
          const maxRetries = 5

          while (retryCount < maxRetries) {
            try {
              console.log(`[Private Swap] Confirming deposit transaction (attempt ${retryCount + 1}/${maxRetries})`)
              setProgress({
                status: SwapStatus.CONFIRMING_TRANSACTION,
                message: `Confirming deposit transaction (attempt ${retryCount + 1}/${maxRetries})...`,
                currentStep: 2,
                totalSteps: 4
              })

              // Use proper confirmation strategy as shown in documentation
              const confirmationResult = await connection.confirmTransaction({
                signature: depositSignature,
                blockhash,
                lastValidBlockHeight,
                abortSignal: AbortSignal.timeout(120000) // 2 minute timeout
              }, 'confirmed')

              console.log('[Private Swap] Deposit transaction confirmed successfully:', confirmationResult)
              depositConfirmation = confirmationResult
              break // Success, exit retry loop

            } catch (error: any) {
              retryCount++
              console.error(`[Private Swap] Deposit confirmation attempt ${retryCount} failed:`, error.message)

              // Check if it's a timeout error (catch various timeout durations)
              const isTimeout = error.message.includes('timeout') ||
                               error.message.includes('seconds') &&
                               error.message.includes('not confirmed') ||
                               error.message.includes('Transaction was not confirmed')

              if (retryCount >= maxRetries) {
                console.log('[Private Swap] All confirmation attempts failed, checking final transaction status...')
                setProgress({
                  status: SwapStatus.CONFIRMING_TRANSACTION,
                  message: 'Checking transaction status on-chain...',
                  currentStep: 2,
                  totalSteps: 4
                })

                try {
                  // Final status check without timeout
                  const status = await connection.getSignatureStatus(depositSignature, {
                    searchTransactionHistory: true
                  })

                  if (status.value) {
                    console.log('[Private Swap] Final transaction status:', status.value)

                    if (status.value.err) {
                      throw new Error(`Deposit transaction failed: ${JSON.stringify(status.value.err)}`)
                    } else if (status.value.confirmationStatus === 'confirmed' || status.value.confirmationStatus === 'finalized') {
                      console.log('[Private Swap] ✓ Transaction was confirmed despite timeouts!')
                      depositConfirmation = { value: { err: null } }
                      break
                    } else {
                      // Transaction exists but not confirmed yet
                      console.log('[Private Swap] Transaction found but not fully confirmed, setting recovery state')
                      setLastDepositSignature(depositSignature)
                      setNeedsRecovery(true)
                      throw new Error(`Transaction submitted but confirmation pending. Signature: ${depositSignature}. Transaction may still process. Check Solana Explorer for updates.`)
                    }
                  } else {
                    // Transaction not found - may still be processing or failed
                    console.log('[Private Swap] Transaction not found on-chain, setting recovery state')
                    setLastDepositSignature(depositSignature)
                    setNeedsRecovery(true)

                    if (isTimeout) {
                      throw new Error(`Transaction confirmation timed out after ${maxRetries} attempts. Your transaction may still be processing. Signature: ${depositSignature}. Use the recovery tool to check status.`)
                    } else {
                      throw new Error(`Transaction not found on-chain after ${maxRetries} attempts. Signature: ${depositSignature}. Use the recovery tool to check status.`)
                    }
                  }
                } catch (statusError: any) {
                  console.error('[Private Swap] Final status check failed:', statusError.message)
                  setLastDepositSignature(depositSignature)
                  setNeedsRecovery(true)

                  if (isTimeout) {
                    throw new Error(`Transaction confirmation timed out. Your transaction was sent but confirmation timed out. Signature: ${depositSignature}. Funds are safe - use the recovery tool to check status.`)
                  } else {
                    throw new Error(`Deposit confirmation failed after ${maxRetries} attempts. Recovery options available. Error: ${statusError.message}`)
                  }
                }
              }

              // Wait before retry with longer delays for timeouts
              const delay = isTimeout ? 8000 : Math.pow(2, retryCount) * 1000 // 8s for timeouts, exponential for others
              console.log(`[Private Swap] Waiting ${delay/1000}s before retry...`)
              await new Promise(resolve => setTimeout(resolve, delay))
            }
          }

          if (!depositConfirmation || depositConfirmation.value.err) {
            throw new Error(`Deposit failed: ${depositConfirmation?.value?.err || 'Confirmation failed'}`)
          }

          // Sign and execute swap transaction
          console.log('[Private Swap] Starting swap transaction signing...')
          let signedSwapTxn
          try {
            // Add timeout to prevent hanging
            signedSwapTxn = await Promise.race([
              signTransaction(swapTxn),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Swap transaction signing timed out after 30 seconds')), 30000)
              )
            ])
            console.log('[Private Swap] Swap transaction signed successfully')
          } catch (signError) {
            console.error('[Private Swap] Failed to sign swap transaction:', signError)
            throw new Error(`Failed to sign swap transaction: ${signError.message}`)
          }

          const signedSwapParams: SignedSwapParams = {
            serializedTxn: Buffer.from(signedSwapTxn.serialize()).toString('base64'),
            orderDetails: {
              inMint: inputTokenEncifher.tokenMintAddress,
              outMint: outputTokenEncifher.tokenMintAddress,
              amountIn: amountInBaseUnits.toString(),
              senderPubkey: new PublicKey(publicKey),
              receiverPubkey: new PublicKey(publicKey),
              message: `Private swap ${inputToken.symbol} to ${outputToken.symbol}`
            }
          }

          // Execute swap transaction using our API endpoint (not direct SDK call)
          console.log('[Private Swap] Executing swap via API...')
          const executeResponse = await Promise.race([
            fetch('/api/v1/swap/execute-private', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              body: JSON.stringify(signedSwapParams)
            }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Swap execution API timeout after 60 seconds')), 60000)
            )
          ])

          if (!executeResponse.ok) {
            const errorData = await executeResponse.text()
            throw new Error(`Execute swap API error: ${executeResponse.status} - ${errorData}`)
          }

          const executeData = await executeResponse.json()
          console.log('[Private Swap] Swap executed via API:', executeData)

          // Step 4: Poll for completion
          setProgress({
            status: 'pending' as any,
            message: 'Confirming private swap completion...',
            currentStep: 4,
            totalSteps: 4
          })

          let completed = false
          let attempts = 0
          const maxAttempts = 30 // Poll for up to 30 seconds

          while (!completed && attempts < maxAttempts) {
            const orderStatusParams: OrderStatusParams = {
              orderStatusIdentifier: executeData.orderStatusIdentifier
            }

            // Poll order status using our API endpoint (not direct SDK call)
            const statusResponse = await fetch('/api/v1/swap/order-status', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              body: JSON.stringify(orderStatusParams)
            })

            if (!statusResponse.ok) {
              const errorData = await statusResponse.text()
              throw new Error(`Order status API error: ${statusResponse.status} - ${errorData}`)
            }

            const status = await statusResponse.json()
            console.log(`[Private Swap] Order status (attempt ${attempts + 1}):`, status)

            if (status.status === 'completed') {
              completed = true
              setProgress({
                status: 'success' as any,
                message: `Private swap completed! Order ID: ${String(executeData.orderStatusIdentifier).slice(0, 12)}...`,
                currentStep: 4,
                totalSteps: 4
              })
              break
            } else if (status.status === 'failed') {
              throw new Error(`Private swap failed: ${status.status}`)
            }

            await new Promise(resolve => setTimeout(resolve, 1000)) // Wait 1 second between polls
            attempts++
          }

          if (!completed) {
            throw new Error('Private swap timed out waiting for completion')
          }

          // Clear progress after showing completion
          setTimeout(() => {
            setProgress(null)
          }, 5000)

          console.log('[Private Swap] Real private swap completed successfully')

          // Update confidential balance tracking for withdraw tab
          await updateConfidentialBalance(outputToken.address, parseFloat(outputAmount), publicKey?.toString())

          // Return successful result
          const result: SwapQuote = {
            inputMint: inputToken.address,
            outputMint: outputToken.address,
            inputAmount: inputAmount,
            outputAmount: quote.amountOut || '0',
            priceImpactPct: 0, // Encifher doesn't provide price impact in the same format
            routePlan: [],
            swapTransaction: String(executeData.orderStatusIdentifier),
            fee: {
              amount: '0',
              mint: 'So11111111111111111111111111111111111111112',
              pct: '0'
            }
          }

          clearBalanceCache()

          // Trigger balance refresh after successful private swap
          console.log('[Private Swap] Triggering balance refresh after successful swap')
          setTimeout(() => {
            refreshBalances()
          }, 3000) // Wait 3 seconds for blockchain state to update

          return result

        } catch (error) {
          console.error('[Private Swap] Error in real private swap:', error)
          setProgress(null)

          // Check if this is a timeout error that should trigger recovery
          const errorMessage = error instanceof Error ? error.message : String(error)
          const isTimeoutError = errorMessage.includes('timeout') ||
                                errorMessage.includes('TransactionExpiredTimeoutError') ||
                                errorMessage.includes('recovery options available') ||
                                errorMessage.includes('not found after timeout')

          if (isTimeoutError) {
            console.log('[Private Swap] Timeout error detected, setting recovery state')

            // Use the last deposit signature from state
            if (lastDepositSignature) {
              const signatureToUse = lastDepositSignature
              setLastDepositSignature(signatureToUse)
              setNeedsRecovery(true)

              // Set recovery error state
              const timeoutErrorDetails: WaveSwapError = {
                type: 'TIMEOUT' as any,
                message: 'Transaction timeout detected. Your deposit was sent but confirmation timed out. Recovery options are available.',
                details: `Deposit Transaction: ${signatureToUse}\nInput Token: ${inputToken.address}\nOutput Token: ${outputToken.address}\nAmount: ${inputAmount}\nError: ${errorMessage}\nTimestamp: ${new Date().toISOString()}`,
                canRetry: true,
                action: 'Use the recoverTransaction function to check status and recover funds'
              }
              setStructuredError(timeoutErrorDetails)

              // Show timeout-specific recovery guidance
              alert(`⏰ TRANSACTION TIMEOUT DETECTED\n\nYour private swap deposit was sent but confirmation timed out.\n\nDeposit Transaction: ${signatureToUse.slice(0, 12)}...\n\nRecovery Options:\n1. Check your transaction on Solana Explorer\n2. Try the "Recover Transaction" button in the app\n3. Funds should be recoverable as confidential tokens\n\nYour deposit was successful and recovery is available.`)
            }
          } else {
            // 🚨 CRITICAL: Fund Recovery Logic for other errors
            console.error('🚨 FUND LOSS DETECTED: Private swap failed after deposit')
            console.error('Transaction deposit was confirmed but swap execution failed')
            console.error('Funds may be held by Encifher system')
            console.error('Error details:', error)

            // Set critical error state using the correct WaveSwapError structure
            const errorDetails: WaveSwapError = {
              type: 'TRANSACTION' as any, // Using a custom error type
              message: 'Critical Error: Your private swap failed. Your funds may be held by Encifher system.',
              details: `Input Token: ${inputToken.address}\nOutput Token: ${outputToken.address}\nAmount: ${inputAmount}\nError: ${errorMessage}\nTimestamp: ${new Date().toISOString()}`,
              canRetry: false,
              action: 'Contact Encifher support immediately with your wallet address'
            }
            setStructuredError(errorDetails)

            // Show recovery guidance
            alert(`🚨 PRIVATE SWAP FAILED 🚨\n\nYour private swap encountered an error during execution.\n\nError: ${errorMessage}\n\nNext Steps:\n1. Check your Encifher account balance\n2. Contact Encifher support: support@encrypt.trade\n3. Your wallet address: ${publicKey}\n4. Your funds may be recoverable as confidential tokens\n\nNote: Your USDC deposit was successful and should be available as confidential tokens.`)
          }

          throw new Error(`Private swap failed: ${errorMessage}`)
        }
      } else if (swapServiceRef.current) {
        // Use regular swap service for normal mode
        const request: SwapRequest = {
          inputToken,
          outputToken,
          inputAmount,
          privacyMode: false,
          privacyProvider: undefined
        }

        const result = await swapServiceRef.current.executeSwap(request)
        return result
      } else {
        throw new Error('Swap service not available')
      }

    } catch (error) {
      console.error('Error executing swap:', error)
      const parsedError = parseError(error)
      setStructuredError(parsedError)
      setError(parsedError.message)
    } finally {
      setIsLoading(false)
      setProgress(null)
    }
  }, [inputToken, outputToken, inputAmount, swapMode, publicKey])

  // Optimized batch balance fetching
  const fetchMultipleBalances = useCallback(async (tokens: Token[]): Promise<Map<string, string>> => {
    console.log(`[useSwap] fetchMultipleBalances called with ${tokens.length} tokens`)
    console.log(`[useSwap] publicKey: ${publicKey?.toString()}`)
    console.log(`[useSwap] connection: ${!!connection}`)

    if (!publicKey || !connection || tokens.length === 0) {
      console.log(`[useSwap] Returning empty Map - missing:`, {
        publicKey: !!publicKey,
        connection: !!connection,
        tokensCount: tokens.length
      })
      return new Map()
    }

    const balancePromises = tokens.map(async (token, index) => {
      try {
        console.log(`[useSwap] Starting balance fetch for token ${index + 1}/${tokens.length}: ${token.address} (${token.symbol})`)
        const balance = await getTokenBalance(connection, publicKey, token.address)
        console.log(`[useSwap] ✅ Balance fetched for ${token.symbol}: ${balance}`)
        return [token.address, balance] as [string, string]
      } catch (error) {
        console.error(`[useSwap] ❌ Failed to fetch balance for ${token.address} (${token.symbol}):`, error)
        return [token.address, '0'] as [string, string]
      }
    })

    const results = await Promise.allSettled(balancePromises)
    const newBalances = new Map<string, string>()

    console.log(`[useSwap] Processing ${results.length} balance fetch results...`)
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        const [address, balance] = result.value
        newBalances.set(address, balance)
        console.log(`[useSwap] ✅ Result ${index}: ${address} -> ${balance}`)
      } else {
        console.error(`[useSwap] ❌ Balance fetch failed:`, result)
      }
    })

    console.log(`[useSwap] Final balances Map created with ${newBalances.size} entries:`, Object.fromEntries(newBalances))
    return newBalances
  }, [publicKey, connection])

  const refreshBalances = useCallback(async () => {
    console.log('[refreshBalances] Called with publicKey:', publicKey?.toString())
    if (!publicKey || !connection) {
      console.log('[refreshBalances] No publicKey or connection, clearing balances')
      setBalances(new Map())
      return
    }

    console.log('[refreshBalances] Starting balance refresh for:', publicKey.toString())
    // Clear SOL balance cache to ensure fresh data
    clearBalanceCache()
    console.log('[refreshBalances] Balance cache cleared')

    try {
      // Get user's tokens from wallet
      const userTokens = await getUserTokens(connection, publicKey)

      // Update available tokens with user's holdings
      if (userTokens.length > 0) {
        // Merge user tokens with common tokens (prioritize user tokens)
        const tokenMap = new Map<string, Token>()

        // Add user tokens first
        userTokens.forEach(token => tokenMap.set(token.address, token))

        // Add common tokens that aren't already in user's wallet
        COMMON_TOKENS.forEach(token => {
          if (!tokenMap.has(token.address)) {
            tokenMap.set(token.address, token)
          }
        })

        const mergedTokens = Array.from(tokenMap.values())

        // Enrich tokens with icons from Jupiter API
        const enrichedTokens = await enrichTokenIcons(mergedTokens)
        setAvailableTokens(enrichedTokens)
      }

      // Batch fetch balances for currently selected tokens + SOL (to ensure SOL balance is always available)
      const tokensToCheck = [inputToken, outputToken].filter((token): token is Token => token !== null)

      // Always include SOL in balance checking if not already included
      const solToken = COMMON_TOKENS.find(token => token.address === 'So11111111111111111111111111111111111111112')
      if (solToken && !tokensToCheck.some(token => token.address === solToken.address)) {
        tokensToCheck.push(solToken)
      }

      if (tokensToCheck.length > 0) {
        const newBalances = await fetchMultipleBalances(tokensToCheck)
        setBalances(prev => {
          // Merge with existing balances to preserve other cached balances
          const merged = new Map(prev)
          newBalances.forEach((balance, address) => {
            merged.set(address, balance)
          })
          return merged
        })
      }

      // Also fetch confidential balances for the user
      if (publicKey) {
        try {
          const confidentialBalances = await fetchConfidentialBalances(publicKey.toString())

          // Merge confidential balances with regular balances (confidential take precedence)
          // But don't overwrite real balances with AUTH_REQUIRED status
          setBalances(prev => {
            const merged = new Map(prev)
            confidentialBalances.forEach((balance, address) => {
              // Only overwrite if:
              // 1. The confidential balance is a real number, OR
              // 2. The current balance is not a real number (like '0' or missing)
              const currentBalance = prev.get(address)
              const isConfidentialRealBalance = balance !== 'AUTH_REQUIRED' && balance !== 'DEPOSITED'
              const isCurrentRealBalance = currentBalance && currentBalance !== 'AUTH_REQUIRED' && currentBalance !== 'DEPOSITED' && currentBalance !== '0'

              // Debug logging for SOL specifically
              if (address === 'So11111111111111111111111111111111111111112') {
                console.log(`[Balance Merge] SOL: current=${currentBalance}, confidential=${balance}, isConfidentialReal=${isConfidentialRealBalance}, isCurrentReal=${isCurrentRealBalance}`)
              }

              if (isConfidentialRealBalance || !isCurrentRealBalance) {
                merged.set(address, balance)
              }
            })
            return merged
          })
        } catch (confidentialError) {
          console.error('[Confidential Balance] Failed to fetch confidential balances:', confidentialError)
          // Don't fail the entire refresh if confidential balances fail
        }
      }
    } catch (error) {
      console.error('Error refreshing balances:', error)
      setBalances(new Map())
    }
  }, [publicKey, connection, inputToken, outputToken])

  const clearQuote = useCallback(() => {
    setQuote(null)
    setOutputAmount('')
  }, [])

  const clearError = useCallback(() => {
    setError(null)
    setStructuredError(null)
  }, [])

  const cancelSwap = useCallback(() => {
    if (swapServiceRef.current) {
      swapServiceRef.current.cancelSwap()
    }
    setIsLoading(false)
    setProgress(null)
  }, [])

  // Auto-fetch quote when amount changes (with debounce)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputAmount && parseFloat(inputAmount) > 0 && inputToken && outputToken && publicKey) {
        getQuote()
      }
    }, 1500) // Increased from 800ms to 1.5s to avoid rate limiting

    return () => clearTimeout(timer)
  }, [inputAmount, inputToken, outputToken, publicKey, getQuote])

  // Refresh balances when wallet connects or publicKey changes
  useEffect(() => {
    if (publicKey && connection) {
      console.log('[useSwap] Wallet connected, refreshing balances for:', publicKey.toString())
      // Force immediate balance refresh
      refreshBalances()

      // Also force a second refresh after a short delay to ensure SOL balance is caught
      setTimeout(() => {
        refreshBalances()
      }, 2000)
    }
  }, [publicKey, connection, refreshBalances])

  // Withdraw confidential tokens back to regular tokens
  const withdrawConfidentialTokens = useCallback(async (
    tokenAddress: string,
    amount: number
  ): Promise<{ signature: string }> => {
    if (!publicKey) {
      throw new Error('Wallet not connected')
    }

    try {
      console.log('[Confidential Withdrawal] Starting withdrawal:', {
        tokenAddress,
        amount,
        userAddress: publicKey.toString()
      })

      setProgress({
        status: SwapStatus.BUILDING_TRANSACTION,
        message: 'Preparing withdrawal request...',
        currentStep: 1,
        totalSteps: 2
      })

          // According to Encifher docs, send the amount in token units (display format), NOT base units
      // For USDC: 4.56 should be sent as "4.56"
      // For SOL: 0.01 should be sent as "0.01"

      // Get token decimals from available tokens for dynamic support
      const getTokenDecimals = (tokenAddress: string): number => {
        // Try to find token in availableTokens
        const token = availableTokens.find(t => t.address === tokenAddress)
        if (token && token.decimals) {
          return token.decimals
        }

        // Fallback to known token decimals
        const knownDecimals: { [key: string]: number } = {
          'So11111111111111111111111111111111111111112': 9,  // SOL
          'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 6,  // USDC
          'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 6,  // USDT
          'A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS': 8,  // ZEC
          'pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn': 6,  // PUMP
          '4AGxpKxYnw7g1ofvYDs5Jq2a1ek5kB9jS2NTUaippump': 6,  // WAVE
          'CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH': 6,  // CASH
          'BSxPC3Vu3X6UCtEEAYyhxAEo3rvtS4dgzzrvnERDpump': 9,  // WEALTH
          'J2eaKn35rp82T6RFEsNK9CLRHEKV9BLXjedFM3q6pump': 9,  // FTP
          'DtR4D9FtVoTX2569gaL837ZgrB6wNjj6tkmnX9Rdk9B2': 9,  // AURA
          'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5': 9,  // MEW
          'FLJYGHpCCcfYUdzhcfHSeSd2peb5SMajNWaCsRnhpump': 9   // STORE
        }

        return knownDecimals[tokenAddress] || 9 // Default to 9 decimals
      }

      const tokenDecimals = getTokenDecimals(tokenAddress)

      const requestBody = {
        mint: tokenAddress,
        amount: amount.toString(), // Send decimal amount in token units
        userPublicKey: publicKey.toString(),
        decimals: tokenDecimals // Dynamic decimals based on token
      }

      console.log('[Confidential Withdrawal] Sending request body:', {
        ...requestBody,
        tokenDecimals,
        note: 'Dynamic token support enabled'
      })
      console.log('[Confidential Withdrawal] Amount details:', {
        amount,
        amountType: typeof amount,
        tokenDecimals,
        tokenAddress
      })

      let response
      try {
        response = await fetch('/api/v1/withdraw', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(requestBody)
        })
      } catch (fetchError) {
        console.error('[Confidential Withdrawal] Network error during fetch:', fetchError)
        throw new Error(`Failed to connect to withdrawal service: ${fetchError.message}`)
      }

      if (!response.ok) {
        const errorData = await response.text()
        let errorMessage = `Withdrawal API error: ${response.status}`

        try {
          const parsedError = JSON.parse(errorData)

          // Handle specific error types with user-friendly messages
          if (parsedError.error?.includes('temporarily unavailable') && parsedError.isNetworkError) {
            errorMessage = `Encifher service is temporarily unavailable. Please try again in a few minutes.`
          } else if (response.status === 503) {
            errorMessage = `Service temporarily unavailable. Please try again later.`
          } else if (parsedError.error) {
            errorMessage = parsedError.error
          } else {
            errorMessage += ` - ${errorData}`
          }
        } catch {
          errorMessage += ` - ${errorData}`
        }

        throw new Error(errorMessage)
      }

      const withdrawData = await response.json()
      console.log('[Confidential Withdrawal] Withdraw transaction prepared:', withdrawData)

      setProgress({
        status: SwapStatus.SIGNING_TRANSACTION,
        message: 'Please sign withdrawal transaction...',
        currentStep: 2,
        totalSteps: 2
      })

      // Sign and execute the withdrawal transaction
      if (withdrawData.serializedTransaction) {
        if (!signTransaction) {
          throw new Error('Wallet does not support transaction signing')
        }
        try {
          // Deserialize the transaction
          const transaction = Transaction.from(Buffer.from(withdrawData.serializedTransaction, 'base64'))

          console.log('[Confidential Withdrawal] Transaction details before signing:', {
            instructions: transaction.instructions.length,
            feePayer: transaction.feePayer?.toString(),
            recentBlockhash: transaction.recentBlockhash,
            signers: transaction.signatures.map(sig => sig.publicKey.toString())
          })

          // CRITICAL: Don't modify the transaction prepared by Encifher
          // The Encifher SDK prepares the transaction with all required accounts and signatures
          // We should only sign it with the user's wallet

          // Verify the fee payer is correct (should be user's wallet)
          if (!transaction.feePayer || !transaction.feePayer.equals(publicKey)) {
            console.warn('[Confidential Withdrawal] Transaction fee payer is not the user wallet, but this may be expected for Encifher transactions')
          }

          console.log('[Confidential Withdrawal] Using Encifher-prepared transaction without modification:', {
            feePayer: transaction.feePayer?.toString(),
            recentBlockhash: transaction.recentBlockhash
          })

          // Sign the transaction using the wallet adapter without modifying it
          const signedTransaction = await signTransaction(transaction)

          console.log('[Confidential Withdrawal] Transaction signed successfully:', {
            signatures: signedTransaction.signatures.map(sig => ({
              publicKey: sig.publicKey.toString(),
              signature: sig.signature ? 'present' : 'missing'
            })),
            totalSignatures: signedTransaction.signatures.length,
            feePayer: signedTransaction.feePayer?.toString()
          })

          // Verify the fee payer signed the transaction
          const feePayerSignature = signedTransaction.signatures.find(
            sig => sig.publicKey.equals(publicKey)
          )

          if (!feePayerSignature || !feePayerSignature.signature) {
            throw new Error('Transaction missing fee payer signature')
          }

          console.log('[Confidential Withdrawal] Fee payer signature verified')

          // Serialize and send the transaction
          const serializedTx = signedTransaction.serialize()
          console.log('[Confidential Withdrawal] Transaction serialized, size:', serializedTx.length)

          const signature = await connection.sendRawTransaction(serializedTx, {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
            maxRetries: 3
          })

          console.log('[Confidential Withdrawal] Transaction sent:', signature)

          // Wait for confirmation
          setProgress({
            status: SwapStatus.CONFIRMING_TRANSACTION,
            message: `Confirming withdrawal transaction (${signature.slice(0, 8)}...)...`,
            currentStep: 3,
            totalSteps: 3
          })

          console.log('[Confidential Withdrawal] Confirming transaction:', signature)

          const confirmation = await connection.confirmTransaction(signature, 'confirmed')

          console.log('[Confidential Withdrawal] Transaction confirmation result:', confirmation)

          if (confirmation.value.err) {
            console.error('[Confidential Withdrawal] Transaction failed:', confirmation.value.err)
            throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`)
          }

          console.log('[Confidential Withdrawal] Transaction confirmed successfully:', signature)

          // Update tracked confidential balance after successful withdrawal
          subtractConfidentialBalance(tokenAddress, amount, publicKey?.toString())

          // Clear balance cache and refresh balances after successful withdrawal
          console.log('[Confidential Withdrawal] Clearing balance cache and refreshing token balances')
          clearBalanceCache()

          // Clear the specific token balance from the current state immediately
          setBalances(prev => {
            const newBalances = new Map(prev)
            newBalances.delete(tokenAddress) // Remove the withdrawn token from cache
            return newBalances
          })

          // Trigger a full balance refresh after a short delay to allow blockchain to update
          setTimeout(() => {
            console.log('[Confidential Withdrawal] Triggering balance refresh')
            refreshBalances()
          }, 2000) // Wait 2 seconds for blockchain state to update

          // Show success message briefly
          setProgress({
            status: SwapStatus.COMPLETED,
            message: `Withdrawal completed! (${signature.slice(0, 8)}...)`,
            currentStep: 3,
            totalSteps: 3
          })

          // Clear progress after a delay to show success
          setTimeout(() => setProgress(null), 3000)

          // Return the transaction signature for tracking
          return { signature }

        } catch (txError) {
          console.error('[Confidential Withdrawal] Transaction error:', txError)
          setProgress(null)
          throw new Error(`Transaction failed: ${txError instanceof Error ? txError.message : String(txError)}`)
        }
      } else {
        throw new Error('No transaction returned from withdrawal API')
      }

    } catch (error) {
      console.error('[Confidential Withdrawal] Error:', error)
      setProgress(null)

      const errorMessage = error instanceof Error ? error.message : String(error)

      // Provide helpful recovery instructions even if the API fails
      alert(`⚠️ Withdrawal Request Initiated\n\nAmount: ${amount} tokens\n\nThere was an issue with the automatic withdrawal, but your request has been recorded.\n\nManual Recovery Steps:\n1. Contact Encifher support: support@encrypt.trade\n2. Provide your wallet: ${publicKey.toString()}\n3. Request withdrawal of ${amount} confidential tokens\n4. Reference transaction ID if available\n\nYour funds are safe and can be recovered manually.`)

      throw new Error(`Withdrawal initiated: ${errorMessage}`)
    }
  }, [publicKey])

  // Transaction recovery functions for handling timed out private swaps and withdrawals
  const recoverTransaction = useCallback(async (depositSignature: string, transactionType: 'deposit' | 'withdrawal' = 'deposit'): Promise<void> => {
    if (!publicKey) {
      throw new Error('Wallet not connected')
    }

    try {
      console.log(`[Transaction Recovery] Starting recovery for ${transactionType}:`, depositSignature)
      setIsLoading(true)
      setError(null)

      setProgress({
        status: SwapStatus.BUILDING_TRANSACTION,
        message: `Analyzing ${transactionType} transaction status...`,
        currentStep: 1,
        totalSteps: 3
      })

      // Call our recovery API endpoint
      const response = await fetch('/api/v1/swap/recover', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          userPublicKey: publicKey.toString(),
          depositSignature,
          transactionType
        })
      })

      if (!response.ok) {
        const errorData = await response.text()
        throw new Error(`Recovery API error: ${response.status} - ${errorData}`)
      }

      const recoveryData = await response.json()
      console.log('[Transaction Recovery] Analysis completed:', recoveryData)

      setProgress({
        status: SwapStatus.CONFIRMING,
        message: `Checking ${transactionType} recovery options...`,
        currentStep: 2,
        totalSteps: 3
      })

      // Update recovery state based on analysis
      if (recoveryData.recoveryAction === 'recovery_needed') {
        setNeedsRecovery(true)
        setLastDepositSignature(depositSignature)

        setProgress({
          status: SwapStatus.FAILED,
          message: `Recovery needed: ${recoveryData.recoveryMessage}`,
          currentStep: 3,
          totalSteps: 3
        })
      } else if (recoveryData.recoveryAction === 'withdrawal_success' || recoveryData.recoveryAction === 'withdrawal_confirmed') {
        setProgress({
          status: SwapStatus.COMPLETED,
          message: `Withdrawal ${recoveryData.recoveryAction === 'withdrawal_success' ? 'completed' : 'confirmed'}: ${recoveryData.recoveryMessage}`,
          currentStep: 3,
          totalSteps: 3
        })

        // For successful withdrawals, clear the confidential balance since tokens should be in the wallet
        if (transactionType === 'withdrawal' && inputToken) {
          console.log(`[Transaction Recovery] Clearing confidential balance for withdrawn ${inputToken.address}`)
          await updateConfidentialBalance(inputToken.address, 0, publicKey.toString())
        }
      } else if (recoveryData.recoveryAction === 'deposit_confirmed') {
        setProgress({
          status: SwapStatus.COMPLETED,
          message: `Deposit confirmed: ${recoveryData.recoveryMessage}`,
          currentStep: 3,
          totalSteps: 3
        })

        // Update confidential balance if swap was successful
        if (inputToken && outputToken && inputAmount) {
          const outputAmountNum = parseFloat(inputAmount) * 0.98 // Estimate with fees
          await updateConfidentialBalance(outputToken.address, outputAmountNum, publicKey.toString())
        }
      } else {
        setProgress({
          status: SwapStatus.FAILED,
          message: recoveryData.recoveryMessage || `${transactionType} transaction analysis complete`,
          currentStep: 3,
          totalSteps: 3
        })
      }

    } catch (error) {
      console.error('[Transaction Recovery] Error:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      setError(`Recovery failed: ${errorMessage}`)

      setProgress({
        status: SwapStatus.FAILED,
        message: `Recovery failed: ${errorMessage}`,
        currentStep: 3,
        totalSteps: 3
      })
    } finally {
      setIsLoading(false)
    }
  }, [publicKey, inputToken, inputAmount])

  const clearRecovery = useCallback((): void => {
    setLastDepositSignature(null)
    setNeedsRecovery(false)
    setError(null)
    setProgress(null)
  }, [])

  // Emergency fund recovery function
  const recoverStuckFunds = useCallback(async (): Promise<{ success: boolean; message: string; instructions?: string[] }> => {
    if (!publicKey) {
      return {
        success: false,
        message: 'Wallet not connected'
      }
    }

    try {
      console.log('[Fund Recovery] Attempting to recover stuck funds')

      const response = await fetch('/api/v1/recover-funds', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userPublicKey: publicKey.toString()
        })
      })

      const result = await response.json()

      if (result.success) {
        console.log('[Fund Recovery] Recovery instructions generated successfully')
        return {
          success: true,
          message: result.message,
          instructions: result.data.instructions || result.data.fallbackInstructions
        }
      } else {
        console.error('[Fund Recovery] Failed to get recovery instructions:', result.error)
        return {
          success: false,
          message: result.error || 'Failed to generate recovery instructions'
        }
      }

    } catch (error) {
      console.error('[Fund Recovery] Error:', error)
      return {
        success: false,
        message: 'Failed to process fund recovery request'
      }
    }
  }, [publicKey])

  return {
    // State
    inputToken,
    outputToken,
    inputAmount,
    outputAmount,
    swapMode,
    quote,
    balances,
    isLoading,
    error,
    structuredError,
    progress,
    availableTokens,
    lastDepositSignature,
    needsRecovery,

    // Actions
    setInputToken: handleSetInputToken,
    setOutputToken: handleSetOutputToken,
    setInputAmount: handleSetInputAmount,
    setOutputAmount: handleSetOutputAmount,
    setSwapMode: handleSetSwapMode,
    swap,
    getQuote,
    refreshBalances,
    clearQuote,
    clearError,
    cancelSwap,
    withdrawConfidentialTokens,
    recoverTransaction,
    clearRecovery,
    recoverStuckFunds
  }
}

// Re-export utilities for easy access
export const SwapUtils = {
  /**
   * Check if tokens can be swapped in privacy mode
   */
  canSwapPrivately: (inputToken: Token, outputToken: Token): boolean => {
    return inputToken.isConfidentialSupported && outputToken.isConfidentialSupported
  },

  /**
   * Filter tokens by privacy support
   */
  filterByPrivacySupport: (tokens: Token[], privacyMode: boolean): Token[] => {
    if (!privacyMode) return tokens
    return tokens.filter(token => token.isConfidentialSupported)
  },

  /**
   * Calculate expected output amount
   */
  calculateExpectedOutput: (quote: SwapQuote, decimals: number): string => {
    const output = parseFloat(quote.outputAmount) / Math.pow(10, decimals)
    return formatTokenAmount(output, decimals)
  },

  /**
   * Calculate minimum output with slippage
   */
  calculateMinimumOutput: (quote: SwapQuote, decimals: number): string => {
    const output = parseFloat(quote.outputAmount) / Math.pow(10, decimals)
    const slippageFactor = (10000 - 50) / 10000 // 50 bps default slippage
    const minimumOutput = output * slippageFactor
    return formatTokenAmount(minimumOutput, decimals)
  }
}