'use client'

import { useCallback } from 'react'
import { usePhantomWallet } from '@/contexts/PhantomWalletContext'
// Removed Phantom SDK dependency - using standard wallet adapter

interface PhantomWalletButtonProps {
  className?: string
  onConnect?: () => void
  onDisconnect?: () => void
  showBalance?: boolean
  variant?: 'primary' | 'secondary' | 'outline'
  size?: 'sm' | 'md' | 'lg'
}

export function PhantomWalletButton({
  className = '',
  onConnect,
  onDisconnect,
  showBalance = true,
  variant = 'primary',
  size = 'md'
}: PhantomWalletButtonProps) {
  const {
    isConnected,
    connecting,
    publicKey,
    connect,
    disconnect,
    getBalance,
    error,
    clearError
  } = usePhantomWallet()

  const handleConnect = useCallback(async () => {
    clearError()
    try {
      await connect()
      onConnect?.()
    } catch (err) {
      console.error('Connection failed:', err)
    }
  }, [connect, onConnect, clearError])

  const handleDisconnect = useCallback(async () => {
    try {
      await disconnect()
      onDisconnect?.()
    } catch (err) {
      console.error('Disconnection failed:', err)
    }
  }, [disconnect, onDisconnect])

  const formatAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`
  }

  const formatBalance = async () => {
    if (!isConnected || !showBalance) return null

    try {
      const balance = await getBalance()
      return (balance / 1e9).toFixed(4) // Convert lamports to SOL
    } catch (err) {
      console.error('Failed to get balance:', err)
      return null
    }
  }

  const getVariantClasses = () => {
    const baseClasses = 'inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed'

    const sizeClasses = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2 text-sm',
      lg: 'px-6 py-3 text-base'
    }

    const variantClasses = {
      primary: 'bg-blue-600 hover:bg-blue-700 text-white border border-blue-600',
      secondary: 'bg-gray-600 hover:bg-gray-700 text-white border border-gray-600',
      outline: 'bg-transparent hover:bg-gray-50 text-gray-700 border border-gray-300'
    }

    return `${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]}`
  }

  if (isConnected && publicKey) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <button
          onClick={handleDisconnect}
          className={getVariantClasses()}
          disabled={connecting}
        >
          <div className="w-4 h-4 rounded-full bg-purple-500 mr-2" />
          <span>{formatAddress(publicKey.toString())}</span>
          {showBalance && (
            <span className="ml-2 text-xs opacity-75">
              {formatBalance().then(balance => balance && `${balance} SOL`)}
            </span>
          )}
        </button>

        {error && (
          <div className="text-red-500 text-xs ml-2">
            {error}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        onClick={handleConnect}
        className={getVariantClasses()}
        disabled={connecting}
      >
        {connecting ? (
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

export default PhantomWalletButton