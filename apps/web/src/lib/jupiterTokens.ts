// Jupiter Token API v2 integration
export interface JupiterToken {
  id: string // mint address
  name: string
  symbol: string
  icon: string | null
  decimals: number
  tags: string[]
  verified: boolean
  // Additional useful fields from Jupiter API
  usdPrice?: number
  liquidity?: number
  volume24h?: number
  fdv?: number
  website?: string
  twitter?: string
  telegram?: string
  // WaveTek specific fields
  balance?: string
  isPopular?: boolean
  isUserOwned?: boolean
}

// Popular tokens from TODO.md - in exact order specified
export const POPULAR_TOKEN_ADDRESSES = [
  '4AGxpKxYnw7g1ofvYDs5Jq2a1ek5kB9jS2NTUaippump', // WAVE
  'So11111111111111111111111111111111111111112', // SOL
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  'A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS', // ZEC
  'pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn'  // PUMP
]

// Other tokens from TODO.md - in exact order specified
export const OTHER_TOKEN_ADDRESSES = [
  'BSxPC3Vu3X6UCtEEAYyhxAEo3rvtS4dgzzrvnERDpump', // WEALTH
  'J2eaKn35rp82T6RFEsNK9CLRHEKV9BLXjedFM3q6pump', // FTP
  'DtR4D9FtVoTX2569gaL837ZgrB6wNjj6tkmnX9Rdk9B2', // AURA
  'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5',  // MEW
  'FLJYGHpCCcfYUdzhcfHSeSd2peb5SMajNWaCsRnhpump'  // STORE
]

// API configuration
const JUPITER_API_BASE = 'https://lite-api.jup.ag/tokens/v2'
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes
const API_TIMEOUT = 10000 // 10 seconds

class JupiterTokenCache {
  private cache: Map<string, JupiterToken[]> = new Map()
  private lastFetch: number = 0
  private tokenDetailsCache: Map<string, JupiterToken> = new Map()

  get(key: string): JupiterToken[] | null {
    const now = Date.now()
    if (this.cache.has(key) && now - this.lastFetch < CACHE_DURATION) {
      return this.cache.get(key)!
    }
    return null
  }

  set(key: string, tokens: JupiterToken[]): void {
    this.cache.set(key, tokens)
    this.lastFetch = Date.now()
  }

  setTokenDetail(address: string, token: JupiterToken): void {
    this.tokenDetailsCache.set(address, token)
  }

  getTokenDetail(address: string): JupiterToken | null {
    return this.tokenDetailsCache.get(address) || null
  }

  clear(): void {
    this.cache.clear()
    this.tokenDetailsCache.clear()
    this.lastFetch = 0
  }
}

const tokenCache = new JupiterTokenCache()

export class JupiterTokenService {
  private static async fetchFromAPI(endpoint: string): Promise<any> {
    try {
      const url = `${JUPITER_API_BASE}${endpoint}`
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT)

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'WaveSwap-Dex/1.0'
        }
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`Jupiter API error: ${response.status} ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Error fetching from Jupiter API:', error)
      return null
    }
  }

  /**
   * Search for tokens by query (symbol, name, or mint address)
   */
  static async searchTokens(query: string): Promise<JupiterToken[]> {
    if (!query || query.trim().length < 2) {
      return []
    }

    try {
      const cacheKey = `search:${query.toLowerCase()}`
      const cached = tokenCache.get(cacheKey)
      if (cached) {
        return cached
      }

      const data = await this.fetchFromAPI(`/search?query=${encodeURIComponent(query)}`)
      if (!data || !Array.isArray(data)) {
        return []
      }

      const tokens = data.map(this.formatToken)
      tokenCache.set(cacheKey, tokens)

      // Cache individual token details
      tokens.forEach(token => {
        tokenCache.setTokenDetail(token.id, token)
      })

      return tokens
    } catch (error) {
      console.error('Error searching tokens:', error)
      return []
    }
  }

  /**
   * Get detailed information for specific tokens by addresses
   */
  private static async getTokensByAddresses(addresses: string[]): Promise<JupiterToken[]> {
    const tokens: JupiterToken[] = []

    // First check cache
    const uncachedAddresses: string[] = []

    for (const address of addresses) {
      const cached = tokenCache.getTokenDetail(address)
      if (cached) {
        tokens.push(cached)
      } else {
        uncachedAddresses.push(address)
      }
    }

    // Fetch uncached tokens
    for (const address of uncachedAddresses) {
      try {
        // Try to get token info by searching for the exact address
        const data = await this.fetchFromAPI(`/search?query=${address}`)
        if (data && Array.isArray(data)) {
          const tokenData = data.find((token: any) => token.id === address)
          if (tokenData) {
            const token = this.formatToken(tokenData)
            tokens.push(token)
            tokenCache.setTokenDetail(address, token)
          }
        }
      } catch (error) {
        console.error(`Error fetching token ${address}:`, error)
      }
    }

    return tokens
  }

  /**
   * Get popular tokens (from TODO.md Popular section)
   */
  static async getPopularTokens(): Promise<JupiterToken[]> {
    try {
      const tokens = await this.getTokensByAddresses(POPULAR_TOKEN_ADDRESSES)

      // Sort in the exact order specified in POPULAR_TOKEN_ADDRESSES
      const sortedTokens = tokens.sort((a, b) => {
        const aIndex = POPULAR_TOKEN_ADDRESSES.indexOf(a.id)
        const bIndex = POPULAR_TOKEN_ADDRESSES.indexOf(b.id)
        return aIndex - bIndex
      })

      // Mark as popular
      return sortedTokens.map(token => ({
        ...token,
        isPopular: true
      }))
    } catch (error) {
      console.error('Error fetching popular tokens:', error)
      return []
    }
  }

  /**
   * Get other tokens (from TODO.md Other Tokens section)
   */
  static async getOtherTokens(): Promise<JupiterToken[]> {
    try {
      const tokens = await this.getTokensByAddresses(OTHER_TOKEN_ADDRESSES)

      // Sort in the exact order specified in OTHER_TOKEN_ADDRESSES
      const sortedTokens = tokens.sort((a, b) => {
        const aIndex = OTHER_TOKEN_ADDRESSES.indexOf(a.id)
        const bIndex = OTHER_TOKEN_ADDRESSES.indexOf(b.id)
        return aIndex - bIndex
      })

      return sortedTokens
    } catch (error) {
      console.error('Error fetching other tokens:', error)
      return []
    }
  }

  /**
   * Get user owned tokens (simplified - would need wallet integration)
   */
  static async getUserOwnedTokens(userPublicKey: string): Promise<JupiterToken[]> {
    // This would integrate with wallet balance fetching
    // For now, return empty array
    return []
  }

  /**
   * Get all tokens (popular + other)
   */
  static async getAllTokens(): Promise<JupiterToken[]> {
    try {
      const [popularTokens, otherTokens] = await Promise.all([
        this.getPopularTokens(),
        this.getOtherTokens()
      ])

      return [...popularTokens, ...otherTokens]
    } catch (error) {
      console.error('Error fetching all tokens:', error)
      return []
    }
  }

  /**
   * Get initial tokens for display
   */
  static async getInitialTokens(): Promise<JupiterToken[]> {
    return this.getAllTokens()
  }

  /**
   * Get token suggestions for search
   */
  static getInitialTokenSuggestions(): string[] {
    return [
      'WAVE', 'SOL', 'USDC', 'USDT', 'ZEC', 'PUMP',
      'WEALTH', 'FTP', 'AURA', 'MEW', 'STORE'
    ].sort()
  }

  /**
   * Find token by address in cached tokens
   */
  static findTokenByAddress(address: string, tokens: JupiterToken[]): JupiterToken | undefined {
    return tokens.find(token => token.id.toLowerCase() === address.toLowerCase())
  }

  /**
   * Find token by symbol in cached tokens
   */
  static findTokenBySymbol(symbol: string, tokens: JupiterToken[]): JupiterToken | undefined {
    return tokens.find(token => token.symbol.toLowerCase() === symbol.toLowerCase())
  }

  /**
   * Format token data from Jupiter API to our interface
   */
  private static formatToken(tokenData: any): JupiterToken {
    return {
      id: tokenData.id || '',
      name: tokenData.name || 'Unknown',
      symbol: tokenData.symbol || 'UNKNOWN',
      icon: tokenData.icon || null,
      decimals: tokenData.decimals || 9,
      tags: tokenData.tags || [],
      verified: tokenData.isVerified || false,
      usdPrice: tokenData.usdPrice,
      liquidity: tokenData.liquidity,
      volume24h: tokenData.volume24h || 0,
      fdv: tokenData.fdv,
      website: tokenData.website,
      twitter: tokenData.twitter,
      telegram: tokenData.telegram
    }
  }
}

// Utility function to enhance tokens with user balance information
export const enhanceTokenWithBalance = (token: JupiterToken, balance: string): JupiterToken => ({
  ...token,
  balance,
  isUserOwned: parseFloat(balance) > 0
})

// Utility function to sort tokens by priority
export const sortTokensByPriority = (tokens: (JupiterToken & { isPopular?: boolean })[]): (JupiterToken & { isPopular?: boolean })[] => {
  return tokens.sort((a, b) => {
    // Priority: popular > verified > alphabetically
    if (a.isPopular && !b.isPopular) return -1
    if (!a.isPopular && b.isPopular) return 1
    if (a.verified && !b.verified) return -1
    if (!a.verified && b.verified) return 1
    return a.symbol.localeCompare(b.symbol)
  })
}