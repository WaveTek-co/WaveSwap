'use client'

import React, { useState, useEffect } from 'react'
import { zcashPoolService, ZcashTransaction, formatAmount, getStatusColor, getStatusText } from '@/lib/services/zcashPoolService'
import { ZcashDepositQR } from './ZcashDepositQR'
import { useThemeConfig, createGlassStyles, createInputStyles } from '@/lib/theme'
import { useComingSoon } from '@/components/ui/ComingSoonModal'

interface ZcashBridgeFlowProps {
  userId: string
  isDepositing: boolean
  onDepositComplete?: (amount: number) => void
  onWithdrawalComplete?: () => void
  zcashWalletAddress?: string
  onBack?: () => void
}

export function ZcashBridgeFlow({ userId, isDepositing, onDepositComplete, onWithdrawalComplete, zcashWalletAddress, onBack }: ZcashBridgeFlowProps) {
  const [pool, setPool] = useState<any>(null)
  const [poolBalance, setPoolBalance] = useState(0)
  const [transactions, setTransactions] = useState<ZcashTransaction[]>([])
  const [currentFlow, setCurrentFlow] = useState<'deposit' | 'withdraw'>('deposit')
  const [withdrawalAmount, setWithdrawalAmount] = useState('')
  const [withdrawalAddress, setWithdrawalAddress] = useState(zcashWalletAddress || '')
  const [isProcessing, setIsProcessing] = useState(false)
  const [showQR, setShowQR] = useState(false)
  const theme = useThemeConfig()

  // Coming soon hook
  const { showComingSoon } = useComingSoon()

  useEffect(() => {
    if (userId) {
      initializePool()
    }
  }, [userId])

  useEffect(() => {
    loadTransactions()
  }, [userId])

  useEffect(() => {
    if (zcashWalletAddress) {
      setWithdrawalAddress(zcashWalletAddress)
    }
  }, [zcashWalletAddress])

  const initializePool = async () => {
    try {
      const userPool = await zcashPoolService.getUserPool(userId)
      setPool(userPool)
      const balance = await zcashPoolService.getPoolBalance(userId)
      setPoolBalance(balance)
    } catch (error) {
      console.error('Failed to initialize pool:', error)
    }
  }

  const loadTransactions = async () => {
    try {
      const txHistory = await zcashPoolService.getTransactionHistory(userId)
      setTransactions(txHistory)
    } catch (error) {
      console.error('Failed to load transactions:', error)
    }
  }

  const handleDepositAmount = (amount: number) => {
    setShowQR(true)
    // Show coming soon message for Zcash deposits
    showComingSoon('Zcash Deposits')
  }

  const handleWithdrawal = async () => {
    if (!withdrawalAmount || !withdrawalAddress) {
      alert('Please enter withdrawal amount and destination address')
      return
    }

    try {
      setIsProcessing(true)
      const amount = parseFloat(withdrawalAmount)
      const transaction = await zcashPoolService.processWithdrawal(userId, amount, withdrawalAddress)

      // Monitor transaction status
      const checkStatus = async () => {
        const status = zcashPoolService.getTransactionStatus(transaction.id)
        if (status === 'completed') {
          setIsProcessing(false)
          initializePool() // Refresh pool balance
          loadTransactions() // Refresh transactions
          if (onWithdrawalComplete) {
            onWithdrawalComplete()
          }
        } else if (status === 'failed') {
          setIsProcessing(false)
          initializePool() // Refresh pool balance
          loadTransactions() // Refresh transactions
        } else if (status === 'pending' || status === 'confirmed') {
          setTimeout(checkStatus, 2000) // Check again in 2 seconds
        }
      }

      setTimeout(checkStatus, 1000) // Start checking after 1 second
      setWithdrawalAmount('')
      setWithdrawalAddress('')
    } catch (error: any) {
      setIsProcessing(false)
      alert(error.message || 'Failed to process withdrawal')
    }
  }

  const getTransactionIcon = (type: 'deposit' | 'withdrawal') => {
    return type === 'deposit' ? '⬇️' : '⬆️'
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onBack}
          className="flex items-center space-x-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
        >
          ← Back
        </button>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Zcash Bridge
        </h2>
        <div className="w-8"></div> {/* Spacer */}
      </div>

      {/* Pool Balance Card */}
      <div
        className="rounded-xl p-6 mb-6"
        style={{
          ...createGlassStyles(theme),
          background: `
            linear-gradient(135deg,
              ${theme.colors.primary}15 0%,
              ${theme.colors.primary}10 50%,
              ${theme.colors.primary}15 100%
            ),
            radial-gradient(circle at 30% 30%,
              ${theme.colors.primary}20 0%,
              transparent 60%
            )
          `,
          border: `2px solid ${theme.colors.primary}40`,
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium" style={{ color: theme.colors.textSecondary }}>
              Your Zcash Pool Balance
            </p>
            <p className="text-3xl font-bold" style={{ color: theme.colors.textPrimary, fontFamily: 'var(--font-helvetica)' }}>
              {formatAmount(poolBalance)} ZEC
            </p>
          </div>
          <div className="text-right">
            <div className="text-4xl">🏛️</div>
            <p className="text-sm" style={{ color: theme.colors.textSecondary, fontFamily: 'var(--font-inter)' }}>
              Zcash Mainnet
            </p>
          </div>
        </div>
      </div>

      {/* Flow Toggle */}
      <div
        className="rounded-lg p-1 mb-6"
        style={{
          ...createGlassStyles(theme),
          background: theme.name === 'light' || theme.name === 'ghost'
            ? 'rgba(255, 255, 255, 0.5)'
            : theme.colors.surface + '80',
          border: `1px solid ${theme.colors.border}`,
        }}
      >
        <button
          onClick={() => setCurrentFlow('deposit')}
          className={`flex-1 py-2 px-4 rounded-md font-medium transition-all ${
            currentFlow === 'deposit'
              ? ''
              : ''
          }`}
          style={{
            background: currentFlow === 'deposit'
              ? `linear-gradient(135deg, ${theme.colors.primary}25 0%, ${theme.colors.primary}15 100%)`
              : 'transparent',
            color: currentFlow === 'deposit'
              ? theme.colors.primary
              : theme.colors.textSecondary,
            border: currentFlow === 'deposit'
              ? `1px solid ${theme.colors.primary}40`
              : '1px solid transparent',
            boxShadow: currentFlow === 'deposit'
              ? `0 4px 12px ${theme.colors.primary}20`
              : 'none',
            fontFamily: 'var(--font-helvetica)',
            transition: `all ${theme.animations.duration} ${theme.animations.easing}`,
          }}
          onMouseEnter={(e) => {
            if (currentFlow !== 'deposit') {
              e.currentTarget.style.background = theme.colors.surfaceHover + '40'
              e.currentTarget.style.color = theme.colors.textPrimary
            }
          }}
          onMouseLeave={(e) => {
            if (currentFlow !== 'deposit') {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = theme.colors.textSecondary
            }
          }}
        >
          Deposit ZEC → Solana
        </button>
        <button
          onClick={() => setCurrentFlow('withdraw')}
          className={`flex-1 py-2 px-4 rounded-md font-medium transition-all`}
          style={{
            background: currentFlow === 'withdraw'
              ? `linear-gradient(135deg, ${theme.colors.primary}25 0%, ${theme.colors.primary}15 100%)`
              : 'transparent',
            color: currentFlow === 'withdraw'
              ? theme.colors.primary
              : theme.colors.textSecondary,
            border: currentFlow === 'withdraw'
              ? `1px solid ${theme.colors.primary}40`
              : '1px solid transparent',
            boxShadow: currentFlow === 'withdraw'
              ? `0 4px 12px ${theme.colors.primary}20`
              : 'none',
            fontFamily: 'var(--font-helvetica)',
            transition: `all ${theme.animations.duration} ${theme.animations.easing}`,
          }}
          onMouseEnter={(e) => {
            if (currentFlow !== 'withdraw') {
              e.currentTarget.style.background = theme.colors.surfaceHover + '40'
              e.currentTarget.style.color = theme.colors.textPrimary
            }
          }}
          onMouseLeave={(e) => {
            if (currentFlow !== 'withdraw') {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = theme.colors.textSecondary
            }
          }}
        >
          Withdraw ZEC → Solana
        </button>
      </div>

      {/* Flow Content */}
      {currentFlow === 'deposit' && (
        <div
          className="rounded-xl p-6"
          style={{
            ...createGlassStyles(theme),
            background: theme.name === 'light' || theme.name === 'ghost'
              ? 'rgba(255, 255, 255, 0.95)'
              : theme.colors.surface + 'f8',
            border: `1px solid ${theme.colors.border}`,
          }}
        >
          <div className="text-center mb-6">
            <h3 className="text-xl font-semibold mb-2" style={{ color: theme.colors.textPrimary, fontFamily: 'var(--font-helvetica)' }}>
              Deposit ZEC to Your Pool
            </h3>
            <p style={{ color: theme.colors.textSecondary, fontFamily: 'var(--font-inter)' }}>
              Your deposited ZEC will be available for bridging to Solana
            </p>
          </div>

          {/* Deposit QR Code */}
          <ZcashDepositQR
            depositAddress={pool?.depositAddress || ''}
            memo={pool?.depositMemo}
            onDepositDetected={handleDepositAmount}
          />

          {/* Recent Transactions */}
          {transactions.length > 0 && (
            <div className="mt-8">
              <h4 className="text-lg font-semibold mb-4" style={{ color: theme.colors.textPrimary, fontFamily: 'var(--font-helvetica)' }}>
                Recent Transactions
              </h4>
              <div className="space-y-3">
                {transactions.slice(0, 5).map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between p-3 rounded-lg transition-all hover:scale-[1.01]"
                    style={{
                      ...createGlassStyles(theme),
                      background: theme.name === 'light' || theme.name === 'ghost'
                        ? 'rgba(255, 255, 255, 0.6)'
                        : theme.colors.surface + '60',
                      border: `1px solid ${theme.colors.border}`,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = theme.colors.primary + '50'
                      e.currentTarget.style.boxShadow = `0 4px 12px ${theme.colors.primary}15`
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = theme.colors.border
                      e.currentTarget.style.boxShadow = createGlassStyles(theme).boxShadow
                    }}
                  >
                    <div className="flex items-center space-x-3">
                      <span className="text-2xl">{getTransactionIcon(tx.type)}</span>
                      <div>
                        <p className="font-medium" style={{ color: theme.colors.textPrimary, fontFamily: 'var(--font-helvetica)' }}>
                          {tx.type === 'deposit' ? 'Deposit' : 'Withdrawal'}
                        </p>
                        <p className="text-sm" style={{ color: theme.colors.textSecondary, fontFamily: 'var(--font-inter)' }}>
                          {formatAmount(tx.amount)} ZEC
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className="px-2 py-1 rounded text-xs font-medium"
                        style={{
                          backgroundColor: getStatusColor(tx.status) + '20',
                          color: getStatusColor(tx.status),
                          fontFamily: 'var(--font-helvetica)',
                        }}
                      >
                        {getStatusText(tx.status)}
                      </div>
                      <p className="text-xs mt-1" style={{ color: theme.colors.textMuted, fontFamily: 'var(--font-jetbrains)' }}>
                        {new Date(tx.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {currentFlow === 'withdraw' && (
        <div
          className="rounded-xl p-6"
          style={{
            ...createGlassStyles(theme),
            background: theme.name === 'light' || theme.name === 'ghost'
              ? 'rgba(255, 255, 255, 0.95)'
              : theme.colors.surface + 'f8',
            border: `1px solid ${theme.colors.border}`,
          }}
        >
          <div className="text-center mb-6">
            <h3 className="text-xl font-semibold mb-2" style={{ color: theme.colors.textPrimary, fontFamily: 'var(--font-helvetica)' }}>
              Withdraw ZEC to Solana Address
            </h3>
            <p style={{ color: theme.colors.textSecondary, fontFamily: 'var(--font-inter)' }}>
              Enter your Solana address to receive ZEC from your pool
            </p>
          </div>

          {/* Withdrawal Form */}
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: theme.colors.textSecondary, fontFamily: 'var(--font-helvetica)' }}>
                Amount (ZEC)
              </label>
              <input
                type="number"
                value={withdrawalAmount}
                onChange={(e) => setWithdrawalAmount(e.target.value)}
                placeholder="0.00"
                max={poolBalance}
                step="0.00000001"
                className="w-full px-4 py-2 rounded-lg transition-all"
                style={{
                  ...createInputStyles(theme),
                  fontFamily: 'var(--font-jetbrains)',
                }}
                disabled={isProcessing}
              />
              <p className="mt-1 text-sm" style={{ color: theme.colors.textMuted, fontFamily: 'var(--font-inter)' }}>
                Available: {formatAmount(poolBalance)} ZEC
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: theme.colors.textSecondary, fontFamily: 'var(--font-helvetica)' }}>
                Solana Destination Address
              </label>
              <input
                type="text"
                value={withdrawalAddress}
                onChange={(e) => setWithdrawalAddress(e.target.value)}
                placeholder="Enter your Solana wallet address..."
                className="w-full px-4 py-2 rounded-lg transition-all"
                style={{
                  ...createInputStyles(theme),
                  fontFamily: 'var(--font-jetbrains)',
                }}
                disabled={isProcessing}
              />
            </div>

            <button
              onClick={handleWithdrawal}
              disabled={isProcessing || !withdrawalAmount || !withdrawalAddress || parseFloat(withdrawalAmount) > poolBalance}
              className="w-full py-3 px-4 rounded-lg font-medium transition-all hover:scale-[1.01] disabled:scale-100 disabled:cursor-not-allowed"
              style={{
                background: isProcessing || !withdrawalAmount || !withdrawalAddress || parseFloat(withdrawalAmount) > poolBalance
                  ? `${theme.colors.textMuted}50`
                  : `linear-gradient(135deg, ${theme.colors.primary} 0%, ${theme.colors.primary}cc 100%)`,
                color: (isProcessing || !withdrawalAmount || !withdrawalAddress || parseFloat(withdrawalAmount) > poolBalance)
                  ? theme.colors.textMuted
                  : '#FFFFFF',
                border: `1px solid ${theme.colors.primary}50`,
                boxShadow: isProcessing || !withdrawalAmount || !withdrawalAddress || parseFloat(withdrawalAmount) > poolBalance
                  ? 'none'
                  : `0 4px 12px ${theme.colors.primary}30`,
                fontFamily: 'var(--font-helvetica)',
                transition: `all ${theme.animations.duration} ${theme.animations.easing}`,
              }}
              onMouseEnter={(e) => {
                if (!isProcessing && withdrawalAmount && withdrawalAddress && parseFloat(withdrawalAmount) <= poolBalance) {
                  e.currentTarget.style.transform = 'scale(1.02)'
                  e.currentTarget.style.boxShadow = `0 6px 20px ${theme.colors.primary}40`
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)'
                e.currentTarget.style.boxShadow = `0 4px 12px ${theme.colors.primary}30`
              }}
            >
              {isProcessing ? (
                <span className="flex items-center justify-center">
                  <div
                    className="animate-spin rounded-full h-4 w-4 border-b-2 mr-2"
                    style={{ borderColor: 'currentColor' }}
                  ></div>
                  Processing...
                </span>
              ) : (
                'Withdraw ZEC'
              )}
            </button>
          </div>

          {/* Withdrawal Instructions */}
          <div
            className="mt-6 p-4 rounded-lg"
            style={{
              ...createGlassStyles(theme),
              background: `
                linear-gradient(135deg,
                  ${theme.colors.warning}15 0%,
                  ${theme.colors.warning}10 50%,
                  ${theme.colors.warning}15 100%
                ),
                radial-gradient(circle at 30% 30%,
                  ${theme.colors.warning}20 0%,
                  transparent 60%
                )
              `,
              border: `1px solid ${theme.colors.warning}40`,
            }}
          >
            <h4 className="font-semibold mb-2" style={{ color: theme.colors.warning, fontFamily: 'var(--font-helvetica)' }}>
              ⚠️ Withdrawal Information
            </h4>
            <ul className="text-sm space-y-1" style={{ color: theme.colors.textSecondary, fontFamily: 'var(--font-inter)' }}>
              <li>• Withdrawals typically take 5-10 seconds to process</li>
              <li>• A small network fee will be deducted</li>
              <li>• Make sure your Solana address is correct</li>
              <li>• ZEC will arrive in your Solana wallet after processing</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}