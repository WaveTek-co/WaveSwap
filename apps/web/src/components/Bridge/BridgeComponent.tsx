'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  ArrowsRightLeftIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  ChevronDownIcon,
  StarIcon,
  ShieldCheckIcon,
  SparklesIcon,
  WalletIcon
} from '@heroicons/react/24/outline'
import {
  nearIntentBridge,
  type BridgeQuote,
  type BridgeTransaction,
  type BridgeToken,
  SUPPORTED_CHAINS,
  COMMON_TOKENS
} from '../../lib/nearIntentBridge'
import { useWallet } from '@solana/wallet-adapter-react'
import { useThemeConfig, createGlassStyles } from '@/lib/theme'

interface BridgeComponentProps {
  privacyMode: boolean
}

type ChainId = 'solana' | 'near' | 'zec'
type SwapDirection = 'from' | 'to'

export function BridgeComponent({ privacyMode }: BridgeComponentProps) {
  const { publicKey, connected } = useWallet()
  const theme = useThemeConfig()

  // Form state
  const [fromChain, setFromChain] = useState<ChainId>('solana')
  const [toChain, setToChain] = useState<ChainId>('near')
  const [fromToken, setFromToken] = useState<BridgeToken>(COMMON_TOKENS.solana[0])
  const [toToken, setToToken] = useState<BridgeToken>(COMMON_TOKENS.near[0])
  const [amount, setAmount] = useState('')
  const [recipientAddress, setRecipientAddress] = useState('')
  const [slippage, setSlippage] = useState(100) // 1%

  // UI state
  const [showFromChainDropdown, setShowFromChainDropdown] = useState(false)
  const [showToChainDropdown, setShowToChainDropdown] = useState(false)
  const [showFromTokenDropdown, setShowFromTokenDropdown] = useState(false)
  const [showToTokenDropdown, setShowToTokenDropdown] = useState(false)

  // Transaction state
  const [quote, setQuote] = useState<BridgeQuote | null>(null)
  const [loading, setLoading] = useState(false)
  const [transactionStatus, setTransactionStatus] = useState<BridgeTransaction | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showStatusModal, setShowStatusModal] = useState(false)

  // Auto-fill recipient address when wallet connects
  useEffect(() => {
    if (connected && publicKey && !recipientAddress) {
      setRecipientAddress(publicKey.toString())
    }
  }, [connected, publicKey, recipientAddress])

  // Chain switching logic
  const switchChains = () => {
    const tempChain = fromChain
    setFromChain(toChain)
    setToChain(tempChain)

    // Switch tokens
    const tempToken = fromToken
    setFromToken(toToken)
    setToToken(tempToken)

    // Clear quote and status
    setQuote(null)
    setTransactionStatus(null)
    setError(null)
  }

  // Validate form
  const isFormValid = useMemo(() => {
    return (
      amount &&
      parseFloat(amount) > 0 &&
      recipientAddress &&
      fromChain !== toChain &&
      !loading
    )
  }, [amount, recipientAddress, fromChain, toChain, loading])

  // Check if wallet is connected
  const isWalletConnected = connected

  // Get quote for bridge transaction
  const getQuote = async () => {
    if (!isWalletConnected) {
      setError('Please connect your wallet first')
      return
    }
    if (!isFormValid) return

    setLoading(true)
    setError(null)

    try {
      // Validate recipient address
      if (!nearIntentBridge.validateAddress(recipientAddress, toChain)) {
        throw new Error(`Invalid ${toChain.toUpperCase()} address format`)
      }

      const quoteRequest = {
        dry: true,
        depositMode: 'SIMPLE' as const,
        swapType: 'EXACT_INPUT' as const,
        slippageTolerance: slippage,
        originAsset: `${fromChain === 'near' ? 'nep141' : 'spl'}:${fromToken.address}`,
        depositType: 'ORIGIN_CHAIN' as const,
        destinationAsset: `${toChain === 'near' ? 'nep141' : 'spl'}:${toToken.address}`,
        amount: (parseFloat(amount) * Math.pow(10, fromToken.decimals)).toString(),
        refundTo: publicKey?.toString() || '',
        refundType: 'ORIGIN_CHAIN' as const,
        recipient: recipientAddress,
        recipientType: 'DESTINATION_CHAIN' as const,
        deadline: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 minutes
      }

      const quoteResponse = await nearIntentBridge.getQuote(quoteRequest)
      setQuote(quoteResponse)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get quote')
    } finally {
      setLoading(false)
    }
  }

  // Execute bridge transaction
  const executeBridge = async () => {
    if (!quote) return

    setLoading(true)
    try {
      // Here you would integrate with the appropriate wallet to send the deposit
      // Start monitoring the transaction
      monitorTransaction(quote.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to execute bridge')
    } finally {
      setLoading(false)
    }
  }

  // Monitor transaction status
  const monitorTransaction = async (quoteId: string) => {
    try {
      const status = await nearIntentBridge.getStatus(quoteId)
      setTransactionStatus(status)
      setShowStatusModal(true)

      // Continue monitoring if not final status
      if (['PENDING_DEPOSIT', 'PROCESSING'].includes(status.status)) {
        setTimeout(() => monitorTransaction(quoteId), 5000) // Check every 5 seconds
      }
    } catch (err) {
      setError('Failed to fetch transaction status')
    }
  }

  // Format amount display
  const formatAmount = (amount: string, decimals: number, symbol: string) => {
    const value = parseFloat(amount) / Math.pow(10, decimals)
    return `${value.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${symbol}`
  }

  // Get status icon and color
  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return { icon: CheckCircleIcon, color: theme.colors.success, bg: `${theme.colors.success}10` }
      case 'PROCESSING':
        return { icon: ClockIcon, color: theme.colors.primary, bg: `${theme.colors.primary}10` }
      case 'PENDING_DEPOSIT':
        return { icon: ClockIcon, color: theme.colors.warning, bg: `${theme.colors.warning}10` }
      case 'FAILED':
      case 'INCOMPLETE_DEPOSIT':
        return { icon: ExclamationTriangleIcon, color: theme.colors.error, bg: `${theme.colors.error}10` }
      default:
        return { icon: ClockIcon, color: theme.colors.textMuted, bg: `${theme.colors.textMuted}10` }
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 mb-4 rounded-2xl" style={{
          background: `linear-gradient(135deg, ${theme.colors.primary} 0%, ${theme.colors.secondary} 100%)`
        }}>
          <ArrowsRightLeftIcon className="h-8 w-8" style={{ color: theme.colors.textPrimary }} />
        </div>
        <h1 className="text-3xl font-bold mb-2" style={{
          color: theme.colors.textPrimary,
          fontFamily: 'var(--font-helvetica)'
        }}>
          Cross-Chain Bridge
        </h1>
        <p style={{ color: theme.colors.textMuted }}>
          Seamlessly bridge assets between Solana, NEAR, and Zcash with Near Intent
        </p>
      </div>

      {/* Privacy indicator */}
      {privacyMode && (
        <div className="mb-6 p-4 rounded-xl" style={{
          background: `${theme.colors.success}10`,
          border: `1px solid ${theme.colors.success}20`
        }}>
          <div className="flex items-center gap-3">
            <ShieldCheckIcon className="h-5 w-5" style={{ color: theme.colors.success }} />
            <div className="flex-1">
              <p style={{ color: theme.colors.success }} className="font-medium">Privacy Mode Active</p>
              <p className="text-sm" style={{ color: `${theme.colors.success}cc` }}>Your bridge transactions are confidential</p>
            </div>
          </div>
        </div>
      )}

      {/* Bridge Form */}
      <div className="space-y-6">
        {/* From Chain */}
        <div className="relative">
          <label className="block text-sm font-medium mb-2" style={{ color: theme.colors.textSecondary }}>From</label>
          <button
            onClick={() => setShowFromChainDropdown(!showFromChainDropdown)}
            className="w-full p-4 rounded-xl text-left transition-all"
            style={{
              ...createGlassStyles(theme),
              border: `1px solid ${theme.colors.border}`,
              backdropFilter: 'blur(8px)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = theme.colors.primary
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = theme.colors.border
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{
                  background: `linear-gradient(135deg, ${theme.colors.primary} 0%, ${theme.colors.secondary} 100%)`
                }}>
                  <span className="font-bold text-sm" style={{ color: theme.colors.textPrimary }}>
                    {SUPPORTED_CHAINS.find(c => c.id === fromChain)?.name[0]}
                  </span>
                </div>
                <div>
                  <p className="font-medium" style={{ color: theme.colors.textPrimary }}>
                    {SUPPORTED_CHAINS.find(c => c.id === fromChain)?.name}
                  </p>
                  <p className="text-sm" style={{ color: theme.colors.textMuted }}>{fromToken.symbol}</p>
                </div>
              </div>
              <ChevronDownIcon className="h-5 w-5" style={{ color: theme.colors.textMuted }} />
            </div>
          </button>

          {/* Chain Dropdown */}
          {showFromChainDropdown && (
            <div className="absolute z-10 w-full mt-2 p-2 rounded-xl shadow-xl" style={{
              ...createGlassStyles(theme),
              border: `1px solid ${theme.colors.border}`,
              background: `${theme.colors.surface}f2`
            }}>
              {SUPPORTED_CHAINS.filter(chain => chain.id !== toChain).map((chain) => (
                <button
                  key={chain.id}
                  onClick={() => {
                    setFromChain(chain.id as ChainId)
                    setShowFromChainDropdown(false)
                    setQuote(null)
                  }}
                  className="w-full p-3 rounded-lg text-left transition-colors"
                  style={{
                    background: 'transparent',
                    color: theme.colors.textPrimary
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = `${theme.colors.surfaceHover}50`
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded flex items-center justify-center" style={{
                      background: `linear-gradient(135deg, ${theme.colors.primary} 0%, ${theme.colors.secondary} 100%)`
                    }}>
                      <span className="font-bold text-xs" style={{ color: theme.colors.textPrimary }}>{chain.name[0]}</span>
                    </div>
                    <span style={{ color: theme.colors.textPrimary }}>{chain.name}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Switch Button */}
        <div className="flex justify-center">
          <button
            onClick={switchChains}
            className="p-3 rounded-xl transition-all hover:scale-105"
            style={{
              ...createGlassStyles(theme),
              border: `1px solid ${theme.colors.border}`,
              backdropFilter: 'blur(8px)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = theme.colors.primary
              e.currentTarget.style.background = `${theme.colors.primary}15`
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = theme.colors.border
              e.currentTarget.style.background = createGlassStyles(theme).background as string
            }}
          >
            <ArrowsRightLeftIcon className="h-5 w-5" style={{ color: theme.colors.textSecondary }} />
          </button>
        </div>

        {/* To Chain */}
        <div className="relative">
          <label className="block text-sm font-medium mb-2" style={{ color: theme.colors.textSecondary }}>To</label>
          <button
            onClick={() => setShowToChainDropdown(!showToChainDropdown)}
            className="w-full p-4 rounded-xl text-left transition-all"
            style={{
              ...createGlassStyles(theme),
              border: `1px solid ${theme.colors.border}`,
              backdropFilter: 'blur(8px)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = theme.colors.primary
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = theme.colors.border
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{
                  background: `linear-gradient(135deg, ${theme.colors.primary} 0%, ${theme.colors.secondary} 100%)`
                }}>
                  <span className="font-bold text-sm" style={{ color: theme.colors.textPrimary }}>
                    {SUPPORTED_CHAINS.find(c => c.id === toChain)?.name[0]}
                  </span>
                </div>
                <div>
                  <p className="font-medium" style={{ color: theme.colors.textPrimary }}>
                    {SUPPORTED_CHAINS.find(c => c.id === toChain)?.name}
                  </p>
                  <p className="text-sm" style={{ color: theme.colors.textMuted }}>{toToken.symbol}</p>
                </div>
              </div>
              <ChevronDownIcon className="h-5 w-5" style={{ color: theme.colors.textMuted }} />
            </div>
          </button>

          {/* Chain Dropdown */}
          {showToChainDropdown && (
            <div className="absolute z-10 w-full mt-2 p-2 rounded-xl shadow-xl" style={{
              ...createGlassStyles(theme),
              border: `1px solid ${theme.colors.border}`,
              background: `${theme.colors.surface}f2`
            }}>
              {SUPPORTED_CHAINS.filter(chain => chain.id !== fromChain).map((chain) => (
                <button
                  key={chain.id}
                  onClick={() => {
                    setToChain(chain.id as ChainId)
                    setShowToChainDropdown(false)
                    setQuote(null)
                  }}
                  className="w-full p-3 rounded-lg text-left transition-colors"
                  style={{
                    background: 'transparent',
                    color: theme.colors.textPrimary
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = `${theme.colors.surfaceHover}50`
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded flex items-center justify-center" style={{
                      background: `linear-gradient(135deg, ${theme.colors.primary} 0%, ${theme.colors.secondary} 100%)`
                    }}>
                      <span className="font-bold text-xs" style={{ color: theme.colors.textPrimary }}>{chain.name[0]}</span>
                    </div>
                    <span style={{ color: theme.colors.textPrimary }}>{chain.name}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Amount Input */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Amount</label>
          <div className="relative">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full p-4 rounded-xl bg-gray-800/60 border border-gray-700 text-white placeholder-gray-500 transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              style={{
                backdropFilter: 'blur(8px)',
              }}
            />
            <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
              <span className="text-gray-400 font-medium">{fromToken.symbol}</span>
            </div>
          </div>
        </div>

        {/* Recipient Address */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Recipient Address ({toChain.toUpperCase()})
          </label>
          <input
            type="text"
            value={recipientAddress}
            onChange={(e) => setRecipientAddress(e.target.value)}
            placeholder={`Enter ${toChain.toUpperCase()} address`}
            className="w-full p-4 rounded-xl bg-gray-800/60 border border-gray-700 text-white placeholder-gray-500 transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            style={{
              backdropFilter: 'blur(8px)',
            }}
          />
        </div>

        {/* Slippage Settings */}
        <div className="p-4 rounded-xl bg-gray-800/40 border border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-300">Slippage Tolerance</label>
            <span className="text-blue-400 font-medium">{(slippage / 100).toFixed(1)}%</span>
          </div>
          <input
            type="range"
            min="10"
            max="500"
            step="10"
            value={slippage}
            onChange={(e) => setSlippage(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>0.1%</span>
            <span>5%</span>
          </div>
        </div>

        {/* Quote Display */}
        {quote && (
          <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <div className="flex items-center gap-2 mb-3">
              <SparklesIcon className="h-4 w-4 text-blue-400" />
              <span className="text-blue-400 font-medium">Quote Details</span>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">You send:</span>
                <span className="text-white font-medium">
                  {formatAmount(quote.amount.in, quote.depositAsset.decimals, quote.depositAsset.symbol)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">You receive:</span>
                <span className="text-white font-medium">
                  {formatAmount(quote.amount.out, quote.destinationAsset.decimals, quote.destinationAsset.symbol)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Fee:</span>
                <span className="text-white font-medium">
                  {formatAmount(quote.amount.fee, quote.depositAsset.decimals, quote.depositAsset.symbol)}
                  <span className="text-gray-400 ml-2">({quote.fee.bps / 100}%)</span>
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Deposit to:</span>
                <span className="text-white font-mono text-xs">
                  {quote.depositAddress.slice(0, 8)}...{quote.depositAddress.slice(-8)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
            <div className="flex items-center gap-2">
              <ExclamationTriangleIcon className="h-4 w-4 text-red-400" />
              <span className="text-red-400 text-sm">{error}</span>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-3">
          {!isWalletConnected ? (
            <button
              className="w-full p-4 rounded-xl font-medium transition-all hover:scale-[1.02]"
              style={{
                ...createGlassStyles(theme),
                background: `
                  linear-gradient(135deg,
                    ${theme.colors.warning}cc 0%,
                    ${theme.colors.warning}aa 100%
                  )
                `,
                color: theme.colors.textPrimary,
                border: `2px solid ${theme.colors.warning}60`,
                fontWeight: 600
              }}
            >
              <div className="flex items-center justify-center gap-3">
                <WalletIcon className="h-5 w-5" />
                <span>Connect Wallet to Bridge</span>
              </div>
            </button>
          ) : !quote ? (
            <button
              onClick={getQuote}
              disabled={!isFormValid || loading}
              className="w-full p-4 rounded-xl font-medium transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                ...createGlassStyles(theme),
                background: isFormValid && !loading
                  ? `linear-gradient(135deg, ${theme.colors.primary}dd 0%, ${theme.colors.primary}bb 100%)`
                  : `${theme.colors.surface}60`,
                color: isFormValid && !loading ? theme.colors.textPrimary : `${theme.colors.textMuted}cc`,
                border: `2px solid ${isFormValid && !loading ? theme.colors.primary : theme.colors.border}60`,
                cursor: isFormValid && !loading ? 'pointer' : 'not-allowed'
              }}
            >
              {loading ? 'Getting Quote...' : 'Get Quote'}
            </button>
          ) : (
            <div className="space-y-3">
              <button
                onClick={executeBridge}
                disabled={loading}
                className="w-full p-4 rounded-xl font-medium transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  ...createGlassStyles(theme),
                  background: !loading
                    ? `linear-gradient(135deg, ${theme.colors.success}dd 0%, ${theme.colors.success}bb 100%)`
                    : `${theme.colors.surface}60`,
                  color: theme.colors.textPrimary,
                  border: `2px solid ${!loading ? theme.colors.success : theme.colors.border}60`,
                  cursor: loading ? 'wait' : 'pointer'
                }}
              >
                {loading ? 'Processing...' : 'Execute Bridge'}
              </button>
              <button
                onClick={() => {
                  setQuote(null)
                  setError(null)
                }}
                className="w-full p-3 rounded-xl font-medium transition-all"
                style={{
                  ...createGlassStyles(theme),
                  background: `${theme.colors.surface}60`,
                  color: theme.colors.textSecondary,
                  border: `1px solid ${theme.colors.border}`
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = theme.colors.primary
                  e.currentTarget.style.background = `${theme.colors.primary}15`
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = theme.colors.border
                  e.currentTarget.style.background = `${theme.colors.surface}60`
                }}
              >
                Get New Quote
              </button>
            </div>
          )}
        </div>

        {/* Info Section */}
        <div className="p-4 rounded-xl bg-gray-800/40 border border-gray-700">
          <div className="flex items-start gap-3">
            <InformationCircleIcon className="h-5 w-5 text-blue-400 mt-0.5" />
            <div className="text-sm text-gray-400">
              <p className="mb-2">
                <strong>How it works:</strong>
              </p>
              <ol className="space-y-1 list-decimal list-inside">
                <li>Get a quote for your cross-chain transfer</li>
                <li>Send funds to the provided deposit address</li>
                <li>Receive funds on the destination chain</li>
              </ol>
              <p className="mt-2 text-xs">
                Powered by Near Intent protocol for secure cross-chain transfers.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Status Modal */}
      {showStatusModal && transactionStatus && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white">Transaction Status</h3>
              <button
                onClick={() => setShowStatusModal(false)}
                className="text-gray-400 hover:text-white"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div className={`p-4 rounded-xl ${getStatusInfo(transactionStatus.status).bg} border border-current/20`}>
                <div className="flex items-center gap-3">
                  {(() => {
                    const StatusIcon = getStatusInfo(transactionStatus.status).icon
                    return <StatusIcon className={`h-6 w-6 ${getStatusInfo(transactionStatus.status).color}`} />
                  })()}
                  <div>
                    <p className={`font-medium ${getStatusInfo(transactionStatus.status).color}`}>
                      {transactionStatus.status.replace('_', ' ').toUpperCase()}
                    </p>
                    <p className="text-gray-400 text-sm">
                      {transactionStatus.type === 'deposit' ? 'Bridging' : 'Withdrawing'} {transactionStatus.fromToken} → {transactionStatus.toToken}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Amount:</span>
                  <span className="text-white">{transactionStatus.amount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Fee:</span>
                  <span className="text-white">{transactionStatus.fee}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">From:</span>
                  <span className="text-white">{transactionStatus.fromChain}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">To:</span>
                  <span className="text-white">{transactionStatus.toChain}</span>
                </div>
              </div>

              {['FAILED', 'INCOMPLETE_DEPOSIT', 'REFUNDED'].includes(transactionStatus.status) && (
                <button
                  onClick={() => setShowStatusModal(false)}
                  className="w-full p-3 rounded-xl bg-gray-700 text-white font-medium"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default BridgeComponent