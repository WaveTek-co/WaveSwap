'use client'

import { useState, Fragment, useMemo, useEffect, useCallback } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import {
  ChevronDownIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  StarIcon,
  SparklesIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline'
import {
  ChevronUpDownIcon,
  WalletIcon
} from '@heroicons/react/24/solid'
import { Token } from '@/types/token'
import { TokenIcon } from '@/components/TokenIcon'
import { TOKEN_ADDRESS_MAP, TOKEN_SYMBOL_MAP } from '@/lib/tokens'
import { useThemeConfig, createGlassStyles } from '@/lib/theme'

interface TokenSelectorProps {
  selectedToken: Token | null
  onTokenChange: (token: Token) => void
  tokens: Token[]
  disabled?: boolean
  balances?: Map<string, string>
  privacyMode?: boolean
  showConfidentialIndicator?: boolean
}

// Recommended tokens to show initially
const RECOMMENDED_TOKENS = [
  'So11111111111111111111111111111111111111112', // SOL
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', // WAVE
  'WeaL1thsNAUSLjJgmqrjhmTkpgLiu6Q9tmvAFLc2W7Rt', // WEALTH
  'zEc1pBwgY1CHwGhVmeU52sreu3v9UtQmRzKPAGBmfexr', // ZEC
]

const JUPITER_SEARCH_API = '/api/v1/jupiter/tokens/v2/search'
const JUPITER_CDN = 'https://img-cdn.jup.ag/tokens'

export function TokenSelectorNew({
  selectedToken,
  onTokenChange,
  tokens,
  disabled = false,
  balances,
  privacyMode = false,
  showConfidentialIndicator = false
}: TokenSelectorProps) {
  const theme = useThemeConfig()
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Token[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [allTokens, setAllTokens] = useState<Token[]>([])

  // Initialize tokens on mount
  useEffect(() => {
    // Start with provided tokens (should be user tokens + recommended)
    setAllTokens(tokens)
  }, [tokens])

  // Filter tokens for initial display
  const getInitialTokens = useCallback(() => {
    // 1. User tokens with balance
    const userTokens = allTokens.filter(token => {
      if (!balances) return false
      const balance = balances.get(token.address)
      return balance && parseFloat(balance) > 0
    })

    // 2. Recommended tokens (if not already in user tokens)
    const recommendedTokens = allTokens.filter(token =>
      RECOMMENDED_TOKENS.includes(token.address) &&
      !userTokens.find(ut => ut.address === token.address)
    )

    return [...userTokens, ...recommendedTokens]
  }, [allTokens, balances])

  // Fast token lookup using precomputed maps for instant results
  const fastTokenLookup = useCallback((query: string): Token[] => {
    const lowerQuery = query.toLowerCase()
    const results: Token[] = []

    // Fast symbol lookup using map
    const symbolMatch = TOKEN_SYMBOL_MAP.get(lowerQuery)
    if (symbolMatch) {
      results.push(symbolMatch)
    }

    // Fast address lookup using map
    const addressMatch = TOKEN_ADDRESS_MAP.get(query)
    if (addressMatch && !results.find(t => t.address === addressMatch.address)) {
      results.push(addressMatch)
    }

    // Fallback to local search in user tokens
    const localMatches = allTokens.filter(token =>
      (token.name.toLowerCase().includes(lowerQuery) ||
       token.symbol.toLowerCase().includes(lowerQuery)) &&
      !results.find(t => t.address === token.address)
    )

    return [...results, ...localMatches].slice(0, 10)
  }, [allTokens])

  // Search tokens with aggressive debouncing and fast local lookup
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    // Very aggressive debouncing - prioritize instant local results
    const searchTimer = setTimeout(async () => {
      setIsSearching(true)

      // Instant local lookup using precomputed maps
      const instantResults = fastTokenLookup(searchQuery)

      if (instantResults.length > 0) {
        setSearchResults(instantResults)
        setIsSearching(false)
        return
      }

      // If no local results, try API with timeout
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 2000) // 2 second timeout

        const response = await fetch(`${JUPITER_SEARCH_API}?query=${encodeURIComponent(searchQuery)}`, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' }
        })

        clearTimeout(timeoutId)

        if (response.ok) {
          const data = await response.json()

          if (Array.isArray(data) && data.length > 0) {
            const jupiterTokens: Token[] = data.slice(0, 20).map((t: any) => ({
              address: t.id || t.address || t.mint,
              chainId: 101,
              decimals: t.decimals || 9,
              name: t.name || 'Unknown Token',
              symbol: t.symbol || 'UNKNOWN',
              logoURI: t.icon || t.logoURI || t.image,
              tags: t.tags || [],
              isConfidentialSupported: false,
              isNative: (t.id || t.address || t.mint) === 'So11111111111111111111111111111111111111112',
              addressable: true,
            })).filter(t => t.symbol && t.name && t.address)

            setSearchResults(jupiterTokens)
          } else {
            setSearchResults([])
          }
        } else {
          setSearchResults([])
        }
      } catch (error) {
        console.warn('Jupiter API search failed, using local tokens only')
        // Show empty results when API fails - users will see the default tokens list
        setSearchResults([])
      } finally {
        setIsSearching(false)
      }
    }, 500) // Increased from 300ms to 500ms for better debouncing

    return () => clearTimeout(searchTimer)
  }, [searchQuery])

  // Get display tokens based on search state
  const displayTokens = useMemo(() => {
    if (searchQuery && searchResults.length > 0) {
      return searchResults
    } else if (searchQuery && searchResults.length === 0) {
      return []
    } else {
      return getInitialTokens()
    }
  }, [searchQuery, searchResults, getInitialTokens])

  // Group tokens by balance for better UX
  const { tokensWithBalance, tokensWithoutBalance } = useMemo(() => {
    const withBalance: Token[] = []
    const withoutBalance: Token[] = []

    displayTokens.forEach(token => {
      const balance = balances?.get(token.address)
      if (balance && parseFloat(balance) > 0) {
        withBalance.push(token)
      } else {
        withoutBalance.push(token)
      }
    })

    return { tokensWithBalance: withBalance, tokensWithoutBalance: withoutBalance }
  }, [displayTokens, balances])

  const getTokenBalance = (token: Token): string => {
    if (!balances) return '0'
    return balances.get(token.address) || '0'
  }

  const formatBalance = (balance: string, decimals: number): string => {
    try {
      const num = parseFloat(balance) / Math.pow(10, decimals)
      if (num === 0) return '0'
      if (num < 0.001) return '<0.001'
      if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`
      if (num >= 1000) return `${(num / 1000).toFixed(2)}K`
      return num.toFixed(Math.max(0, 6 - Math.floor(num).toString().length))
    } catch {
      return '0'
    }
  }

  const handleTokenSelect = (token: Token) => {
    onTokenChange(token)
    setIsOpen(false)
    setSearchQuery('')
  }

  const currentToken = selectedToken || tokens[0]

  return (
    <>
      {/* Token Selector Button */}
      <button
        onClick={() => setIsOpen(true)}
        disabled={disabled}
        className="group relative flex items-center justify-between gap-3 px-6 py-4 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed min-w-[220px] h-16 rounded-xl overflow-hidden"
        style={{
          ...createGlassStyles(theme),
          background: theme.name === 'light'
            ? `
              linear-gradient(135deg,
                rgba(255, 255, 255, 0.95) 0%,
                rgba(248, 250, 252, 0.9) 25%,
                rgba(255, 255, 255, 0.95) 50%,
                rgba(241, 245, 249, 0.9) 75%,
                rgba(255, 255, 255, 0.95) 100%
              ),
              radial-gradient(circle at 20% 30%,
                rgba(33, 188, 255, 0.06) 0%,
                rgba(33, 188, 255, 0.02) 50%
              ),
              radial-gradient(circle at 80% 70%,
                rgba(16, 185, 129, 0.04) 0%,
                transparent 50%
              )
            `
            : `
              linear-gradient(135deg,
                ${theme.colors.surface}f2 0%,
                ${theme.colors.surfaceHover}e8 25%,
                ${theme.colors.surface}f2 50%,
                ${theme.colors.surfaceHover}e8 75%,
                ${theme.colors.surface}f2 100%
              ),
              radial-gradient(circle at 25% 25%,
                ${theme.colors.primary}12 0%,
                transparent 50%
              ),
              radial-gradient(circle at 75% 75%,
                ${theme.colors.success}08 0%,
                transparent 50%
              )
            `,
          borderWidth: '2px',
          borderStyle: 'solid',
          borderColor: theme.name === 'light' ? 'rgba(33, 188, 255, 0.2)' : theme.colors.border,
          backdropFilter: theme.name === 'light'
            ? 'blur(20px) saturate(1.5) contrast(1.02)'
            : 'blur(24px) saturate(1.9) contrast(1.05)',
          WebkitBackdropFilter: theme.name === 'light'
            ? 'blur(20px) saturate(1.5) contrast(1.02)'
            : 'blur(24px) saturate(1.9) contrast(1.05)',
          boxShadow: theme.name === 'light'
            ? `
              0 8px 32px rgba(0, 0, 0, 0.06),
              0 4px 16px rgba(33, 188, 255, 0.08),
              0 1px 4px rgba(0, 0, 0, 0.03),
              inset 0 1px 0 rgba(255, 255, 255, 0.95),
              inset 0 -1px 0 rgba(0, 0, 0, 0.02),
              0 0 0 1px rgba(33, 188, 255, 0.1)
            `
            : `
              0 12px 40px ${theme.colors.shadowHeavy},
              0 6px 20px ${theme.colors.primary}30,
              0 2px 8px ${theme.colors.shadow},
              inset 0 1px 0 rgba(255, 255, 255, 0.15),
              inset 0 -1px 0 rgba(0, 0, 0, 0.3)
            `,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-1px) scale(1.02)'
          if (theme.name === 'light') {
            e.currentTarget.style.borderWidth = '2px'
            e.currentTarget.style.borderStyle = 'solid'
            e.currentTarget.style.borderColor = theme.colors.primary
          } else {
            e.currentTarget.style.borderColor = theme.colors.primary
          }
          e.currentTarget.style.boxShadow = theme.name === 'light'
            ? `
              0 12px 48px rgba(0, 0, 0, 0.08),
              0 6px 24px rgba(33, 188, 255, 0.15),
              0 2px 8px rgba(0, 0, 0, 0.04),
              inset 0 1px 0 rgba(255, 255, 255, 0.98),
              0 0 0 1px rgba(33, 188, 255, 0.25)
            `
            : `
              0 16px 50px ${theme.colors.shadowHeavy},
              0 8px 25px ${theme.colors.primary}40,
              0 4px 12px ${theme.colors.shadow},
              inset 0 1px 0 rgba(255, 255, 255, 0.25),
              0 0 0 1px ${theme.colors.primary}25
            `
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0px) scale(1)'
          if (theme.name === 'light') {
            e.currentTarget.style.borderWidth = '2px'
            e.currentTarget.style.borderStyle = 'solid'
            e.currentTarget.style.borderColor = 'rgba(33, 188, 255, 0.2)'
          } else {
            e.currentTarget.style.borderColor = theme.colors.border
          }
          e.currentTarget.style.boxShadow = theme.name === 'light'
            ? `
              0 12px 40px rgba(0, 0, 0, 0.08),
              0 6px 20px rgba(33, 188, 255, 0.12),
              0 2px 8px rgba(0, 0, 0, 0.04),
              inset 0 1px 0 rgba(255, 255, 255, 0.9),
              inset 0 -1px 0 rgba(0, 0, 0, 0.05)
            `
            : `
              0 12px 40px ${theme.colors.shadowHeavy},
              0 6px 20px ${theme.colors.primary}30,
              0 2px 8px ${theme.colors.shadow},
              inset 0 1px 0 rgba(255, 255, 255, 0.15),
              inset 0 -1px 0 rgba(0, 0, 0, 0.3)
            `
        }}
      >
        {/* Noise grain overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
            filter: theme.name === 'light' ? 'contrast(1.2) brightness(1.1)' : 'contrast(1.4) brightness(1.2)',
            opacity: theme.name === 'light' ? 0.02 : 0.05
          }}
        />

        <div className="flex items-center gap-3 flex-1 relative z-10">
          {currentToken && (
            <>
              <div className="relative">
                <TokenIcon
                  symbol={currentToken.symbol}
                  mint={currentToken.address}
                  logoURI={currentToken.logoURI}
                  size={32}
                />
                {/* Glow effect for icon - theme-aware */}
                <div
                  className="absolute inset-0 rounded-full blur-sm pointer-events-none"
                  style={{
                    opacity: theme.name === 'light' ? 0.15 : 0.3,
                    background: theme.name === 'light'
                      ? 'radial-gradient(circle, rgba(33, 188, 255, 0.2) 0%, transparent 60%)'
                      : 'radial-gradient(circle, rgba(33, 188, 255, 0.4) 0%, transparent 70%)'
                  }}
                />
              </div>
              <div className="flex flex-col items-start">
                <span
                  className="font-bold tracking-wide"
                  style={{
                    fontFamily: 'var(--font-helvetica)',
                    fontSize: '0.95rem',
                    fontWeight: 600,
                    letterSpacing: '0.01em',
                    color: theme.name === 'light' ? theme.colors.textPrimary : 'rgba(255, 255, 255, 0.95)',
                    textShadow: theme.name === 'light'
                      ? '0 1px 2px rgba(0, 0, 0, 0.1)'
                      : '0 0 10px rgba(33, 188, 255, 0.3)'
                  }}
                >
                  {currentToken.symbol}
                </span>
              </div>
            </>
          )}
        </div>
        <ChevronDownIcon
          className={`h-5 w-5 flex-shrink-0 transition-all duration-300 ${theme.name === 'light' ? 'text-blue-500' : 'text-blue-300'} group-hover:${theme.name === 'light' ? 'text-blue-400' : 'text-blue-200'}`}
          style={{
            transform: isOpen ? 'rotate(180deg) translateY(1px)' : 'rotate(0deg)',
            filter: theme.name === 'light'
              ? 'drop-shadow(0 0 6px rgba(33, 188, 255, 0.3))'
              : 'drop-shadow(0 0 8px rgba(33, 188, 255, 0.4))'
          }}
        />
      </button>

      {/* Token Selection Modal */}
      <Transition appear show={isOpen} as={Fragment}>
        <Dialog as="div" className="relative z-[999999]" onClose={() => setIsOpen(false)}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel
                  className="w-full max-w-md transform overflow-hidden rounded-3xl p-0 text-left align-middle transition-all relative"
                  style={{
                    ...createGlassStyles(theme),
                    background: `
                      linear-gradient(135deg,
                        ${theme.colors.surface}f8 0%,
                        ${theme.colors.surfaceHover}f2 50%,
                        ${theme.colors.surface}f6 100%
                      ),
                      radial-gradient(circle at 50% 10%,
                        ${theme.colors.primary}12 0%,
                        transparent 50%
                      )
                    `,
                    border: `1px solid ${theme.colors.primary}30`,
                    boxShadow: `
                      0 50px 100px -20px ${theme.colors.shadow},
                      0 25px 50px -12px ${theme.colors.shadow}cc,
                      0 0 0 1px ${theme.colors.primary}20,
                      inset 0 1px 0 rgba(255, 255, 255, ${theme.name === 'light' ? '0.3' : '0.1'})
                    `,
                    backdropFilter: 'blur(40px) saturate(1.5)'
                  }}
                >
                  {/* Noise grain overlay for modal */}
                  <div
                    className="absolute inset-0 opacity-8 pointer-events-none rounded-3xl"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg width='400' height='400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='modal-noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='400' height='400' filter='url(%23modal-noise)' opacity='1'/%3E%3C/svg%3E")`,
                      mixBlendMode: 'overlay'
                    }}
                  />
                  {/* Modal Header */}
                  <div className="relative flex items-center justify-between p-6 border-b" style={{
                    borderColor: theme.name === 'light' ? 'rgba(33, 188, 255, 0.2)' : 'rgba(33, 188, 255, 0.15)',
                    background: theme.name === 'light'
                      ? 'linear-gradient(to bottom, rgba(33, 188, 255, 0.08), transparent)'
                      : 'linear-gradient(to bottom, rgba(33, 188, 255, 0.05), transparent)'
                  }}>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-gradient-to-r from-blue-400 to-cyan-400 rounded-full animate-pulse" />
                      <Dialog.Title
                        className="text-xl font-bold"
                        style={{
                          fontFamily: 'var(--font-helvetica)',
                          letterSpacing: '0.025em',
                          color: theme.name === 'light' ? theme.colors.textPrimary : 'rgba(255, 255, 255, 0.95)',
                          textShadow: theme.name === 'light'
                            ? '0 1px 2px rgba(0, 0, 0, 0.1)'
                            : '0 0 20px rgba(33, 188, 255, 0.3)'
                        }}
                      >
                        Select Token
                      </Dialog.Title>
                    </div>
                    <button
                      onClick={() => setIsOpen(false)}
                      className="p-2 rounded-xl transition-all hover:bg-white/10 group"
                      style={{
                        color: theme.name === 'light' ? 'rgba(107, 114, 128, 0.8)' : 'rgba(229, 231, 235, 0.7)',
                        background: theme.name === 'light' ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.1)'
                      }}
                    >
                      <XMarkIcon className="h-5 w-5 transition-transform group-hover:rotate-90" />
                    </button>
                  </div>

                  {/* Search Input */}
                  <div className="p-6 pb-4 relative">
                    <div className="relative group">
                      <MagnifyingGlassIcon
                        className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 transition-colors"
                        style={{
                          color: theme.name === 'light' ? theme.colors.textMuted : 'rgba(147, 197, 253, 0.8)',
                        }}
                      />
                      <input
                        type="text"
                        placeholder="Search tokens or paste address..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-12 pr-4 py-4 rounded-2xl text-sm font-medium transition-all duration-200"
                        style={{
                          background: theme.name === 'light'
                            ? 'rgba(255, 255, 255, 0.95)'
                            : 'rgba(10, 10, 20, 0.8)',
                          border: `1px solid ${theme.name === 'light' ? theme.colors.border : 'rgba(33, 188, 255, 0.3)'}`,
                          color: theme.name === 'light' ? theme.colors.textPrimary : 'rgba(255, 255, 255, 0.9)',
                          fontFamily: 'var(--font-helvetica)',
                          fontSize: '0.9rem',
                          outline: 'none',
                          boxShadow: theme.name === 'light'
                            ? '0 2px 8px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.9)'
                            : '0 0 0 0 transparent'
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = theme.name === 'light' ? theme.colors.primary : theme.colors.primary;
                          e.currentTarget.style.boxShadow = theme.name === 'light'
                            ? `0 0 0 2px ${theme.colors.primary}30, 0 4px 12px rgba(33, 188, 255, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.95)`
                            : `0 0 0 1px ${theme.colors.primary}40, inset 0 0 20px ${theme.colors.primary}15`;
                          e.currentTarget.style.background = theme.name === 'light'
                            ? 'rgba(255, 255, 255, 1)'
                            : 'rgba(10, 10, 20, 0.95)';
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = theme.name === 'light' ? theme.colors.border : 'rgba(33, 188, 255, 0.3)';
                          e.currentTarget.style.boxShadow = theme.name === 'light'
                            ? '0 2px 8px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.9)'
                            : '0 0 0 0 transparent';
                          e.currentTarget.style.background = theme.name === 'light'
                            ? 'rgba(255, 255, 255, 0.95)'
                            : 'rgba(10, 10, 20, 0.8)';
                        }}
                        autoFocus
                      />
                      {/* Search icon glow */}
                      <div
                        className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 blur-xl opacity-0 group-focus-within:opacity-40 transition-opacity rounded-full"
                        style={{
                          background: `radial-gradient(circle, ${theme.colors.primary}40 0%, transparent 70%)`
                        }}
                      />
                    </div>
                    {isSearching && (
                      <div className="mt-4 flex items-center justify-center gap-2">
                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" />
                        <div
                          className="text-sm font-medium"
                          style={{
                            color: theme.name === 'light' ? theme.colors.textSecondary : 'rgba(147, 197, 253, 0.9)'
                          }}
                        >
                          Searching for tokens...
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Token List */}
                  <div className="max-h-[400px] overflow-y-auto">
                    {searchQuery && searchResults.length === 0 && !isSearching && (
                      <div className="p-8 text-center">
                        <div style={{
                          color: theme.name === 'light' ? 'rgba(107, 114, 128, 0.7)' : 'rgba(229, 231, 235, 0.5)'
                        }}>
                          No tokens found for "{searchQuery}"
                        </div>
                      </div>
                    )}

                    {!searchQuery && tokensWithBalance.length > 0 && (
                      <div>
                        <div className="px-4 py-2 text-xs font-semibold" style={{
                          color: theme.name === 'light' ? theme.colors.primary : 'rgba(33, 188, 255, 0.8)',
                          fontFamily: 'var(--font-helvetica)'
                        }}>
                          Your Tokens
                        </div>
                        {tokensWithBalance.map((token) => (
                          <TokenListItem
                            key={token.address}
                            token={token}
                            balance={getTokenBalance(token)}
                            onSelect={handleTokenSelect}
                            isSelected={selectedToken?.address === token.address}
                          />
                        ))}
                      </div>
                    )}

                    {!searchQuery && tokensWithoutBalance.length > 0 && (
                      <div>
                        {tokensWithBalance.length > 0 && (
                          <div className="px-4 py-2 text-xs font-semibold mt-4" style={{
                            color: theme.name === 'light' ? theme.colors.primary : 'rgba(33, 188, 255, 0.8)',
                            fontFamily: 'var(--font-helvetica)'
                          }}>
                            Popular Tokens
                          </div>
                        )}
                        {tokensWithoutBalance.slice(0, 10).map((token) => (
                          <TokenListItem
                            key={token.address}
                            token={token}
                            balance={getTokenBalance(token)}
                            onSelect={handleTokenSelect}
                            isSelected={selectedToken?.address === token.address}
                          />
                        ))}
                      </div>
                    )}

                    {searchQuery && searchResults.map((token) => (
                      <TokenListItem
                        key={token.address}
                        token={token}
                        balance={getTokenBalance(token)}
                        onSelect={handleTokenSelect}
                        isSelected={selectedToken?.address === token.address}
                      />
                    ))}
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </>
  )
}

// Token List Item Component
interface TokenListItemProps {
  token: Token
  balance: string
  onSelect: (token: Token) => void
  isSelected: boolean
}

function TokenListItem({ token, balance, onSelect, isSelected }: TokenListItemProps) {
  const theme = useThemeConfig()
  const formatBalance = (balance: string, decimals: number): string => {
    try {
      const num = parseFloat(balance) / Math.pow(10, decimals)
      if (num === 0) return '0'
      if (num < 0.001) return '<0.001'
      if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`
      if (num >= 1000) return `${(num / 1000).toFixed(2)}K`
      return num.toFixed(Math.max(0, 6 - Math.floor(num).toString().length))
    } catch {
      return '0'
    }
  }

  const isPopularToken = RECOMMENDED_TOKENS.includes(token.address)
  const hasBalance = parseFloat(balance) > 0

  return (
    <button
      onClick={() => onSelect(token)}
      className="group relative w-full flex items-center justify-between p-4 transition-all duration-200 hover:translate-x-1"
      style={{
        background: isSelected
          ? `linear-gradient(135deg, ${theme.colors.primary}20 0%, ${theme.colors.primary}10 100%)`
          : hasBalance
          ? `linear-gradient(135deg, ${theme.colors.success}10 0%, ${theme.colors.success}05 100%)`
          : 'transparent',
        borderLeft: isSelected
          ? `3px solid ${theme.colors.primary}60`
          : hasBalance
          ? `3px solid ${theme.colors.success}40`
          : '2px solid transparent',
        backdropFilter: 'blur(10px)'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = isSelected
          ? `linear-gradient(135deg, ${theme.colors.primary}25 0%, ${theme.colors.primary}15 100%)`
          : `linear-gradient(135deg, ${theme.colors.success}15 0%, ${theme.colors.success}10 100%)`
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = isSelected
          ? `linear-gradient(135deg, ${theme.colors.primary}20 0%, ${theme.colors.primary}10 100%)`
          : hasBalance
          ? `linear-gradient(135deg, ${theme.colors.success}10 0%, ${theme.colors.success}05 100%)`
          : 'transparent'
      }}
    >
      {/* Selection indicator */}
      {isSelected && (
        <div
          className="absolute left-0 top-0 h-full w-1 opacity-60"
          style={{
            background: `linear-gradient(to bottom, ${theme.colors.primary}, ${theme.colors.primary}dd)`
          }}
        />
      )}

      <div className="flex items-center gap-3 flex-1">
        <div className="relative">
          <TokenIcon
            symbol={token.symbol}
            mint={token.address}
            logoURI={token.logoURI}
            size={36}
          />
          {/* Icon glow effect */}
          <div
            className="absolute inset-0 rounded-full blur-md opacity-0 group-hover:opacity-30 transition-opacity"
            style={{
              background: isSelected
                ? 'radial-gradient(circle, rgba(33, 188, 255, 0.5) 0%, transparent 70%)'
                : 'radial-gradient(circle, rgba(16, 185, 129, 0.3) 0%, transparent 70%)'
            }}
          />
          {/* Selection checkmark */}
          {isSelected && (
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
              <CheckCircleIcon className="h-3 w-3 text-white" />
            </div>
          )}
        </div>
        <div className="flex flex-col items-start flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="font-bold group-hover:opacity-100 transition-opacity"
              style={{
                fontFamily: 'var(--font-helvetica)',
                fontSize: '0.9rem',
                fontWeight: 600,
                letterSpacing: '0.025em',
                color: theme.name === 'light'
                  ? (isSelected ? theme.colors.primary : theme.colors.textPrimary)
                  : (isSelected ? 'rgba(255, 255, 255, 0.98)' : 'rgba(255, 255, 255, 0.95)'),
                opacity: 1
              }}
            >
              {token.symbol}
            </span>
            {/* Popular token badge */}
            {isPopularToken && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full border" style={{
                background: theme.name === 'light'
                  ? 'linear-gradient(135deg, rgba(251, 191, 36, 0.15), rgba(249, 115, 22, 0.12))'
                  : 'linear-gradient(135deg, rgba(251, 191, 36, 0.2), rgba(249, 115, 22, 0.15))',
                borderColor: theme.name === 'light' ? 'rgba(251, 191, 36, 0.4)' : 'rgba(251, 191, 36, 0.4)'
              }}>
                <StarIcon className="h-2.5 w-2.5" style={{
                  color: theme.name === 'light' ? '#ea580c' : '#fbbf24'
                }} />
                <span className="text-xs font-medium" style={{
                  color: theme.name === 'light' ? '#ea580c' : '#fbbf24'
                }}>Popular</span>
              </div>
            )}
          </div>
          <span
            className="text-xs font-medium transition-colors"
            style={{
              fontFamily: 'var(--font-helvetica)',
              letterSpacing: '0.025em',
              color: theme.name === 'light'
                ? (isSelected ? 'rgba(33, 188, 255, 0.7)' : theme.colors.textSecondary)
                : (isSelected ? 'rgba(33, 188, 255, 0.6)' : 'rgba(156, 163, 175, 0.8)')
            }}
          >
            {token.name}
          </span>
        </div>
      </div>
      <div className="text-right relative">
        <div
          className="font-bold mb-1 transition-colors"
          style={{
            fontFamily: 'var(--font-helvetica)',
            fontSize: '0.85rem',
            fontWeight: 600,
            letterSpacing: '0.01em',
            color: theme.name === 'light'
              ? (isSelected ? theme.colors.primary : theme.colors.textSecondary)
              : (isSelected ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.9)')
          }}
        >
          {formatBalance(balance, token.decimals)}
        </div>
        {/* Balance indicator */}
        {hasBalance && (
          <div className="flex items-center justify-end gap-1">
            <WalletIcon className="h-3 w-3" style={{
              color: theme.name === 'light' ? '#059669' : '#4ade80'
            }} />
            <span className="text-xs font-medium" style={{
              color: theme.name === 'light' ? '#059669' : '#4ade80'
            }}>Has Balance</span>
          </div>
        )}
      </div>
    </button>
  )
}