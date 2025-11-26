'use client'

import { useEffect, useRef } from 'react'
import type { WalletSelectorModal } from '@near-wallet-selector/modal-ui'
import { nearWalletService } from '../../lib/wallets/near'

interface NearWalletModalProps {
  modal: WalletSelectorModal | null
  onClose: () => void
  onWalletConnected?: (account: any) => void
}

export function NearWalletModal({ modal, onClose, onWalletConnected }: NearWalletModalProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!modal) return

    // Add NEAR modal styles to ensure proper display
    const style = document.createElement('style')
    style.textContent = `
      .near-wallet-selector-modal {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        height: 100% !important;
        z-index: 9999 !important;
        background: rgba(0, 0, 0, 0.5) !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-family: var(--font-helvetica) !important;
      }

      .near-wallet-selector-modal-content {
        background: white !important;
        border-radius: 16px !important;
        padding: 24px !important;
        max-width: 480px !important;
        width: 90% !important;
        max-height: 80vh !important;
        overflow-y: auto !important;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25) !important;
      }

      .near-wallet-selector-modal-header {
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        margin-bottom: 20px !important;
        padding-bottom: 16px !important;
        border-bottom: 1px solid #e5e7eb !important;
      }

      .near-wallet-selector-modal-title {
        font-size: 20px !important;
        font-weight: 600 !important;
        color: #111827 !important;
        margin: 0 !important;
      }

      .near-wallet-selector-modal-close {
        background: none !important;
        border: none !important;
        font-size: 24px !important;
        cursor: pointer !important;
        color: #6b7280 !important;
        padding: 4px !important;
      }

      .near-wallet-selector-modal-close:hover {
        color: #374151 !important;
      }

      .near-wallet-selector-wallet-list {
        display: flex !important;
        flex-direction: column !important;
        gap: 12px !important;
      }

      .near-wallet-selector-wallet-button {
        display: flex !important;
        align-items: center !important;
        gap: 16px !important;
        padding: 16px !important;
        border: 1px solid #e5e7eb !important;
        border-radius: 12px !important;
        background: white !important;
        cursor: pointer !important;
        transition: all 0.2s !important;
        font-size: 16px !important;
        color: #111827 !important;
        text-decoration: none !important;
      }

      .near-wallet-selector-wallet-button:hover {
        border-color: #6366f1 !important;
        background: #f9fafb !important;
        transform: translateY(-1px) !important;
      }

      .near-wallet-selector-wallet-icon {
        width: 48px !important;
        height: 48px !important;
        border-radius: 8px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        background: #f3f4f6 !important;
        font-weight: 600 !important;
        color: #374151 !important;
      }

      .near-wallet-selector-wallet-info {
        flex: 1 !important;
        text-align: left !important;
      }

      .near-wallet-selector-wallet-name {
        font-weight: 600 !important;
        margin-bottom: 4px !important;
      }

      .near-wallet-selector-wallet-description {
        font-size: 14px !important;
        color: #6b7280 !important;
      }
    `
    document.head.appendChild(style)

    // Show the modal when component mounts
    modal.show()

    // Handle hide events
    const handleHide = () => {
      // Check if wallet is connected after modal closes
      const account = nearWalletService.getAccount()
      if (account && onWalletConnected) {
        onWalletConnected(account)
      }
      onClose()
      // Cleanup styles
      if (document.head.contains(style)) {
        document.head.removeChild(style)
      }
    }

    modal.on('onHide', handleHide)

    // Cleanup
    return () => {
      modal.off('onHide', handleHide)
      if (document.head.contains(style)) {
        document.head.removeChild(style)
      }
    }
  }, [modal, onClose, onWalletConnected])

  // This component doesn't render anything - the modal is rendered by NEAR's own DOM manipulation
  return <div ref={containerRef} style={{ display: 'none' }} />
}