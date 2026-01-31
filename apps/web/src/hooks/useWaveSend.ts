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

// Storage key for stealth keys (cached per wallet address for seamless UX)
const STEALTH_KEYS_STORAGE_PREFIX = 'waveswap_stealth_keys_'

// Helper to get cached stealth keys from localStorage (includes X-Wing keys)
function getCachedStealthKeys(walletAddress: string): StealthKeyPair | null {
  try {
    const stored = localStorage.getItem(STEALTH_KEYS_STORAGE_PREFIX + walletAddress)
    if (!stored) return null
    const parsed = JSON.parse(stored)

    const keys: StealthKeyPair = {
      spendPrivkey: new Uint8Array(parsed.spendPrivkey),
      spendPubkey: new Uint8Array(parsed.spendPubkey),
      viewPrivkey: new Uint8Array(parsed.viewPrivkey),
      viewPubkey: new Uint8Array(parsed.viewPubkey),
    }

    // Restore X-Wing keys if present (post-quantum security)
    if (parsed.xwingKeys) {
      keys.xwingKeys = {
        publicKey: {
          mlkem: new Uint8Array(parsed.xwingKeys.publicKey.mlkem),
          x25519: new Uint8Array(parsed.xwingKeys.publicKey.x25519),
        },
        secretKey: {
          mlkem: new Uint8Array(parsed.xwingKeys.secretKey.mlkem),
          x25519: new Uint8Array(parsed.xwingKeys.secretKey.x25519),
        },
      }
    }

    return keys
  } catch {
    return null
  }
}

// Helper to cache stealth keys in localStorage (includes X-Wing keys)
function cacheStealthKeys(walletAddress: string, keys: StealthKeyPair): void {
  try {
    const cached: any = {
      spendPrivkey: Array.from(keys.spendPrivkey),
      spendPubkey: Array.from(keys.spendPubkey),
      viewPrivkey: Array.from(keys.viewPrivkey),
      viewPubkey: Array.from(keys.viewPubkey),
    }

    // Cache X-Wing keys if present (post-quantum security)
    if (keys.xwingKeys) {
      cached.xwingKeys = {
        publicKey: {
          mlkem: Array.from(keys.xwingKeys.publicKey.mlkem),
          x25519: Array.from(keys.xwingKeys.publicKey.x25519),
        },
        secretKey: {
          mlkem: Array.from(keys.xwingKeys.secretKey.mlkem),
          x25519: Array.from(keys.xwingKeys.secretKey.x25519),
        },
      }
    }

    localStorage.setItem(STEALTH_KEYS_STORAGE_PREFIX + walletAddress, JSON.stringify(cached))
  } catch (e) {
    console.warn('[WaveSend] Failed to cache stealth keys:', e)
  }
}

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
  // Uses Helius RPC if configured, falls back to public devnet
  const devnetConnection = useMemo(() => {
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com'
    return new Connection(rpcUrl, 'confirmed')
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

  // Auto-initialize from cache and check registration when wallet connects
  useEffect(() => {
    const initFromCache = async () => {
      if (!connected || !publicKey) {
        setIsRegistered(false)
        setIsInitialized(false)
        setStealthKeys(null)
        return
      }

      // Try to restore cached stealth keys (no signature required!)
      const walletAddress = publicKey.toBase58()
      const cachedKeys = getCachedStealthKeys(walletAddress)
      if (cachedKeys) {
        console.log('[WaveSend] Auto-initialized from cache for:', walletAddress.slice(0, 8))
        setStealthKeys(cachedKeys)
        client.setKeys(cachedKeys)
        setIsInitialized(true)
      }

      // Check registration status
      try {
        const registry = await client.getRegistry(publicKey)
        setIsRegistered(registry !== null && registry.isFinalized)
      } catch (err) {
        console.error('Error checking registration:', err)
        setIsRegistered(false)
      }
    }

    initFromCache()
  }, [connected, publicKey, client])

  // Initialize stealth keys - uses localStorage cache to avoid repeated wallet popups
  const initializeKeys = useCallback(async (): Promise<boolean> => {
    console.log('[WaveSend] initializeKeys called')

    // Check localStorage cache first (keyed by wallet address)
    if (publicKey) {
      const walletAddress = publicKey.toBase58()
      const cachedKeys = getCachedStealthKeys(walletAddress)
      if (cachedKeys) {
        console.log('[WaveSend] Using cached stealth keys for:', walletAddress.slice(0, 8))
        setStealthKeys(cachedKeys)
        client.setKeys(cachedKeys)
        setIsInitialized(true)
        return true
      }
    }

    if (!signMessage || !publicKey) {
      console.error('[WaveSend] signMessage or publicKey not available')
      setError('Wallet does not support message signing')
      return false
    }

    setIsLoading(true)
    setError(null)

    try {
      console.log('[WaveSend] Generating stealth keys (one-time signature required)...')
      const keys = await client.initializeKeys(signMessage)
      console.log('[WaveSend] Keys generated successfully:', {
        spendPubkey: Buffer.from(keys.spendPubkey).toString('hex').slice(0, 16) + '...',
        viewPubkey: Buffer.from(keys.viewPubkey).toString('hex').slice(0, 16) + '...',
      })

      setStealthKeys(keys)
      setIsInitialized(true)

      // Cache keys in localStorage for this wallet (full keys including privkeys for scanning)
      cacheStealthKeys(publicKey.toBase58(), keys)

      console.log('[WaveSend] Keys initialized and cached')
      return true
    } catch (err) {
      console.error('[WaveSend] initializeKeys error:', err)
      const message = err instanceof Error ? err.message : 'Failed to initialize keys'
      setError(message)
      return false
    } finally {
      setIsLoading(false)
    }
  }, [signMessage, client, publicKey])

  // Register for stealth payments (X-Wing post-quantum registration)
  // Uploads full X-Wing public key (1216 bytes) in chunks
  // User batch-signs all chunk transactions at once
  const register = useCallback(async (): Promise<boolean> => {
    console.log('[WaveSend] register called (X-Wing multi-tx)')

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

    const hasXWing = !!stealthKeys.xwingKeys
    console.log('[WaveSend] Starting registration with keys:', {
      spendPubkey: Buffer.from(stealthKeys.spendPubkey).toString('hex').slice(0, 16) + '...',
      viewPubkey: Buffer.from(stealthKeys.viewPubkey).toString('hex').slice(0, 16) + '...',
      hasXWingKeys: hasXWing,
    })

    setIsLoading(true)
    setError(null)
    setRegistrationProgress(null)

    try {
      // Use full X-Wing registration (uploads 1216-byte public key in chunks)
      // User batch-signs all transactions for post-quantum security
      console.log('[WaveSend] Calling client.register (X-Wing multi-tx)...')
      const result = await client.register(
        walletAdapter,
        stealthKeys,
        undefined, // xwingPubkey already in stealthKeys
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
