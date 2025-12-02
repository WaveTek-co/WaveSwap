'use client'

import { useState, useEffect } from 'react'
import { CleanWalletButton } from '@/components/Wallets/CleanWalletButton'
import { HeliusSearchBar } from './HeliusSearchBar'
import Settings from '@/components/Settings'
import { SparklesIcon } from '@heroicons/react/24/outline'
import { Switch } from '@headlessui/react'
import { useThemeConfig, createGlassStyles } from '@/lib/theme'

interface AppHeaderProps {
  privacyMode?: boolean
  onPrivacyModeChange?: (enabled: boolean) => void
  showSearch?: boolean
  showSettings?: boolean
  showWallet?: boolean
  showPrivacy?: boolean
}

export function AppHeader({
  privacyMode = false,
  onPrivacyModeChange,
  showSearch = true,
  showSettings = true,
  showWallet = true,
  showPrivacy = true
}: AppHeaderProps) {
  const theme = useThemeConfig()
  const [internalPrivacyMode, setInternalPrivacyMode] = useState(privacyMode)

  const handlePrivacyModeChange = (enabled: boolean) => {
    setInternalPrivacyMode(enabled)
    onPrivacyModeChange?.(enabled)
  }

  useEffect(() => {
    if (privacyMode !== internalPrivacyMode) {
      setInternalPrivacyMode(privacyMode)
    }
  }, [privacyMode, internalPrivacyMode])

  return (
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
          {/* Logo */}
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
            <div className="xs:hidden">
              <h1
                className="text-sm font-bold italic font-work-sans"
                style={{ color: theme.colors.textPrimary }}
              >
                WAVETEK &#127754;
              </h1>
            </div>
          </div>

          {showSearch && <HeliusSearchBar />}

          {/* Right side controls */}
          <div className="flex items-center gap-1 sm:gap-2 md:gap-4">
            {/* Privacy Mode Toggle */}
            {showPrivacy && (
              <div className="flex items-center">
                <div
                  className="relative flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl overflow-hidden transition-all duration-300 hover:scale-[1.02]"
                  style={{
                    ...createGlassStyles(theme),
                    border: `1px solid ${internalPrivacyMode ? `${theme.colors.success}30` : theme.name === 'ghost' ? `${theme.colors.primaryBorder}50` : `${theme.colors.primary}10`}`,
                    backdropFilter: 'blur(20px) saturate(1.8)',
                  }}
                >
                  <div className="relative z-10 flex items-center gap-1 sm:gap-2">
                    <SparklesIcon
                      className="h-3 w-3 sm:h-4 sm:w-4 transition-all duration-300"
                      style={{
                        color: internalPrivacyMode ? theme.colors.success : theme.colors.primary,
                      }}
                    />
                    <span
                      className="text-xs mr-2 font-medium transition-all duration-300"
                      style={{
                        color: internalPrivacyMode ? theme.colors.textPrimary : theme.name === 'ghost' ? theme.colors.primary : theme.colors.textSecondary,
                        fontFamily: 'var(--font-helvetica)',
                        letterSpacing: '0.025em',
                      }}
                    >
                      Private
                    </span>
                    <Switch
                      checked={internalPrivacyMode}
                      onChange={handlePrivacyModeChange}
                      className="relative inline-flex h-3 w-5 sm:h-4 sm:w-7 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent z-10"
                      style={{
                        backgroundColor: internalPrivacyMode
                          ? `${theme.colors.success}80`
                          : theme.name === 'ghost'
                          ? `${theme.colors.primary}60`
                          : `${theme.colors.error}80`,
                      }}
                    >
                      <span className="sr-only">Toggle privacy mode</span>
                      <span
                        className={`inline-block h-1.5 w-1.5 sm:h-2 sm:w-2 transform rounded-full bg-white transition-all duration-300 ${internalPrivacyMode ? 'translate-x-3 sm:translate-x-4' : 'translate-x-0.5'}`}
                      />
                    </Switch>
                  </div>
                </div>
              </div>
            )}

            {showSettings && <Settings />}

            {showWallet && (
              <>
                <div className="hidden md:block">
                  <CleanWalletButton />
                </div>
                <div className="md:hidden">
                  <CleanWalletButton />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}