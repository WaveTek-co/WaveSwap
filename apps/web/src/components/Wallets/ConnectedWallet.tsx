'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Check, Copy, LogOut, Settings } from 'lucide-react'
import { useThemeConfig, createButtonStyles, createGlassStyles } from '@/lib/theme'

interface ConnectedWalletProps {
  publicKey: any
  walletName: string
  onDisconnect: () => void
  onCopyAddress: () => void
}

export function ConnectedWallet({ publicKey, walletName, onDisconnect, onCopyAddress }: ConnectedWalletProps) {
  const theme = useThemeConfig()
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const getTruncatedAddress = () => {
    if (!publicKey) return ''
    const address = publicKey.toString()
    return `${address.slice(0, 4)}...${address.slice(-4)}`
  }

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showDropdown])

  const containerStyles = {
    padding: '1rem',
    borderRadius: '0.75rem',
    position: 'relative' as const,
    ...createGlassStyles(theme),
    background: `
      linear-gradient(135deg,
        ${theme.colors.success}08 0%,
        ${theme.colors.success}04 50%,
        ${theme.colors.success}08 100%
      ),
      radial-gradient(circle at 50% 50%,
        ${theme.colors.success}03 0%,
        transparent 50%
      )
    `,
    boxShadow: `
      0 12px 40px ${theme.colors.shadow},
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      0 0 0 1px ${theme.colors.success}10
    `
  }

  const dropdownStyles = {
    position: 'absolute' as const,
    right: 0,
    top: '100%',
    marginTop: '0.5rem',
    width: '12rem',
    borderRadius: '0.75rem',
    overflow: 'hidden',
    ...createGlassStyles(theme),
    boxShadow: `
      0 20px 40px ${theme.colors.shadowHeavy},
      0 8px 24px ${theme.colors.primary}10,
      inset 0 1px 0 rgba(255, 255, 255, 0.1)
    `,
    zIndex: 1000
  }

  const dropdownButtonStyles = {
    ...createButtonStyles(theme, 'ghost', 'sm'),
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.75rem 1rem',
    textAlign: 'left' as const,
    borderRadius: 0,
    border: 'none',
    borderBottom: `1px solid ${theme.colors.border}`
  }

  return (
    <div style={containerStyles}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: '1.25rem',
              height: '1.25rem',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: `${theme.colors.success}20`,
              border: `1px solid ${theme.colors.success}30`
            }}
          >
            <Check size={16} style={{ color: theme.colors.success }} />
          </div>
          <div>
            <div
              style={{
                fontWeight: 600,
                fontSize: '0.875rem',
                letterSpacing: '0.025em',
                color: theme.colors.textPrimary
              }}
            >
              {getTruncatedAddress()}
            </div>
            <div
              style={{
                fontSize: '0.75rem',
                marginTop: '0.25rem',
                color: theme.colors.textMuted
              }}
            >
              {walletName} • Connected
            </div>
          </div>
        </div>

        <div ref={dropdownRef} style={{ position: 'relative' as const }}>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            style={{
              ...createButtonStyles(theme, 'ghost', 'sm'),
              width: '2rem',
              height: '2rem',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '0.5rem',
              background: 'rgba(255, 255, 255, 0.1)',
              border: `1px solid ${theme.colors.border}`
            }}
          >
            <Settings size={16} style={{ color: theme.colors.textSecondary }} />
          </button>

          {showDropdown && (
            <div style={dropdownStyles}>
              <button
                onClick={onCopyAddress}
                style={dropdownButtonStyles}
              >
                <Copy size={16} style={{ color: theme.colors.textSecondary }} />
                <span style={{ fontSize: '0.875rem', color: theme.colors.textPrimary }}>
                  Copy Address
                </span>
              </button>
              <button
                onClick={onDisconnect}
                style={{
                  ...dropdownButtonStyles,
                  borderBottom: 'none'
                }}
              >
                <LogOut size={16} style={{ color: theme.colors.error }} />
                <span style={{ fontSize: '0.875rem', color: theme.colors.error }}>
                  Disconnect
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}