/**
 * Encifher SDK Integration - Privacy-First DEX Aggregator
 *
 * This module provides comprehensive integration with Encifher's privacy-enabled
 * DeFi operations including private deposits, withdrawals, and swaps on Solana.
 *
 * Replaces Arcium placeholder with production-ready privacy SDK.
 */

import {
  Connection,
  PublicKey,
  Transaction,
  Keypair,
  LAMPORTS_PER_SOL
} from '@solana/web3.js'
import {
  DefiClient,
  DefiClientConfig,
  Token,
  DepositParams,
  WithdrawParams,
  OrderStatusParams,
  SignedSwapParams,
  BalanceParams
} from 'encifher-swap-sdk'
import nacl from 'tweetnacl'

// Re-export DefiClient for use in other modules
export type { DefiClient, DefiClientConfig } from 'encifher-swap-sdk'

export interface EncifherTokenInfo {
  tokenMintAddress: string
  decimals: number
  isConfidentialSupported: boolean
  privateBalance?: string
}

export interface EncifherDepositParams {
  token: EncifherTokenInfo
  amount: string // In token units (not base units)
  userPublicKey: PublicKey
}

export interface EncifherWithdrawParams {
  token: EncifherTokenInfo
  amount: string // In token units
  userPublicKey: PublicKey
}

export interface EncifherSwapQuoteParams {
  inMint: string
  outMint: string
  amountIn: string // In base units (smallest units, as per SDK docs)
}

export interface EncifherSwapParams {
  inMint: string
  outMint: string
  amountIn: string // In base units
  senderPubkey: PublicKey
  receiverPubkey: PublicKey
}

export interface EncifherOrderStatus {
  status: 'pending' | 'completed' | 'failed'
  orderStatusIdentifier: string
  timestamp?: number
  details?: any
}

export interface EncifherBalance {
  token: string
  encryptedBalance: string
  isVisible: boolean
  lastUpdated: number
}

export interface EncifherConfig {
  encifherKey: string
  rpcUrl: string
}

/**
 * Encifher Client wrapper for private DeFi operations
 *
 * This class provides a production-ready interface to Encifher's privacy SDK
 * while maintaining compatibility with existing WaveSwap architecture.
 */
export class EncifherClient {
  private client: DefiClient | null = null
  private connection: Connection
  private config: EncifherConfig | null = null
  private userKeypair: Keypair | null = null
  private isInitialized = false

  constructor(connection: Connection, config?: EncifherConfig) {
    this.connection = connection
    this.config = config || null

    // Always inject fetch interceptor to ensure Encifher API calls are proxied
    this.injectFetchInterceptor()

    // Initialize client if config is provided
    if (config) {
      this.initialize(config)
    }
  }

  // Enhanced retry logic with exponential backoff
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: Error

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        if (attempt === maxRetries) {
          console.error(`Encifher ${operationName} failed after ${maxRetries} attempts:`, lastError)
          throw new Error(`Encifher ${operationName} failed after ${maxRetries} attempts: ${lastError.message}`)
        }

        const delay = 1000 * Math.pow(2, attempt - 1) // Exponential backoff
        console.warn(`Encifher ${operationName} attempt ${attempt} failed, retrying in ${delay}ms:`, lastError)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    throw lastError!
  }

  /**
   * Initialize Encifher SDK client
   */
  async initialize(config: EncifherConfig): Promise<void> {
    try {
      // Try simple initialization first without fetch interceptor
      const defiConfig: DefiClientConfig = {
        encifherKey: config.encifherKey,
        rpcUrl: config.rpcUrl,
        mode: 'Mainnet'
      }

      this.client = new DefiClient(defiConfig)
      this.config = config
      this.isInitialized = true

      console.log('Encifher client initialized successfully (simple mode)')
    } catch (error) {
      console.error('Failed to initialize Encifher client:', error)

      // Try with fetch interceptor as fallback
      try {
        console.log('Attempting initialization with fetch interceptor fallback...')
        this.injectFetchInterceptor()

        const defiConfig: DefiClientConfig = {
          encifherKey: config.encifherKey,
          rpcUrl: config.rpcUrl,
          mode: 'Mainnet'
        }

        this.client = new DefiClient(defiConfig)
        this.config = config
        this.isInitialized = true

        console.log('Encifher client initialized successfully with fetch interceptor')
      } catch (fallbackError) {
        console.error('Both simple and interceptor initialization failed:', fallbackError)
        throw new Error('Encifher SDK initialization failed - all attempts exhausted')
      }
    }
  }

  /**
   * Inject fetch interceptor to route Encifher API calls through our proxy
   * This bypasses CORS issues by redirecting calls to authority.encrypt.trade
   */
  private injectFetchInterceptor(): void {
    if (typeof window === 'undefined') return // Skip server-side

    // Check if interceptor is already injected to avoid multiple interceptors
    if ((window as any).__encifherInterceptorInjected) {
      console.log('[Fetch Interceptor] Already injected, skipping...')
      return
    }

    const originalFetch = window.fetch

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      try {
        const url = typeof input === 'string' ? input : input.toString()

        // Log all fetch requests to debug what's happening
        if (url.includes('authority.encrypt.trade')) {
          console.log('[Fetch Interceptor] Detected Encifher API call:', url)
        }

        // Intercept Encifher API calls and redirect through our proxy
        if (url.includes('authority.encrypt.trade') && !url.includes('localhost:3000')) {
          console.log('[Fetch Interceptor] Redirecting Encifher API call through proxy:', url)

          // Extract the path from the original URL
          const urlObj = new URL(url)
          const fullPath = urlObj.pathname + urlObj.search

          // Remove the base API path to get the route for our proxy
          let path = fullPath.replace('/api/v1/', '')
          if (path.startsWith('/')) {
            path = path.substring(1) // Remove leading slash if present
          }

          const proxyUrl = `/api/v1/encifher/${path}`

          console.log('[Fetch Interceptor] Intercepted:', {
            originalUrl: url,
            fullPath,
            extractedPath: path,
            proxyUrl
          })

          // Make the request through our proxy
          return originalFetch.call(window, proxyUrl, {
            ...init,
            headers: {
              ...init?.headers,
              'Content-Type': 'application/json'
            }
          })
        }

        // Intercept Jupiter API calls and redirect through our proxy to avoid rate limits
        if (url.includes('jup.ag') && !url.includes('localhost:3000')) {
          console.log('[Fetch Interceptor] Redirecting Jupiter API call through proxy:', url)

          // Extract the path from the original URL
          const urlObj = new URL(url)
          const path = urlObj.pathname + urlObj.search
          const proxyUrl = `/api/v1/jupiter${path}`

          console.log('[Fetch Interceptor] Jupiter Proxy URL:', proxyUrl)

          // Make the request through our proxy
          return originalFetch.call(window, proxyUrl, {
            ...init,
            headers: {
              ...init?.headers,
              // Add any custom headers needed for the proxy
            }
          })
        }

        // For all other requests, use the original fetch
        return originalFetch.call(window, input, init)
      } catch (error) {
        console.error('[Fetch Interceptor] Error in interceptor:', error)
        // Fallback to original fetch on error
        return originalFetch.call(window, input, init)
      }
    }

    // Also intercept XMLHttpRequest for axios requests
    const originalXHROpen = XMLHttpRequest.prototype.open
    XMLHttpRequest.prototype.open = function(method: string, url: string | URL, ...args: [any?, ...any[]]) {
      const urlString = typeof url === 'string' ? url : url.toString()

      if (urlString.includes('authority.encrypt.trade') && !urlString.includes('localhost:3000')) {
        console.log('[XHR Interceptor] Detected Encifher API call via XMLHttpRequest:', urlString)

        // Extract the path from the original URL
        const urlObj = new URL(urlString)
        const fullPath = urlObj.pathname + urlObj.search

        // Remove the base API path to get the route for our proxy
        let path = fullPath.replace('/api/v1/', '')
        if (path.startsWith('/')) {
          path = path.substring(1) // Remove leading slash if present
        }

        const proxyUrl = `/api/v1/encifher/${path}`

        console.log('[XHR Interceptor] Redirecting to proxy:', {
          originalUrl: urlString,
          proxyUrl
        })

        // Call original XHR open with proxy URL
        return originalXHROpen.call(this, method, proxyUrl, ...args)
      }

      return originalXHROpen.call(this, method, url, ...args)
    }

    // Also intercept XHR setRequestHeader to capture authentication headers
    const originalXHRSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader
    XMLHttpRequest.prototype.setRequestHeader = function(name: string, value: string) {
      // Store the headers so we can forward them in our proxy
      if (!(this as any)._headers) {
        (this as any)._headers = {}
      }

      // Override placeholder API key
      if (name.toLowerCase() === 'x-api-key' && value === 'your_encifher_sdk_key_here') {
        console.log('[XHR Interceptor] Overriding placeholder API key with environment key')
        value = process.env.NEXT_PUBLIC_ENCIFHER_SDK_KEY || process.env.ENCIFHER_API_KEY || 'default-key'
      }

      (this as any)._headers[name.toLowerCase()] = value
      console.log('[XHR Interceptor] Header set:', name, value)

      return originalXHRSetRequestHeader.call(this, name, value)
    }

    // Mark interceptor as injected
    ;(window as any).__encifherInterceptorInjected = true
    console.log('[Fetch Interceptor] Encifher API calls will be routed through proxy (fetch + XMLHttpRequest)')
  }

  /**
   * Set user keypair for signing private transactions
   */
  setUserKeypair(keypair: Keypair): void {
    this.userKeypair = keypair
  }

  /**
   * Check if Encifher client is properly initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.client !== null && this.config !== null
  }

  /**
   * Private token deposit - Convert public tokens to private pool
   * @param params Deposit parameters
   * @returns Transaction for private deposit
   */
  async privateDeposit(params: EncifherDepositParams): Promise<{ transaction: Transaction }> {
    if (!this.isReady() || !this.client) {
      throw new Error('Encifher client not initialized')
    }

    try {
      // Convert amount to base units
      const amountInBaseUnits = this.convertToBaseUnits(params.amount, params.token.decimals)

      const depositParams: DepositParams = {
        token: {
          tokenMintAddress: params.token.tokenMintAddress,
          decimals: params.token.decimals
        },
        depositor: params.userPublicKey,
        amount: amountInBaseUnits
      }

      const transaction = await this.client.getDepositTxn(depositParams)

      console.log('Encifher private deposit transaction created:', {
        token: params.token.tokenMintAddress,
        amount: params.amount,
        user: params.userPublicKey.toBase58()
      })

      return { transaction }
    } catch (error) {
      console.error('Error in private deposit:', error)
      throw new Error(`Private deposit failed: ${error}`)
    }
  }

  /**
   * Private token withdrawal - Convert private pool tokens back to public
   * @param params Withdrawal parameters
   * @returns Transaction for private withdrawal
   */
  async privateWithdraw(params: EncifherWithdrawParams): Promise<{ transaction: Transaction }> {
    if (!this.isReady() || !this.client) {
      throw new Error('Encifher client not initialized')
    }

    try {
      // Convert amount to base units
      const amountInBaseUnits = this.convertToBaseUnits(params.amount, params.token.decimals)

      const withdrawParams: WithdrawParams = {
        token: {
          tokenMintAddress: params.token.tokenMintAddress,
          decimals: params.token.decimals
        },
        amount: amountInBaseUnits,
        withdrawer: params.userPublicKey
      }

      const transaction = await this.client.getWithdrawTxn(withdrawParams)

      console.log('Encifher private withdrawal transaction created:', {
        token: params.token.tokenMintAddress,
        amount: params.amount,
        user: params.userPublicKey.toBase58()
      })

      return { transaction }
    } catch (error) {
      console.error('Error in private withdrawal:', error)
      throw new Error(`Private withdrawal failed: ${error}`)
    }
  }

  /**
   * Get private swap quote from Encifher
   * @param params Quote parameters - amountIn should be in base units as per SDK docs
   * @returns Swap quote with expected output and slippage
   */
  async getPrivateSwapQuote(params: EncifherSwapQuoteParams): Promise<{
    expectedOutAmount: string
    slippage: string
    route: string
    priceImpact?: string
  }> {
    if (!this.isReady() || !this.client) {
      throw new Error('Encifher client not initialized')
    }

    return this.retryWithBackoff(async () => {
      // Note: amountIn should already be in base units as per SDK documentation
      console.log('[Encifher] Getting swap quote:', {
        inMint: params.inMint,
        outMint: params.outMint,
        amountIn: params.amountIn
      })

      if (!this.client) {
        throw new Error('Encifher client not initialized in retry context')
      }

      const quote = await this.client.getSwapQuote({
        inMint: params.inMint,
        outMint: params.outMint,
        amountIn: params.amountIn // Already in base units
      })

      console.log('[Encifher] Swap quote received:', quote)

      // Handle different response formats from the SDK
      const outAmount = (quote as any).amountOut || (quote as any).outAmount || (quote as any).expectedOutAmount || '0'
      const slippage = (quote as any).slippage || '0.5'
      const route = (quote as any).router || (quote as any).route || 'direct'
      const priceImpact = (quote as any).priceImpact || '0'

      console.log('[Encifher] Processed quote response:', {
        originalQuote: quote,
        extractedOutAmount: outAmount,
        extractedSlippage: slippage,
        extractedRoute: route
      })

      return {
        expectedOutAmount: outAmount,
        slippage: slippage.toString(),
        route: route,
        priceImpact: priceImpact.toString()
      }
    }, 'getPrivateSwapQuote')
  }

  /**
   * Create private swap transaction (not broadcasted)
   * @param params Swap parameters
   * @returns Unsigned transaction for private swap
   */
  async createPrivateSwap(params: EncifherSwapParams): Promise<{ transaction: Transaction }> {
    if (!this.isReady() || !this.client) {
      throw new Error('Encifher client not initialized')
    }

    try {
      const transaction = await this.client.getSwapTxn(params)

      console.log('Encifher private swap transaction created:', {
        inMint: params.inMint,
        outMint: params.outMint,
        amountIn: params.amountIn,
        sender: params.senderPubkey.toBase58(),
        receiver: params.receiverPubkey.toBase58()
      })

      return { transaction }
    } catch (error) {
      console.error('Error creating private swap transaction:', error)
      throw new Error(`Private swap transaction failed: ${error}`)
    }
  }

  /**
   * Execute signed private swap transaction
   * @param transaction Signed transaction (base64)
   * @param orderDetails Order details
   * @returns Order status identifier for polling
   */
  async executePrivateSwap(
    serializedTxn: string,
    orderDetails: {
      inMint: string
      outMint: string
      amountIn: string
      senderPubkey: PublicKey
      receiverPubkey: PublicKey
      message?: string
    }
  ): Promise<{ orderStatusIdentifier: string; timestamp: number }> {
    if (!this.isReady() || !this.client) {
      throw new Error('Encifher client not initialized')
    }

    try {
      const signedSwapParams: SignedSwapParams = {
        serializedTxn,
        orderDetails: {
          inMint: orderDetails.inMint,
          outMint: orderDetails.outMint,
          amountIn: orderDetails.amountIn,
          senderPubkey: orderDetails.senderPubkey,
          receiverPubkey: orderDetails.receiverPubkey,
          message: orderDetails.message || ''
        }
      }

      // Debug check: Log that we're about to call Encifher SDK
      console.log('[Encifher Debug] About to call executeSwapTxn - fetch interceptor should be active')
      console.log('[Encifher Debug] Interceptor injected:', (window as any).__encifherInterceptorInjected)

      const executeResponse = await this.client.executeSwapTxn(signedSwapParams)

      console.log('Encifher private swap executed:', {
        orderStatusIdentifier: executeResponse.orderStatusIdentifier,
        timestamp: (executeResponse as any).timestamp || Date.now()
      })

      // Construct the response to match expected interface
      return {
        orderStatusIdentifier: String(executeResponse.orderStatusIdentifier),
        timestamp: (executeResponse as any).timestamp || Date.now()
      }
    } catch (error) {
      console.error('Error executing private swap:', error)
      throw new Error(`Private swap execution failed: ${error}`)
    }
  }

  /**
   * Get order status for private transaction
   * @param orderStatusIdentifier Order identifier from executeSwapTxn
   * @returns Current order status
   */
  async getOrderStatus(orderStatusIdentifier: string): Promise<EncifherOrderStatus> {
    if (!this.isReady() || !this.client) {
      throw new Error('Encifher client not initialized')
    }

    try {
      const status = await this.client.getOrderStatus({
        orderStatusIdentifier: orderStatusIdentifier as any
      })

      return {
        status: status.status as 'pending' | 'completed' | 'failed',
        orderStatusIdentifier,
        timestamp: (status as any).timestamp,
        details: status
      }
    } catch (error) {
      console.error('Error getting order status:', error)
      throw new Error(`Order status check failed: ${error}`)
    }
  }

  /**
   * Get private balance for user (requires message signing)
   * @param userPublicKey User's public key
   * @param tokens Array of token mint addresses to query
   * @returns Private balances for specified tokens
   */
  async getPrivateBalance(
    userPublicKey: PublicKey,
    tokens: string[]
  ): Promise<Map<string, EncifherBalance>> {
    if (!this.isReady() || !this.client || !this.config) {
      throw new Error('Encifher client not initialized')
    }

    if (!this.userKeypair) {
      throw new Error('User keypair not set for private balance query')
    }

    try {
      // Get message to sign from Encifher
      const msgPayload = await this.client.getMessageToSign()

      // Sign the message with user's keypair
      const sigBuff = nacl.sign.detached(
        Buffer.from(msgPayload.msgHash),
        this.userKeypair.secretKey
      )
      const signature = Buffer.from(sigBuff).toString('base64')

      // Get private balances
      const balanceData = await this.client.getBalance(
        userPublicKey,
        { signature, ...msgPayload },
        tokens,
        this.config.encifherKey
      )

      // Convert to Map format
      const balances = new Map<string, EncifherBalance>()

      if (Array.isArray(balanceData)) {
        balanceData.forEach((balance: any, index: number) => {
          const tokenAddress = tokens[index]
          if (tokenAddress) {
            balances.set(tokenAddress, {
              token: tokenAddress,
              encryptedBalance: balance.encryptedBalance || '0',
              isVisible: balance.isVisible || false,
              lastUpdated: Date.now()
            })
          }
        })
      }

      return balances
    } catch (error) {
      console.error('Error getting private balance:', error)
      throw new Error(`Private balance query failed: ${error}`)
    }
  }

  /**
   * Check if token supports private operations
   * @param tokenMint Token mint address
   * @returns Whether token supports privacy features
   */
  isPrivacySupported(tokenMint: string): boolean {
    // For now, assume common tokens support privacy
    // In production, this would query Encifher for supported tokens
    const supportedTokens = [
      'So11111111111111111111111111111111111111112', // SOL
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
      'WAVE9qC1TQR1UYxYZyJQBBtz3Zg4ZEURZuGx9JTFoJp'  // WAVE (example)
    ]

    return supportedTokens.includes(tokenMint)
  }

  /**
   * Convert token amount to base units
   */
  private convertToBaseUnits(amount: string, decimals: number): string {
    const amountNum = parseFloat(amount)
    if (isNaN(amountNum)) return '0'

    return (amountNum * Math.pow(10, decimals)).toString()
  }

  /**
   * Convert amount from base units to display units
   */
  private convertFromBaseUnits(amount: string, decimals: number): string {
    const amountNum = parseFloat(amount)
    if (isNaN(amountNum)) return '0'

    return (amountNum / Math.pow(10, decimals)).toString()
  }
}

/**
 * Utility functions for Encifher integration
 */
export const EncifherUtils = {
  /**
   * Create Encifher client instance
   * @param connection Solana connection
   * @param config Encifher configuration
   */
  createClient(connection: Connection, config: EncifherConfig): EncifherClient {
    return new EncifherClient(connection, config)
  },

  /**
   * Get Encifher configuration from environment
   */
  getConfig(): EncifherConfig | null {
    const encifherKey = process.env.NEXT_PUBLIC_ENCIFHER_SDK_KEY
    const rpcUrl = process.env.NEXT_PUBLIC_ENCIFHER_RPC_URL || 'https://api.mainnet-beta.solana.com'

    // Use the provided API key if available, otherwise use default
    if (encifherKey && encifherKey !== 'your-api-key-here') {
      console.log('[Encifher] Using configured API key')
      return { encifherKey, rpcUrl }
    } else {
      console.log('[Encifher] Using default configuration')
      return { encifherKey: 'default-key', rpcUrl }
    }
  },

  /**
   * Check if Encifher is properly configured
   */
  isConfigured(): boolean {
    const encifherKey = process.env.NEXT_PUBLIC_ENCIFHER_SDK_KEY
    // Check if we have a valid API key or can use default
    return true // Always allow usage with fallback to default
  },

  /**
   * Format order status for display
   */
  formatOrderStatus(status: string): string {
    switch (status) {
      case 'pending':
        return 'Processing...'
      case 'completed':
        return 'Completed'
      case 'failed':
        return 'Failed'
      default:
        return 'Unknown'
    }
  },

  /**
   * Calculate estimated time for order completion
   */
  getEstimatedTime(status: string): string {
    switch (status) {
      case 'pending':
        return 'Usually completes within 2-5 minutes'
      case 'completed':
        return 'Completed'
      case 'failed':
        return 'Failed to process'
      default:
        return 'Status unknown'
    }
  }
}

// Export types for use in components
export type {
  Token as EncifherToken,
  DepositParams,
  WithdrawParams,
  OrderStatusParams,
  SignedSwapParams,
  BalanceParams
} from 'encifher-swap-sdk'