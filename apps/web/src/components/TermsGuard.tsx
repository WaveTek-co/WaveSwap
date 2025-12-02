'use client'

import React from 'react'
import { TermsModal } from './TermsModal'
import { useTerms } from '@/contexts/TermsContext'
import { useThemeConfig, createGlassStyles } from '@/lib/theme'
import { ExclamationTriangleIcon, ShieldCheckIcon } from '@heroicons/react/24/outline'

interface TermsGuardProps {
  children: React.ReactNode
}

export function TermsGuard({ children }: TermsGuardProps) {
  const { hasAcceptedTerms, showTermsModal, setShowTermsModal, acceptTerms, declineTerms } = useTerms()
  const theme = useThemeConfig()

  return (
    <>
      {/* Show app content if terms accepted, otherwise show terms guard */}
      {hasAcceptedTerms === true ? (
        children
      ) : hasAcceptedTerms === false ? (
        <div className="min-h-screen relative">
          {/* Background gradient overlays - matching AppTabs design */}
          {theme.name !== 'stealth' && (
            <>
              <div
                className="absolute inset-0"
                style={{
                  opacity: theme.name === 'light' ? 0.6 : 0.4,
                  background: theme.name === 'light'
                    ? `radial-gradient(circle at 20% 50%, rgba(33, 188, 255, 0.15) 0%, rgba(33, 188, 255, 0.05) 30%, transparent 50%),
                        radial-gradient(circle at 80% 20%, rgba(74, 74, 255, 0.12) 0%, rgba(74, 74, 255, 0.03) 35%, transparent 50%),
                        radial-gradient(circle at 40% 80%, rgba(6, 182, 212, 0.10) 0%, rgba(6, 182, 212, 0.02) 40%, transparent 50%),
                        radial-gradient(circle at 60% 30%, rgba(33, 188, 255, 0.08) 0%, transparent 40%)`
                    : `radial-gradient(circle at 20% 50%, rgba(33, 188, 255, 0.25) 0%, transparent 50%),
                        radial-gradient(circle at 80% 20%, rgba(46, 46, 209, 0.20) 0%, transparent 50%),
                        radial-gradient(circle at 40% 80%, rgba(25, 153, 212, 0.18) 0%, transparent 50%),
                        radial-gradient(circle at 60% 30%, rgba(0, 191, 255, 0.15) 0%, transparent 40%)`,
                  animation: 'gradientFloat 20s ease-in-out infinite'
                }}
              />
              <div
                className="absolute inset-0"
                style={{
                  opacity: theme.name === 'light' ? 0.3 : 0.2,
                  background: theme.name === 'light'
                    ? `linear-gradient(45deg,
                        rgba(33, 188, 255, 0.05) 0%,
                        rgba(74, 74, 255, 0.08) 25%,
                        rgba(6, 182, 212, 0.06) 50%,
                        rgba(33, 188, 255, 0.04) 75%,
                        rgba(74, 74, 255, 0.07) 100%)`
                    : `linear-gradient(45deg, rgba(33, 188, 255, 0.08) 0%, rgba(46, 46, 209, 0.12) 25%, rgba(0, 191, 255, 0.10) 50%, rgba(33, 188, 255, 0.08) 75%, rgba(46, 46, 209, 0.12) 100%)`,
                  animation: 'gradientFloat 25s ease-in-out infinite reverse'
                }}
              />
            </>
          )}

          {/* Stealth mode blobs */}
          {theme.name === 'stealth' && (
            <>
              <div
                className="absolute w-96 h-96 rounded-full"
                style={{
                  top: '10%',
                  left: '5%',
                  background: 'radial-gradient(circle, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.01) 40%, transparent 70%)',
                  filter: 'blur(40px)',
                  animation: 'stealthBlob1 20s ease-in-out infinite',
                  zIndex: 1
                }}
              />
              <div
                className="absolute w-80 h-80 rounded-full"
                style={{
                  bottom: '15%',
                  right: '10%',
                  background: 'radial-gradient(circle, rgba(200, 200, 200, 0.03) 0%, rgba(200, 200, 200, 0.01) 50%, transparent 70%)',
                  filter: 'blur(30px)',
                  animation: 'stealthBlob2 25s ease-in-out infinite',
                  zIndex: 1
                }}
              />
            </>
          )}

          {/* Noise texture overlay */}
          {theme.name !== 'stealth' && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                opacity: theme.name === 'light' ? 0.03 : 0.05,
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='200' height='200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3Cfilter%3E%3Crect width='200' height='200' filter='url(%23noise)' opacity='0.5'/%3E%3C/svg%3E")`,
                mixBlendMode: theme.name === 'light' ? 'soft-light' : 'overlay',
                zIndex: 2
              }}
            />
          )}

          {/* Content */}
          <div className="relative z-10 min-h-screen flex items-center justify-center px-4">
            <div className="w-full max-w-md">
              {/* Main glass card */}
              <div
                className="relative p-8 rounded-2xl overflow-hidden"
                style={{
                  ...createGlassStyles(theme),
                  backdropFilter: 'blur(20px) saturate(180%)',
                  border: `1px solid ${theme.colors.border}`,
                  boxShadow: `0 8px 32px ${theme.colors.shadow}, inset 0 1px 0 rgba(255, 255, 255, 0.1)`
                }}
              >
                {/* Noise grain overlay */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    opacity: theme.name === 'light' ? 0.02 : 0.03,
                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3Cfilter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='0.1'/%3E%3C/svg%3E")`,
                    filter: theme.name === 'light' ? 'contrast(1.1) brightness(1.05)' : 'contrast(1.3) brightness(1.1)'
                  }}
                />

                <div className="relative z-10 text-center">
                  {/* Icon */}
                  <div className="flex justify-center mb-6">
                    <div
                      className="w-16 h-16 rounded-2xl flex items-center justify-center"
                      style={{
                        background: `${theme.colors.warning}20`,
                        border: `1px solid ${theme.colors.warning}30`
                      }}
                    >
                      <ExclamationTriangleIcon
                        className="w-8 h-8"
                        style={{ color: theme.colors.warning }}
                      />
                    </div>
                  </div>

                  {/* Title */}
                  <h1
                    className="text-2xl font-bold mb-4"
                    style={{
                      color: theme.colors.textPrimary,
                      fontFamily: 'var(--font-helvetica)'
                    }}
                  >
                    WaveTek Terms Required
                  </h1>

                  {/* Description */}
                  <p
                    className="text-sm mb-8 leading-relaxed"
                    style={{
                      color: theme.colors.textSecondary,
                      fontFamily: 'var(--font-helvetica)'
                    }}
                  >
                    Before you can start trading on WaveSwap, please review and accept our terms and conditions. Your privacy and security are our top priorities.
                  </p>

                  {/* CTA Button */}
                  <button
                    onClick={() => setShowTermsModal(true)}
                    className="w-full px-6 py-3 rounded-xl transition-all duration-300 font-medium hover:scale-[1.02] hover:shadow-lg"
                    style={{
                      background: theme.colors.primary,
                      color: theme.colors.textInverse,
                      border: `1px solid ${theme.colors.primary}`,
                      fontFamily: 'var(--font-helvetica)',
                      boxShadow: `0 4px 12px ${theme.colors.primary}30`
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = theme.colors.primaryHover
                      e.currentTarget.style.boxShadow = `0 6px 20px ${theme.colors.primary}40`
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = theme.colors.primary
                      e.currentTarget.style.boxShadow = `0 4px 12px ${theme.colors.primary}30`
                    }}
                  >
                    Review & Accept Terms
                  </button>

                  {/* Trust indicators */}
                  <div className="mt-6 flex items-center justify-center gap-4 text-xs" style={{ color: theme.colors.textMuted }}>
                    <div className="flex items-center gap-1">
                      <ShieldCheckIcon className="w-3 h-3" />
                      <span>Secure</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <ExclamationTriangleIcon className="w-3 h-3" />
                      <span>Audited</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Always show modal if not accepted */}
      <TermsModal
        isOpen={showTermsModal || hasAcceptedTerms !== true}
        onClose={() => setShowTermsModal(false)}
        onAccept={acceptTerms}
        onDecline={declineTerms}
      />
    </>
  )
}