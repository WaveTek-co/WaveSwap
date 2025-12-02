'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Search, ExternalLink, X, Sparkles, Globe, Wallet, Activity, DollarSign, Code } from 'lucide-react'
import { useThemeConfig, createGlassStyles, createInputStyles } from '@/lib/theme'

interface SearchSuggestion {
  type: 'transaction' | 'account' | 'token' | 'program' | 'block' | 'authority' | 'mint'
  label: string
  value: string
  description?: string
  icon: any
  orbUrl: string
}

export function HeliusSearchBar() {
  const theme = useThemeConfig()
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [filteredSuggestions, setFilteredSuggestions] = useState<SearchSuggestion[]>([])
  const searchRef = useRef<HTMLDivElement>(null)

  const suggestions: SearchSuggestion[] = [
    {
      type: 'transaction',
      label: 'Transaction',
      value: query,
      description: 'Search for transaction signature',
      icon: Activity,
      orbUrl: `https://orb.helius.dev/tx/${query}/history?cluster=mainnet-beta`
    },
    {
      type: 'account',
      label: 'Account',
      value: query,
      description: 'Search for wallet address',
      icon: Wallet,
      orbUrl: `https://orb.helius.dev/address/${query}?cluster=mainnet-beta`
    },
    {
      type: 'token',
      label: 'Token',
      value: query,
      description: 'Search for token mint address',
      icon: DollarSign,
      orbUrl: `https://orb.helius.dev/token/${query}?cluster=mainnet-beta`
    },
    {
      type: 'program',
      label: 'Program',
      value: query,
      description: 'Search for program ID',
      icon: Code,
      orbUrl: `https://orb.helius.dev/program/${query}?cluster=mainnet-beta`
    },
    {
      type: 'block',
      label: 'Block',
      value: query,
      description: 'Search for block number or hash',
      icon: Globe,
      orbUrl: `https://orb.helius.dev/block/${query}?cluster=mainnet-beta`
    },
    {
      type: 'authority',
      label: 'Authority',
      value: query,
      description: 'Search for authority address',
      icon: Sparkles,
      orbUrl: `https://orb.helius.dev/authority/${query}?cluster=mainnet-beta`
    }
  ]

  // Common Solana addresses for quick access
  const commonAddresses = [
    {
      type: 'account' as const,
      label: 'Phantom Treasury',
      value: 'PhantomUqEFp7XcKH36kBYEJykRfoVWKtJNLnAVf9qparQE',
      description: 'Official Phantom wallet treasury',
      icon: Wallet,
      orbUrl: 'https://orb.helius.dev/address/PhantomUqEFp7XcKH36kBYEJykRfoVWKtJNLnAVf9qparQE?cluster=mainnet-beta'
    },
    {
      type: 'token' as const,
      label: 'SOL (Wrapped)',
      value: 'So11111111111111111111111111111111111111112',
      description: 'Wrapped SOL token',
      icon: DollarSign,
      orbUrl: 'https://orb.helius.dev/token/So11111111111111111111111111111111111111112?cluster=mainnet-beta'
    },
    {
      type: 'token' as const,
      label: 'USDC',
      value: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      description: 'USDC Coin',
      icon: DollarSign,
      orbUrl: 'https://orb.helius.dev/token/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v?cluster=mainnet-beta'
    },
    {
      type: 'program' as const,
      label: 'System Program',
      value: '11111111111111111111111111111111',
      description: 'Solana System Program',
      icon: Code,
      orbUrl: 'https://orb.helius.dev/program/11111111111111111111111111111111?cluster=mainnet-beta'
    }
  ]

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  useEffect(() => {
    if (!query.trim()) {
      setFilteredSuggestions(commonAddresses)
      return
    }

    // Check if query looks like a specific type
    const isTransaction = query.length >= 80 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(query)
    const isAddress = query.length >= 32 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(query)
    const isNumber = /^\d+$/.test(query)

    let filtered: SearchSuggestion[] = []

    if (isTransaction) {
      filtered = suggestions.filter(s => s.type === 'transaction')
    } else if (isAddress) {
      filtered = suggestions.filter(s => ['account', 'token', 'program', 'authority'].includes(s.type))
    } else if (isNumber) {
      filtered = suggestions.filter(s => s.type === 'block')
    } else {
      // Show all suggestions for general search
      filtered = suggestions.map(s => ({ ...s, value: query }))
    }

    setFilteredSuggestions(filtered.slice(0, 6))
  }, [query])

  const handleSearch = (suggestion: SearchSuggestion) => {
    const url = suggestion.orbUrl.replace(suggestion.value, query || suggestion.value)
    window.open(url, '_blank', 'noopener,noreferrer')
    setIsOpen(false)
    setQuery('')
  }

  const handleQuickSearch = () => {
    if (!query.trim()) return

    // Try to detect the type and open appropriate URL
    const isTransaction = query.length >= 80 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(query)
    const isAddress = query.length >= 32 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(query)
    const isNumber = /^\d+$/.test(query)

    let url = ''
    if (isTransaction) {
      url = `https://orb.helius.dev/tx/${query}/history?cluster=mainnet-beta`
    } else if (isAddress) {
      url = `https://orb.helius.dev/address/${query}?cluster=mainnet-beta`
    } else if (isNumber) {
      url = `https://orb.helius.dev/block/${query}?cluster=mainnet-beta`
    } else {
      url = `https://orb.helius.dev?q=${encodeURIComponent(query)}&cluster=mainnet-beta`
    }

    window.open(url, '_blank', 'noopener,noreferrer')
    setQuery('')
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleQuickSearch()
    } else if (e.key === 'Escape') {
      setIsOpen(false)
    }
  }

  return (
    <div ref={searchRef} className="relative hidden md:block w-full max-w-xs lg:max-w-sm">
      {/* Main input container - matching history tab design */}
      <div
        className="relative p-1.5 rounded-lg overflow-hidden"
        style={{
          ...createGlassStyles(theme),
          background: `${theme.colors.surface}cc`,
          border: `1px solid ${theme.colors.border}`,
          backdropFilter: 'blur(16px) saturate(1.5)'
        }}
      >
        
        <div className="relative z-10">
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setIsOpen(true)
              }}
              onFocus={() => setIsOpen(true)}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = theme.colors.primary
                e.currentTarget.style.background = `${theme.colors.surface}cc`
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = theme.colors.border
                e.currentTarget.style.background = `${theme.colors.surface}99`
              }}
              onKeyDown={handleKeyPress}
              placeholder="Scan the Orb..."
              className="w-full pl-3 pr-12 py-1 rounded-md text-xs"
              style={{
                border: `1px solid ${theme.colors.border}`,
                background: `${theme.colors.surface}99`,
                color: theme.colors.textPrimary,
                backdropFilter: 'blur(8px) saturate(1.2)',
                fontFamily: 'var(--font-helvetica)',
                outline: 'none',
                transition: 'all 0.2s ease'
              }}
            />

            {/* Orb Icon on the right */}
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center justify-center pointer-events-none z-20">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, #fb923c 0%, #f97316 50%, #ea580c 100%)',
                  boxShadow: theme.name === 'dark'
                    ? '0 0 12px rgba(251, 146, 60, 0.6), 0 2px 4px rgba(0, 0, 0, 0.3)'
                    : '0 0 8px rgba(251, 146, 60, 0.4), 0 1px 3px rgba(0, 0, 0, 0.2)',
                  filter: 'brightness(1.1) saturate(1.2) drop-shadow(0 0 4px rgba(251, 146, 60, 0.5))'
                }}
              >
                <Globe
                  className="w-3.5 h-3.5 text-white"
                  style={{
                    filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3))'
                  }}
                />
              </div>
            </div>

            {/* Clear button - adjust position for orb icon */}
            <button
              onClick={() => setQuery('')}
              className="absolute right-10 top-1/2 transform -translate-y-1/2 flex items-center opacity-60 hover:opacity-100 transition-opacity z-10"
            >
              {query && <X className="h-3 w-3" style={{ color: theme.colors.textMuted }} />}
            </button>
          </div>
        </div>
      </div>

      {/* Search Suggestions Dropdown */}
      {isOpen && (
        <>
          {/* Click outside to close overlay */}
          <div
            className="fixed inset-0 z-40"
            style={{ backgroundColor: 'transparent' }}
            onClick={() => setIsOpen(false)}
          />

          <div
            className="absolute top-full left-0 right-0 mt-1 z-50"
            style={{
              backgroundColor: theme.name === 'dark' ? '#1a1a1a' : '#ffffff',
              border: `1px solid ${theme.colors.border}`,
              borderRadius: '12px',
              boxShadow: `0 8px 32px ${theme.colors.shadow}, 0 4px 16px ${theme.colors.shadow}40`,
              maxHeight: '280px',
              overflowY: 'auto'
            }}
          >
          
          <div className="relative z-10 p-1">
            <div className="px-2 py-1 text-xs font-medium" style={{ color: theme.colors.textMuted }}>
              {query ? 'Search Results' : 'Quick Access'}
            </div>

            {filteredSuggestions.map((suggestion, index) => {
              const IconComponent = suggestion.icon
              return (
                <button
                  key={`${suggestion.type}-${index}`}
                  onClick={() => handleSearch(suggestion)}
                  className="w-full text-left px-2 py-1 rounded-md transition-colors flex items-center gap-2"
                  style={{ color: theme.colors.textPrimary }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = theme.colors.surfaceHover
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  <div
                    className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                    style={{
                      background: `${theme.colors.primary}10`,
                      color: theme.colors.primary
                    }}
                  >
                    <IconComponent className="w-2.5 h-2.5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-xs" style={{ fontFamily: 'var(--font-helvetica)' }}>{suggestion.label}</span>
                      <span className="text-xs px-1 py-0.5 rounded-full"
                        style={{
                          background: `${theme.colors.primary}10`,
                          color: theme.colors.primary,
                          fontFamily: 'var(--font-helvetica)'
                        }}>
                        {suggestion.type}
                      </span>
                    </div>
                    {suggestion.description && (
                      <div className="text-xs truncate" style={{ color: theme.colors.textSecondary, fontFamily: 'var(--font-helvetica)' }}>
                        {suggestion.description}
                      </div>
                    )}
                    <div className="text-xs truncate font-mono" style={{ color: theme.colors.textMuted }}>
                      {suggestion.value.slice(0, 12)}{suggestion.value.length > 12 ? '...' : ''}
                    </div>
                  </div>

                  <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" style={{ color: theme.colors.textMuted }} />
                </button>
              )
            })}

            {!filteredSuggestions.length && (
              <div className="px-2 py-2 text-center text-xs" style={{
                color: theme.colors.textSecondary,
                fontFamily: 'var(--font-helvetica)'
              }}>
                No suggestions found.
              </div>
            )}

            <div className="mt-1 pt-1 border-t" style={{ borderColor: theme.colors.border }}>
              <div className="px-2 py-1 text-xs text-center" style={{
                color: theme.colors.textMuted,
                fontFamily: 'var(--font-helvetica)'
              }}>
                Powered by{' '}
                <a
                  href="https://orb.helius.dev/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium hover:opacity-80 transition-opacity"
                  style={{ color: theme.colors.primary }}
                >
                  Helius Orb
                </a>
              </div>
            </div>
          </div>
        </div>
        </>
      )}
    </div>
  )
}