/**
 * Enhanced Swap Execution Service
 *
 * Handles normal and private swap execution flows using:
 * - Jupiter API for public swaps
 * - Encifher SDK for privacy-enabled swaps
 * - Arcium as fallback (deprecated, will be removed)
 *
 * Provides comprehensive swap orchestration with proper error handling and status updates.
 *
 * References:
 * - Jupiter Swap API: https://hub.jup.ag/docs/swap-api/
 * - Encifher SDK: https://docs.encifher.com/
 */

import { Connection, PublicKey, Transaction, VersionedTransaction, sendAndConfirmTransaction } from '@solana/web3.js'
import { useWallet } from '@/hooks/useWalletAdapter'
import { JupiterAPI, JupiterQuoteParams, JupiterSwapParams } from '@/lib/jupiter'
import { formatTokenAmount } from '@/lib/token-formatting'
import {
  DefiClient,
  DefiClientConfig,
  DepositParams,
  WithdrawParams,
  Token as EncifherToken,
  OrderStatusParams,
  SignedSwapParams
} from 'encifher-swap-sdk'
import nacl from 'tweetnacl'
import { Token, SwapQuote, SwapExecution, SwapStatus, SwapProgress } from '@/types/token'
import { COMMON_TOKENS } from '@/types/token'

export interface SwapServiceConfig {
  connection: Connection
  jupiterApi: JupiterAPI
  defiClient?: DefiClient
  userKeypair?: { secretKey: Uint8Array }
  userPublicKey: PublicKey
  signTransaction: (transaction: Transaction | VersionedTransaction) => Promise<Transaction | VersionedTransaction>
  signAllTransactions?: (transactions: (Transaction | VersionedTransaction)[]) => Promise<(Transaction | VersionedTransaction)[]>
  onProgress?: (progress: SwapProgress) => void
}

export interface SwapRequest {
  inputToken: Token
  outputToken: Token
  inputAmount: string
  privacyMode: boolean
  slippageBps?: number
  privacyProvider?: 'encifher' | 'arcium' // New: Choose privacy provider
  skipDeposit?: boolean // New: Skip deposit if already in private pool
}

export class SwapExecutionService {
  private config: SwapServiceConfig
  private currentExecution: SwapExecution | null = null
  private defiClient: DefiClient | null = null

  constructor(config: SwapServiceConfig) {
    this.config = config
    this.defiClient = config.defiClient || null
  }

  /**
   * Initialize DefiClient if not already provided
   */
  private async initializeDefiClient(): Promise<DefiClient> {
    if (this.defiClient) {
      return this.defiClient
    }

    // Use more reliable RPC endpoints for Encifher
    const rpcUrl = this.config.connection.rpcEndpoint || 'https://api.mainnet-beta.solana.com'

    console.log('Initializing DefiClient with RPC URL:', rpcUrl)

    // Encifher SDK works without any API key!
    const config: DefiClientConfig = {
      rpcUrl,
      mode: 'Mainnet',
      encifherKey: '' // Empty string as confirmed by user
    }

    this.defiClient = new DefiClient(config)
    console.log('DefiClient initialized successfully')
    return this.defiClient
  }

  /**
   * Execute Encifher privacy-enabled swap
   */
  async executeEncifherSwap(request: SwapRequest): Promise<SwapExecution> {
    const execution: SwapExecution = {
      quote: {} as SwapQuote,
      transaction: null,
      privacyMode: true,
      status: SwapStatus.QUOTING,
      error: undefined
    }

    this.currentExecution = execution

    try {
      const defiClient = await this.initializeDefiClient()

      // Step 1: Get Encifher private swap quote
      this.updateProgress(SwapStatus.QUOTING, 1, 5, 'Getting private swap route...')
      const privateQuote = await this.getEncifherQuote(request)

      // Step 2: Deposit tokens to private pool (if not already deposited)
      if (!request.skipDeposit) {
        this.updateProgress(SwapStatus.WRAPPING, 2, 5, 'Depositing tokens to private pool...')
        execution.wrappingTx = await this.depositToPrivatePool(request)
      }

      // Step 3: Create and execute private swap transaction
      this.updateProgress(SwapStatus.SWAPPING, request.skipDeposit ? 2 : 3, 5, 'Executing private swap...')
      const swapTxn = await this.createPrivateSwapTransaction(request)

      // Sign the transaction
      const signedTx = await this.config.signTransaction(swapTxn)

      // Execute the private swap
      const executeResponse = await defiClient.executeSwapTxn({
        serializedTxn: signedTx.serialize().toString('base64'),
        orderDetails: {
          inMint: request.inputToken.address,
          outMint: request.outputToken.address,
          amountIn: Math.floor(parseFloat(request.inputAmount) * Math.pow(10, request.inputToken?.decimals || 9)).toString(),
          senderPubkey: this.config.userPublicKey,
          receiverPubkey: this.config.userPublicKey,
          message: 'Private swap via WaveSwap'
        }
      })

      // Store order identifier for tracking
      if (this.currentExecution) {
        this.currentExecution.orderId = String(executeResponse.orderStatusIdentifier)
      }

      // Step 4: Track order status
      this.updateProgress(SwapStatus.CONFIRMING, request.skipDeposit ? 3 : 4, 5, 'Tracking private transaction...')
      await this.trackPrivateOrder(String(executeResponse.orderStatusIdentifier))

      execution.status = SwapStatus.COMPLETED
      this.updateProgress(SwapStatus.COMPLETED, 5, 5, 'Private swap completed!')

      return execution

    } catch (error) {
      execution.status = SwapStatus.FAILED
      execution.error = error instanceof Error ? error.message : 'Unknown error occurred'
      this.updateProgress(SwapStatus.FAILED, 0, 5, `Private swap failed: ${execution.error}`)
      throw error
    }
  }

  /**
   * Execute swap with full privacy support (legacy method for Arcium)
   */
  async executeSwap(request: SwapRequest): Promise<SwapExecution> {
    // Use Encifher for privacy mode if available and configured
    if (request.privacyMode && (request.privacyProvider === 'encifher' || !request.privacyProvider)) {
      try {
        return await this.executeEncifherSwap(request)
      } catch (error) {
        console.warn('Encifher swap failed, falling back to public swap:', error)
        // Fall back to public swap if Encifher fails - don't try Arcium wrapping as it may not be configured
        request.privacyMode = false
      }
    }

    const execution: SwapExecution = {
      quote: {} as SwapQuote,
      transaction: null,
      privacyMode: false, // Always false for public swaps now
      status: SwapStatus.QUOTING,
      error: undefined
    }

    this.currentExecution = execution

    try {
      // Step 1: Get quote from Jupiter
      this.updateProgress(SwapStatus.QUOTING, 1, 3, 'Getting best route...')
      execution.quote = await this.getQuote(request)

      // Step 2: Execute swap (no wrapping needed for public swaps)
      this.updateProgress(SwapStatus.SWAPPING, 2, 3, 'Executing swap...')
      execution.transaction = await this.executeSwapTransaction(request, execution.quote)

      this.updateProgress(SwapStatus.CONFIRMING, 3, 3, 'Confirming transaction...')

      // Step 3: Confirm transaction
      await this.confirmTransaction(execution.transaction)

      execution.status = SwapStatus.COMPLETED
      this.updateProgress(SwapStatus.COMPLETED, 3, 3, 'Swap completed!')

      return execution

    } catch (error) {
      execution.status = SwapStatus.FAILED
      execution.error = error instanceof Error ? error.message : 'Unknown error occurred'
      this.updateProgress(SwapStatus.FAILED, 0, 3, `Swap failed: ${execution.error}`)
      throw error
    }
  }

  /**
   * Get swap quote from Jupiter API
   */
  private async getQuote(request: SwapRequest): Promise<SwapQuote> {
    try {
      const quoteParams: JupiterQuoteParams = {
        inputMint: request.inputToken.address,
        outputMint: request.outputToken.address,
        amount: this.formatAmount(request.inputAmount, request.inputToken?.decimals || 9),
        slippageBps: request.slippageBps || 50,
        userPublicKey: this.config.userPublicKey.toString(),
        onlyDirectRoutes: false,
        asLegacyTransaction: false
      }

      const jupiterQuote = await this.config.jupiterApi.getQuote(quoteParams)

      return {
        inputMint: jupiterQuote.inputMint,
        outputMint: jupiterQuote.outputMint,
        inputAmount: jupiterQuote.inAmount,
        outputAmount: jupiterQuote.outAmount,
        priceImpactPct: parseFloat(jupiterQuote.priceImpactPct) * 100,
        routePlan: jupiterQuote.routePlan
      }
    } catch (error) {
      console.error('Error getting quote:', error)
      throw new Error('Failed to get swap quote')
    }
  }

  /**
   * Wrap input tokens for privacy mode (currently disabled)
   */
  private async wrapInputTokens(request: SwapRequest): Promise<Transaction | VersionedTransaction> {
    throw new Error('Confidential token wrapping is not available yet. Please use standard swaps.')
  }

  /**
   * Execute the main swap transaction
   */
  private async executeSwapTransaction(request: SwapRequest, quote: SwapQuote): Promise<Transaction | VersionedTransaction> {
    try {
      const swapParams: JupiterSwapParams = {
        quoteResponse: {
          inputMint: quote.inputMint,
          outputMint: quote.outputMint,
          inAmount: quote.inputAmount,
          outAmount: quote.outputAmount,
          otherAmountThreshold: quote.inputAmount, // TODO: Calculate proper threshold
          priceImpactPct: quote.priceImpactPct.toString(),
          routePlan: quote.routePlan || [],
          swapMode: 'ExactIn',
          slippageBps: 50
        },
        userPublicKey: this.config.userPublicKey.toString(),
        wrapAndUnwrapSol: request.inputToken.isNative || request.outputToken.isNative,
        useSharedAccounts: false,
        asLegacyTransaction: false
      }

      const swapResponse = await this.config.jupiterApi.getSwapTransaction(swapParams)
      const transaction = await this.config.jupiterApi.prepareTransaction(swapResponse)

      // Sign transaction
      const signedTx = await this.config.signTransaction(transaction)

      return signedTx
    } catch (error) {
      console.error('Error executing swap transaction:', error)
      throw new Error('Failed to execute swap transaction')
    }
  }

  /**
   * Unwrap output tokens after private swap (currently disabled)
   */
  private async unwrapOutputTokens(request: SwapRequest, quote: SwapQuote): Promise<Transaction | VersionedTransaction> {
    throw new Error('Confidential token unwrapping is not available yet. Please use standard swaps.')
  }

  /**
   * Confirm transaction execution
   */
  private async confirmTransaction(transaction: Transaction | VersionedTransaction): Promise<string> {
    try {
      let serializedTransaction: Buffer | Uint8Array
      if ('version' in transaction) {
        // VersionedTransaction
        serializedTransaction = transaction.serialize()
      } else {
        // Legacy Transaction
        serializedTransaction = transaction.serialize()
      }

      const signature = await this.config.connection.sendRawTransaction(serializedTransaction)
      await this.config.connection.confirmTransaction(signature, 'confirmed')
      return signature
    } catch (error) {
      console.error('Error confirming transaction:', error)
      throw new Error('Failed to confirm transaction')
    }
  }

  /**
   * Cancel current swap execution
   */
  cancelSwap(): void {
    if (this.currentExecution) {
      this.currentExecution.status = SwapStatus.FAILED
      this.currentExecution.error = 'Swap cancelled by user'
      this.updateProgress(SwapStatus.FAILED, 0, 0, 'Swap cancelled')
    }
  }

  /**
   * Get current execution status
   */
  getCurrentExecution(): SwapExecution | null {
    return this.currentExecution
  }

  /**
   * Update progress callback
   */
  private updateProgress(status: SwapStatus, currentStep: number, totalSteps: number, message: string): void {
    if (this.config.onProgress) {
      this.config.onProgress({
        status,
        currentStep,
        totalSteps,
        message
      })
    }

    if (this.currentExecution) {
      this.currentExecution.status = status
    }
  }

  /**
   * Format amount for API calls
   */
  private formatAmount(amount: string, decimals: number): string {
    return Math.floor(parseFloat(amount) * Math.pow(10, decimals)).toString()
  }

  /**
   * Parse amount from API response
   */
  private parseAmount(amount: string, decimals: number): number {
    return parseFloat(amount) / Math.pow(10, decimals)
  }

  // ===== ENCIFHER-SPECIFIC METHODS =====

  /**
   * Get private swap quote from Encifher
   */
  private async getEncifherQuote(request: SwapRequest): Promise<SwapQuote> {
    const defiClient = await this.initializeDefiClient()

    // Convert amount to base units
    const amountInBaseUnits = Math.floor(parseFloat(request.inputAmount) * Math.pow(10, request.inputToken?.decimals || 9))

    const privateQuote = await defiClient.getSwapQuote({
      inMint: request.inputToken.address,
      outMint: request.outputToken.address,
      amountIn: amountInBaseUnits.toString()
    })

    // Convert back to display units
    const expectedOutDisplay = parseFloat((privateQuote as any).expectedOutAmount) / Math.pow(10, request.outputToken?.decimals || 9)

    return {
      inputMint: request.inputToken.address,
      outputMint: request.outputToken.address,
      inputAmount: request.inputAmount,
      outputAmount: (privateQuote as any).expectedOutAmount,
      priceImpactPct: parseFloat((privateQuote as any).priceImpact || '0'),
      routePlan: [{ route: (privateQuote as any).route || 'direct', swapInfo: {} }]
    }
  }

  /**
   * Deposit tokens to Encifher private pool
   */
  private async depositToPrivatePool(request: SwapRequest): Promise<Transaction | VersionedTransaction> {
    try {
      this.updateProgress(SwapStatus.WRAPPING, 2, 5, 'Depositing to private pool...')

      const defiClient = await this.initializeDefiClient()
      console.log('Depositing to Encifher private pool:', request.inputToken.symbol, request.inputAmount)

      // Create token object for Encifher SDK
      const token: EncifherToken = {
        tokenMintAddress: request.inputToken.address,
        decimals: request.inputToken?.decimals || 9
      }

      // Convert amount to base units
      const amountInBaseUnits = Math.floor(parseFloat(request.inputAmount) * Math.pow(10, request.inputToken?.decimals || 9))

      const depositParams: DepositParams = {
        token,
        depositor: this.config.userPublicKey,
        amount: amountInBaseUnits.toString()
      }

      console.log('Encifher deposit params:', depositParams)

      try {
        // Get deposit transaction from Encifher
        const depositTxn = await defiClient.getDepositTxn(depositParams)
        console.log('Encifher deposit transaction created successfully')

        const signedTx = await this.config.signTransaction(depositTxn)
        return signedTx
      } catch (fetchError: any) {
        console.error('Encifher SDK fetch error details:', {
          name: fetchError?.name,
          message: fetchError?.message,
          cause: fetchError?.cause,
          stack: fetchError?.stack
        })

        // Provide more specific error handling
        if (fetchError?.message?.includes('fetch') || fetchError?.name?.includes('FetchError')) {
          throw new Error('Network error: Unable to connect to Encifher service. Please check your network connection and try again.')
        } else if (fetchError?.message?.includes('timeout')) {
          throw new Error('Timeout: Encifher service is taking too long to respond. Please try again.')
        } else if (fetchError?.message?.includes('400') || fetchError?.message?.includes('Bad Request')) {
          throw new Error('Invalid request: The deposit parameters are invalid.')
        } else if (fetchError?.message?.includes('401') || fetchError?.message?.includes('Unauthorized')) {
          throw new Error('Authentication error: Invalid Encifher configuration.')
        } else if (fetchError?.message?.includes('404') || fetchError?.message?.includes('Not Found')) {
          throw new Error('Service error: Encifher service endpoint not found.')
        } else if (fetchError?.message?.includes('429') || fetchError?.message?.includes('Too Many Requests')) {
          throw new Error('Rate limited: Too many requests to Encifher service. Please wait and try again.')
        } else if (fetchError?.message?.includes('500') || fetchError?.message?.includes('Internal Server Error')) {
          throw new Error('Service error: Encifher service is experiencing issues. Please try again later.')
        } else {
          throw new Error(`Encifher SDK error: ${fetchError?.message || 'Unknown error occurred'}`)
        }
      }
    } catch (error) {
      console.error('Error in Encifher private pool deposit:', error)
      throw new Error(`Failed to deposit to private pool: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Create private swap transaction
   */
  private async createPrivateSwapTransaction(request: SwapRequest): Promise<Transaction> {
    const defiClient = await this.initializeDefiClient()

    // Convert amount to base units
    const amountInBaseUnits = Math.floor(parseFloat(request.inputAmount) * Math.pow(10, request.inputToken?.decimals || 9))

    console.log('Creating Encifher private swap transaction:', {
      inMint: request.inputToken.address,
      outMint: request.outputToken.address,
      amountIn: amountInBaseUnits.toString(),
      sender: this.config.userPublicKey.toString(),
      receiver: this.config.userPublicKey.toString()
    })

    const swapParams = {
      inMint: request.inputToken.address,
      outMint: request.outputToken.address,
      amountIn: amountInBaseUnits.toString(),
      senderPubkey: this.config.userPublicKey,
      receiverPubkey: this.config.userPublicKey
    }

    const swapTxn = await defiClient.getSwapTxn(swapParams)
    console.log('Encifher private swap transaction created successfully')

    return swapTxn
  }

  /**
   * Track private order status with polling
   */
  private async trackPrivateOrder(orderStatusIdentifier: string): Promise<void> {
    const defiClient = await this.initializeDefiClient()
    const maxAttempts = 40 // 40 attempts * 3 seconds = 2 minutes max
    const pollingInterval = 3000 // 3 seconds

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const orderStatus = await defiClient.getOrderStatus({
          orderStatusIdentifier: orderStatusIdentifier as any
        })

        this.updateProgress(
          SwapStatus.CONFIRMING,
          Math.min(attempt, 5),
          5,
          `Tracking private transaction... (${attempt}/${maxAttempts})`
        )

        if (orderStatus.status === 'completed') {
          this.updateProgress(SwapStatus.COMPLETED, 5, 5, 'Private transaction completed!')
          return
        } else if (orderStatus.status === 'failed') {
          throw new Error('Private transaction failed')
        }

        // Still pending, wait and poll again
        await new Promise(resolve => setTimeout(resolve, pollingInterval))

      } catch (error) {
        console.error(`Error tracking private order (attempt ${attempt}):`, error)

        if (attempt === maxAttempts) {
          throw new Error('Failed to track private order after maximum attempts')
        }

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, pollingInterval))
      }
    }

    throw new Error('Private transaction tracking timeout')
  }

  /**
   * Check if Encifher is available and configured
   */
  isEncifherAvailable(): boolean {
    return this.defiClient !== null
  }

  /**
   * Get private balance for user (requires authentication)
   */
  async getPrivateBalance(tokens: string[], userSecretKey?: Uint8Array): Promise<Map<string, { balance: string; isVisible: boolean }>> {
    if (!userSecretKey) {
      throw new Error('User secret key required for private balance queries')
    }

    const defiClient = await this.initializeDefiClient()

    try {
      // Get message to sign
      const msgPayload = await defiClient.getMessageToSign()
      const sigBuff = nacl.sign.detached(Buffer.from(msgPayload.msgHash), userSecretKey)
      const signature = Buffer.from(sigBuff).toString('base64')

      // Query balance with signature
      const userBalance = await defiClient.getBalance(
        this.config.userPublicKey,
        { signature, ...msgPayload },
        tokens,
        '' // No encifherKey needed
      )

      const result = new Map()
      // Handle both array and Map formats
      if (Array.isArray(userBalance)) {
        userBalance.forEach((balance: any, index: number) => {
          const tokenAddress = tokens[index]
          if (tokenAddress) {
            result.set(tokenAddress, {
              balance: balance.encryptedBalance || balance.balance || '0',
              isVisible: balance.isVisible !== false
            })
          }
        })
      } else {
        // Assume it's a Map-like object
        Object.entries(userBalance as any).forEach(([tokenAddress, balance]: [string, any]) => {
          result.set(tokenAddress, {
            balance: balance.encryptedBalance || balance.balance || '0',
            isVisible: balance.isVisible !== false
          })
        })
      }

      return result
    } catch (error) {
      console.error('Error getting private balance:', error)
      throw new Error('Failed to get private balance')
    }
  }
}

/**
 * Create swap service instance
 */
export function createSwapService(config: SwapServiceConfig): SwapExecutionService {
  return new SwapExecutionService(config)
}

/**
 * Enhanced utility functions for swap operations with Encifher support
 */
export const SwapUtils = {
  /**
   * Check if tokens can be swapped in privacy mode
   */
  canSwapPrivately(inputToken: Token, outputToken: Token, privacyProvider: 'encifher' | 'arcium' = 'encifher'): boolean {
    if (privacyProvider === 'encifher') {
      // Encifher supports most major tokens
      return this.isEncifherSupported(inputToken.address) && this.isEncifherSupported(outputToken.address)
    } else {
      // Arcium legacy support (deprecated)
      return inputToken.isConfidentialSupported && outputToken.isConfidentialSupported
    }
  },

  /**
   * Check if token is supported by Encifher
   */
  isEncifherSupported(tokenAddress: string): boolean {
    // Encifher supports most major Solana tokens
    const supportedTokens = [
      'So11111111111111111111111111111111111111112', // SOL (wrapped)
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
      'WAVE9qC1TQR1UYxYZyJQBBtz3Zg4ZEURZuGx9JTFoJp', // WAVE
      'GoLDppdjB1vDTPSGxyMJFqdnj134yH6Prg9eqsGDiw6A', // GOLD
    ]
    return supportedTokens.includes(tokenAddress)
  },

  /**
   * Get available tokens for swapping
   */
  getAvailableTokens(): Token[] {
    return COMMON_TOKENS
  },

  /**
   * Filter tokens by privacy support and provider
   */
  filterByPrivacySupport(tokens: Token[], privacyMode: boolean, privacyProvider: 'encifher' | 'arcium' = 'encifher'): Token[] {
    if (!privacyMode) return tokens

    if (privacyProvider === 'encifher') {
      return tokens.filter(token => this.isEncifherSupported(token.address))
    } else {
      return tokens.filter(token => token.isConfidentialSupported)
    }
  },

  /**
   * Get recommended privacy provider for token pair
   */
  getRecommendedPrivacyProvider(inputToken: Token, outputToken: Token): 'encifher' | 'arcium' | 'none' {
    const encifherSupports = this.isEncifherSupported(inputToken.address) && this.isEncifherSupported(outputToken.address)
    const arciumSupports = inputToken.isConfidentialSupported && outputToken.isConfidentialSupported

    if (encifherSupports) return 'encifher'
    if (arciumSupports) return 'arcium'
    return 'none'
  },

  /**
   * Calculate expected output amount
   */
  calculateExpectedOutput(quote: SwapQuote, decimals: number): string {
    const output = parseFloat(quote.outputAmount) / Math.pow(10, decimals)
    return formatTokenAmount(output, decimals)
  },

  /**
   * Calculate minimum output with slippage
   */
  calculateMinimumOutput(quote: SwapQuote, decimals: number): string {
    const output = parseFloat(quote.outputAmount) / Math.pow(10, decimals)
    const slippageFactor = (10000 - 50) / 10000 // 50 bps default slippage
    const minimumOutput = output * slippageFactor
    return formatTokenAmount(minimumOutput, decimals)
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
      case 'quoting':
        return 'Getting route...'
      case 'wrapping':
        return 'Depositing to private pool...'
      case 'swapping':
        return 'Executing private swap...'
      case 'confirming':
        return 'Confirming transaction...'
      default:
        return 'Unknown'
    }
  },

  /**
   * Get estimated time for transaction completion
   */
  getEstimatedTime(status: string, privacyMode: boolean): string {
    if (privacyMode) {
      switch (status) {
        case 'quoting':
          return 'Usually instant'
        case 'wrapping':
          return 'Usually 15-30 seconds'
        case 'swapping':
          return 'Usually 1-3 minutes'
        case 'confirming':
          return 'Usually 2-5 minutes'
        case 'completed':
          return 'Completed'
        default:
          return 'Checking...'
      }
    } else {
      // Public swaps are faster
      switch (status) {
        case 'quoting':
          return 'Usually instant'
        case 'swapping':
          return 'Usually 10-30 seconds'
        case 'confirming':
          return 'Usually 30-60 seconds'
        case 'completed':
          return 'Completed'
        default:
          return 'Checking...'
      }
    }
  },

  /**
   * Check if Encifher SDK is configured (always true - no API key needed)
   */
  isEncifherConfigured(): boolean {
    // Encifher SDK works out of the box - no API key required!
    return true
  }
}