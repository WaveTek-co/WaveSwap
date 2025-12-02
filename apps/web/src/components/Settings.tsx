'use client'

import { useState, useRef, useEffect } from 'react'
import { Switch } from '@headlessui/react'
import {
  ChevronUpIcon,
  Cog6ToothIcon,
  ShieldCheckIcon,
  GlobeAltIcon,
  SparklesIcon,
  BellIcon,
  MoonIcon,
  SunIcon,
  ChartBarIcon,
  AdjustmentsHorizontalIcon,
  InformationCircleIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline'
import { useTheme } from '@/contexts/ThemeContext'
import { useThemeConfig, createGlassStyles } from '@/lib/theme'
import { useTerms } from '@/contexts/TermsContext'

export function Settings() {
  const { theme, setLightTheme, setDarkTheme, setStealthTheme, setGhostTheme } = useTheme()
  const themeConfig = useThemeConfig()
  const { hasAcceptedTerms, setShowTermsModal } = useTerms()
  const [isOpen, setIsOpen] = useState(false)
  const [notifications, setNotifications] = useState(true)
  const [slippage, setSlippage] = useState('3')
  const [deadline, setDeadline] = useState('30')
  const [expertMode, setExpertMode] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Settings Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2.5 overflow-hidden rounded-xl transition-all duration-300 border-0 flex items-center gap-2 z-10"
        style={{
          ...createGlassStyles(themeConfig),
          border: `1px solid ${themeConfig.colors.border}`,
          backdropFilter: 'blur(16px) saturate(1.8)',
          boxShadow: `
            0 8px 32px ${themeConfig.colors.shadow},
            inset 0 1px 0 rgba(255, 255, 255, 0.1),
            0 0 0 1px ${themeConfig.colors.primary}10
          `
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = `
            linear-gradient(135deg,
              ${themeConfig.colors.surfaceHover}dd 0%,
              ${themeConfig.colors.surface}cc 50%,
              ${themeConfig.colors.surfaceHover}dd 100%
            ),
            radial-gradient(circle at 30% 30%,
              ${themeConfig.colors.primary}20 0%,
              transparent 50%
            )
          `
          e.currentTarget.style.boxShadow = `
            0 12px 40px ${themeConfig.colors.shadow},
            inset 0 1px 0 rgba(255, 255, 255, 0.2),
            0 0 0 1px ${themeConfig.colors.primary}30
          `
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = createGlassStyles(themeConfig).background as string
          e.currentTarget.style.boxShadow = `
            0 8px 32px ${themeConfig.colors.shadow},
            inset 0 1px 0 rgba(255, 255, 255, 0.1),
            0 0 0 1px ${themeConfig.colors.primary}10
          `
        }}
        title="Settings"
      >
        {/* Noise grain overlay */}
        <div
          className="absolute inset-0 opacity-4 pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='50' height='50' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3Cfilter%3E%3Crect width='50' height='50' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
            filter: 'contrast(1.3) brightness(1.1)'
          }}
        />

        <Cog6ToothIcon className="h-5 w-5 relative z-10" style={{
          color: themeConfig.colors.textPrimary,
          filter: `drop-shadow(0 0 8px ${themeConfig.colors.primary}40)`
        }} />
        <ChevronUpIcon
          className={`h-3 w-3 transition-transform duration-300 relative z-10 ${isOpen ? 'rotate-180' : ''}`}
          style={{ color: themeConfig.colors.textMuted }}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
            className="absolute right-0 top-full mt-2 w-72 xs:w-80 sm:w-96 max-w-[calc(100vw-1rem)] xs:max-w-[calc(100vw-1.5rem)] sm:max-w-[calc(100vw-2rem)] rounded-2xl overflow-hidden"
            style={{
              background: themeConfig.name === 'light'
                ? `
                  linear-gradient(135deg,
                    ${themeConfig.colors.surface}f8 0%,
                    ${themeConfig.colors.surface}f0 25%,
                    ${themeConfig.colors.surface}f8 50%,
                    ${themeConfig.colors.surface}f0 75%,
                    ${themeConfig.colors.surface}f8 100%
                  ),
                  radial-gradient(circle at 25% 25%,
                    ${themeConfig.colors.primary}12 0%,
                    transparent 50%
                  ),
                  radial-gradient(circle at 75% 75%,
                    ${themeConfig.colors.success}10 0%,
                    transparent 50%
                  )
                `
                : `
                  linear-gradient(135deg,
                    ${themeConfig.colors.surface}ee 0%,
                    ${themeConfig.colors.surfaceHover}cc 25%,
                    ${themeConfig.colors.surface}ee 50%,
                    ${themeConfig.colors.surfaceHover}cc 75%,
                    ${themeConfig.colors.surface}ee 100%
                  ),
                  radial-gradient(circle at 25% 25%,
                    ${themeConfig.colors.primary}08 0%,
                    transparent 50%
                  ),
                  radial-gradient(circle at 75% 75%,
                    ${themeConfig.colors.success}06 0%,
                    transparent 50%
                  )
                `,
              border: themeConfig.name === 'light'
                ? `1px solid ${themeConfig.colors.border}`
                : `1px solid ${themeConfig.colors.primary}20`,
              backdropFilter: 'blur(32px) saturate(1.8) contrast(1.05) brightness(1.02)',
              WebkitBackdropFilter: 'blur(32px) saturate(1.8) contrast(1.05) brightness(1.02)', // Safari support
              boxShadow: themeConfig.name === 'light'
                ? `
                  0 25px 60px ${themeConfig.colors.shadowLight}40,
                  0 12px 32px ${themeConfig.colors.primary}20,
                  0 6px 16px ${themeConfig.colors.shadow}30,
                  inset 0 1px 0 rgba(255, 255, 255, 0.5),
                  inset 0 -1px 0 ${themeConfig.colors.shadow}20,
                  0 0 0 1px ${themeConfig.colors.primary}15,
                  0 0 20px ${themeConfig.colors.primary}10
                `
                : `
                  0 30px 80px ${themeConfig.colors.shadow}60,
                  0 15px 40px ${themeConfig.colors.primary}25,
                  0 8px 24px ${themeConfig.colors.shadow}40,
                  inset 0 1px 0 rgba(255, 255, 255, 0.2),
                  inset 0 -1px 0 ${themeConfig.colors.shadow}30,
                  0 0 0 1px ${themeConfig.colors.primary}20,
                  0 0 30px ${themeConfig.colors.primary}15
                `,
              zIndex: 50,
              transform: 'translateZ(0)', // Enable hardware acceleration
              willChange: 'backdrop-filter, transform', // Optimize animations
              animation: 'slideDown 0.3s cubic-bezier(0.4, 0, 0.2, 1) 0s 1 normal none forwards'
            }}
          >
          {/* Noise grain overlay */}
          <div
            className="absolute inset-0 opacity-[0.03] pointer-events-none rounded-2xl"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3Cfilter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
              filter: 'contrast(1.3) brightness(1.1)'
            }}
          />

          {/* Header */}
          <div className="relative z-10 p-3 xs:p-4" style={{
            background: `linear-gradient(135deg, ${themeConfig.colors.primary}15 0%, ${themeConfig.colors.primary}08 50%, ${themeConfig.colors.primary}15 100%)`,
            borderBottom: `1px solid ${themeConfig.colors.border}50`,
            backdropFilter: 'blur(12px) saturate(1.5)'
          }}>
            <div className="flex items-center gap-3">
              <div className="rounded-lg p-2" style={{
                background: `${themeConfig.colors.primary}20`,
                border: `1px solid ${themeConfig.colors.primary}40`
              }}>
                <Cog6ToothIcon className="h-5 w-5" style={{
                  color: themeConfig.colors.primary,
                  filter: `drop-shadow(0 0 8px ${themeConfig.colors.primary}40)`
                }} />
              </div>
              <h2 className="text-lg font-semibold" style={{
                color: themeConfig.colors.textPrimary,
                fontFamily: 'var(--font-helvetica)',
                fontWeight: 600,
                letterSpacing: '0.025em'
              }}>Settings</h2>
            </div>
          </div>

          {/* Settings Content */}
          <div className="relative z-10 p-3 xs:p-4 space-y-4 xs:space-y-6 max-h-80 xs:max-h-96 overflow-y-auto">
            {/* Trading Preferences */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <AdjustmentsHorizontalIcon className="h-4 w-4" style={{ color: themeConfig.colors.primary }} />
                <h3 className="text-xs font-medium uppercase tracking-wider" style={{
                  color: themeConfig.colors.primary,
                  fontFamily: 'var(--font-helvetica)',
                  letterSpacing: '0.05em'
                }}>Trading Preferences</h3>
              </div>

              {/* Expert Mode */}
              <div className="flex items-center justify-between p-3 rounded-xl" style={{
                background: `${themeConfig.colors.primary}08`,
                border: `1px solid ${themeConfig.colors.primary}15`
              }}>
                <div className="flex items-center gap-3">
                  <div className="rounded-lg p-2" style={{
                    background: `${themeConfig.colors.primary}20`,
                    border: `1px solid ${themeConfig.colors.primary}30`
                  }}>
                    <ChartBarIcon className="h-4 w-4" style={{ color: themeConfig.colors.primary }} />
                  </div>
                  <div>
                    <h4 className="font-medium text-sm" style={{ color: themeConfig.colors.textPrimary }}>Expert Mode</h4>
                    <p className="text-xs" style={{ color: themeConfig.colors.textMuted }}>Advanced trading features</p>
                  </div>
                </div>

                <Switch
                  checked={expertMode}
                  onChange={setExpertMode}
                  className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-transparent"
                  style={{
                    backgroundColor: expertMode ? `${themeConfig.colors.primary}cc` : `${themeConfig.colors.surface}`
                  }}
                >
                  <span className="sr-only">Enable expert mode</span>
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${expertMode ? 'translate-x-5' : 'translate-x-1'}`}
                  />
                </Switch>
              </div>
            </div>

            {/* Theme Selection */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <SunIcon className="h-4 w-4" style={{ color: themeConfig.colors.primary }} />
                <h3 className="text-xs font-medium uppercase tracking-wider" style={{
                  color: themeConfig.colors.primary,
                  fontFamily: 'var(--font-helvetica)',
                  letterSpacing: '0.05em'
                }}>Theme</h3>
              </div>

              {/* Theme Options */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 xs:gap-2">
                <button
                  onClick={setLightTheme}
                  className={`relative flex flex-col items-center gap-1.5 xs:gap-2 p-2 xs:p-3 rounded-xl transition-all duration-200 ${
                    theme === 'light' ? '' : ''
                  }`}
                  style={{
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    borderColor: theme === 'light' ? `${themeConfig.colors.warning}50` : `${themeConfig.colors.border}50`,
                    background: theme === 'light'
                      ? `${themeConfig.colors.warning}10`
                      : `${themeConfig.colors.surface}30`,
                    backdropFilter: 'blur(8px) saturate(1.2)'
                  }}
                  onMouseEnter={(e) => {
                    if (theme !== 'light') {
                      e.currentTarget.style.borderColor = `${themeConfig.colors.warning}30`
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (theme !== 'light') {
                      e.currentTarget.style.borderColor = `${themeConfig.colors.border}50`
                    }
                  }}
                >
                  <SunIcon className="h-5 w-5" style={{
                    color: theme === 'light' ? themeConfig.colors.warning : themeConfig.colors.textMuted
                  }} />
                  <span className="text-xs font-medium" style={{
                    color: theme === 'light' ? themeConfig.colors.warning : themeConfig.colors.textMuted,
                    fontFamily: 'var(--font-helvetica)'
                  }}>
                    Light
                  </span>
                  {theme === 'light' && (
                    <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full" style={{ backgroundColor: themeConfig.colors.warning }} />
                  )}
                </button>

                <button
                  onClick={setDarkTheme}
                  className={`relative flex flex-col items-center gap-1.5 xs:gap-2 p-2 xs:p-3 rounded-xl transition-all duration-200 ${
                    theme === 'dark' ? '' : ''
                  }`}
                  style={{
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    borderColor: theme === 'dark' ? `${themeConfig.colors.primary}50` : `${themeConfig.colors.border}50`,
                    background: theme === 'dark'
                      ? `${themeConfig.colors.primary}10`
                      : `${themeConfig.colors.surface}30`,
                    backdropFilter: 'blur(8px) saturate(1.2)'
                  }}
                  onMouseEnter={(e) => {
                    if (theme !== 'dark') {
                      e.currentTarget.style.borderColor = `${themeConfig.colors.primary}30`
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (theme !== 'dark') {
                      e.currentTarget.style.borderColor = `${themeConfig.colors.border}50`
                    }
                  }}
                >
                  <MoonIcon className="h-5 w-5" style={{
                    color: theme === 'dark' ? themeConfig.colors.primary : themeConfig.colors.textMuted
                  }} />
                  <span className="text-xs font-medium" style={{
                    color: theme === 'dark' ? themeConfig.colors.primary : themeConfig.colors.textMuted,
                    fontFamily: 'var(--font-helvetica)'
                  }}>
                    Dark
                  </span>
                  {theme === 'dark' && (
                    <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full" style={{ backgroundColor: themeConfig.colors.primary }} />
                  )}
                </button>

                <button
                  onClick={setStealthTheme}
                  className={`relative flex flex-col items-center gap-1.5 xs:gap-2 p-2 xs:p-3 rounded-xl transition-all duration-200 ${
                    theme === 'stealth' ? '' : ''
                  }`}
                  style={{
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    borderColor: theme === 'stealth' ? `${themeConfig.colors.primary}50` : `${themeConfig.colors.border}50`,
                    background: theme === 'stealth'
                      ? `${themeConfig.colors.primary}10`
                      : `${themeConfig.colors.surface}30`,
                    backdropFilter: 'blur(8px) saturate(1.2)'
                  }}
                  onMouseEnter={(e) => {
                    if (theme !== 'stealth') {
                      e.currentTarget.style.borderColor = `${themeConfig.colors.primary}30`
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (theme !== 'stealth') {
                      e.currentTarget.style.borderColor = `${themeConfig.colors.border}50`
                    }
                  }}
                >
                  <img
                    src="/icons/ninja.svg"
                    alt="Stealth"
                    className="w-5 h-5"
                    style={{
                      filter: theme === 'stealth'
                        ? 'brightness(0) invert(1)'
                        : 'brightness(0) invert(0.5)',
                      opacity: theme === 'stealth' ? 1 : 0.6
                    }}
                  />
                  <span className="text-xs font-medium" style={{
                    color: themeConfig.colors.textMuted,
                    fontFamily: 'var(--font-helvetica)'
                  }}>
                    Stealth
                  </span>
                  {theme === 'stealth' && (
                    <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full" style={{ backgroundColor: themeConfig.colors.primary }} />
                  )}
                </button>

                <button
                  onClick={setGhostTheme}
                  className={`relative flex flex-col items-center gap-1.5 xs:gap-2 p-2 xs:p-3 rounded-xl transition-all duration-200 ${
                    theme === 'ghost' ? '' : ''
                  }`}
                  style={{
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    borderColor: theme === 'ghost' ? `${themeConfig.colors.primary}50` : `${themeConfig.colors.border}50`,
                    background: theme === 'ghost'
                      ? `${themeConfig.colors.primary}10`
                      : `${themeConfig.colors.surface}30`,
                    backdropFilter: 'blur(8px) saturate(1.2)'
                  }}
                  onMouseEnter={(e) => {
                    if (theme !== 'ghost') {
                      e.currentTarget.style.borderColor = `${themeConfig.colors.primary}30`
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (theme !== 'ghost') {
                      e.currentTarget.style.borderColor = `${themeConfig.colors.border}50`
                    }
                  }}
                >
                  <span className="text-xl" style={{
                    filter: theme === 'ghost'
                      ? 'none'
                      : 'brightness(0) invert(0.5)',
                    opacity: theme === 'ghost' ? 1 : 0.6,
                    fontFamily: 'var(--font-helvetica)'
                  }}>
                    👻
                  </span>
                  <span className="text-xs font-medium" style={{
                    color: theme === 'ghost' ? themeConfig.colors.primary : themeConfig.colors.textMuted,
                    fontFamily: 'var(--font-helvetica)'
                  }}>
                    Ghost
                  </span>
                  {theme === 'ghost' && (
                    <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full" style={{ backgroundColor: themeConfig.colors.primary }} />
                  )}
                </button>
              </div>
            </div>

            {/* Slippage & Deadline */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <AdjustmentsHorizontalIcon className="h-4 w-4" style={{ color: themeConfig.colors.primary }} />
                <h3 className="text-xs font-medium uppercase tracking-wider" style={{
                  color: themeConfig.colors.primary,
                  fontFamily: 'var(--font-helvetica)',
                  letterSpacing: '0.05em'
                }}>Trading Preferences</h3>
              </div>

              {/* Slippage */}
              <div className="p-2 xs:p-3 rounded-xl" style={{
                background: `${themeConfig.colors.primary}08`,
                border: `1px solid ${themeConfig.colors.primary}15`
              }}>
                <label className="block text-sm font-medium mb-2" style={{
                  color: themeConfig.colors.textPrimary,
                  fontFamily: 'var(--font-helvetica)'
                }}>Slippage Tolerance</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={slippage}
                    onChange={(e) => setSlippage(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg text-sm"
                    style={{
                      border: `1px solid ${themeConfig.colors.border}`,
                      background: `${themeConfig.colors.surface}99`,
                      color: themeConfig.colors.textPrimary,
                      backdropFilter: 'blur(8px) saturate(1.2)',
                      fontFamily: 'var(--font-mono)'
                    }}
                    min="0.1"
                    max="50"
                    step="0.1"
                  />
                  <span className="text-sm" style={{ color: themeConfig.colors.textMuted }}>%</span>
                </div>
                <p className="text-xs mt-1" style={{ color: themeConfig.colors.textMuted }}>Your transaction will revert if price changes unfavorably by more than this amount</p>
              </div>

              {/* Deadline */}
              <div className="p-2 xs:p-3 rounded-xl" style={{
                background: `${themeConfig.colors.primary}08`,
                border: `1px solid ${themeConfig.colors.primary}15`
              }}>
                <label className="block text-sm font-medium mb-2" style={{
                  color: themeConfig.colors.textPrimary,
                  fontFamily: 'var(--font-helvetica)'
                }}>Transaction Deadline</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg text-sm"
                    style={{
                      border: `1px solid ${themeConfig.colors.border}`,
                      background: `${themeConfig.colors.surface}99`,
                      color: themeConfig.colors.textPrimary,
                      backdropFilter: 'blur(8px) saturate(1.2)',
                      fontFamily: 'var(--font-mono)'
                    }}
                    min="1"
                    max="60"
                    step="1"
                  />
                  <span className="text-sm" style={{ color: themeConfig.colors.textMuted }}>minutes</span>
                </div>
                <p className="text-xs mt-1" style={{ color: themeConfig.colors.textMuted }}>Your transaction will revert if it's pending for more than this time</p>
              </div>
            </div>

            {/* Interface */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <BellIcon className="h-4 w-4" style={{ color: themeConfig.colors.primary }} />
                <h3 className="text-xs font-medium uppercase tracking-wider" style={{
                  color: themeConfig.colors.primary,
                  fontFamily: 'var(--font-helvetica)',
                  letterSpacing: '0.05em'
                }}>Interface</h3>
              </div>

              {/* Notifications */}
              <div className="flex items-center justify-between p-3 rounded-xl" style={{
                background: `${themeConfig.colors.primary}08`,
                border: `1px solid ${themeConfig.colors.primary}15`
              }}>
                <div className="flex items-center gap-3">
                  <div className="rounded-lg p-2" style={{
                    background: `${themeConfig.colors.primary}20`,
                    border: `1px solid ${themeConfig.colors.primary}30`
                  }}>
                    <BellIcon className="h-4 w-4" style={{ color: themeConfig.colors.primary }} />
                  </div>
                  <div>
                    <h4 className="font-medium text-sm" style={{ color: themeConfig.colors.textPrimary }}>Notifications</h4>
                    <p className="text-xs" style={{ color: themeConfig.colors.textMuted }}>Transaction alerts and updates</p>
                  </div>
                </div>

                <Switch
                  checked={notifications}
                  onChange={setNotifications}
                  className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-transparent"
                  style={{
                    backgroundColor: notifications ? `${themeConfig.colors.primary}cc` : `${themeConfig.colors.surface}`
                  }}
                >
                  <span className="sr-only">Enable notifications</span>
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${notifications ? 'translate-x-5' : 'translate-x-1'}`}
                  />
                </Switch>
              </div>
            </div>

            {/* Legal & Terms */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <DocumentTextIcon className="h-4 w-4" style={{ color: themeConfig.colors.primary }} />
                <h3 className="text-xs font-medium uppercase tracking-wider" style={{
                  color: themeConfig.colors.primary,
                  fontFamily: 'var(--font-helvetica)',
                  letterSpacing: '0.05em'
                }}>Legal & Terms</h3>
              </div>

              {/* Terms & Conditions */}
              <div className="p-3 rounded-xl" style={{
                background: hasAcceptedTerms
                  ? `${themeConfig.colors.success}08`
                  : `${themeConfig.colors.error}08`,
                border: hasAcceptedTerms
                  ? `1px solid ${themeConfig.colors.success}20`
                  : `1px solid ${themeConfig.colors.error}20`
              }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg p-2" style={{
                      background: hasAcceptedTerms
                        ? `${themeConfig.colors.success}20`
                        : `${themeConfig.colors.error}20`,
                      border: hasAcceptedTerms
                        ? `1px solid ${themeConfig.colors.success}30`
                        : `1px solid ${themeConfig.colors.error}30`
                    }}>
                      {hasAcceptedTerms ? (
                        <ShieldCheckIcon className="h-4 w-4" style={{ color: themeConfig.colors.success }} />
                      ) : (
                        <ExclamationTriangleIcon className="h-4 w-4" style={{ color: themeConfig.colors.error }} />
                      )}
                    </div>
                    <div>
                      <h4 className="font-medium text-sm" style={{ color: themeConfig.colors.textPrimary }}>
                        Terms & Conditions
                      </h4>
                      <p className="text-xs" style={{ color: themeConfig.colors.textMuted }}>
                        {hasAcceptedTerms ? 'Accepted' : 'Not yet reviewed'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowTermsModal(true)}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                    style={{
                      color: hasAcceptedTerms ? themeConfig.colors.primary : themeConfig.colors.error,
                      backgroundColor: hasAcceptedTerms
                        ? `${themeConfig.colors.primary}15`
                        : `${themeConfig.colors.error}15`
                    }}
                  >
                    {hasAcceptedTerms ? 'Review' : 'Review & Accept'}
                  </button>
                </div>
                <p className="text-xs" style={{
                  color: themeConfig.colors.textSecondary,
                  fontFamily: 'var(--font-helvetica)'
                }}>
                  Review our terms regarding mainnet audit status, user responsibilities, and risk acknowledgments.
                </p>
              </div>
            </div>

            {/* Info Section */}
            <div className="p-3 rounded-xl" style={{
              background: `${themeConfig.colors.primary}08`,
              border: `1px solid ${themeConfig.colors.primary}15`
            }}>
              <div className="flex items-start gap-2">
                <InformationCircleIcon className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: themeConfig.colors.primary }} />
                <div className="flex-1">
                  <p className="text-xs" style={{
                    color: themeConfig.colors.textSecondary,
                    fontFamily: 'var(--font-helvetica)'
                  }}>
                    Configure your trading preferences and privacy settings to optimize your WaveSwap experience.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Settings