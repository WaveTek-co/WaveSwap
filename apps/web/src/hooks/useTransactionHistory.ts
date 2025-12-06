'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useWallet } from '@/hooks/useWalletAdapter'

interface SwapHistoryItem {
  intentId: string
  inputToken: string
  outputToken: string
  inputAmount: string
  outputAmount?: string
  status: string
  privacyMode: boolean
  feeBps?: number
  createdAt: string
  settledAt?: string
  error?: string
}

interface TransactionHistoryResponse {
  swaps: SwapHistoryItem[]
  pagination: {
    limit: number
    offset: number
    total: number
  }
}

interface Transaction {
  id: string
  type: 'swap' | 'send' | 'receive'
  status: 'success' | 'pending' | 'failed'
  timestamp: Date
  fromToken: {
    symbol: string
    amount: string
    logoURI?: string
    address: string
  }
  toToken: {
    symbol: string
    amount: string
    logoURI?: string
    address: string
  }
  txHash?: string
  priceImpact?: number
  privacyLevel?: 'public' | 'private'
  intentId?: string
}

// Token symbol mapping for common Solana tokens
const TOKEN_SYMBOLS: Record<string, { symbol: string; decimals: number; logoURI?: string }> = {
  'So11111111111111111111111111111111111111112': {
    symbol: 'SOL',
    decimals: 9,
    logoURI: '/assets/tokens/sol.png'
  },
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': {
    symbol: 'USDC',
    decimals: 6,
    logoURI: '/assets/tokens/usdc.png'
  },
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': {
    symbol: 'USDT',
    decimals: 6,
    logoURI: '/assets/tokens/usdt.png'
  },
  '4AGxpKxYnw7g1ofvYDs5Jq2a1ek5kB9jS2NTUaippump': {
    symbol: 'WAVE',
    decimals: 6,
  },
}

const getTokenInfo = (address: string) => {
  if (TOKEN_SYMBOLS[address]) {
    return TOKEN_SYMBOLS[address]
  }

  // Try to extract symbol from address or use fallback
  const symbol = address.slice(0, 8) + '...'
  return {
    symbol,
    decimals: 9, // Default to 9 decimals
  }
}

const formatAmount = (amount: string, decimals: number): string => {
  try {
    // Amount is already in human-readable format from Jupiter API
    const num = parseFloat(amount)
    if (num === 0) return '0'
    if (num < 0.001) return '<0.001'
    if (num < 1) return num.toFixed(4)
    if (num < 1000) return num.toFixed(2)
    return num.toLocaleString(undefined, { maximumFractionDigits: 2 })
  } catch {
    return '0'
  }
}

const getStatus = (status: string): 'success' | 'pending' | 'failed' => {
  const upperStatus = status.toUpperCase()
  switch (upperStatus) {
    case 'COMPLETED':
    case 'SUCCESS':
    case 'SETTLED':
      return 'success'
    case 'PENDING':
    case 'PROCESSING':
    case 'IN_PROGRESS':
      return 'pending'
    case 'FAILED':
    case 'ERROR':
    case 'CANCELLED':
      return 'failed'
    default:
      // Default to 'pending' for unknown statuses instead of 'failed'
      // This prevents legitimate transactions from showing as failed
      console.warn(`Unknown transaction status: ${status}, defaulting to 'pending'`)
      return 'pending'
  }
}

export function useTransactionHistory(privacyMode: boolean = false) {
  const { publicKey } = useWallet()
  const [history, setHistory] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [offset, setOffset] = useState(0)
  const limit = 20

  const fetchHistory = useCallback(async (reset: boolean = false) => {
    if (!publicKey) {
      setHistory([])
      setError(null)
      return
    }

    const currentOffset = reset ? 0 : offset
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/v1/swap/history/${publicKey.toString()}?limit=${limit}&offset=${currentOffset}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )

      if (!response.ok) {
        throw new Error(`Failed to fetch history: ${response.status}`)
      }

      const apiResponse = await response.json()

      if (!apiResponse.success) {
        throw new Error(apiResponse.error || 'Failed to fetch transaction history')
      }

      const data: TransactionHistoryResponse = apiResponse.data
      // Filter out invalid transactions and map to our format
      const transactions: Transaction[] = data.swaps
        .filter((swap: SwapHistoryItem) => {
          // Filter out transactions with essential missing data
          return swap.intentId && swap.inputToken && swap.outputToken && swap.createdAt
        })
        .map((swap: SwapHistoryItem) => {
          const inputTokenInfo = getTokenInfo(swap.inputToken)
          const outputTokenInfo = getTokenInfo(swap.outputToken)

          // Debug logging for transaction status
          console.log(`[Transaction History] Processing swap: ${swap.intentId}`, {
            status: swap.status,
            settledAt: swap.settledAt,
            createdAt: swap.createdAt,
            error: swap.error,
            inputAmount: swap.inputAmount,
            outputAmount: swap.outputAmount
          })

          // Enhanced status detection
          let status: 'success' | 'pending' | 'failed'

          // If there's an error, it's definitely failed
          if (swap.error) {
            status = 'failed'
          }
          // If it's settled, it's successful
          else if (swap.settledAt) {
            status = 'success'
          }
          // Otherwise use the status field
          else {
            status = getStatus(swap.status)
          }

          return {
            id: swap.intentId,
            type: 'swap' as const,
            status,
            timestamp: new Date(swap.createdAt),
            fromToken: {
              symbol: inputTokenInfo.symbol,
              amount: formatAmount(swap.inputAmount, inputTokenInfo.decimals),
              logoURI: inputTokenInfo.logoURI,
              address: swap.inputToken,
            },
            toToken: {
              symbol: outputTokenInfo.symbol,
              amount: swap.outputAmount ? formatAmount(swap.outputAmount, outputTokenInfo.decimals) : '0',
              logoURI: outputTokenInfo.logoURI,
              address: swap.outputToken,
            },
            txHash: swap.intentId,
            privacyLevel: swap.privacyMode ? 'private' : 'public',
            intentId: swap.intentId,
          }
        })

      if (reset) {
        setHistory(transactions)
      } else {
        setHistory(prev => [...prev, ...transactions])
      }

      setHasMore(transactions.length === limit && data.pagination.total > currentOffset + limit)
      setOffset(currentOffset + transactions.length)

    } catch (err) {
      console.error('Failed to fetch transaction history:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch transaction history')
    } finally {
      setLoading(false)
    }
  }, [publicKey, offset, limit])

  const loadMore = useCallback(() => {
    if (!loading && hasMore && publicKey) {
      fetchHistory(false)
    }
  }, [loading, hasMore, publicKey, fetchHistory])

  const refresh = useCallback(() => {
    setOffset(0)
    setHasMore(true)
    fetchHistory(true)
  }, [fetchHistory])

  // Auto-refresh when wallet connects or privacy mode changes
  useEffect(() => {
    if (publicKey) {
      refresh()
    } else {
      setHistory([])
      setError(null)
    }
  }, [publicKey, privacyMode, refresh])

  // Filter transactions based on privacy mode
  const filteredHistory = useMemo(() => {
    if (!privacyMode) {
      return history
    }

    // In privacy mode, only show private transactions
    return history.filter(tx => tx.privacyLevel === 'private')
  }, [history, privacyMode])

  return {
    transactions: filteredHistory,
    loading,
    error,
    hasMore,
    loadMore,
    refresh,
    isEmpty: !loading && filteredHistory.length === 0,
  }
}