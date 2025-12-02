'use client'

import React from 'react'
import { TelegramIcon, TwitterIcon, ExternalLinkIcon, DocumentTextIcon } from '@/components/icons'
import { useThemeConfig, createGlassStyles } from '@/lib/theme'

export function Footer() {
  const theme = useThemeConfig()

  const footerLinks = [
    {
      name: 'Secure The Bag',
      url: 'https://securethebag.fun/',
      icon: ExternalLinkIcon,
      description: 'Main Platform'
    },
    {
      name: 'Docs',
      url: 'https://docs.wavetek.io/',
      icon: DocumentTextIcon,
      description: 'Documentation'
    },
    {
      name: 'Telegram',
      url: 'https://t.me/securethebagfun',
      icon: TelegramIcon,
      description: 'Community'
    },
    {
      name: 'X',
      url: 'https://x.com/securethebagfun',
      icon: TwitterIcon,
      description: 'Updates'
    }
  ]

  return (
    <footer className="relative mt-auto">
      {/* Header-style glassmorphism footer */}
      <div
        className="relative overflow-hidden"
        style={{
          ...createGlassStyles(theme),
          backdropFilter: 'blur(20px) saturate(180%)',
          borderTop: `1px solid ${theme.name === 'ghost' ? theme.colors.primaryBorder : theme.colors.border}`,
          background: theme.name === 'ghost'
            ? 'linear-gradient(135deg, rgba(255, 253, 248, 0.95) 0%, rgba(226, 223, 254, 0.9) 25%, rgba(255, 253, 248, 0.92) 50%, rgba(171, 159, 242, 0.88) 75%, rgba(255, 253, 248, 0.95) 100%)'
            : createGlassStyles(theme).background,
          minHeight: '80px'
        }}
      >
        {/* Noise overlay - matching header style */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            opacity: theme.name === 'light' ? 0.02 : theme.name === 'ghost' ? 0.04 : 0.03,
            backgroundImage: theme.name === 'ghost'
              ? `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='1.5'/%3E%3CfeColorMatrix type='matrix' values='1 0 0 0 0.67 0 1 0 0 0.63 0 0 1 0 0.95 0 0 0 1 0'/%3E%3Cfilter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='0.15'/%3E%3C/svg%3E")`
              : `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3Cfilter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='0.1'/%3E%3C/svg%3E")`,
            mixBlendMode: theme.name === 'ghost' ? 'soft-light' : theme.name === 'light' ? 'soft-light' : 'overlay'
          }}
        />

        <div className="relative z-10 px-3 sm:px-4 md:px-6 py-4">
          <div className="max-w-7xl mx-auto">
            {/* Main content */}
            <div className="flex flex-col lg:flex-row items-center justify-between gap-4 lg:gap-6">
              {/* Brand badges */}
              <div className="flex flex-col items-center sm:items-start gap-1">
                <div className="flex items-center gap-1">
                  <div
                    className="w-3 h-3 rounded-full flex items-center justify-center"
                    style={{
                      background: `${theme.colors.primary}20`,
                      color: theme.colors.primary
                    }}
                  >
                    <svg className="w-2 h-2" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                    </svg>
                  </div>
                  <span
                    className="text-xs font-medium tracking-wider uppercase"
                    style={{
                      color: theme.colors.textMuted,
                      fontFamily: 'var(--font-jetbrains), monospace',
                      letterSpacing: '0.05em'
                    }}
                  >
                    BUILT WITH ENCIFER, NEAR INTENTS, AND STARKGATE
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <div
                    className="w-3 h-3 rounded-full flex items-center justify-center"
                    style={{
                      background: `${theme.colors.success}20`,
                      color: theme.colors.success
                    }}
                  >
                    <svg className="w-2 h-2" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" />
                    </svg>
                  </div>
                  <span
                    className="text-xs font-medium"
                    style={{
                      color: theme.colors.textSecondary,
                      fontFamily: 'var(--font-helvetica)'
                    }}
                  >
                    CREATED BY GLOW STUDIO
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <span
                    className="text-xs font-medium opacity-80"
                    style={{
                      color: theme.colors.textMuted,
                      fontFamily: 'var(--font-helvetica)'
                    }}
                  >
                    ⚡ POWERED BY SOLANA
                  </span>
                </div>
              </div>

              {/* Right side - Social links */}
              <div className="flex items-center gap-2 sm:gap-3">
                {footerLinks.map((link) => {
                  const IconComponent = link.icon
                  return (
                    <a
                      key={link.name}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative"
                      title={link.description}
                    >
                      <div
                        className="p-1.5 sm:p-2 rounded-lg transition-all duration-300 hover:scale-110 relative overflow-hidden"
                        style={{
                          ...createGlassStyles(theme),
                          border: `1px solid ${theme.name === 'ghost' ? `${theme.colors.primaryBorder}50` : `${theme.colors.primary}10`}`,
                          backdropFilter: 'blur(20px) saturate(1.8)',
                          boxShadow: theme.name === 'ghost'
                            ? `0 4px 12px ${theme.colors.purpleShadow || theme.colors.shadow}, inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 0 0 1px ${theme.colors.primaryBorder}20`
                            : `0 4px 12px ${theme.colors.shadow}, inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 0 0 1px ${theme.colors.primary}05`
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = `${theme.colors.primary}40`
                          e.currentTarget.style.transform = 'scale(1.05) translateY(-1px)'
                          e.currentTarget.style.boxShadow = `0 6px 16px ${theme.colors.primary}25`
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = theme.name === 'ghost' ? `${theme.colors.primaryBorder}50` : `${theme.colors.primary}10`
                          e.currentTarget.style.transform = 'scale(1) translateY(0)'
                          e.currentTarget.style.boxShadow = theme.name === 'ghost'
                            ? `0 4px 12px ${theme.colors.purpleShadow || theme.colors.shadow}, inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 0 0 1px ${theme.colors.primaryBorder}20`
                            : `0 4px 12px ${theme.colors.shadow}, inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 0 0 1px ${theme.colors.primary}05`
                        }}
                      >
                        {/* Noise grain overlay for icons */}
                        <div
                          className="absolute inset-0 pointer-events-none rounded-lg"
                          style={{
                            opacity: theme.name === 'light' ? 0.01 : 0.03,
                            backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3Cfilter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
                            filter: theme.name === 'light' ? 'contrast(1.1) brightness(1.05)' : 'contrast(1.3) brightness(1.1)'
                          }}
                        />

                        <div className="relative z-10 flex items-center justify-center">
                          <div
                            className="w-4 h-4 sm:w-4.5 sm:h-4.5 flex items-center justify-center transition-colors duration-300"
                            style={{
                              color: theme.colors.textMuted
                            }}
                            onMouseEnter={(e: any) => {
                              e.currentTarget.style.color = theme.colors.primary
                            }}
                            onMouseLeave={(e: any) => {
                              e.currentTarget.style.color = theme.colors.textMuted
                            }}
                          >
                            <IconComponent className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                          </div>
                        </div>
                      </div>

                      {/* Tooltip */}
                      <div
                        className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-20"
                        style={{
                          ...createGlassStyles(theme),
                          background: theme.colors.surface,
                          border: `1px solid ${theme.colors.border}`,
                          color: theme.colors.textPrimary,
                          fontFamily: 'var(--font-helvetica)',
                          boxShadow: `0 4px 12px ${theme.colors.shadow}40`,
                          backdropFilter: 'blur(8px) saturate(1.5)'
                        }}
                      >
                        {link.name}
                        <div
                          className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-px w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent"
                          style={{
                            borderTopColor: theme.colors.border
                          }}
                        />
                      </div>
                    </a>
                  )
                })}
              </div>
            </div>

            {/* Bottom separator */}
            <div
              className="mt-4 pt-3 border-t"
              style={{ borderColor: `${theme.colors.border}30` }}
            >
              <div className="flex items-center justify-center">
                <span
                  className="text-xs opacity-60"
                  style={{
                    color: theme.colors.textMuted,
                    fontFamily: 'var(--font-jetbrains), monospace'
                  }}
                >
                  © 2025 Wavetek. All rights reserved.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default Footer