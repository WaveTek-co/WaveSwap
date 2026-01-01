'use client'

import React from 'react'
import { useThemeConfig } from '@/lib/theme'

interface ThemeWaveLogoProps {
  size?: number | string
  className?: string
  alt?: string
  style?: React.CSSProperties
  onClick?: () => void
}

export function ThemeWaveLogo({
  size = 24,
  className = '',
  alt = 'WaveSwap Logo',
  style = {},
  onClick
}: ThemeWaveLogoProps) {
  const theme = useThemeConfig()

  // Get appropriate Wave logo based on theme
  const getWaveLogo = () => {
    switch (theme.name) {
      case 'ghost':
        return '/wave-ghost.jpg'
      case 'stealth':
        return '/wave-stealth.png'
      case 'light':
      case 'dark':
      default:
        return '/wave0.png'
    }
  }

  const logoStyle: React.CSSProperties = {
    width: size,
    height: size,
    objectFit: 'contain',
    ...style
  }

  return (
    <img
      src={getWaveLogo()}
      alt={alt}
      className={className}
      style={logoStyle}
      onClick={onClick}
    />
  )
}

// Hook to get the current theme's Wave logo URL
export function useThemeWaveLogo() {
  const theme = useThemeConfig()

  const getWaveLogo = () => {
    switch (theme.name) {
      case 'ghost':
        return '/wave-ghost.jpg'
      case 'stealth':
        return '/wave-stealth.png'
      case 'light':
      case 'dark':
      default:
        return '/wave0.png'
    }
  }

  return getWaveLogo()
}

export default ThemeWaveLogo