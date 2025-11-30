'use client'

import { useState, Fragment, useMemo, useEffect, useCallback } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import {
  ChevronDownIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  StarIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline'
import { Token } from '@/types/token'
import { TokenIcon } from '@/components/TokenIcon'
import { useThemeConfig, createGlassStyles } from '@/lib/theme'
import { JupiterTokenService, JupiterToken } from '@/lib/jupiterTokens'

// Helper function to get local fallback icon path
function getLocalFallbackIcon(symbol: string, address: string): string | null {
  const tokenIcons: { [key: string]: string | null } = {
    'WAVE': '/icons/fallback/token/wave.png',
    'SOL': '/icons/fallback/token/sol.png',
    'USDC': '/icons/fallback/token/usdc.png',
    'USDT': '/icons/fallback/token/usdt.png',
    'ZEC': '/icons/fallback/token/zec.png',
    'PUMP': '/icons/fallback/token/pump.png',
    'CASH': '/icons/fallback/token/cash.png',
    'WEALTH': '/icons/fallback/token/wealth.png',
    'FTP': '/icons/fallback/token/ftp.jpg',
    'AURA': '/icons/fallback/token/aura.png',
    'MEW': '/icons/fallback/token/mew.png',
    'STORE': '/icons/fallback/token/store.png'
  }

  return tokenIcons[symbol.toUpperCase()] || tokenIcons[address] || null
}

interface TokenSelectorProps {
  selectedToken: Token | null
  onTokenChange: (token: Token) => void
  tokens: Token[]
  disabled?: boolean
  balances?: Map<string, string>
  isPrivacyMode?: boolean
  isOutputSelector?: boolean // New prop to indicate if this is the output selector
}

// Convert JupiterToken to Token format
const jupiterToToken = (jupiterToken: JupiterToken): Token => ({
  address: jupiterToken.id,
  chainId: 101,
  decimals: jupiterToken.decimals || 9,
  name: jupiterToken.name || 'Unknown',
  symbol: jupiterToken.symbol || 'UNKNOWN',
  logoURI: jupiterToken.icon || getLocalFallbackIcon(jupiterToken.symbol || '', jupiterToken.id) || '/icons/default-token.svg',
  tags: jupiterToken.tags || [],
  isConfidentialSupported: jupiterToken.isConfidentialSupported || false,
  isNative: jupiterToken.id === 'So11111111111111111111111111111111111111112',
  addressable: true
})

export function TokenSelector({
  selectedToken,
  onTokenChange,
  tokens,
  disabled = false,
  balances,
  isPrivacyMode = false,
  isOutputSelector = false
}: TokenSelectorProps) {
  const theme = useThemeConfig()
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<JupiterToken[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [popularTokens, setPopularTokens] = useState<JupiterToken[]>([])

  // Convert Token to display format (use existing tokens from props)
  const convertToDisplayFormat = useCallback((token: Token): Token => ({
    ...token
  }), [])

  // User tokens (with balance) - convert existing tokens to display format
  const userTokens = useMemo(() => {
    const user: Token[] = []
    tokens.forEach(token => {
      if (balances?.get(token.address) && parseFloat(balances.get(token.address)!) > 0) {
        user.push(token)
      }
    })
    return user
  }, [tokens, balances])

  // Convert tokens to display format - use tokens passed via props
  const tokensDisplay = useMemo(() =>
    tokens.map(convertToDisplayFormat),
    [tokens, convertToDisplayFormat]
  )

  // Load popular tokens when modal opens
  useEffect(() => {
    if (isOpen) {
      const loadPopularTokens = async () => {
        try {
          const popular = await JupiterTokenService.getPopularTokens()
          setPopularTokens(popular)
        } catch (error) {
          console.error('Error loading popular tokens:', error)
          setPopularTokens([])
        }
      }
      loadPopularTokens()
    }
  }, [isOpen])

  // Search tokens using Jupiter API with debouncing
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    const searchTimer = setTimeout(async () => {
      setIsSearching(true)

      try {
        const results = await JupiterTokenService.searchTokens(searchQuery)
        setSearchResults(results)
      } catch (error) {
        console.error('Error searching tokens:', error)
        setSearchResults([])
      } finally {
        setIsSearching(false)
      }
    }, 500)

    return () => clearTimeout(searchTimer)
  }, [searchQuery])

  const getTokenBalance = (token: Token): string => {
    if (!balances) return '0'
    return balances.get(token.address) || '0'
  }

  const formatBalance = (balance: string, decimals: number): string => {
    try {
      // Convert from smallest units (lamports) to human-readable format
      const num = parseFloat(balance) / Math.pow(10, decimals)
      if (num === 0) return '0'
      if (num < 0.001) return '<0.001'
      if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M'
      if (num >= 1000) return (num / 1000).toFixed(2) + 'K'
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
          background: theme.name === 'light' || theme.name === 'ghost'
            ? 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, ' + (theme.name === 'ghost' ? 'rgba(255, 253, 248, 0.9)' : 'rgba(248, 250, 252, 0.9)') + ' 25%, rgba(255, 255, 255, 0.95) 50%, ' + (theme.name === 'ghost' ? 'rgba(226, 223, 254, 0.9)' : 'rgba(241, 245, 249, 0.9)') + ' 75%, rgba(255, 255, 255, 0.95) 100%)'
            : 'linear-gradient(135deg, ' + theme.colors.surface + 'f2 0%, ' + theme.colors.surfaceHover + 'e8 25%, ' + theme.colors.surface + 'f2 50%, ' + theme.colors.surfaceHover + 'e8 75%, ' + theme.colors.surface + 'f2 100%)',
          borderWidth: '2px',
          borderStyle: 'solid',
          borderColor: (theme.name === 'light' || theme.name === 'ghost') ? theme.colors.primary + '20' : theme.colors.border,
          backdropFilter: (theme.name === 'light' || theme.name === 'ghost')
            ? 'blur(20px) saturate(1.5) contrast(1.02)'
            : 'blur(24px) saturate(1.9) contrast(1.05)',
          WebkitBackdropFilter: (theme.name === 'light' || theme.name === 'ghost')
            ? 'blur(20px) saturate(1.5) contrast(1.02)'
            : 'blur(24px) saturate(1.9) contrast(1.05)',
          boxShadow: (theme.name === 'light' || theme.name === 'ghost')
            ? '0 8px 32px ' + theme.colors.shadow + ', 0 4px 16px ' + theme.colors.primary + '20'
            : '0 12px 40px ' + theme.colors.shadowHeavy + ', 0 6px 20px ' + theme.colors.primary + '30'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-1px) scale(1.02)'
          e.currentTarget.style.borderColor = theme.colors.primary
          e.currentTarget.style.boxShadow = (theme.name === 'light' || theme.name === 'ghost')
            ? '0 12px 48px ' + theme.colors.shadow + ', 0 6px 24px ' + theme.colors.primary + '30'
            : '0 16px 50px ' + theme.colors.shadowHeavy + ', 0 8px 25px ' + theme.colors.primary + '40'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0px) scale(1)'
          e.currentTarget.style.borderColor = (theme.name === 'light' || theme.name === 'ghost') ? theme.colors.primary + '20' : theme.colors.border
          e.currentTarget.style.boxShadow = (theme.name === 'light' || theme.name === 'ghost')
            ? '0 12px 40px ' + theme.colors.shadow + ', 0 6px 20px ' + theme.colors.primary + '25'
            : '0 12px 40px ' + theme.colors.shadowHeavy + ', 0 6px 20px ' + theme.colors.primary + '30'
        }}
      >
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
                <div
                  className="absolute inset-0 rounded-full blur-sm pointer-events-none"
                  style={{
                    opacity: (theme.name === 'light' || theme.name === 'ghost') ? 0.15 : 0.3,
                    background: (theme.name === 'light' || theme.name === 'ghost')
                      ? 'radial-gradient(circle, ' + theme.colors.primary + '40 0%, transparent 60%)'
                      : 'radial-gradient(circle, rgba(33, 188, 255, 0.4) 0%, transparent 70%)'
                  }}
                />
              </div>
              <div className="flex flex-col items-start">
                <div className="flex items-center gap-2">
                  <span
                    className="font-bold tracking-wide"
                    style={{
                      fontFamily: 'var(--font-helvetica)',
                      fontSize: '0.95rem',
                      fontWeight: 600,
                      letterSpacing: '0.01em',
                      color: (theme.name === 'light' || theme.name === 'ghost') ? theme.colors.textPrimary : 'rgba(255, 255, 255, 0.95)',
                      textShadow: (theme.name === 'light' || theme.name === 'ghost')
                        ? '0 1px 2px rgba(0, 0, 0, 0.1)'
                        : '0 0 10px rgba(33, 188, 255, 0.3)'
                    }}
                  >
                    {isOutputSelector && currentToken.isConfidentialSupported ? 'c' + currentToken.symbol : currentToken.symbol}
                  </span>
                  {currentToken.isConfidentialToken && (
                    <div
                      className="px-1.5 py-0.5 rounded text-xs font-medium"
                      style={{
                        background: theme.colors.success + '20',
                        color: theme.colors.success,
                        border: '1px solid ' + theme.colors.success + '40',
                        fontFamily: 'var(--font-jetbrains), monospace',
                        fontSize: '0.65rem',
                        letterSpacing: '0.05em'
                      }}
                    >
                      PRIVATE
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
        <ChevronDownIcon
          className={`h-5 w-5 flex-shrink-0 transition-all duration-300`}
          style={{
            color: theme.colors.textSecondary,
            transform: isOpen ? 'rotate(180deg) translateY(1px)' : 'rotate(0deg)',
            filter: (theme.name === 'light' || theme.name === 'ghost')
              ? 'drop-shadow(0 0 6px ' + theme.colors.primary + '33)'
              : 'drop-shadow(0 0 8px ' + theme.colors.primary + '66)'
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
                    background: 'linear-gradient(135deg, ' + theme.colors.surface + 'f8 0%, ' + theme.colors.surfaceHover + 'f2 50%, ' + theme.colors.surface + 'f6 100%)',
                    border: '1px solid ' + theme.colors.primary + '30',
                    boxShadow: '0 50px 100px -20px ' + theme.colors.shadow + ', 0 25px 50px -12px ' + theme.colors.shadow + 'cc, inset 0 1px 0 rgba(255, 255, 255, ' + (theme.name === 'light' || theme.name === 'ghost' ? '0.3' : '0.1') + ')',
                    backdropFilter: 'blur(40px) saturate(1.5)'
                  }}
                >
                  {/* Modal Header */}
                  <div className="relative flex items-center justify-between p-6 border-b" style={{
                    borderColor: theme.colors.primary + '33',
                    background: 'linear-gradient(to bottom, ' + theme.colors.primary + '14, transparent)'
                  }}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full animate-pulse" style={{
                        background: 'linear-gradient(to right, ' + theme.colors.primary + ', ' + theme.colors.secondary + ')'
                      }} />
                      <Dialog.Title
                        className="text-xl font-bold"
                        style={{
                          fontFamily: 'var(--font-helvetica)',
                          letterSpacing: '0.025em',
                          color: theme.colors.textPrimary,
                          textShadow: (theme.name === 'light' || theme.name === 'ghost')
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
                        color: theme.colors.textMuted,
                        background: theme.colors.surfaceHover
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
                          color: theme.colors.textMuted,
                        }}
                      />
                      <input
                        type="text"
                        placeholder="Search tokens or paste address..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-12 pr-4 py-4 rounded-2xl text-sm font-medium transition-all duration-200"
                        style={{
                          background: theme.colors.glass,
                          border: '1px solid ' + theme.colors.border,
                          color: theme.colors.textPrimary,
                          fontFamily: 'var(--font-helvetica)',
                          outline: 'none'
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = theme.colors.primary
                          e.currentTarget.style.boxShadow = '0 0 0 2px ' + theme.colors.primary + '30, 0 4px 12px ' + theme.colors.primary + '20'
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = theme.colors.border
                          e.currentTarget.style.boxShadow = 'none'
                        }}
                        autoFocus
                      />
                    </div>
                    {isSearching && (
                      <div className="mt-4 flex items-center justify-center gap-2">
                        <div className="w-2 h-2 rounded-full animate-bounce" style={{
                          backgroundColor: theme.colors.primary
                        }} />
                        <div
                          className="text-sm font-medium"
                          style={{
                            color: theme.colors.textSecondary
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
                          color: theme.colors.textMuted
                        }}>
                          No tokens found for "{searchQuery}"
                        </div>
                      </div>
                    )}

                    {/* Search Results */}
                    {searchQuery && searchResults.length > 0 && (
                      <div>
                        <div className="px-4 py-2 text-xs font-semibold" style={{
                          color: theme.colors.primary,
                          fontFamily: 'var(--font-helvetica)'
                        }}>
                          Search Results
                        </div>
                        {searchResults.map((jupiterToken) => {
                          const token = jupiterToToken(jupiterToken)
                          return (
                            <TokenListItem
                              key={token.address}
                              token={token}
                              balance={getTokenBalance(token)}
                              onSelect={handleTokenSelect}
                              isSelected={selectedToken?.address === token.address}
                              isPrivacyMode={isPrivacyMode}
                              isOutputSelector={isOutputSelector}
                            />
                          )
                        })}
                      </div>
                    )}

                    {/* Popular Tokens */}
                    {!searchQuery && popularTokens.length > 0 && (
                      <div>
                        <div className="px-4 py-2 text-xs font-semibold" style={{
                          color: theme.colors.primary,
                          fontFamily: 'var(--font-helvetica)'
                        }}>
                          Popular Tokens
                        </div>
                        {popularTokens.map((jupiterToken) => {
                          const token = jupiterToToken(jupiterToken)
                          return (
                            <TokenListItem
                              key={token.address}
                              token={token}
                              balance={getTokenBalance(token)}
                              onSelect={handleTokenSelect}
                              isSelected={selectedToken?.address === token.address}
                              isPopularToken={true}
                              isPrivacyMode={isPrivacyMode}
                              isOutputSelector={isOutputSelector}
                            />
                          )
                        })}
                      </div>
                    )}

                    {/* User Tokens (with balance) */}
                    {!searchQuery && userTokens.length > 0 && (
                      <div>
                        <div className="px-4 py-2 text-xs font-semibold" style={{
                          color: theme.colors.primary,
                          fontFamily: 'var(--font-helvetica)'
                        }}>
                          Your Tokens
                        </div>
                        {userTokens.map((token) => (
                          <TokenListItem
                            key={token.address}
                            token={token}
                            balance={balances?.get(token.address) || '0'}
                            onSelect={handleTokenSelect}
                            isSelected={selectedToken?.address === token.address}
                            isPrivacyMode={isPrivacyMode}
                            isOutputSelector={isOutputSelector}
                          />
                        ))}
                      </div>
                    )}

                    {/* Available Tokens */}
                    {!searchQuery && tokensDisplay.length > 0 && (
                      <div>
                        {tokensDisplay.map((token) => (
                          <TokenListItem
                            key={token.address}
                            token={token}
                            balance={balances?.get(token.address) || '0'}
                            onSelect={handleTokenSelect}
                            isSelected={selectedToken?.address === token.address}
                            isPopularToken={false}
                            isPrivacyMode={isPrivacyMode}
                            isOutputSelector={isOutputSelector}
                          />
                        ))}
                      </div>
                    )}
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
  isPopularToken?: boolean
  isPrivacyMode?: boolean
  isOutputSelector?: boolean
}

function TokenListItem({ token, balance, onSelect, isSelected, isPopularToken = false, isPrivacyMode = false, isOutputSelector = false }: TokenListItemProps) {
  const theme = useThemeConfig()

  const formatBalance = (balance: string, decimals: number): string => {
    try {
      // Convert from smallest units (lamports) to human-readable format
      const num = parseFloat(balance) / Math.pow(10, decimals)
      if (num === 0) return '0'
      if (num < 0.001) return '<0.001'
      if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M'
      if (num >= 1000) return (num / 1000).toFixed(2) + 'K'
      return num.toFixed(Math.max(0, 6 - Math.floor(num).toString().length))
    } catch {
      return '0'
    }
  }

  const hasBalance = parseFloat(balance) > 0

  return (
    <button
      onClick={() => onSelect(token)}
      className="group relative w-full flex items-center justify-between p-4 transition-all duration-200 hover:translate-x-1"
      style={{
        background: isSelected
          ? 'linear-gradient(135deg, ' + theme.colors.primary + '20 0%, ' + theme.colors.primary + '10 100%)'
          : hasBalance
          ? 'linear-gradient(135deg, ' + theme.colors.success + '10 0%, ' + theme.colors.success + '05 100%)'
          : 'transparent',
        borderLeft: isSelected
          ? '3px solid ' + theme.colors.primary + '60'
          : hasBalance
          ? '3px solid ' + theme.colors.success + '40'
          : '2px solid transparent',
        backdropFilter: 'blur(10px)'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = isSelected
          ? 'linear-gradient(135deg, ' + theme.colors.primary + '25 0%, ' + theme.colors.primary + '15 100%)'
          : 'linear-gradient(135deg, ' + theme.colors.success + '15 0%, ' + theme.colors.success + '10 100%)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = isSelected
          ? 'linear-gradient(135deg, ' + theme.colors.primary + '20 0%, ' + theme.colors.primary + '10 100%)'
          : hasBalance
          ? 'linear-gradient(135deg, ' + theme.colors.success + '10 0%, ' + theme.colors.success + '05 100%)'
          : 'transparent'
      }}
    >
      {/* Selection indicator */}
      {isSelected && (
        <div
          className="absolute left-0 top-0 h-full w-1 opacity-60"
          style={{
            background: 'linear-gradient(to bottom, ' + theme.colors.primary + ', ' + theme.colors.primary + 'dd)'
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
                color: (theme.name === 'light' || theme.name === 'ghost')
                  ? (isSelected ? theme.colors.primary : theme.colors.textPrimary)
                  : (isSelected ? theme.colors.primary : theme.colors.textPrimary),
                opacity: 1
              }}
            >
              {token.symbol}
            </span>
            {/* Confidential token badge */}
            {token.isConfidentialToken && (
              <div
                className="px-1.5 py-0.5 rounded text-xs font-medium"
                style={{
                  background: theme.colors.success + '20',
                  color: theme.colors.success,
                  border: '1px solid ' + theme.colors.success + '40',
                  fontFamily: 'var(--font-jetbrains), monospace',
                  fontSize: '0.6rem',
                  letterSpacing: '0.05em'
                }}
              >
                PRIVATE
              </div>
            )}
            {/* Popular token badge */}
            {isPopularToken && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full border" style={{
                background: (theme.name === 'light' || theme.name === 'ghost')
                  ? 'linear-gradient(135deg, ' + theme.colors.secondary + '20, ' + theme.colors.secondary + '18)'
                  : 'linear-gradient(135deg, rgba(251, 191, 36, 0.2), rgba(249, 115, 22, 0.15))',
                borderColor: (theme.name === 'light' || theme.name === 'ghost') ? theme.colors.secondary + '50' : 'rgba(251, 191, 36, 0.4)'
              }}>
                <StarIcon className="h-2.5 w-2.5" style={{
                  color: (theme.name === 'light' || theme.name === 'ghost') ? theme.colors.secondary : '#fbbf24'
                }} />
                <span className="text-xs font-medium" style={{
                  color: (theme.name === 'light' || theme.name === 'ghost') ? theme.colors.secondary : '#fbbf24'
                }}>Popular</span>
              </div>
            )}
          </div>
          <span
            className="text-xs font-medium transition-colors"
            style={{
              fontFamily: 'var(--font-helvetica)',
              letterSpacing: '0.025em',
              color: (theme.name === 'light' || theme.name === 'ghost')
                ? (isSelected ? theme.colors.primary : theme.colors.textSecondary)
                : (isSelected ? theme.colors.primary : theme.colors.textSecondary)
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
            color: (theme.name === 'light' || theme.name === 'ghost')
              ? (isSelected ? theme.colors.primary : theme.colors.textSecondary)
              : (isSelected ? theme.colors.primary : theme.colors.textSecondary)
          }}
        >
          {formatBalance(balance, token.decimals)}
        </div>
        {/* Balance indicator */}
        {hasBalance && (
          <div className="flex items-center justify-end gap-1">
            <div className="h-3 w-3 rounded-full" style={{
              backgroundColor: theme.colors.success,
            }} />
            <span className="text-xs font-medium" style={{
              color: theme.colors.success
            }}>Has Balance</span>
          </div>
        )}
      </div>
    </button>
  )
}