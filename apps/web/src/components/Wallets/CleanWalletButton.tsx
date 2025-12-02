'use client'

import { Wallet, ChevronDown, Copy, LogOut, Settings, ChartBar } from 'lucide-react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@/contexts/WalletModalContext'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useThemeConfig, createGlassStyles, createButtonStyles } from '@/lib/theme'

export function CleanWalletButton() {
  const router = useRouter()

  // Safely get wallet context with error handling
  let walletContext
  try {
    walletContext = useWallet()
  } catch (error) {
    console.error('[CleanWalletButton] Wallet context error:', error)
    // Fallback wallet context for error cases
    walletContext = {
      publicKey: null,
      disconnect: async () => {},
      connecting: false,
      wallet: null,
      connected: false,
      wallets: []
    }
  }

  const { publicKey, disconnect, connecting, wallet } = walletContext
  const { openModal } = useWalletModal()
  const theme = useThemeConfig()
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const handleDisconnect = async () => {
    try {
      await disconnect()
      setShowDropdown(false)
    } catch (error) {
      console.error('Disconnect failed:', error)
    }
  }

  const handleDashboard = () => {
    // Navigate to dashboard using Next.js router
    router.push('/dashboard')
    setShowDropdown(false)
  }

  const copyAddress = async () => {
    if (publicKey) {
      try {
        await navigator.clipboard.writeText(publicKey.toString())
      } catch (error) {
        console.error('Failed to copy address:', error)
      }
    }
  }

  const getTruncatedAddress = () => {
    if (!publicKey) return ''
    const address = publicKey.toString()
    return `${address.slice(0, 4)}...${address.slice(-4)}`
  }

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
    return undefined
  }, [showDropdown])

  const getButtonText = () => {
    if (connecting) return 'Connecting...'
    if (publicKey) {
      const address = publicKey.toString()
      return `${address.slice(0, 4)}...${address.slice(-4)}`
    }
    return 'Connect Wallet'
  }

  const handleDropdownClick = (action: () => void) => {
    action()
    setShowDropdown(false)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => {
          if (publicKey) {
            setShowDropdown(!showDropdown)
          } else {
            openModal()
          }
        }}
      className="relative flex items-center gap-3 px-5 py-3 rounded-xl font-medium text-sm transition-all duration-300 ease-out hover:scale-[1.02] active:scale-[0.98] z-10 overflow-hidden"
      style={{
        background: publicKey
          ? `
            linear-gradient(135deg,
              ${theme.colors.success}25 0%,
              ${theme.colors.success}15 50%,
              ${theme.colors.success}25 100%
            ),
            radial-gradient(circle at 30% 30%,
              ${theme.colors.success}20 0%,
              transparent 50%
            )
          `
          : theme.name === 'light'
            ? `
              linear-gradient(135deg,
                ${theme.colors.primary}dd 0%,
                ${theme.colors.primary}cc 50%,
                ${theme.colors.primary}dd 100%
              ),
              radial-gradient(circle at 30% 30%,
                ${theme.colors.primary}20 0%,
                transparent 50%
              )
            `
            : createGlassStyles(theme).background as string,
        border: publicKey
          ? `1px solid ${theme.colors.success}40`
          : `1px solid ${theme.colors.primary}30`,
        backdropFilter: 'blur(20px) saturate(1.8)',
        boxShadow: publicKey
          ? `0 8px 24px ${theme.colors.success}25, inset 0 1px 0 rgba(255, 255, 255, 0.2)`
          : theme.name === 'light'
            ? `0 8px 24px ${theme.colors.primary}30, inset 0 1px 0 rgba(255, 255, 255, 0.3)`
            : `0 8px 32px ${theme.colors.shadow}, inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 0 0 1px ${theme.colors.primary}05`,
        fontFamily: 'var(--font-helvetica)',
        fontWeight: 600,
        letterSpacing: '0.025em'
      }}
      onMouseEnter={(e) => {
        if (!publicKey) {
          e.currentTarget.style.background = theme.name === 'light'
            ? `
              linear-gradient(135deg,
                rgba(33, 188, 255, 0.25) 0%,
                rgba(33, 188, 255, 0.18) 50%,
                rgba(33, 188, 255, 0.25) 100%
              ),
              radial-gradient(circle at 30% 30%,
                rgba(33, 188, 255, 0.2) 0%,
                transparent 50%
              )
            `
            : `
              linear-gradient(135deg,
                ${theme.colors.primary}40 0%,
                ${theme.colors.primary}30 50%,
                ${theme.colors.primary}40 100%
              ),
              radial-gradient(circle at 30% 30%,
                ${theme.colors.primary}35 0%,
                transparent 60%
              ),
              linear-gradient(135deg,
                rgba(255, 255, 255, 0.05) 0%,
                rgba(255, 255, 255, 0.02) 50%,
                rgba(255, 255, 255, 0.05) 100%
              )
            `
          e.currentTarget.style.borderColor = theme.name === 'light'
            ? 'rgba(33, 188, 255, 0.4)'
            : `${theme.colors.primary}60`
          e.currentTarget.style.boxShadow = theme.name === 'light'
            ? `
              0 12px 40px rgba(33, 188, 255, 0.25),
              inset 0 1px 0 rgba(255, 255, 255, 0.25)
            `
            : `
              0 16px 48px ${theme.colors.primary}35,
              0 8px 24px ${theme.colors.primary}25,
              inset 0 1px 0 rgba(255, 255, 255, 0.15),
              inset 0 -1px 0 rgba(0, 0, 0, 0.1)
            `
        } else {
          e.currentTarget.style.boxShadow = `
            0 12px 40px rgba(34, 197, 94, 0.25),
            inset 0 1px 0 rgba(255, 255, 255, 0.25)
          `
        }
        e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)'

        // Change text and icon colors to primary color on hover
        if (!publicKey) {
          const textElement = e.currentTarget.querySelector('span') as HTMLElement
          const iconElement = e.currentTarget.querySelector('svg:not(.chevron-down)') as HTMLElement
          const chevronElement = e.currentTarget.querySelector('.chevron-down') as HTMLElement

          if (textElement) {
            textElement.style.color = theme.colors.primary
          }
          if (iconElement) {
            iconElement.style.color = theme.colors.primary
          }
          if (chevronElement) {
            chevronElement.style.color = theme.colors.primary
          }
        }
      }}
      onMouseLeave={(e) => {
        if (!publicKey) {
          // Reset to original background based on theme
          e.currentTarget.style.background = theme.name === 'light'
            ? `
              linear-gradient(135deg,
                ${theme.colors.primary}dd 0%,
                ${theme.colors.primary}cc 50%,
                ${theme.colors.primary}dd 100%
              ),
              radial-gradient(circle at 30% 30%,
                ${theme.colors.primary}20 0%,
                transparent 50%
              )
            `
            : createGlassStyles(theme).background as string
          e.currentTarget.style.borderColor = theme.colors.primary + '30'
          e.currentTarget.style.boxShadow = theme.name === 'light'
            ? `0 8px 24px ${theme.colors.primary}30, inset 0 1px 0 rgba(255, 255, 255, 0.3)`
            : `0 8px 32px ${theme.colors.shadow}, inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 0 0 1px ${theme.colors.primary}05`
        } else {
          e.currentTarget.style.boxShadow = `
            0 8px 24px rgba(34, 197, 94, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.2)
          `
        }
        e.currentTarget.style.transform = 'translateY(0) scale(1)'

        // Reset text and icon colors to original values
        if (!publicKey) {
          const textElement = e.currentTarget.querySelector('span') as HTMLElement
          const iconElement = e.currentTarget.querySelector('svg:not(.chevron-down)') as HTMLElement
          const chevronElement = e.currentTarget.querySelector('.chevron-down') as HTMLElement

          if (textElement) {
            textElement.style.color = theme.name === 'light' ? '#ffffff' : theme.colors.textMuted
          }
          if (iconElement) {
            iconElement.style.color = theme.name === 'light' ? '#ffffff' : theme.colors.textPrimary
          }
          if (chevronElement) {
            chevronElement.style.color = theme.name === 'light' ? '#ffffff' : theme.colors.textPrimary
          }
        }
      }}
    >
      {/* Noise grain overlay */}
      <div
        className="absolute inset-0 opacity-3 pointer-events-none rounded-xl"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3Cfilter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
          filter: 'contrast(1.3) brightness(1.1)'
        }}
      />
      {/* Button Content */}
      <div className="relative z-10 flex items-center gap-3">
        {connecting ? (
          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : publicKey ? (
          <img
            src="/assets/Phantom/Phantom-Icon-Purple.svg"
            alt="Phantom Wallet"
            className="w-4 h-4"
            style={{
              filter: `drop-shadow(0 0 8px ${theme.colors.success}40)`
            }}
          />
        ) : (
          <Wallet className="w-4 h-4" style={{
            color: theme.name === 'light' ? '#ffffff' : theme.colors.textPrimary,
            filter: `drop-shadow(0 0 8px ${theme.colors.primary}40)`
          }} />
        )}

        <span style={{
          color: publicKey
            ? theme.colors.textPrimary
            : theme.name === 'light' ? '#ffffff' : theme.colors.textMuted,
          textShadow: publicKey
            ? `0 0 10px ${theme.colors.success}30`
            : theme.name === 'light'
              ? '0 1px 2px rgba(0, 0, 0, 0.2)'
              : `0 0 10px ${theme.colors.primary}30`,
          fontFamily: 'var(--font-helvetica)'
        }}>
          {getButtonText()}
        </span>

        {!publicKey && (
          <ChevronDown
            className="w-3 h-3 chevron-down"
            style={{
              color: theme.name === 'light' ? '#ffffff' : theme.colors.textPrimary,
              transition: 'all 0.3s ease',
              textShadow: theme.name === 'light' ? '0 1px 2px rgba(0, 0, 0, 0.2)' : 'none'
            }}
          />
        )}
      </div>

      {/* Connected state glow effect */}
      {publicKey && (
        <div
          className="absolute inset-0 rounded-xl opacity-20 pointer-events-none"
          style={{
            background: `radial-gradient(circle at 50% 50%, ${theme.colors.success}30 0%, transparent 70%)`,
            filter: 'blur(8px)'
          }}
        />
      )}
    </button>

    {/* Dropdown Menu */}
    {showDropdown && publicKey && (
      <div
        className="absolute top-full left-0 mt-2 w-64 rounded-xl z-50"
        style={{
          ...createGlassStyles(theme),
          background: theme.name === 'light'
            ? `
              linear-gradient(135deg,
                ${theme.colors.surface}f8 0%,
                ${theme.colors.surface}f0 25%,
                ${theme.colors.surface}f8 50%,
                ${theme.colors.surface}f0 75%,
                ${theme.colors.surface}f8 100%
              ),
              radial-gradient(circle at 25% 25%,
                ${theme.colors.primary}08 0%,
                transparent 50%
              )
            `
            : `
              linear-gradient(135deg,
                ${theme.colors.surface}ee 0%,
                ${theme.colors.surfaceHover}cc 25%,
                ${theme.colors.surface}ee 50%,
                ${theme.colors.surfaceHover}cc 75%,
                ${theme.colors.surface}ee 100%
              ),
              radial-gradient(circle at 25% 25%,
                ${theme.colors.primary}05 0%,
                transparent 50%
              )
            `,
          border: theme.name === 'light' ? `1px solid ${theme.colors.border}` : `1px solid ${theme.colors.primary}15`,
          backdropFilter: 'blur(24px) saturate(1.8)',
          boxShadow: theme.name === 'light'
            ? `
              0 20px 40px ${theme.colors.shadowLight},
              inset 0 1px 0 rgba(255, 255, 255, 0.4),
              0 0 0 1px ${theme.colors.primary}10
            `
            : `
              0 20px 40px ${theme.colors.shadow},
              inset 0 1px 0 rgba(255, 255, 255, 0.1),
              0 0 0 1px ${theme.colors.primary}05
            `
        }}
      >
        {/* Wallet Address Section */}
        <div
          className="p-4 border-b"
          style={{
            borderColor: theme.name === 'light' ? theme.colors.border : `${theme.colors.border}50`
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: `${theme.colors.success}20` }}
            >
              <img
                src="/assets/Phantom/Phantom-Icon-Purple.svg"
                alt="Phantom Wallet"
                className="w-4 h-4"
                style={{ objectFit: 'contain' }}
              />
            </div>
            <div className="flex-1">
              <div
                className="text-xs font-medium"
                style={{ color: theme.colors.textSecondary }}
              >
                Connected
              </div>
              <div
                className="text-sm font-medium"
                style={{ color: theme.colors.textPrimary }}
              >
                {getTruncatedAddress()}
              </div>
            </div>
          </div>
        </div>

        {/* Dropdown Actions */}
        <div className="p-1">
          <button
            onClick={() => handleDropdownClick(copyAddress)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200"
            style={{
              fontFamily: 'var(--font-helvetica)',
              color: theme.colors.textSecondary,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = `${theme.colors.primary}10`
              e.currentTarget.style.color = theme.colors.textPrimary
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = theme.colors.textSecondary
            }}
          >
            <Copy className="w-4 h-4" style={{ color: theme.colors.primary }} />
            <span className="text-sm font-medium">Copy Address</span>
          </button>

          <button
            onClick={() => handleDropdownClick(handleDashboard)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200"
            style={{
              fontFamily: 'var(--font-helvetica)',
              color: theme.colors.textSecondary,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = `${theme.colors.primary}10`
              e.currentTarget.style.color = theme.colors.primary
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = theme.colors.textSecondary
            }}
          >
            <ChartBar className="w-4 h-4" style={{ color: theme.colors.primary }} />
            <span className="text-sm font-medium">Dashboard</span>
          </button>

          <button
            onClick={() => handleDropdownClick(handleDisconnect)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200"
            style={{
              fontFamily: 'var(--font-helvetica)',
              color: theme.colors.textSecondary,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = `${theme.colors.error}10`
              e.currentTarget.style.color = theme.colors.error
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = theme.colors.textSecondary
            }}
          >
            <LogOut className="w-4 h-4" style={{ color: theme.colors.error }} />
            <span className="text-sm font-medium">Disconnect</span>
          </button>
        </div>

        {/* Noise grain overlay for dropdown */}
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none rounded-xl"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3Cfilter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
            filter: 'contrast(1.3) brightness(1.1)'
          }}
        />
      </div>
    )}
    </div>
  )
}

export default CleanWalletButton