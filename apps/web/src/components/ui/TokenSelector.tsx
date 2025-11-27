'use client'

import React, { useState, useMemo } from 'react'
import { ChevronDown, Search, X, TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './Button'
import { Input } from './Input'

// Helper function to get local fallback icon path
function getLocalFallbackIcon(symbol: string): string | null {
  const tokenIcons: { [key: string]: string | null } = {
    'WAVE': '/icons/fallback/token/wave.png',
    'SOL': '/icons/fallback/token/sol.png',
    'USDC': '/icons/fallback/token/usdc.png',
    'USDT': '/icons/fallback/token/usdt.png',
    'ZEC': '/icons/fallback/token/zec.png',
    'PUMP': '/icons/fallback/token/pump.png',
    'WEALTH': '/icons/fallback/token/wealth.png',
    'FTP': '/icons/fallback/token/ftp.jpg',
    'AURA': '/icons/fallback/token/aura.png',
    'MEW': '/icons/fallback/token/mew.png',
    'STORE': '/icons/fallback/token/store.png'
  }

  return tokenIcons[symbol.toUpperCase()] || null
}

export interface Token {
  symbol: string
  name: string
  mint: string
  decimals: number
  logoURI: string
  balance?: string
  price?: number
  priceChange24h?: number
  verified?: boolean
}

interface TokenSelectorProps {
  tokens: Token[]
  selectedToken?: Token
  onSelect: (token: Token) => void
  placeholder?: string
  showBalance?: boolean
  showPrice?: boolean
  disabled?: boolean
  className?: string
}

export function TokenSelector({
  tokens,
  selectedToken,
  onSelect,
  placeholder = 'Select a token',
  showBalance = true,
  showPrice = true,
  disabled = false,
  className
}: TokenSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const filteredTokens = useMemo(() => {
    if (!searchQuery) return tokens

    const query = searchQuery.toLowerCase()
    return tokens.filter(
      token =>
        token.symbol.toLowerCase().includes(query) ||
        token.name.toLowerCase().includes(query)
    )
  }, [tokens, searchQuery])

  const selectedDisplay = selectedToken ? (
    <div className="flex items-center gap-3">
      <div className="relative">
        {selectedToken.logoURI ? (
          <img
            src={selectedToken.logoURI}
            alt={selectedToken.symbol}
            className="w-8 h-8 rounded-full object-cover"
            onError={(e) => {
              const target = e.target as HTMLImageElement
              const fallbackIcon = getLocalFallbackIcon(selectedToken.symbol)
              if (fallbackIcon) {
                target.src = fallbackIcon
              } else {
                // If no local fallback, hide image and show gradient background
                target.style.display = 'none'
                const parent = target.parentElement
                if (parent) {
                  parent.classList.add('bg-gradient-to-br', 'from-primary', 'to-primary-hover')
                  const textSpan = parent.querySelector('span')
                  if (textSpan) {
                    textSpan.style.display = 'block'
                  }
                }
              }
            }}
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center">
            <span className="text-white font-bold text-sm">
              {selectedToken.symbol.slice(0, 2)}
            </span>
          </div>
        )}
        {selectedToken.verified && (
          <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-background" />
        )}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">
            {selectedToken.symbol}
          </span>
          {showPrice && selectedToken.price && (
            <span className="text-xs text-muted-foreground font-mono">
              ${selectedToken.price.toFixed(4)}
            </span>
          )}
        </div>
        {(showBalance && selectedToken.balance) && (
          <span className="text-sm text-muted-foreground">
            {selectedToken.balance}
          </span>
        )}
      </div>
    </div>
  ) : (
    <div className="flex items-center gap-3 text-muted-foreground">
      <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
        <span className="text-xs font-bold">?</span>
      </div>
      <span>{placeholder}</span>
    </div>
  )

  const handleTokenSelect = (token: Token) => {
    onSelect(token)
    setIsOpen(false)
  }

  return (
    <div className={cn('relative', className)}>
      <Button
        variant="outline"
        className="w-full justify-between h-12 px-4"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
      >
        <div className="flex-1 text-left">
          {selectedDisplay}
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </Button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50 bg-black/50"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute top-full left-0 right-0 z-50 mt-2 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
            {/* Search */}
            <div className="p-4 border-b border-border">
              <Input
                placeholder="Search token..."
                leftIcon={<Search className="h-4 w-4" />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
            </div>

            {/* Token list */}
            <div className="max-h-80 overflow-y-auto custom-scrollbar">
              {filteredTokens.length === 0 ? (
                <div className="p-8 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-secondary flex items-center justify-center">
                    <Search className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground">No tokens found</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Try a different search term
                  </p>
                </div>
              ) : (
                <div className="p-2">
                  {filteredTokens.map((token) => (
                    <button
                      key={token.mint}
                      onClick={() => handleTokenSelect(token)}
                      className="w-full p-3 rounded-xl hover:bg-secondary/80 transition-colors flex items-center gap-3 group"
                    >
                      <div className="relative">
                        {token.logoURI ? (
                          <img
                            src={token.logoURI}
                            alt={token.symbol}
                            className="w-10 h-10 rounded-full object-cover group-hover:scale-105 transition-transform"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement
                              const fallbackIcon = getLocalFallbackIcon(token.symbol)
                              if (fallbackIcon) {
                                target.src = fallbackIcon
                              } else {
                                // If no local fallback, hide image and show gradient background
                                target.style.display = 'none'
                                const parent = target.parentElement
                                if (parent) {
                                  parent.classList.add('bg-gradient-to-br', 'from-primary', 'to-primary-hover')
                                  const textSpan = parent.querySelector('span')
                                  if (textSpan) {
                                    textSpan.style.display = 'block'
                                  }
                                }
                              }
                            }}
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center group-hover:scale-105 transition-transform">
                            <span className="text-white font-bold">
                              {token.symbol.slice(0, 2)}
                            </span>
                          </div>
                        )}
                        {token.verified && (
                          <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-background" />
                        )}
                      </div>

                      <div className="flex-1 text-left">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">
                            {token.symbol}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {token.name}
                          </span>
                          {showPrice && token.priceChange24h && (
                            <div className={cn(
                              'flex items-center gap-1 text-xs',
                              token.priceChange24h >= 0 ? 'text-emerald-500' : 'text-rose-500'
                            )}>
                              {token.priceChange24h >= 0 ? (
                                <TrendingUp className="h-3 w-3" />
                              ) : (
                                <TrendingDown className="h-3 w-3" />
                              )}
                              {Math.abs(token.priceChange24h).toFixed(2)}%
                            </div>
                          )}
                        </div>
                        {(showBalance && token.balance) && (
                          <span className="text-sm text-muted-foreground">
                            Balance: {token.balance}
                          </span>
                        )}
                      </div>

                      {showPrice && token.price && (
                        <div className="text-right">
                          <div className="font-medium text-foreground">
                            ${token.price.toFixed(4)}
                          </div>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default TokenSelector