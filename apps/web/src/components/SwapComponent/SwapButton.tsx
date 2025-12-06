'use client'

import { useWallet } from '@/hooks/useWalletAdapter'
import { ArrowPathIcon, LockClosedIcon, XMarkIcon, WalletIcon } from '@heroicons/react/24/outline'
import { ReactNode } from 'react'
import { SwapProgress, SwapStatus } from '@/types/token'
import { useThemeConfig, createGlassStyles } from '@/lib/theme'

interface SwapButtonProps {
  inputAmount: string
  inputToken: any
  outputToken: any
  quote: any
  loading: boolean
  privacyMode: boolean
  canSwap: boolean
  onSwap: () => void
  onCancel: () => void
  progress: SwapProgress | null
}

export function SwapButton({
  inputAmount,
  inputToken,
  outputToken,
  quote,
  loading,
  privacyMode,
  canSwap,
  onSwap,
  onCancel,
  progress
}: SwapButtonProps) {
  const { connected } = useWallet()
  const theme = useThemeConfig()

  const isValidAmount = inputAmount && parseFloat(inputAmount) > 0
  const hasBalance = true // TODO: Check actual balance from hook
  // For privacy mode, consider quote valid even with outputAmount: '0' (will be filled by Encifher)
  const hasQuote = quote && (privacyMode || quote.outputAmount > 0)
  const isProgressActive = progress && progress.status !== SwapStatus.IDLE && progress.status !== SwapStatus.COMPLETED

  let buttonContent: ReactNode = ''
  let buttonDisabled = false
  let buttonStyle: React.CSSProperties = {}
  const baseClass = 'glass-btn-primary w-full py-4 px-8 rounded-2xl text-lg transition-all transform hover:scale-[1.02] active:scale-[0.98]'

  if (!connected) {
    buttonContent = (
      <div className="flex items-center justify-center gap-3">
        <WalletIcon className="h-5 w-5" />
        <span>Connect Wallet to Continue</span>
      </div>
    )
    buttonDisabled = false
    buttonStyle = {
      ...createGlassStyles(theme),
      background: `
        linear-gradient(135deg,
          ${theme.colors.primary}dd 0%,
          ${theme.colors.primary}bb 100%
        )
      `,
      color: theme.name === 'light' ? '#ffffff' : theme.colors.textPrimary,
      border: `2px solid ${theme.colors.primary}60`,
      boxShadow: `
        0 8px 32px ${theme.colors.primary}20,
        inset 0 1px 0 rgba(255, 255, 255, ${theme.name === 'light' ? '0.6' : '0.1'})
      `,
      fontWeight: 600,
      textShadow: theme.name === 'light' ? '0 1px 2px rgba(0, 0, 0, 0.2)' : 'none'
    }
  } else if (!isValidAmount) {
    buttonContent = <span>ENTER AMOUNT</span>
    buttonDisabled = true
    buttonStyle = {
      ...createGlassStyles(theme),
      background: theme.name === 'light' ? `${theme.colors.surface}80` : `${theme.colors.surface}60`,
      color: theme.name === 'light' ? theme.colors.textMuted : `${theme.colors.textMuted}cc`,
      border: `2px solid ${theme.colors.primary}40`,
      cursor: 'not-allowed',
      boxShadow: `inset 0 0 0 1px ${theme.colors.primary}20`
    }
  } else if (!hasBalance) {
    buttonContent = <span>INSUFFICIENT BALANCE</span>
    buttonDisabled = true
    buttonStyle = {
      ...createGlassStyles(theme),
      background: theme.name === 'light' ? `${theme.colors.error}25` : `${theme.colors.error}20`,
      color: theme.colors.error,
      border: `1px solid ${theme.colors.error}50`,
      cursor: 'not-allowed'
    }
  } else if (isProgressActive) {
    const isCancellable = progress && [
      SwapStatus.QUOTING,
      SwapStatus.WRAPPING,
      SwapStatus.SWAPPING
    ].includes(progress.status)

    buttonContent = (
      <div className="flex items-center justify-center gap-3">
        {(progress?.status === SwapStatus.QUOTING || progress?.status === SwapStatus.SWAPPING || progress?.status === SwapStatus.CONFIRMING) && 
          <ArrowPathIcon className="h-5 w-5 animate-spin" style={{ color: 'white' }} />
        }
        {(progress?.status === SwapStatus.WRAPPING || progress?.status === SwapStatus.UNWRAPPING) && 
          <LockClosedIcon className="h-5 w-5 animate-pulse" style={{ color: 'white' }} />
        }
        <span>{progress?.message || 'PROCESSING'}</span>
      </div>
    )
    buttonDisabled = !isCancellable
    buttonStyle = {
      ...createGlassStyles(theme),
      background: `${theme.colors.primary}cc`,
      color: theme.colors.textPrimary,
      border: `1px solid ${theme.colors.primary}60`,
      cursor: isCancellable ? 'pointer' : 'wait'
    }
  } else if (loading) {
    buttonContent = (
      <div className="flex items-center justify-center gap-3">
        <ArrowPathIcon className="h-5 w-5 animate-spin" style={{ color: theme.colors.textPrimary }} />
        <span>FETCHING QUOTE</span>
      </div>
    )
    buttonDisabled = true
    buttonStyle = {
      ...createGlassStyles(theme),
      background: `${theme.colors.primary}dd`,
      color: theme.name === 'light' ? '#ffffff' : theme.colors.textPrimary,
      border: `1px solid ${theme.colors.primary}60`,
      cursor: 'wait',
      textShadow: theme.name === 'light' ? '0 1px 2px rgba(0, 0, 0, 0.2)' : 'none'
    }
  } else if (!hasQuote) {
    buttonContent = <span>NO ROUTE FOUND</span>
    buttonDisabled = true
    buttonStyle = {
      ...createGlassStyles(theme),
      background: `${theme.colors.warning}20`,
      color: theme.colors.warning,
      border: `1px solid ${theme.colors.warning}40`,
      cursor: 'not-allowed'
    }
  } else {
    buttonContent = (
      <div className="flex items-center justify-center gap-3">
        {privacyMode && <LockClosedIcon className="h-5 w-5" style={{ color: theme.colors.textPrimary }} />}
        <span>{privacyMode ? 'SWAP ENCRYPTED' : 'EXECUTE SWAP'}</span>
      </div>
    )
    buttonDisabled = !canSwap
    buttonStyle = {
      ...createGlassStyles(theme),
      background: `linear-gradient(135deg, ${theme.colors.success}ee 0%, ${theme.colors.success}cc 100%)`,
      color: theme.name === 'light' ? '#ffffff' : theme.colors.textPrimary,
      border: `2px solid ${theme.colors.success}60`,
      textShadow: theme.name === 'light' ? '0 1px 2px rgba(0, 0, 0, 0.2)' : 'none'
    }
  }

  return (
    <button
      className={baseClass}
      style={buttonStyle}
      disabled={buttonDisabled}
      onClick={() => {
        if (connected && canSwap && !loading && hasQuote && !isProgressActive) {
          onSwap()
        } else if (isProgressActive) {
          onCancel()
        }
      }}
      onMouseEnter={(e) => {
        if (!buttonDisabled) {
          e.currentTarget.style.transform = 'scale(1.02)'
          e.currentTarget.style.boxShadow = `
            0 12px 40px ${theme.colors.shadow},
            0 0 30px ${connected ? theme.colors.success : theme.colors.primary}40
          `
        }
      }}
      onMouseLeave={(e) => {
        if (!buttonDisabled) {
          e.currentTarget.style.transform = 'scale(1.0)'
          e.currentTarget.style.boxShadow = buttonStyle.boxShadow || 'none'
        }
      }}
    >
      {buttonContent}
    </button>
  )
}