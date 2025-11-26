'use client'

import { useState } from 'react'
import { useThemeConfig, createGlassStyles } from '@/lib/theme'
import { CurrencyDollarIcon } from '@heroicons/react/24/outline'
import { ComingSoon } from '@/components/ui/ComingSoon'

interface WaveStakeProps {
  privacyMode: boolean
  comingSoon?: boolean
}

interface StakePosition {
  token: {
    symbol: string
    name: string
    balance: string
    price: number
    icon: string
    address: string
  }
  staked: string
  rewards: string
  apy: string
  startTime: string
}

export function WaveStake({ privacyMode, comingSoon = false }: WaveStakeProps) {
  const theme = useThemeConfig()
  const [selectedToken, setSelectedToken] = useState<string>('WAVE')
  const [stakeAmount, setStakeAmount] = useState<string>('')
  const [activeTab, setActiveTab] = useState<'stake' | 'unstake'>('stake')
  const [stakePositions] = useState<StakePosition[]>([])

  // Mock data for demonstration - matching the Swap component structure
  const availableTokens = [
    {
      symbol: 'WAVE',
      name: 'Wave Token',
      balance: privacyMode ? '****' : '1,250.50',
      price: 0.85,
      icon: '/wave0.png',
      address: 'wave-token-address',
      apy: '12.5%'
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      balance: privacyMode ? '****' : '5,000.00',
      price: 1.00,
      icon: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
      address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      apy: '8.2%'
    },
    {
      symbol: 'SOL',
      name: 'Solana',
      balance: privacyMode ? '****' : '2.5',
      price: 145.30,
      icon: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
      address: 'So11111111111111111111111111111111111111112',
      apy: '15.8%'
    }
  ]

  const currentToken = availableTokens.find(t => t.symbol === selectedToken)

  // Calculate potential earnings
  const calculateEarnings = () => {
    if (!stakeAmount || !currentToken) return 0
    const amount = parseFloat(stakeAmount) || 0
    const apy = parseFloat(currentToken.apy) / 100
    return amount * apy
  }

  const potentialEarnings = calculateEarnings()

  // Show Coming Soon if enabled
  if (comingSoon) {
    return (
      <div className="w-full max-w-xl mx-auto">
        <ComingSoon
          message="Coming Soon"
          description="Earn massive rewards with our cutting-edge staking platform. Get up to 25% APY on WAVE tokens and supported assets with instant withdrawals."
          icon={
            <svg
              className="w-10 h-10"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
          compact={false}
        />
      </div>
    )
  }

  return (
    <div className="w-full max-w-xl mx-auto">
      {/* Main Stake Card */}
      <div className="relative">
        {/* Privacy Mode Indicator */}
        {privacyMode && (
          <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 z-10">
            <div
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full backdrop-blur-sm"
              style={{
                background: `${theme.colors.success}10`,
                border: `1px solid ${theme.colors.success}20`,
              }}
            >
              <div
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ backgroundColor: theme.colors.success }}
              />
              <span
                className="text-xs font-medium"
                style={{ color: theme.colors.success }}
              >
                Privacy Mode Active
              </span>
            </div>
          </div>
        )}

        {/* Main Stake Card - Matching Swap component styling */}
        <div
          className="relative p-6 space-y-6 w-full rounded-2xl overflow-hidden"
          style={{
            background: `
              linear-gradient(135deg,
                ${theme.colors.surface}ee 0%,
                ${theme.colors.surfaceHover}cc 25%,
                ${theme.colors.surface}ee 50%,
                ${theme.colors.surfaceHover}cc 75%,
                ${theme.colors.surface}ee 100%
              ),
              radial-gradient(circle at 25% 25%,
                ${theme.colors.primary}08 0%,
                transparent 50%
              ),
              radial-gradient(circle at 75% 75%,
                ${theme.colors.success}03 0%,
                transparent 50%
              )
            `,
            border: `1px solid ${theme.colors.primary}15`,
            backdropFilter: 'blur(24px) saturate(1.8)',
            boxShadow: `
              0 20px 60px ${theme.colors.shadowHeavy},
              0 8px 24px ${theme.colors.primary}08,
              inset 0 1px 0 rgba(255, 255, 255, 0.1),
              inset 0 -1px 0 rgba(0, 0, 0, 0.2)
            `
          }}
        >
          {/* Noise grain overlay */}
          <div
            className="absolute inset-0 opacity-4 pointer-events-none"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='200' height='200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3Cfilter%3E%3Crect width='200' height='200' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
              filter: 'contrast(1.2) brightness(1.1)'
            }}
          />

          <div className="relative z-10">
            {/* Stake/Unstake Toggle */}
            <div className="flex items-center justify-center mb-6">
              <div
                className="relative rounded-xl p-1 w-full max-w-xs"
                style={{
                  background: `
                    linear-gradient(135deg,
                      ${theme.colors.surface}80 0%,
                      ${theme.colors.surfaceHover}60 50%,
                      ${theme.colors.surface}80 100%
                    )
                  `,
                  border: `1px solid ${theme.colors.primary}20`,
                  backdropFilter: 'blur(16px) saturate(1.5)',
                  boxShadow: `
                    inset 0 1px 0 rgba(255, 255, 255, 0.1),
                    0 4px 12px ${theme.colors.shadow}
                  `
                }}
              >
                <div className="flex">
                  <button
                    onClick={() => setActiveTab('stake')}
                    className={`flex-1 py-2 px-6 rounded-lg text-sm font-bold transition-all duration-300 ${
                      activeTab === 'stake' ? 'shadow-sm' : ''
                    }`}
                    style={{
                      backgroundColor: activeTab === 'stake' ? theme.colors.primary : 'transparent',
                      color: activeTab === 'stake' ? theme.colors.textInverse : theme.colors.textSecondary,
                      boxShadow: activeTab === 'stake' ? `0 4px 12px ${theme.colors.primary}30` : 'none'
                    }}
                  >
                    Stake
                  </button>
                  <button
                    onClick={() => setActiveTab('unstake')}
                    className={`flex-1 py-2 px-6 rounded-lg text-sm font-bold transition-all duration-300 ${
                      activeTab === 'unstake' ? 'shadow-sm' : ''
                    }`}
                    style={{
                      backgroundColor: activeTab === 'unstake' ? theme.colors.primary : 'transparent',
                      color: activeTab === 'unstake' ? theme.colors.textInverse : theme.colors.textSecondary,
                      boxShadow: activeTab === 'unstake' ? `0 4px 12px ${theme.colors.primary}30` : 'none'
                    }}
                  >
                    Unstake
                  </button>
                </div>
              </div>
            </div>

            {/* Token Selection */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label
                  className="text-sm font-bold tracking-wide"
                  style={{ color: theme.colors.textSecondary }}
                >
                  Select Token
                </label>
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs font-medium"
                    style={{ color: theme.colors.textMuted }}
                  >
                    APY: {currentToken?.apy}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {availableTokens.map((token) => (
                  <button
                    key={token.symbol}
                    onClick={() => setSelectedToken(token.symbol)}
                    className={`p-4 rounded-xl transition-all duration-300 hover:scale-[1.02] ${
                      selectedToken === token.symbol ? 'shadow-lg' : ''
                    }`}
                    style={{
                      background: selectedToken === token.symbol
                        ? `
                          linear-gradient(135deg,
                            ${theme.colors.primary}15 0%,
                            ${theme.colors.primary}08 50%,
                            ${theme.colors.primary}15 100%
                          )
                        `
                        : `
                          linear-gradient(135deg,
                            rgba(255, 255, 255, 0.03) 0%,
                            rgba(255, 255, 255, 0.05) 50%,
                            rgba(255, 255, 255, 0.03) 100%
                          )
                        `,
                      border: selectedToken === token.symbol
                        ? `1px solid ${theme.colors.primary}30`
                        : `1px solid ${theme.colors.border}`,
                      backdropFilter: 'blur(12px) saturate(1.5)',
                      boxShadow: selectedToken === token.symbol
                        ? `0 8px 24px ${theme.colors.primary}20, inset 0 1px 0 rgba(255, 255, 255, 0.1)`
                        : `0 4px 12px ${theme.colors.shadow}, inset 0 1px 0 rgba(255, 255, 255, 0.05)`
                    }}
                  >
                    <div className="flex flex-col items-center gap-3">
                      <img
                        src={token.icon}
                        alt={token.symbol}
                        className="w-10 h-10 rounded-full"
                        style={{
                          filter: selectedToken === token.symbol ? 'brightness(1.2)' : 'brightness(0.8)',
                          transition: 'filter 0.3s'
                        }}
                        onError={(e) => {
                          e.currentTarget.src = '/icons/default-token.svg'
                        }}
                      />
                      <div className="text-center">
                        <div
                          className="font-bold text-sm"
                          style={{
                            color: selectedToken === token.symbol
                              ? theme.colors.primary
                              : theme.colors.textPrimary
                          }}
                        >
                          {token.symbol}
                        </div>
                        <div className="text-xs" style={{ color: theme.colors.textMuted }}>
                          {token.apy}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Amount Input */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label
                  className="text-sm font-bold tracking-wide"
                  style={{ color: theme.colors.textSecondary }}
                >
                  {activeTab === 'stake' ? 'Amount to Stake' : 'Amount to Unstake'}
                </label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setStakeAmount(currentToken?.balance || '')}
                    className="text-xs font-bold transition-all duration-300 px-3 py-1 rounded-lg hover:scale-[1.05]"
                    style={{
                      color: theme.colors.primary,
                      background: `${theme.colors.primary}10`,
                      border: `1px solid ${theme.colors.primary}20`
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = `${theme.colors.primary}20`
                      e.currentTarget.style.borderColor = `${theme.colors.primary}30`
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = `${theme.colors.primary}10`
                      e.currentTarget.style.borderColor = `${theme.colors.primary}20`
                    }}
                  >
                    MAX
                  </button>
                  <span
                    className="text-xs"
                    style={{ color: theme.colors.textMuted }}
                  >
                    Balance: {currentToken?.balance}
                  </span>
                </div>
              </div>

              <div className="relative">
                <input
                  type="number"
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-4 py-4 rounded-xl text-lg font-medium bg-transparent transition-all duration-300"
                  style={{
                    background: `
                      linear-gradient(135deg,
                        rgba(255, 255, 255, 0.05) 0%,
                        rgba(255, 255, 255, 0.08) 50%,
                        rgba(255, 255, 255, 0.05) 100%
                      )
                    `,
                    border: `1px solid ${theme.colors.border}`,
                    color: theme.colors.textPrimary,
                    outline: 'none',
                    backdropFilter: 'blur(12px) saturate(1.5)',
                    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = theme.colors.primary
                    e.currentTarget.style.boxShadow = `0 0 0 3px ${theme.colors.primary}15, inset 0 1px 0 rgba(255, 255, 255, 0.1)`
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = theme.colors.border
                    e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                  }}
                />
                <div className="absolute right-4 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
                  <span
                    className="text-sm font-bold"
                    style={{ color: theme.colors.textPrimary }}
                  >
                    {selectedToken}
                  </span>
                </div>
              </div>
            </div>

            {/* Earnings Preview */}
            {activeTab === 'stake' && stakeAmount && potentialEarnings > 0 && (
              <div
                className="p-4 rounded-xl"
                style={{
                  background: `
                    linear-gradient(135deg,
                      ${theme.colors.success}10 0%,
                      ${theme.colors.success}05 50%,
                      ${theme.colors.success}10 100%
                    )
                  `,
                  border: `1px solid ${theme.colors.success}20`,
                  backdropFilter: 'blur(12px) saturate(1.5)',
                  boxShadow: `inset 0 1px 0 rgba(255, 255, 255, 0.1)`
                }}
              >
                <div className="flex justify-between items-center">
                  <span
                    className="text-sm font-medium"
                    style={{ color: theme.colors.textSecondary }}
                  >
                    Est. Annual Earnings
                  </span>
                  <span
                    className="text-sm font-bold"
                    style={{ color: theme.colors.success }}
                  >
                    ${potentialEarnings.toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {/* Action Button */}
            <button
              className="w-full py-4 rounded-xl font-bold text-white text-lg transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              style={{
                background: `
                  linear-gradient(135deg,
                    ${theme.colors.primary} 0%,
                    ${theme.colors.primaryHover} 100%
                  )
                `,
                border: `1px solid ${theme.colors.primary}30`,
                backdropFilter: 'blur(12px) saturate(1.5)',
                boxShadow: `
                  0 8px 24px ${theme.colors.primary}30,
                  inset 0 1px 0 rgba(255, 255, 255, 0.1)
                `,
                cursor: stakeAmount && parseFloat(stakeAmount) > 0 ? 'pointer' : 'not-allowed'
              }}
              disabled={!stakeAmount || parseFloat(stakeAmount) <= 0}
            >
              {activeTab === 'stake' ? 'Stake Tokens' : 'Unstake Tokens'}
            </button>
          </div>
        </div>
      </div>

      {/* Security & Info Footer - Matching Swap component */}
      <div
        className="mt-6 pt-4"
        style={{ borderTop: `1px solid ${theme.colors.border}` }}
      >
        <div
          className="flex items-center justify-center gap-6 text-xs"
          style={{ color: theme.colors.textMuted }}
        >
          <div className="flex items-center gap-1">
            <CurrencyDollarIcon className="h-3 w-3" style={{ color: theme.colors.success }} />
            <span>Competitive APY</span>
          </div>
          <div className="flex items-center gap-1">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: theme.colors.primary }}
            />
            <span>Secured Staking</span>
          </div>
          <div className="flex items-center gap-1">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: theme.colors.success }}
            />
            <span>Rewards Trackable</span>
          </div>
        </div>
      </div>

      {/* Your Staking Positions */}
      {stakePositions.length > 0 && (
        <div className="mt-8">
          <h3
            className="text-lg font-semibold mb-4"
            style={{ color: theme.colors.textPrimary }}
          >
            Your Staking Positions
          </h3>
          <div className="space-y-3">
            {stakePositions.map((position, index) => (
              <div
                key={index}
                className="p-4 rounded-xl"
                style={{
                  background: `
                    linear-gradient(135deg,
                      ${theme.colors.surface}ee 0%,
                      ${theme.colors.surfaceHover}cc 50%,
                      ${theme.colors.surface}ee 100%
                    )
                  `,
                  border: `1px solid ${theme.colors.border}`,
                  backdropFilter: 'blur(16px) saturate(1.5)',
                  boxShadow: `
                    0 8px 24px ${theme.colors.shadow},
                    inset 0 1px 0 rgba(255, 255, 255, 0.05)
                  `
                }}
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <img
                      src={position.token.icon}
                      alt={position.token.symbol}
                      className="w-10 h-10 rounded-full"
                      onError={(e) => {
                        e.currentTarget.src = '/icons/default-token.svg'
                      }}
                    />
                    <div>
                      <div className="font-bold" style={{ color: theme.colors.textPrimary }}>
                        {position.token.symbol}
                      </div>
                      <div className="text-xs" style={{ color: theme.colors.textMuted }}>
                        {position.apy} APY
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold" style={{ color: theme.colors.textPrimary }}>
                      {privacyMode ? '****' : position.staked}
                    </div>
                    <div className="text-xs font-medium" style={{ color: theme.colors.success }}>
                      Rewards: {privacyMode ? '****' : position.rewards}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}