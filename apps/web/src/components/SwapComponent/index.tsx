'use client'

import { useState, useMemo } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { ArrowsUpDownIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { TokenSelectorNew as TokenSelector } from './TokenSelectorNew'
import { AmountInput } from './AmountInput'
import { SwapButton } from './SwapButton'
import { useSwap } from '@/hooks/useSwap'
import { Token, SwapStatus } from '@/types/token'

interface SwapComponentProps {
  privacyMode: boolean
}

// Recommended tokens to show initially
const RECOMMENDED_TOKENS = [
  'So11111111111111111111111111111111111111112', // SOL
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
]

export function SwapComponent({ privacyMode }: SwapComponentProps) {
  const { publicKey } = useWallet()

  const {
    inputToken,
    outputToken,
    inputAmount,
    outputAmount,
    quote,
    balances,
    isLoading,
    error,
    progress,
    availableTokens,
    setInputToken,
    setOutputToken,
    setInputAmount,
    swap,
    getQuote,
    refreshBalances,
    clearQuote,
    clearError,
    cancelSwap
  } = useSwap(privacyMode, publicKey)

  // Handle input amount change
  const handleInputChange = (amount: string) => {
    setInputAmount(amount)
  }

  // Optimized token list for selector (user tokens + recommended tokens only)
  const optimizedTokens = useMemo(() => {
    if (!availableTokens || availableTokens.length === 0) return []

    // 1. User tokens with balance
    const userTokens = availableTokens.filter(token => {
      if (!balances) return false
      const balance = balances.get(token.address)
      return balance && parseFloat(balance) > 0
    })

    // 2. Recommended tokens (if not already in user tokens)
    const recommendedTokens = availableTokens.filter(token =>
      RECOMMENDED_TOKENS.includes(token.address) &&
      !userTokens.find(ut => ut.address === token.address)
    )

    return [...userTokens, ...recommendedTokens]
  }, [availableTokens, balances])

  // Ensure we always have valid tokens with safe fallbacks
  const safeInputToken = inputToken || availableTokens[1] || availableTokens[0] || null
  const safeOutputToken = outputToken || availableTokens[0] || availableTokens[1] || null

  // Handle token switch
  const handleTokenSwitch = () => {
    if (safeInputToken && safeOutputToken) {
      setInputToken(safeOutputToken)
      setOutputToken(safeInputToken)
      setInputAmount('')
      clearQuote()
    }
  }

  // Handle input token change
  const handleInputTokenChange = (token: Token) => {
    setInputToken(token)
    if (safeOutputToken && token.address === safeOutputToken.address) {
      // Find a different token for output
      const availableForOutput = availableTokens.filter(t => t.address !== token.address)
      if (availableForOutput.length > 0) {
        const newToken = availableForOutput[0]
        if (newToken) {
          setOutputToken(newToken)
        }
      }
    }
    setInputAmount('')
    clearQuote()
  }

  // Handle output token change
  const handleOutputTokenChange = (token: Token) => {
    setOutputToken(token)
    if (safeInputToken && token.address === safeInputToken.address) {
      // Find a different token for input
      const availableForInput = availableTokens.filter(t => t.address !== token.address)
      if (availableForInput.length > 0) {
        const newToken = availableForInput[0]
        if (newToken) {
          setInputToken(newToken)
        }
      }
    }
    setInputAmount('')
    clearQuote()
  }

  // Handle swap execution
  const handleSwap = async () => {
    try {
      await swap()
    } catch (error) {
      console.error('Swap failed:', error)
      // Error is already handled by useSwap hook
    }
  }

  // Get input and output balances
  const inputBalance = safeInputToken?.address ? (balances.get(safeInputToken.address) || '0') : '0'
  const outputBalance = safeOutputToken?.address ? (balances.get(safeOutputToken.address) || '0') : '0'

  const inputBalanceFormatted = safeInputToken ? (() => {
    const amount = parseFloat(inputBalance) / Math.pow(10, safeInputToken.decimals || 9)
    if (amount === 0) return '0'
    if (amount < 0.001) return '<0.001'
    if (amount < 1) return amount.toFixed(4)
    if (amount < 1000) return amount.toFixed(2)
    return amount.toLocaleString(undefined, { maximumFractionDigits: 2 })
  })() : '0'

  const outputBalanceFormatted = safeOutputToken ? (() => {
    const amount = parseFloat(outputBalance) / Math.pow(10, safeOutputToken.decimals || 9)
    if (amount === 0) return '0'
    if (amount < 0.001) return '<0.001'
    if (amount < 1) return amount.toFixed(4)
    if (amount < 1000) return amount.toFixed(2)
    return amount.toLocaleString(undefined, { maximumFractionDigits: 2 })
  })() : '0'

  // Enhanced balance formatting - show real balances always
  const displayInputBalance = inputBalanceFormatted
  const displayOutputBalance = outputBalanceFormatted

  // Check if swap is possible
  const canSwap = !!(publicKey && safeInputToken && safeOutputToken && inputAmount && parseFloat(inputAmount) > 0 && !isLoading)
  const isProgressActive = !!(progress && progress.status !== SwapStatus.IDLE && progress.status !== SwapStatus.COMPLETED)

  // Calculate price impact with safe fallback
  const priceImpact = quote && typeof quote.priceImpactPct === 'number' ? quote.priceImpactPct : 0

  // Map regular tokens to confidential versions when privacy mode is enabled
  const getConfidentialToken = (token: Token | null): Token | null => {
    if (!token || !privacyMode) return token

    // Map regular tokens to their confidential equivalents
    const confidentialMap: { [key: string]: Token } = {
      'So11111111111111111111111111111111111111112': { // SOL
        ...token,
        address: 'cSo11111111111111111111111111111111111111112',
        symbol: 'cSOL',
        name: 'Confidential SOL'
      },
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { // USDC
        ...token,
        address: 'cEPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        symbol: 'cUSDC',
        name: 'Confidential USDC'
      },
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': { // USDT
        ...token,
        address: 'cEs9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
        symbol: 'cUSDT',
        name: 'Confidential USDT'
      }
    }

    return confidentialMap[token.address] || token
  }

  // Ensure token references are consistent throughout calculations
  const displayInputToken = inputToken || safeInputToken || null
  const displayOutputToken = outputToken || safeOutputToken || null

  // Show confidential versions in display when privacy mode is enabled
  const displayOutputTokenConfidential = getConfidentialToken(displayOutputToken)

  return (
    <div className="w-full max-w-xl mx-auto">
      {/* Swap Card */}
      <div className="relative">
        {/* Privacy Mode Indicator */}
        {privacyMode && (
          <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 backdrop-blur-sm">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-xs font-medium text-emerald-400">Privacy Mode Active</span>
            </div>
          </div>
        )}

        {/* Main Swap Card */}
        <div
          className="relative p-6 space-y-6 w-full rounded-2xl overflow-hidden"
          style={{
            background: `
              linear-gradient(135deg,
                rgba(30, 30, 45, 0.85) 0%,
                rgba(45, 45, 65, 0.8) 25%,
                rgba(30, 30, 45, 0.85) 50%,
                rgba(45, 45, 65, 0.8) 75%,
                rgba(30, 30, 45, 0.85) 100%
              ),
              radial-gradient(circle at 25% 25%,
                rgba(162, 89, 250, 0.05) 0%,
                transparent 50%
              ),
              radial-gradient(circle at 75% 75%,
                rgba(16, 185, 129, 0.03) 0%,
                transparent 50%
              )
            `,
            border: '1px solid rgba(162, 89, 250, 0.15)',
            backdropFilter: 'blur(24px) saturate(1.8)',
            boxShadow: `
              0 20px 60px rgba(0, 0, 0, 0.4),
              0 8px 24px rgba(162, 89, 250, 0.08),
              inset 0 1px 0 rgba(255, 255, 255, 0.1),
              inset 0 -1px 0 rgba(0, 0, 0, 0.2)
            `
          }}
        >
          {/* Noise grain overlay */}
          <div
            className="absolute inset-0 opacity-4 pointer-events-none"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='200' height='200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3Cfilter%3E%3Crect width='200' height='200' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
              filter: 'contrast(1.2) brightness(1.1)'
            }}
          />
          {/* Progress Display */}
          {progress && isProgressActive && (
            <div
              className="relative z-10 p-4 rounded-xl"
              style={{
                background: `
                  linear-gradient(135deg,
                    rgba(162, 89, 250, 0.1) 0%,
                    rgba(162, 89, 250, 0.05) 50%,
                    rgba(162, 89, 250, 0.1) 100%
                  )
                `,
                border: '1px solid rgba(162, 89, 250, 0.2)',
                backdropFilter: 'blur(16px) saturate(1.5)',
                boxShadow: `
                  0 8px 32px rgba(0, 0, 0, 0.2),
                  inset 0 1px 0 rgba(255, 255, 255, 0.1)
                `
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold" style={{ color: 'var(--wave-purple)' }}>
                  {progress.message}
                </span>
                <button
                  onClick={cancelSwap}
                  className="text-xs font-medium transition-colors px-2 py-1 rounded-md hover:bg-black/20"
                  style={{ color: '#EF4444' }}
                >
                  Cancel
                </button>
              </div>
              <div className="w-full rounded-full h-2 bg-black/50">
                <div
                  className="h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${(progress.currentStep / progress.totalSteps) * 100}%`,
                    background: 'var(--wave-purple)',
                    boxShadow: '0 0 10px rgba(162, 89, 250, 0.5)'
                  }}
                />
              </div>
            </div>
          )}

        {/* You Send Section */}
        <div className="relative z-10 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-bold tracking-wide text-gray-300">
              You Send
            </label>
            <div className="flex items-center gap-2">
              {publicKey && parseFloat(inputBalance) > 0 && safeInputToken && (
                <button
                  onClick={() => {
                    const maxAmount = parseFloat(inputBalance) / Math.pow(10, safeInputToken.decimals || 9)
                    // Use 95% of balance to account for fees
                    const amountWithFees = maxAmount * 0.95
                    setInputAmount(amountWithFees.toString())
                    clearQuote()
                  }}
                  className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors px-2 py-1 rounded-md hover:bg-blue-500/10"
                >
                  MAX
                </button>
              )}
              <span className="text-xs text-gray-500">
                Balance: {displayInputBalance}
              </span>
            </div>
          </div>

          <div className="relative">
            <div className="flex gap-2">
              <div className="flex-1">
                <AmountInput
                  value={inputAmount}
                  onChange={handleInputChange}
                  disabled={isLoading || isProgressActive}
                  placeholder="0.00"
                  className="text-lg font-medium"
                />
              </div>
              <div className="w-32">
                <TokenSelector
                  selectedToken={safeInputToken}
                  onTokenChange={handleInputTokenChange}
                  tokens={optimizedTokens}
                  disabled={isLoading || isProgressActive}
                  privacyMode={privacyMode}
                  showConfidentialIndicator={true}
                  balances={balances}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Switch Button */}
        <div className="flex justify-center -my-2 z-10">
          <button
            onClick={handleTokenSwitch}
            className="glass-card p-2.5 rounded-full transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 bg-gray-800/50 border border-gray-700 hover:border-gray-600"
            disabled={isLoading || isProgressActive}
          >
            <ArrowsUpDownIcon className="h-5 w-5 text-blue-400" />
          </button>
        </div>

        {/* You Receive Section */}
        <div className="relative z-10 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-bold tracking-wide text-gray-300">
              You Receive
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">
                Balance: {displayOutputBalance}
              </span>
              {quote && outputAmount && (
                <span className="text-xs text-green-400">
                  ✓
                </span>
              )}
            </div>
          </div>

          <div className="relative">
            <div className="flex gap-2">
              <div className="flex-1">
                <AmountInput
                  value={outputAmount}
                  onChange={() => {}} // Output is read-only
                  disabled={true}
                  placeholder="0.00"
                  readOnly={true}
                  className="text-lg font-medium opacity-75"
                />
              </div>
              <div className="w-32">
                <TokenSelector
                  selectedToken={safeOutputToken}
                  onTokenChange={handleOutputTokenChange}
                  tokens={optimizedTokens}
                  disabled={isLoading || isProgressActive}
                  privacyMode={privacyMode}
                  showConfidentialIndicator={true}
                  balances={balances}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Advanced Swap Details */}
        {quote && (
          <div
            className="relative z-10 space-y-3 p-4 rounded-xl"
            style={{
              background: `
                linear-gradient(135deg,
                  rgba(16, 185, 129, 0.08) 0%,
                  rgba(16, 185, 129, 0.04) 50%,
                  rgba(16, 185, 129, 0.08) 100%
                ),
                radial-gradient(circle at 50% 0%,
                  rgba(16, 185, 129, 0.02) 0%,
                  transparent 50%
                )
              `,
              border: '1px solid rgba(16, 185, 129, 0.15)',
              backdropFilter: 'blur(20px) saturate(1.6)',
              boxShadow: `
                0 12px 40px rgba(0, 0, 0, 0.25),
                inset 0 1px 0 rgba(255, 255, 255, 0.08),
                0 0 0 1px rgba(16, 185, 129, 0.05)
              `
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-400">Rate</span>
              <span className="text-sm font-semibold text-white">
                {displayInputToken && displayOutputToken && displayOutputTokenConfidential && quote ? (() => {
                  try {
                    const inputDecimals = displayInputToken.decimals || 6
                    const outputDecimals = displayOutputToken.decimals || 9

                    // Use direct property access with fallbacks
                    const quoteAny = quote as any
                    const inputAmount = parseFloat(quoteAny.inAmount || quoteAny.inputAmount || quoteAny.amountIn || '0')
                    const outputAmount = parseFloat(quoteAny.outAmount || quoteAny.outputAmount || quoteAny.amountOut || quoteAny.expectedOutAmount || '0')

                    // If we still have zero amounts, return placeholder
                    if (inputAmount === 0 || outputAmount === 0) {
                      return `1 ${displayInputToken.symbol} = --- ${displayOutputTokenConfidential.symbol}`
                    }

                    // Normalize amounts to their proper decimal places
                    const normalizedInput = inputAmount / Math.pow(10, inputDecimals)
                    const normalizedOutput = outputAmount / Math.pow(10, outputDecimals)

                    // Calculate exchange rate: 1 input token = X output tokens
                    const exchangeRate = normalizedInput > 0 ? normalizedOutput / normalizedInput : 0

                    if (isNaN(exchangeRate) || !isFinite(exchangeRate) || exchangeRate === 0) {
                      return `1 ${displayInputToken.symbol} = --- ${displayOutputTokenConfidential.symbol}`
                    }

                    return `1 ${displayInputToken.symbol} = ${exchangeRate.toFixed(6)} ${displayOutputTokenConfidential.symbol}`
                  } catch (error) {
                    console.error('Price calculation error:', error)
                    return `1 ${displayInputToken.symbol} = --- ${displayOutputTokenConfidential.symbol}`
                  }
                })() : '---'
                }
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-400">Price Impact</span>
              <span
                className={`text-sm font-semibold ${
                  priceImpact > 5 ? 'text-red-400' :
                  priceImpact > 2 ? 'text-yellow-400' :
                  'text-green-400'
                }`}
              >
                {typeof priceImpact === 'number' && !isNaN(priceImpact) ? priceImpact.toFixed(2) : '0.00'}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-400">Minimum Received</span>
              <span className="text-sm font-semibold text-white">
                {displayOutputTokenConfidential && outputAmount && quote ? (() => {
                  try {
                    const outputDecimals = displayOutputToken?.decimals || 9
                    const rawOutputAmount = parseFloat(quote.outputAmount) || 0
                    const normalizedOutput = rawOutputAmount / Math.pow(10, outputDecimals)
                    const minimumReceived = normalizedOutput * 0.98 // 2% slippage

                    if (isNaN(minimumReceived) || !isFinite(minimumReceived)) {
                      return '---'
                    }

                    return minimumReceived.toFixed(6)
                  } catch (error) {
                    return '---'
                  }
                })() : '---'
                } {displayOutputTokenConfidential?.symbol}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-400">Network Fee</span>
              <span className="text-sm font-semibold text-white">
                ~0.000005 SOL
              </span>
            </div>
            {privacyMode && (
              <div className="flex items-center justify-between pt-2 border-t border-gray-700">
                <span className="text-xs font-medium text-emerald-400">Privacy Fee</span>
                <span className="text-sm font-semibold text-emerald-400">
                  ~0.1%
                </span>
              </div>
            )}
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div
            className="glass-card flex items-start gap-3 p-4"
            style={{
              borderColor: error.includes('User rejected') || error.includes('cancelled') ? 'rgba(59, 130, 246, 0.3)' : 'rgba(239, 68, 68, 0.3)',
              backgroundColor: error.includes('User rejected') || error.includes('cancelled') ? 'rgba(59, 130, 246, 0.05)' : 'rgba(239, 68, 68, 0.05)'
            }}
          >
            <ExclamationTriangleIcon
              className="h-5 w-5 flex-shrink-0 mt-0.5"
              style={{ color: error.includes('User rejected') || error.includes('cancelled') ? '#3B82F6' : '#EF4444' }}
            />
            <div className="flex-1">
              <p className="text-sm font-bold" style={{ color: error.includes('User rejected') || error.includes('cancelled') ? '#93C5FD' : '#FCA5A5' }}>
                {error}
              </p>
              {error.includes('User rejected') && (
                <p className="text-xs mt-1 opacity-70" style={{ color: 'var(--wave-text)' }}>
                  You can safely continue using the swap interface.
                </p>
              )}
              {error.includes('insufficient') && (
                <p className="text-xs mt-1 opacity-70" style={{ color: 'var(--wave-text)' }}>
                  Please check your wallet balance and try a smaller amount.
                </p>
              )}
              <div className="flex items-center gap-3 mt-2">
                {error.includes('route') || error.includes('liquidity') ? (
                  <button
                    onClick={() => {
                      clearError()
                      if (inputToken && outputToken) {
                        getQuote()
                      }
                    }}
                    className="text-xs font-bold transition-opacity hover:opacity-70"
                    style={{ color: 'var(--wave-purple)' }}
                  >
                    Try Again
                  </button>
                ) : null}
                <button
                  onClick={clearError}
                  className="text-xs font-medium transition-opacity hover:opacity-70"
                  style={{ color: error.includes('User rejected') || error.includes('cancelled') ? '#3B82F6' : '#EF4444' }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Swap Button */}
        <div className="w-full">
          <SwapButton
            inputAmount={inputAmount}
            inputToken={safeInputToken}
            outputToken={safeOutputToken}
            quote={quote}
            loading={isLoading}
            privacyMode={privacyMode}
            canSwap={canSwap}
            onSwap={handleSwap}
            onCancel={cancelSwap}
            progress={progress}
          />
        </div>

        {/* Security & Info Footer */}
        <div className="mt-6 pt-4 border-t border-gray-700">
          <div className="flex items-center justify-center gap-6 text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
              <span>Audited</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-blue-500 rounded-full" />
              <span>Encrypted</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-purple-500 rounded-full" />
              <span>{privacyMode ? 'Private' : 'Public'} Route</span>
            </div>
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="mt-4 text-center">
        <p className="text-xs text-gray-500 max-w-md mx-auto">
          {privacyMode
            ? "Private swaps use enhanced encryption to protect transaction privacy. Fees may be higher than public swaps."
            : "Public swaps are executed on-chain transparently. All transaction details are publicly visible."
          }
        </p>
      </div>
    </div>
    </div>
  )
}