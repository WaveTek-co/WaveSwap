'use client'

import { useWallet } from '@/hooks/useWalletAdapter'
import { useRef, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useThemeConfig } from '@/lib/theme'
import { useGlobalModal } from '@/contexts/GlobalModalContext'

export function CleanWalletButton() {
  const router = useRouter()
  const { publicKey, disconnect } = useWallet()
  const theme = useThemeConfig()
  const { openWalletModal } = useGlobalModal()
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

  return (
    <div className="relative" ref={dropdownRef}>
      {!publicKey ? (
        <button
          onClick={openWalletModal}
          className="relative flex items-center gap-3 px-5 py-3 rounded-xl font-medium text-sm transition-all duration-300 ease-out hover:scale-[1.02] active:scale-[0.98] z-10 overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${theme.colors.primary}20 0%, ${theme.colors.primary}10 50%, ${theme.colors.primary}20 100%)`,
            border: `1px solid ${theme.colors.primary}30}`,
            color: theme.colors.textPrimary,
            fontFamily: 'var(--font-helvetica)',
            fontWeight: 600,
          }}
        >
          <span>Connect Wallet</span>
        </button>
      ) : (
        <div>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="relative flex items-center gap-3 px-5 py-3 rounded-xl font-medium text-sm transition-all duration-300 ease-out hover:scale-[1.02] active:scale-[0.98] z-10 overflow-hidden"
            style={{
              background: `linear-gradient(135deg, ${theme.colors.success}25 0%, ${theme.colors.success}15 50%, ${theme.colors.success}25 100%)`,
              border: `1px solid ${theme.colors.success}40}`,
              color: theme.colors.textPrimary,
              fontFamily: 'var(--font-helvetica)',
              fontWeight: 600,
            }}
          >
            <img
              src="/assets/Phantom/Phantom-Icon-Purple.svg"
              alt="Phantom Wallet"
              className="w-4 h-4"
            />
            <span>{getTruncatedAddress()}</span>
          </button>

          {showDropdown && (
            <div className="absolute top-full left-0 mt-2 w-64 rounded-xl shadow-lg border z-50"
              style={{
                background: theme.name === 'light' ? 'white' : '#1a1a1a',
                borderColor: theme.colors.border
              }}
            >
              <div className="p-4 border-b" style={{ borderColor: theme.colors.border }}>
                <div className="flex items-center gap-3">
                  <img
                    src="/assets/Phantom/Phantom-Icon-Purple.svg"
                    alt="Phantom Wallet"
                    className="w-4 h-4"
                  />
                  <div>
                    <div className="text-xs font-medium" style={{ color: theme.colors.textSecondary }}>
                      Connected
                    </div>
                    <div className="text-sm font-medium" style={{ color: theme.colors.textPrimary }}>
                      {getTruncatedAddress()}
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-1">
                <button
                  onClick={copyAddress}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                  style={{ color: theme.colors.textSecondary }}
                >
                  Copy Address
                </button>
                <button
                  onClick={handleDashboard}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                  style={{ color: theme.colors.textSecondary }}
                >
                  Dashboard
                </button>
                <button
                  onClick={handleDisconnect}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-red-500"
                >
                  Disconnect
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default CleanWalletButton