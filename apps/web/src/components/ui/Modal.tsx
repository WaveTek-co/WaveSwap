'use client'

import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'
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

export default Modal