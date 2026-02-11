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
    console.warn('[WAVETEK] cache failed <ENCRYPTED>')
  }
}

export interface UseWaveSendReturn {
  // State
  isInitialized: boolean
  isRegistered: boolean
  isPoolRegistered: boolean  // Pool Registry status
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
  claimByVault: (vaultAddress: string, stealthPubkey: Uint8Array) => Promise<{ success: boolean; signature?: string; error?: string }>

  // Pool Registry Methods (3-signature flow)
  registerPoolRegistry: () => Promise<boolean>
  sendViaPool: (recipientAddress: string, amount: string) => Promise<SendResult>
  checkPoolRegistered: (address: string) => Promise<boolean>

  // Utilities
  clearError: () => void
}

export function useWaveSend(): UseWaveSendReturn {
  const { publicKey, signMessage, signTransaction, signAllTransactions, connected } = useWallet()
  const { connection } = useConnection()

  const [isInitialized, setIsInitialized] = useState(false)
  const [isRegistered, setIsRegistered] = useState(false)
  const [isPoolRegistered, setIsPoolRegistered] = useState(false)  // Pool Registry status
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
  // CRITICAL: Use the REAL signAllTransactions from wallet adapter
  // This enables SINGLE wallet popup for all transactions
  const walletAdapter = useMemo(() => {
    if (!publicKey || !signTransaction || !signMessage || !signAllTransactions) return null
    return {
      publicKey,
      signTransaction,
      signAllTransactions, // Use the REAL signAllTransactions - ONE popup for all TXs!
      signMessage,
    }
  }, [publicKey, signTransaction, signAllTransactions, signMessage])

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
        console.log('[WAVETEK] Auto-initialized from cache for: <ENCRYPTED>')
        setStealthKeys(cachedKeys)
        client.setKeys(cachedKeys)
        setIsInitialized(true)
      }

      // Check registration status (legacy registry)
      try {
        const registry = await client.getRegistry(publicKey)
        setIsRegistered(registry !== null && registry.isFinalized)
      } catch (err) {
        console.error('[WAVETEK] Error checking registration: <ENCRYPTED>')
        setIsRegistered(false)
      }

      // Check Pool Registry status (new 3-signature flow)
      try {
        const poolRegistered = await client.isPoolRegistryFinalized(publicKey)
        setIsPoolRegistered(poolRegistered)
      } catch (err) {
        console.error('[WAVETEK] Error checking pool registration: <ENCRYPTED>')
        setIsPoolRegistered(false)
      }
    }

    initFromCache()
  }, [connected, publicKey, client])

  // Initialize stealth keys - uses localStorage cache to avoid repeated wallet popups
  const initializeKeys = useCallback(async (): Promise<boolean> => {
    console.log('[WAVETEK] initializing keys')

    // Check localStorage cache first (keyed by wallet address)
    if (publicKey) {
      const walletAddress = publicKey.toBase58()
      const cachedKeys = getCachedStealthKeys(walletAddress)
      if (cachedKeys) {
        console.log('[WAVETEK] using cached keys <ENCRYPTED>')
        setStealthKeys(cachedKeys)
        client.setKeys(cachedKeys)
        setIsInitialized(true)
        return true
      }
    }

    if (!signMessage || !publicKey) {
      console.error('[WAVETEK] wallet not ready')
      setError('Wallet does not support message signing')
      return false
    }

    setIsLoading(true)
    setError(null)

    try {
      console.log('[WAVETEK] generating stealth keys')
      const keys = await client.initializeKeys(signMessage)
      console.log('[WAVETEK] keys generated <ENCRYPTED>')

      setStealthKeys(keys)
      setIsInitialized(true)

      // Cache keys in localStorage for this wallet (full keys including privkeys for scanning)
      cacheStealthKeys(publicKey.toBase58(), keys)

      console.log('[WAVETEK] keys cached')
      return true
    } catch (err) {
      console.error('[WAVETEK] initialization failed <ENCRYPTED>')
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
    console.log('[WAVETEK] initiating X-Wing registration')

    if (!walletAdapter) {
      console.error('[WAVETEK] wallet not ready')
      setError('Wallet not connected')
      return false
    }

    if (!stealthKeys) {
      console.error('[WAVETEK] keys not initialized')
      setError('Stealth keys not initialized. Please initialize first.')
      return false
    }

    const hasXWing = !!stealthKeys.xwingKeys
    console.log('[WAVETEK] registration starting <ENCRYPTED>')

    setIsLoading(true)
    setError(null)
    setRegistrationProgress(null)

    try {
      // Use full X-Wing registration (uploads 1216-byte public key in chunks)
      // User batch-signs all transactions for post-quantum security
      console.log('[WAVETEK] submitting registration <ENCRYPTED>')
      const result = await client.register(
        walletAdapter,
        stealthKeys,
        undefined, // xwingPubkey already in stealthKeys
        (progress) => {
          console.log('[WAVETEK] Registration progress: <ENCRYPTED>')
          setRegistrationProgress(progress)
        }
      )
      console.log('[WAVETEK] register result: <ENCRYPTED>')

      if (result.success) {
        console.log('[WAVETEK] registration complete <ENCRYPTED>')
        setIsRegistered(true)
        setRegistrationProgress(null)
        return true
      } else {
        console.error('[WAVETEK] registration failed <ENCRYPTED>')
        setError(result.error || 'Registration failed')
        setRegistrationProgress(null)
        return false
      }
    } catch (err) {
      console.error('[WAVETEK] registration error <ENCRYPTED>')
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
      console.log('[WAVETEK] initiating send <ENCRYPTED>')

      if (!walletAdapter) {
        console.error('[WAVETEK] wallet not ready')
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

        console.log('[WAVETEK] sending transfer <ENCRYPTED>')

        const sendParams: WaveSendParams = {
          recipientWallet,
          amount,
          mint: params.tokenMint && !isSol ? new PublicKey(params.tokenMint) : undefined,
        }

        const result = await client.waveSend(walletAdapter, sendParams)
        console.log('[WAVETEK] send result <ENCRYPTED>')

        if (!result.success) {
          setError(result.error || 'Send failed')
        }

        return result
      } catch (err) {
        console.error('[WAVETEK] send failed <ENCRYPTED>')
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
  // IMPORTANT: stealthPubkey is required for on-chain vault PDA verification
  const claimByVault = useCallback(
    async (vaultAddress: string, stealthPubkey: Uint8Array): Promise<{ success: boolean; signature?: string; error?: string }> => {
      if (!walletAdapter) {
        return { success: false, error: 'Wallet not connected' }
      }

      if (!stealthPubkey || stealthPubkey.length !== 32) {
        return { success: false, error: 'Invalid stealth pubkey - must be 32 bytes' }
      }

      setIsLoading(true)
      setError(null)

      try {
        const result = await client.claimByVaultAddress(walletAdapter, vaultAddress, stealthPubkey)
        console.log('[WAVETEK] claim result: <ENCRYPTED>')

        if (!result.success) {
          setError(result.error || 'Claim failed')
        }

        return {
          success: result.success,
          signature: result.signature,
          error: result.error,
        }
      } catch (err) {
        console.error('[WAVETEK] claim failed <ENCRYPTED>')
        const message = err instanceof Error ? err.message : 'Claim failed'
        setError(message)
        return { success: false, error: message }
      } finally {
        setIsLoading(false)
      }
    },
    [walletAdapter, client]
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // POOL REGISTRY METHODS - 3-Signature Post-Quantum Privacy Flow
  // ═══════════════════════════════════════════════════════════════════════════

  // Register for Pool Registry (creates TeePublicRegistry + TeeSecretStore)
  // Requires stealth keys with X-Wing to be initialized first
  const registerPoolRegistry = useCallback(
    async (): Promise<boolean> => {
      if (!walletAdapter || !stealthKeys) {
        setError('Please initialize stealth keys first')
        return false
      }

      if (!stealthKeys.xwingKeys) {
        setError('X-Wing keys required for Pool Registry')
        return false
      }

      setIsLoading(true)
      setError(null)

      try {
        console.log('[WAVETEK] registering for pool <ENCRYPTED>')
        const result = await client.registerPoolRegistry(
          walletAdapter,
          stealthKeys,
          (msg, step, total) => {
            setRegistrationProgress({
              step: 'uploading' as RegistrationStep,
              currentTx: step,
              totalTx: total,
              message: msg,
            })
          }
        )

        if (result.success) {
          setIsPoolRegistered(true)
          console.log('[WAVETEK] pool registration complete')
        } else {
          setError(result.error || 'Pool Registry registration failed')
        }

        return result.success
      } catch (err) {
        console.error('[WAVETEK] pool registration failed <ENCRYPTED>')
        setError(err instanceof Error ? err.message : 'Registration failed')
        return false
      } finally {
        setIsLoading(false)
        setRegistrationProgress(null)
      }
    },
    [walletAdapter, stealthKeys, client]
  )

  // Send via Pool Registry (single signature, TEE encapsulation)
  const sendViaPool = useCallback(
    async (recipientAddress: string, amount: string): Promise<SendResult> => {
      if (!walletAdapter) {
        return { success: false, error: 'Wallet not connected' }
      }

      let recipientPubkey: PublicKey
      try {
        recipientPubkey = new PublicKey(recipientAddress)
      } catch {
        return { success: false, error: 'Invalid recipient address' }
      }

      const lamports = BigInt(Math.floor(parseFloat(amount) * LAMPORTS_PER_SOL))
      if (lamports <= 0) {
        return { success: false, error: 'Invalid amount' }
      }

      setIsSending(true)
      setError(null)

      try {
        console.log('[WAVETEK] sending via pool <ENCRYPTED>')
        const result = await client.sendViaPoolDeposit(
          walletAdapter,
          recipientPubkey,
          lamports,
          (msg, step, total) => {
            console.log('[WAVETEK] Progress: <ENCRYPTED>')
          }
        )

        if (!result.success) {
          setError(result.error || 'Send failed')
        } else {
          console.log('[WAVETEK] pool deposit created <ENCRYPTED>')
        }

        return result
      } catch (err) {
        console.error('[WAVETEK] pool send failed <ENCRYPTED>')
        const message = err instanceof Error ? err.message : 'Send failed'
        setError(message)
        return { success: false, error: message }
      } finally {
        setIsSending(false)
      }
    },
    [walletAdapter, client]
  )

  // Check if recipient has Pool Registry (can receive Pool deposits)
  const checkPoolRegistered = useCallback(
    async (address: string): Promise<boolean> => {
      try {
        const pubkey = new PublicKey(address)
        return await client.isPoolRegistryFinalized(pubkey)
      } catch {
        return false
      }
    },
    [client]
  )

  return {
    isInitialized,
    isRegistered,
    isPoolRegistered,
    isLoading,
    isSending,
    error,
    registrationProgress,
    initializeKeys,
    register,
    send,
    checkRecipientRegistered,
    claimByVault,
    // Pool Registry methods
    registerPoolRegistry,
    sendViaPool,
    checkPoolRegistered,
    clearError,
  }
}

export default useWaveSend
