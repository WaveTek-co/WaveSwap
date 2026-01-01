'use client'

import { useEffect } from 'react'
import { useWallet } from '@/hooks/useWalletAdapter'
import { useThemeConfig } from '@/lib/theme'
import { useGlobalModal } from '@/contexts/GlobalModalContext'
import { X } from 'lucide-react'
import { ThemeWaveLogo } from '@/components/ui/ThemeWaveLogo'

export function GlobalWalletModal() {
  const { connect, connecting } = useWallet()
  const theme = useThemeConfig()
  const { isWalletModalOpen, closeWalletModal } = useGlobalModal()

  const handleConnect = async (walletType: string) => {
    try {
      await connect(walletType)
      closeWalletModal()
    } catch (error) {
      console.error(`Failed to connect to ${walletType}:`, error)
    }
  }

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isWalletModalOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }

    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isWalletModalOpen])

  if (!isWalletModalOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: theme.colors.overlay,
        backdropFilter: 'blur(12px) saturate(180%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: '20px'
      }}
      onClick={closeWalletModal}
    >
      {/* Noise grain overlay */}
      <div
        className="absolute inset-0 opacity-3 pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3Cfilter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
          filter: 'contrast(1.3) brightness(1.1)'
        }}
      />

      <div
        style={{
          borderRadius: '24px',
          padding: '28px',
          minWidth: '360px',
          maxWidth: '400px',
          width: '100%',
          border: `1px solid ${theme.colors.primary}20`,
          position: 'relative',
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
          backdropFilter: 'blur(24px) saturate(1.8)',
          boxShadow: `
            0 20px 60px ${theme.colors.shadowHeavy},
            0 8px 24px ${theme.colors.primary}15,
            inset 0 1px 0 rgba(255, 255, 255, 0.1),
            inset 0 -1px 0 rgba(0, 0, 0, 0.1),
            0 0 0 1px ${theme.colors.primary}10
          `,
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Enhanced noise grain overlay */}
        <div
          className="absolute inset-0 opacity-4 pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='200' height='200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3Cfilter%3E%3Crect width='200' height='200' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
            filter: 'contrast(1.2) brightness(1.1)'
          }}
        />
        {/* Close Button */}
        <button
          onClick={closeWalletModal}
          className="relative z-10 transition-all duration-300 ease-out hover:scale-110 active:scale-95"
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: `
              linear-gradient(135deg,
                ${theme.colors.surface}ee 0%,
                ${theme.colors.surfaceHover}cc 100%
              )
            `,
            border: `1px solid ${theme.colors.primary}20`,
            cursor: 'pointer',
            color: theme.colors.textSecondary,
            padding: '8px',
            borderRadius: '12px',
            backdropFilter: 'blur(16px) saturate(1.5)',
            boxShadow: `
              0 8px 32px ${theme.colors.shadowHeavy},
              0 4px 12px ${theme.colors.primary}15,
              inset 0 1px 0 rgba(255, 255, 255, 0.1)
            `,
            fontFamily: 'var(--font-helvetica)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = `
              linear-gradient(135deg,
                ${theme.colors.primary}15 0%,
                ${theme.colors.primary}10 100%
              )
            `
            e.currentTarget.style.borderColor = `${theme.colors.primary}30`
            e.currentTarget.style.color = theme.colors.textPrimary
            e.currentTarget.style.boxShadow = `
              0 12px 40px ${theme.colors.shadowHeavy},
              0 6px 16px ${theme.colors.primary}25,
              inset 0 1px 0 rgba(255, 255, 255, 0.2)
            `
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = `
              linear-gradient(135deg,
                ${theme.colors.surface}ee 0%,
                ${theme.colors.surfaceHover}cc 100%
              )
            `
            e.currentTarget.style.borderColor = `${theme.colors.primary}20`
            e.currentTarget.style.color = theme.colors.textSecondary
            e.currentTarget.style.boxShadow = `
              0 8px 32px ${theme.colors.shadowHeavy},
              0 4px 12px ${theme.colors.primary}15,
              inset 0 1px 0 rgba(255, 255, 255, 0.1)
            `
          }}
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }} className="relative z-10">
          <div
            className="transition-all duration-300 ease-out hover:scale-105"
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '14px',
              background: `
                linear-gradient(135deg,
                  ${theme.colors.surface}ee 0%,
                  ${theme.colors.primary}20 50%,
                  ${theme.colors.surface}ee 100%
                ),
                radial-gradient(circle at 30% 30%,
                  ${theme.colors.primary}15 0%,
                  transparent 50%
                )
              `,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              border: `1px solid ${theme.colors.primary}25`,
              backdropFilter: 'blur(16px) saturate(1.5)',
              boxShadow: `
                0 12px 32px ${theme.colors.shadowHeavy},
                0 6px 16px ${theme.colors.primary}20,
                inset 0 1px 0 rgba(255, 255, 255, 0.2),
                inset 0 -1px 0 rgba(0, 0, 0, 0.1)
              `
            }}
          >
            <ThemeWaveLogo
            size={32}
            style={{
              borderRadius: '50%',
              objectFit: 'cover'
            }}
          />
          </div>
          <h2
            style={{
              margin: 0,
              color: theme.colors.textPrimary,
              fontFamily: 'var(--font-helvetica)',
              fontSize: '20px',
              fontWeight: 600,
              marginBottom: '6px',
              letterSpacing: '0.025em',
              textShadow: `0 0 20px ${theme.colors.primary}20`
            }}
          >
            Connect Wallet
          </h2>
          <p
            style={{
              margin: 0,
              color: theme.colors.textMuted,
              fontFamily: 'var(--font-helvetica)',
              fontSize: '14px',
              lineHeight: 1.4,
              fontWeight: 400
            }}
          >
            Choose your preferred wallet
          </p>
        </div>

        {/* Main Wallet Options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }} className="relative z-10">
          {/* Phantom Injected Wallet */}
          <button
            onClick={() => handleConnect('phantom-injected')}
            disabled={connecting}
            className="transition-all duration-300 ease-out hover:scale-[1.02] active:scale-[0.98] relative overflow-hidden"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              padding: '16px',
              borderRadius: '16px',
              border: `1px solid ${theme.colors.primary}20`,
              background: `
                linear-gradient(135deg,
                  ${theme.colors.surface}ee 0%,
                  ${theme.colors.primary}15 50%,
                  ${theme.colors.surface}ee 100%
                )
              `,
              cursor: connecting ? 'not-allowed' : 'pointer',
              backdropFilter: 'blur(16px) saturate(1.5)',
              fontFamily: 'var(--font-helvetica)',
              fontSize: '15px',
              fontWeight: 500,
              color: theme.colors.textPrimary,
              position: 'relative',
              boxShadow: `
                0 12px 32px ${theme.colors.shadowHeavy},
                0 6px 16px ${theme.colors.primary}20,
                inset 0 1px 0 rgba(255, 255, 255, 0.1),
                inset 0 -1px 0 rgba(0, 0, 0, 0.1)
              `,
              letterSpacing: '0.025em'
            }}
            onMouseEnter={(e) => {
              if (!connecting) {
                e.currentTarget.style.background = `
                  linear-gradient(135deg,
                    ${theme.colors.primary}25 0%,
                    ${theme.colors.primary}20 50%,
                    ${theme.colors.primary}10 100%
                  )
                `
                e.currentTarget.style.borderColor = `${theme.colors.primary}35`
                e.currentTarget.style.boxShadow = `
                  0 16px 40px ${theme.colors.shadowHeavy},
                  0 8px 20px ${theme.colors.primary}30,
                  inset 0 1px 0 rgba(255, 255, 255, 0.2)
                `
              }
            }}
            onMouseLeave={(e) => {
              if (!connecting) {
                e.currentTarget.style.background = `
                  linear-gradient(135deg,
                    ${theme.colors.surface}ee 0%,
                    ${theme.colors.primary}15 50%,
                    ${theme.colors.surface}ee 100%
                  )
                `
                e.currentTarget.style.borderColor = `${theme.colors.primary}20`
                e.currentTarget.style.boxShadow = `
                  0 12px 32px ${theme.colors.shadowHeavy},
                  0 6px 16px ${theme.colors.primary}20,
                  inset 0 1px 0 rgba(255, 255, 255, 0.1),
                  inset 0 -1px 0 rgba(0, 0, 0, 0.1)
                `
              }
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #AB9FF2, #9945FF)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: `
                  0 8px 24px rgba(171, 159, 242, 0.4),
                  inset 0 1px 0 rgba(255, 255, 255, 0.3)
                `,
                filter: 'drop-shadow(0 0 12px rgba(171, 159, 242, 0.3))'
              }}
            >
              <img
                src="/assets/Phantom/Phantom-Icon-Purple.svg"
                alt="Phantom"
                style={{ width: '24px', height: '24px' }}
              />
            </div>
            <div style={{ textAlign: 'left', flex: 1 }}>
              <div style={{ fontWeight: 600, marginBottom: '2px', fontSize: '15px' }}>Phantom Wallet</div>
              <div style={{ fontSize: '13px', color: theme.colors.textMuted, fontWeight: 400, lineHeight: 1.3 }}>
                Browser extension - Most popular Solana wallet
              </div>
            </div>
            {connecting && (
              <div
                style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  border: '2px solid ' + theme.colors.primary + '40',
                  borderTopColor: theme.colors.primary,
                  animation: 'spin 1s linear infinite',
                  boxShadow: `0 0 8px ${theme.colors.primary}30`
                }}
              />
            )}
          </button>

          {/* Google Wallet */}
          <button
            onClick={() => handleConnect('google')}
            disabled={connecting}
            className="transition-all duration-300 ease-out hover:scale-[1.02] active:scale-[0.98]"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              padding: '16px',
              borderRadius: '16px',
              border: `1px solid ${theme.colors.primary}20`,
              background: `
                linear-gradient(135deg,
                  ${theme.colors.surface}ee 0%,
                  ${theme.colors.surfaceHover}cc 50%,
                  ${theme.colors.surface}ee 100%
                )
              `,
              cursor: connecting ? 'not-allowed' : 'pointer',
              backdropFilter: 'blur(16px) saturate(1.5)',
              fontFamily: 'var(--font-helvetica)',
              fontSize: '15px',
              fontWeight: 500,
              color: theme.colors.textPrimary,
              position: 'relative',
              boxShadow: `
                0 12px 32px ${theme.colors.shadowHeavy},
                0 6px 16px ${theme.colors.primary}20,
                inset 0 1px 0 rgba(255, 255, 255, 0.1),
                inset 0 -1px 0 rgba(0, 0, 0, 0.1)
              `,
              letterSpacing: '0.025em'
            }}
            onMouseEnter={(e) => {
              if (!connecting) {
                e.currentTarget.style.background = `
                  linear-gradient(135deg,
                    ${theme.colors.primary}25 0%,
                    ${theme.colors.primary}20 50%,
                    ${theme.colors.primary}10 100%
                  )
                `
                e.currentTarget.style.borderColor = `${theme.colors.primary}35`
                e.currentTarget.style.boxShadow = `
                  0 16px 40px ${theme.colors.shadowHeavy},
                  0 8px 20px ${theme.colors.primary}30,
                  inset 0 1px 0 rgba(255, 255, 255, 0.2)
                `
              }
            }}
            onMouseLeave={(e) => {
              if (!connecting) {
                e.currentTarget.style.background = `
                  linear-gradient(135deg,
                    ${theme.colors.surface}ee 0%,
                    ${theme.colors.surfaceHover}cc 50%,
                    ${theme.colors.surface}ee 100%
                  )
                `
                e.currentTarget.style.borderColor = `${theme.colors.primary}20`
                e.currentTarget.style.boxShadow = `
                  0 12px 32px ${theme.colors.shadowHeavy},
                  0 6px 16px ${theme.colors.primary}20,
                  inset 0 1px 0 rgba(255, 255, 255, 0.1),
                  inset 0 -1px 0 rgba(0, 0, 0, 0.1)
                `
              }
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #f8f9fa, #e9ecef)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: `
                  0 8px 24px rgba(66, 133, 244, 0.25),
                  inset 0 1px 0 rgba(255, 255, 255, 0.8)
                `,
                filter: 'drop-shadow(0 0 12px rgba(66, 133, 244, 0.2))'
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            </div>
            <div style={{ textAlign: 'left', flex: 1 }}>
              <div style={{ fontWeight: 600, marginBottom: '2px', fontSize: '15px' }}>Continue with Google</div>
              <div style={{ fontSize: '13px', color: theme.colors.textMuted, fontWeight: 400, lineHeight: 1.3 }}>
                Sign in with your Google account
              </div>
            </div>
            {connecting && (
              <div
                style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  border: '2px solid ' + theme.colors.primary + '30',
                  borderTopColor: theme.colors.primary,
                  animation: 'spin 1s linear infinite'
                }}
              />
            )}
          </button>

          {/* Apple Wallet */}
          <button
            onClick={() => handleConnect('apple')}
            disabled={connecting}
            className="transition-all duration-300 ease-out hover:scale-[1.02] active:scale-[0.98]"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              padding: '16px',
              borderRadius: '16px',
              border: `1px solid ${theme.colors.primary}20`,
              background: `
                linear-gradient(135deg,
                  ${theme.colors.surface}ee 0%,
                  ${theme.colors.surfaceHover}cc 50%,
                  ${theme.colors.surface}ee 100%
                )
              `,
              cursor: connecting ? 'not-allowed' : 'pointer',
              backdropFilter: 'blur(16px) saturate(1.5)',
              fontFamily: 'var(--font-helvetica)',
              fontSize: '15px',
              fontWeight: 500,
              color: theme.colors.textPrimary,
              position: 'relative',
              boxShadow: `
                0 12px 32px ${theme.colors.shadowHeavy},
                0 6px 16px ${theme.colors.primary}20,
                inset 0 1px 0 rgba(255, 255, 255, 0.1),
                inset 0 -1px 0 rgba(0, 0, 0, 0.1)
              `,
              letterSpacing: '0.025em'
            }}
            onMouseEnter={(e) => {
              if (!connecting) {
                e.currentTarget.style.background = `
                  linear-gradient(135deg,
                    ${theme.colors.primary}25 0%,
                    ${theme.colors.primary}20 50%,
                    ${theme.colors.primary}10 100%
                  )
                `
                e.currentTarget.style.borderColor = `${theme.colors.primary}35`
                e.currentTarget.style.boxShadow = `
                  0 16px 40px ${theme.colors.shadowHeavy},
                  0 8px 20px ${theme.colors.primary}30,
                  inset 0 1px 0 rgba(255, 255, 255, 0.2)
                `
              }
            }}
            onMouseLeave={(e) => {
              if (!connecting) {
                e.currentTarget.style.background = `
                  linear-gradient(135deg,
                    ${theme.colors.surface}ee 0%,
                    ${theme.colors.surfaceHover}cc 50%,
                    ${theme.colors.surface}ee 100%
                  )
                `
                e.currentTarget.style.borderColor = `${theme.colors.primary}20`
                e.currentTarget.style.boxShadow = `
                  0 12px 32px ${theme.colors.shadowHeavy},
                  0 6px 16px ${theme.colors.primary}20,
                  inset 0 1px 0 rgba(255, 255, 255, 0.1),
                  inset 0 -1px 0 rgba(0, 0, 0, 0.1)
                `
              }
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #1c1c1e, #2c2c2e)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: `
                  0 8px 24px rgba(0, 0, 0, 0.4),
                  inset 0 1px 0 rgba(255, 255, 255, 0.1)
                `,
                filter: 'drop-shadow(0 0 12px rgba(0, 0, 0, 0.3))'
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
            </div>
            <div style={{ textAlign: 'left', flex: 1 }}>
              <div style={{ fontWeight: 600, marginBottom: '2px', fontSize: '15px' }}>Continue with Apple</div>
              <div style={{ fontSize: '13px', color: theme.colors.textMuted, fontWeight: 400, lineHeight: 1.3 }}>
                Sign in with your Apple ID
              </div>
            </div>
            {connecting && (
              <div
                style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  border: '2px solid ' + theme.colors.primary + '30',
                  borderTopColor: theme.colors.primary,
                  animation: 'spin 1s linear infinite'
                }}
              />
            )}
          </button>
        </div>

        {/* Other Wallets Grid */}
        <div style={{ marginTop: '20px' }} className="relative z-10">
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '12px'
          }}>
            <div style={{
              height: '1px',
              flex: 1,
              background: `${theme.colors.primary}20`
            }} />
            <span style={{
              fontSize: '12px',
              color: theme.colors.textMuted,
              fontFamily: 'var(--font-helvetica)',
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>
              Or connect with
            </span>
            <div style={{
              height: '1px',
              flex: 1,
              background: `${theme.colors.primary}20`
            }} />
          </div>

          {/* Scrollable Wallet Grid */}
          <div
            style={{
              maxHeight: '160px',
              overflowY: 'auto',
              paddingRight: '8px',
              scrollbarWidth: 'thin',
              scrollbarColor: `${theme.colors.primary}30 transparent`
            }}
            className="wallet-grid-scroll"
          >
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '12px'
            }}>
              {/* First Row - 3 wallets */}
              <button
                onClick={() => handleConnect('backpack')}
                disabled={connecting}
                className="transition-all duration-300 ease-out hover:scale-[1.05] active:scale-[0.95] relative"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '16px 12px',
                  borderRadius: '12px',
                  border: `2px solid ${theme.colors.primary}40`,
                  background: `
                    linear-gradient(135deg,
                      ${theme.colors.primary}15 0%,
                      ${theme.colors.surface}ee 50%,
                      ${theme.colors.primary}10 100%
                    )
                  `,
                  cursor: connecting ? 'not-allowed' : 'pointer',
                  backdropFilter: 'blur(12px) saturate(1.5)',
                  transition: 'all 0.3s ease',
                  minWidth: '0',
                  position: 'relative',
                  boxShadow: `
                    0 8px 24px rgba(171, 159, 242, 0.3),
                    0 4px 12px ${theme.colors.primary}20,
                    inset 0 1px 0 rgba(255, 255, 255, 0.2)
                  `,
                }}
                onMouseEnter={(e) => {
                  if (!connecting) {
                    e.currentTarget.style.background = `
                      linear-gradient(135deg,
                        ${theme.colors.primary}25 0%,
                        ${theme.colors.primary}15 50%,
                        ${theme.colors.primary}20 100%
                      )
                    `
                    e.currentTarget.style.borderColor = `${theme.colors.primary}50`
                    e.currentTarget.style.transform = 'scale(1.05)'
                    e.currentTarget.style.boxShadow = `
                      0 12px 32px rgba(171, 159, 242, 0.4),
                      0 6px 16px ${theme.colors.primary}30,
                      inset 0 1px 0 rgba(255, 255, 255, 0.3)
                    `
                  }
                }}
                onMouseLeave={(e) => {
                  if (!connecting) {
                    e.currentTarget.style.background = `
                      linear-gradient(135deg,
                        ${theme.colors.primary}15 0%,
                        ${theme.colors.surface}ee 50%,
                        ${theme.colors.primary}10 100%
                      )
                    `
                    e.currentTarget.style.borderColor = `${theme.colors.primary}40`
                    e.currentTarget.style.transform = 'scale(1)'
                    e.currentTarget.style.boxShadow = `
                      0 8px 24px rgba(171, 159, 242, 0.3),
                      0 4px 12px ${theme.colors.primary}20,
                      inset 0 1px 0 rgba(255, 255, 255, 0.2)
                    `
                  }
                }}
              >
                {/* Popular Badge */}
                <div
                  style={{
                    position: 'absolute',
                    top: '-6px',
                    right: '-6px',
                    background: 'linear-gradient(135deg, #9945FF, #AB9FF2)',
                    color: 'white',
                    fontSize: '10px',
                    fontWeight: 600,
                    padding: '2px 6px',
                    borderRadius: '6px',
                    fontFamily: 'var(--font-helvetica)',
                    boxShadow: '0 2px 8px rgba(153, 69, 255, 0.4)',
                    zIndex: 10
                  }}
                >
                  Popular
                </div>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #AB9FF2, #9945FF)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    boxShadow: `
                      0 4px 12px rgba(171, 159, 242, 0.4),
                      inset 0 1px 0 rgba(255, 255, 255, 0.3)
                    `,
                    filter: 'drop-shadow(0 0 8px rgba(171, 159, 242, 0.3))'
                  }}
                >
                  <img
                    src="/assets/Phantom/Phantom-Icon-Purple.svg"
                    alt="Phantom"
                    style={{ width: '20px', height: '20px' }}
                  />
                </div>
                <span style={{
                  fontSize: '11px',
                  color: theme.colors.textPrimary,
                  fontFamily: 'var(--font-helvetica)',
                  fontWeight: 600,
                  textAlign: 'center',
                  lineHeight: '1.2'
                }}>
                  Phantom
                  <br />
                  <span style={{
                    fontSize: '9px',
                    color: theme.colors.textMuted,
                    fontWeight: 400,
                    opacity: 0.8
                  }}>
                    (Injected)
                  </span>
                </span>
              </button>

              {/* Backpack Wallet */}
              <button
                onClick={() => handleConnect('backpack')}
                disabled={connecting}
                className="transition-all duration-300 ease-out hover:scale-[1.05] active:scale-[0.95]"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '16px 12px',
                  borderRadius: '12px',
                  border: `1px solid ${theme.colors.primary}15`,
                  background: `${theme.colors.surface}60`,
                  cursor: connecting ? 'not-allowed' : 'pointer',
                  backdropFilter: 'blur(12px) saturate(1.5)',
                  transition: 'all 0.3s ease',
                  minWidth: '0'
                }}
                onMouseEnter={(e) => {
                  if (!connecting) {
                    e.currentTarget.style.background = `${theme.colors.primary}15`
                    e.currentTarget.style.borderColor = `${theme.colors.primary}25`
                    e.currentTarget.style.transform = 'scale(1.05)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!connecting) {
                    e.currentTarget.style.background = `${theme.colors.surface}60`
                    e.currentTarget.style.borderColor = `${theme.colors.primary}15`
                    e.currentTarget.style.transform = 'scale(1)'
                  }
                }}
              >
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'rgba(99, 102, 241, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <img
                    src="/assets/backpack.png"
                    alt="Backpack"
                    style={{ width: '20px', height: '20px', objectFit: 'contain' }}
                  />
                </div>
                <span style={{
                  fontSize: '11px',
                  color: theme.colors.textPrimary,
                  fontFamily: 'var(--font-helvetica)',
                  fontWeight: 500,
                  textAlign: 'center',
                  lineHeight: '1.2'
                }}>
                  Backpack
                </span>
              </button>

              {/* Jupiter Wallet */}
              <button
                onClick={() => handleConnect('jupiter')}
                disabled={connecting}
                className="transition-all duration-300 ease-out hover:scale-[1.05] active:scale-[0.95]"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '16px 12px',
                  borderRadius: '12px',
                  border: `1px solid ${theme.colors.primary}15`,
                  background: `${theme.colors.surface}60`,
                  cursor: connecting ? 'not-allowed' : 'pointer',
                  backdropFilter: 'blur(12px) saturate(1.5)',
                  transition: 'all 0.3s ease',
                  minWidth: '0'
                }}
                onMouseEnter={(e) => {
                  if (!connecting) {
                    e.currentTarget.style.background = `${theme.colors.primary}15`
                    e.currentTarget.style.borderColor = `${theme.colors.primary}25`
                    e.currentTarget.style.transform = 'scale(1.05)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!connecting) {
                    e.currentTarget.style.background = `${theme.colors.surface}60`
                    e.currentTarget.style.borderColor = `${theme.colors.primary}15`
                    e.currentTarget.style.transform = 'scale(1)'
                  }
                }}
              >
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'rgba(245, 158, 11, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <img
                    src="/assets/jupiter.png"
                    alt="Jupiter"
                    style={{ width: '20px', height: '20px', objectFit: 'contain' }}
                  />
                </div>
                <span style={{
                  fontSize: '11px',
                  color: theme.colors.textPrimary,
                  fontFamily: 'var(--font-helvetica)',
                  fontWeight: 500,
                  textAlign: 'center',
                  lineHeight: '1.2'
                }}>
                  Jupiter
                </span>
              </button>

              {/* Solflare Wallet */}
              <button
                onClick={() => handleConnect('solflare')}
                disabled={connecting}
                className="transition-all duration-300 ease-out hover:scale-[1.05] active:scale-[0.95]"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '16px 12px',
                  borderRadius: '12px',
                  border: `1px solid ${theme.colors.primary}15`,
                  background: `${theme.colors.surface}60`,
                  cursor: connecting ? 'not-allowed' : 'pointer',
                  backdropFilter: 'blur(12px) saturate(1.5)',
                  transition: 'all 0.3s ease',
                  minWidth: '0'
                }}
                onMouseEnter={(e) => {
                  if (!connecting) {
                    e.currentTarget.style.background = `${theme.colors.primary}15`
                    e.currentTarget.style.borderColor = `${theme.colors.primary}25`
                    e.currentTarget.style.transform = 'scale(1.05)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!connecting) {
                    e.currentTarget.style.background = `${theme.colors.surface}60`
                    e.currentTarget.style.borderColor = `${theme.colors.primary}15`
                    e.currentTarget.style.transform = 'scale(1)'
                  }
                }}
              >
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'rgba(251, 191, 36, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <img
                    src="/assets/Solflare/SolflareYellow.svg"
                    alt="Solflare"
                    style={{ width: '20px', height: '20px', objectFit: 'contain' }}
                  />
                </div>
                <span style={{
                  fontSize: '11px',
                  color: theme.colors.textPrimary,
                  fontFamily: 'var(--font-helvetica)',
                  fontWeight: 500,
                  textAlign: 'center',
                  lineHeight: '1.2'
                }}>
                  Solflare
                </span>
              </button>

              {/* WalletConnect */}
              <button
                onClick={() => handleConnect('walletconnect')}
                disabled={connecting}
                className="transition-all duration-300 ease-out hover:scale-[1.05] active:scale-[0.95]"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '16px 12px',
                  borderRadius: '12px',
                  border: `1px solid ${theme.colors.primary}15`,
                  background: `${theme.colors.surface}60`,
                  cursor: connecting ? 'not-allowed' : 'pointer',
                  backdropFilter: 'blur(12px) saturate(1.5)',
                  transition: 'all 0.3s ease',
                  minWidth: '0'
                }}
                onMouseEnter={(e) => {
                  if (!connecting) {
                    e.currentTarget.style.background = `${theme.colors.primary}15`
                    e.currentTarget.style.borderColor = `${theme.colors.primary}25`
                    e.currentTarget.style.transform = 'scale(1.05)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!connecting) {
                    e.currentTarget.style.background = `${theme.colors.surface}60`
                    e.currentTarget.style.borderColor = `${theme.colors.primary}15`
                    e.currentTarget.style.transform = 'scale(1)'
                  }
                }}
              >
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'rgba(16, 185, 129, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <img
                    src="/assets/walletconnect.svg"
                    alt="WalletConnect"
                    style={{ width: '20px', height: '20px', objectFit: 'contain' }}
                  />
                </div>
                <span style={{
                  fontSize: '11px',
                  color: theme.colors.textPrimary,
                  fontFamily: 'var(--font-helvetica)',
                  fontWeight: 500,
                  textAlign: 'center',
                  lineHeight: '1.2'
                }}>
                  WalletConnect
                </span>
              </button>

              
              {/* Second Row - Additional wallet */}
              {/* Ledger Wallet */}
              <button
                onClick={() => handleConnect('ledger')}
                disabled={connecting}
                className="transition-all duration-300 ease-out hover:scale-[1.05] active:scale-[0.95]"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '16px 12px',
                  borderRadius: '12px',
                  border: `1px solid ${theme.colors.primary}15`,
                  background: `${theme.colors.surface}60`,
                  cursor: connecting ? 'not-allowed' : 'pointer',
                  backdropFilter: 'blur(12px) saturate(1.5)',
                  transition: 'all 0.3s ease',
                  minWidth: '0'
                }}
                onMouseEnter={(e) => {
                  if (!connecting) {
                    e.currentTarget.style.background = `${theme.colors.primary}15`
                    e.currentTarget.style.borderColor = `${theme.colors.primary}25`
                    e.currentTarget.style.transform = 'scale(1.05)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!connecting) {
                    e.currentTarget.style.background = `${theme.colors.surface}60`
                    e.currentTarget.style.borderColor = `${theme.colors.primary}15`
                    e.currentTarget.style.transform = 'scale(1)'
                  }
                }}
              >
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'rgba(99, 102, 241, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <img
                    src="/assets/ledger.jpg"
                    alt="Ledger"
                    style={{ width: '20px', height: '20px', objectFit: 'contain' }}
                  />
                </div>
                <span style={{
                  fontSize: '11px',
                  color: theme.colors.textPrimary,
                  fontFamily: 'var(--font-helvetica)',
                  fontWeight: 500,
                  textAlign: 'center',
                  lineHeight: '1.2'
                }}>
                  Ledger
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: '20px', textAlign: 'center' }} className="relative z-10">
          <p
            style={{
              fontSize: '12px',
              color: theme.colors.textMuted,
              margin: 0,
              fontFamily: 'var(--font-helvetica)',
              lineHeight: 1.4,
              fontWeight: 400
            }}
          >
            By connecting, you agree to our Terms of Service<br/>
            and Privacy Policy
          </p>
        </div>
      </div>
    </div>
  )
}

export default GlobalWalletModal