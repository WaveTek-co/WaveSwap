/**
 * Confidential Token Service - Wrap/unwrap operations for private tokens
 *
 * This service handles:
 * - Wrapping regular SPL tokens into confidential tokens (cTOKEN)
 * - Unwrapping confidential tokens back to regular tokens
 * - Managing the conversion between regular and confidential token addresses
 * - Handling the transaction flow for private deposits/withdrawals
 */

import { Connection, PublicKey, Transaction } from '@solana/web3.js'
import { EncifherClient, EncifherConfig } from '@/lib/encifher'
import { Token, SwapQuote, SwapMode } from '@/types/token'
import {
  isConfidentialTokenAddress,
  extractUnderlyingTokenAddress,
  generateConfidentialTokenAddress,
  createConfidentialToken,
  getUnderlyingToken
} from '@/types/token'

export interface WrapParams {
  token: Token
  amount: string // In display units (e.g., 1.5 USDC)
  userPublicKey: PublicKey
}

export interface UnwrapParams {
  confidentialToken: Token
  amount: string // In display units
  userPublicKey: PublicKey
}

export interface WrapResult {
  transaction: Transaction
  wrappedAmount: string
  confidentialToken: Token
  success: boolean
  error?: string
}

export interface UnwrapResult {
  transaction: Transaction
  unwrappedAmount: string
  underlyingToken: Token
  success: boolean
  error?: string
}

export interface ConversionQuote {
  inputToken: Token
  outputToken: Token
  inputAmount: string
  outputAmount: string
  conversionRate: number
  fees: {
    wrappingFee?: string
    unwrappingFee?: string
    platformFee?: string
  }
  estimatedTime: string
}

export class ConfidentialTokenService {
  private encifherClient: EncifherClient | null = null
  private connection: Connection
  private isInitialized = false

  constructor(connection: Connection) {
    this.connection = connection
  }

  /**
   * Initialize the service with EncifHer configuration
   */
  async initialize(encifherConfig: EncifherConfig): Promise<void> {
    try {
      this.encifherClient = new EncifherClient(this.connection, encifherConfig)
      this.isInitialized = true
      console.log('[ConfidentialTokenService] Initialized successfully')
    } catch (error) {
      console.error('[ConfidentialTokenService] Initialization failed:', error)
      throw new Error(`Failed to initialize confidential token service: ${error}`)
    }
  }

  /**
   * Check if service is properly initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.encifherClient !== null
  }

  /**
   * Wrap regular token into confidential token
   * @param params Wrapping parameters
   * @returns Wrap transaction and result
   */
  async wrapToken(params: WrapParams): Promise<WrapResult> {
    if (!this.isReady() || !this.encifherClient) {
      return {
        transaction: new Transaction(),
        wrappedAmount: '0',
        confidentialToken: params.token,
        success: false,
        error: 'Confidential token service not initialized'
      }
    }

    try {
      // Create confidential token version
      const confidentialToken = createConfidentialToken(params.token)

      // Use underlying token address for EncifHer operations
      const underlyingAddress = params.token.isConfidentialToken
        ? params.token.underlyingTokenAddress || extractUnderlyingTokenAddress(params.token.address)
        : params.token.address

      // Convert to base units for EncifHer
      const decimals = params.token.decimals
      const amountInBaseUnits = (parseFloat(params.amount) * Math.pow(10, decimals)).toString()

      // Create deposit transaction using EncifHer
      const depositResult = await this.encifherClient.privateDeposit({
        token: {
          tokenMintAddress: underlyingAddress,
          decimals: decimals,
          isConfidentialSupported: true
        },
        amount: params.amount, // Pass in display units, EncifHer will handle conversion
        userPublicKey: params.userPublicKey
      })

      console.log('[ConfidentialTokenService] Wrap transaction created:', {
        token: params.token.symbol,
        amount: params.amount,
        confidentialToken: confidentialToken.symbol,
        user: params.userPublicKey.toBase58()
      })

      return {
        transaction: depositResult.transaction,
        wrappedAmount: params.amount,
        confidentialToken,
        success: true
      }

    } catch (error) {
      console.error('[ConfidentialTokenService] Wrap failed:', error)
      return {
        transaction: new Transaction(),
        wrappedAmount: '0',
        confidentialToken: params.token,
        success: false,
        error: `Wrapping failed: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Unwrap confidential token back to regular token
   * @param params Unwrapping parameters
   * @returns Unwrap transaction and result
   */
  async unwrapToken(params: UnwrapParams): Promise<UnwrapResult> {
    if (!this.isReady() || !this.encifherClient) {
      return {
        transaction: new Transaction(),
        unwrappedAmount: '0',
        underlyingToken: params.confidentialToken,
        success: false,
        error: 'Confidential token service not initialized'
      }
    }

    try {
      // Get underlying token
      const underlyingToken = getUnderlyingToken(params.confidentialToken)
      if (!underlyingToken) {
        return {
          transaction: new Transaction(),
          unwrappedAmount: '0',
          underlyingToken: params.confidentialToken,
          success: false,
          error: 'Invalid confidential token - no underlying token found'
        }
      }

      // Use underlying token address for EncifHer operations
      const underlyingAddress = underlyingToken.address

      // Create withdrawal transaction using EncifHer
      const withdrawResult = await this.encifherClient.privateWithdraw({
        token: {
          tokenMintAddress: underlyingAddress,
          decimals: params.confidentialToken.decimals,
          isConfidentialSupported: true
        },
        amount: params.amount, // Pass in display units, EncifHer will handle conversion
        userPublicKey: params.userPublicKey
      })

      console.log('[ConfidentialTokenService] Unwrap transaction created:', {
        confidentialToken: params.confidentialToken.symbol,
        underlyingToken: underlyingToken.symbol,
        amount: params.amount,
        user: params.userPublicKey.toBase58()
      })

      return {
        transaction: withdrawResult.transaction,
        unwrappedAmount: params.amount,
        underlyingToken,
        success: true
      }

    } catch (error) {
      console.error('[ConfidentialTokenService] Unwrap failed:', error)
      return {
        transaction: new Transaction(),
        unwrappedAmount: '0',
        underlyingToken: params.confidentialToken,
        success: false,
        error: `Unwrapping failed: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Get quote for token wrapping/unwrapping
   * @param fromToken Source token
   * @param toToken Target token
   * @param amount Amount to convert
   * @returns Quote with conversion details
   */
  getConversionQuote(
    fromToken: Token,
    toToken: Token,
    amount: string
  ): ConversionQuote {
    const isWrapping = !fromToken.isConfidentialToken && toToken.isConfidentialToken
    const isUnwrapping = fromToken.isConfidentialToken && !toToken.isConfidentialToken

    // For wrap/unwrap operations, conversion rate is 1:1 minus fees
    const conversionRate = 0.998 // 0.2% fee
    const outputAmount = (parseFloat(amount) * conversionRate).toString()
    const feeAmount = (parseFloat(amount) * 0.002).toString()

    return {
      inputToken: fromToken,
      outputToken: toToken,
      inputAmount: amount,
      outputAmount,
      conversionRate,
      fees: {
        wrappingFee: isWrapping ? feeAmount : undefined,
        unwrappingFee: isUnwrapping ? feeAmount : undefined,
        platformFee: feeAmount
      },
      estimatedTime: isWrapping ? '30-60 seconds' : '30-60 seconds'
    }
  }

  /**
   * Check if a swap requires wrapping/unwrapping
   * @param inputToken Input token
   * @param outputToken Output token
   * @param swapMode Current swap mode
   * @returns Conversion requirements
   */
  analyzeConversionRequirements(
    inputToken: Token,
    outputToken: Token,
    swapMode: SwapMode
  ): {
    needsWrapping: boolean
    needsUnwrapping: boolean
    conversionSteps: Array<'wrap' | 'private-swap' | 'unwrap'>
  } {
    // In privacy mode, all tokens should be confidential
    const inputShouldBeConfidential = swapMode === SwapMode.PRIVATE
    const outputShouldBeConfidential = swapMode === SwapMode.PRIVATE

    const needsWrapping = !(inputToken.isConfidentialToken ?? false) && inputShouldBeConfidential
    const needsUnwrapping = (outputToken.isConfidentialToken ?? false) && !outputShouldBeConfidential

    // Build conversion pipeline
    const conversionSteps: Array<'wrap' | 'private-swap' | 'unwrap'> = []

    if (needsWrapping) {
      conversionSteps.push('wrap')
    }

    if (swapMode === SwapMode.PRIVATE) {
      conversionSteps.push('private-swap')
    }

    if (needsUnwrapping) {
      conversionSteps.push('unwrap')
    }

    return {
      needsWrapping,
      needsUnwrapping,
      conversionSteps
    }
  }

  /**
   * Auto-wrap token for privacy mode if needed
   * @param token Original token
   * @param swapMode Current swap mode
   * @returns Appropriate token version for the mode
   */
  autoWrapToken(token: Token, swapMode: SwapMode): Token {
    if (swapMode === SwapMode.PRIVATE && !token.isConfidentialToken) {
      return createConfidentialToken(token)
    }
    return token
  }

  /**
   * Convert token addresses for EncifHer API calls
   * @param token Token to convert
   * @returns Address format expected by EncifHer
   */
  toEncifherAddress(token: Token): string {
    if (token.isConfidentialToken) {
      // Use underlying token address for EncifHer operations
      return token.underlyingTokenAddress || extractUnderlyingTokenAddress(token.address)
    }
    return token.address
  }

  /**
   * Check if address is a confidential token
   */
  isConfidentialToken(tokenAddress: string): boolean {
    return isConfidentialTokenAddress(tokenAddress)
  }

  /**
   * Get underlying token address
   */
  getUnderlyingAddress(tokenAddress: string): string {
    return extractUnderlyingTokenAddress(tokenAddress)
  }
}

/**
 * Singleton instance for the service
 */
let confidentialTokenService: ConfidentialTokenService | null = null

export function getConfidentialTokenService(connection?: Connection): ConfidentialTokenService {
  if (!confidentialTokenService && connection) {
    confidentialTokenService = new ConfidentialTokenService(connection)
  }
  return confidentialTokenService!
}

/**
 * Service utilities
 */
export const ConfidentialTokenUtils = {
  /**
   * Format wrap/unwrap status for display
   */
  formatConversionStatus(step: 'wrap' | 'unwrap' | 'private-swap'): string {
    switch (step) {
      case 'wrap':
        return 'Converting to confidential token...'
      case 'private-swap':
        return 'Swapping privately...'
      case 'unwrap':
        return 'Converting back to regular token...'
      default:
        return 'Processing...'
    }
  },

  /**
   * Get estimated time for conversion step
   */
  getConversionTime(step: 'wrap' | 'unwrap' | 'private-swap'): string {
    switch (step) {
      case 'wrap':
        return '~30 seconds'
      case 'private-swap':
        return '~2-5 minutes'
      case 'unwrap':
        return '~30 seconds'
      default:
        return '~1 minute'
    }
  }
}