'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useThemeConfig, createGlassStyles } from '@/lib/theme'
import { CurrencyDollarIcon, InformationCircleIcon, ArrowTrendingUpIcon, LockClosedIcon, ChevronDownIcon } from '@heroicons/react/24/outline'
import { ComingSoon } from '@/components/ui/ComingSoon'
import { TokenIcon } from '@/components/TokenIcon'

interface WaveStakeProps {
  privacyMode: boolean
  comingSoon?: boolean
}

interface StakePool {
  id: string
  name: string
  symbol: string
  mintAddress: string
  apr: number
  bonus30days: number
  totalStaked: string | null
  tvl: string | null
  lockPeriod: number
  isSecureBagAvailable: boolean
  isComingSoon?: boolean
  description: string
  oroFinanceUrl?: string
  userStaked?: string
  userRewards?: string
  userSecureBag?: string
}

interface StakingAction {
  type: 'deposit' | 'withdraw' | 'claim'
  amount: string
  pool: StakePool
}

// Get Jupiter icon URLs for tokens - using working Jupiter CDN URLs
const getJupiterIconUrl = (symbol: string): string | null => {
  const jupIconMap: { [key: string]: string } = {
    'WAVE': 'https://img-cdn.jup.ag/tokens/WAVE.svg',
    'WEALTH': 'https://img-cdn.jup.ag/tokens/WEALTH.svg',
    'SOL': 'https://img-cdn.jup.ag/tokens/SOL.svg'
  }
  return jupIconMap[symbol] || null
}

export function WaveStake({ privacyMode, comingSoon = false }: WaveStakeProps) {
  const theme = useThemeConfig()
  const [selectedPool, setSelectedPool] = useState<string>('WAVE')
  const [stakeAmount, setStakeAmount] = useState<string>('')
  const [activeModal, setActiveModal] = useState<'stake' | 'secureBag' | null>(null)
  const [activeAction, setActiveAction] = useState<'deposit' | 'withdraw' | 'claim'>('deposit')
  const [showInfoModal, setShowInfoModal] = useState(false)
  const [showComingSoonModal, setShowComingSoonModal] = useState(false)
  const [comingSoonAction, setComingSoonAction] = useState<string>('')
  const [isPoolDropdownOpen, setIsPoolDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsPoolDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Pool data with professional information
  const stakePools: StakePool[] = [
    {
      id: 'WAVE',
      name: 'WAVE',
      symbol: 'WAVE',
      mintAddress: '4AGxpKxYnw7g1ofvYDs5Jq2a1ek5kB9jS2NTUaippump',
      apr: 28,
      bonus30days: 8.88,
      totalStaked: '12.5M',
      tvl: '$8.9M',
      lockPeriod: 0,
      isSecureBagAvailable: true,
      isComingSoon: true,
      description: 'Native governance token with competitive yields',
      userStaked: privacyMode ? '****' : '0',
      userRewards: privacyMode ? '****' : '0',
      userSecureBag: privacyMode ? '****' : '0'
    },
    {
      id: 'WEALTH',
      name: 'WEALTH',
      symbol: 'WEALTH',
      mintAddress: 'BSxPC3Vu3X6UCtEEAYyhxAEo3rvtS4dgzzrvnERDpump',
      apr: 28,
      bonus30days: 8.88,
      totalStaked: '3.8M',
      tvl: '$4.2M',
      lockPeriod: 0,
      isSecureBagAvailable: true,
      isComingSoon: true,
      description: 'High-yield wealth generation token',
      userStaked: privacyMode ? '****' : '0',
      userRewards: privacyMode ? '****' : '0',
      userSecureBag: privacyMode ? '****' : '0'
    },
    {
      id: 'GOLD',
      name: 'GOLD',
      symbol: 'GOLD',
      mintAddress: 'GoLDppdjB1vDTPSGxyMJFqdnj134yH6Prg9eqsGDiw6A',
      apr: 8,
      bonus30days: 2.80,
      totalStaked: '1.2M',
      tvl: '$2.1M',
      lockPeriod: 0,
      isSecureBagAvailable: true,
      isComingSoon: true,
      description: 'Gold, but better with oro.finance',
      oroFinanceUrl: 'https://oro.finance',
      userStaked: privacyMode ? '****' : '0',
      userRewards: privacyMode ? '****' : '0',
      userSecureBag: privacyMode ? '****' : '0'
    }
  ]

  const currentPool = stakePools.find(pool => pool.id === selectedPool)

  // Calculate earnings
  const calculateEarnings = useCallback((amount: string, apr: number, days: number = 365) => {
    if (!amount || !currentPool) return 0
    const principal = parseFloat(amount) || 0
    const dailyRate = apr / 100 / 365
    return principal * dailyRate * days
  }, [currentPool])

  const calculateSecureBagEarnings = useCallback((amount: string) => {
    if (!amount || !currentPool) return 0
    const baseEarnings = calculateEarnings(amount, currentPool.apr, 30)
    const bonusMultiplier = 1 + (currentPool.bonus30days / 100)
    return baseEarnings * bonusMultiplier
  }, [calculateEarnings, currentPool])

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
    <div className="w-full max-w-lg sm:max-w-xl mx-auto px-2 xs:px-0 space-y-4 sm:space-y-6">
      {/* Pool Selector */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold" style={{ color: theme.colors.textPrimary }}>
            Staking Pools
          </h2>
          <button
            onClick={() => setShowInfoModal(true)}
            className="p-2 rounded-lg transition-all duration-300 hover:scale-[1.05]"
            style={{
              background: `${theme.colors.surface}80`,
              border: `1px solid ${theme.colors.border}`,
              backdropFilter: 'blur(12px) saturate(1.5)'
            }}
          >
            <InformationCircleIcon className="w-5 h-5" style={{ color: theme.colors.textSecondary }} />
          </button>
        </div>

        {/* Pool Dropdown Selector */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsPoolDropdownOpen(!isPoolDropdownOpen)}
            className="w-full p-4 rounded-xl transition-all duration-300 hover:scale-[1.02] flex items-center justify-between"
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
              boxShadow: `0 4px 12px ${theme.colors.shadow}, inset 0 1px 0 rgba(255, 255, 255, 0.05)`
            }}
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <div
                  className="rounded-full overflow-hidden p-[2px]"
                  style={{
                    background: `linear-gradient(${theme.colors.border}, ${theme.colors.border})`
                  }}
                >
                  <TokenIcon
                    symbol={currentPool?.symbol || 'WAVE'}
                    mint={currentPool?.mintAddress || '4AGxpKxYnw7g1ofvYDs5Jq2a1ek5kB9jS2NTUaippump'}
                    logoURI={getJupiterIconUrl(currentPool?.symbol || 'WAVE') || undefined}
                    size={40}
                  />
                </div>
                {currentPool?.isSecureBagAvailable && (
                  <div
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: theme.colors.success }}
                  >
                    <LockClosedIcon className="w-2.5 h-2.5 text-white" />
                  </div>
                )}
              </div>

              <div className="text-left">
                <div className="font-bold" style={{ color: theme.colors.textPrimary }}>
                  {currentPool?.name}
                </div>
                <div className="text-sm font-medium" style={{ color: theme.colors.success }}>
                  {currentPool?.isComingSoon ? (
                    <>
                      <span className="px-2 py-0.5 rounded-full text-xs mr-2"
                            style={{
                              background: `${theme.colors.primary}15`,
                              color: theme.colors.primary
                            }}>
                        Coming Soon
                      </span>
                      {currentPool?.apr}% APR
                      {currentPool && currentPool.bonus30days > 0 && (
                        <span className="ml-2 px-2 py-0.5 rounded-full text-xs"
                              style={{
                                background: `${theme.colors.success}15`,
                                color: theme.colors.success
                              }}>
                          +{currentPool.bonus30days}% bonus
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      {currentPool?.apr}% APR
                      {currentPool && currentPool.bonus30days > 0 && (
                        <span className="ml-2 px-2 py-0.5 rounded-full text-xs"
                              style={{
                                background: `${theme.colors.success}15`,
                                color: theme.colors.success
                              }}>
                          +{currentPool.bonus30days}% bonus
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            <ChevronDownIcon
              className="w-5 h-5 transition-transform duration-300"
              style={{
                color: theme.colors.textSecondary,
                transform: isPoolDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)'
              }}
            />
          </button>

          {/* Dropdown Menu */}
          {isPoolDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-2 z-50 rounded-xl overflow-hidden"
                 style={{
                   background: `
                     linear-gradient(135deg,
                       ${theme.colors.surface}ee 0%,
                       ${theme.colors.surfaceHover}cc 50%,
                       ${theme.colors.surface}ee 100%
                     )
                   `,
                   border: `1px solid ${theme.colors.border}`,
                   backdropFilter: 'blur(24px) saturate(1.8)',
                   boxShadow: `
                     0 20px 60px ${theme.colors.shadowHeavy},
                     0 8px 24px ${theme.colors.primary}08
                   `
                 }}>
              {stakePools.map((pool) => (
                <button
                  key={pool.id}
                  onClick={() => {
                    setSelectedPool(pool.id)
                    setIsPoolDropdownOpen(false)
                  }}
                  className={`w-full p-4 transition-all duration-200 flex items-center gap-3 ${
                    selectedPool === pool.id ? '' : 'hover:scale-[1.02]'
                  }`}
                  style={{
                    background: selectedPool === pool.id
                      ? `${theme.colors.primary}15`
                      : 'transparent',
                    borderBottom: stakePools.length > 0 && pool.id === stakePools.at(-1)?.id
                      ? 'none'
                      : `1px solid ${theme.colors.borderLight}`
                  }}
                >
                  <div className="relative">
                    <div
                      className="rounded-full overflow-hidden p-[2px]"
                      style={{
                        background: selectedPool === pool.id
                          ? `linear-gradient(${theme.colors.primary}, ${theme.colors.primary})`
                          : `linear-gradient(${theme.colors.borderLight}, ${theme.colors.borderLight})`
                      }}
                    >
                      <TokenIcon
                        symbol={pool.symbol}
                        mint={pool.mintAddress}
                        logoURI={getJupiterIconUrl(pool.symbol) || undefined}
                        size={36}
                      />
                    </div>
                    {pool.isSecureBagAvailable && (
                      <div
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: theme.colors.success }}
                      >
                        <LockClosedIcon className="w-2.5 h-2.5 text-white" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 text-left">
                    <div className="font-bold text-sm"
                         style={{
                           color: selectedPool === pool.id
                             ? theme.colors.primary
                             : theme.colors.textPrimary
                         }}>
                      {pool.name}
                    </div>
                    <div className="text-xs" style={{ color: theme.colors.textMuted }}>
                      {pool.symbol} {pool.totalStaked && `• ${pool.totalStaked} staked`}
                    </div>
                  </div>

                  <div className="text-right">
                    {pool.isComingSoon ? (
                      <div className="text-xs font-medium px-2 py-0.5 rounded-full"
                           style={{
                             background: `${theme.colors.success}15`,
                             color: theme.colors.success
                           }}>
                        Coming Soon
                      </div>
                    ) : (
                      <>
                        <div className="font-bold text-sm" style={{ color: theme.colors.success }}>
                          {pool.apr}%
                        </div>
                        {pool.bonus30days > 0 && (
                          <div className="text-xs font-medium" style={{ color: theme.colors.success }}>
                            +{pool.bonus30days}% 30d
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Selected Pool Information */}
      {currentPool && (
        <div
          className="relative p-6 rounded-2xl overflow-hidden"
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

          <div className="relative z-10 space-y-4">
            {/* Pool Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <TokenIcon
                  symbol={currentPool.symbol}
                  mint={currentPool.mintAddress}
                  logoURI={getJupiterIconUrl(currentPool.symbol) || undefined}
                  size={40}
                />
                <div>
                  <h3 className="text-lg font-bold" style={{ color: theme.colors.textPrimary }}>
                    {currentPool.name}
                  </h3>
                  <p className="text-sm" style={{ color: theme.colors.textMuted }}>
                    {currentPool.id === 'GOLD' && currentPool.oroFinanceUrl ? (
                      <>
                        Gold, but better with{' '}
                        <a
                          href={currentPool.oroFinanceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:no-underline transition-all duration-200"
                          style={{
                            color: theme.colors.primary,
                            textDecorationColor: theme.colors.primary,
                            opacity: 0.8
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.opacity = '1'
                            e.currentTarget.style.color = theme.colors.primaryHover
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.opacity = '0.8'
                            e.currentTarget.style.color = theme.colors.primary
                          }}
                        >
                          oro.finance
                        </a>
                      </>
                    ) : (
                      currentPool.description
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Pool Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl" style={{
                background: `${theme.colors.surface}60`,
                border: `1px solid ${theme.colors.border}`,
                backdropFilter: 'blur(12px) saturate(1.5)'
              }}>
                <div className="flex items-center gap-2 mb-2">
                  <ArrowTrendingUpIcon className="w-4 h-4" style={{ color: theme.colors.success }} />
                  <span className="text-xs font-medium" style={{ color: theme.colors.textSecondary }}>
                    Base APR
                  </span>
                </div>
                <div className="text-2xl font-bold" style={{ color: theme.colors.success }}>
                  {currentPool.apr}%
                </div>
              </div>

              <div className="p-4 rounded-xl" style={{
                background: `${theme.colors.surface}60`,
                border: `1px solid ${theme.colors.border}`,
                backdropFilter: 'blur(12px) saturate(1.5)'
              }}>
                <div className="flex items-center gap-2 mb-2">
                  <LockClosedIcon className="w-4 h-4" style={{ color: theme.name === 'stealth' ? '#00cc88' : theme.colors.success }} />
                  <span className="text-xs font-medium" style={{ color: theme.colors.textSecondary }}>
                    30 Day Bonus
                  </span>
                </div>
                <div className="text-2xl font-bold" style={{ color: theme.colors.success }}>
                  +{currentPool.bonus30days}%
                </div>
              </div>

              <div className="p-4 rounded-xl" style={{
                background: `${theme.colors.surface}60`,
                border: `1px solid ${theme.colors.border}`,
                backdropFilter: 'blur(12px) saturate(1.5)'
              }}>
                <div className="flex items-center gap-2 mb-2">
                  <CurrencyDollarIcon className="w-4 h-4" style={{ color: theme.colors.primary }} />
                  <span className="text-xs font-medium" style={{ color: theme.colors.textSecondary }}>
                    {currentPool.isComingSoon ? 'Availability' : 'Total Staked'}
                  </span>
                </div>
                <div className="text-lg font-bold" style={{ color: theme.colors.textPrimary }}>
                  {currentPool.isComingSoon ? 'Coming Soon' : currentPool.totalStaked}
                </div>
                <div className="text-xs" style={{ color: theme.colors.textMuted }}>
                  {!currentPool.isComingSoon && currentPool.tvl && `${currentPool.tvl} TVL`}
                </div>
              </div>

              <div className="p-4 rounded-xl" style={{
                background: `${theme.colors.surface}60`,
                border: `1px solid ${theme.colors.border}`,
                backdropFilter: 'blur(12px) saturate(1.5)'
              }}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: theme.colors.primary }} />
                  <span className="text-xs font-medium" style={{ color: theme.colors.textSecondary }}>
                    Your Position
                  </span>
                </div>
                <div className="text-lg font-bold" style={{ color: theme.colors.textPrimary }}>
                  {currentPool.userStaked}
                </div>
                <div className="text-xs font-medium" style={{ color: theme.colors.success }}>
                  Rewards: {currentPool.userRewards}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => {
                  if (currentPool.isComingSoon) {
                    setComingSoonAction(`${currentPool.name} staking`)
                    setShowComingSoonModal(true)
                  } else {
                    setActiveModal('stake')
                    setActiveAction('deposit')
                  }
                }}
                className="py-3 px-4 rounded-xl font-bold transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
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
                  color: theme.name === 'stealth' ? '#000000' : 'white',
                  opacity: currentPool.isComingSoon ? 0.7 : 1,
                  cursor: 'pointer'
                }}
              >
                Stake
              </button>

              {currentPool.isSecureBagAvailable && (
                <button
                  onClick={() => {
                    if (currentPool.isComingSoon) {
                      setComingSoonAction(`${currentPool.name} Secure The Bag locking`)
                      setShowComingSoonModal(true)
                    } else {
                      setActiveModal('secureBag')
                    }
                  }}
                  className="py-3 px-4 rounded-xl font-bold transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] relative"
                  style={{
                    background: `
                      linear-gradient(135deg,
                        ${theme.colors.success} 0%,
                        ${theme.name === 'stealth' ? '#00cc88' : theme.colors.primaryHover} 100%
                      )
                    `,
                    border: `1px solid ${theme.colors.success}30`,
                    backdropFilter: 'blur(12px) saturate(1.5)',
                    boxShadow: `
                      0 8px 24px ${theme.colors.success}30,
                      inset 0 1px 0 rgba(255, 255, 255, 0.1)
                    `,
                    color: 'white',
                    opacity: currentPool.isComingSoon ? 0.7 : 1,
                    cursor: 'pointer'
                  }}
                >
                  Secure The Bag
                  <LockClosedIcon className="w-4 h-4 mr-2 inline" />
                </button>
              )}
            </div>
            {/* Placeholder Notice */}
        <div
          className="text-center text-xs"
          style={{ color: theme.colors.textMuted, opacity: 0.7 }}
        >
          <span>Yield numbers are placeholders</span>
        </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {activeModal === 'stake' && currentPool && (
        <StakeModal
          pool={currentPool}
          onClose={() => setActiveModal(null)}
          theme={theme}
          privacyMode={privacyMode}
          setComingSoonAction={setComingSoonAction}
          setShowComingSoonModal={setShowComingSoonModal}
        />
      )}

      {activeModal === 'secureBag' && currentPool && (
        <SecureBagModal
          pool={currentPool}
          onClose={() => setActiveModal(null)}
          theme={theme}
          calculateEarnings={calculateEarnings}
          calculateSecureBagEarnings={calculateSecureBagEarnings}
          setComingSoonAction={setComingSoonAction}
          setShowComingSoonModal={setShowComingSoonModal}
        />
      )}

      {showInfoModal && (
        <InfoModal
          onClose={() => setShowInfoModal(false)}
          theme={theme}
        />
      )}

      {showComingSoonModal && (
        <ComingSoonModal
          action={comingSoonAction}
          onClose={() => setShowComingSoonModal(false)}
          theme={theme}
        />
      )}

      {/* Security & Info Footer - Matching Swap component */}
      <div
        className="pt-4"
        style={{ borderTop: `1px solid ${theme.colors.border}` }}
      >
        <div
          className="flex items-center justify-center gap-6 text-xs mb-3"
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
    </div>
  )
}

// Stake Modal Component
function StakeModal({
  pool,
  onClose,
  theme,
  privacyMode,
  setComingSoonAction,
  setShowComingSoonModal
}: {
  pool: StakePool
  onClose: () => void
  theme: any
  privacyMode: boolean
  setComingSoonAction?: (action: string) => void
  setShowComingSoonModal?: (show: boolean) => void
}) {
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw' | 'claim'>('deposit')
  const [amount, setAmount] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div
        className="relative w-full max-w-sm sm:max-w-md rounded-2xl overflow-hidden"
        style={{
          background: `
            linear-gradient(135deg,
              ${theme.colors.surface}ee 0%,
              ${theme.colors.surfaceHover}cc 25%,
              ${theme.colors.surface}ee 50%,
              ${theme.colors.surfaceHover}cc 75%,
              ${theme.colors.surface}ee 100%
            )
          `,
          border: `1px solid ${theme.colors.primary}15`,
          backdropFilter: 'blur(24px) saturate(1.8)',
          boxShadow: `
            0 20px 60px ${theme.colors.shadowHeavy},
            0 8px 24px ${theme.colors.primary}08
          `
        }}
      >
        <div className="p-6 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold" style={{ color: theme.colors.textPrimary }}>
              {pool.name} Staking
            </h3>
            <button
              onClick={onClose}
              className="p-2 rounded-lg transition-all duration-300 hover:scale-[1.05]"
              style={{
                background: `${theme.colors.surface}60`,
                border: `1px solid ${theme.colors.border}`
              }}
            >
              <svg className="w-5 h-5" style={{ color: theme.colors.textSecondary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex p-1 rounded-xl" style={{
            background: `${theme.colors.surface}60`,
            border: `1px solid ${theme.colors.border}`
          }}>
            {(['deposit', 'withdraw', 'claim'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2 px-4 rounded-lg font-medium capitalize transition-all duration-300 ${
                  activeTab === tab ? 'shadow-sm' : ''
                }`}
                style={{
                  backgroundColor: activeTab === tab ? theme.colors.primary : 'transparent',
                  color: activeTab === tab ? theme.colors.textInverse : theme.colors.textSecondary,
                  boxShadow: activeTab === tab ? `0 4px 12px ${theme.colors.primary}30` : 'none'
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Content based on active tab */}
          {activeTab !== 'claim' && (
            <div className="space-y-3">
              <label className="text-sm font-medium" style={{ color: theme.colors.textSecondary }}>
                {activeTab === 'deposit' ? 'Amount to Deposit' : 'Amount to Withdraw'}
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder=""
                  className="w-full px-4 py-4 rounded-xl bg-transparent"
                  style={{
                    background: `${theme.colors.surface}40`,
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    borderColor: theme.colors.border,
                    color: theme.colors.textPrimary,
                    outline: 'none'
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = theme.colors.primary
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = theme.colors.border
                  }}
                />
                <div className="absolute right-4 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
                  <TokenIcon
                    symbol={pool.symbol}
                    mint={pool.mintAddress}
                    logoURI={getJupiterIconUrl(pool.symbol) || undefined}
                    size={24}
                  />
                  <span className="font-bold" style={{ color: theme.colors.textPrimary }}>
                    {pool.symbol}
                  </span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'claim' && (
            <div className="p-6 rounded-xl text-center" style={{
              background: `${theme.colors.success}10`,
              border: `1px solid ${theme.colors.success}20`
            }}>
              <div className="text-3xl font-bold mb-2" style={{ color: theme.colors.success }}>
                {privacyMode ? '****' : pool.userRewards}
              </div>
              <div className="text-sm font-medium" style={{ color: theme.colors.textSecondary }}>
                Available to Claim
              </div>
            </div>
          )}

          {/* Action Button */}
          <button
            className="w-full py-3 rounded-xl font-bold text-white transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: `
                linear-gradient(135deg,
                  ${theme.colors.primary} 0%,
                  ${theme.colors.primaryHover} 100%
                )
              `,
              border: `1px solid ${theme.colors.primary}30`,
              boxShadow: `0 8px 24px ${theme.colors.primary}30`,
              cursor: pool.isComingSoon ? 'pointer' : activeTab === 'claim' ? 'pointer' : (amount && parseFloat(amount) > 0) ? 'pointer' : 'not-allowed'
            }}
            disabled={pool.isComingSoon ? false : activeTab !== 'claim' && (!amount || parseFloat(amount) <= 0)}
            onClick={() => {
              if (pool.isComingSoon) {
                setComingSoonAction && setComingSoonAction(`${pool.name} ${activeTab === 'deposit' ? 'staking' : activeTab === 'withdraw' ? 'unstaking' : 'rewards claiming'}`)
                setShowComingSoonModal && setShowComingSoonModal(true)
              }
            }}
          >
            {activeTab === 'deposit' ? 'Stake' : activeTab === 'withdraw' ? 'Withdraw' : 'Claim Rewards'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Secure Bag Modal Component
function SecureBagModal({
  pool,
  onClose,
  theme,
  calculateEarnings,
  calculateSecureBagEarnings,
  setComingSoonAction,
  setShowComingSoonModal
}: {
  pool: StakePool
  onClose: () => void
  theme: any
  calculateEarnings: (amount: string, apr: number, days?: number) => number
  calculateSecureBagEarnings: (amount: string) => number
  setComingSoonAction?: (action: string) => void
  setShowComingSoonModal?: (show: boolean) => void
}) {
  const [amount, setAmount] = useState('')

  const regularEarnings = amount ? calculateEarnings(amount, pool.apr, 30) : 0
  const bonusEarnings = amount ? calculateSecureBagEarnings(amount) : 0
  const bonusDifference = bonusEarnings - regularEarnings

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div
        className="relative w-full max-w-sm sm:max-w-md rounded-2xl overflow-hidden"
        style={{
          background: `
            linear-gradient(135deg,
              ${theme.colors.surface}ee 0%,
              ${theme.colors.surfaceHover}cc 25%,
              ${theme.colors.surface}ee 50%,
              ${theme.colors.surfaceHover}cc 75%,
              ${theme.colors.surface}ee 100%
            )
          `,
          border: `1px solid ${theme.colors.success}15`,
          backdropFilter: 'blur(24px) saturate(1.8)',
          boxShadow: `
            0 20px 60px ${theme.colors.shadowHeavy},
            0 8px 24px ${theme.colors.success}08
          `
        }}
      >
        <div className="p-6 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <LockClosedIcon className="w-6 h-6" style={{ color: theme.name === 'stealth' ? '#00cc88' : theme.colors.success }} />
              <h3 className="text-xl font-bold" style={{ color: theme.colors.textPrimary }}>
                Secure Bag
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg transition-all duration-300 hover:scale-[1.05]"
              style={{
                background: `${theme.colors.surface}60`,
                border: `1px solid ${theme.colors.border}`
              }}
            >
              <svg className="w-5 h-5" style={{ color: theme.colors.textSecondary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Info */}
          <div className="p-4 rounded-xl" style={{
            background: `${theme.colors.success}10`,
            border: `1px solid ${theme.colors.success}20`
          }}>
            <div className="flex items-center gap-2 mb-2">
              <LockClosedIcon className="w-4 h-4" style={{ color: theme.name === 'stealth' ? '#00cc88' : theme.colors.success }} />
              <span className="font-medium" style={{ color: theme.colors.textPrimary }}>
                30-Day Lock Period
              </span>
            </div>
            <p className="text-sm" style={{ color: theme.colors.textSecondary }}>
              Lock your tokens for 30 days to earn an additional {pool.bonus30days}% bonus on top of the base APR.
            </p>
          </div>

          {/* Amount Input */}
          <div className="space-y-3">
            <label className="text-sm font-medium" style={{ color: theme.colors.textSecondary }}>
              Amount to Lock
            </label>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder=""
                className="w-full px-4 py-4 rounded-xl bg-transparent"
                style={{
                  background: `${theme.colors.surface}40`,
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  borderColor: theme.colors.border,
                  color: theme.colors.textPrimary,
                  outline: 'none'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = theme.colors.primary
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = theme.colors.border
                }}
              />
              <div className="absolute right-4 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
                <TokenIcon
                  symbol={pool.symbol}
                  mint={pool.mintAddress}
                  logoURI={getJupiterIconUrl(pool.symbol) || undefined}
                  size={24}
                />
                <span className="font-bold" style={{ color: theme.colors.textPrimary }}>
                  {pool.symbol}
                </span>
              </div>
            </div>
          </div>

          {/* Earnings Comparison */}
          {amount && parseFloat(amount) > 0 && (
            <div className="space-y-3">
              <h4 className="font-medium" style={{ color: theme.colors.textPrimary }}>
                30-Day Earnings Comparison
              </h4>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl" style={{
                  background: `${theme.colors.surface}40`,
                  border: `1px solid ${theme.colors.border}`
                }}>
                  <div className="text-xs font-medium" style={{ color: theme.colors.textSecondary }}>
                    Regular Staking
                  </div>
                  <div className="text-lg font-bold" style={{ color: theme.colors.textPrimary }}>
                    {regularEarnings.toFixed(4)}
                  </div>
                </div>

                <div className="p-3 rounded-xl" style={{
                  background: `${theme.colors.success}15`,
                  border: `1px solid ${theme.colors.success}30`
                }}>
                  <div className="text-xs font-medium" style={{ color: theme.colors.success }}>
                    Secure Bag
                  </div>
                  <div className="text-lg font-bold" style={{ color: theme.colors.success }}>
                    {bonusEarnings.toFixed(4)}
                  </div>
                </div>
              </div>

              {bonusDifference > 0 && (
                <div className="p-3 rounded-xl text-center" style={{
                  background: `${theme.colors.success}10`,
                  border: `1px solid ${theme.colors.success}20`
                }}>
                  <div className="text-sm font-medium" style={{ color: theme.colors.textSecondary }}>
                    Extra Bonus Earnings
                  </div>
                  <div className="text-lg font-bold" style={{ color: theme.colors.success }}>
                    +{bonusDifference.toFixed(4)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Action Button */}
          <button
            className="w-full py-3 rounded-xl font-bold text-white transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: `
                linear-gradient(135deg,
                  ${theme.colors.success} 0%,
                  ${theme.name === 'stealth' ? '#00cc88' : theme.colors.primaryHover} 100%
                )
              `,
              border: `1px solid ${theme.colors.success}30`,
              boxShadow: `0 8px 24px ${theme.colors.success}30`,
              cursor: pool.isComingSoon ? 'pointer' : amount && parseFloat(amount) > 0 ? 'pointer' : 'not-allowed'
            }}
            disabled={pool.isComingSoon ? false : !amount || parseFloat(amount) <= 0}
            onClick={() => {
              if (pool.isComingSoon) {
                setComingSoonAction && setComingSoonAction(`${pool.name} Secure The Bag locking`)
                setShowComingSoonModal && setShowComingSoonModal(true)
              }
            }}
          >
            Secure The Bag
          </button>
        </div>
      </div>
    </div>
  )
}

// Info Modal Component
function InfoModal({ onClose, theme }: { onClose: () => void, theme: any }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div
        className="relative w-full max-w-md rounded-2xl overflow-hidden max-h-[80vh] overflow-y-auto"
        style={{
          background: `
            linear-gradient(135deg,
              ${theme.colors.surface}ee 0%,
              ${theme.colors.surfaceHover}cc 25%,
              ${theme.colors.surface}ee 50%,
              ${theme.colors.surfaceHover}cc 75%,
              ${theme.colors.surface}ee 100%
            )
          `,
          border: `1px solid ${theme.colors.primary}15`,
          backdropFilter: 'blur(24px) saturate(1.8)',
          boxShadow: `
            0 20px 60px ${theme.colors.shadowHeavy},
            0 8px 24px ${theme.colors.primary}08
          `
        }}
      >
        <div className="p-6 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <InformationCircleIcon className="w-6 h-6" style={{ color: theme.colors.primary }} />
              <h3 className="text-xl font-bold" style={{ color: theme.colors.textPrimary }}>
                Wave Dark Pool
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg transition-all duration-300 hover:scale-[1.05]"
              style={{
                background: `${theme.colors.surface}60`,
                border: `1px solid ${theme.colors.border}`
              }}
            >
              <svg className="w-5 h-5" style={{ color: theme.colors.textSecondary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="space-y-4">
            <div>
              <h4 className="font-bold mb-2" style={{ color: theme.colors.textPrimary }}>
                What is Wave Dark Pool?
              </h4>
              <p className="text-sm leading-relaxed" style={{ color: theme.colors.textSecondary }}>
                Wave Dark Pool is our advanced staking system that offers competitive yields with enhanced privacy features.
                Stake your WAVE and WEALTH tokens to earn rewards while maintaining control over your assets.
              </p>
            </div>

            <div>
              <h4 className="font-bold mb-2" style={{ color: theme.colors.textPrimary }}>
                Staking Options
              </h4>
              <div className="space-y-2">
                <div className="p-3 rounded-xl" style={{
                  background: `${theme.colors.primary}10`,
                  border: `1px solid ${theme.colors.primary}20`
                }}>
                  <h5 className="font-medium text-sm" style={{ color: theme.colors.primary }}>
                    Normal Staking
                  </h5>
                  <p className="text-xs mt-1" style={{ color: theme.colors.textSecondary }}>
                    Flexible staking with the ability to deposit, withdraw, and claim rewards anytime.
                    Competitive base APR with no lock period.
                  </p>
                </div>

                <div className="p-3 rounded-xl" style={{
                  background: `${theme.colors.success}10`,
                  border: `1px solid ${theme.colors.success}20`
                }}>
                  <h5 className="font-medium text-sm" style={{ color: theme.name === 'stealth' ? '#00cc88' : theme.colors.success }}>
                    Secure Bag
                  </h5>
                  <p className="text-xs mt-1" style={{ color: theme.colors.textSecondary }}>
                    Lock your tokens for 30 days to earn bonus rewards on top of the base APR.
                    Perfect for long-term holders seeking maximum returns.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-bold mb-2" style={{ color: theme.colors.textPrimary }}>
                Key Features
              </h4>
              <ul className="space-y-2">
                {[
                  'Competitive APRs up to 25%',
                  '30-day bonus rewards with Secure Bag',
                  'Instant withdrawals for normal staking',
                  'Real-time reward tracking',
                  'Privacy-preserving transactions',
                  'No minimum stake requirements'
                ].map((feature, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <div className="w-4 h-4 rounded-full mt-0.5 flex-shrink-0" style={{
                      backgroundColor: theme.colors.success
                    }} />
                    <span className="text-sm" style={{ color: theme.colors.textSecondary }}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="font-bold mb-2" style={{ color: theme.colors.textPrimary }}>
                Security
              </h4>
              <p className="text-sm leading-relaxed" style={{ color: theme.colors.textSecondary }}>
                All staking contracts are audited and secured. Your funds remain under your control at all times,
                and you can withdraw your stake (minus Secure Bag lock restrictions) whenever you choose.
              </p>
            </div>
          </div>

          {/* Close Button */}
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl font-bold transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
            style={{
              background: `
                linear-gradient(135deg,
                  ${theme.colors.primary} 0%,
                  ${theme.colors.primaryHover} 100%
                )
              `,
              border: `1px solid ${theme.colors.primary}30`,
              boxShadow: `0 8px 24px ${theme.colors.primary}30`,
              color: theme.name === 'stealth' ? '#000000' : 'white'
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
// Coming Soon Modal Component
function ComingSoonModal({ action, onClose, theme }: {
  action: string,
  onClose: () => void,
  theme: any
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div
        className="relative w-full max-w-sm sm:max-w-md rounded-2xl overflow-hidden"
        style={{
          background: `
            linear-gradient(135deg,
              ${theme.colors.surface}ee 0%,
              ${theme.colors.surfaceHover}cc 25%,
              ${theme.colors.surface}ee 50%,
              ${theme.colors.surfaceHover}cc 75%,
              ${theme.colors.surface}ee 100%
            )
          `,
          border: `1px solid ${theme.colors.primary}15`,
          backdropFilter: 'blur(24px) saturate(1.8)',
          boxShadow: `
            0 20px 60px ${theme.colors.shadowHeavy},
            0 8px 24px ${theme.colors.primary}08
          `
        }}
      >
        {/* Noise grain overlay */}
        <div
          className="absolute inset-0 opacity-3 pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='200' height='200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3Cfilter%3E%3Crect width='200' height='200' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
            filter: 'contrast(1.2) brightness(1.1)'
          }}
        />

        <div className="p-6 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{
                  background: `${theme.colors.primary}20`,
                  border: `1px solid ${theme.colors.primary}30`
                }}
              >
                <svg
                  className="w-6 h-6"
                  style={{ color: theme.colors.primary }}
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                </svg>
              </div>
              <h3 className="text-xl font-bold" style={{ color: theme.colors.textPrimary }}>
                Coming Soon
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg transition-all duration-300 hover:scale-[1.05]"
              style={{
                background: `${theme.colors.surface}60`,
                border: `1px solid ${theme.colors.border}`
              }}
            >
              <svg className="w-5 h-5" style={{ color: theme.colors.textSecondary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="space-y-4">
            <div className="text-center">
              <div className="text-2xl font-bold mb-2" style={{ color: theme.colors.textPrimary }}>
                {action}
              </div>
              <p className="text-sm" style={{ color: theme.colors.textSecondary }}>
                is coming soon!
              </p>
            </div>

            {/* Info Box */}
            <div className="p-4 rounded-xl" style={{
              background: `${theme.colors.primary}10`,
              border: `1px solid ${theme.colors.primary}20`
            }}>
              <div className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 flex-shrink-0 mt-0.5"
                  style={{ color: theme.colors.primary }}
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/>
                </svg>
                <div>
                  <h4 className="font-medium text-sm mb-1" style={{ color: theme.colors.primary }}>
                    What does this mean?
                  </h4>
                  <p className="text-xs leading-relaxed" style={{ color: theme.colors.textSecondary }}>
                    We're working hard to bring you the best staking experience. This feature will be available shortly with competitive rewards and enhanced security.
                  </p>
                </div>
              </div>
            </div>

            {/* Timeline */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs" style={{ color: theme.colors.textMuted }}>
                <span>🚀 Under Development</span>
                <span>🔒 Security First</span>
              </div>
              <div className="flex items-center justify-between text-xs" style={{ color: theme.colors.textMuted }}>
                <span>⭐ High Rewards</span>
                <span>🛡️ Audited</span>
              </div>
            </div>

            {/* Get Updates */}
            <div className="p-4 rounded-xl" style={{
              background: `${theme.colors.surface}40`,
              border: `1px solid ${theme.colors.border}`
            }}>
              <div className="flex items-center gap-2 mb-2">
                <svg
                  className="w-4 h-4"
                  style={{ color: theme.colors.success }}
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"/>
                </svg>
                <span className="font-medium text-sm" style={{ color: theme.colors.textPrimary }}>
                  Stay Updated
                </span>
              </div>
              <p className="text-xs" style={{ color: theme.colors.textSecondary }}>
                Follow our social media channels for the latest updates on launch dates and early bird rewards.
              </p>
            </div>
          </div>

          {/* Close Button */}
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl font-bold transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
            style={{
              background: `
                linear-gradient(135deg,
                  ${theme.colors.primary} 0%,
                  ${theme.colors.primaryHover} 100%
                )
              `,
              border: `1px solid ${theme.colors.primary}30`,
              boxShadow: `0 8px 24px ${theme.colors.primary}30`,
              color: theme.name === 'stealth' ? '#000000' : 'white'
            }}
          >
            Got it, thanks!
          </button>
        </div>
      </div>
    </div>
  )
}
