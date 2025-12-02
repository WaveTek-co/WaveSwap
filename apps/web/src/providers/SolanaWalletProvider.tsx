'use client'

import React, { useMemo } from 'react'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter
} from '@solana/wallet-adapter-wallets'

// Commented out BackpackWalletAdapter due to import issues
// import { BackpackWalletAdapter } from '@solana/wallet-adapter-backpack'
import { config } from '@/lib/config'

// Removed default wallet adapter styles since we use custom UI

interface SolanaWalletProviderProps {
  children: React.ReactNode
}

export function SolanaWalletProvider({ children }: SolanaWalletProviderProps) {
  // Use the configured RPC endpoint from config (Helius with fallback to public)
  const endpoint = useMemo(() => config.rpc.url, [])

  // @solana/wallet-adapter-wallets includes all wallet adapters
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      // BackpackWalletAdapter temporarily disabled due to import issues
    ],
    []
  )

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}

export default SolanaWalletProvider