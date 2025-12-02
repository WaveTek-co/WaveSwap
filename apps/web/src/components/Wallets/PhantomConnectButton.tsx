'use client'

import React, { useState, useCallback } from 'react'
import { usePhantomConnect } from '@/contexts/PhantomConnectContext'
import { PublicKey } from '@solana/web3.js'

interface PhantomConnectButtonProps {
  className?: string
  onConnect?: () => void
  onDisconnect?: () => void
  showBalance?: boolean
  variant?: 'primary' | 'secondary' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  showGoogleOption?: boolean
}

export function PhantomConnectButton({
  className = '',
  onConnect,
  onDisconnect,
  showBalance = true,
  variant = 'primary',
  size = 'md',
  showGoogleOption = true
}: PhantomConnectButtonProps) {
  const {
    isConnected,
    isConnecting,
    solanaAddress,
    connect,
    connectWithGoogle,
    disconnect: disconnectPhantom,
    getBalance,
    error,
    clearError
  } = usePhantomConnect()

  const [showDropdown, setShowDropdown] = useState(false)

  const formatAddress = (address: PublicKey) => {
    const addressStr = address.toString()
    return `${addressStr.slice(0, 4)}...${addressStr.slice(-4)}`
  }

  const getBalanceDisplay = useCallback(async () => {
    if (!isConnected || !showBalance) return null

    try {
      const balance = await getBalance()
      return (balance / 1e9).toFixed(4) // Convert lamports to SOL
    } catch (err) {
      console.error('Failed to get balance:', err)
      return null
    }
  }, [isConnected, showBalance, getBalance])

  const getVariantClasses = () => {
    const baseClasses = 'inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed'

    const sizeClasses = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2 text-sm',
      lg: 'px-6 py-3 text-base'
    }

    const variantClasses = {
      primary: 'bg-purple-600 hover:bg-purple-700 text-white border border-purple-600',
      secondary: 'bg-gray-600 hover:bg-gray-700 text-white border border-gray-600',
      outline: 'bg-transparent hover:bg-gray-50 text-gray-700 border border-gray-300'
    }

    return `${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]}`
  }

  const handleConnectStandard = useCallback(async () => {
    clearError()
    try {
      await connect()
      onConnect?.()
    } catch (err) {
      console.error('Connection failed:', err)
    }
  }, [connect, onConnect, clearError])

  const handleConnectGoogle = useCallback(async () => {
    clearError()
    try {
      await connectWithGoogle()
      onConnect?.()
    } catch (err) {
      console.error('Google connection failed:', err)
    }
  }, [connectWithGoogle, onConnect, clearError])

  const handleDisconnectClick = useCallback(async () => {
    try {
      await disconnectPhantom()
      onDisconnect?.()
      setShowDropdown(false)
    } catch (err) {
      console.error('Disconnection failed:', err)
    }
  }, [disconnectPhantom, onDisconnect])

  if (isConnected && solanaAddress) {
    return (
      <div className={`relative ${className}`}>
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className={getVariantClasses()}
          disabled={isConnecting}
        >
          <div className="w-4 h-4 rounded-full bg-green-500 mr-2" />
          <span>{formatAddress(solanaAddress)}</span>
          {showBalance && (
            <span className="ml-2 text-xs opacity-75">
              <BalanceAsync getBalance={getBalanceDisplay} />
            </span>
          )}
          <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showDropdown && (
          <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
            <div className="px-4 py-2 border-b border-gray-100">
              <p className="text-sm font-medium text-gray-900">Connected</p>
              <p className="text-xs text-gray-500">{formatAddress(solanaAddress)}</p>
            </div>
            <button
              onClick={handleDisconnectClick}
              className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              Disconnect
            </button>
          </div>
        )}

        {error && (
          <div className="text-red-500 text-xs mt-2">
            {error}
          </div>
        )}
      </div>
    )
  }

  if (showGoogleOption) {
    return (
      <div className={`relative ${className}`}>
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className={getVariantClasses()}
          disabled={isConnecting}
        >
          {isConnecting ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
              Connecting...
            </>
          ) : (
            <>
              <div className="w-4 h-4 rounded-full bg-purple-500 mr-2" />
              Connect Wallet
              <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </>
          )}
        </button>

        {showDropdown && !isConnecting && (
          <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
            <div className="px-4 py-2 border-b border-gray-100">
              <p className="text-sm font-medium text-gray-900">Choose Connection Method</p>
            </div>

            <button
              onClick={handleConnectGoogle}
              className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-center"
            >
              <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <span className="text-sm font-medium">Continue with Google</span>
            </button>

            <button
              onClick={handleConnectStandard}
              className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-center"
            >
              <div className="w-5 h-5 rounded-full bg-purple-500 mr-3" />
              <span className="text-sm font-medium">Phantom Extension</span>
            </button>
          </div>
        )}

        {error && (
          <div className="text-red-500 text-xs mt-2">
            {error}
          </div>
        )}
      </div>
    )
  }

  // Simple connect button
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        onClick={handleConnectStandard}
        className={getVariantClasses()}
        disabled={isConnecting}
      >
        {isConnecting ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
            Connecting...
          </>
        ) : (
          <>
            <div className="w-4 h-4 rounded-full bg-purple-500 mr-2" />
            Connect Phantom
          </>
        )}
      </button>

      {error && (
        <div className="text-red-500 text-xs">
          {error}
        </div>
      )}
    </div>
  )
}

// Helper component for async balance display
function BalanceAsync({ getBalance }: { getBalance: () => Promise<string | null> }) {
  const [balance, setBalance] = useState<string | null>(null)

  React.useEffect(() => {
    getBalance().then(setBalance)
  }, [getBalance])

  return balance ? `${balance} SOL` : 'Loading...'
}

export default PhantomConnectButton