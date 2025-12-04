'use client'

import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { X, CheckCircle, AlertTriangle, TrendingUp } from 'lucide-react'
import { useThemeConfig } from '@/lib/theme'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  showCloseButton?: boolean
  closeOnBackdropClick?: boolean
  preventClose?: boolean
  className?: string
  title?: string
  description?: string
}

export function Modal({
  isOpen,
  onClose,
  children,
  size = 'md',
  showCloseButton = true,
  closeOnBackdropClick = true,
  preventClose = false,
  className,
  title,
  description,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const theme = useThemeConfig()

  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !preventClose) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose, preventClose])

  if (!isOpen) return null

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-7xl mx-4',
  }

  const handleBackdropClick = (event: React.MouseEvent) => {
    if (event.target === event.currentTarget && closeOnBackdropClick && !preventClose) {
      onClose()
    }
  }

  const modalContent = (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 50,
          backgroundColor: theme.colors.overlay,
          backdropFilter: 'blur(8px)',
        }}
        className="animate-fade-in"
        onClick={handleBackdropClick}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          ref={modalRef}
          className={cn(
            'relative w-full pointer-events-auto animate-scale-in',
            sizes[size],
            className
          )}
          style={{
            background: `
              linear-gradient(135deg,
                ${theme.colors.surface} 0%,
                ${theme.colors.surfaceHover} 25%,
                ${theme.colors.surface} 50%,
                ${theme.colors.surfaceHover} 75%,
                ${theme.colors.surface} 100%
              ),
              radial-gradient(circle at 25% 25%,
                ${theme.colors.primary}08 0%,
                transparent 50%
              )
            `,
            border: `1px solid ${theme.colors.primary}25`,
            borderRadius: '1rem',
            boxShadow: `
              0 25px 70px ${theme.colors.shadowHeavy},
              0 12px 32px ${theme.colors.primary}15,
              inset 0 1px 0 rgba(255, 255, 255, 0.15),
              inset 0 -1px 0 rgba(0, 0, 0, 0.3)
            `,
            backdropFilter: theme.glassStyles.backdrop
          }}
        >
          {/* Header */}
          {(title || showCloseButton) && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1.5rem',
                borderBottom: `1px solid ${theme.colors.border}`
              }}
            >
              <div>
                {title && (
                  <h2
                    style={{
                      fontSize: '1.25rem',
                      fontWeight: 600,
                      color: theme.colors.textPrimary,
                      fontFamily: 'var(--font-helvetica)'
                    }}
                  >
                    {title}
                  </h2>
                )}
                {description && (
                  <p
                    style={{
                      fontSize: '0.875rem',
                      marginTop: '0.25rem',
                      color: theme.colors.textMuted,
                      fontFamily: 'var(--font-helvetica)'
                    }}
                  >
                    {description}
                  </p>
                )}
              </div>
              {showCloseButton && !preventClose && (
                <button
                  onClick={onClose}
                  style={{
                    borderRadius: '0.5rem',
                    padding: '0.5rem',
                    transition: `all ${theme.animations.duration} ${theme.animations.easing}`,
                    color: theme.colors.textSecondary,
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = theme.colors.surfaceHover
                    e.currentTarget.style.color = theme.colors.textPrimary
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                    e.currentTarget.style.color = theme.colors.textSecondary
                  }}
                >
                  <X size={16} />
                </button>
              )}
            </div>
          )}

          {/* Content */}
          <div className={cn('max-h-[70vh] overflow-y-auto custom-scrollbar', !title && !showCloseButton && 'p-6')}>
            {children}
          </div>
        </div>
      </div>
    </>
  )

  return createPortal(modalContent, document.body)
}

interface ModalHeaderProps {
  children: React.ReactNode
  className?: string
}

export function ModalHeader({ children, className }: ModalHeaderProps) {
  return (
    <div className={cn('p-6 border-b border-border', className)}>
      {children}
    </div>
  )
}

interface ModalContentProps {
  children: React.ReactNode
  className?: string
}

export function ModalContent({ children, className }: ModalContentProps) {
  return (
    <div className={cn('p-6', className)}>
      {children}
    </div>
  )
}

interface ModalFooterProps {
  children: React.ReactNode
  className?: string
}

export function ModalFooter({ children, className }: ModalFooterProps) {
  return (
    <div className={cn('flex items-center justify-end gap-3 p-6 border-t border-border', className)}>
      {children}
    </div>
  )
}

interface DrawerProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  side?: 'left' | 'right' | 'top' | 'bottom'
  size?: 'sm' | 'md' | 'lg'
  showCloseButton?: boolean
  closeOnBackdropClick?: boolean
  preventClose?: boolean
  className?: string
}

export function Drawer({
  isOpen,
  onClose,
  children,
  side = 'right',
  size = 'md',
  showCloseButton = true,
  closeOnBackdropClick = true,
  preventClose = false,
  className,
}: DrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !preventClose) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose, preventClose])

  if (!isOpen) return null

  const sizes = {
    sm: side === 'left' || side === 'right' ? 'w-80' : side === 'top' || side === 'bottom' ? 'h-48' : 'w-80',
    md: side === 'left' || side === 'right' ? 'w-96' : side === 'top' || side === 'bottom' ? 'h-64' : 'w-96',
    lg: side === 'left' || side === 'right' ? 'w-[480px]' : side === 'top' || side === 'bottom' ? 'h-80' : 'w-[480px]',
  }

  const positions = {
    left: 'left-0 top-0 h-full',
    right: 'right-0 top-0 h-full',
    top: 'top-0 left-0 w-full',
    bottom: 'bottom-0 left-0 w-full',
  }

  const handleBackdropClick = (event: React.MouseEvent) => {
    if (event.target === event.currentTarget && closeOnBackdropClick && !preventClose) {
      onClose()
    }
  }

  const drawerContent = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={handleBackdropClick}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className={cn(
          'fixed z-50 bg-card border border-border shadow-2xl animate-slide-up',
          sizes[size],
          positions[side],
          className
        )}
      >
        <div className="relative h-full">
          {showCloseButton && !preventClose && (
            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-10 rounded-lg p-2 hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}

          <div className="h-full overflow-y-auto custom-scrollbar">
            {children}
          </div>
        </div>
      </div>
    </>
  )

  return createPortal(drawerContent, document.body)
}

// Withdrawal Confirmation Modal
interface WithdrawConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  tokenSymbol: string
  tokenAmount: string
  recipientAddress: string
  isLoading?: boolean
}

export function WithdrawConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  tokenSymbol,
  tokenAmount,
  recipientAddress,
  isLoading = false
}: WithdrawConfirmModalProps) {
  const theme = useThemeConfig()

  if (!isOpen) return null

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Confirm Withdrawal"
      description="Please review your withdrawal details"
      size="md"
      preventClose={isLoading}
    >
      <div className="space-y-6">
        {/* Withdrawal Details Card */}
        <div
          className="rounded-xl border p-4 space-y-4"
          style={{
            background: theme.colors.surface,
            borderColor: theme.colors.primary + '25'
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{
                background: `linear-gradient(135deg, ${theme.colors.primary}20, ${theme.colors.primary}10)`,
                border: `1px solid ${theme.colors.primary}30`
              }}
            >
              <TrendingUp
                size={20}
                style={{ color: theme.colors.primary }}
              />
            </div>
            <div className="flex-1">
              <h3
                className="font-semibold"
                style={{ color: theme.colors.textPrimary }}
              >
                {tokenSymbol} Withdrawal
              </h3>
              <p
                className="text-sm"
                style={{ color: theme.colors.textMuted }}
              >
                From confidential pool to wallet
              </p>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex justify-between items-center">
              <span
                className="text-sm font-medium"
                style={{ color: theme.colors.textSecondary }}
              >
                Amount
              </span>
              <span
                className="font-semibold text-base"
                style={{ color: theme.colors.textPrimary }}
              >
                {tokenAmount} {tokenSymbol}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span
                className="text-sm font-medium"
                style={{ color: theme.colors.textSecondary }}
              >
                Recipient
              </span>
              <div
                className="font-mono text-sm font-semibold"
                style={{
                  color: theme.colors.textPrimary,
                  background: theme.colors.surfaceHover + '30',
                  padding: '0.25rem 0.5rem',
                  borderRadius: '0.375rem'
                }}
              >
                {formatAddress(recipientAddress)}
              </div>
            </div>
          </div>
        </div>

        {/* Security Notice */}
        <div
          className="rounded-lg p-3 flex gap-3"
          style={{
            background: theme.name === 'privacy' ? theme.colors.warning + '15' : theme.colors.warning + '10',
            border: `1px solid ${theme.colors.warning}30`
          }}
        >
          <AlertTriangle
            size={16}
            style={{ color: theme.colors.warning, flexShrink: 0, marginTop: '2px' }}
          />
          <div>
            <p
              className="text-sm font-medium mb-1"
              style={{ color: theme.colors.textPrimary }}
            >
              Security Notice
            </p>
            <p
              className="text-xs leading-relaxed"
              style={{ color: theme.colors.textMuted }}
            >
              This withdrawal will move your confidential tokens to your specified wallet address. This action is irreversible once confirmed.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 py-3 px-4 rounded-xl font-medium transition-all duration-200"
            style={{
              background: theme.colors.surfaceHover + '20',
              color: theme.colors.textSecondary,
              border: `1px solid ${theme.colors.border}`,
              opacity: isLoading ? 0.5 : 1,
              cursor: isLoading ? 'not-allowed' : 'pointer'
            }}
            onMouseEnter={(e) => {
              if (!isLoading) {
                e.currentTarget.style.background = theme.colors.surfaceHover + '40'
                e.currentTarget.style.color = theme.colors.textPrimary
              }
            }}
            onMouseLeave={(e) => {
              if (!isLoading) {
                e.currentTarget.style.background = theme.colors.surfaceHover + '20'
                e.currentTarget.style.color = theme.colors.textSecondary
              }
            }}
          >
            Cancel
          </button>

          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 py-3 px-4 rounded-xl font-medium transition-all duration-200 relative overflow-hidden"
            style={{
              background: `linear-gradient(135deg, ${theme.colors.primary} 0%, ${theme.colors.primaryHover} 100%)`,
              color: 'white',
              border: `1px solid ${theme.colors.primary}50`,
              opacity: isLoading ? 0.7 : 1,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              boxShadow: `0 4px 12px ${theme.colors.primary}30`
            }}
            onMouseEnter={(e) => {
              if (!isLoading) {
                e.currentTarget.style.background = `linear-gradient(135deg, ${theme.colors.primaryHover} 0%, ${theme.colors.primary} 100%)`
                e.currentTarget.style.transform = 'translateY(-1px)'
                e.currentTarget.style.boxShadow = `0 6px 20px ${theme.colors.primary}40`
              }
            }}
            onMouseLeave={(e) => {
              if (!isLoading) {
                e.currentTarget.style.background = `linear-gradient(135deg, ${theme.colors.primary} 0%, ${theme.colors.primaryHover} 100%)`
                e.currentTarget.style.transform = 'translateY(0px)'
                e.currentTarget.style.boxShadow = `0 4px 12px ${theme.colors.primary}30`
              }
            }}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Processing...
              </span>
            ) : (
              'Confirm Withdrawal'
            )}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// Withdrawal Success Modal
interface WithdrawSuccessModalProps {
  isOpen: boolean
  onClose: () => void
  transactionSignature?: string
  tokenSymbol: string
  tokenAmount: string
  recipientAddress: string
}

export function WithdrawSuccessModal({
  isOpen,
  onClose,
  transactionSignature,
  tokenSymbol,
  tokenAmount,
  recipientAddress
}: WithdrawSuccessModalProps) {
  const theme = useThemeConfig()

  if (!isOpen) return null

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  const openExplorer = (signature: string) => {
    window.open(`https://orb.helius.dev/tx/${signature}`, '_blank')
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Withdrawal Successful!"
      description="Your confidential tokens have been transferred"
      size="md"
      showCloseButton={true}
    >
      <div className="space-y-6">
        {/* Success Icon */}
        <div className="flex justify-center">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center relative"
            style={{
              background: `linear-gradient(135deg, ${theme.colors.success}20, ${theme.colors.success}10)`,
              border: `2px solid ${theme.colors.success}40`
            }}
          >
            <CheckCircle
              size={36}
              style={{ color: theme.colors.success }}
            />
            {/* Animated glow effect */}
            <div
              className="absolute inset-0 rounded-full animate-pulse"
              style={{
                background: `radial-gradient(circle, ${theme.colors.success}30 0%, transparent 70%)`,
                filter: 'blur(8px)'
              }}
            />
          </div>
        </div>

        {/* Transaction Details */}
        <div
          className="rounded-xl border p-4 space-y-4"
          style={{
            background: theme.colors.surface,
            borderColor: theme.colors.success + '25'
          }}
        >
          <div className="text-center space-y-2">
            <h3
              className="text-2xl font-bold"
              style={{ color: theme.colors.textPrimary }}
            >
              {tokenAmount} {tokenSymbol}
            </h3>
            <p
              className="text-sm"
              style={{ color: theme.colors.textMuted }}
            >
              Successfully withdrawn to {formatAddress(recipientAddress)}
            </p>
          </div>

          {transactionSignature && (
            <div className="space-y-2 pt-3 border-t" style={{ borderColor: theme.colors.border }}>
              <div className="flex items-center justify-between">
                <span
                  className="text-sm font-medium"
                  style={{ color: theme.colors.textSecondary }}
                >
                  Transaction
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className="font-mono text-xs"
                    style={{
                      color: theme.colors.textMuted,
                      background: theme.colors.surfaceHover + '30',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '0.375rem'
                    }}
                  >
                    {transactionSignature.slice(0, 10)}...{transactionSignature.slice(-8)}
                  </span>
                  <button
                    onClick={() => copyToClipboard(transactionSignature)}
                    className="p-1 rounded hover:bg-surfaceHover transition-colors"
                    style={{ color: theme.colors.textMuted }}
                  >
                    Copy
                  </button>
                  <button
                    onClick={() => openExplorer(transactionSignature)}
                    className="p-1 rounded hover:bg-surfaceHover transition-colors"
                    style={{ color: theme.colors.primary }}
                  >
                    View
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Success Message */}
        <div className="text-center space-y-2">
          <p
            className="text-base leading-relaxed"
            style={{ color: theme.colors.textPrimary }}
          >
            Your withdrawal has been processed successfully. The tokens should appear in your wallet shortly.
          </p>
          <p
            className="text-sm"
            style={{ color: theme.colors.textMuted }}
          >
            Transaction may take a few moments to confirm on the blockchain.
          </p>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="w-full py-3 px-4 rounded-xl font-medium transition-all duration-200"
          style={{
            background: `linear-gradient(135deg, ${theme.colors.success} 0%, ${theme.colors.success}99 100%)`,
            color: 'white',
            border: `1px solid ${theme.colors.success}50`,
            boxShadow: `0 4px 12px ${theme.colors.success}30`
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = `linear-gradient(135deg, ${theme.colors.success}99 0%, ${theme.colors.success} 100%)`
            e.currentTarget.style.transform = 'translateY(-1px)'
            e.currentTarget.style.boxShadow = `0 6px 20px ${theme.colors.success}40`
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = `linear-gradient(135deg, ${theme.colors.success} 0%, ${theme.colors.success}99 100%)`
            e.currentTarget.style.transform = 'translateY(0px)'
            e.currentTarget.style.boxShadow = `0 4px 12px ${theme.colors.success}30`
          }}
        >
          Done
        </button>
      </div>
    </Modal>
  )
}

// Withdrawal Error Modal
interface WithdrawErrorModalProps {
  isOpen: boolean
  onClose: () => void
  error: string
  onRetry?: () => void
  tokenSymbol: string
  tokenAmount: string
}

export function WithdrawErrorModal({
  isOpen,
  onClose,
  error,
  onRetry,
  tokenSymbol,
  tokenAmount
}: WithdrawErrorModalProps) {
  const theme = useThemeConfig()

  if (!isOpen) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Withdrawal Failed"
      description="There was an issue processing your withdrawal"
      size="md"
      showCloseButton={true}
    >
      <div className="space-y-6">
        {/* Error Icon */}
        <div className="flex justify-center">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{
              background: theme.colors.error + '20',
              border: `2px solid ${theme.colors.error}40`
            }}
          >
            <AlertTriangle
              size={32}
              style={{ color: theme.colors.error }}
            />
          </div>
        </div>

        {/* Error Details */}
        <div
          className="rounded-xl border p-4"
          style={{
            background: theme.colors.error + '05',
            borderColor: theme.colors.error + '25'
          }}
        >
          <div className="space-y-3">
            <div className="text-center">
              <h3
                className="text-lg font-semibold mb-2"
                style={{ color: theme.colors.textPrimary }}
              >
                {tokenAmount} {tokenSymbol}
              </h3>
              <p
                className="text-sm leading-relaxed"
                style={{ color: theme.colors.textMuted }}
              >
                The withdrawal could not be completed. Please try again or contact support if the issue persists.
              </p>
            </div>

            {error && (
              <div
                className="p-3 rounded-lg font-mono text-xs break-all"
                style={{
                  background: theme.colors.surface,
                  border: `1px solid ${theme.colors.border}`,
                  color: theme.colors.textMuted
                }}
              >
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 px-4 rounded-xl font-medium transition-all duration-200"
            style={{
              background: theme.colors.surfaceHover + '20',
              color: theme.colors.textSecondary,
              border: `1px solid ${theme.colors.border}`
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = theme.colors.surfaceHover + '40'
              e.currentTarget.style.color = theme.colors.textPrimary
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = theme.colors.surfaceHover + '20'
              e.currentTarget.style.color = theme.colors.textSecondary
            }}
          >
            Close
          </button>

          {onRetry && (
            <button
              onClick={onRetry}
              className="flex-1 py-3 px-4 rounded-xl font-medium transition-all duration-200"
              style={{
                background: `linear-gradient(135deg, ${theme.colors.primary} 0%, ${theme.colors.primaryHover} 100%)`,
                color: 'white',
                border: `1px solid ${theme.colors.primary}50`,
                boxShadow: `0 4px 12px ${theme.colors.primary}30`
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = `linear-gradient(135deg, ${theme.colors.primaryHover} 0%, ${theme.colors.primary} 100%)`
                e.currentTarget.style.transform = 'translateY(-1px)'
                e.currentTarget.style.boxShadow = `0 6px 20px ${theme.colors.primary}40`
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = `linear-gradient(135deg, ${theme.colors.primary} 0%, ${theme.colors.primaryHover} 100%)`
                e.currentTarget.style.transform = 'translateY(0px)'
                e.currentTarget.style.boxShadow = `0 4px 12px ${theme.colors.primary}30`
              }}
            >
              Try Again
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}

export default Modal