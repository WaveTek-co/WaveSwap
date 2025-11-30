'use client'

import { useState, useEffect } from 'react'
import Tabs from './ui/Tabs'
import { SwapComponent } from './SwapComponent'
import { NetworkSelector } from './SwapComponent/NetworkSelector'
import Settings from './Settings'
import { HistoryTab } from './HistoryTab'
import { WavePortal } from './Bridge/WavePortalNew'
import { WaveStake } from './Stake/WaveStake'
import { CleanWalletButton } from '@/components/Wallets/CleanWalletButton'

// Import icons for each tab
import {
  ArrowPathIcon,
  ClockIcon,
  LinkIcon,
  SparklesIcon,
  CurrencyDollarIcon
} from '@heroicons/react/24/outline'
import { Switch } from '@headlessui/react'
import { useThemeConfig, createGlassStyles } from '@/lib/theme'

interface TabContentProps {
  tabId: string
  privacyMode: boolean
}

function TabContent({ tabId, privacyMode }: TabContentProps) {
  switch (tabId) {
    case 'swap':
      return (
        <div className="w-full">
          <SwapComponent privacyMode={privacyMode} />
        </div>
      )

    case 'bridge':
      return (
        <div className="w-full flex justify-center">
          <WavePortal privacyMode={privacyMode} comingSoon={false} />
        </div>
      )

    case 'stake':
      return (
        <div className="w-full flex justify-center">
          <WaveStake privacyMode={privacyMode} comingSoon={false} />
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

      {/* Subtle noise texture overlay - theme-aware (exclude stealth mode) */}
      {theme.name !== 'stealth' && (
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
          {/* Noise overlay for header - theme-aware */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              opacity: theme.name === 'light' ? 0.02 : theme.name === 'ghost' ? 0.04 : 0.03,
              backgroundImage: theme.name === 'ghost'
                ? `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='1.5'/%3E%3CfeColorMatrix type='matrix' values='1 0 0 0 0.67 0 1 0 0 0.63 0 0 1 0 0.95 0 0 0 1 0'/%3E%3Cfilter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='0.15'/%3E%3C/svg%3E")`
                : `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3Cfilter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='0.1'/%3E%3C/svg%3E")`,
              mixBlendMode: theme.name === 'ghost' ? 'soft-light' : theme.name === 'light' ? 'soft-light' : 'overlay'
            }}
          />
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

              {/* Right side controls - Responsive layout */}
              <div className="flex items-center gap-1 sm:gap-2 md:gap-4">
                {/* Network Selector - Hide on small mobile */}
                <div className="hidden sm:block">
                  <NetworkSelector />
                </div>

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
                    {/* Noise grain overlay - theme-aware */}
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        opacity: theme.name === 'light' ? 0.01 : 0.03,
                        backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3Cfilter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
                        filter: theme.name === 'light' ? 'contrast(1.1) brightness(1.05)' : 'contrast(1.3) brightness(1.1)'
                      }}
                    />

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