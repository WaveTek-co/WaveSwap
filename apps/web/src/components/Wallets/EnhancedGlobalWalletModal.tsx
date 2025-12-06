'use client'

import { SolanaWalletModal } from './SolanaWalletModal'
import { EnhancedWalletModal } from './EnhancedWalletModal'
import { useWalletModal } from '@/contexts/WalletModalContext'
import { useSolanaWallet } from '@/hooks/useSolanaWallet'
import { useWallet } from '@/hooks/useWalletAdapter'

export function EnhancedGlobalWalletModal() {
  const { isModalOpen, closeModal } = useWalletModal()
  const { publicKey } = useSolanaWallet()
  const { connected } = useWallet()

  // Use the enhanced modal for now, we can switch between them based on user preference
  return (
    <EnhancedWalletModal
      isOpen={isModalOpen}
      onClose={closeModal}
    />
  )
}

export default EnhancedGlobalWalletModal