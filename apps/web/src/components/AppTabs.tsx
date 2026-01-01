'use client'

import { useState, useEffect } from 'react'
import Tabs from './ui/Tabs'
import { SwapComponent } from './SwapComponent'
import Settings from './Settings'
import { HistoryTab } from './HistoryTab'
import { WavePortal } from './Bridge/WavePortalNew'
import { WaveStake } from './Stake/WaveStake'
import { CleanWalletButton } from '@/components/Wallets/CleanWalletButton'
import { HeliusSearchBar } from './HeliusSearchBar'

// Import icons for each tab
import {
  ArrowPathIcon,
  ClockIcon,
  LinkIcon,
  SparklesIcon,
  CurrencyDollarIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline'
import { Switch } from '@headlessui/react'
import { useThemeConfig, createGlassStyles } from '@/lib/theme'
import { Modal } from '@/components/ui/Modal'

interface TabContentProps {
  tabId: string
  privacyMode: boolean
}

function TabContent({ tabId, privacyMode }: TabContentProps) {
  const [showInfoModal, setShowInfoModal] = useState(false)
  const [showBridgeInfoModal, setShowBridgeInfoModal] = useState(false)
  const theme = useThemeConfig()
  switch (tabId) {
    case 'swap':
      return (
        <div className="w-full">
          {/* Header Section - between tabs and swap component */}
          <div className="w-full max-w-xs sm:max-w-md md:max-w-lg lg:max-w-xl mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-5">
            <div className="flex items-center justify-between">
              <div>
                <h2
                  className="text-xl sm:text-2xl font-bold"
                  style={{ color: theme.colors.textPrimary }}
                >
                  Encrypted Swap
                </h2>
                <div className="flex items-center gap-1 mt-1">
                  <span
                    className="text-xs sm:text-sm"
                    style={{ color: theme.colors.textMuted }}
                  >
                    Powered by
                  </span>
                  <a
                    href="https://app.encifher.io/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs sm:text-sm font-medium transition-all duration-200 hover:opacity-80"
                    style={{ color: theme.colors.primary }}
                  >
                    Encifher
                  </a>
                </div>
              </div>

              {/* Info Button */}
              <button
                onClick={() => setShowInfoModal(true)}
                className="p-2 rounded-lg transition-all duration-200 hover:scale-105"
                style={{
                  ...createGlassStyles(theme),
                  border: `1px solid ${theme.colors.primary}20`,
                  background: `${theme.colors.primary}10`
                }}
              >
                <InformationCircleIcon
                  className="h-5 w-5"
                  style={{ color: theme.colors.primary }}
                />
              </button>
            </div>
          </div>

          <SwapComponent privacyMode={privacyMode} />

          {/* Info Modal */}
          <Modal
            isOpen={showInfoModal}
            onClose={() => setShowInfoModal(false)}
            title="WaveSwap Information"
          >
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2" style={{ color: theme.colors.textPrimary }}>
                  How WaveSwap Works
                </h3>
                <div className="space-y-3 text-sm" style={{ color: theme.colors.textSecondary }}>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: `${theme.colors.primary}20`, color: theme.colors.primary }}>
                      <span className="text-xs font-bold">1</span>
                    </div>
                    <p>
                      <strong>Connect Your Wallet:</strong> Start by connecting your Solana wallet to WaveSwap. We support Phantom, Solflare, and other popular wallets.
                    </p>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: `${theme.colors.primary}20`, color: theme.colors.primary }}>
                      <span className="text-xs font-bold">2</span>
                    </div>
                    <p>
                      <strong>Choose Your Mode:</strong> Select between Public mode (transparent on-chain swaps) or Private mode (enhanced privacy with encryption).
                    </p>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: `${theme.colors.primary}20`, color: theme.colors.primary }}>
                      <span className="text-xs font-bold">3</span>
                    </div>
                    <p>
                      <strong>Select Tokens:</strong> Choose the tokens you want to swap from and to. We support a wide variety of Solana tokens with real-time price feeds.
                    </p>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: `${theme.colors.primary}20`, color: theme.colors.primary }}>
                      <span className="text-xs font-bold">4</span>
                    </div>
                    <p>
                      <strong>Enter Amount:</strong> Input the amount you want to swap. Our interface will show you the estimated output and current exchange rate.
                    </p>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: `${theme.colors.primary}20`, color: theme.colors.primary }}>
                      <span className="text-xs font-bold">5</span>
                    </div>
                    <p>
                      <strong>Review & Swap:</strong> Review the transaction details, including fees and exchange rate, then click "Swap" to execute your trade.
                    </p>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: `${theme.colors.primary}20`, color: theme.colors.primary }}>
                      <span className="text-xs font-bold">6</span>
                    </div>
                    <p>
                      <strong>Confirmation:</strong> Approve the transaction in your wallet. Your swap will be executed instantly on the Solana blockchain.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl" style={{ background: `${theme.colors.info}05`, border: `1px solid ${theme.colors.info}20` }}>
                <h4 className="font-semibold mb-2 flex items-center gap-2" style={{ color: theme.colors.info }}>
                  <SparklesIcon className="h-4 w-4" />
                  Privacy & Security
                </h4>
                <ul className="text-xs space-y-1" style={{ color: theme.colors.textMuted }}>
                  <li>• <strong>Private Mode:</strong> Enhanced encryption protects your transaction details</li>
                  <li>• <strong>Public Mode:</strong> Standard transparent swaps on the Solana blockchain</li>
                  <li>• <strong>Non-Custodial:</strong> You always maintain control of your funds</li>
                  <li>• <strong>Audited:</strong> Our smart contracts are regularly security audited</li>
                </ul>
              </div>

              <div className="p-4 rounded-xl" style={{ background: `${theme.colors.success}05`, border: `1px solid ${theme.colors.success}20` }}>
                <h4 className="font-semibold mb-2" style={{ color: theme.colors.success }}>
                  Why Choose WaveSwap?
                </h4>
                <ul className="text-xs space-y-1" style={{ color: theme.colors.textMuted }}>
                  <li>• Best-in-class exchange rates through Jupiter aggregator</li>
                  <li>• Lightning-fast swaps on Solana's high-speed blockchain</li>
                  <li>• Minimal fees and maximum capital efficiency</li>
                  <li>• User-friendly interface with advanced privacy options</li>
                </ul>
              </div>

              <div className="pt-4 border-t text-center" style={{ borderColor: theme.colors.border }}>
                <p className="text-xs mb-2" style={{ color: theme.colors.textMuted }}>
                  Powered by
                </p>
                <a
                  href="https://app.encifher.io/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium transition-all duration-200 hover:opacity-80"
                  style={{ color: theme.colors.primary }}
                >
                  Encifher
                </a>
              </div>
            </div>
          </Modal>
        </div>
      )

    case 'bridge':
      return (
        <div className="w-full">
          {/* Header Section - between tabs and bridge component */}
          <div className="w-full max-w-xs sm:max-w-md md:max-w-lg lg:max-w-xl mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-5">
            <div className="flex items-center justify-between">
              <div>
                <h2
                  className="text-xl sm:text-2xl font-bold"
                  style={{ color: theme.colors.textPrimary }}
                >
                  Bridge
                </h2>
                <div className="flex items-center gap-1 mt-1">
                  <span
                    className="text-xs sm:text-sm"
                    style={{ color: theme.colors.textMuted }}
                  >
                    Powered by
                  </span>
                  <a
                    href="https://near-intents.org/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs sm:text-sm font-medium transition-all duration-200 hover:opacity-80"
                    style={{ color: theme.colors.primary }}
                  >
                    NEAR
                  </a>
                  <span
                    className="text-xs sm:text-sm"
                    style={{ color: theme.colors.textMuted }}
                  >
                    and
                  </span>
                  <a
                    href="https://starkgate.starknet.io/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs sm:text-sm font-medium transition-all duration-200 hover:opacity-80"
                    style={{ color: theme.colors.primary }}
                  >
                    Starknet
                  </a>
                </div>
              </div>

              {/* Info Button */}
              <button
                onClick={() => setShowBridgeInfoModal(true)}
                className="p-2 rounded-lg transition-all duration-200 hover:scale-105"
                style={{
                  ...createGlassStyles(theme),
                  border: `1px solid ${theme.colors.primary}20`,
                  background: `${theme.colors.primary}10`
                }}
              >
                <InformationCircleIcon
                  className="h-5 w-5"
                  style={{ color: theme.colors.primary }}
                />
              </button>
            </div>
          </div>

          <div className="w-full flex justify-center">
            <WavePortal privacyMode={privacyMode} comingSoon={false} />
          </div>

          {/* Bridge Info Modal */}
          <Modal
            isOpen={showBridgeInfoModal}
            onClose={() => setShowBridgeInfoModal(false)}
            title="WavePortal Bridge Information"
          >
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2" style={{ color: theme.colors.textPrimary }}>
                  Bringing Liquidity to Solana
                </h3>
                <p className="text-sm mb-4" style={{ color: theme.colors.textSecondary }}>
                  WavePortal is designed to bring liquidity back to Solana from other blockchains, enabling users from Zcash and Starknet ecosystems to access Solana's high-performance DeFi landscape.
                </p>
              </div>

              <div className="space-y-3 text-sm" style={{ color: theme.colors.textSecondary }}>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: `${theme.colors.primary}20`, color: theme.colors.primary }}>
                    <span className="text-xs font-bold">1</span>
                  </div>
                  <p>
                    <strong>Cross-Chain Access:</strong> Bridge your assets from Zcash and Starknet to Solana, gaining access to the fastest and most efficient DeFi ecosystem.
                  </p>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: `${theme.colors.primary}20`, color: theme.colors.primary }}>
                    <span className="text-xs font-bold">2</span>
                  </div>
                  <p>
                    <strong>Liquidity Expansion:</strong> Our bridge brings external liquidity into Solana, strengthening the ecosystem and providing more trading opportunities for all users.
                  </p>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: `${theme.colors.primary}20`, color: theme.colors.primary }}>
                    <span className="text-xs font-bold">3</span>
                  </div>
                  <p>
                    <strong>Privacy-Preserving:</strong> Zcash users can maintain their privacy while accessing Solana's DeFi protocols, bringing private capital into public markets.
                  </p>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: `${theme.colors.primary}20`, color: theme.colors.primary }}>
                    <span className="text-xs font-bold">4</span>
                  </div>
                  <p>
                    <strong>Starknet Integration:</strong> Leverage Starknet's Layer 2 scaling solutions to efficiently move assets to Solana with minimal fees and fast finality.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl" style={{ background: `${theme.colors.info}05`, border: `1px solid ${theme.colors.info}20` }}>
                <h4 className="font-semibold mb-2 flex items-center gap-2" style={{ color: theme.colors.info }}>
                  <LinkIcon className="h-4 w-4" />
                  Supported Tokens
                </h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs" style={{ color: theme.colors.textMuted }}>
                    <span><strong>SOL</strong> - Solana's native token for staking and governance</span>
                  </div>
                  <div className="flex items-center justify-between text-xs" style={{ color: theme.colors.textMuted }}>
                    <span><strong>USDC</strong> - Circle's stablecoin for stable value transfers</span>
                  </div>
                  <div className="flex items-center justify-between text-xs" style={{ color: theme.colors.textMuted }}>
                    <span><strong>USDT</strong> - Tether's stablecoin for trading and liquidity</span>
                  </div>
                  <div className="flex items-center justify-between text-xs" style={{ color: theme.colors.textMuted }}>
                    <span><strong>ZEC</strong> - Zcash's privacy-focused cryptocurrency</span>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl" style={{ background: `${theme.colors.success}05`, border: `1px solid ${theme.colors.success}20` }}>
                <h4 className="font-semibold mb-2" style={{ color: theme.colors.success }}>
                  Why Bridge to Solana?
                </h4>
                <ul className="text-xs space-y-1" style={{ color: theme.colors.textMuted }}>
                  <li>• Lightning-fast transactions with sub-second finality</li>
                  <li>• Extremely low fees compared to other blockchains</li>
                  <li>• Access to a thriving DeFi ecosystem with 500+ protocols</li>
                  <li>• Advanced trading features and high liquidity pools</li>
                  <li>• Cross-chain composability and innovative dApps</li>
                </ul>
              </div>

              <div className="pt-4 border-t text-center" style={{ borderColor: theme.colors.border }}>
                <p className="text-xs mb-2" style={{ color: theme.colors.textMuted }}>
                  Powered by
                </p>
                <div className="flex items-center justify-center gap-2">
                  <a
                    href="https://near-intents.org/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium transition-all duration-200 hover:opacity-80"
                    style={{ color: theme.colors.primary }}
                  >
                    NEAR
                  </a>
                  <span
                    className="text-sm"
                    style={{ color: theme.colors.textMuted }}
                  >
                    and
                  </span>
                  <a
                    href="https://starkgate.starknet.io/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium transition-all duration-200 hover:opacity-80"
                    style={{ color: theme.colors.primary }}
                  >
                    Starknet
                  </a>
                </div>
              </div>
            </div>
          </Modal>
        </div>
      )

    case 'stake':
      return (
        <div className="w-full flex justify-center">
          <WaveStake privacyMode={privacyMode} />
        </div>
      )

    case 'history':
      return (
        <div className="w-full flex justify-center">
          <HistoryTab privacyMode={privacyMode} />
        </div>
      )

    default:
      return null
  }
}

import { usePrivacyMode } from '@/contexts/PrivacyContext'

export function AppTabs() {
  const [activeTab, setActiveTab] = useState('swap')
  const { privacyMode, setPrivacyMode } = usePrivacyMode()
  const theme = useThemeConfig()

  const tabs = [
    {
      id: 'swap',
      label: 'WaveSwap',
      icon: <ArrowPathIcon className="h-4 w-4" />
    },
    {
      id: 'bridge',
      label: 'WavePortal',
      icon: <img src="/portal.svg" alt="WavePortal" className="h-4 w-4" style={{ minWidth: '16px', minHeight: '16px' }} />
    },
    {
      id: 'stake',
      label: 'WaveStake',
      icon: <CurrencyDollarIcon className="h-4 w-4" />
    },
    {
      id: 'history',
      label: 'History',
      icon: <ClockIcon className="h-4 w-4" />
    }
  ]

  // Apply theme changes based on privacy mode
  useEffect(() => {
    const root = document.documentElement
    if (privacyMode) {
      root.classList.add('privacy-mode')
    } else {
      root.classList.remove('privacy-mode')
    }
  }, [privacyMode])

  return (
    <div
      className="min-h-screen relative"
    >
      {/* Regular gradient overlay for light/dark modes only */}
      {theme.name !== 'stealth' && (
        <div
          className="absolute inset-0"
          style={{
            opacity: theme.name === 'light' ? 0.6 : 0.4,
            background: theme.name === 'light'
              ? `radial-gradient(circle at 20% 50%, rgba(33, 188, 255, 0.15) 0%, rgba(33, 188, 255, 0.05) 30%, transparent 50%),
                  radial-gradient(circle at 80% 20%, rgba(74, 74, 255, 0.12) 0%, rgba(74, 74, 255, 0.03) 35%, transparent 50%),
                  radial-gradient(circle at 40% 80%, rgba(6, 182, 212, 0.10) 0%, rgba(6, 182, 212, 0.02) 40%, transparent 50%),
                  radial-gradient(circle at 60% 30%, rgba(33, 188, 255, 0.08) 0%, transparent 40%)`
              : `radial-gradient(circle at 20% 50%, rgba(33, 188, 255, 0.25) 0%, transparent 50%),
                  radial-gradient(circle at 80% 20%, rgba(46, 46, 209, 0.20) 0%, transparent 50%),
                  radial-gradient(circle at 40% 80%, rgba(25, 153, 212, 0.18) 0%, transparent 50%),
                  radial-gradient(circle at 60% 30%, rgba(0, 191, 255, 0.15) 0%, transparent 40%)`,
            animation: 'gradientFloat 20s ease-in-out infinite'
          }}
        />
      )}

      {/* Additional gradient layer for light/dark modes only */}
      {theme.name !== 'stealth' && (
        <div
          className="absolute inset-0"
          style={{
            opacity: theme.name === 'light' ? 0.3 : 0.2,
            background: theme.name === 'light'
              ? `linear-gradient(45deg,
                  rgba(33, 188, 255, 0.05) 0%,
                  rgba(74, 74, 255, 0.08) 25%,
                  rgba(6, 182, 212, 0.06) 50%,
                  rgba(33, 188, 255, 0.04) 75%,
                  rgba(74, 74, 255, 0.07) 100%)`
              : `linear-gradient(45deg, rgba(33, 188, 255, 0.08) 0%, rgba(46, 46, 209, 0.12) 25%, rgba(0, 191, 255, 0.10) 50%, rgba(33, 188, 255, 0.08) 75%, rgba(46, 46, 209, 0.12) 100%)`,
            animation: 'gradientFloat 25s ease-in-out infinite reverse'
          }}
        />
      )}

      {/* Stealth Mode - Three separate black and white animated blobs */}
      {theme.name === 'stealth' && (
        <>
          {/* Large blob - top left */}
          <div
            className="absolute w-96 h-96 rounded-full"
            style={{
              top: '10%',
              left: '5%',
              background: 'radial-gradient(circle, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.01) 40%, transparent 70%)',
              filter: 'blur(40px)',
              animation: 'stealthBlob1 20s ease-in-out infinite',
              zIndex: 1
            }}
          />

          {/* Medium blob - bottom right */}
          <div
            className="absolute w-80 h-80 rounded-full"
            style={{
              bottom: '15%',
              right: '10%',
              background: 'radial-gradient(circle, rgba(200, 200, 200, 0.03) 0%, rgba(200, 200, 200, 0.01) 50%, transparent 70%)',
              filter: 'blur(30px)',
              animation: 'stealthBlob2 25s ease-in-out infinite',
              zIndex: 1
            }}
          />

          {/* Small blob - middle right */}
          <div
            className="absolute w-64 h-64 rounded-full"
            style={{
              top: '45%',
              right: '25%',
              background: 'radial-gradient(circle, rgba(180, 180, 180, 0.05) 0%, rgba(180, 180, 180, 0.02) 40%, transparent 70%)',
              filter: 'blur(25px)',
              animation: 'stealthBlob3 30s ease-in-out infinite',
              zIndex: 1
            }}
          />
        </>
      )}

      {/* Background image overlay for dark theme */}
      {theme.name === 'dark' && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `url("/bg.jpg")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            filter: 'blur(20px) saturate(1.2) brightness(0.3)',
            opacity: 0.4,
            zIndex: 2
          }}
        />
      )}

      {/* Subtle noise texture overlay - theme-aware (exclude stealth and dark modes) */}
      {theme.name !== 'stealth' && theme.name !== 'dark' && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            opacity: theme.name === 'light' ? 0.03 : 0.05,
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='200' height='200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3Cfilter%3E%3Crect width='200' height='200' filter='url(%23noise)' opacity='0.5'/%3E%3C/svg%3E")`,
            mixBlendMode: theme.name === 'light' ? 'soft-light' : 'overlay',
            zIndex: 2
          }}
        />
      )}

      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <header
          className="sticky top-0 z-50"
          style={{
            ...createGlassStyles(theme),
            backdropFilter: 'blur(20px) saturate(180%)',
            borderBottom: `1px solid ${theme.name === 'ghost' ? theme.colors.primaryBorder : theme.colors.border}`,
            background: theme.name === 'ghost'
              ? 'linear-gradient(135deg, rgba(255, 253, 248, 0.95) 0%, rgba(226, 223, 254, 0.9) 25%, rgba(255, 253, 248, 0.92) 50%, rgba(171, 159, 242, 0.88) 75%, rgba(255, 253, 248, 0.95) 100%)'
              : createGlassStyles(theme).background
          }}
        >
                    <div className="container mx-auto px-3 sm:px-4 md:px-6 py-3 sm:py-4 relative z-10">
            <div className="flex items-center justify-between">
              {/* Logo - Optimized for all screens */}
              <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3">
                <div className="relative">
                  <img
                    src={theme.name === 'stealth' ? '/wave-stealth.png' : theme.name === 'ghost' ? '/wave-ghost.jpg' : '/wave0.png'}
                    alt="WaveSwap Logo"
                    className="w-6 h-6 xs:w-7 xs:h-7 sm:w-9 sm:h-9 md:w-10 md:h-10 lg:w-11 lg:h-11 rounded-xl shadow-lg transition-all duration-200"
                  />
                </div>
                <div className="hidden xs:block">
                  <h1
                    className="text-sm xs:text-base sm:text-lg md:text-xl font-bold italic font-work-sans"
                    style={{ color: theme.colors.textPrimary }}
                  >
                    WAVETEK &#127754;
                  </h1>
                  <p
                    className="text-xs hidden md:block"
                    style={{ color: theme.colors.textMuted }}
                  >
                    Private. Secure. Fast.
                  </p>
                </div>
                {/* Mobile logo fallback - just WAVETEK */}
                <div className="xs:hidden">
                  <h1
                    className="text-sm font-bold italic font-work-sans"
                    style={{ color: theme.colors.textPrimary }}
                  >
                    WAVETEK &#127754;
                  </h1>
                </div>
              </div>

              <HeliusSearchBar />

              {/* Right side controls - Responsive layout */}
              <div className="flex items-center gap-1 sm:gap-2 md:gap-4">
                {/* Network Selector - Hide on small mobile */}
                {/* <div className="hidden sm:block">
                  <NetworkSelector />
                </div> */}

                {/* Privacy Mode Toggle - Compact on mobile */}
                <div className="flex items-center">
                  <div
                    className="relative flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl overflow-hidden transition-all duration-300 hover:scale-[1.02]"
                    style={{
                      ...createGlassStyles(theme),
                      border: `1px solid ${privacyMode ? `${theme.colors.success}30` : theme.name === 'ghost' ? `${theme.colors.primaryBorder}50` : `${theme.colors.primary}10`}`,
                      backdropFilter: 'blur(20px) saturate(1.8)',
                      boxShadow: privacyMode
                        ? `0 8px 24px ${theme.colors.success}15, inset 0 1px 0 rgba(255, 255, 255, 0.1)`
                        : theme.name === 'ghost'
                        ? `0 8px 24px ${theme.colors.purpleShadow || theme.colors.shadow}, inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 0 0 1px ${theme.colors.primaryBorder}20`
                        : `0 8px 32px ${theme.colors.shadow}, inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 0 0 1px ${theme.colors.primary}05`
                    }}
                  >
                    
                    <div className="relative z-10 flex items-center gap-1 sm:gap-2">
                      <SparklesIcon
                        className="h-3 w-3 sm:h-4 sm:w-4 transition-all duration-300"
                        style={{
                          color: privacyMode ? theme.colors.success : theme.colors.primary,
                          filter: privacyMode
                            ? `drop-shadow(0 0 8px ${theme.colors.success}40)`
                            : `drop-shadow(0 0 8px ${theme.colors.primary}30)`
                        }}
                      />
                      <span
                        className="text-xs mr-2 font-medium transition-all duration-300"
                        style={{
                          color: privacyMode ? theme.colors.textPrimary : theme.name === 'ghost' ? theme.colors.primary : theme.colors.textSecondary,
                          fontFamily: 'var(--font-helvetica)',
                          letterSpacing: '0.025em',
                          textShadow: privacyMode
                            ? `0 0 10px ${theme.colors.success}30`
                            : theme.name === 'ghost'
                            ? `0 0 8px ${theme.colors.primary}20`
                            : 'none'
                        }}
                      >
                        Private
                      </span>
                      <Switch
                        checked={privacyMode}
                        onChange={setPrivacyMode}
                        className="relative inline-flex h-3 w-5 sm:h-4 sm:w-7 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent z-10"
                        style={{
                          backgroundColor: privacyMode
                            ? `${theme.colors.success}80`
                            : theme.name === 'ghost'
                            ? `${theme.colors.primary}60`
                            : `${theme.colors.error}80`,
                          boxShadow: privacyMode
                            ? `0 0 0 1px ${theme.colors.success}20, inset 0 1px 0 rgba(255, 255, 255, 0.2)`
                            : theme.name === 'ghost'
                            ? `0 0 0 1px ${theme.colors.primaryBorder}40, inset 0 1px 0 rgba(255, 255, 255, 0.2)`
                            : `0 0 0 1px ${theme.colors.error}20, inset 0 1px 0 rgba(255, 255, 255, 0.1)`
                        }}
                      >
                        <span className="sr-only">Toggle privacy mode</span>
                        <span
                          className={`inline-block h-1.5 w-1.5 sm:h-2 sm:w-2 transform rounded-full bg-white transition-all duration-300 ${privacyMode ? 'translate-x-3 sm:translate-x-4' : 'translate-x-0.5'}`}
                          style={{
                            boxShadow: privacyMode
                              ? `0 2px 4px rgba(0, 0, 0, 0.2), 0 0 8px ${theme.colors.success}30`
                              : theme.name === 'ghost'
                              ? `0 2px 4px rgba(0, 0, 0, 0.15), 0 0 10px ${theme.colors.primary}40`
                              : `0 2px 4px rgba(0, 0, 0, 0.2), 0 0 8px ${theme.colors.error}30`
                          }}
                        />
                      </Switch>
                    </div>

                    {/* Privacy mode glow effect */}
                    {privacyMode && (
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          background: `radial-gradient(circle at 50% 50%, ${theme.colors.success}15 0%, transparent 70%)`,
                          filter: 'blur(8px)'
                        }}
                      />
                    )}
                  </div>
                </div>

                <Settings />

                {/* Solana Wallet Connect Button - Show on larger screens */}
                <div className="hidden md:block">
                  <CleanWalletButton />
                </div>

                {/* Mobile wallet button - smaller version */}
                <div className="md:hidden">
                  <CleanWalletButton />
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="container mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8">
          <div className="w-full max-w-6xl mx-auto">
            {/* Tab Navigation with constrained width */}
            <div className="w-full max-w-xs sm:max-w-md md:max-w-lg lg:max-w-xl mx-auto mb-6 sm:mb-8">
              <Tabs
                tabs={tabs}
                defaultTab="swap"
                onTabChange={setActiveTab}
                className="w-full"
              />
            </div>

            {/* Tab Content */}
            <TabContent tabId={activeTab} privacyMode={privacyMode} />
          </div>
        </main>
      </div>
    </div>
  )
}

export default AppTabs