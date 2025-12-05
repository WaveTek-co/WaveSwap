'use client'

import React, { useState, useEffect } from 'react'
import QRCode from 'qrcode'
import { useThemeConfig, createGlassStyles, createInputStyles } from '@/lib/theme'
import { CopyToClipboard } from '@/components/ui/CopyToClipboard'
import { zcashPoolService } from '@/lib/services/zcashPoolService'

interface ZcashDepositQRProps {
  depositAddress: string
  amount?: number
  memo?: string
  onDepositDetected?: (amount: number) => void
}

export function ZcashDepositQR({
  depositAddress,
  amount,
  memo,
  onDepositDetected
}: ZcashDepositQRProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('')
  const [isGenerating, setIsGenerating] = useState(true)
  const [showInstructions, setShowInstructions] = useState(true)
  const theme = useThemeConfig()

  useEffect(() => {
    generateQRCode()
  }, [depositAddress, amount, memo])

  useEffect(() => {
    // Simulate checking for deposits every 10 seconds
    const interval = setInterval(() => {
      checkForDeposits()
    }, 10000)

    return () => clearInterval(interval)
  }, [onDepositDetected])

  const generateQRCode = async () => {
    setIsGenerating(true)
    try {
      const qrData = zcashPoolService.generateQRCodeData(depositAddress, amount, memo)
      const url = await QRCode.toDataURL(qrData, {
        width: 256,
        margin: 2,
        color: {
          dark: theme.name === 'dark' ? '#FFFFFF' : '#000000',
          light: theme.name === 'dark' ? '#000000' : '#FFFFFF'
        }
      })
      setQrCodeUrl(url)
    } catch (error) {
      console.error('Failed to generate QR code:', error)
    } finally {
      setIsGenerating(false)
    }
  }

  const checkForDeposits = async () => {
    if (!onDepositDetected) return

    try {
      // Show coming soon message for deposit checking
      console.log('🚀 Zcash deposit monitoring coming soon!')
    } catch (error) {
      // Error handling would be implemented here
    }
  }

  const formatDisplayAddress = () => {
    if (depositAddress.startsWith('zcash_pool_')) {
      return `WaveSwap Pool: ${depositAddress.substring(12, 20)}...${depositAddress.slice(-8)}`
    }
    return depositAddress
  }

  return (
    <div className="flex flex-col items-center space-y-4 p-6">
      {/* QR Code */}
      <div className="relative">
        {isGenerating ? (
          <div
            className="w-64 h-64 flex items-center justify-center rounded-lg border-2 border-dashed"
            style={{
              ...createGlassStyles(theme),
              borderColor: theme.colors.border,
              background: theme.colors.surface + '40',
            }}
          >
            <div className="text-center">
              <div
                className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto mb-2"
                style={{ borderColor: theme.colors.primary }}
              ></div>
              <p className="text-sm" style={{ color: theme.colors.textSecondary, fontFamily: 'var(--font-inter)' }}>
                Generating QR Code...
              </p>
            </div>
          </div>
        ) : (
          <div className="relative group">
            <img
              src={qrCodeUrl}
              alt="Zcash Deposit QR Code"
              className="w-64 h-64 rounded-lg transition-all hover:scale-[1.02] group-hover:shadow-xl"
              style={{
                ...createGlassStyles(theme),
                border: `2px solid ${theme.colors.border}`,
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <div
                className="px-3 py-1 rounded text-xs font-medium"
                style={{
                  background: 'rgba(0, 0, 0, 0.75)',
                  color: '#FFFFFF',
                  fontFamily: 'var(--font-helvetica)',
                }}
              >
                Scan to Deposit
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Address Display */}
      <div className="text-center">
        <p className="text-sm font-medium mb-2" style={{ color: theme.colors.textSecondary, fontFamily: 'var(--font-helvetica)' }}>
          Deposit Address:
        </p>
        <div className="flex items-center justify-center space-x-2">
          <code
            className="px-3 py-1 rounded text-xs break-all max-w-xs transition-all hover:scale-[1.02]"
            style={{
              ...createGlassStyles(theme),
              background: theme.colors.surface + '60',
              border: `1px solid ${theme.colors.border}`,
              color: theme.colors.textPrimary,
              fontFamily: 'var(--font-jetbrains)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = theme.colors.primary
              e.currentTarget.style.boxShadow = `0 4px 12px ${theme.colors.primary}20`
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = theme.colors.border
              e.currentTarget.style.boxShadow = createGlassStyles(theme).boxShadow
            }}
          >
            {formatDisplayAddress()}
          </code>
          <CopyToClipboard
            text={depositAddress}
            className="transition-all hover:scale-110"
            style={{
              color: theme.colors.primary,
            }}
          />
        </div>
      </div>

      {/* Amount Display */}
      {amount && (
        <div className="text-center">
          <p className="text-sm font-medium mb-1" style={{ color: theme.colors.textSecondary, fontFamily: 'var(--font-helvetica)' }}>
            Amount:
          </p>
          <p className="text-lg font-bold" style={{ color: theme.colors.textPrimary, fontFamily: 'var(--font-helvetica)' }}>
            {amount} ZEC
          </p>
        </div>
      )}

      {/* Memo */}
      {memo && (
        <div className="text-center">
          <p className="text-sm font-medium mb-1" style={{ color: theme.colors.textSecondary, fontFamily: 'var(--font-helvetica)' }}>
            Memo:
          </p>
          <p className="text-xs italic" style={{ color: theme.colors.textMuted, fontFamily: 'var(--font-inter)' }}>
            {memo}
          </p>
        </div>
      )}

      {/* Instructions */}
      {showInstructions && (
        <div className="text-center">
          <button
            onClick={() => setShowInstructions(false)}
            className="text-xs mb-2 transition-colors hover:scale-105"
            style={{
              color: theme.colors.primary,
              fontFamily: 'var(--font-helvetica)',
            }}
          >
            Hide Instructions
          </button>
          <div
            className="rounded-lg p-4 max-w-md"
            style={{
              ...createGlassStyles(theme),
              background: `
                linear-gradient(135deg,
                  ${theme.colors.primary}10 0%,
                  ${theme.colors.primary}05 50%,
                  ${theme.colors.primary}10 100%
                ),
                radial-gradient(circle at 30% 30%,
                  ${theme.colors.primary}15 0%,
                  transparent 60%
                )
              `,
              border: `1px solid ${theme.colors.primary}30`,
            }}
          >
            <h4 className="font-semibold mb-2" style={{ color: theme.colors.primary, fontFamily: 'var(--font-helvetica)' }}>
              How to Deposit:
            </h4>
            <ol className="text-xs space-y-1 text-left" style={{ color: theme.colors.textSecondary, fontFamily: 'var(--font-inter)' }}>
              <li>1. Open your Zcash wallet</li>
              <li>2. Scan the QR code above</li>
              <li>3. Enter the amount you want to deposit</li>
              <li>4. Confirm and send the transaction</li>
              <li>5. Your deposit will appear in the pool automatically</li>
            </ol>
            <p className="text-xs mt-2" style={{ color: theme.colors.textMuted, fontFamily: 'var(--font-inter)' }}>
              ⚡ Deposits are usually confirmed within 1-2 minutes
            </p>
          </div>
        </div>
      )}

      {!showInstructions && (
        <button
          onClick={() => setShowInstructions(true)}
          className="text-xs transition-colors hover:scale-105"
          style={{
            color: theme.colors.primary,
            fontFamily: 'var(--font-helvetica)',
          }}
        >
          Show Instructions
        </button>
      )}

      {/* Network Info */}
      <div className="text-center">
        <p className="text-xs" style={{ color: theme.colors.textMuted, fontFamily: 'var(--font-inter)' }}>
          🏛️ Zcash Mainnet Network
        </p>
      </div>
    </div>
  )
}