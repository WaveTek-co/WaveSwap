/**
 * Hook for managing token list with Jupiter Token API integration
 * API Docs: https://hub.jup.ag/docs/token-api/
 */

import { useState, useEffect, useCallback } from 'react'
import { useConnection } from '@/hooks/useWalletAdapter'
import { PublicKey } from '@solana/web3.js'
import { Token } from '@/types/token'
import { getUserTokens, getDefaultTokens } from '@/lib/tokens'

const JUPITER_TOKEN_SEARCH_API = '/api/v1/jupiter/tokens/v2/search'

export function useTokenList(walletAddress: PublicKey | null) {
  const { connection } = useConnection()
  const [allTokens, setAllTokens] = useState<Token[]>(getDefaultTokens())
  const [userTokens, setUserTokens] = useState<Token[]>([])
  const [loading, setLoading] = useState(false)

  // Load user's wallet tokens
  const loadUserTokens = useCallback(async () => {
    if (!walletAddress || !connection) {
      setUserTokens([])
      return
    }

    try {
      setLoading(true)
      const tokens = await getUserTokens(connection, walletAddress)
      setUserTokens(tokens)
      
      // Merge with default tokens
      const tokenMap = new Map<string, Token>()
      
      tokens.forEach(t => tokenMap.set(t.address, t))
      getDefaultTokens().forEach(t => {
        if (!tokenMap.has(t.address)) {
          tokenMap.set(t.address, t)
        }
      })
      
      setAllTokens(Array.from(tokenMap.values()))
    } catch (error) {
      console.error('Error loading user tokens:', error)
      setAllTokens(getDefaultTokens())
    } finally {
      setLoading(false)
    }
  }, [walletAddress, connection])

  // Search tokens from Jupiter API with fallback logic
  const searchTokens = useCallback(async (query: string): Promise<Token[]> => {
    if (!query || query.length < 2) {
      return allTokens
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 3000) // 3 second timeout

      const response = await fetch(`${JUPITER_TOKEN_SEARCH_API}?query=${encodeURIComponent(query)}`, {
        signal: controller.signal
      })
      clearTimeout(timeoutId)

      // Handle circuit breaker and other error responses gracefully
      if (!response.ok) {
        console.warn(`Jupiter search API error: ${response.status}, falling back to local search`)
        return allTokens.filter(t =>
          t.symbol.toLowerCase().includes(query.toLowerCase()) ||
          t.name.toLowerCase().includes(query.toLowerCase())
        )
      }

      const data = await response.json()

      // Check for error responses from our proxy
      if (data.error) {
        console.warn(`Jupiter search proxy error: ${data.error}, falling back to local search`)
        return allTokens.filter(t =>
          t.symbol.toLowerCase().includes(query.toLowerCase()) ||
          t.name.toLowerCase().includes(query.toLowerCase())
        )
      }

      if (Array.isArray(data)) {
        return data.slice(0, 20).map((token: any) => ({
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
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn('Jupiter search API timeout, falling back to local search')
      } else {
        console.error('Error searching tokens:', error)
      }
    }

    // Always fall back to local search
    return allTokens.filter(t =>
      t.symbol.toLowerCase().includes(query.toLowerCase()) ||
      t.name.toLowerCase().includes(query.toLowerCase())
    )
  }, [allTokens])

  useEffect(() => {
    loadUserTokens()
  }, [loadUserTokens])

  return {
    allTokens,
    userTokens,
    loading,
    searchTokens,
    refreshTokens: loadUserTokens,
  }
}

