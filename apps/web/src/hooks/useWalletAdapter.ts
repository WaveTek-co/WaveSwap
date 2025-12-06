'use client'

import { useMemo } from 'react'
import { useMultiWallet } from '@/contexts/MultiWalletContext'
import { Connection } from '@solana/web3.js'

/**
 * Adapter hook that provides the same interface as @solana/wallet-adapter-react's useWallet
 * but uses the new multi-wallet implementation under the hood
 */
export function useWallet() {
  const multiWallet = useMultiWallet()

  return useMemo(() => ({
    connected: multiWallet.connected,
    connecting: multiWallet.connecting,
    disconnecting: multiWallet.disconnecting,
    publicKey: multiWallet.publicKey,
    wallet: multiWallet.wallet,
    wallets: multiWallet.availableWallets.map(walletName => ({
      adapter: {
        name: walletName,
        readyState: walletName === 'phantom' ? 'Installed' as const : 'NotDetected' as const
      }
    })),
    select: (walletName: string) => {
      console.log(`Selecting wallet: ${walletName}`)
    },
    connect: async (walletName?: string) => {
      // ConnectButton handles connection, but we keep this for backward compatibility
      if (walletName) {
        try {
          return await multiWallet.connect(walletName)
        } catch (error) {
          console.log('ConnectButton should handle connection automatically')
        }
      } else {
        // Default to phantom for backward compatibility
        try {
          return await multiWallet.connect('phantom')
        } catch (error) {
          console.log('ConnectButton should handle connection automatically')
        }
      }
    },
    disconnect: async () => {
      try {
        return await multiWallet.disconnect()
      } catch (error) {
        console.log('ConnectButton should handle disconnection automatically')
      }
    },
    signTransaction: multiWallet.signTransaction,
    signAllTransactions: multiWallet.signAllTransactions,
    signMessage: multiWallet.signMessage,
  }), [
    multiWallet.connected,
    multiWallet.connecting,
    multiWallet.disconnecting,
    multiWallet.publicKey,
    multiWallet.wallet,
    multiWallet.availableWallets,
    multiWallet.connect,
    multiWallet.disconnect,
    multiWallet.signTransaction,
    multiWallet.signAllTransactions,
    multiWallet.signMessage,
  ])
}

/**
 * Adapter hook that provides the same interface as @solana/wallet-adapter-react's useConnection
 * but uses the new multi-wallet implementation under the hood
 */
export function useConnection(): { connection: Connection } {
  const multiWallet = useMultiWallet()

  return {
    connection: multiWallet.connection
  }
}

export default useWallet