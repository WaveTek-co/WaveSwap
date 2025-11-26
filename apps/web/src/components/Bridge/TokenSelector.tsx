'use client'

import { useState } from 'react'
import { ChainIcon } from '../ui/IconWithFallback'

interface TokenInfo {
  defuseAssetId: string
  symbol: string
  name: string
  decimals: number
  icon: string
  originChainName: string
  balance?: string
  usdPrice?: number
}

interface TokenSelectorProps {
  tokens: TokenInfo[]
  selectedToken: TokenInfo | null
  onSelect: (token: TokenInfo) => void
  isOpen: boolean
  onClose: () => void
  title?: string
}

export function TokenSelector({
  tokens,
  selectedToken,
  onSelect,
  isOpen,
  onClose,
  title = 'Select Token'
}: TokenSelectorProps) {
  const [search, setSearch] = useState('')
  const [selectedChain, setSelectedChain] = useState<string>('all')

  // Filter tokens based on search and chain
  const filteredTokens = tokens.filter(token => {
    const matchesSearch = token.symbol.toLowerCase().includes(search.toLowerCase()) ||
                         token.name.toLowerCase().includes(search.toLowerCase())
    const matchesChain = selectedChain === 'all' || token.originChainName === selectedChain
    return matchesSearch && matchesChain
  })

  // Get unique chains from tokens
  const chains = Array.from(new Set(tokens.map(t => t.originChainName)))

  const formatBalance = (token: TokenInfo) => {
    if (!token.balance) return '0'
    const balance = parseFloat(token.balance)
    return balance.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: token.decimals > 6 ? 2 : 6
    })
  }

  const getUsdValue = (token: TokenInfo) => {
    if (!token.balance || !token.usdPrice) return ''
    const usdValue = parseFloat(token.balance) * token.usdPrice
    return `($${usdValue.toFixed(2)})`
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="rounded-2xl p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col" style={{ backgroundColor: 'var(--wave-glass-bg)' }}>
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-white">{title}</h3>
          <button
            onClick={onClose}
            className="transition-colors hover:text-white"
            style={{ color: 'var(--wave-text-muted)' }}
          >
            ✕
          </button>
        </div>

        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search token..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full p-3 rounded-lg text-white focus:outline-none focus:border-primary"
            style={{ backgroundColor: 'var(--wave-glass-bg)', borderColor: 'var(--wave-glass-border)', color: 'var(--wave-text-primary)' }}
          />
        </div>

        {/* Chain Filter */}
        <div className="mb-4">
          <select
            value={selectedChain}
            onChange={(e) => setSelectedChain(e.target.value)}
            className="w-full p-3 rounded-lg text-white focus:outline-none focus:border-primary"
            style={{ backgroundColor: 'var(--wave-glass-bg)', borderColor: 'var(--wave-glass-border)', color: 'var(--wave-text-primary)' }}
          >
            <option value="all">All Chains</option>
            {chains.map(chain => (
              <option key={chain} value={chain}>
                {chain.charAt(0).toUpperCase() + chain.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {/* Token List */}
        <div className="flex-1 overflow-y-auto">
          {filteredTokens.length === 0 ? (
            <div className="text-center py-8" style={{ color: 'var(--wave-text-muted)' }}>
              No tokens found
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTokens.map((token) => (
                <button
                  key={token.defuseAssetId}
                  onClick={() => {
                    onSelect(token)
                    onClose()
                  }}
                  className="w-full p-3 rounded-lg transition-colors flex items-center gap-3"
                  style={{
                    backgroundColor: selectedToken?.defuseAssetId === token.defuseAssetId ? 'var(--wave-glass-border)' : 'transparent'
                  }}
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--wave-glass-border)' }}>
                    <ChainIcon chainId={token.originChainName} size={24} />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-medium" style={{ color: 'var(--wave-text-primary)' }}>{token.symbol}</span>
                      <span className="text-xs capitalize" style={{ color: 'var(--wave-text-muted)' }}>
                        {token.originChainName}
                      </span>
                    </div>
                    <div className="text-sm" style={{ color: 'var(--wave-text-muted)' }}>{token.name}</div>
                  </div>
                  {token.balance && (
                    <div className="text-right">
                      <div className="font-medium" style={{ color: 'var(--wave-text-primary)' }}>
                        {formatBalance(token)}
                      </div>
                      <div className="text-xs" style={{ color: 'var(--wave-text-muted)' }}>
                        {getUsdValue(token)}
                      </div>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}