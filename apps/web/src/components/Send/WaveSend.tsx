'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useThemeConfig } from '@/lib/theme'
import {
  PaperAirplaneIcon,
  LockClosedIcon,
  ChevronDownIcon,
  UserIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline'
import { ComingSoon } from '@/components/ui/ComingSoon'
import { TokenIcon } from '@/components/TokenIcon'
import { useWallet } from '@/hooks/useWalletAdapter'
import { useWaveSend } from '@/hooks/useWaveSend'
import { useAutoClaim } from '@/hooks/useAutoClaim'
import { toast } from 'sonner'
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { showSendConfirmation } from '@/components/ui/TransactionToast'

interface WaveSendProps {
  privacyMode: boolean
  comingSoon?: boolean
}

interface TokenOption {
  id: string
  name: string
  symbol: string
  mintAddress: string
  decimals: number
  balance?: string
  logoUri?: string
}

// Get Jupiter icon URLs for tokens
const getJupiterIconUrl = (symbol: string): string | null => {
  const jupIconMap: { [key: string]: string } = {
    'WAVE': 'https://img-cdn.jup.ag/tokens/WAVE.svg',
    'WEALTH': 'https://img-cdn.jup.ag/tokens/WEALTH.svg',
    'SOL': 'https://img-cdn.jup.ag/tokens/SOL.svg',
    'ZEC': 'https://img-cdn.jup.ag/tokens/ZEC.svg',
    'USDC': 'https://img-cdn.jup.ag/tokens/USDC.svg'
  }
  return jupIconMap[symbol] || null
}

// Validate Solana address
const isValidSolanaAddress = (address: string): boolean => {
  try {
    new PublicKey(address)
    return true
  } catch {
    return false
  }
}

export function WaveSend({ privacyMode, comingSoon = false }: WaveSendProps) {
  const theme = useThemeConfig()
  const { connected, publicKey } = useWallet()

  // Use the WaveSend hook for SDK integration
  const {
    isInitialized,
    isRegistered,
    isLoading: isInitializing,
    isSending,
    error: sdkError,
    registrationProgress,
    initializeKeys,
    register,
    send,
    checkRecipientRegistered,
    claimByVault,
    clearError,
  } = useWaveSend()

  // Auto-claim hook - scans for and auto-claims incoming payments
  const {
    isScanning,
    pendingClaims,
    totalPendingAmount,
    claimHistory,
    startScanning,
    lastScanTime,
    error: autoClaimError,
  } = useAutoClaim()

  const [selectedToken, setSelectedToken] = useState<string>('sol')
  const [amount, setAmount] = useState<string>('')
  const [recipient, setRecipient] = useState<string>('')
  const [isTokenDropdownOpen, setIsTokenDropdownOpen] = useState(false)
  const [recipientRegistered, setRecipientRegistered] = useState<boolean | null>(null)
  const [checkingRecipient, setCheckingRecipient] = useState(false)
  const [vaultToClaim, setVaultToClaim] = useState<string>('')
  const [isClaiming, setIsClaiming] = useState(false)
  const [userBalances, setUserBalances] = useState<{ [key: string]: string }>({
    wave: '0',
    wealth: '0',
    sol: '0',
    usdc: '0'
  })
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Fetch user token balances when wallet connects
  useEffect(() => {
    const fetchBalances = async () => {
      if (!connected || !publicKey) {
        setUserBalances({ wave: '0', wealth: '0', sol: '0', usdc: '0' })
        return
      }

      try {
        const devnetConnection = new Connection('https://api.devnet.solana.com', 'confirmed')
        const balances: { [key: string]: string } = { wave: '0', wealth: '0', sol: '0', usdc: '0' }

        // Fetch SOL balance from Devnet
        try {
          const solBalance = await devnetConnection.getBalance(publicKey)
          balances['sol'] = (solBalance / LAMPORTS_PER_SOL).toFixed(4)
        } catch (error) {
          balances['sol'] = '0'
        }

        // Fetch other tokens
        const tokenMints = {
          wave: '6D6DjjiwtWPMCb2tkRVuTDi5esUu2rzHnhpE6z3nyskE',
          wealth: 'Diz52amvNsWFWrA8WnwQMVxSL5asMqL8MhZVSBk8TWcz',
          usdc: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
        }

        for (const [key, mint] of Object.entries(tokenMints)) {
          try {
            const tokenAccounts = await devnetConnection.getParsedTokenAccountsByOwner(
              publicKey,
              { mint: new PublicKey(mint) }
            )

            let balance = 0
            for (const account of tokenAccounts.value) {
              const parsedData = account.account.data.parsed
              if (parsedData && parsedData.info.tokenAmount) {
                balance += Number(parsedData.info.tokenAmount.amount) || 0
              }
            }

            const decimals = key === 'usdc' ? 1e6 : 1e6
            balances[key] = (balance / decimals).toFixed(2)
          } catch {
            balances[key] = '0'
          }
        }

        setUserBalances(balances)
      } catch (error) {
        console.error('Error fetching balances:', error)
        setUserBalances({ wave: '0', wealth: '0', sol: '0', usdc: '0' })
      }
    }

    fetchBalances()
  }, [connected, publicKey])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsTokenDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Check if recipient is registered when address changes
  useEffect(() => {
    const checkRecipient = async () => {
      if (!recipient || !isValidSolanaAddress(recipient)) {
        setRecipientRegistered(null)
        return
      }

      console.log('[WaveSend UI] Checking if recipient is registered:', recipient)
      setCheckingRecipient(true)
      try {
        const registered = await checkRecipientRegistered(recipient)
        console.log('[WaveSend UI] Recipient registered:', registered)
        setRecipientRegistered(registered)
      } catch (err) {
        console.error('[WaveSend UI] Error checking recipient:', err)
        setRecipientRegistered(null)
      } finally {
        setCheckingRecipient(false)
      }
    }

    const debounceTimeout = setTimeout(checkRecipient, 500)
    return () => clearTimeout(debounceTimeout)
  }, [recipient, checkRecipientRegistered])

  // Token options
  const tokens: TokenOption[] = useMemo(() => [
    {
      id: 'sol',
      name: 'Solana',
      symbol: 'SOL',
      mintAddress: 'So11111111111111111111111111111111111111112',
      decimals: 9,
      balance: userBalances['sol']
    },
    {
      id: 'wave',
      name: 'WAVE',
      symbol: 'WAVE',
      mintAddress: '6D6DjjiwtWPMCb2tkRVuTDi5esUu2rzHnhpE6z3nyskE',
      decimals: 6,
      balance: userBalances['wave']
    },
    {
      id: 'wealth',
      name: 'WEALTH',
      symbol: 'WEALTH',
      mintAddress: 'Diz52amvNsWFWrA8WnwQMVxSL5asMqL8MhZVSBk8TWcz',
      decimals: 6,
      balance: userBalances['wealth']
    },
    {
      id: 'usdc',
      name: 'USD Coin',
      symbol: 'USDC',
      mintAddress: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
      decimals: 6,
      balance: userBalances['usdc']
    }
  ], [userBalances])

  const currentToken = tokens.find(t => t.id === selectedToken)

  // Validate inputs
  const isValidRecipient = recipient.length > 0 && isValidSolanaAddress(recipient)
  const isValidAmount = amount.length > 0 && parseFloat(amount) > 0
  const hasEnoughBalance = currentToken && parseFloat(amount || '0') <= parseFloat(currentToken.balance || '0')

  // Can send only if:
  // 1. Connected
  // 2. Valid recipient
  // 3. Valid amount
  // 4. Enough balance
  // 5. Not currently sending
  // 6. Privacy mode: recipient must be registered
  const canSend = connected &&
    isValidRecipient &&
    isValidAmount &&
    hasEnoughBalance &&
    !isSending &&
    !isInitializing &&
    (!privacyMode || recipientRegistered === true)

  // Debug logging for send button state
  useEffect(() => {
    console.log('[WaveSend UI] canSend check:', {
      connected,
      isValidRecipient,
      isValidAmount,
      hasEnoughBalance,
      isSending,
      isInitializing,
      privacyMode,
      isInitialized,
      recipientRegistered,
      canSend,
    })
  }, [connected, isValidRecipient, isValidAmount, hasEnoughBalance, isSending, isInitializing, privacyMode, isInitialized, recipientRegistered, canSend])

  // Note: Claim toasts are now shown directly by useAutoClaim hook
  // This avoids duplicate toasts

  // Handle initialize keys
  const handleInitialize = useCallback(async () => {
    console.log('[WaveSend UI] handleInitialize called')
    try {
      const success = await initializeKeys()
      console.log('[WaveSend UI] initializeKeys result:', success)
      if (success) {
        toast.success('Stealth keys initialized! You can now send private transfers.')
      } else {
        toast.error(sdkError || 'Failed to initialize stealth keys')
      }
    } catch (err) {
      console.error('[WaveSend UI] handleInitialize error:', err)
      toast.error('Failed to initialize: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  }, [initializeKeys, sdkError])

  // Handle register
  const handleRegister = useCallback(async () => {
    const success = await register()
    if (success) {
      toast.success('Successfully registered for stealth payments!')
    } else {
      toast.error(sdkError || 'Failed to register')
    }
  }, [register, sdkError])

  // Handle send
  const handleSend = useCallback(async () => {
    if (!canSend || !currentToken) return

    clearError()

    // For privacy mode, use stealth transfer
    if (privacyMode) {
      // Make sure keys are initialized
      if (!isInitialized) {
        toast.error('Please initialize your stealth keys first')
        return
      }

      const result = await send({
        recipientAddress: recipient,
        amount: amount,
        tokenMint: currentToken.id === 'sol' ? undefined : currentToken.mintAddress,
      })

      if (result.success && result.signature) {
        // Show enhanced toast with explorer link
        showSendConfirmation({
          signature: result.signature,
          amount: parseFloat(amount),
          symbol: currentToken.symbol,
          recipient: recipient,
        })
        // Clear form
        setAmount('')
        setRecipient('')
      } else {
        toast.error(result.error || 'Failed to send')
      }
    } else {
      // Regular transfer (non-stealth) - just show placeholder for now
      toast.info('Regular transfer: This would send via normal Solana transfer.')
    }
  }, [canSend, currentToken, privacyMode, isInitialized, send, recipient, amount, clearError])

  // Show Coming Soon if enabled
  if (comingSoon) {
    return (
      <div className="w-full max-w-xl mx-auto">
        <ComingSoon
          message="Coming Soon"
          description="Send tokens privately using stealth addresses. Your transactions remain confidential on the blockchain."
          icon={
            <PaperAirplaneIcon className="w-10 h-10" />
          }
          compact={false}
        />
      </div>
    )
  }

  return (
    <div className="w-full max-w-lg sm:max-w-xl mx-auto px-2 xs:px-0 space-y-4 sm:space-y-6">
      {/* Initialization Banner - Show when privacy mode but not initialized */}
      {privacyMode && connected && !isInitialized && (
        <div
          className="p-4 rounded-xl flex items-start gap-3"
          style={{
            background: `${theme.colors.warning}10`,
            border: `1px solid ${theme.colors.warning}30`
          }}
        >
          <LockClosedIcon className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: theme.colors.warning }} />
          <div className="flex-1">
            <div className="text-sm font-medium" style={{ color: theme.colors.warning }}>
              Initialize Stealth Keys
            </div>
            <div className="text-xs mt-1" style={{ color: theme.colors.textSecondary }}>
              Sign a message to generate your stealth viewing keys for private transfers.
            </div>
            <button
              onClick={handleInitialize}
              disabled={isInitializing}
              className="mt-3 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 hover:scale-[1.02] disabled:opacity-50"
              style={{
                background: theme.colors.warning,
                color: '#000'
              }}
            >
              {isInitializing ? 'Initializing...' : 'Initialize Keys'}
            </button>
          </div>
        </div>
      )}

      {/* Registration Banner - Show when initialized but not registered */}
      {privacyMode && connected && isInitialized && !isRegistered && (
        <div
          className="p-4 rounded-xl flex items-start gap-3"
          style={{
            background: `${theme.colors.info}10`,
            border: `1px solid ${theme.colors.info}30`
          }}
        >
          <UserIcon className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: theme.colors.info }} />
          <div className="flex-1">
            <div className="text-sm font-medium" style={{ color: theme.colors.info }}>
              Register for Stealth Payments
            </div>
            <div className="text-xs mt-1" style={{ color: theme.colors.textSecondary }}>
              {registrationProgress
                ? registrationProgress.message
                : 'Register your stealth address on-chain so others can send you private payments.'}
            </div>

            {/* Progress bar during registration */}
            {registrationProgress && registrationProgress.step !== 'complete' && registrationProgress.step !== 'error' && (
              <div className="mt-3">
                <div className="flex justify-between text-xs mb-1" style={{ color: theme.colors.textMuted }}>
                  <span>Step {registrationProgress.currentTx} of {registrationProgress.totalTx}</span>
                  <span>{Math.round((registrationProgress.currentTx / registrationProgress.totalTx) * 100)}%</span>
                </div>
                <div
                  className="h-2 rounded-full overflow-hidden"
                  style={{ background: `${theme.colors.border}` }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${(registrationProgress.currentTx / registrationProgress.totalTx) * 100}%`,
                      background: theme.colors.info
                    }}
                  />
                </div>
              </div>
            )}

            <button
              onClick={handleRegister}
              disabled={isInitializing}
              className="mt-3 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 hover:scale-[1.02] disabled:opacity-50"
              style={{
                background: theme.colors.info,
                color: '#fff'
              }}
            >
              {isInitializing ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {registrationProgress ? registrationProgress.message : 'Registering...'}
                </span>
              ) : 'Register Now'}
            </button>
          </div>
        </div>
      )}

      {/* Incoming Payments Banner - Auto-claim status */}
      {privacyMode && connected && (pendingClaims.length > 0 || isScanning) && (
        <div
          className="p-4 rounded-xl"
          style={{
            background: `${theme.colors.success}10`,
            border: `1px solid ${theme.colors.success}30`
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {isScanning && (
                <ArrowPathIcon className="w-4 h-4 animate-spin" style={{ color: theme.colors.success }} />
              )}
              <span className="text-sm font-medium" style={{ color: theme.colors.success }}>
                {isScanning ? 'Scanning for Payments...' : 'Incoming Payments'}
              </span>
            </div>
            {totalPendingAmount > BigInt(0) && (
              <span className="text-sm font-bold" style={{ color: theme.colors.success }}>
                {(Number(totalPendingAmount) / LAMPORTS_PER_SOL).toFixed(4)} SOL
              </span>
            )}
          </div>

          {pendingClaims.length > 0 && (
            <div className="space-y-2 mt-3">
              {pendingClaims.slice(0, 3).map((claim) => (
                <div
                  key={claim.vaultAddress}
                  className="flex items-center justify-between p-2 rounded-lg"
                  style={{ background: `${theme.colors.surface}40` }}
                >
                  <div>
                    <div className="text-xs" style={{ color: theme.colors.textSecondary }}>
                      From: {claim.sender.slice(0, 4)}...{claim.sender.slice(-4)}
                    </div>
                    <div className="text-sm font-medium" style={{ color: theme.colors.textPrimary }}>
                      {(Number(claim.amount) / LAMPORTS_PER_SOL).toFixed(4)} SOL
                    </div>
                  </div>
                  <div
                    className="px-2 py-1 rounded text-xs font-medium"
                    style={{
                      background: claim.status === 'claimed' ? `${theme.colors.success}20` :
                                  claim.status === 'claiming' ? `${theme.colors.info}20` :
                                  claim.status === 'failed' ? `${theme.colors.error}20` :
                                  `${theme.colors.warning}20`,
                      color: claim.status === 'claimed' ? theme.colors.success :
                             claim.status === 'claiming' ? theme.colors.info :
                             claim.status === 'failed' ? theme.colors.error :
                             theme.colors.warning
                    }}
                  >
                    {claim.status === 'claimed' ? 'Claimed' :
                     claim.status === 'claiming' ? 'Claiming...' :
                     claim.status === 'failed' ? 'Failed' :
                     'Auto-claiming...'}
                  </div>
                </div>
              ))}
              {pendingClaims.length > 3 && (
                <div className="text-xs text-center" style={{ color: theme.colors.textMuted }}>
                  +{pendingClaims.length - 3} more payments
                </div>
              )}
            </div>
          )}

          {lastScanTime && (
            <div className="text-xs mt-2" style={{ color: theme.colors.textMuted }}>
              Last scan: {lastScanTime.toLocaleTimeString()}
            </div>
          )}

          {!isScanning && pendingClaims.length === 0 && (
            <button
              onClick={startScanning}
              className="mt-2 text-xs font-medium transition-opacity hover:opacity-80"
              style={{ color: theme.colors.success }}
            >
              Scan Again
            </button>
          )}
        </div>
      )}

      {/* Main Card */}
      <div
        className="relative p-6 rounded-2xl overflow-hidden"
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

        <div className="relative z-10 space-y-5">
          {/* Token Selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium" style={{ color: theme.colors.textSecondary }}>
              Token to Send
            </label>
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setIsTokenDropdownOpen(!isTokenDropdownOpen)}
                className="w-full p-4 rounded-xl transition-all duration-300 hover:scale-[1.01] flex items-center justify-between"
                style={{
                  background: `${theme.colors.surface}60`,
                  border: `1px solid ${theme.colors.border}`,
                  backdropFilter: 'blur(16px) saturate(1.5)'
                }}
              >
                <div className="flex items-center gap-3">
                  <TokenIcon
                    symbol={currentToken?.symbol || 'SOL'}
                    mint={currentToken?.mintAddress || ''}
                    logoURI={getJupiterIconUrl(currentToken?.symbol || 'SOL') || undefined}
                    size={36}
                  />
                  <div className="text-left">
                    <div className="font-bold" style={{ color: theme.colors.textPrimary }}>
                      {currentToken?.symbol}
                    </div>
                    <div className="text-xs" style={{ color: theme.colors.textMuted }}>
                      Balance: {privacyMode ? '****' : currentToken?.balance || '0'}
                    </div>
                  </div>
                </div>
                <ChevronDownIcon
                  className="w-5 h-5 transition-transform duration-300"
                  style={{
                    color: theme.colors.textSecondary,
                    transform: isTokenDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)'
                  }}
                />
              </button>

              {/* Dropdown */}
              {isTokenDropdownOpen && (
                <div
                  className="absolute top-full left-0 right-0 mt-2 z-50 rounded-xl overflow-hidden"
                  style={{
                    background: `${theme.colors.surface}ee`,
                    border: `1px solid ${theme.colors.border}`,
                    backdropFilter: 'blur(24px) saturate(1.8)',
                    boxShadow: `0 20px 60px ${theme.colors.shadowHeavy}`
                  }}
                >
                  {tokens.map((token) => (
                    <button
                      key={token.id}
                      onClick={() => {
                        setSelectedToken(token.id)
                        setIsTokenDropdownOpen(false)
                      }}
                      className="w-full p-4 transition-all duration-200 flex items-center gap-3 hover:scale-[1.01]"
                      style={{
                        background: selectedToken === token.id ? `${theme.colors.primary}15` : 'transparent',
                        borderBottom: `1px solid ${theme.colors.borderLight}`
                      }}
                    >
                      <TokenIcon
                        symbol={token.symbol}
                        mint={token.mintAddress}
                        logoURI={getJupiterIconUrl(token.symbol) || undefined}
                        size={32}
                      />
                      <div className="flex-1 text-left">
                        <div className="font-bold text-sm" style={{ color: theme.colors.textPrimary }}>
                          {token.symbol}
                        </div>
                        <div className="text-xs" style={{ color: theme.colors.textMuted }}>
                          {token.name}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium" style={{ color: theme.colors.textPrimary }}>
                          {privacyMode ? '****' : token.balance}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Amount Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium" style={{ color: theme.colors.textSecondary }}>
                Amount
              </label>
              <button
                onClick={() => setAmount(currentToken?.balance || '0')}
                className="text-xs font-medium transition-all duration-200 hover:opacity-80"
                style={{ color: theme.colors.primary }}
              >
                MAX
              </button>
            </div>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-4 py-4 pr-24 rounded-xl bg-transparent text-lg"
                style={{
                  background: `${theme.colors.surface}40`,
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  borderColor: !hasEnoughBalance && amount ? theme.colors.error : theme.colors.border,
                  color: theme.colors.textPrimary,
                  outline: 'none'
                }}
                onFocus={(e) => {
                  if (hasEnoughBalance || !amount) {
                    e.currentTarget.style.borderColor = theme.colors.primary
                  }
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = !hasEnoughBalance && amount ? theme.colors.error : theme.colors.border
                }}
              />
              <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
                <span className="font-bold" style={{ color: theme.colors.textPrimary }}>
                  {currentToken?.symbol}
                </span>
              </div>
            </div>
            {!hasEnoughBalance && amount && (
              <div className="flex items-center gap-1 text-xs" style={{ color: theme.colors.error }}>
                <ExclamationCircleIcon className="w-4 h-4" />
                Insufficient balance
              </div>
            )}
          </div>

          {/* Recipient Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium" style={{ color: theme.colors.textSecondary }}>
              Recipient Address
            </label>
            <div className="relative">
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="Enter Solana wallet address..."
                className="w-full px-4 py-4 pl-12 rounded-xl bg-transparent"
                style={{
                  background: `${theme.colors.surface}40`,
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  borderColor: recipient && !isValidRecipient ? theme.colors.error : theme.colors.border,
                  color: theme.colors.textPrimary,
                  outline: 'none'
                }}
                onFocus={(e) => {
                  if (isValidRecipient || !recipient) {
                    e.currentTarget.style.borderColor = theme.colors.primary
                  }
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = recipient && !isValidRecipient ? theme.colors.error : theme.colors.border
                }}
              />
              <div className="absolute left-4 top-1/2 transform -translate-y-1/2">
                <UserIcon className="w-5 h-5" style={{ color: theme.colors.textMuted }} />
              </div>
              {recipient && (
                <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
                  {checkingRecipient ? (
                    <ArrowPathIcon className="w-5 h-5 animate-spin" style={{ color: theme.colors.textMuted }} />
                  ) : isValidRecipient ? (
                    <CheckCircleIcon className="w-5 h-5" style={{ color: theme.colors.success }} />
                  ) : (
                    <ExclamationCircleIcon className="w-5 h-5" style={{ color: theme.colors.error }} />
                  )}
                </div>
              )}
            </div>
            {recipient && !isValidRecipient && (
              <div className="flex items-center gap-1 text-xs" style={{ color: theme.colors.error }}>
                <ExclamationCircleIcon className="w-4 h-4" />
                Invalid Solana address
              </div>
            )}
            {/* Privacy mode: show registration status */}
            {privacyMode && isValidRecipient && recipientRegistered === false && (
              <div className="flex items-center gap-1 text-xs" style={{ color: theme.colors.warning }}>
                <ExclamationCircleIcon className="w-4 h-4" />
                Recipient not registered for stealth payments
              </div>
            )}
            {privacyMode && isValidRecipient && recipientRegistered === true && (
              <div className="flex items-center gap-1 text-xs" style={{ color: theme.colors.success }}>
                <CheckCircleIcon className="w-4 h-4" />
                Recipient can receive stealth payments
              </div>
            )}
          </div>

          {/* Privacy Notice */}
          {privacyMode && (
            <div
              className="p-4 rounded-xl flex items-start gap-3"
              style={{
                background: `${theme.colors.success}10`,
                border: `1px solid ${theme.colors.success}20`
              }}
            >
              <LockClosedIcon className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: theme.colors.success }} />
              <div>
                <div className="text-sm font-medium" style={{ color: theme.colors.success }}>
                  Stealth Transfer Enabled
                </div>
                <div className="text-xs mt-1" style={{ color: theme.colors.textSecondary }}>
                  Your transaction will be sent to a stealth address. The recipient can claim it using their viewing keys.
                </div>
              </div>
            </div>
          )}

          {/* Send Button */}
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="w-full py-4 rounded-xl font-bold text-lg transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            style={{
              background: canSend
                ? `linear-gradient(135deg, ${theme.colors.primary} 0%, ${theme.colors.primaryHover} 100%)`
                : `${theme.colors.surface}60`,
              border: `1px solid ${canSend ? theme.colors.primary : theme.colors.border}30`,
              boxShadow: canSend ? `0 8px 24px ${theme.colors.primary}30` : 'none',
              color: canSend ? (theme.name === 'stealth' ? '#000000' : 'white') : theme.colors.textMuted
            }}
          >
            {isSending ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Sending...
              </span>
            ) : !connected ? (
              'Connect Wallet'
            ) : privacyMode && !isInitialized ? (
              'Initialize Keys First'
            ) : privacyMode && recipientRegistered === false ? (
              'Recipient Not Registered'
            ) : (
              <span className="flex items-center justify-center gap-2">
                <PaperAirplaneIcon className="w-5 h-5" />
                {privacyMode ? 'Send Privately' : 'Send'}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Devnet Notice */}
      <div
        className="text-center text-xs"
        style={{ color: theme.colors.textMuted, opacity: 0.7 }}
      >
        <span>Connected to Solana Devnet - OceanVault Stealth Program</span>
      </div>

      {/* Security & Info Footer */}
      <div
        className="pt-4"
        style={{ borderTop: `1px solid ${theme.colors.border}` }}
      >
        <div
          className="flex items-center justify-center gap-6 text-xs mb-3"
          style={{ color: theme.colors.textMuted }}
        >
          <div className="flex items-center gap-1">
            <LockClosedIcon className="h-3 w-3" style={{ color: theme.colors.success }} />
            <span>Stealth Addresses</span>
          </div>
          <div className="flex items-center gap-1">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: theme.colors.primary }}
            />
            <span>End-to-End Encrypted</span>
          </div>
          <div className="flex items-center gap-1">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: theme.colors.success }}
            />
            <span>Non-Custodial</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default WaveSend
