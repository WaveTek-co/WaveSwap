/**
 * Token Management using Jupiter Token API
 * API: https://hub.jup.ag/docs/token-api/
 */

import { Connection, PublicKey } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { Token } from '@/types/token'
import { config } from '@/lib/config'

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

const JUPITER_TOKEN_API = 'https://lite-api.jup.ag/tokens/v2'
const JUPITER_TOKEN_LIST_API = 'https://token.jup.ag/all'

export interface JupiterToken {
  address: string
  name: string
  symbol: string
  decimals: number
  logoURI?: string
  tags?: string[]
  daily_volume?: number
  freeze_authority?: string | null
  mint_authority?: string | null
}


export async function enrichTokenIcons(tokens: Token[]): Promise<Token[]> {
  
  // Simply return tokens as-is since they already have working logoURIs
  return tokens
}

/**
 * Fetch user's token accounts and balances - Performance optimized version
 */
export async function getUserTokens(
  connection: Connection,
  walletAddress: PublicKey
): Promise<Token[]> {
  try {
    // Start with precomputed default tokens immediately for instant UI
    const userTokens = [...DEFAULT_TOKENS]

    // Get all token accounts in parallel with SOL balance
    const [tokenAccounts, solBalance] = await Promise.race([
      Promise.all([
        connection.getParsedTokenAccountsByOwner(walletAddress, { programId: TOKEN_PROGRAM_ID }),
        connection.getBalance(walletAddress)
      ]),
      new Promise<[any, number]>(resolve => setTimeout(() => resolve([{ value: [] }, 0]), 3000)) // 3 second timeout
    ])

    // SOL token is already included with proper address from DEFAULT_TOKENS

    // Early return if no token accounts for instant performance
    if (!tokenAccounts.value || tokenAccounts.value.length === 0) {
      return userTokens
    }

    // Extract unique mints for batch processing
    const uniqueMints = [...new Set(
      tokenAccounts.value
        .map(({ account }: any) => account.data.parsed.info.mint)
        .filter((mint: string) => mint && !TOKEN_ADDRESS_MAP.has(mint))
    )]

    // Skip processing if no unknown tokens
    if (uniqueMints.length === 0) {
      return userTokens
    }

    // Batch process unknown tokens with aggressive timeout
    const tokenProcessingPromises = uniqueMints.map(async (mint) => {
      try {
        // Find account info for this mint
        const accountInfo = tokenAccounts.value.find(
          ({ account }: any) => account.data.parsed.info.mint === mint
        )

        if (!accountInfo) return null

        const balance = accountInfo.account.data.parsed.info.tokenAmount.uiAmount || 0
        if (balance <= 0) return null // Skip zero balance unknown tokens

        const tokenInfo = await fetchTokenInfo(mint as string)
        if (!tokenInfo) return null

        return {
          address: mint,
          chainId: 101,
          decimals: tokenInfo.decimals,
          name: tokenInfo.name,
          symbol: tokenInfo.symbol,
          logoURI: tokenInfo.logoURI || '',
          tags: tokenInfo.tags || [],
          isConfidentialSupported: ['SOL', 'USDC', 'USDT'].includes(tokenInfo.symbol),
          isNative: false,
          addressable: true,
        }
      } catch (error) {
                return null
      }
    })

    // Process with aggressive timeout
    const processedTokens = await Promise.race([
      Promise.all(tokenProcessingPromises),
      new Promise<null[]>(resolve => setTimeout(() => resolve([]), 3000)) // Reduced to 3 seconds
    ])

    // Filter and merge valid tokens efficiently
    const validTokens = processedTokens.filter((token): token is NonNullable<typeof token> => token !== null)
    userTokens.push(...validTokens as Token[])

    return userTokens
  } catch (error) {
      // Return precomputed default tokens instantly on error
    return DEFAULT_TOKENS
  }
}

// Cache for token info to avoid repeated API calls
const tokenInfoCache = new Map<string, JupiterToken | null>()
const CACHE_DURATION = 15 * 60 * 1000 // Increased to 15 minutes for aggressive caching
const lastCacheUpdate = new Map<string, number>()

/**
 * Fetch token info from Jupiter Token API with caching and fallback
 */
async function fetchTokenInfo(mint: string): Promise<JupiterToken | null> {
  // Check cache first
  const cached = tokenInfoCache.get(mint)
  const lastUpdate = lastCacheUpdate.get(mint) || 0

  if (cached && (Date.now() - lastUpdate < CACHE_DURATION)) {
    return cached
  }

  try {
    // Use a timeout to avoid hanging
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3000) // 3 second timeout

    const response = await fetch(`/api/v1/jupiter/tokens/v2/search?query=${mint}`, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()
    let tokenInfo: JupiterToken | null = null

    if (Array.isArray(data) && data.length > 0) {
      const token = data.find((t: any) => (t.address || t.mint) === mint) || data[0]
      tokenInfo = {
        address: token.address || token.mint,
        name: token.name,
        symbol: token.symbol,
        decimals: token.decimals,
        logoURI: token.logoURI || token.image || '',
        tags: token.tags,
        freeze_authority: token.freeze_authority,
        mint_authority: token.mint_authority,
        daily_volume: token.daily_volume
      }
    }

    // Cache the result (even if null)
    tokenInfoCache.set(mint, tokenInfo)
    lastCacheUpdate.set(mint, Date.now())

    return tokenInfo
  } catch (error) {
    
    // Cache the failure to avoid repeated requests
    tokenInfoCache.set(mint, null)
    lastCacheUpdate.set(mint, Date.now())

    // Return fallback token info for common tokens
    return getFallbackTokenInfo(mint)
  }
}

/**
 * Fallback token info for common tokens when API fails
 */
async function getFallbackTokenInfo(mint: string): Promise<JupiterToken | null> {
  // Define token metadata
  const tokenMetadata: Record<string, { name: string; symbol: string; decimals: number; tags: string[] }> = {
    'So11111111111111111111111111111111111111112': {
      name: 'Solana',
      symbol: 'SOL',
      decimals: 9,
      tags: ['native'],
    },
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': {
      name: 'USD Coin',
      symbol: 'USDC',
      decimals: 6,
      tags: ['stablecoin'],
    },
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': {
      name: 'Tether USD',
      symbol: 'USDT',
      decimals: 6,
      tags: ['stablecoin'],
    }
  }

  const metadata = tokenMetadata[mint]
  if (!metadata) {
    return null
  }

  // Generate fallback token dynamically
  return {
    address: mint,
    name: metadata.name,
    symbol: metadata.symbol,
    decimals: metadata.decimals,
    logoURI: '',
    tags: metadata.tags,
  }
}

/**
 * Fetch all tradable tokens from Jupiter
 */
export async function getAllTradableTokens(): Promise<Token[]> {
  try {
    const response = await fetch(`${JUPITER_TOKEN_API}/tag?tag=verified`)
    if (!response.ok) {
      throw new Error('Failed to fetch tokens from Jupiter')
    }

    const data: JupiterToken[] = await response.json()
    
    return data.map(token => ({
      address: token.address,
      chainId: 101,
      decimals: token.decimals,
      name: token.name,
      symbol: token.symbol,
      logoURI: token.logoURI || '',
      tags: token.tags || [],
      isConfidentialSupported: ['SOL', 'USDC', 'USDT'].includes(token.symbol),
      isNative: token.address === 'So11111111111111111111111111111111111111112',
      addressable: true,
    }))
  } catch (error) {
        // Return default tokens if API fails
    return getDefaultTokens()
  }
}

// Default tokens with lazy loading of icons
const DEFAULT_TOKENS_METADATA = [
  {
    address: 'So11111111111111111111111111111111111111112',
    chainId: 101,
    decimals: 9,
    name: 'Solana',
    symbol: 'SOL',
    tags: ['native'],
    isConfidentialSupported: true,
    isNative: true,
    addressable: true,
  },
  {
    address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    chainId: 101,
    decimals: 6,
    name: 'USD Coin',
    symbol: 'USDC',
    tags: ['stablecoin'],
    isConfidentialSupported: true,
    isNative: false,
    addressable: true,
  },
  {
    address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    chainId: 101,
    decimals: 6,
    name: 'Tether USD',
    symbol: 'USDT',
    tags: ['stablecoin'],
    isConfidentialSupported: true,
    isNative: false,
    addressable: true,
  },
  {
    address: 'GoLDppdjB1vDTPSGxyMJFqdnj134yH6Prg9eqsGDiw6A',
    chainId: 101,
    decimals: 9,
    name: 'Gold',
    symbol: 'GOLD',
    tags: ['defi', 'gold', 'asset'],
    isConfidentialSupported: true,
    isNative: false,
    addressable: true,
  },
  {
    address: 'CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH',
    chainId: 101,
    decimals: 6,
    name: 'CASH',
    symbol: 'CASH',
    tags: ['stablecoin'],
    isConfidentialSupported: true,
    isNative: false,
    addressable: true,
  },
  {
    address: '4AGxpKxYnw7g1ofvYDs5Jq2a1ek5kB9jS2NTUaippump',
    chainId: 101,
    decimals: 6,
    name: 'Wave Swap',
    symbol: 'WAVE',
    tags: ['defi', 'popular'],
    isConfidentialSupported: true,
    isNative: false,
    addressable: true,
  },
]

// Default tokens - logoURI set to fallback URL
export const DEFAULT_TOKENS: Token[] = DEFAULT_TOKENS_METADATA.map(token => ({
  ...token,
  logoURI: getLocalFallbackIcon(token.symbol, token.address) || '/icons/default-token.svg' // Local fallback
}))


// Create lookup maps for instant access
export const TOKEN_ADDRESS_MAP = new Map(DEFAULT_TOKENS.map(token => [token.address, token]))
export const TOKEN_SYMBOL_MAP = new Map(DEFAULT_TOKENS.map(token => [token.symbol.toLowerCase(), token]))

/**
 * Get default token list (fallback) - now returns precomputed constant
 */
export function getDefaultTokens(): Token[] {
  return DEFAULT_TOKENS
}

// Balance caching to avoid repeated expensive RPC calls
const balanceCache = new Map<string, { balance: string; timestamp: number }>()
const BALANCE_CACHE_DURATION = 10000 // Reduced to 10 seconds to ensure fresh balance data

// Performance optimization: Batch balance requests
const balanceBatchQueue = new Map<string, Promise<string>>()
let batchTimeout: NodeJS.Timeout | null = null

// Aggressive performance: Memory-efficient balance batching
export async function getBatchTokenBalances(
  connection: Connection,
  walletAddress: PublicKey,
  mints: string[]
): Promise<Map<string, string>> {
  const results = new Map<string, string>()
  const uncachedMints: string[] = []

  // Check cache first for all mints
  mints.forEach(mint => {
    const cacheKey = `${walletAddress.toString()}-${mint}`
    const cached = balanceCache.get(cacheKey)
    if (cached && (Date.now() - cached.timestamp < BALANCE_CACHE_DURATION)) {
      results.set(mint, cached.balance)
    } else {
      uncachedMints.push(mint)
    }
  })

  if (uncachedMints.length === 0) {
    return results
  }

  // Batch uncached requests
  try {
    const batchPromises = uncachedMints.map(async (mint) => {
      const balance = await getTokenBalance(connection, walletAddress, mint)
      results.set(mint, balance)
      return balance
    })

    // Process with timeout to prevent hanging
    await Promise.race([
      Promise.all(batchPromises),
      new Promise(resolve => setTimeout(resolve, 8000)) // 8 second total timeout
    ])
  } catch (error) {
        // Set remaining balances to 0
    uncachedMints.forEach(mint => {
      if (!results.has(mint)) {
        results.set(mint, '0')
      }
    })
  }

  return results
}

// Debounced balance refresh to prevent excessive RPC calls
let balanceRefreshDebounceTimer: NodeJS.Timeout | null = null
export function debouncedBalanceRefresh(
  connection: Connection,
  walletAddress: PublicKey,
  callback: () => void,
  delay: number = 1000 // Increased debounce time for better batching
) {
  if (balanceRefreshDebounceTimer) {
    clearTimeout(balanceRefreshDebounceTimer)
  }

  balanceRefreshDebounceTimer = setTimeout(() => {
    callback()
    balanceRefreshDebounceTimer = null
  }, delay)
}

export async function getTokenBalance(
  connection: Connection,
  walletAddress: PublicKey,
  mint: string
): Promise<string> {
  try {
    console.log(`[getTokenBalance] Fetching balance for ${mint} for wallet ${walletAddress.toString()}`)

    // Create cache key
    const cacheKey = `${walletAddress.toString()}-${mint}`

    // Check cache first
    const cached = balanceCache.get(cacheKey)
    if (cached && (Date.now() - cached.timestamp < BALANCE_CACHE_DURATION)) {
      console.log(`[getTokenBalance] Using cached balance for ${mint}: ${cached.balance}`)
      return cached.balance
    }

    let balance: string

    // Handle SOL balance - also check for wrapped SOL (WSOL)
    if (mint === 'So11111111111111111111111111111111111111112') {
      console.log(`[getTokenBalance] Fetching SOL balance via server proxy`)

      try {
        const response = await fetch(
          `/api/v1/balance?wallet=${walletAddress.toString()}&mint=${mint}&commitment=confirmed`
        )

        if (!response.ok) {
          throw new Error(`Balance API returned ${response.status}: ${response.statusText}`)
        }

        const data = await response.json()

        if (!data.success) {
          throw new Error(`Balance API error: ${data.error}`)
        }

        balance = data.balance
        const lamports = data.lamports || 0
        const solAmount = parseFloat(balance) / 1e9

        console.log(`[getTokenBalance] ✅ SOL balance fetched via proxy: ${balance} lamports (${solAmount} SOL)`)

        // Log for debugging the actual values
        if (solAmount > 0) {
          console.log(`[getTokenBalance] ✅ User has SOL balance: ${solAmount} SOL (${balance} lamports)`)
        } else {
          console.log(`[getTokenBalance] ⚠️ SOL balance is 0`)
        }

      } catch (proxyError) {
        console.error(`[getTokenBalance] Proxy balance fetch error:`, proxyError)
        console.error(`[getTokenBalance] Proxy Error details:`, {
          message: proxyError?.message,
          name: proxyError?.name,
          stack: proxyError?.stack,
          walletAddress: walletAddress.toString()
        })
        balance = '0'
      }
    }
    // Handle confidential tokens (they have different mint formats)
    else if (mint.startsWith('c') || !isBase58(mint)) {
      console.log(`[getTokenBalance] Confidential token ${mint}, setting balance to 0`)
            balance = '0'
    }
    // Validate that mint is a valid public key before creating PublicKey
    else {
      try {
        console.log(`[getTokenBalance] Fetching SPL token balance via server proxy for ${mint}`)

        const response = await fetch(
          `/api/v1/balance?wallet=${walletAddress.toString()}&mint=${mint}&commitment=confirmed`
        )

        if (!response.ok) {
          throw new Error(`Balance API returned ${response.status}: ${response.statusText}`)
        }

        const data = await response.json()

        if (!data.success) {
          throw new Error(`Balance API error: ${data.error}`)
        }

        balance = data.balance
        console.log(`[getTokenBalance] ✅ SPL token balance fetched via proxy: ${balance}`)

      } catch (proxyError) {
        console.error(`[getTokenBalance] Proxy SPL balance fetch error:`, proxyError)
        balance = '0'
      }

      }

    // Cache the result
    balanceCache.set(cacheKey, { balance, timestamp: Date.now() })
    console.log(`[getTokenBalance] Final balance for ${mint}: ${balance}`)

    return balance
  } catch (error) {
    console.error(`[getTokenBalance] Top-level error fetching balance for ${mint}:`, error)
    console.error(`[getTokenBalance] Top-level error details:`, {
      message: error?.message,
      name: error?.name,
      stack: error?.stack,
      walletAddress: walletAddress.toString(),
      mint: mint
    })

    // No mock fallbacks - return 0 if balance fetching fails
    return '0'
  }
}

/**
 * Clear balance cache (useful after transactions)
 */
export function clearBalanceCache(): void {
  balanceCache.clear()
}

/**
 * Get a fallback connection if the current connection times out
 */

/**
 * Check if a string is valid base58 format
 */
function isBase58(str: string): boolean {
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/
  return base58Regex.test(str)
}

