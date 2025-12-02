'use client'

import React from 'react'
import { WalletProvider } from '@/providers/PhantomWalletProvider'

export function PhantomSDKWrapper({ children }: { children: React.ReactNode }) {
  // Simplified wrapper that just provides the basic wallet context
  // This prevents the useWallet hook from throwing errors
  return (
    <WalletProvider>
      {children}
    </WalletProvider>
  )
}