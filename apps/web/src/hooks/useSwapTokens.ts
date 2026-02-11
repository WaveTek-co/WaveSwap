'use client'

import { useState, useEffect, useCallback } from 'react'
import { PublicKey, Connection } from '@solana/web3.js'
import { getAssociatedTokenAddress } from '@solana/spl-token'
import { COMMON_TOKENS, Token } from '@/types/token'

interface TokenBalances {
  [mint: string]: number
}

export function useSwapTokens(
  publicKey: PublicKey | null,
  connection: Connection | null
) {
  const [balances, setBalances] = useState<TokenBalances>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getTokenBalance = useCallback(async (
    wallet: PublicKey,
    connection: Connection,
    mint: string
  ): Promise<number> => {
    try {
      const mintPubkey = new PublicKey(mint)
      const tokenAccount = await getAssociatedTokenAddress(mintPubkey, wallet)

      const accountInfo = await connection.getAccountInfo(tokenAccount)
      if (!accountInfo) {
        return 0
      }

      // Parse token account data
      const data = Buffer.from(accountInfo.data)
      if (data.length !== 165) {
        return 0
      }

      // Token amount is stored at offset 64, as a u64 (8 bytes)
      const amount = data.readBigUInt64LE(64)
      return Number(amount)
    } catch (err) {
      // Silently fail for tokens that don't exist in wallet
      return 0
    }
  }, [])

  const refreshBalances = useCallback(async () => {
    if (!publicKey || !connection) {
      setBalances({})
      return
    }

    setLoading(true)
    setError(null)

    try {
      const newBalances: TokenBalances = {}

      // Get SOL balance first
      try {
        const solBalance = await connection.getBalance(publicKey)
        newBalances['So11111111111111111111111111111111111111112'] = solBalance
      } catch (err) {
        console.error('[WAVETEK] balance fetch failed')
      }

      // Get token balances for common tokens (silently fail for missing tokens)
      const tokenMints = COMMON_TOKENS
        .filter(t => !t.isNative)
        .map(t => t.address)

      await Promise.allSettled(
        tokenMints.map(async (mint) => {
          const balance = await getTokenBalance(publicKey, connection, mint)
          if (balance > 0) {
            newBalances[mint] = balance
          }
        })
      )

      setBalances(newBalances)
    } catch (err) {
      // Don't spam console with errors
      setError(null)
      setBalances({})
    } finally {
      setLoading(false)
    }
  }, [publicKey, connection, getTokenBalance])

  useEffect(() => {
    refreshBalances()

    // Set up periodic refresh every 30 seconds
    const interval = setInterval(refreshBalances, 30000)

    return () => clearInterval(interval)
  }, [refreshBalances])

  const getTokenInfo = useCallback((mint: string): Token | null => {
    return COMMON_TOKENS.find(t => t.address === mint) || null
  }, [])

  const getAvailableTokens = useCallback((): Token[] => {
    return COMMON_TOKENS
  }, [])

  return {
    balances,
    loading,
    error,
    refreshBalances,
    getTokenInfo,
    getAvailableTokens,
  }
}