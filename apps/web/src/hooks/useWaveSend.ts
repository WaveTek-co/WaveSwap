'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { useWallet, useConnection } from './useWalletAdapter'
import {
  WaveStealthClient,
  StealthKeyPair,
  WaveSendParams,
  SendResult,
  NATIVE_SOL_MINT,
} from '@waveswap/sdk'

// Storage key for stealth keys (only public keys stored, privkeys in memory)
const STEALTH_KEYS_STORAGE_KEY = 'waveswap_stealth_keys'

export interface UseWaveSendReturn {
  // State
  isInitialized: boolean
  isRegistered: boolean
  isLoading: boolean
  isSending: boolean
  error: string | null

  // Actions
  initializeKeys: () => Promise<boolean>
  register: () => Promise<boolean>
  send: (params: {
    recipientAddress: string
    amount: string
    tokenMint?: string
  }) => Promise<SendResult>
  checkRecipientRegistered: (address: string) => Promise<boolean>

  // Utilities
  clearError: () => void
}

export function useWaveSend(): UseWaveSendReturn {
  const { publicKey, signMessage, signTransaction, connected } = useWallet()
  const { connection } = useConnection()

  const [isInitialized, setIsInitialized] = useState(false)
  const [isRegistered, setIsRegistered] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stealthKeys, setStealthKeys] = useState<StealthKeyPair | null>(null)

  // Initialize the stealth client
  const client = useMemo(() => {
    return new WaveStealthClient({
      connection,
      network: 'devnet',
    })
  }, [connection])

  // Create wallet adapter object for SDK
  const walletAdapter = useMemo(() => {
    if (!publicKey || !signTransaction || !signMessage) return null
    return {
      publicKey,
      signTransaction,
      signAllTransactions: async (txs: any[]) => {
        // Sign each transaction individually
        const signed = []
        for (const tx of txs) {
          signed.push(await signTransaction(tx))
        }
        return signed
      },
      signMessage,
    }
  }, [publicKey, signTransaction, signMessage])

  // Check registration status when wallet connects
  useEffect(() => {
    const checkRegistration = async () => {
      if (!connected || !publicKey) {
        setIsRegistered(false)
        return
      }

      try {
        const registry = await client.getRegistry(publicKey)
        setIsRegistered(registry !== null && registry.isFinalized)
      } catch (err) {
        console.error('Error checking registration:', err)
        setIsRegistered(false)
      }
    }

    checkRegistration()
  }, [connected, publicKey, client])

  // Initialize stealth keys from wallet signature
  const initializeKeys = useCallback(async (): Promise<boolean> => {
    if (!signMessage) {
      setError('Wallet does not support message signing')
      return false
    }

    setIsLoading(true)
    setError(null)

    try {
      const keys = await client.initializeKeys(signMessage)
      setStealthKeys(keys)
      setIsInitialized(true)

      // Store public keys in localStorage (private keys stay in memory only)
      localStorage.setItem(
        STEALTH_KEYS_STORAGE_KEY,
        JSON.stringify({
          spendPubkey: Array.from(keys.spendPubkey),
          viewPubkey: Array.from(keys.viewPubkey),
        })
      )

      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initialize keys'
      setError(message)
      return false
    } finally {
      setIsLoading(false)
    }
  }, [signMessage, client])

  // Register for stealth payments
  const register = useCallback(async (): Promise<boolean> => {
    if (!walletAdapter) {
      setError('Wallet not connected')
      return false
    }

    if (!stealthKeys) {
      setError('Stealth keys not initialized. Please initialize first.')
      return false
    }

    setIsLoading(true)
    setError(null)

    try {
      const result = await client.register(walletAdapter, stealthKeys)

      if (result.success) {
        setIsRegistered(true)
        return true
      } else {
        setError(result.error || 'Registration failed')
        return false
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed'
      setError(message)
      return false
    } finally {
      setIsLoading(false)
    }
  }, [walletAdapter, stealthKeys, client])

  // Check if recipient is registered
  const checkRecipientRegistered = useCallback(
    async (address: string): Promise<boolean> => {
      try {
        const recipientPubkey = new PublicKey(address)
        return await client.isRecipientRegistered(recipientPubkey)
      } catch {
        return false
      }
    },
    [client]
  )

  // Send tokens via stealth address
  const send = useCallback(
    async (params: {
      recipientAddress: string
      amount: string
      tokenMint?: string
    }): Promise<SendResult> => {
      if (!walletAdapter) {
        return { success: false, error: 'Wallet not connected' }
      }

      setIsSending(true)
      setError(null)

      try {
        // Validate recipient address
        let recipientWallet: PublicKey
        try {
          recipientWallet = new PublicKey(params.recipientAddress)
        } catch {
          setError('Invalid recipient address')
          return { success: false, error: 'Invalid recipient address' }
        }

        // Parse amount based on token decimals
        const amountFloat = parseFloat(params.amount)
        if (isNaN(amountFloat) || amountFloat <= 0) {
          setError('Invalid amount')
          return { success: false, error: 'Invalid amount' }
        }

        // Convert to lamports/smallest unit
        // For SOL: multiply by LAMPORTS_PER_SOL (10^9)
        // For SPL tokens: would need to fetch decimals from mint
        const isSol = !params.tokenMint || params.tokenMint === NATIVE_SOL_MINT.toBase58()
        const amount = isSol
          ? BigInt(Math.floor(amountFloat * LAMPORTS_PER_SOL))
          : BigInt(Math.floor(amountFloat * 1e6)) // Assume 6 decimals for SPL tokens

        const sendParams: WaveSendParams = {
          recipientWallet,
          amount,
          mint: params.tokenMint && !isSol ? new PublicKey(params.tokenMint) : undefined,
        }

        const result = await client.waveSend(walletAdapter, sendParams)

        if (!result.success) {
          setError(result.error || 'Send failed')
        }

        return result
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Send failed'
        setError(message)
        return { success: false, error: message }
      } finally {
        setIsSending(false)
      }
    },
    [walletAdapter, client]
  )

  // Clear error
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    isInitialized,
    isRegistered,
    isLoading,
    isSending,
    error,
    initializeKeys,
    register,
    send,
    checkRecipientRegistered,
    clearError,
  }
}

export default useWaveSend
