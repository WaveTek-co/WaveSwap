/**
 * Professional Token Icon Service using Jupiter API
 *
 * This service provides a centralized way to fetch token icons from Jupiter API
 * with proper caching, fallback strategies, and error handling.
 *
 * References:
 * - Jupiter Token API: https://hub.jup.ag/docs/token-api/
 * - Jupiter Token Search: https://hub.jup.ag/docs/api/token-api/v2/search
 */

export interface TokenIconOptions {
  size?: number
  format?: 'svg' | 'png'
  quality?: 'low' | 'medium' | 'high'
}

class TokenIconService {
  private cache = new Map<string, { icon: string; timestamp: number }>()
  private readonly CACHE_DURATION = 30 * 60 * 1000 // 30 minutes
  private readonly JUPITER_ICON_BASE = 'https://img-cdn.jup.ag/tokens'

  /**
   * Get token icon URL from Jupiter API with fallback strategies
   */
  async getTokenIcon(symbol: string, address?: string, options: TokenIconOptions = {}): Promise<string> {
    const cacheKey = `${symbol}_${address}_${JSON.stringify(options)}`
    const cached = this.cache.get(cacheKey)

    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.icon
    }

    let iconUrl = await this.fetchFromJupiterApi(symbol, address, options)

    // Cache the result
    this.cache.set(cacheKey, { icon: iconUrl, timestamp: Date.now() })

    return iconUrl
  }

  /**
   * Fetch icon from Jupiter API with proper fallback strategies
   */
  private async fetchFromJupiterApi(symbol: string, address?: string, options: TokenIconOptions = {}): Promise<string> {
    const { format = 'svg' } = options

    // Strategy 1: Try Jupiter API by address (most reliable)
    if (address) {
      try {
        const jupiterIcon = await this.searchJupiterApi(address)
        if (jupiterIcon) {
          return jupiterIcon
        }
      } catch (error) {
        console.warn(`[TokenIconService] Jupiter API search failed for ${address}:`, error)
      }
    }

    // Strategy 2: Try Jupiter CDN by symbol (common tokens)
    try {
      const jupiterCdnUrl = `${this.JUPITER_ICON_BASE}/${symbol}.${format}`
      const isValid = await this.validateImageUrl(jupiterCdnUrl)
      if (isValid) {
        return jupiterCdnUrl
      }
    } catch (error) {
      console.warn(`[TokenIconService] Jupiter CDN validation failed for ${symbol}:`, error)
    }

    // Strategy 3: Generate fallback icon
    return this.generateFallbackIcon(symbol)
  }

  /**
   * Search Jupiter Token API v2 for icon URL
   */
  private async searchJupiterApi(address: string): Promise<string | null> {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 3000) // 3 second timeout

      const response = await fetch(`/api/v1/jupiter/tokens/v2/search?query=${address}`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        return null
      }

      const data = await response.json()

      if (Array.isArray(data) && data.length > 0) {
        const token = data.find((t: any) => (t.address || t.id || t.mint) === address) || data[0]
        return token.icon || token.image || token.logoURI
      }

      return null
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn(`[TokenIconService] Jupiter API search timeout for ${address}`)
      } else {
        console.warn(`[TokenIconService] Jupiter API search error for ${address}:`, error)
      }
      return null
    }
  }

  /**
   * Validate if image URL loads successfully
   */
  private async validateImageUrl(url: string): Promise<boolean> {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 2000) // 2 second timeout

      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal
      })

      clearTimeout(timeoutId)
      return response.ok && response.headers.get('content-type')?.startsWith('image/')
    } catch (error) {
      return false
    }
  }

  /**
   * Generate fallback icon (returns data URL or placeholder service)
   */
  private generateFallbackIcon(symbol: string): string {
    // Use UI Avatars as fallback
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(symbol)}&background=random&color=fff&size=128&format=svg`
  }

  /**
   * Get multiple token icons in parallel
   */
  async getMultipleIcons(tokens: Array<{ symbol: string; address?: string }>, options: TokenIconOptions = {}): Promise<Map<string, string>> {
    const iconMap = new Map<string, string>()

    const promises = tokens.map(async (token) => {
      const iconUrl = await this.getTokenIcon(token.symbol, token.address, options)
      return { key: token.symbol || token.address || '', icon: iconUrl }
    })

    try {
      const results = await Promise.allSettled(promises)

      results.forEach((result, index) => {
        const token = tokens[index]
        const key = token.symbol || token.address || ''

        if (result.status === 'fulfilled') {
          iconMap.set(key, result.value.icon)
        } else {
          console.warn(`[TokenIconService] Failed to get icon for ${key}:`, result.reason)
          iconMap.set(key, this.generateFallbackIcon(token.symbol))
        }
      })
    } catch (error) {
      console.error('[TokenIconService] Error getting multiple icons:', error)

      // Set fallback icons for all tokens
      tokens.forEach(token => {
        const key = token.symbol || token.address || ''
        iconMap.set(key, this.generateFallbackIcon(token.symbol))
      })
    }

    return iconMap
  }

  /**
   * Clear icon cache
   */
  clearCache(): void {
    this.cache.clear()
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; oldestEntry: number | null } {
    if (this.cache.size === 0) {
      return { size: 0, oldestEntry: null }
    }

    let oldestTimestamp = Date.now()
    this.cache.forEach(({ timestamp }) => {
      if (timestamp < oldestTimestamp) {
        oldestTimestamp = timestamp
      }
    })

    return {
      size: this.cache.size,
      oldestEntry: this.cache.size > 0 ? oldestTimestamp : null
    }
  }
}

// Export singleton instance
export const tokenIconService = new TokenIconService()

// Export utility functions for convenience
export const getTokenIcon = (symbol: string, address?: string, options?: TokenIconOptions) =>
  tokenIconService.getTokenIcon(symbol, address, options)

export const getMultipleTokenIcons = (tokens: Array<{ symbol: string; address?: string }>, options?: TokenIconOptions) =>
  tokenIconService.getMultipleIcons(tokens, options)

export const clearTokenIconCache = () => tokenIconService.clearCache()

export type { TokenIconOptions }