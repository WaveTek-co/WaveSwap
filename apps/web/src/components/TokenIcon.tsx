'use client'

import { useState } from 'react'
import { useThemeConfig } from '@/lib/theme'

interface TokenIconProps {
  symbol: string
  mint: string
  logoURI?: string
  size?: number
  className?: string
}

/**
 * Token icon with fallback loading strategy
 * 1. Try provided logoURI (from Jupiter API)
 * 2. Try Solana token-list CDN
 * 3. Try Trust Wallet assets
 * 4. Show first letter
 */
export function TokenIcon({ symbol, mint, logoURI, size = 40, className = '' }: TokenIconProps) {
  const [currentSource, setCurrentSource] = useState(0)
  const [showFallback, setShowFallback] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const theme = useThemeConfig()

  // Special handling for SOL (wrapped SOL) - ensure it has a proper icon
  const isSOL = mint === 'So11111111111111111111111111111111111111112'

  // Create sources array in order of preference
  // Prioritize Jupiter API icons (IPFS) first, then fallback to reliable sources
  const sources: string[] = [
    logoURI, // Provided logoURI from Jupiter API (IPFS URLs) - primary source
    `https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${mint}/logo.png`, // Solana official token-list
    `https://cdn.jsdelivr.net/gh/solana-labs/token-list@main/assets/mainnet/${mint}/logo.png`, // JSDelivr mirror
    `https://img-cdn.jup.ag/tokens/${mint}.svg`, // Jupiter CDN - backup
    // Add local SOL icon as last resort for SOL
    isSOL ? '/icons/sol-circular.svg' : undefined
  ].filter((source): source is string => Boolean(source))

  const handleError = () => {
    setImageError(true)
    if (currentSource < sources.length - 1) {
      setCurrentSource(currentSource + 1)
    } else {
      setShowFallback(true)
      setIsLoading(false)
    }
  }

  const handleLoad = () => {
    setImageError(false)
    setIsLoading(false)
  }

  // Fallback display
  if (showFallback || !sources[0] || imageError) {
    // Special SOL fallback with purple gradient
    if (isSOL) {
      return (
        <div
          className={`rounded-full flex items-center justify-center ${className}`}
          style={{
            width: size,
            height: size,
            background: theme.name === 'light'
              ? 'linear-gradient(135deg, #9945ff, #7752fe)'
              : 'linear-gradient(135deg, #a855f7, #8b5cf6)',
            border: theme.name === 'light'
              ? '2px solid rgba(153, 69, 255, 0.3)'
              : '2px solid rgba(168, 85, 247, 0.4)',
            backdropFilter: 'blur(12px) saturate(1.8)',
            WebkitBackdropFilter: 'blur(12px) saturate(1.8)',
            boxShadow: theme.name === 'light'
              ? '0 4px 12px rgba(153, 69, 255, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)'
              : '0 4px 12px rgba(168, 85, 247, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
          }}
        >
          <span
            className="font-bold"
            style={{
              color: 'white',
              fontFamily: 'var(--font-helvetica)',
              fontSize: `${size * 0.5}px`,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)'
            }}
          >
            SOL
          </span>
        </div>
      )
    }

    // Default fallback for other tokens
    return (
      <div
        className={`rounded-full flex items-center justify-center ${className}`}
        style={{
          width: size,
          height: size,
          background: theme.name === 'light'
            ? 'linear-gradient(135deg, rgba(33, 188, 255, 0.08), rgba(74, 74, 255, 0.05))'
            : 'linear-gradient(135deg, rgba(33, 188, 255, 0.15), rgba(74, 74, 255, 0.1))',
          border: theme.name === 'light'
            ? '2px solid rgba(33, 188, 255, 0.3)'
            : '2px solid rgba(33, 188, 255, 0.4)',
          backdropFilter: 'blur(12px) saturate(1.8)',
          WebkitBackdropFilter: 'blur(12px) saturate(1.8)',
          boxShadow: theme.name === 'light'
            ? '0 4px 12px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.3)'
            : '0 4px 12px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
        }}
      >
        <span
          className="font-bold"
          style={{
            color: theme.colors.textSecondary,
            fontFamily: 'var(--font-helvetica)',
            fontSize: `${size * 0.4}px`,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
          }}
        >
          {symbol.slice(0, 2)}
        </span>
      </div>
    )
  }

  // Main icon display
  return (
    <div
      className={`rounded-full flex items-center justify-center overflow-hidden ${className}`}
      style={{
        width: size,
        height: size,
        background: theme.name === 'light'
          ? theme.colors.background
          : theme.colors.surface,
        border: theme.name === 'light'
          ? `2px solid ${theme.colors.borderLight}`
          : `2px solid ${theme.colors.borderLight}`,
        backdropFilter: 'blur(12px) saturate(1.8)',
        WebkitBackdropFilter: 'blur(12px) saturate(1.8)',
        boxShadow: theme.name === 'light'
          ? '0 4px 12px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.5)'
          : '0 4px 12px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
      }}
    >
      <img
        src={sources[currentSource]}
        alt={symbol}
        className="w-full h-full object-cover"
        style={{
          filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))'
        }}
        crossOrigin="anonymous"
        onError={handleError}
        onLoad={handleLoad}
      />
    </div>
  )
}

