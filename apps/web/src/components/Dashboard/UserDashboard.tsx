'use client'

import { useState, useEffect } from 'react'
import { useConnection, useWallet } from '@/hooks/useWalletAdapter'
import { AppHeader } from '@/components/Header/AppHeader'
import { useThemeConfig, createGlassStyles } from '@/lib/theme'
import { usePrivacyMode } from '@/contexts/PrivacyContext'
import { useRouter } from 'next/navigation'
import { useSwap } from '@/hooks/useSwap'
import {
  User,
  TrendingUp,
  Shield,
  ArrowRightLeft,
  Clock,
  Eye,
  EyeOff,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Settings
} from 'lucide-react'

export function UserDashboard() {
  const router = useRouter()
  const { publicKey, connected, connecting } = useWallet()
  const { connection } = useConnection()
  const theme = useThemeConfig()
  const { privacyMode } = usePrivacyMode()
  const { balances, refreshBalances } = useSwap(privacyMode, publicKey)

  const [walletBalance, setWalletBalance] = useState<number>(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showPrivateKey, setShowPrivateKey] = useState(false)

  // Fetch wallet data
  useEffect(() => {
    const fetchWalletData = async () => {
      if (connected && publicKey && connection) {
        try {
          const balance = await connection.getBalance(publicKey)
          setWalletBalance(balance / 1e9)
        } catch (error) {
          console.error('Error fetching wallet data:', error)
        }
      }
    }

    fetchWalletData()
  }, [connected, publicKey, connection])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      if (connected && publicKey && connection) {
        const balance = await connection.getBalance(publicKey)
        setWalletBalance(balance / 1e9)
      }
      await refreshBalances()
    } catch (error) {
      console.error('Error refreshing data:', error)
    }
    setTimeout(() => setIsRefreshing(false), 1000)
  }

  // Generate avatar from wallet address
  const generateAvatar = (address: string) => {
    const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b']
    const colorIndex = address.charCodeAt(0) % colors.length
    return colors[colorIndex]
  }

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  const formatNumber = (num: number, decimals: number = 2) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(num)
  }

  return (
    <div className="min-h-screen relative">
      {/* Background gradients */}
      {theme?.name !== 'stealth' && (
        <>
          <div
            className="absolute inset-0"
            style={{
              opacity: theme?.name === 'light' ? 0.6 : 0.4,
              background: theme?.name === 'light'
                ? `radial-gradient(circle at 20% 50%, rgba(33, 188, 255, 0.15) 0%, rgba(33, 188, 255, 0.05) 30%, transparent 50%),
                    radial-gradient(circle at 80% 20%, rgba(74, 74, 255, 0.12) 0%, rgba(74, 74, 255, 0.03) 35%, transparent 50%)`
                : `radial-gradient(circle at 20% 50%, rgba(33, 188, 255, 0.25) 0%, transparent 50%),
                    radial-gradient(circle at 80% 20%, rgba(46, 46, 209, 0.20) 0%, transparent 50%)`
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              opacity: theme?.name === 'light' ? 0.3 : 0.2,
              background: theme?.name === 'light'
                ? `linear-gradient(45deg, rgba(33, 188, 255, 0.05) 0%, rgba(74, 74, 255, 0.08) 25%, rgba(6, 182, 212, 0.06) 50%)`
                : `linear-gradient(45deg, rgba(33, 188, 255, 0.08) 0%, rgba(46, 46, 209, 0.12) 25%, rgba(0, 191, 255, 0.10) 50%)`
            }}
          />
        </>
      )}

      {/* Background image overlay for dark theme */}
      {theme?.name === 'dark' && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `url("/bg.jpg")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            filter: 'blur(25px) saturate(1.2) brightness(0.25)',
            opacity: 0.4
          }}
        />
      )}

      <div className="relative z-10">
        <AppHeader showSearch={false} />

        <main className="container mx-auto px-3 sm:px-4 md:px-6 py-6">
          <div className="w-full max-w-7xl mx-auto space-y-6">

            {/* User Profile Section */}
            <div
              className="rounded-2xl p-6"
              style={{
                ...createGlassStyles(theme),
                border: `1px solid ${theme?.colors?.border || '#374151'}`,
                background: `${theme?.colors?.surface || '#1f2937'}40`
              }}
            >
              <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
                {/* Avatar */}
                <div className="relative">
                  <div
                    className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold shadow-lg"
                    style={{
                      background: connected
                        ? `linear-gradient(135deg, ${generateAvatar(publicKey?.toString() || '')}, ${generateAvatar((publicKey?.toString() || '') + '1')})`
                        : `${theme?.colors?.surface || '#374151'}`,
                      color: connected ? '#ffffff' : theme?.colors?.textMuted
                    }}
                  >
                    {connected ? formatAddress(publicKey?.toString() || '').slice(0, 2) : <User className="w-8 h-8" />}
                  </div>
                  {connected && (
                    <div
                      className="absolute bottom-0 right-0 w-6 h-6 rounded-full border-2 border-gray-900"
                      style={{ backgroundColor: '#22c55e' }}
                    />
                  )}
                </div>

                {/* User Info */}
                <div className="flex-1 text-center md:text-left">
                  <h1
                    className="text-2xl md:text-3xl font-bold mb-2"
                    style={{ color: theme?.colors?.textPrimary || '#ffffff' }}
                  >
                    {connected ? 'WaveSwap User' : 'Connect Wallet'}
                  </h1>
                  {connected && (
                    <p
                      className="text-sm font-mono mb-2"
                      style={{ color: theme?.colors?.textSecondary || '#d1d5db' }}
                    >
                      {publicKey?.toString()}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mt-3">
                    {connected && (
                      <>
                        <span
                          className="px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1"
                          style={{
                            background: 'rgba(34, 197, 94, 0.1)',
                            color: '#22c55e',
                            border: '1px solid rgba(34, 197, 94, 0.3)'
                          }}
                        >
                          <CheckCircle className="w-3 h-3" />
                          Verified
                        </span>
                        <span
                          className="px-3 py-1 rounded-full text-xs font-medium"
                          style={{
                            background: `${privacyMode ? 'rgba(34, 197, 94, 0.1)' : 'rgba(59, 130, 246, 0.1)'}`,
                            color: privacyMode ? '#22c55e' : '#3b82f6',
                            border: `1px solid ${privacyMode ? 'rgba(34, 197, 94, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`
                          }}
                        >
                          <Shield className="w-3 h-3 inline mr-1" />
                          {privacyMode ? 'Private Mode' : 'Public Mode'}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRefresh}
                    disabled={!connected || isRefreshing}
                    className="p-2 rounded-lg transition-all hover:scale-[1.05] disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      background: `${theme?.colors?.primary || '#3b82f6'}20`,
                      border: `1px solid ${theme?.colors?.primary || '#3b82f6'}30`,
                      color: theme?.colors?.primary || '#3b82f6'
                    }}
                  >
                    <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    onClick={() => router.push('/')}
                    className="p-2 rounded-lg transition-all hover:scale-[1.05]"
                    style={{
                      background: `${theme?.colors?.surface || '#1f2937'}20`,
                      border: `1px solid ${theme?.colors?.border || '#374151'}`,
                      color: theme?.colors?.textSecondary || '#d1d5db'
                    }}
                  >
                    <ArrowRightLeft className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Portfolio Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Total Balance */}
              <div
                className="rounded-2xl p-6"
                style={{
                  ...createGlassStyles(theme),
                  border: `1px solid ${theme?.colors?.border || '#374151'}`,
                  background: `${theme?.colors?.surface || '#1f2937'}40`
                }}
              >
                <div className="flex items-center justify-between mb-4">
                  <span
                    className="text-sm font-medium"
                    style={{ color: theme?.colors?.textSecondary || '#d1d5db' }}
                  >
                    Total Balance
                  </span>
                  <TrendingUp className="w-4 h-4" style={{ color: theme?.colors?.primary || '#3b82f6' }} />
                </div>
                <h2
                  className="text-3xl font-bold mb-2"
                  style={{ color: theme?.colors?.textPrimary || '#ffffff' }}
                >
                  {privacyMode ? '****' : `$${formatNumber(walletBalance * 150)}`}
                </h2>
                <p
                  className="text-sm"
                  style={{ color: theme?.colors?.textMuted || '#9ca3af' }}
                >
                  {privacyMode ? 'Hidden' : `${formatNumber(walletBalance)} SOL + Tokens`}
                </p>
              </div>

              {/* Confidential Balance */}
              <div
                className="rounded-2xl p-6"
                style={{
                  ...createGlassStyles(theme),
                  border: `1px solid ${theme?.colors?.success || '#10b981'}30`,
                  background: `${theme?.colors?.success || '#10b981'}10`
                }}
              >
                <div className="flex items-center justify-between mb-4">
                  <span
                    className="text-sm font-medium"
                    style={{ color: theme?.colors?.textSecondary || '#d1d5db' }}
                  >
                    Confidential Balance
                  </span>
                  <Shield className="w-4 h-4" style={{ color: theme?.colors?.success || '#10b981' }} />
                </div>
                <h2
                  className="text-3xl font-bold mb-2"
                  style={{ color: theme?.colors?.textPrimary || '#ffffff' }}
                >
                  {privacyMode ? '****' : `${balances?.size || 0}`}
                </h2>
                <p
                  className="text-sm"
                  style={{ color: theme?.colors?.textMuted || '#9ca3af' }}
                >
                  {privacyMode ? 'Hidden' : 'Wrapped Tokens'}
                </p>
              </div>

              {/* Wallet Status */}
              <div
                className="rounded-2xl p-6"
                style={{
                  ...createGlassStyles(theme),
                  border: `1px solid ${theme?.colors?.border || '#374151'}`,
                  background: `${theme?.colors?.surface || '#1f2937'}40`
                }}
              >
                <div className="flex items-center justify-between mb-4">
                  <span
                    className="text-sm font-medium"
                    style={{ color: theme?.colors?.textSecondary || '#d1d5db' }}
                  >
                    Wallet Status
                  </span>
                  {connecting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" style={{ color: theme?.colors?.primary || '#3b82f6' }} />
                  ) : connected ? (
                    <CheckCircle className="w-4 h-4" style={{ color: '#22c55e' }} />
                  ) : (
                    <AlertCircle className="w-4 h-4" style={{ color: '#ef4444' }} />
                  )}
                </div>
                <h2
                  className="text-3xl font-bold mb-2"
                  style={{ color: connected ? theme?.colors?.textPrimary || '#ffffff' : theme?.colors?.textMuted || '#9ca3af' }}
                >
                  {connecting ? 'Connecting...' : connected ? 'Active' : 'Disconnected'}
                </h2>
                <p
                  className="text-sm font-mono"
                  style={{ color: theme?.colors?.textMuted || '#9ca3af' }}
                >
                  {connected && publicKey ? formatAddress(publicKey.toString()) : 'No wallet connected'}
                </p>
              </div>
            </div>

            {/* Wrapped Tokens Section */}
            {connected && (
              <div
                className="rounded-2xl p-6"
                style={{
                  ...createGlassStyles(theme),
                  border: `1px solid ${theme?.colors?.success || '#10b981'}30`,
                  background: `${theme?.colors?.success || '#10b981'}10`
                }}
              >
                <div className="flex items-center justify-between mb-6">
                  <h3
                    className="text-xl font-semibold flex items-center gap-2"
                    style={{ color: theme?.colors?.textPrimary || '#ffffff' }}
                  >
                    <Shield className="w-5 h-5" />
                    Wrapped Tokens to Withdraw
                  </h3>
                  <button
                    onClick={() => setShowPrivateKey(!showPrivateKey)}
                    className="p-2 rounded-lg transition-all hover:scale-[1.05]"
                    style={{
                      background: `${theme?.colors?.success || '#10b981'}20`,
                      border: `1px solid ${theme?.colors?.success || '#10b981'}30`,
                      color: theme?.colors?.success || '#10b981'
                    }}
                  >
                    {showPrivateKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {balances && balances.size > 0 ? (
                  <div className="space-y-3">
                    {Array.from(balances.entries()).map(([mintAddress, balance], index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-4 rounded-lg"
                        style={{
                          background: `${theme?.colors?.surface || '#1f2937'}20`,
                          border: `1px solid ${theme?.colors?.border || '#374151'}`
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                            style={{
                              background: `${theme?.colors?.success || '#10b981'}20`,
                              color: theme?.colors?.success || '#10b981'
                            }}
                          >
                            <Shield className="w-5 h-5" />
                          </div>
                          <div>
                            <p
                              className="font-medium"
                              style={{ color: theme?.colors?.textPrimary || '#ffffff' }}
                            >
                              Confidential Token
                            </p>
                            <p
                              className="text-xs"
                              style={{ color: theme?.colors?.textSecondary || '#d1d5db' }}
                            >
                              {showPrivateKey ? mintAddress : formatAddress(mintAddress)}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p
                            className="font-medium"
                            style={{ color: theme?.colors?.textPrimary || '#ffffff' }}
                          >
                            {balance || '0.00'}
                          </p>
                          <p
                            className="text-xs"
                            style={{ color: theme?.colors?.textSecondary || '#d1d5db' }}
                          >
                            Withdrawable
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Shield className="w-12 h-12 mx-auto mb-4" style={{ color: theme?.colors?.textMuted || '#9ca3af' }} />
                    <p
                      className="text-lg mb-2"
                      style={{ color: theme?.colors?.textSecondary || '#d1d5db' }}
                    >
                      No wrapped tokens found
                    </p>
                    <p
                      className="text-sm"
                      style={{ color: theme?.colors?.textMuted || '#9ca3af' }}
                    >
                      Start a confidential swap to create wrapped tokens
                    </p>
                    <button
                      onClick={() => router.push('/')}
                      className="mt-4 px-4 py-2 rounded-lg transition-all hover:scale-[1.05]"
                      style={{
                        background: `${theme?.colors?.primary || '#3b82f6'}20`,
                        border: `1px solid ${theme?.colors?.primary || '#3b82f6'}30`,
                        color: theme?.colors?.primary || '#3b82f6'
                      }}
                    >
                      Start Trading
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Quick Actions */}
            <div
              className="rounded-2xl p-6"
              style={{
                ...createGlassStyles(theme),
                border: `1px solid ${theme?.colors?.border || '#374151'}`,
                background: `${theme?.colors?.surface || '#1f2937'}40`
              }}
            >
              <h3
                className="text-xl font-semibold mb-4"
                style={{ color: theme?.colors?.textPrimary || '#ffffff' }}
              >
                Quick Actions
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <button
                  onClick={() => router.push('/')}
                  className="p-4 rounded-xl text-center transition-all hover:scale-[1.05]"
                  style={{
                    background: `${theme?.colors?.primary || '#3b82f6'}15`,
                    border: `1px solid ${theme?.colors?.primary || '#3b82f6'}30`
                  }}
                >
                  <ArrowRightLeft className="w-6 h-6 mx-auto mb-2" style={{ color: theme?.colors?.primary || '#3b82f6' }} />
                  <span className="text-sm font-medium" style={{ color: theme?.colors?.textSecondary || '#d1d5db' }}>
                    Swap
                  </span>
                </button>

                <button
                  onClick={() => router.push('/?tab=bridge')}
                  className="p-4 rounded-xl text-center transition-all hover:scale-[1.05]"
                  style={{
                    background: `${theme?.colors?.primary || '#3b82f6'}15`,
                    border: `1px solid ${theme?.colors?.primary || '#3b82f6'}30`
                  }}
                >
                  <ExternalLink className="w-6 h-6 mx-auto mb-2" style={{ color: theme?.colors?.primary || '#3b82f6' }} />
                  <span className="text-sm font-medium" style={{ color: theme?.colors?.textSecondary || '#d1d5db' }}>
                    Bridge
                  </span>
                </button>

                <button
                  onClick={() => router.push('/?tab=stake')}
                  className="p-4 rounded-xl text-center transition-all hover:scale-[1.05]"
                  style={{
                    background: `${theme?.colors?.primary || '#3b82f6'}15`,
                    border: `1px solid ${theme?.colors?.primary || '#3b82f6'}30`
                  }}
                >
                  <Clock className="w-6 h-6 mx-auto mb-2" style={{ color: theme?.colors?.primary || '#3b82f6' }} />
                  <span className="text-sm font-medium" style={{ color: theme?.colors?.textSecondary || '#d1d5db' }}>
                    Stake
                  </span>
                </button>

                <button
                  disabled={!connected}
                  className="p-4 rounded-xl text-center transition-all hover:scale-[1.05] disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: connected ? `${theme?.colors?.success || '#10b981'}15` : `${theme?.colors?.surface || '#1f2937'}20`,
                    border: connected ? `1px solid ${theme?.colors?.success || '#10b981'}30` : `1px solid ${theme?.colors?.border || '#374151'}`
                  }}
                >
                  <Settings className="w-6 h-6 mx-auto mb-2" style={{ color: connected ? theme?.colors?.success || '#10b981' : theme?.colors?.textMuted || '#9ca3af' }} />
                  <span className="text-sm font-medium" style={{ color: connected ? theme?.colors?.textSecondary || '#d1d5db' : theme?.colors?.textMuted || '#9ca3af' }}>
                    Settings
                  </span>
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

export default UserDashboard