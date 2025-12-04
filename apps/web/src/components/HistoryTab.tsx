'use client'

import { useState, useMemo } from 'react'
import {
  ClockIcon,
  ArrowPathIcon,
  ShieldCheckIcon,
  ArrowUpRightIcon,
  ArrowDownLeftIcon,
  ArrowTopRightOnSquareIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  CalendarIcon,
  ChartBarIcon,
  ExclamationCircleIcon,
  XMarkIcon
} from '@heroicons/react/24/outline'
import { useThemeConfig, createGlassStyles } from '@/lib/theme'
import { useTransactionHistory } from '@/hooks/useTransactionHistory'
import { TokenIcon } from '@/components/TokenIcon'

interface HistoryTabProps {
  privacyMode: boolean
}

interface Transaction {
  id: string
  type: 'swap' | 'send' | 'receive'
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

export function HistoryTab({ privacyMode }: HistoryTabProps) {
  const theme = useThemeConfig()
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'swap' | 'send' | 'receive'>('all')
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [showDatePicker, setShowDatePicker] = useState(false)

  // Get real transactions from API
  const {
    transactions: allTransactions,
    loading,
    error,
    hasMore,
    loadMore,
    refresh,
    isEmpty
  } = useTransactionHistory(privacyMode)

  const filteredTransactions = useMemo(() => {
    return allTransactions.filter(tx => {
      const matchesSearch = searchQuery === '' ||
        tx.fromToken.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tx.toToken.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tx.txHash?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tx.intentId?.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesType = typeFilter === 'all' || tx.type === typeFilter

      // Filter by selected date
      let matchesDate = true
      if (selectedDate) {
        const selectedDateObj = new Date(selectedDate)
        const transactionDate = new Date(tx.timestamp)

        // Set both dates to midnight to compare only the date part
        selectedDateObj.setHours(0, 0, 0, 0)
        transactionDate.setHours(0, 0, 0, 0)

        matchesDate = selectedDateObj.getTime() === transactionDate.getTime()
      }

      return matchesSearch && matchesType && matchesDate
    })
  }, [allTransactions, searchQuery, typeFilter, selectedDate])

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

  
  return (
    <div className="max-w-4xl sm:max-w-5xl lg:max-w-6xl mx-auto px-2 xs:px-0">
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
              onClick={refresh}
              disabled={loading}
              className="p-2 rounded-lg transition-all duration-200 disabled:opacity-50"
              style={{
                ...createGlassStyles(theme),
                border: `1px solid ${theme.colors.border}`
              }}
              onMouseEnter={(e) => {
                if (!loading) e.currentTarget.style.background = theme.colors.surfaceHover
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = createGlassStyles(theme).background as string
              }}
            >
              <ArrowPathIcon className={`h-4 w-4 ${loading && allTransactions.length === 0 ? 'animate-spin' : ''}`} style={{ color: theme.colors.textMuted }} />
            </button>
            <button
              onClick={() => {
                // TODO: Implement analytics/stats view
                console.log('Chart/Analytics clicked')
              }}
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
              onClick={() => setShowDatePicker(!showDatePicker)}
              className="p-2 rounded-lg transition-all duration-200 relative"
              style={{
                ...createGlassStyles(theme),
                border: `1px solid ${theme.colors.border}`,
                ...(selectedDate && {
                  background: `${theme.colors.primary}20`,
                  borderColor: `${theme.colors.primary}40`
                })
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = selectedDate ? `${theme.colors.primary}30` : theme.colors.surfaceHover
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = selectedDate ? `${theme.colors.primary}20` : createGlassStyles(theme).background as string
              }}
            >
              <CalendarIcon className="h-4 w-4" style={{
                color: selectedDate ? theme.colors.primary : theme.colors.textMuted
              }} />
              {selectedDate && (
                <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full" style={{
                  background: theme.colors.primary
                }} />
              )}
            </button>
          </div>
        </div>

      {/* Date Picker Popover */}
      {showDatePicker && (
        <div className="absolute top-20 right-6 z-50" style={{ minWidth: '280px' }}>
          <div
            className="p-4 rounded-xl shadow-2xl border"
            style={{
              ...createGlassStyles(theme),
              background: theme.colors.surface,
              borderColor: theme.colors.border,
              boxShadow: `
                0 20px 40px ${theme.colors.shadow},
                0 8px 24px ${theme.colors.primary}20
              `
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold" style={{
                color: theme.colors.textPrimary,
                fontFamily: 'var(--font-helvetica)'
              }}>
                Filter by Date
              </h3>
              <button
                onClick={() => setShowDatePicker(false)}
                className="p-1 rounded-lg transition-all duration-200"
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
                <XMarkIcon className="h-3 w-3" style={{ color: theme.colors.textMuted }} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium block mb-1" style={{
                  color: theme.colors.textMuted,
                  fontFamily: 'var(--font-helvetica)'
                }}>
                  Select Date
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    setSelectedDate(e.target.value)
                    setShowDatePicker(false)
                  }}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{
                    border: `1px solid ${theme.colors.border}`,
                    background: `${theme.colors.surface}99`,
                    color: theme.colors.textPrimary,
                    fontFamily: 'var(--font-helvetica)'
                  }}
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>

              {selectedDate && (
                <button
                  onClick={() => {
                    setSelectedDate('')
                    setShowDatePicker(false)
                  }}
                  className="w-full px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200"
                  style={{
                    background: `${theme.colors.error}10`,
                    border: `1px solid ${theme.colors.error}20`,
                    color: theme.colors.error,
                    fontFamily: 'var(--font-helvetica)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = `${theme.colors.error}20`
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = `${theme.colors.error}10`
                  }}
                >
                  Clear Filter
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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

          {/* Type Filter */}
          <div className="flex gap-2">
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

      {/* Error State */}
      {error && (
        <div
          className="relative p-8 rounded-2xl text-center overflow-hidden"
          style={{
            ...createGlassStyles(theme),
            background: `${theme.colors.error}08`,
            border: `1px solid ${theme.colors.error}20`,
            backdropFilter: 'blur(16px) saturate(1.5)'
          }}
        >
          <div className="relative z-10">
            <div className="flex justify-center mb-4">
              <ExclamationCircleIcon className="h-12 w-12" style={{ color: theme.colors.error }} />
            </div>
            <h3 className="text-lg font-semibold mb-2" style={{
              color: theme.colors.textPrimary,
              fontFamily: 'var(--font-helvetica)'
            }}>
              Failed to Load History
            </h3>
            <p className="text-sm mb-4" style={{ color: theme.colors.textMuted }}>
              {error}
            </p>
            <button
              onClick={refresh}
              disabled={loading}
              className="px-4 py-2 rounded-lg transition-all duration-200 disabled:opacity-50"
              style={{
                background: theme.colors.error,
                color: 'white',
                fontFamily: 'var(--font-helvetica)',
                fontWeight: 500
              }}
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* Loading State - Only show during initial load or when explicitly loading more */}
      {loading && allTransactions.length === 0 && (
        <div className="space-y-3">
          {[...Array(3)].map((_, index) => (
            <div
              key={`loading-${index}`}
              className="relative p-4 rounded-xl overflow-hidden"
              style={{
                ...createGlassStyles(theme),
                background: `${theme.colors.surface}dd`,
                border: `1px solid ${theme.colors.border}`,
                backdropFilter: 'blur(16px) saturate(1.5)'
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-4 h-4 rounded-full animate-pulse" style={{ backgroundColor: theme.colors.surfaceHover }} />
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-8 rounded animate-pulse" style={{ backgroundColor: theme.colors.surface }} />
                    <ArrowPathIcon className="h-4 w-4" style={{ color: theme.colors.textMuted }} />
                    <div className="w-16 h-8 rounded animate-pulse" style={{ backgroundColor: theme.colors.surface }} />
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-20 h-4 rounded animate-pulse" style={{ backgroundColor: theme.colors.surfaceHover }} />
                  <div className="w-8 h-8 rounded animate-pulse" style={{ backgroundColor: theme.colors.surface }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Transaction List */}
      <div className="space-y-3">
        {!loading && !error && filteredTransactions.length === 0 ? (
          <div
            className="relative p-12 rounded-2xl text-center overflow-hidden"
            style={{
              ...createGlassStyles(theme),
              background: `${theme.colors.surface}cc`,
              border: `1px solid ${theme.colors.border}`,
              backdropFilter: 'blur(16px) saturate(1.5)'
            }}
          >
            
            <div className="relative z-10">
              <div className="flex justify-center mb-4">
                <ClockIcon className="h-16 w-16" style={{ color: theme.colors.textMuted }} />
              </div>
              <h3 className="text-xl font-semibold mb-2" style={{
                color: theme.colors.textPrimary,
                fontFamily: 'var(--font-helvetica)'
              }}>
                {privacyMode ? 'No Private Transactions' : 'No Transaction History'}
              </h3>
              <p className="text-sm mb-4" style={{ color: theme.colors.textMuted }}>
                {privacyMode
                  ? 'Your confidential swap history will appear here once you start private trading.'
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
              
              <div className="relative z-10">
                <div className="flex items-center justify-between">
                  {/* Left side - Transaction details */}
                  <div className="flex items-center gap-4">
                    {/* Tokens */}
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <TokenIcon
                          symbol={transaction.fromToken.symbol}
                          mint={transaction.fromToken.address}
                          logoURI={transaction.fromToken.logoURI}
                          size={24}
                          className="rounded-full"
                        />
                        <div className="text-right">
                          <p className="text-sm font-semibold" style={{
                            color: theme.colors.textPrimary,
                            fontFamily: 'var(--font-helvetica)'
                          }}>
                            {privacyMode && transaction.privacyLevel === 'private' ? '***' : transaction.fromToken.amount}
                          </p>
                          <p className="text-xs" style={{ color: theme.colors.textMuted }}>{transaction.fromToken.symbol}</p>
                        </div>
                      </div>

                      <div className="flex flex-col items-center">
                        <ArrowPathIcon className="h-4 w-4" style={{ color: theme.colors.textMuted }} />
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <p className="text-sm font-semibold" style={{
                            color: theme.colors.textPrimary,
                            fontFamily: 'var(--font-helvetica)'
                          }}>
                            {privacyMode && transaction.privacyLevel === 'private' ? '***' : transaction.toToken.amount}
                          </p>
                          <p className="text-xs" style={{ color: theme.colors.textMuted }}>{transaction.toToken.symbol}</p>
                        </div>
                        <TokenIcon
                          symbol={transaction.toToken.symbol}
                          mint={transaction.toToken.address}
                          logoURI={transaction.toToken.logoURI}
                          size={24}
                          className="rounded-full"
                        />
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
                          onClick={() => {
                            const orbUrl = `https://orb.helius.dev/tx/${transaction.txHash}`
                            window.open(orbUrl, '_blank')
                          }}
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
      {hasMore && !loading && !error && filteredTransactions.length > 0 && (
        <div className="mt-6 text-center">
          <button
            onClick={loadMore}
            disabled={loading}
            className="px-6 py-3 rounded-xl transition-all duration-200 font-medium disabled:opacity-50"
            style={{
              background: `linear-gradient(135deg, ${theme.colors.primary}cc 0%, ${theme.colors.secondary}cc 100%)`,
              border: `1px solid ${theme.colors.primary}40`,
              backdropFilter: 'blur(16px) saturate(1.8)',
              fontFamily: 'var(--font-helvetica)',
              fontWeight: 500,
              color: theme.colors.textPrimary
            }}
            onMouseEnter={(e) => {
              if (!loading) e.currentTarget.style.background = `linear-gradient(135deg, ${theme.colors.primary}dd 0%, ${theme.colors.secondary}dd 100%)`
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
    </div>
  )
}