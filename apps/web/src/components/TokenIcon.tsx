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
 * Token icon loaded directly from Jupiter API
 * Uses only Jupiter API icon URLs - no hardcoded fallbacks
 */
export function TokenIcon({ symbol, mint, logoURI, size = 40, className = '' }: TokenIconProps) {
  const [currentSource, setCurrentSource] = useState(0)
  const [showFallback, setShowFallback] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const theme = useThemeConfig()

  // Special handling for SOL (wrapped SOL) - ensure it has a proper icon
  const isSOL = mint === 'So11111111111111111111111111111111111111112'

  // Enhanced IPFS URL handling with multiple gateways
  const getReliableSources = (url: string): string[] => {
    const sources: string[] = []

    if (!url) return sources

    // Check for IPFS URLs first (highest priority for working gateways)
    if (url.includes('ipfs/')) {
      const ipfsHash = url.match(/ipfs\/([a-zA-Z0-9]+)/)?.[1]
      if (ipfsHash) {
        // Prioritize working gateways - Pinata confirmed working for WAVE token
        sources.push(
          `https://gateway.pinata.cloud/ipfs/${ipfsHash}`, // Working - confirmed
          `https://cloudflare-ipfs.com/ipfs/${ipfsHash}`, // Usually reliable
          `https://ipfs.eternum.io/ipfs/${ipfsHash}`, // Backup option
          `https://ipfs.fleek.co/ipfs/${ipfsHash}`, // Another backup
          `https://ipfs.io/ipfs/${ipfsHash}` // Sometimes returns 403, try last
        )
        return sources // Return early for IPFS URLs
      }
    }

    // If it's nftstorage.link, add reliable gateway alternatives instead of the original
    if (url.includes('ipfs.nftstorage.link/')) {
      const ipfsHash = url.match(/([a-zA-Z0-9]+)\.ipfs\.nftstorage\.link/)?.[1]
      if (ipfsHash) {
        // Use same working gateway priority as other IPFS URLs
        sources.push(
          `https://gateway.pinata.cloud/ipfs/${ipfsHash}`, // Working - confirmed
          `https://cloudflare-ipfs.com/ipfs/${ipfsHash}`, // Usually reliable
          `https://ipfs.eternum.io/ipfs/${ipfsHash}`, // Backup option
          `https://ipfs.fleek.co/ipfs/${ipfsHash}`, // Another backup
          `https://ipfs.io/ipfs/${ipfsHash}` // Sometimes returns 403, try last
        )
        return sources // Return early for nftstorage URLs
      }
    }

    // If it's Jupiter CDN, add mirror alternatives
    if (url.includes('img-cdn.jup.ag')) {
      const tokenName = url.match(/\/tokens\/(.+)\.svg/)?.[1]
      if (tokenName) {
        // Add alternative Jupiter CDN endpoints first (more reliable)
        sources.push(
          `https://raw.jup.ag/tokens/${tokenName}.svg`,
          `https://cdn.jsdelivr.net/gh/jup-ag/token-icons@main/tokens/${tokenName}.svg`
        )
        sources.push(url) // Add original as last resort
      }
    } else {
      // For other non-IPFS URLs, add the original
      sources.push(url)
    }

    // Remove trailing slashes and duplicates
    return sources.map(s => s.replace(/\/$/, '')).filter((s, i, arr) => arr.indexOf(s) === i)
  }

  const sources = getReliableSources(logoURI || '')

  
  const handleError = () => {
    // Try next source if available
    if (currentSource < sources.length - 1) {
      setCurrentSource(currentSource + 1)
    } else {
      // No more sources to try, show fallback
      setShowFallback(true)
      setIsLoading(false)
    }
  }

  const handleLoad = () => {
    setImageError(false)
    setIsLoading(false)
  }

  // Local fallback icons from /icons/fallback/token/
  const getTokenLocalFallback = (tokenSymbol: string, tokenAddress: string): string | null => {
    const tokenIcons: { [key: string]: string | null } = {
      // Popular tokens with local fallback icons
      'WAVE': '/icons/fallback/token/wave.png',
      'SOL': '/icons/fallback/token/sol.png',
      'USDC': '/icons/fallback/token/usdc.png',
      'USDT': '/icons/fallback/token/usdt.png',
      'ZEC': '/icons/fallback/token/zec.png',
      'PUMP': '/icons/fallback/token/pump.png',
      // Other tokens with local fallback icons
      'WEALTH': '/icons/fallback/token/wealth.png',
      'FTP': '/icons/fallback/token/ftp.jpg',
      'AURA': '/icons/fallback/token/aura.png',
      'MEW': '/icons/fallback/token/mew.png',
      'STORE': '/icons/fallback/token/store.png',
      // Additional tokens from fallback icons
      'XBTC': '/icons/fallback/token/xbtc.png',
      'GOLD': '/icons/fallback/token/gold.png'
    }

    return tokenIcons[tokenSymbol.toUpperCase()] || tokenIcons[tokenAddress] || null
  }

  // Original token URLs for fallback when all sources fail (backup for tokens without local fallback)
  const getTokenOriginalURL = (tokenSymbol: string, tokenAddress: string): string | null => {
    const tokenURLs: { [key: string]: string | null } = {
      // All tokens now have local fallback icons, so this is mostly unused
      // Keeping as emergency backup for specific tokens if needed
      'MEW': 'https://ipfs.io/ipfs/bafkreidlwyr565dxtao2ipsze6bmzpszqzybz7sqi2zaet5fs7k53henju',
      'STORE': null // Let Jupiter API handle it
    }

    return tokenURLs[tokenSymbol.toUpperCase()] || tokenURLs[tokenAddress] || null
  }

  // Fallback display - show if no Jupiter API icon or if all sources fail
  if (showFallback || !logoURI || sources.length === 0) {
    // Check for local fallback icon first
    const localFallback = getTokenLocalFallback(symbol, mint)

    if (localFallback) {
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
            src={localFallback}
            alt={symbol}
            className="w-full h-full object-cover"
            style={{
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))'
            }}
            onError={() => {
              // If local fallback fails, try original URL
              const originalURL = getTokenOriginalURL(symbol, mint)
              if (originalURL) {
                setShowFallback(false) // Reset to try original URL
                setCurrentSource(sources.length) // Force to original URL path
              } else {
                setShowFallback(true) // Show text fallback
              }
            }}
          />
        </div>
      )
    }

    // Check for original token URL fallback second
    const originalURL = getTokenOriginalURL(symbol, mint)

    if (originalURL) {
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
            src={originalURL}
            alt={symbol}
            className="w-full h-full object-cover"
            style={{
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))'
            }}
            crossOrigin="anonymous"
            onError={() => {
              // If original URL fails, show text fallback
              setShowFallback(true)
            }}
          />
        </div>
      )
    }

    // Special SOL fallback with purple gradient (original for SOL)
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
        key={currentSource} // Force re-render when source changes
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

