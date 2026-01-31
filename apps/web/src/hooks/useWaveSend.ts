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
  RegistrationProgress,
  RegistrationStep,
} from '@/lib/stealth'

// Storage key for stealth keys (only public keys stored, privkeys in memory)
const STEALTH_KEYS_STORAGE_KEY = 'waveswap_stealth_keys'

export interface UseWaveSendReturn {
  // State
  isInitialized: boolean
  isRegistered: boolean
  isLoading: boolean
  isSending: boolean
  error: string | null
  registrationProgress: RegistrationProgress | null

  // Actions
  initializeKeys: () => Promise<boolean>
  register: () => Promise<boolean>
  send: (params: {
    recipientAddress: string
    amount: string
    tokenMint?: string
  }) => Promise<SendResult>
  checkRecipientRegistered: (address: string) => Promise<boolean>
  claimByVault: (vaultAddress: string) => Promise<{ success: boolean; signature?: string; error?: string }>

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
  const [registrationProgress, setRegistrationProgress] = useState<RegistrationProgress | null>(null)

  // Initialize the stealth client with DEVNET connection
  // Note: We create our own devnet connection because the app's connection might be mainnet
  const devnetConnection = useMemo(() => {
    return new Connection('https://api.devnet.solana.com', 'confirmed')
  }, [])

  const client = useMemo(() => {
    return new WaveStealthClient({
      connection: devnetConnection,
      network: 'devnet',
    })
  }, [devnetConnection])

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
    console.log('[WaveSend] initializeKeys called')

    if (!signMessage) {
      console.error('[WaveSend] signMessage not available')
      setError('Wallet does not support message signing')
      return false
    }

    setIsLoading(true)
    setError(null)

    try {
      console.log('[WaveSend] Calling client.initializeKeys...')
      const keys = await client.initializeKeys(signMessage)
      console.log('[WaveSend] Keys generated successfully:', {
        spendPubkey: Buffer.from(keys.spendPubkey).toString('hex').slice(0, 16) + '...',
        viewPubkey: Buffer.from(keys.viewPubkey).toString('hex').slice(0, 16) + '...',
      })

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

      console.log('[WaveSend] Keys initialized and stored')
      return true
    } catch (err) {
      console.error('[WaveSend] initializeKeys error:', err)
      const message = err instanceof Error ? err.message : 'Failed to initialize keys'
      setError(message)
      return false
    } finally {
      setIsLoading(false)
    }
  }, [signMessage, client])

  // Register for stealth payments (multi-transaction flow)
  const register = useCallback(async (): Promise<boolean> => {
    console.log('[WaveSend] register called (multi-tx)')

    if (!walletAdapter) {
      console.error('[WaveSend] walletAdapter not available')
      setError('Wallet not connected')
      return false
    }

    if (!stealthKeys) {
      console.error('[WaveSend] stealthKeys not available')
      setError('Stealth keys not initialized. Please initialize first.')
      return false
    }

    console.log('[WaveSend] Starting registration with keys:', {
      spendPubkey: Buffer.from(stealthKeys.spendPubkey).toString('hex').slice(0, 16) + '...',
      viewPubkey: Buffer.from(stealthKeys.viewPubkey).toString('hex').slice(0, 16) + '...',
    })

    setIsLoading(true)
    setError(null)
    setRegistrationProgress(null)

    try {
      console.log('[WaveSend] Calling client.register with progress callback...')
      const result = await client.register(
        walletAdapter,
        stealthKeys,
        undefined,
        (progress) => {
          console.log('[WaveSend] Registration progress:', progress)
          setRegistrationProgress(progress)
        }
      )
      console.log('[WaveSend] register result:', result)

      if (result.success) {
        console.log('[WaveSend] Registration successful, tx:', result.signature)
        setIsRegistered(true)
        setRegistrationProgress(null)
        return true
      } else {
        console.error('[WaveSend] Registration failed:', result.error)
        setError(result.error || 'Registration failed')
        setRegistrationProgress(null)
        return false
      }
    } catch (err) {
      console.error('[WaveSend] register error:', err)
      const message = err instanceof Error ? err.message : 'Registration failed'
      setError(message)
      setRegistrationProgress(null)
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
      console.log('[WaveSend] send called with params:', params)

      if (!walletAdapter) {
        console.error('[WaveSend] walletAdapter not available')
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

        console.log('[WaveSend] Sending stealth transfer:', {
          recipient: recipientWallet.toBase58(),
          amount: amount.toString(),
          isSol,
        })

        const sendParams: WaveSendParams = {
          recipientWallet,
          amount,
          mint: params.tokenMint && !isSol ? new PublicKey(params.tokenMint) : undefined,
        }

        const result = await client.waveSend(walletAdapter, sendParams)
        console.log('[WaveSend] waveSend result:', result)

        if (!result.success) {
          setError(result.error || 'Send failed')
        }

        return result
      } catch (err) {
        console.error('[WaveSend] send error:', err)
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

  // Claim by vault address (manual claim)
  const claimByVault = useCallback(
    async (vaultAddress: string): Promise<{ success: boolean; signature?: string; error?: string }> => {
      if (!walletAdapter) {
        return { success: false, error: 'Wallet not connected' }
      }

      setIsLoading(true)
      setError(null)

      try {
        const result = await client.claimByVaultAddress(walletAdapter, vaultAddress)
        console.log('[WaveSend] claim result:', result)

        if (!result.success) {
          setError(result.error || 'Claim failed')
        }

        return {
          success: result.success,
          signature: result.signature,
          error: result.error,
        }
      } catch (err) {
        console.error('[WaveSend] claim error:', err)
        const message = err instanceof Error ? err.message : 'Claim failed'
        setError(message)
        return { success: false, error: message }
      } finally {
        setIsLoading(false)
      }
    },
    [walletAdapter, client]
  )

  return {
    isInitialized,
    isRegistered,
    isLoading,
    isSending,
    error,
    registrationProgress,
    initializeKeys,
    register,
    send,
    checkRecipientRegistered,
    claimByVault,
    clearError,
  }
}

export default useWaveSend
