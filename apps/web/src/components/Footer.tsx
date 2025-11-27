'use client'

import { MessageCircle, Twitter, ExternalLink, Sparkles, Zap } from 'lucide-react'
import { useThemeConfig, createGlassStyles } from '@/lib/theme'

export function Footer() {
  const theme = useThemeConfig()

  const footerLinks = [
    {
      name: 'WaveSwap',
      url: 'https://securethebag.fun/',
      icon: ExternalLink,
      description: 'Main Platform'
    },
    {
      name: 'Docs',
      url: 'https://docs.wavetek.io/',
      icon: ExternalLink,
      description: 'Documentation'
    },
    {
      name: 'Telegram',
      url: 'https://t.me/securethebagfun',
      icon: MessageCircle,
      description: 'Community'
    },
    {
      name: 'X (Twitter)',
      url: 'https://x.com/securethebagfun',
      icon: Twitter,
      description: 'Updates'
    }
  ]

  return (
    <footer className="relative mt-auto">
      {/* Glass background */}
      <div
        className="relative overflow-hidden"
        style={{
          background: `
            linear-gradient(135deg,
              ${theme.colors.surface}ee 0%,
              ${theme.colors.surfaceHover}cc 50%,
              ${theme.colors.surface}ee 100%
            ),
            radial-gradient(circle at 25% 25%,
              ${theme.colors.primary}05 0%,
              transparent 50%
            )
          `,
          borderTop: `1px solid ${theme.colors.border}20`,
          backdropFilter: 'blur(20px) saturate(1.8)',
          minHeight: '80px'
        }}
      >
        {/* Animated subtle background pattern */}
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(45deg, ${theme.colors.primary}10 25%, transparent 25%),
              linear-gradient(-45deg, ${theme.colors.primary}10 25%, transparent 25%),
              linear-gradient(45deg, transparent 75%, ${theme.colors.primary}10 75%),
              linear-gradient(-45deg, transparent 75%, ${theme.colors.primary}10 75%)
            `,
            backgroundSize: '20px 20px',
            backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
            animation: 'slidePattern 20s linear infinite'
          }}
        />

        <div className="relative z-10 px-6 py-6">
          <div className="max-w-7xl mx-auto">
            {/* Main content */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-6">

              {/* Left side - Brand info */}
              <div className="flex flex-col items-center sm:items-start gap-2 text-center sm:text-left">
                <div className="flex items-center gap-2">
                  <Sparkles
                    className="w-4 h-4"
                    style={{
                      color: theme.colors.primary,
                      filter: `drop-shadow(0 0 6px ${theme.colors.primary}40)`
                    }}
                  />
                  <span
                    className="text-xs font-medium tracking-wider uppercase"
                    style={{
                      color: theme.colors.textMuted,
                      fontFamily: 'var(--font-jetbrains), monospace',
                      letterSpacing: '0.1em'
                    }}
                  >
                    BUILT WITH NOAHAI
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Zap
                    className="w-3 h-3"
                    style={{
                      color: theme.colors.success,
                      filter: `drop-shadow(0 0 4px ${theme.colors.success}30)`
                    }}
                  />
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

                <div className="flex items-center gap-2">
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
              <div className="flex items-center gap-4">
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
                        className="p-2 rounded-lg transition-all duration-300 hover:scale-110 relative overflow-hidden"
                        style={{
                          background: `${theme.colors.surface}40`,
                          border: `1px solid ${theme.colors.border}30`,
                          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = theme.colors.primary + '20'
                          e.currentTarget.style.borderColor = theme.colors.primary + '40'
                          e.currentTarget.style.transform = 'scale(1.05) translateY(-1px)'
                          e.currentTarget.style.boxShadow = `0 4px 12px ${theme.colors.primary}25`
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = `${theme.colors.surface}40`
                          e.currentTarget.style.borderColor = `${theme.colors.border}30`
                          e.currentTarget.style.transform = 'scale(1) translateY(0)'
                          e.currentTarget.style.boxShadow = 'none'
                        }}
                      >
                        <IconComponent
                          className="w-4 h-4 transition-colors duration-300"
                          style={{
                            color: theme.colors.textMuted,
                            strokeWidth: 2
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = theme.colors.primary
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = theme.colors.textMuted
                          }}
                        />
                      </div>

                      {/* Tooltip */}
                      <div
                        className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-20"
                        style={{
                          background: theme.colors.surface,
                          border: `1px solid ${theme.colors.border}`,
                          color: theme.colors.textPrimary,
                          fontFamily: 'var(--font-helvetica)',
                          boxShadow: `0 4px 12px ${theme.colors.shadow}40`
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
              className="mt-6 pt-4 border-t opacity-30"
              style={{ borderColor: theme.colors.border }}
            >
              <div className="flex items-center justify-center">
                <span
                  className="text-xs opacity-60"
                  style={{
                    color: theme.colors.textMuted,
                    fontFamily: 'var(--font-jetbrains), monospace'
                  }}
                >
                  © 2024 WaveSwap. All rights reserved.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Animated pattern keyframes */}
      <style jsx>{`
        @keyframes slidePattern {
          0% {
            background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
          }
          100% {
            background-position: 20px 20px, 20px 30px, 30px 10px, 10px 20px;
          }
        }
      `}</style>
    </footer>
  )
}

export default Footer