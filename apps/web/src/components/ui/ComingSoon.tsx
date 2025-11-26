'use client'

import { useThemeConfig, createGlassStyles } from '@/lib/theme'

interface ComingSoonProps {
  message?: string
  description?: string
  icon?: React.ReactNode
  compact?: boolean
}

export function ComingSoon({
  message = 'Coming Soon',
  description = 'We\'re working hard to bring this feature to you. Stay tuned!',
  icon,
  compact = false
}: ComingSoonProps) {
  const theme = useThemeConfig()

  if (compact) {
    return (
      <div
        className="relative p-8 rounded-2xl overflow-hidden"
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
              ${theme.colors.primary}03 0%,
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

        <div className="relative z-10 text-center">
          <div className="flex justify-center mb-4">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{
                background: `
                  linear-gradient(135deg,
                    ${theme.colors.primary}20 0%,
                    ${theme.colors.primary}10 50%,
                    ${theme.colors.primary}20 100%
                  )
                `,
                border: `1px solid ${theme.colors.primary}30`,
                boxShadow: `0 8px 24px ${theme.colors.primary}20, inset 0 1px 0 rgba(255, 255, 255, 0.1)`
              }}
            >
              {icon || (
                <svg
                  className="w-8 h-8"
                  style={{ color: theme.colors.primary }}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              )}
            </div>
          </div>

          <h2
            className="text-2xl font-bold mb-2"
            style={{ color: theme.colors.textPrimary }}
          >
            {message}
          </h2>

          <p
            className="text-sm opacity-80 max-w-md"
            style={{ color: theme.colors.textSecondary }}
          >
            {description}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative z-10">
      {/* Floating Coming Soon Badge */}
      <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 z-20">
        <div
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full backdrop-blur-sm"
          style={{
            background: `linear-gradient(135deg, ${theme.colors.primary}15 0%, ${theme.colors.primary}08 100%)`,
            border: `1px solid ${theme.colors.primary}25`,
            boxShadow: `0 4px 16px ${theme.colors.primary}20, 0 0 20px ${theme.colors.primary}10`,
            animation: 'float 3s ease-in-out infinite'
          }}
        >
          <div
            className="w-2 h-2 rounded-full"
            style={{
              backgroundColor: theme.colors.primary,
              animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
            }}
          />
          <span
            className="text-xs font-bold"
            style={{ color: theme.colors.primary }}
          >
            {message}
          </span>
        </div>
      </div>

      {/* Overlay Content */}
      <div
        className="p-8 rounded-2xl text-center"
        style={{
          background: `
            linear-gradient(135deg,
              ${theme.colors.surface}80 0%,
              ${theme.colors.surfaceHover}60 50%,
              ${theme.colors.surface}80 100%
            )
          `,
          border: `1px solid ${theme.colors.primary}20`,
          backdropFilter: 'blur(16px) saturate(1.5)',
          boxShadow: `
            inset 0 1px 0 rgba(255, 255, 255, 0.1),
            0 4px 12px ${theme.colors.shadow}
          `
        }}
      >
        <div className="flex justify-center mb-6">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center"
            style={{
              background: `
                linear-gradient(135deg,
                  ${theme.colors.primary}20 0%,
                  ${theme.colors.primary}10 50%,
                  ${theme.colors.primary}20 100%
                )
              `,
              border: `1px solid ${theme.colors.primary}30`,
              boxShadow: `0 12px 32px ${theme.colors.primary}25, inset 0 1px 0 rgba(255, 255, 255, 0.1)`
            }}
          >
            {icon || (
              <svg
                className="w-10 h-10"
                style={{ color: theme.colors.primary }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            )}
          </div>
        </div>

        <h2
          className="text-3xl font-bold mb-3"
          style={{ color: theme.colors.textPrimary }}
        >
          {message}
        </h2>

        <p
          className="text-base opacity-80 mb-6 max-w-md"
          style={{ color: theme.colors.textSecondary }}
        >
          {description}
        </p>

        {/* Feature Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
          {[
            {
              icon: '🔒',
              text: 'Bank-Level Security',
              description: 'Multi-signature protection'
            },
            {
              icon: '⚡',
              text: 'Lightning Fast',
              description: 'Sub-second transactions'
            },
            {
              icon: '🎯',
              text: 'Best Rates',
              description: 'Optimized yields & fees'
            }
          ].map((feature, index) => (
            <div
              key={index}
              className="p-4 rounded-xl text-center transform transition-all duration-300 hover:scale-[1.05]"
              style={{
                background: `
                  linear-gradient(135deg,
                    ${theme.colors.primary}08 0%,
                    ${theme.colors.primary}04 50%,
                    ${theme.colors.primary}08 100%
                  )
                `,
                border: `1px solid ${theme.colors.primary}15`,
                backdropFilter: 'blur(8px) saturate(1.2)'
              }}
            >
              <div className="text-2xl mb-2">{feature.icon}</div>
              <div
                className="text-xs font-bold mb-1"
                style={{ color: theme.colors.primary }}
              >
                {feature.text}
              </div>
              <div
                className="text-xs opacity-70"
                style={{ color: theme.colors.textMuted }}
              >
                {feature.description}
              </div>
            </div>
          ))}
        </div>

        {/* Exciting Stats */}
        <div className="mt-8 grid grid-cols-2 gap-4 max-w-md mx-auto">
          <div
            className="p-3 rounded-lg text-center"
            style={{
              background: `${theme.colors.success}05`,
              border: `1px solid ${theme.colors.success}10`
            }}
          >
            <div
              className="text-lg font-bold"
              style={{ color: theme.colors.success }}
            >
              0%
            </div>
            <div className="text-xs" style={{ color: theme.colors.textMuted }}>
              Platform Fees
            </div>
          </div>
          <div
            className="p-3 rounded-lg text-center"
            style={{
              background: `${theme.colors.primary}05`,
              border: `1px solid ${theme.colors.primary}10`
            }}
          >
            <div
              className="text-lg font-bold"
              style={{ color: theme.colors.primary }}
            >
              24/7
            </div>
            <div className="text-xs" style={{ color: theme.colors.textMuted }}>
              Support
            </div>
          </div>
        </div>

        </div>
    </div>
  )
}