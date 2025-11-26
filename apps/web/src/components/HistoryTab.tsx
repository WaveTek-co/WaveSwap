'use client'

import { useState, useMemo } from 'react'
import {
  ClockIcon,
  ArrowPathIcon,
  ShieldCheckIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  ArrowUpRightIcon,
  ArrowDownLeftIcon,
  ArrowTopRightOnSquareIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  CalendarIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline'
import { useThemeConfig, createGlassStyles } from '@/lib/theme'

interface HistoryTabProps {
  privacyMode: boolean
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
  }
  toToken: {
    symbol: string
    amount: string
    logoURI?: string
  }
  txHash?: string
  priceImpact?: number
  privacyLevel?: 'public' | 'private'
}

// Real transaction data will be loaded from the application state or API
// For now, return empty array which will show the empty state
const getRealTransactions = (): Transaction[] => {
  // TODO: Implement real transaction history fetching
  // This could integrate with:
  // - Local storage for transaction history
  // - Solana RPC call to get transaction history
  // - WaveSwap backend API for user transaction history
  return []
}

export function HistoryTab({ privacyMode }: HistoryTabProps) {
  const theme = useThemeConfig()
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'pending' | 'failed'>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | 'swap' | 'send' | 'receive'>('all')

  // Get real transactions (empty for now until implemented)
  const transactions = useMemo(() => getRealTransactions(), [])

  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      const matchesSearch = searchQuery === '' ||
        tx.fromToken.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tx.toToken.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tx.txHash?.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesStatus = statusFilter === 'all' || tx.status === statusFilter
      const matchesType = typeFilter === 'all' || tx.type === typeFilter

      return matchesSearch && matchesStatus && matchesType
    })
  }, [transactions, searchQuery, statusFilter, typeFilter])

  const formatTimestamp = (date: Date) => {
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / (1000 * 60))
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    return date.toLocaleDateString()
  }

  const getStatusIcon = (status: Transaction['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircleIcon className="h-4 w-4" style={{ color: theme.colors.success }} />
      case 'pending':
        return <ArrowPathIcon className="h-4 w-4 animate-spin" style={{ color: theme.colors.warning }} />
      case 'failed':
        return <XCircleIcon className="h-4 w-4" style={{ color: theme.colors.error }} />
      default:
        return null
    }
  }

  const getStatusColor = (status: Transaction['status']) => {
    switch (status) {
      case 'success':
        return theme.colors.success
      case 'pending':
        return theme.colors.warning
      case 'failed':
        return theme.colors.error
      default:
        return theme.colors.textMuted
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div
        className="relative p-6 rounded-2xl mb-6 overflow-hidden"
        style={{
          ...createGlassStyles(theme),
          background: `
            linear-gradient(135deg,
              ${theme.colors.surface}ee 0%,
              ${theme.colors.surfaceHover}cc 50%,
              ${theme.colors.surface}ee 100%
            ),
            radial-gradient(circle at 25% 25%,
              ${theme.colors.primary}10 0%,
              transparent 50%
            )
          `,
          border: `1px solid ${theme.colors.primary}20`,
          boxShadow: `
            0 16px 48px ${theme.colors.shadow},
            0 6px 18px ${theme.colors.primary}15,
            inset 0 1px 0 rgba(255, 255, 255, 0.1)
          `
        }}
      >
        {/* Noise grain overlay */}
        <div
          className="absolute inset-0 opacity-4 pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='200' height='200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3Cfilter%3E%3Crect width='200' height='200' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
            filter: 'contrast(1.3) brightness(1.1)'
          }}
        />

        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg p-2" style={{
              background: privacyMode ? `${theme.colors.success}20` : `${theme.colors.primary}20`,
              border: privacyMode ? `1px solid ${theme.colors.success}40` : `1px solid ${theme.colors.primary}40`
            }}>
              <ClockIcon className="h-6 w-6" style={{
                color: privacyMode ? theme.colors.success : theme.colors.primary
              }} />
            </div>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2" style={{
                color: theme.colors.textPrimary,
                fontFamily: 'var(--font-helvetica)',
                fontWeight: 600,
                letterSpacing: '0.025em'
              }}>
                {privacyMode ? 'Private' : 'Transaction'} History
                {privacyMode && (
                  <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full" style={{
                    background: `${theme.colors.success}10`,
                    border: `1px solid ${theme.colors.success}20`
                  }}>
                    <ShieldCheckIcon className="h-3 w-3" style={{ color: theme.colors.success }} />
                    <span className="text-xs font-medium" style={{ color: theme.colors.success }}>Private</span>
                  </div>
                )}
              </h1>
              <p className="text-sm" style={{ color: theme.colors.textMuted }}>
                {privacyMode
                  ? 'Your confidential swap history with enhanced privacy protection'
                  : 'Complete transaction history and trading activity'
                }
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="p-2 rounded-lg transition-all duration-200"
              style={{
                ...createGlassStyles(theme),
                border: `1px solid ${theme.colors.border}`
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = theme.colors.surfaceHover
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = createGlassStyles(theme).background as string
              }}
            >
              <ChartBarIcon className="h-4 w-4" style={{ color: theme.colors.textMuted }} />
            </button>
            <button
              className="p-2 rounded-lg transition-all duration-200"
              style={{
                ...createGlassStyles(theme),
                border: `1px solid ${theme.colors.border}`
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = theme.colors.surfaceHover
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = createGlassStyles(theme).background as string
              }}
            >
              <CalendarIcon className="h-4 w-4" style={{ color: theme.colors.textMuted }} />
            </button>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div
        className="relative p-4 rounded-xl mb-6 overflow-hidden"
        style={{
          ...createGlassStyles(theme),
          background: `${theme.colors.surface}cc`,
          border: `1px solid ${theme.colors.border}`,
          backdropFilter: 'blur(16px) saturate(1.5)'
        }}
      >
        {/* Noise grain overlay */}
        <div
          className="absolute inset-0 opacity-3 pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3Cfilter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
            filter: 'contrast(1.2) brightness(1.1)'
          }}
        />

        <div className="relative z-10 flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4" style={{ color: theme.colors.textMuted }} />
            <input
              type="text"
              placeholder="Search transactions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg text-sm"
              style={{
                border: `1px solid ${theme.colors.border}`,
                background: `${theme.colors.surface}99`,
                color: theme.colors.textPrimary,
                backdropFilter: 'blur(8px) saturate(1.2)',
                fontFamily: 'var(--font-helvetica)'
              }}
            />
          </div>

          {/* Status Filter */}
          <div className="flex gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'success' | 'pending' | 'failed')}
              className="px-4 py-2 rounded-lg text-sm"
              style={{
                border: `1px solid ${theme.colors.border}`,
                background: `${theme.colors.surface}99`,
                color: theme.colors.textPrimary,
                backdropFilter: 'blur(8px) saturate(1.2)',
                fontFamily: 'var(--font-helvetica)'
              }}
            >
              <option value="all">All Status</option>
              <option value="success">Success</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as 'all' | 'swap' | 'send' | 'receive')}
              className="px-4 py-2 rounded-lg text-sm"
              style={{
                border: `1px solid ${theme.colors.border}`,
                background: `${theme.colors.surface}99`,
                color: theme.colors.textPrimary,
                backdropFilter: 'blur(8px) saturate(1.2)',
                fontFamily: 'var(--font-helvetica)'
              }}
            >
              <option value="all">All Types</option>
              <option value="swap">Swaps</option>
              <option value="send">Sends</option>
              <option value="receive">Receives</option>
            </select>
          </div>
        </div>
      </div>

      {/* Transaction List */}
      <div className="space-y-3">
        {filteredTransactions.length === 0 ? (
          <div
            className="relative p-12 rounded-2xl text-center overflow-hidden"
            style={{
              ...createGlassStyles(theme),
              background: `${theme.colors.surface}cc`,
              border: `1px solid ${theme.colors.border}`,
              backdropFilter: 'blur(16px) saturate(1.5)'
            }}
          >
            {/* Noise grain overlay */}
            <div
              className="absolute inset-0 opacity-3 pointer-events-none"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3Cfilter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
                filter: 'contrast(1.2) brightness(1.1)'
              }}
            />

            <div className="relative z-10">
              <div className="flex justify-center mb-4">
                <ClockIcon className="h-16 w-16" style={{ color: theme.colors.textMuted }} />
              </div>
              <h3 className="text-xl font-semibold mb-2" style={{
                color: theme.colors.textPrimary,
                fontFamily: 'var(--font-helvetica)'
              }}>
                {privacyMode ? 'Private Transaction History' : 'Transaction History'}
              </h3>
              <p className="text-sm mb-4" style={{ color: theme.colors.textMuted }}>
                {privacyMode
                  ? 'Your confidential swap history will appear here once you start trading.'
                  : 'Your swap history will appear here once you start trading.'
                }
              </p>
              {privacyMode && (
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full" style={{
                  background: `${theme.colors.success}10`,
                  border: `1px solid ${theme.colors.success}20`
                }}>
                  <ShieldCheckIcon className="h-4 w-4" style={{ color: theme.colors.success }} />
                  <span className="text-sm font-medium" style={{ color: theme.colors.success }}>Amounts Hidden</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          filteredTransactions.map((transaction) => (
            <div
              key={transaction.id}
              className="relative p-4 rounded-xl overflow-hidden transition-all duration-200 hover:scale-[1.01] group"
              style={{
                ...createGlassStyles(theme),
                background: `${theme.colors.surface}dd`,
                border: `1px solid ${theme.colors.border}`,
                backdropFilter: 'blur(16px) saturate(1.5)'
              }}
            >
              {/* Noise grain overlay */}
              <div
                className="absolute inset-0 opacity-3 pointer-events-none"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3Cfilter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
                  filter: 'contrast(1.2) brightness(1.1)'
                }}
              />

              <div className="relative z-10">
                <div className="flex items-center justify-between">
                  {/* Left side - Transaction details */}
                  <div className="flex items-center gap-4">
                    {/* Status */}
                    <div className="flex items-center gap-2">
                      {getStatusIcon(transaction.status)}
                      <span className="text-sm font-medium" style={{
                        color: getStatusColor(transaction.status),
                        fontFamily: 'var(--font-helvetica)'
                      }}>
                        {transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1)}
                      </span>
                    </div>

                    {/* Tokens */}
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-semibold" style={{
                          color: theme.colors.textPrimary,
                          fontFamily: 'var(--font-helvetica)'
                        }}>
                          {privacyMode && transaction.privacyLevel === 'private' ? '***' : transaction.fromToken.amount}
                        </p>
                        <p className="text-xs" style={{ color: theme.colors.textMuted }}>{transaction.fromToken.symbol}</p>
                      </div>

                      <div className="flex flex-col items-center">
                        <ArrowPathIcon className="h-4 w-4" style={{ color: theme.colors.textMuted }} />
                      </div>

                      <div className="text-right">
                        <p className="text-sm font-semibold" style={{
                          color: theme.colors.textPrimary,
                          fontFamily: 'var(--font-helvetica)'
                        }}>
                          {privacyMode && transaction.privacyLevel === 'private' ? '***' : transaction.toToken.amount}
                        </p>
                        <p className="text-xs" style={{ color: theme.colors.textMuted }}>{transaction.toToken.symbol}</p>
                      </div>
                    </div>
                  </div>

                  {/* Right side - Metadata */}
                  <div className="flex items-center gap-4">
                    {/* Privacy indicator */}
                    {transaction.privacyLevel === 'private' && (
                      <div className="flex items-center gap-1 px-2 py-1 rounded-full" style={{
                        background: `${theme.colors.success}10`,
                        border: `1px solid ${theme.colors.success}20`
                      }}>
                        <ShieldCheckIcon className="h-3 w-3" style={{ color: theme.colors.success }} />
                        <span className="text-xs font-medium" style={{ color: theme.colors.success }}>Private</span>
                      </div>
                    )}

                    {/* Timestamp */}
                    <div className="text-right">
                      <p className="text-xs" style={{
                        color: theme.colors.textMuted,
                        fontFamily: 'var(--font-helvetica)'
                      }}>
                        {formatTimestamp(transaction.timestamp)}
                      </p>
                      {transaction.txHash && (
                        <p className="text-xs font-mono" style={{ color: theme.colors.textMuted }}>{transaction.txHash}</p>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {transaction.txHash && (
                        <button
                          className="p-1.5 rounded-lg transition-all duration-200"
                          style={{
                            background: `${theme.colors.border}20`,
                            border: `1px solid ${theme.colors.border}40`
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = `${theme.colors.border}30`
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = `${theme.colors.border}20`
                          }}
                        >
                          <ArrowTopRightOnSquareIcon className="h-3 w-3" style={{ color: theme.colors.textMuted }} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Additional details */}
                {transaction.type === 'swap' && transaction.priceImpact && (
                  <div className="mt-3 pt-3" style={{
                    borderTop: `1px solid ${theme.colors.border}30`
                  }}>
                    <div className="flex items-center justify-between text-xs">
                      <span style={{ color: theme.colors.textMuted }}>Price Impact</span>
                      <span className="font-medium font-jetbrains" style={{
                        color: transaction.priceImpact > 1 ? theme.colors.error :
                              transaction.priceImpact > 0.5 ? theme.colors.warning : theme.colors.success
                      }}>
                        {transaction.priceImpact.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Load more */}
      {filteredTransactions.length > 0 && (
        <div className="mt-6 text-center">
          <button
            className="px-6 py-3 rounded-xl transition-all duration-200 font-medium"
            style={{
              background: `linear-gradient(135deg, ${theme.colors.primary}cc 0%, ${theme.colors.secondary}cc 100%)`,
              border: `1px solid ${theme.colors.primary}40`,
              backdropFilter: 'blur(16px) saturate(1.8)',
              fontFamily: 'var(--font-helvetica)',
              fontWeight: 500,
              color: theme.colors.textPrimary
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = `linear-gradient(135deg, ${theme.colors.primary}dd 0%, ${theme.colors.secondary}dd 100%)`
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = `linear-gradient(135deg, ${theme.colors.primary}cc 0%, ${theme.colors.secondary}cc 100%)`
            }}
          >
            Load More Transactions
          </button>
        </div>
      )}
    </div>
  )
}