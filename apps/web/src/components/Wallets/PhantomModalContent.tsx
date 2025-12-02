'use client'

import React, { useState } from 'react'
import { X, Wallet, ArrowLeft } from 'lucide-react'
import { usePhantomConnect } from '@/contexts/PhantomConnectContext'
import { useThemeConfig } from '@/lib/theme'

interface PhantomModalContentProps {
  onClose: () => void
}

export function PhantomModalContent({ onClose }: PhantomModalContentProps) {
  const theme = useThemeConfig()
  const [activeTab, setActiveTab] = useState<'connect' | 'social'>('connect')
  const { connect, connectWithGoogle, connectWithApple, isConnected, isConnecting, error, clearError } = usePhantomConnect()

  const handleClose = () => {
    clearError()
    onClose()
  }

  const handleDirectConnect = async () => {
    try {
      clearError()
      await connect()
      onClose()
    } catch (error) {
      console.error('Direct connect failed:', error)
    }
  }

  const handleGoogleConnect = async () => {
    try {
      clearError()
      await connectWithGoogle()
      onClose()
    } catch (error) {
      console.error('Google connect failed:', error)
    }
  }

  const handleAppleConnect = async () => {
    try {
      clearError()
      await connectWithApple()
      onClose()
    } catch (error) {
      console.error('Apple connect failed:', error)
    }
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2
          className="text-xl font-bold"
          style={{ color: theme.colors.textPrimary }}
        >
          Connect Wallet
        </h2>
        <button
          onClick={handleClose}
          className="p-2 rounded-lg transition-colors"
          style={{
            color: theme.colors.textMuted,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = `${theme.colors.surfaceHover}50`
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Description */}
      <p
        className="text-center mb-4 text-sm"
        style={{ color: theme.colors.textSecondary }}
      >
        Connect with Phantom using your preferred method
      </p>

      {/* Error Display */}
      {error && (
        <div
          className="mb-6 p-3 rounded-lg text-sm"
          style={{
            background: `${theme.colors.error}10`,
            border: `1px solid ${theme.colors.error}20`,
            color: theme.colors.error
          }}
        >
          <div className="flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={clearError}
              className="ml-2 text-xs underline hover:opacity-70"
              style={{ color: theme.colors.error }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('connect')}
          className={`flex-1 py-2 px-4 rounded-lg font-medium text-sm transition-all ${
            activeTab === 'connect'
              ? 'bg-purple-500 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Direct Connect
        </button>
        <button
          onClick={() => setActiveTab('social')}
          className={`flex-1 py-2 px-4 rounded-lg font-medium text-sm transition-all ${
            activeTab === 'social'
              ? 'bg-purple-500 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Social Login
        </button>
      </div>

      {/* Direct Connect Tab */}
      {activeTab === 'connect' && (
        <div className="space-y-4">
          <button
            onClick={handleDirectConnect}
            disabled={isConnecting || isConnected}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: `
                linear-gradient(135deg,
                  ${theme.colors.primary}dd 0%,
                  ${theme.colors.primary}cc 50%,
                  ${theme.colors.primary}dd 100%
                ),
                radial-gradient(circle at 30% 30%,
                  ${theme.colors.primary}20 0%,
                  transparent 50%
                )
              `,
              color: '#ffffff',
              border: `1px solid ${theme.colors.primary}30`,
              boxShadow: `
                0 8px 24px ${theme.colors.primary}30,
                inset 0 1px 0 rgba(255, 255, 255, 0.3)
              `,
              fontFamily: 'var(--font-helvetica)',
              fontWeight: 600,
              letterSpacing: '0.025em'
            }}
          >
            <img
              src="/assets/Phantom/Phantom-Icon-Purple.svg"
              alt="Phantom Wallet"
              className="w-6 h-6"
            />
            <div className="text-left">
              <div className="font-semibold">Connect Phantom</div>
              <div className="text-xs opacity-80">Browser extension</div>
            </div>
          </button>

          {isConnected && (
            <div
              className="text-center p-3 rounded-lg"
              style={{
                background: `${theme.colors.success}10`,
                border: `1px solid ${theme.colors.success}20`,
                color: theme.colors.success
              }}
            >
              ✅ Already connected with Phantom
            </div>
          )}
        </div>
      )}

      {/* Social Login Tab */}
      {activeTab === 'social' && (
        <div className="space-y-3">
          <button
            onClick={handleGoogleConnect}
            disabled={isConnecting}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: theme.name === 'light'
                ? '#ffffff'
                : `${theme.colors.surface}cc`,
              color: theme.colors.textPrimary,
              border: `1px solid ${theme.colors.border}`,
              boxShadow: `
                0 4px 12px ${theme.colors.shadowLight},
                inset 0 1px 0 rgba(255, 255, 255, 0.1)
              `
            }}
          >
            <div className="w-6 h-6 flex items-center justify-center rounded" style={{ background: '#4285f4' }}>
              <span className="text-white font-bold text-xs">G</span>
            </div>
            <div className="text-left flex-1">
              <div className="font-semibold">Continue with Google</div>
              <div className="text-xs opacity-70">Fast & secure login</div>
            </div>
          </button>

          <button
            onClick={handleAppleConnect}
            disabled={isConnecting}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: theme.name === 'light'
                ? '#000000'
                : `${theme.colors.surface}cc`,
              color: theme.name === 'light' ? '#ffffff' : theme.colors.textPrimary,
              border: `1px solid ${theme.colors.border}`,
              boxShadow: `
                0 4px 12px ${theme.colors.shadowLight},
                inset 0 1px 0 rgba(255, 255, 255, 0.1)
              `
            }}
          >
            <div className="w-6 h-6 flex items-center justify-center rounded">
              <span className="text-white font-bold text-sm">🍎</span>
            </div>
            <div className="text-left flex-1">
              <div className="font-semibold">Continue with Apple</div>
              <div className="text-xs opacity-70">Private & secure</div>
            </div>
          </button>

          <div
            className="text-xs text-center mt-4 p-3 rounded-lg"
            style={{
              background: `${theme.colors.primary}05`,
              border: `1px solid ${theme.colors.primary}10`,
              color: theme.colors.textSecondary
            }}
          >
            Social login requires Phantom Connect SDK configuration
          </div>
        </div>
      )}

      {/* Loading State */}
      {isConnecting && (
        <div className="flex items-center justify-center py-4">
          <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          <span
            className="ml-3 text-sm font-medium"
            style={{ color: theme.colors.textSecondary }}
          >
            Connecting...
          </span>
        </div>
      )}
    </>
  )
}