'use client'

import { useTheme } from '@/contexts/ThemeContext'

export interface ThemeColors {
  // Background colors
  background: string
  surface: string
  surfaceHover: string
  glass: string
  glassBorder: string

  // Text colors
  textPrimary: string
  textSecondary: string
  textMuted: string
  textInverse: string

  // Brand colors
  primary: string
  primaryHover: string
  secondary: string
  accent: string

  // Status colors
  success: string
  warning: string
  error: string
  info: string

  // Border and outline
  border: string
  borderLight: string
  outline: string
  outlineFocus: string

  // Shadow colors
  shadow: string
  shadowLight: string
  shadowHeavy: string

  // Special colors
  gradientStart: string
  gradientEnd: string
  overlay: string
}

export interface ThemeConfig {
  name: string
  colors: ThemeColors
  glassStyles: {
    backdrop: string
    blur: string
    border: string
    background: string
  }
  animations: {
    duration: string
    easing: string
  }
}

const lightTheme: ThemeConfig = {
  name: 'light',
  colors: {
    // Background colors
    background: '#ffffff',
    surface: '#f8fafc',
    surfaceHover: '#f1f5f9',
    glass: 'rgba(255, 255, 255, 0.85)',
    glassBorder: 'rgba(33, 188, 255, 0.2)',

    // Text colors
    textPrimary: '#1e293b',
    textSecondary: '#475569',
    textMuted: '#64748b',
    textInverse: '#ffffff',

    // Brand colors - WaveSwap Azul Theme
    primary: '#21bcff', // WaveSwap azul
    primaryHover: '#1999d4', // Azul dark
    secondary: '#10b981',
    accent: '#4a4aff', // Deep blue light

    // Status colors
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#06b6d4',

    // Border and outline
    border: '#e2e8f0',
    borderLight: '#f1f5f9',
    outline: '#3b82f6',
    outlineFocus: '#2563eb',

    // Shadow colors
    shadow: 'rgba(0, 0, 0, 0.1)',
    shadowLight: 'rgba(0, 0, 0, 0.05)',
    shadowHeavy: 'rgba(0, 0, 0, 0.25)',

    // Special colors - WaveSwap Azul Theme
    gradientStart: '#21bcff', // WaveSwap azul
    gradientEnd: '#4a4aff', // Deep blue light
    overlay: 'rgba(0, 0, 0, 0.3)'
  },
  glassStyles: {
    backdrop: 'blur(20px) saturate(1.8)',
    blur: '20px',
    border: '1px solid rgba(33, 188, 255, 0.2)',
    background: 'rgba(255, 255, 255, 0.85)'
  },
  animations: {
    duration: '0.2s',
    easing: 'ease-out'
  }
}

const darkTheme: ThemeConfig = {
  name: 'dark',
  colors: {
    // Background colors
    background: '#0f172a',
    surface: '#1e293b',
    surfaceHover: '#334155',
    glass: 'rgba(30, 41, 59, 0.8)',
    glassBorder: 'rgba(255, 255, 255, 0.1)',

    // Text colors
    textPrimary: '#f8fafc',
    textSecondary: '#cbd5e1',
    textMuted: '#94a3b8',
    textInverse: '#1e293b',

    // Brand colors
    primary: '#3b82f6',
    primaryHover: '#60a5fa',
    secondary: '#10b981',
    accent: '#a855f7',

    // Status colors
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#06b6d4',

    // Border and outline
    border: '#334155',
    borderLight: '#475569',
    outline: '#3b82f6',
    outlineFocus: '#60a5fa',

    // Shadow colors
    shadow: 'rgba(0, 0, 0, 0.5)',
    shadowLight: 'rgba(0, 0, 0, 0.25)',
    shadowHeavy: 'rgba(0, 0, 0, 0.75)',

    // Special colors
    gradientStart: '#3b82f6',
    gradientEnd: '#a855f7',
    overlay: 'rgba(0, 0, 0, 0.8)'
  },
  glassStyles: {
    backdrop: 'blur(24px) saturate(1.8)',
    blur: '24px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    background: 'rgba(30, 41, 59, 0.8)'
  },
  animations: {
    duration: '0.2s',
    easing: 'ease-out'
  }
}

const orcaTheme: ThemeConfig = {
  name: 'orca',
  colors: {
    // Background colors
    background: '#0a0e1a',
    surface: '#1a1f2e',
    surfaceHover: '#262d3d',
    glass: 'rgba(26, 31, 46, 0.9)',
    glassBorder: 'rgba(74, 222, 128, 0.2)',

    // Text colors
    textPrimary: '#ecfdf5',
    textSecondary: '#d1fae5',
    textMuted: '#a7f3d0',
    textInverse: '#0a0e1a',

    // Brand colors
    primary: '#4ade80',
    primaryHover: '#22c55e',
    secondary: '#10b981',
    accent: '#14b8a6',

    // Status colors
    success: '#4ade80',
    warning: '#fbbf24',
    error: '#f87171',
    info: '#22d3ee',

    // Border and outline
    border: '#262d3d',
    borderLight: '#334155',
    outline: '#4ade80',
    outlineFocus: '#22c55e',

    // Shadow colors
    shadow: 'rgba(0, 0, 0, 0.6)',
    shadowLight: 'rgba(0, 0, 0, 0.3)',
    shadowHeavy: 'rgba(0, 0, 0, 0.8)',

    // Special colors
    gradientStart: '#4ade80',
    gradientEnd: '#14b8a6',
    overlay: 'rgba(10, 14, 26, 0.9)'
  },
  glassStyles: {
    backdrop: 'blur(24px) saturate(1.6)',
    blur: '24px',
    border: '1px solid rgba(74, 222, 128, 0.2)',
    background: 'rgba(26, 31, 46, 0.9)'
  },
  animations: {
    duration: '0.2s',
    easing: 'ease-out'
  }
}

export const themes: Record<string, ThemeConfig> = {
  light: lightTheme,
  dark: darkTheme,
  orca: orcaTheme
}

export function useThemeConfig() {
  const { theme } = useTheme()
  return themes[theme] || darkTheme
}

// Utility functions for common theme patterns
export function createGlassStyles(theme: ThemeConfig, additionalStyles: React.CSSProperties = {}) {
  return {
    background: theme.glassStyles.background,
    border: theme.glassStyles.border,
    backdropFilter: theme.glassStyles.backdrop,
    ...additionalStyles
  }
}

export function createButtonStyles(
  theme: ThemeConfig,
  variant: 'primary' | 'secondary' | 'ghost' = 'primary',
  size: 'sm' | 'md' | 'lg' = 'md'
) {
  const baseStyles: React.CSSProperties = {
    transition: `all ${theme.animations.duration} ${theme.animations.easing}`,
    fontWeight: 500,
    borderRadius: '0.75rem',
    cursor: 'pointer',
    outline: 'none',
    border: '1px solid transparent',
  }

  const sizeStyles = {
    sm: { padding: '0.5rem 1rem', fontSize: '0.875rem' },
    md: { padding: '0.75rem 1.5rem', fontSize: '1rem' },
    lg: { padding: '1rem 2rem', fontSize: '1.125rem' }
  }

  const variantStyles = {
    primary: {
      backgroundColor: theme.colors.primary,
      color: theme.colors.textInverse,
      '&:hover': {
        backgroundColor: theme.colors.primaryHover,
        transform: 'scale(1.05)'
      }
    },
    secondary: {
      backgroundColor: theme.colors.surface,
      color: theme.colors.textPrimary,
      borderColor: theme.colors.border,
      '&:hover': {
        backgroundColor: theme.colors.surfaceHover,
        transform: 'scale(1.05)'
      }
    },
    ghost: {
      backgroundColor: 'transparent',
      color: theme.colors.textSecondary,
      '&:hover': {
        backgroundColor: theme.colors.surfaceHover,
        color: theme.colors.textPrimary
      }
    }
  }

  return {
    ...baseStyles,
    ...sizeStyles[size],
    ...variantStyles[variant]
  }
}

export function createModalStyles(theme: ThemeConfig) {
  return {
    overlay: {
      position: 'fixed' as const,
      inset: 0,
      backgroundColor: theme.colors.overlay,
      backdropFilter: 'blur(8px)',
      zIndex: 9998
    },
    modal: {
      position: 'fixed' as const,
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      backgroundColor: theme.colors.surface,
      border: `1px solid ${theme.colors.border}`,
      borderRadius: '1rem',
      boxShadow: `0 25px 70px ${theme.colors.shadowHeavy}, 0 12px 32px ${theme.colors.primary}20`,
      backdropFilter: theme.glassStyles.backdrop,
      zIndex: 9999,
      maxHeight: '90vh',
      overflow: 'auto'
    }
  }
}

export function createInputStyles(theme: ThemeConfig) {
  return {
    backgroundColor: theme.colors.glass,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: '0.75rem',
    padding: '0.75rem 1rem',
    color: theme.colors.textPrimary,
    fontSize: '0.875rem',
    transition: `all ${theme.animations.duration} ${theme.animations.easing}`,
    outline: 'none',
    '&:focus': {
      borderColor: theme.colors.outline,
      boxShadow: `0 0 0 3px ${theme.colors.outline}20`
    },
    '&::placeholder': {
      color: theme.colors.textMuted
    }
  }
}