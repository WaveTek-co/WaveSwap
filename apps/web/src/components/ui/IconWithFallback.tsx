'use client'

import Image, { ImageProps } from 'next/image'
import { useState } from 'react'

interface IconWithFallbackProps extends Omit<ImageProps, 'onError' | 'src'> {
  src: string
  fallback?: string
  size?: number
  className?: string
}

export function IconWithFallback({
  src,
  fallback = '/icons/default-token.svg',
  size = 24,
  className = '',
  alt,
  ...props
}: IconWithFallbackProps) {
  const [imgSrc, setImgSrc] = useState(src)
  const [hasError, setHasError] = useState(false)

  const handleError = () => {
    if (!hasError && imgSrc !== fallback) {
      setImgSrc(fallback)
      setHasError(true)
    }
  }

  return (
    <Image
      {...props}
      src={imgSrc}
      alt={alt || 'icon'}
      width={size}
      height={size}
      className={`${className} ${hasError ? 'opacity-60' : ''}`}
      onError={handleError}
      unoptimized={true}
      style={{
        objectFit: 'contain',
        ...props.style
      }}
    />
  )
}

interface ChainIconProps {
  chainId: string
  size?: number
  className?: string
}

export function ChainIcon({ chainId, size = 24, className = '' }: ChainIconProps) {
  const getChainIcon = (id: string) => {
    switch (id) {
      case 'solana':
        return '/static/icons/network/solana.svg'
      case 'near':
        return '/static/icons/network/near.svg'
      case 'zec':
        return '/static/icons/network/zcash.svg'
      case 'starknet':
        return '/static/icons/network/starknet.svg' // Starknet icon
      case 'eth':
      case 'ethereum':
        return '/static/icons/network/ethereum.svg'
      case 'polygon':
        return '/static/icons/network/polygon.svg'
      case 'bsc':
        return '/static/icons/network/bsc.svg'
      case 'arbitrum':
        return '/static/icons/network/arbitrum.svg'
      case 'optimism':
        return '/static/icons/network/optimism.svg'
      case 'avalanche':
        return '/static/icons/network/avalanche.svg'
      case 'base':
        return '/static/icons/network/base.svg'
      case 'aptos':
        return '/static/icons/network/aptos.svg'
      case 'sui':
        return '/static/icons/network/sui.svg'
      case 'intents':
        return '/static/icons/network/intents.svg'
      default:
        return '/static/icons/network/ethereum.svg'
    }
  }

  return (
    <IconWithFallback
      src={getChainIcon(chainId)}
      size={size}
      className={`${className} rounded-full`}
      alt={`${chainId} icon`}
      fallback="/static/icons/network/ethereum.svg"
    />
  )
}

interface TokenIconProps {
  token?: {
    symbol: string
    logoURI?: string
    chain?: string
  }
  size?: number
  className?: string
  symbol?: string
}

export function TokenIcon({ token, size = 24, className = '', symbol }: TokenIconProps) {
  const getTokenIcon = () => {
    if (token?.logoURI) {
      return token.logoURI
    }

    // Fallback to chain icon if token doesn't have logo
    if (token?.chain) {
      switch (token.chain) {
        case 'solana':
          return 'https://img-cdn.jup.ag/tokens/SOL.svg'
        case 'near':
          return 'https://near.org/wp-content/uploads/2021/03/near_icon.svg'
        case 'zec':
          return 'https://z.cash/wp-content/uploads/2021/03/zcash-logo-fullcolor-512x512.png'
        case 'starknet':
          return '/static/icons/network/starknet.svg'
      }
    }

    // Generate colored background for symbols without icons
    if (symbol || token?.symbol) {
      const tokenSymbol = symbol || token?.symbol
      const colors = [
        'from-primary to-primary-hover',
        'from-secondary to-primary',
        'from-accent to-secondary',
        'from-primary to-accent',
        'from-secondary to-accent',
        'from-accent to-primary'
      ]
      const colorIndex = (tokenSymbol?.charCodeAt(0) || 0) % colors.length

      // Generate gradient background dynamically
      return null // Will be handled by the component
    }

    return '/icons/default-token.svg'
  }

  const tokenSymbol = symbol || token?.symbol

  // If we don't have a logo URI, show a colored background with symbol
  if (!token?.logoURI && tokenSymbol) {
    const colors = [
      'from-primary to-primary-hover',
      'from-secondary to-primary',
      'from-accent to-secondary',
      'from-primary to-accent',
      'from-secondary to-accent',
      'from-accent to-primary'
    ]
    const colorIndex = tokenSymbol.charCodeAt(0) % colors.length

    return (
      <div
        className={`bg-gradient-to-r ${colors[colorIndex]} rounded-full flex items-center justify-center text-white font-semibold text-xs ${className}`}
        style={{
          width: size,
          height: size,
          fontSize: size * 0.4
        }}
      >
        {tokenSymbol.slice(0, 2).toUpperCase()}
      </div>
    )
  }

  const tokenIconSrc = getTokenIcon() || '/icons/default-token.svg'

  return (
    <IconWithFallback
      src={tokenIconSrc}
      size={size}
      className={`${className} rounded-full`}
      alt={`${tokenSymbol || 'token'} icon`}
      fallback="/icons/default-token.svg"
    />
  )
}