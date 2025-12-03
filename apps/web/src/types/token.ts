/**
 * Token Types and Interfaces for WaveSwap DEX
 *
 * This file defines all token-related interfaces and provides common token configurations.
 */

import { JupiterTokenService, POPULAR_TOKEN_ADDRESSES, OTHER_TOKEN_ADDRESSES } from '@/lib/jupiterTokens'

// Helper function to get local fallback icon path
function getLocalFallbackIcon(symbol: string, address: string): string | null {
  const tokenIcons: { [key: string]: string | null } = {
    // Popular tokens with local fallback icons
    'WAVE': '/icons/fallback/token/wave.png',
    'SOL': '/icons/fallback/token/sol.png',
    'USDC': '/icons/fallback/token/usdc.png',
    'USDT': '/icons/fallback/token/usdt.png',
    'ZEC': '/icons/fallback/token/zec.png',
    'PUMP': '/icons/fallback/token/pump.png',
    'CASH': '/icons/fallback/token/cash.png',
    // Other tokens with local fallback icons
    'WEALTH': '/icons/fallback/token/wealth.png',
    'FTP': '/icons/fallback/token/ftp.jpg',
    'AURA': '/icons/fallback/token/aura.png',
    'MEW': '/icons/fallback/token/mew.png',
    'STORE': '/icons/fallback/token/store.png',
    // Additional tokens from fallback icons
    'XBTC': '/icons/fallback/token/xbtc.png',
    'GOLD': '/icons/fallback/token/gold.png'
  }

  return tokenIcons[symbol.toUpperCase()] || tokenIcons[address] || null
}

export interface Token {
  address: string
  chainId: number
  decimals: number
  name: string
  symbol: string
  logoURI: string
  tags: string[]
  isConfidentialSupported: boolean
  isNative: boolean
  addressable: boolean
  // Encifher privacy support
  encifherSupported?: boolean
  privacyProviders?: string[]
  minPrivateAmount?: string
  // Confidential token properties
  isConfidentialToken?: boolean
  underlyingTokenAddress?: string
  confidentialVersion?: number
}

export interface TokenWithBalance extends Token {
  balance: string
  balanceUsd?: number
  isBalanceLoading: boolean
}


export interface SwapContext {
  inputToken: Token | null
  outputToken: Token | null
  inputAmount: string
  outputAmount: string
  swapMode: SwapMode
  quote: SwapQuote | null
  balances: Map<string, string>
  isLoading: boolean
  error: string | null
  structuredError: any
  progress: SwapProgress | null
  availableTokens: Token[]
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
  withdrawConfidentialTokens: (tokenAddress: string, amount: number) => Promise<void>
}

export interface SwapQuote {
  inputMint: string
  outputMint: string
  inputAmount: string
  outputAmount: string
  priceImpactPct: number
  routePlan?: any[]
  swapTransaction?: string
  setupTransaction?: string
  computeUnitLimit?: number
  computeUnitPriceMicroLamports?: number
  fee?: {
    amount: string
    mint: string
    pct: string
  }
}

export interface SwapProgress {
  status: SwapStatus
  message: string
  currentStep: number
  totalSteps: number
  txid?: string
  error?: string
}

export interface SwapExecution {
  quote: SwapQuote
  transaction: any
  wrappingTx?: any
  privacyMode: boolean
  status: SwapStatus
  error?: string
  orderId?: string
}

export enum SwapStatus {
  IDLE = 'idle',
  QUOTING = 'quoting',
  QUOTE_READY = 'quote_ready',
  BUILDING_TRANSACTION = 'building_transaction',
  TRANSACTION_READY = 'transaction_ready',
  WRAPPING = 'wrapping',
  UNWRAPPING = 'unwrapping',
  SWAPPING = 'swapping',
  CONFIRMING = 'confirming',
  SIGNING_TRANSACTION = 'signing_transaction',
  SENDING_TRANSACTION = 'sending_transaction',
  CONFIRMING_TRANSACTION = 'confirming_transaction',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export enum SwapMode {
  NORMAL = 'normal',
  PRIVATE = 'private'
}

/**
 * Encifher Order Status for tracking confidential transactions
 */
export enum EncifherOrderStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

/**
 * Common tokens with working Solana token list logo URLs
 */
export const COMMON_TOKENS: Token[] = [
  {
    address: 'So11111111111111111111111111111111111111112',
    chainId: 101,
    decimals: 9,
    name: 'Solana',
    symbol: 'SOL',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
    tags: ['native', 'solana'],
    isConfidentialSupported: true,
    isNative: true,
    addressable: true,
    encifherSupported: true,
    privacyProviders: ['encifher', 'arcium'],
    minPrivateAmount: '0.001'
  },
  {
    address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    chainId: 101,
    decimals: 6,
    name: 'USD Coin',
    symbol: 'USDC',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
    tags: ['stablecoin', 'usdc'],
    isConfidentialSupported: true,
    isNative: false,
    addressable: true,
    encifherSupported: true,
    privacyProviders: ['encifher', 'arcium'],
    minPrivateAmount: '1'
  },
  {
    address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    chainId: 101,
    decimals: 6,
    name: 'Tether USD',
    symbol: 'USDT',
    logoURI: 'https://img-cdn.jup.ag/tokens/USDT.svg',
    tags: ['stablecoin', 'usdt'],
    isConfidentialSupported: true,
    isNative: false,
    addressable: true
  },
  {
    address: 'GoLDppdjB1vDTPSGxyMJFqdnj134yH6Prg9eqsGDiw6A',
    chainId: 101,
    decimals: 9,
    name: 'Gold',
    symbol: 'GOLD',
    logoURI: '/icons/fallback/token/gold.png',
    tags: ['defi', 'gold', 'asset'],
    isConfidentialSupported: false,
    isNative: false,
    addressable: true
  },
  {
    address: 'A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS',
    chainId: 101,
    decimals: 8,
    name: 'Zcash',
    symbol: 'ZEC',
    logoURI: 'https://img-cdn.jup.ag/tokens/ZEC.svg',
    tags: ['bridge', 'privacy'],
    isConfidentialSupported: false,
    isNative: false,
    addressable: true
  },
  {
    address: 'pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn',
    chainId: 101,
    decimals: 6,
    name: 'Pump',
    symbol: 'PUMP',
    logoURI: 'https://img-cdn.jup.ag/tokens/PUMP.svg',
    tags: ['meme'],
    isConfidentialSupported: false,
    isNative: false,
    addressable: true
  },
  {
    address: 'BSxPC3Vu3X6UCtEEAYyhxAEo3rvtS4dgzzrvnERDpump',
    chainId: 101,
    decimals: 6,
    name: 'Wealth',
    symbol: 'WEALTH',
    logoURI: 'https://img-cdn.jup.ag/tokens/WEALTH.svg',
    tags: ['defi'],
    isConfidentialSupported: false,
    isNative: false,
    addressable: true
  },
  {
    address: 'J2eaKn35rp82T6RFEsNK9CLRHEKV9BLXjedFM3q6pump',
    chainId: 101,
    decimals: 6,
    name: 'FTP',
    symbol: 'FTP',
    logoURI: 'https://img-cdn.jup.ag/tokens/FTP.svg',
    tags: ['defi'],
    isConfidentialSupported: false,
    isNative: false,
    addressable: true
  },
  {
    address: 'DtR4D9FtVoTX2569gaL837ZgrB6wNjj6tkmnX9Rdk9B2',
    chainId: 101,
    decimals: 6,
    name: 'Aura',
    symbol: 'AURA',
    logoURI: 'https://img-cdn.jup.ag/tokens/AURA.svg',
    tags: ['defi'],
    isConfidentialSupported: false,
    isNative: false,
    addressable: true
  },
  {
    address: 'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5',
    chainId: 101,
    decimals: 9,
    name: 'MEW',
    symbol: 'MEW',
    logoURI: 'https://img-cdn.jup.ag/tokens/MEW.svg',
    tags: ['meme'],
    isConfidentialSupported: false,
    isNative: false,
    addressable: true
  },
  {
    address: 'FLJYGHpCCcfYUdzhcfHSeSd2peb5SMajNWaCsRnhpump',
    chainId: 101,
    decimals: 6,
    name: 'Store',
    symbol: 'STORE',
    logoURI: 'https://img-cdn.jup.ag/tokens/STORE.svg',
    tags: ['defi'],
    isConfidentialSupported: false,
    isNative: false,
    addressable: true
  }
]

/**
 * Confidential tokens (wrapped tokens with privacy)
 * REMOVED: Hardcoded confidential tokens should not be used anymore
 * Only use actual tokens from user's Encifher account
 */
export const CONFIDENTIAL_TOKENS: Token[] = []

/**
 * Get available tokens based on privacy mode using Jupiter Token API v2
 */
export async function getAvailableTokens(privacyMode: boolean): Promise<Token[]> {
  console.log('[getAvailableTokens] Starting token loading with privacyMode:', privacyMode)
  try {
    // Get all available tokens from Jupiter API v2
    const [popularTokens, otherTokens] = await Promise.all([
      JupiterTokenService.getPopularTokens(),
      JupiterTokenService.getOtherTokens()
    ])

    // Convert JupiterToken to Token format
    const convertJupiterToToken = (jupiterToken: any): Token => {
      console.log(`[getAvailableTokens] Converting token: ${jupiterToken.symbol} (${jupiterToken.id}), isConfidentialSupported=${jupiterToken.isConfidentialSupported}`)
      return ({
      address: jupiterToken.id, // Use id from Jupiter API
      chainId: 101, // Solana mainnet
      decimals: jupiterToken.decimals || 9,
      name: jupiterToken.name || 'Unknown',
      symbol: jupiterToken.symbol || 'UNKNOWN',
      logoURI: jupiterToken.icon || getLocalFallbackIcon(jupiterToken.symbol || '', jupiterToken.id) || '/icons/default-token.svg', // Use Jupiter API icon with local fallback
      tags: jupiterToken.tags || [],
          isConfidentialSupported: jupiterToken.isConfidentialSupported || false, // Use value from JupiterTokenService
      isNative: jupiterToken.id === 'So11111111111111111111111111111111111111112',
      addressable: true,
      // Add privacy support if token is in COMMON_TOKENS
      encifherSupported: COMMON_TOKENS.find(ct => ct.address === jupiterToken.id)?.encifherSupported || false,
      privacyProviders: COMMON_TOKENS.find(ct => ct.address === jupiterToken.id)?.privacyProviders || [],
      minPrivateAmount: COMMON_TOKENS.find(ct => ct.address === jupiterToken.id)?.minPrivateAmount
      })
    }

    const allJupiterTokens = [...popularTokens, ...otherTokens].map(convertJupiterToToken)

    // Create a map of existing Jupiter tokens for quick lookup
    const jupiterTokenMap = new Map(allJupiterTokens.map(t => [t.address, t]))

    // Ensure all tokens from TODO.md are included with fallback data
    const TODO_TOKENS = [
      // Popular tokens
      { address: '4AGxpKxYnw7g1ofvYDs5Jq2a1ek5kB9jS2NTUaippump', symbol: 'WAVE', name: 'Wave' },
      { address: 'So11111111111111111111111111111111111111112', symbol: 'SOL', name: 'Solana' },
      { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', name: 'USD Coin' },
      { address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', symbol: 'USDT', name: 'Tether USD' },
      { address: 'A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS', symbol: 'ZEC', name: 'Zcash' },
      { address: 'pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn', symbol: 'PUMP', name: 'Pump' },
      // Other tokens
      { address: 'BSxPC3Vu3X6UCtEEAYyhxAEo3rvtS4dgzzrvnERDpump', symbol: 'WEALTH', name: 'Wealth' },
      { address: 'J2eaKn35rp82T6RFEsNK9CLRHEKV9BLXjedFM3q6pump', symbol: 'FTP', name: 'FTP' },
      { address: 'DtR4D9FtVoTX2569gaL837ZgrB6wNjj6tkmnX9Rdk9B2', symbol: 'AURA', name: 'Aura' },
      { address: 'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5', symbol: 'MEW', name: 'MEW' },
      { address: 'FLJYGHpCCcfYUdzhcfHSeSd2peb5SMajNWaCsRnhpump', symbol: 'STORE', name: 'Store' }
    ]

    // Add missing TODO tokens with fallback data
    const missingTodoTokens = TODO_TOKENS.filter(todoToken => !jupiterTokenMap.has(todoToken.address))
      .map(todoToken => {
        const commonToken = COMMON_TOKENS.find(ct => ct.address === todoToken.address)

        // Special handling for WAVE token - most pump.fun tokens use 6 decimals
        let decimals = 9 // default
        if (todoToken.address === '4AGxpKxYnw7g1ofvYDs5Jq2a1ek5kB9jS2NTUaippump') {
          decimals = 6 // WAVE token uses 6 decimals
        } else if (commonToken?.decimals) {
          decimals = commonToken.decimals
        }

        return {
          address: todoToken.address,
          chainId: 101,
          decimals: decimals,
          name: commonToken?.name || todoToken.name,
          symbol: commonToken?.symbol || todoToken.symbol,
          logoURI: getLocalFallbackIcon(todoToken.symbol, todoToken.address) || '/icons/default-token.svg', // Local fallback
          tags: commonToken?.tags || [],
          isConfidentialSupported: commonToken?.isConfidentialSupported || false,
          isNative: todoToken.address === 'So11111111111111111111111111111111111111112',
          addressable: true,
          encifherSupported: commonToken?.encifherSupported || false,
          privacyProviders: commonToken?.privacyProviders || [],
          minPrivateAmount: commonToken?.minPrivateAmount
        } as Token
      })

    // Add common tokens for compatibility (for tokens not found in Jupiter API)
    const jupiterTokenAddresses = new Set(allJupiterTokens.map(t => t.address))
    const missingCommonTokens = COMMON_TOKENS.filter(ct => !jupiterTokenAddresses.has(ct.address) && !missingTodoTokens.some(mt => mt.address === ct.address))
    const commonTokensAsToken = missingCommonTokens.map(token => ({...token}))

    // Merge all tokens
    let allTokens = [...allJupiterTokens, ...missingTodoTokens, ...commonTokensAsToken]

    // REMOVED: Do not automatically create confidential tokens in getAvailableTokens
    // Confidential tokens should only come from user's actual Encifher account balances
    // This prevents showing hardcoded tokens that the user doesn't actually own
    if (privacyMode) {
      console.log('[getAvailableTokens] Privacy mode enabled - confidential tokens will be loaded from user account only')
    }

    // Sort: Popular tokens maintain their exact order, others come after
    allTokens.sort((a, b) => {
      const aPopularIndex = POPULAR_TOKEN_ADDRESSES.indexOf(a.address)
      const bPopularIndex = POPULAR_TOKEN_ADDRESSES.indexOf(b.address)
      const aOtherIndex = OTHER_TOKEN_ADDRESSES.indexOf(a.address)
      const bOtherIndex = OTHER_TOKEN_ADDRESSES.indexOf(b.address)

      // Both in popular tokens - maintain order
      if (aPopularIndex !== -1 && bPopularIndex !== -1) {
        return aPopularIndex - bPopularIndex
      }

      // One in popular tokens, popular comes first
      if (aPopularIndex !== -1 && bPopularIndex === -1) return -1
      if (aPopularIndex === -1 && bPopularIndex !== -1) return 1

      // Both in other tokens - maintain order
      if (aOtherIndex !== -1 && bOtherIndex !== -1) {
        return aOtherIndex - bOtherIndex
      }

      // One in other tokens
      if (aOtherIndex !== -1 && bOtherIndex === -1) return -1
      if (aOtherIndex === -1 && bOtherIndex !== -1) return 1

      // Neither in predefined lists - alphabetical
      return a.symbol.localeCompare(b.symbol)
    })

    console.log('[getAvailableTokens] Successfully loaded tokens:', allTokens.length, allTokens.map(t => ({ symbol: t.symbol, address: t.address })))
    return allTokens

  } catch (error) {
    console.error('Error fetching available tokens from Jupiter API:', error)

    // Fallback: Include COMMON_TOKENS + all TODO tokens if Jupiter API fails
    const TODO_TOKENS = [
      // Popular tokens
      { address: '4AGxpKxYnw7g1ofvYDs5Jq2a1ek5kB9jS2NTUaippump', symbol: 'WAVE', name: 'Wave' },
      { address: 'So11111111111111111111111111111111111111112', symbol: 'SOL', name: 'Solana' },
      { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', name: 'USD Coin' },
      { address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', symbol: 'USDT', name: 'Tether USD' },
      { address: 'A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS', symbol: 'ZEC', name: 'Zcash' },
      { address: 'pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn', symbol: 'PUMP', name: 'Pump' },
      // Other tokens
      { address: 'BSxPC3Vu3X6UCtEEAYyhxAEo3rvtS4dgzzrvnERDpump', symbol: 'WEALTH', name: 'Wealth' },
      { address: 'J2eaKn35rp82T6RFEsNK9CLRHEKV9BLXjedFM3q6pump', symbol: 'FTP', name: 'FTP' },
      { address: 'DtR4D9FtVoTX2569gaL837ZgrB6wNjj6tkmnX9Rdk9B2', symbol: 'AURA', name: 'Aura' },
      { address: 'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5', symbol: 'MEW', name: 'MEW' },
      { address: 'FLJYGHpCCcfYUdzhcfHSeSd2peb5SMajNWaCsRnhpump', symbol: 'STORE', name: 'Store' }
    ]

    // Add missing TODO tokens with fallback data
    const fallbackTodoTokens = TODO_TOKENS.map(todoToken => {
      const commonToken = COMMON_TOKENS.find(ct => ct.address === todoToken.address)

      // Special handling for WAVE token - most pump.fun tokens use 6 decimals
      let decimals = 9 // default
      if (todoToken.address === '4AGxpKxYnw7g1ofvYDs5Jq2a1ek5kB9jS2NTUaippump') {
        decimals = 6 // WAVE token uses 6 decimals
      } else if (commonToken?.decimals) {
        decimals = commonToken.decimals
      }

      return {
        address: todoToken.address,
        chainId: 101,
        decimals: decimals,
        name: commonToken?.name || todoToken.name,
        symbol: commonToken?.symbol || todoToken.symbol,
        logoURI: getLocalFallbackIcon(todoToken.symbol, todoToken.address) || '/icons/default-token.svg', // Local fallback
        tags: commonToken?.tags || [],
        isConfidentialSupported: commonToken?.isConfidentialSupported || false,
        isNative: todoToken.address === 'So11111111111111111111111111111111111111112',
        addressable: true,
        encifherSupported: commonToken?.encifherSupported || false,
        privacyProviders: commonToken?.privacyProviders || [],
        minPrivateAmount: commonToken?.minPrivateAmount
      } as Token
    })

    // Merge COMMON_TOKENS with fallback TODO tokens
    let allTokens = [...COMMON_TOKENS, ...fallbackTodoTokens]

    // Remove duplicates (prefer COMMON_TOKENS versions)
    const uniqueTokens = new Map<string, Token>()
    COMMON_TOKENS.forEach(token => uniqueTokens.set(token.address, token))
    fallbackTodoTokens.forEach(token => {
      if (!uniqueTokens.has(token.address)) {
        uniqueTokens.set(token.address, token)
      }
    })

    let tokens = Array.from(uniqueTokens.values())

    // REMOVED: Do not automatically create confidential tokens in getAvailableTokens (fallback)
    // Confidential tokens should only come from user's actual Encifher account balances
    if (privacyMode) {
      console.log('[getAvailableTokens] Privacy mode enabled (fallback) - confidential tokens will be loaded from user account only')
    }

    // Sort: Popular tokens first, then others
    tokens.sort((a, b) => {
      const aPopularIndex = POPULAR_TOKEN_ADDRESSES.indexOf(a.address)
      const bPopularIndex = POPULAR_TOKEN_ADDRESSES.indexOf(b.address)

      if (aPopularIndex !== -1 && bPopularIndex === -1) return -1
      if (aPopularIndex === -1 && bPopularIndex !== 1) return 1
      if (aPopularIndex !== -1 && bPopularIndex !== -1) return aPopularIndex - bPopularIndex

      return a.symbol.localeCompare(b.symbol)
    })

    console.log('[getAvailableTokens] Using fallback tokens:', tokens.length, tokens.map(t => ({ symbol: t.symbol, address: t.address })))
    return tokens
  }
}



export interface SwapContextType {
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
  withdrawConfidentialTokens: (tokenAddress: string, amount: number) => Promise<void>
}

export interface WaveSwapError {
  code: string
  message: string
  details?: any
  action?: string
  recoverable: boolean
}

/**
 * Confidential Token Utilities
 */

/**
 * Generate confidential token address from regular token address
 * Uses a deterministic mapping: adds 'c' prefix to the address
 */
export function generateConfidentialTokenAddress(tokenAddress: string): string {
  return 'c' + tokenAddress
}

/**
 * Extract underlying token address from confidential token address
 */
export function extractUnderlyingTokenAddress(confidentialAddress: string): string {
  if (confidentialAddress.startsWith('c')) {
    return confidentialAddress.substring(1)
  }
  return confidentialAddress
}

/**
 * Check if a token address is a confidential token
 */
export function isConfidentialTokenAddress(tokenAddress: string): boolean {
  return tokenAddress.startsWith('c')
}

/**
 * Generate confidential token symbol from regular token symbol
 */
export function generateConfidentialTokenSymbol(symbol: string): string {
  return 'c' + symbol
}

/**
 * Extract underlying token symbol from confidential token symbol
 */
export function extractUnderlyingTokenSymbol(confidentialSymbol: string): string {
  if (confidentialSymbol.startsWith('c')) {
    return confidentialSymbol.substring(1)
  }
  return confidentialSymbol
}

/**
 * Check if a token symbol is a confidential token
 */
export function isConfidentialTokenSymbol(symbol: string): boolean {
  return symbol.startsWith('c')
}

/**
 * Create confidential token version from regular token
 */
export function createConfidentialToken(token: Token): Token {
  return {
    ...token,
    address: generateConfidentialTokenAddress(token.address),
    symbol: generateConfidentialTokenSymbol(token.symbol),
    name: token.name?.startsWith('Confidential ') ? token.name : `Confidential ${token.name}`,
    tags: [...token.tags, 'confidential', 'wrapped'],
    isConfidentialSupported: true,
    isConfidentialToken: true,
    underlyingTokenAddress: token.address,
    confidentialVersion: 1,
    // Confidential tokens are not directly addressable
    addressable: false,
    // Inherit privacy support from underlying token
    encifherSupported: true,
    privacyProviders: ['encifher'],
    minPrivateAmount: token.minPrivateAmount || '0.001'
  }
}

/**
 * Get underlying token from confidential token
 */
export function getUnderlyingToken(confidentialToken: Token): Token | null {
  if (!confidentialToken.underlyingTokenAddress) {
    return null
  }

  return {
    ...confidentialToken,
    address: confidentialToken.underlyingTokenAddress,
    symbol: extractUnderlyingTokenSymbol(confidentialToken.symbol),
    name: confidentialToken.name.replace('Confidential ', ''),
    tags: confidentialToken.tags.filter(tag => tag !== 'confidential' && tag !== 'wrapped'),
    isConfidentialSupported: false,
    isConfidentialToken: false,
    underlyingTokenAddress: undefined,
    confidentialVersion: undefined,
    // Regular tokens are addressable
    addressable: true
  }
}