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
  isConfidentialSupported?: boolean
}

// Popular tokens from TODO.md - in exact order specified
export const POPULAR_TOKEN_ADDRESSES = [
  '4AGxpKxYnw7g1ofvYDs5Jq2a1ek5kB9jS2NTUaippump', // WAVE
  'So11111111111111111111111111111111111111112', // SOL
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  'A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS', // ZEC
  'pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn', // PUMP
  'CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH'  // CASH
]

// Other tokens from TODO.md - in exact order specified
export const OTHER_TOKEN_ADDRESSES = [
  'BSxPC3Vu3X6UCtEEAYyhxAEo3rvtS4dgzzrvnERDpump', // WEALTH
  'J2eaKn35rp82T6RFEsNK9CLRHEKV9BLXjedFM3q6pump', // FTP
  'DtR4D9FtVoTX2569gaL837ZgrB6wNjj6tkmnX9Rdk9B2', // AURA
  'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5',  // MEW
  'FLJYGHpCCcfYUdzhcfHSeSd2peb5SMajNWaCsRnhpump'  // STORE
]

// API configuration - use Next.js API proxy to avoid CORS issues
const JUPITER_API_BASE = '/api/v1/jupiter/tokens/v2'
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes
const API_TIMEOUT = 15000 // 15 seconds
const RETRY_DELAY = 2000 // 2 seconds
const MAX_RETRIES = 3

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
  private static async fetchFromAPI(endpoint: string, retryCount: number = 0): Promise<any> {
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
        // Handle rate limiting with retry logic
        if (response.status === 429 || response.status === 502) {
          if (retryCount < MAX_RETRIES) {
            console.log(`[JupiterTokenService] Rate limited, retrying in ${RETRY_DELAY}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`)
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (retryCount + 1)))
            return this.fetchFromAPI(endpoint, retryCount + 1)
          }
          throw new Error(`Jupiter API rate limited after ${MAX_RETRIES} retries`)
        }
        throw new Error(`Jupiter API error: ${response.status} ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      if (error instanceof Error && error.message.includes('rate limited')) {
        throw error // Re-throw rate limit errors
      }
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
      // Fallback to local search when API is down
      return this.localSearchFallback(query)
    }
  }

  /**
   * Local search fallback when Jupiter API is unavailable
   */
  private static localSearchFallback(query: string): JupiterToken[] {
    const searchQuery = query.toLowerCase()

    // Combine all known tokens for local search
    const allTokens = [...POPULAR_TOKEN_ADDRESSES, ...OTHER_TOKEN_ADDRESSES]

    const results = allTokens.filter(address => {
      const name = this.getTokenNameByAddress(address).toLowerCase()
      const symbol = this.getTokenSymbolByAddress(address).toLowerCase()

      return name.includes(searchQuery) ||
             symbol.includes(searchQuery) ||
             address.toLowerCase().includes(searchQuery)
    }).map(address => ({
      id: address,
      name: this.getTokenNameByAddress(address),
      symbol: this.getTokenSymbolByAddress(address),
      icon: this.getTokenIconByAddress(address),
      decimals: this.getTokenDecimalsByAddress(address),
      tags: [],
      verified: true,
      isConfidentialSupported: this.getIsConfidentialSupportedByAddress(address)
    }))

    return results
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
      console.log(`[JupiterTokenService] Loading popular tokens using fallback method`)

      // Since /popular endpoint doesn't exist, use fallback method directly
      const popularTokens: JupiterToken[] = POPULAR_TOKEN_ADDRESSES.map((address) => {
        // Fallback to hardcoded data
        return {
          id: address,
          name: this.getTokenNameByAddress(address),
          symbol: this.getTokenSymbolByAddress(address),
          icon: this.getTokenIconByAddress(address),
          decimals: this.getTokenDecimalsByAddress(address),
          tags: [],
          verified: true,
          isPopular: true,
          isConfidentialSupported: this.getIsConfidentialSupportedByAddress(address)
        }
      })

      console.log(`[JupiterTokenService] Loaded ${popularTokens.length} popular tokens using fallback`)
      return popularTokens
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
      console.log(`[JupiterTokenService] Loading other tokens using fallback method`)

      // Since /other endpoint doesn't exist, use fallback method directly
      const otherTokens: JupiterToken[] = OTHER_TOKEN_ADDRESSES.map((address) => {
        // Fallback to hardcoded data
        return {
          id: address,
          name: this.getTokenNameByAddress(address),
          symbol: this.getTokenSymbolByAddress(address),
          icon: this.getTokenIconByAddress(address),
          decimals: this.getTokenDecimalsByAddress(address),
          tags: [],
          verified: true,
          isPopular: false,
          isConfidentialSupported: this.getIsConfidentialSupportedByAddress(address)
        }
      })

      console.log(`[JupiterTokenService] Loaded ${otherTokens.length} other tokens using fallback`)
      return otherTokens
    } catch (error) {
      console.error('Error fetching other tokens:', error)
      return []
    }
  }

  /**
   * Helper method to get token name by address
   */
  private static getTokenNameByAddress(address: string): string {
    const tokenMap: Record<string, string> = {
      '4AGxpKxYnw7g1ofvYDs5Jq2a1ek5kB9jS2NTUaippump': 'WaveSwap',
      'So11111111111111111111111111111111111111112': 'Solana',
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USD Coin',
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'Tether USD',
      'A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS': 'Zcash',
      'pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn': 'Pump',
      'CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH': 'Cash',
      'BSxPC3Vu3X6UCtEEAYyhxAEo3rvtS4dgzzrvnERDpump': 'Wealth',
      'J2eaKn35rp82T6RFEsNK9CLRHEKV9BLXjedFM3q6pump': 'FTP',
      'DtR4D9FtVoTX2569gaL837ZgrB6wNjj6tkmnX9Rdk9B2': 'Aura',
      'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5': 'MEW',
      'FLJYGHpCCcfYUdzhcfHSeSd2peb5SMajNWaCsRnhpump': 'Store'
    }
    return tokenMap[address] || 'Unknown Token'
  }

  /**
   * Helper method to get token symbol by address
   */
  private static getTokenSymbolByAddress(address: string): string {
    const tokenMap: Record<string, string> = {
      '4AGxpKxYnw7g1ofvYDs5Jq2a1ek5kB9jS2NTUaippump': 'WAVE',
      'So11111111111111111111111111111111111111112': 'SOL',
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'USDT',
      'A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS': 'ZEC',
      'pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn': 'PUMP',
      'CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH': 'CASH',
      'BSxPC3Vu3X6UCtEEAYyhxAEo3rvtS4dgzzrvnERDpump': 'WEALTH',
      'J2eaKn35rp82T6RFEsNK9CLRHEKV9BLXjedFM3q6pump': 'FTP',
      'DtR4D9FtVoTX2569gaL837ZgrB6wNjj6tkmnX9Rdk9B2': 'AURA',
      'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5': 'MEW',
      'FLJYGHpCCcfYUdzhcfHSeSd2peb5SMajNWaCsRnhpump': 'STORE'
    }
    return tokenMap[address] || 'UNKNOWN'
  }

  /**
   * Helper method to get token icon URL by address
   * ONLY for specific fallback cases when API is completely unavailable
   */
  private static getTokenIconByAddress(address: string): string | null {
    // Known working icon URLs for tokens that have issues with API rate limiting
    const knownIcons: Record<string, string> = {
      // MEW token - using dweb.link gateway for better CORS support
      'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5': 'https://bafkreidlwyr565dxtao2ipsze6bmzpszqzybz7sqi2zaet5fs7k53henju.ipfs.dweb.link/'
    }

    return knownIcons[address] || null
  }

  /**
   * Helper method to get token decimals by address
   */
  private static getTokenDecimalsByAddress(address: string): number {
    const decimalsMap: Record<string, number> = {
      'So11111111111111111111111111111111111111112': 9, // SOL
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 6, // USDC
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 6, // USDT
      'A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS': 8, // ZEC
      'pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn': 6,  // PUMP
      '4AGxpKxYnw7g1ofvYDs5Jq2a1ek5kB9jS2NTUaippump': 6, // WAVE
      'CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH': 6, // CASH
      'BSxPC3Vu3X6UCtEEAYyhxAEo3rvtS4dgzzrvnERDpump': 9, // WEALTH
      'J2eaKn35rp82T6RFEsNK9CLRHEKV9BLXjedFM3q6pump': 9, // FTP
      'DtR4D9FtVoTX2569gaL837ZgrB6wNjj6tkmnX9Rdk9B2': 9, // AURA
      'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5': 9, // MEW
      'FLJYGHpCCcfYUdzhcfHSeSd2peb5SMajNWaCsRnhpump': 9  // STORE
    }
    return decimalsMap[address] || 9 // Default to 9 for Solana tokens
  }

  /**
   * Helper method to get isConfidentialSupported flag by address
   */
  private static getIsConfidentialSupportedByAddress(address: string): boolean {
    // All TODO.md tokens should be supported in privacy mode as requested by user
    const supportedTokens: Record<string, boolean> = {
      '4AGxpKxYnw7g1ofvYDs5Jq2a1ek5kB9jS2NTUaippump': true, // WAVE
      'So11111111111111111111111111111111111111112': true, // SOL
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': true, // USDC
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': true, // USDT
      'A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS': true, // ZEC
      'pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn': true,  // PUMP
      'CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH': true, // CASH
      'BSxPC3Vu3X6UCtEEAYyhxAEo3rvtS4dgzzrvnERDpump': true, // WEALTH
      'J2eaKn35rp82T6RFEsNK9CLRHEKV9BLXjedFM3q6pump': true, // FTP
      'DtR4D9FtVoTX2569gaL837ZgrB6wNjj6tkmnX9Rdk9B2': true, // AURA
      'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5': true, // MEW
      'FLJYGHpCCcfYUdzhcfHSeSd2peb5SMajNWaCsRnhpump': true  // STORE
    }
    return supportedTokens[address] || false
  }

  /**
   * Get user owned tokens (simplified - would need wallet integration)
   */
  static async getUserOwnedTokens(_userPublicKey: string): Promise<JupiterToken[]> {
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
      'WAVE', 'SOL', 'USDC', 'USDT', 'ZEC', 'PUMP', 'CASH',
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
    const token = {
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
      telegram: tokenData.telegram,
      isConfidentialSupported: true
    }

    // Debug logging for MEW token (commented out)
    // if (token.id === 'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5' || token.symbol === 'MEW') {
    //   console.log('[JupiterTokenService] MEW token formatted:', {
    //     id: token.id,
    //     symbol: token.symbol,
    //     icon: token.icon,
    //     name: token.name
    //   })
    // }

    return token
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