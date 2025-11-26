'use client'

import { useState, useMemo } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { ArrowsUpDownIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { TokenSelectorNew as TokenSelector } from './TokenSelectorNew'
import { AmountInput } from './AmountInput'
import { SwapButton } from './SwapButton'
import { useSwap } from '@/hooks/useSwap'
import { Token, SwapStatus } from '@/types/token'
import { useThemeConfig, createGlassStyles } from '@/lib/theme'

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
  const theme = useThemeConfig()

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
      // Swap failed - error is already handled by useSwap hook
    }
  }

  // Get input and output balances
  const inputBalance = safeInputToken?.address ? (balances.get(safeInputToken.address) || '0') : '0'
  const outputBalance = safeOutputToken?.address ? (balances.get(safeOutputToken.address) || '0') : '0'

  // Debug logging
  console.log('[SwapComponent] Balance Debug:', {
    publicKey: publicKey?.toString(),
    inputToken: safeInputToken?.symbol,
    inputTokenAddress: safeInputToken?.address,
    outputToken: safeOutputToken?.symbol,
    outputTokenAddress: safeOutputToken?.address,
    inputBalance,
    outputBalance,
    balancesMapSize: balances.size,
    allBalances: Object.fromEntries(balances)
  })

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

  // Check if user has sufficient balance
  const hasInsufficientBalance = safeInputToken && inputAmount && publicKey ? (() => {
    const inputAmountNum = parseFloat(inputAmount)
    if (isNaN(inputAmountNum) || inputAmountNum <= 0) return false

    const balanceNum = parseFloat(inputBalance) / Math.pow(10, safeInputToken.decimals || 9)
    return inputAmountNum > balanceNum
  })() : false

  // Check if swap is possible
  const canSwap = !!(
    publicKey &&
    safeInputToken &&
    safeOutputToken &&
    inputAmount &&
    parseFloat(inputAmount) > 0 &&
    !isLoading &&
    !hasInsufficientBalance
  )
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
            <div
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full backdrop-blur-sm"
              style={{
                background: `${theme.colors.success}10`,
                border: `1px solid ${theme.colors.success}20`,
              }}
            >
              <div
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ backgroundColor: theme.colors.success }}
              />
              <span
                className="text-xs font-medium"
                style={{ color: theme.colors.success }}
              >
                Privacy Mode Active
              </span>
            </div>
          </div>
        )}

        {/* Main Swap Card */}
        <div
          className="relative p-6 space-y-6 w-full rounded-2xl overflow-hidden"
          style={{
            background: `
              linear-gradient(135deg,
                ${theme.colors.surface}ee 0%,
                ${theme.colors.surfaceHover}cc 25%,
                ${theme.colors.surface}ee 50%,
                ${theme.colors.surfaceHover}cc 75%,
                ${theme.colors.surface}ee 100%
              ),
              radial-gradient(circle at 25% 25%,
                ${theme.colors.primary}08 0%,
                transparent 50%
              ),
              radial-gradient(circle at 75% 75%,
                ${theme.colors.success}03 0%,
                transparent 50%
              )
            `,
            border: `1px solid ${theme.colors.primary}15`,
            backdropFilter: 'blur(24px) saturate(1.8)',
            boxShadow: `
              0 20px 60px ${theme.colors.shadowHeavy},
              0 8px 24px ${theme.colors.primary}08,
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
                    ${theme.colors.primary}10 0%,
                    ${theme.colors.primary}05 50%,
                    ${theme.colors.primary}10 100%
                  )
                `,
                border: `1px solid ${theme.colors.primary}20`,
                backdropFilter: 'blur(16px) saturate(1.5)',
                boxShadow: `
                  0 8px 32px ${theme.colors.shadow},
                  inset 0 1px 0 rgba(255, 255, 255, 0.1)
                `
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <span
                  className="text-sm font-bold"
                  style={{ color: theme.colors.primary }}
                >
                  {progress.message}
                </span>
                <button
                  onClick={cancelSwap}
                  className="text-xs font-medium transition-colors px-2 py-1 rounded-md hover:bg-black/20"
                  style={{ color: theme.colors.error }}
                >
                  Cancel
                </button>
              </div>
              <div className="w-full rounded-full h-2 bg-black/50">
                <div
                  className="h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${(progress.currentStep / progress.totalSteps) * 100}%`,
                    background: theme.colors.primary,
                    boxShadow: `0 0 10px ${theme.colors.primary}50`
                  }}
                />
              </div>
            </div>
          )}

        {/* You Send Section */}
        <div className="relative z-10 space-y-3">
          <div className="flex items-center justify-between">
            <label
              className="text-sm font-bold tracking-wide"
              style={{ color: theme.colors.textSecondary }}
            >
              You Send
            </label>
            <div className="flex items-center gap-2">
              {publicKey && safeInputToken && (
                <div className="flex items-center gap-1">
                  {[
                    { label: '25%', value: 0.25 },
                    { label: '50%', value: 0.5 },
                    { label: '75%', value: 0.75 },
                    { label: 'MAX', value: 0.95 }
                  ].map(({ label, value }) => (
                    <button
                      key={label}
                      onClick={() => {
                        const balanceNum = parseFloat(inputBalance)
                        if (balanceNum > 0) {
                          const maxAmount = balanceNum / Math.pow(10, safeInputToken.decimals || 9)
                          // Use percentage of balance (MAX uses 95% to account for fees)
                          const amountWithFees = maxAmount * value
                          setInputAmount(amountWithFees.toString())
                        } else {
                          setInputAmount('0')
                        }
                        clearQuote()
                      }}
                      className="text-xs font-medium transition-all duration-200 px-2 py-1 rounded-md hover:scale-105 active:scale-95"
                      style={{
                        color: label === 'MAX' ? theme.colors.success : theme.colors.primary,
                        backgroundColor: label === 'MAX' ? `${theme.colors.success}08` : `${theme.colors.primary}05`,
                        border: `1px solid ${label === 'MAX' ? theme.colors.success + '20' : theme.colors.primary + '15'}`,
                        fontWeight: label === 'MAX' ? 700 : 500,
                        opacity: value === 0.95 ? 1 : 0.9
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = label === 'MAX'
                          ? `${theme.colors.success}15`
                          : `${theme.colors.primary}10`
                        e.currentTarget.style.opacity = '1'
                        e.currentTarget.style.transform = 'scale(1.05)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = label === 'MAX'
                          ? `${theme.colors.success}08`
                          : `${theme.colors.primary}05`
                        e.currentTarget.style.opacity = value === 0.95 ? '1' : '0.9'
                        e.currentTarget.style.transform = 'scale(1)'
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <span
                className="text-xs"
                style={{ color: theme.colors.textMuted }}
              >
                Balance: {displayInputBalance}
              </span>
            </div>
          </div>

          <div className="relative">
            <div className="flex gap-3 items-stretch">
              <div className="flex-1 min-w-0">
                <AmountInput
                  value={inputAmount}
                  onChange={handleInputChange}
                  disabled={isLoading || isProgressActive}
                  placeholder="0.00"
                  className="text-xl font-bold"
                />
                {/* Fiat conversion display */}
                {inputAmount && safeInputToken && (
                  <div className="mt-2 text-xs font-medium" style={{ color: theme.colors.textMuted }}>
                    ≈ ${(parseFloat(inputAmount || '0') * ((safeInputToken as any)?.price || 0)).toFixed(2)}
                  </div>
                )}

                {/* Insufficient balance error */}
                {hasInsufficientBalance && (
                  <div
                    className="mt-2 flex items-center gap-1.5 p-2 rounded-lg text-xs font-medium"
                    style={{
                      background: `${theme.colors.error}08`,
                      border: `1px solid ${theme.colors.error}20`,
                      color: theme.colors.error
                    }}
                  >
                    <ExclamationTriangleIcon className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>Insufficient balance. You have {displayInputBalance} {safeInputToken?.symbol} available.</span>
                  </div>
                )}
              </div>
              <div className="flex-shrink-0">
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
            className="p-2.5 rounded-full transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 border"
            style={{
              ...createGlassStyles(theme),
              borderColor: theme.colors.border
            }}
            disabled={isLoading || isProgressActive}
          >
            <ArrowsUpDownIcon
              className="h-5 w-5"
              style={{ color: theme.colors.primary }}
            />
          </button>
        </div>

        {/* You Receive Section */}
        <div className="relative z-10 space-y-3">
          <div className="flex items-center justify-between">
            <label
              className="text-sm font-bold tracking-wide"
              style={{ color: theme.colors.textSecondary }}
            >
              You Receive
            </label>
            <div className="flex items-center gap-2">
              <span
                className="text-xs"
                style={{ color: theme.colors.textMuted }}
              >
                Balance: {displayOutputBalance}
              </span>
              {quote && outputAmount && (
                <span
                  className="text-xs"
                  style={{ color: theme.colors.success }}
                >
                  ✓
                </span>
              )}
            </div>
          </div>

          <div className="relative">
            <div className="flex gap-3 items-stretch">
              <div className="flex-1 min-w-0">
                <AmountInput
                  value={outputAmount}
                  onChange={() => {}} // Output is read-only
                  disabled={true}
                  placeholder="0.00"
                  readOnly={true}
                  className="text-xl font-bold opacity-75"
                />
                {/* Fiat conversion display */}
                {outputAmount && safeOutputToken && (
                  <div className="mt-2 text-xs font-medium" style={{ color: theme.colors.textMuted }}>
                    ≈ ${(parseFloat(outputAmount || '0') * ((safeOutputToken as any)?.price || 0)).toFixed(2)}
                  </div>
                )}
              </div>
              <div className="flex-shrink-0">
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

        {/* Professional Swap Details */}
        {quote && (
          <div
            className="relative z-10"
          >
            <div
              className="p-6 rounded-2xl"
              style={{
                background: `
                  linear-gradient(135deg,
                    ${theme.colors.surface}f0 0%,
                    ${theme.colors.surfaceHover}dd 50%,
                    ${theme.colors.surface}f0 100%
                  ),
                  radial-gradient(circle at 25% 25%,
                    ${theme.colors.primary}08 0%,
                    transparent 50%
                  )
                `,
                border: `1px solid ${theme.colors.primary}15`,
                backdropFilter: 'blur(24px) saturate(1.8)',
                boxShadow: `
                  0 20px 60px ${theme.colors.shadowHeavy},
                  0 8px 24px ${theme.colors.primary}08,
                  inset 0 1px 0 rgba(255, 255, 255, 0.1)
                `
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full animate-pulse"
                    style={{ backgroundColor: theme.colors.success }}
                  />
                  <span
                    className="text-sm font-bold tracking-wide"
                    style={{ color: theme.colors.textSecondary }}
                  >
                    SWAP DETAILS
                  </span>
                </div>
                <div
                  className="px-2 py-1 rounded-full text-xs font-medium"
                  style={{
                    background: `${theme.colors.success}10`,
                    color: theme.colors.success,
                    border: `1px solid ${theme.colors.success}20`
                  }}
                >
                  LIVE RATE
                </div>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-xs font-medium" style={{ color: theme.colors.textMuted }}>
                    Exchange Rate
                  </span>
                  <div className="text-sm font-bold" style={{ color: theme.colors.textPrimary }}>
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
                        // Price calculation failed - fallback to placeholder
                        return `1 ${displayInputToken.symbol} = --- ${displayOutputTokenConfidential.symbol}`
                      }
                    })() : '---'}
                  </div>
                </div>

                {/* Price Impact */}
                <div className="flex items-center justify-between">
                  <span
                    className="text-xs font-medium"
                    style={{ color: theme.colors.textMuted }}
                  >
                    Price Impact
                  </span>
                  <span
                    className="text-sm font-semibold"
                    style={{
                      color: priceImpact > 5 ? theme.colors.error :
                             priceImpact > 2 ? theme.colors.warning :
                             theme.colors.success
                    }}
                  >
                    {typeof priceImpact === 'number' && !isNaN(priceImpact) ? priceImpact.toFixed(2) : '0.00'}%
                  </span>
                </div>

                {/* Second Column - Additional Info */}
                <div className="space-y-1">
                  <span className="text-xs font-medium" style={{ color: theme.colors.textMuted }}>
                    Minimum Received
                  </span>
                  <div className="text-sm font-bold" style={{ color: theme.colors.textPrimary }}>
                    {displayOutputTokenConfidential && outputAmount && quote ? (() => {
                      try {
                        const outputDecimals = displayOutputToken?.decimals || 9
                        const rawOutputAmount = parseFloat(quote.outputAmount) || 0
                        const normalizedOutput = rawOutputAmount / Math.pow(10, outputDecimals)
                        const minimumReceived = normalizedOutput * 0.98 // 2% slippage

                        if (isNaN(minimumReceived) || !isFinite(minimumReceived)) {
                          return '---'
                        }

                        return `${minimumReceived.toFixed(6)} ${displayOutputTokenConfidential?.symbol}`
                      } catch (error) {
                        return '---'
                      }
                    })() : '---'}
                  </div>
                </div>
              </div>

              {/* Full Width Sections */}
              <div className="space-y-2 pt-2" style={{ borderTop: `1px solid ${theme.colors.border}20` }}>
                <div className="flex items-center justify-between">
                  <span
                    className="text-xs font-medium"
                    style={{ color: theme.colors.textMuted }}
                  >
                    Network Fee
                  </span>
                  <span
                    className="text-sm font-semibold"
                    style={{ color: theme.colors.textPrimary }}
                  >
                    ~0.000005 SOL
                  </span>
                </div>
                {privacyMode && (
                  <div
                    className="flex items-center justify-between pt-2"
                    style={{ borderTop: `1px solid ${theme.colors.border}` }}
                  >
                    <span
                      className="text-xs font-medium"
                      style={{ color: theme.colors.success }}
                    >
                      Privacy Fee
                    </span>
                    <span
                      className="text-sm font-semibold"
                      style={{ color: theme.colors.success }}
                    >
                      ~0.1%
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div
            className="flex items-start gap-3 p-4 rounded-xl"
            style={{
              ...createGlassStyles(theme),
              borderColor: error.includes('User rejected') || error.includes('cancelled') ? `${theme.colors.primary}30` : `${theme.colors.error}30`,
              backgroundColor: error.includes('User rejected') || error.includes('cancelled') ? `${theme.colors.primary}05` : `${theme.colors.error}05`
            }}
          >
            <ExclamationTriangleIcon
              className="h-5 w-5 flex-shrink-0 mt-0.5"
              style={{ color: error.includes('User rejected') || error.includes('cancelled') ? theme.colors.primary : theme.colors.error }}
            />
            <div className="flex-1">
              <p
                className="text-sm font-bold"
                style={{
                  color: error.includes('User rejected') || error.includes('cancelled')
                    ? theme.colors.primary
                    : theme.colors.error
                }}
              >
                {error}
              </p>
              {error.includes('User rejected') && (
                <p
                  className="text-xs mt-1 opacity-70"
                  style={{ color: theme.colors.textSecondary }}
                >
                  You can safely continue using the swap interface.
                </p>
              )}
              {error.includes('insufficient') && (
                <p
                  className="text-xs mt-1 opacity-70"
                  style={{ color: theme.colors.textSecondary }}
                >
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
                    style={{ color: theme.colors.primary }}
                  >
                    Try Again
                  </button>
                ) : null}
                <button
                  onClick={clearError}
                  className="text-xs font-medium transition-opacity hover:opacity-70"
                  style={{
                    color: error.includes('User rejected') || error.includes('cancelled')
                      ? theme.colors.primary
                      : theme.colors.error
                  }}
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
        <div
          className="mt-6 pt-4"
          style={{ borderTop: `1px solid ${theme.colors.border}` }}
        >
          <div
            className="flex items-center justify-center gap-6 text-xs"
            style={{ color: theme.colors.textMuted }}
          >
            <div className="flex items-center gap-1">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: theme.colors.primary }}
              />
              <span>Encrypted</span>
            </div>
            <div className="flex items-center gap-1">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: theme.colors.primary }}
              />
              <span>{privacyMode ? 'Private' : 'Public'} Route</span>
            </div>
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="mt-4 text-center">
        <p
          className="text-xs max-w-md mx-auto"
          style={{ color: theme.colors.textMuted }}
        >
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