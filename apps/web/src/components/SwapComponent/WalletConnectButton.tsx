'use client'

import { useState, useEffect } from 'react'
import { CleanWalletButton } from '@/components/Wallets/CleanWalletButton'

export function WalletConnectButton() {
  const [mounted, setMounted] = useState(false)

  // Debug wallet modal state
  console.log('Custom WalletConnectButton render - mounted:', mounted)

  // Better hydration handling
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="bg-gradient-to-r from-primary to-primary-hover text-primary-foreground font-medium py-3 px-6 rounded-xl shadow-lg transition-all duration-200 border-0 flex items-center justify-center min-w-[140px] h-[48px] opacity-80">
        <div className="animate-pulse bg-white/20 rounded h-4 w-16"></div>
      </div>
    )
  }

  // Use the custom CleanWalletButton for all states
  return (
    <div className="relative">
      <CleanWalletButton />
    </div>
  )
}

export default WalletConnectButton