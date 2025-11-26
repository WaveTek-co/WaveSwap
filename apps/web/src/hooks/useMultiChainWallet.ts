'use client'

import { useState, useCallback, useEffect } from 'react'

export interface WalletInfo {
  id: string
  name: string
  chain: 'solana' | 'near' | 'zcash' | 'starknet'
  icon?: string
  installed?: boolean
}

export interface ConnectedWallet {
  id: string
  name: string
  chain: 'solana' | 'near' | 'zcash' | 'starknet'
  address?: string
  balance?: string
}

export function useMultiChainWallet() {
  const [connectedWallets, setConnectedWallets] = useState<ConnectedWallet[]>([])
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)

  // Solana connection
  const connectSolana = useCallback(async (walletInfo: WalletInfo): Promise<ConnectedWallet | null> => {
    try {
      const { solana } = window as any

      if (!solana) {
        throw new Error('Solana wallet not installed')
      }

      // Request connection
      const response = await solana.connect()
      const publicKey = response.publicKey?.toString()

      if (!publicKey) {
        throw new Error('Failed to get wallet public key')
      }

      // Get balance
      const balance = await solana.getBalance()

      return {
        id: walletInfo.id,
        name: walletInfo.name,
        chain: 'solana',
        address: publicKey,
        balance: balance ? balance.toString() : '0'
      }
    } catch (error) {
      console.error('Solana connection error:', error)
      throw error
    }
  }, [])

  // NEAR connection
  const connectNear = useCallback(async (walletInfo: WalletInfo): Promise<ConnectedWallet | null> => {
    try {
      const { near } = window as any

      if (!near) {
        throw new Error('NEAR wallet not installed')
      }

      // For NEAR, we'd typically use near-wallet-selector or similar
      // This is a simplified implementation
      const wallet = await near.requestSignIn({
        contractId: 'your-contract.near', // Replace with actual contract
        methodNames: ['transfer', 'get_balance'], // Methods you want to call
      })

      const accountId = wallet.getAccountId()

      return {
        id: walletInfo.id,
        name: walletInfo.name,
        chain: 'near',
        address: accountId
      }
    } catch (error) {
      console.error('NEAR connection error:', error)
      throw error
    }
  }, [])

  // Zcash connection
  const connectZcash = useCallback(async (walletInfo: WalletInfo): Promise<ConnectedWallet | null> => {
    try {
      const { zecwallet } = window as any

      if (!zecwallet) {
        throw new Error('Zcash wallet not installed')
      }

      // Zcash connection would go here
      // This is a placeholder implementation
      const address = await zecwallet.getAddresses()

      return {
        id: walletInfo.id,
        name: walletInfo.name,
        chain: 'zcash',
        address: address[0] // Use first address
      }
    } catch (error) {
      console.error('Zcash connection error:', error)
      throw error
    }
  }, [])

  // Starknet connection
  const connectStarknet = useCallback(async (walletInfo: WalletInfo): Promise<ConnectedWallet | null> => {
    try {
      const { starknet } = window as any

      if (!starknet) {
        throw new Error('Starknet wallet not installed')
      }

      // Request connection
      await starknet.enable()

      const account = starknet.account
      const address = account.address

      return {
        id: walletInfo.id,
        name: walletInfo.name,
        chain: 'starknet',
        address: address
      }
    } catch (error) {
      console.error('Starknet connection error:', error)
      throw error
    }
  }, [])

  // Main connect function
  const connectWallet = useCallback(async (walletInfo: WalletInfo): Promise<void> => {
    setIsConnecting(true)
    setConnectionError(null)

    try {
      let connectedWallet: ConnectedWallet | null = null

      switch (walletInfo.chain) {
        case 'solana':
          connectedWallet = await connectSolana(walletInfo)
          break
        case 'near':
          connectedWallet = await connectNear(walletInfo)
          break
        case 'zcash':
          connectedWallet = await connectZcash(walletInfo)
          break
        case 'starknet':
          connectedWallet = await connectStarknet(walletInfo)
          break
        default:
          throw new Error('Unsupported blockchain')
      }

      if (connectedWallet) {
        setConnectedWallets(prev => [...prev, connectedWallet!])
      }
    } catch (error) {
      console.error('Wallet connection error:', error)
      setConnectionError(error instanceof Error ? error.message : 'Failed to connect wallet')
      throw error
    } finally {
      setIsConnecting(false)
    }
  }, [connectSolana, connectNear, connectZcash, connectStarknet])

  // Disconnect wallet
  const disconnectWallet = useCallback(async (walletInfo: WalletInfo): Promise<void> => {
    try {
      setConnectedWallets(prev => prev.filter(w => w.id !== walletInfo.id))

      // Additional cleanup based on chain
      switch (walletInfo.chain) {
        case 'solana':
          const { solana } = window as any
          if (solana?.disconnect) {
            await solana.disconnect()
          }
          break
        case 'near':
          const { near } = window as any
          if (near?.signOut) {
            await near.signOut()
          }
          break
        // Add other chain disconnect logic as needed
      }
    } catch (error) {
      console.error('Wallet disconnection error:', error)
      setConnectionError(error instanceof Error ? error.message : 'Failed to disconnect wallet')
      throw error
    }
  }, [])

  // Get wallet balance
  const getWalletBalance = useCallback(async (walletId: string): Promise<string | null> => {
    try {
      const wallet = connectedWallets.find(w => w.id === walletId)
      if (!wallet) return null

      switch (wallet.chain) {
        case 'solana':
          const { solana } = window as any
          if (solana?.getBalance) {
            const balance = await solana.getBalance()
            return balance.toString()
          }
          break
        // Add other chain balance logic
      }

      return null
    } catch (error) {
      console.error('Error getting wallet balance:', error)
      return null
    }
  }, [connectedWallets])

  // Check if wallet is connected
  const isWalletConnected = useCallback((walletId: string): boolean => {
    return connectedWallets.some(w => w.id === walletId)
  }, [connectedWallets])

  // Get connected wallet by chain
  const getConnectedWalletByChain = useCallback((chain: string): ConnectedWallet | undefined => {
    return connectedWallets.find(w => w.chain === chain)
  }, [connectedWallets])

  // Auto-check existing connections on mount
  useEffect(() => {
    const checkExistingConnections = async () => {
      try {
        // Check Solana - fixed to check for different wallet types
        const { solana, phantom } = window as any

        // Check for existing connections safely
        try {
          // Try phantom first - check if it's connected
          if (phantom && typeof phantom.isConnected === 'boolean' && phantom.isConnected) {
            const publicKey = phantom.publicKey?.toString()
            if (publicKey) {
              setConnectedWallets(prev => [...prev, {
                id: 'phantom',
                name: 'Phantom',
                chain: 'solana',
                address: publicKey,
                balance: '0'
              }])
            }
          }
          // Then try generic solana - check if it's connected
          else if (solana && typeof solana.isConnected === 'boolean' && solana.isConnected) {
            const publicKey = solana.publicKey?.toString()
            if (publicKey) {
              setConnectedWallets(prev => [...prev, {
                id: 'phantom', // Default to phantom for now
                name: 'Phantom',
                chain: 'solana',
                address: publicKey,
                balance: '0'
              }])
            }
          }
        } catch (connectionError) {
          console.log('Failed to check wallet connection status')
        }
      } catch (error) {
        console.error('Error checking existing connections:', error)
      }
    }

    checkExistingConnections()
  }, [])

  return {
    connectedWallets,
    isConnecting,
    connectionError,
    connectWallet,
    disconnectWallet,
    getWalletBalance,
    isWalletConnected,
    getConnectedWalletByChain,
    clearError: () => setConnectionError(null)
  }
}

export default useMultiChainWallet