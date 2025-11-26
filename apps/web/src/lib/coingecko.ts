// CoinGecko API integration for token icons and metadata
import { getTokenIcon } from './tokenIconService'
export interface CoinGeckoToken {
  id: string
  name: string
  symbol: string
  image: string
  current_price?: number
  market_cap?: number
  price_change_percentage_24h?: number
}

export interface TokenMetadata {
  symbol: string
  name: string
  logoURI: string
  chain: string
  address: string
  decimals: number
  price?: number
  priceChange24h?: number
}

class CoinGeckoService {
  private baseUrl = 'https://api.coingecko.com/api/v3'
  private cache = new Map<string, { data: any; timestamp: number }>()
  private cacheTimeout = 5 * 60 * 1000 // 5 minutes

  // Common crypto IDs for mapping
  private readonly cryptoIdMap: Record<string, string> = {
    'SOL': 'solana',
    'ZEC': 'zcash',
    'NEAR': 'near',
    'USDC': 'usd-coin',
    'USDT': 'tether',
    'ETH': 'ethereum',
    'BTC': 'bitcoin',
  }

  private isExpired(timestamp: number): boolean {
    return Date.now() - timestamp > this.cacheTimeout
  }

  private getCachedData(key: string): any | null {
    const cached = this.cache.get(key)
    if (cached && !this.isExpired(cached.timestamp)) {
      return cached.data
    }
    this.cache.delete(key)
    return null
  }

  private setCachedData(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    })
  }

  // Get token data by symbol
  async getTokenData(symbol: string): Promise<CoinGeckoToken | null> {
    const cacheKey = `token_${symbol}`
    const cached = this.getCachedData(cacheKey)
    if (cached) return cached

    try {
      const cryptoId = this.cryptoIdMap[symbol.toUpperCase()]
      if (!cryptoId) return null

      const response = await fetch(
        `${this.baseUrl}/coins/markets?vs_currency=usd&ids=${cryptoId}&order=market_cap_desc&per_page=1&page=1&sparkline=false`
      )

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      if (data.length === 0) return null

      const token = data[0] as CoinGeckoToken
      this.setCachedData(cacheKey, token)
      return token
    } catch (error) {
      console.error(`Error fetching ${symbol} token data:`, error)
      return null
    }
  }

  // Get multiple token data at once
  async getMultipleTokenData(symbols: string[]): Promise<CoinGeckoToken[]> {
    const cacheKey = `tokens_${symbols.join(',')}`
    const cached = this.getCachedData(cacheKey)
    if (cached) return cached

    try {
      const cryptoIds = symbols
        .map(symbol => this.cryptoIdMap[symbol.toUpperCase()])
        .filter(Boolean)
        .join(',')

      if (!cryptoIds) return []

      const response = await fetch(
        `${this.baseUrl}/coins/markets?vs_currency=usd&ids=${cryptoIds}&order=market_cap_desc&per_page=10&page=1&sparkline=false`
      )

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      this.setCachedData(cacheKey, data)
      return data as CoinGeckoToken[]
    } catch (error) {
      console.error('Error fetching multiple token data:', error)
      return []
    }
  }

  // Enhanced token metadata with CoinGecko data
  async enhanceTokenMetadata(baseTokens: TokenMetadata[]): Promise<TokenMetadata[]> {
    const symbols = [...new Set(baseTokens.map(token => token.symbol))]
    const coinGeckoData = await this.getMultipleTokenData(symbols)

    return baseTokens.map(token => {
      const coinData = coinGeckoData.find(coin =>
        coin.symbol.toUpperCase() === token.symbol.toUpperCase()
      )

      return {
        ...token,
        logoURI: coinData?.image || token.logoURI || await getTokenIcon(token.symbol, token.address),
        price: coinData?.current_price,
        priceChange24h: coinData?.price_change_percentage_24h
      }
    })
  }

  // Get token price history (optional for future features)
  async getTokenPriceHistory(symbol: string, days: number = 7): Promise<any[]> {
    const cacheKey = `history_${symbol}_${days}`
    const cached = this.getCachedData(cacheKey)
    if (cached) return cached

    try {
      const cryptoId = this.cryptoIdMap[symbol.toUpperCase()]
      if (!cryptoId) return []

      const response = await fetch(
        `${this.baseUrl}/coins/${cryptoId}/market_chart?vs_currency=usd&days=${days}`
      )

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      const prices = data.prices || []
      this.setCachedData(cacheKey, prices)
      return prices
    } catch (error) {
      console.error(`Error fetching ${symbol} price history:`, error)
      return []
    }
  }
}

export const coingeckoService = new CoinGeckoService()
export { CoinGeckoService }