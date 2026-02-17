'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { useWallet, useConnection } from './useWalletAdapter'
import {
  WaveStealthClient,
  StealthKeyPair,
  StealthWorkerClient,
  WaveSendParams,
  SendResult,
  NATIVE_SOL_MINT,
  KORA_CONFIG,
  RegistrationProgress,
  RegistrationStep,
} from '@/lib/stealth'

// Stealth key signing message (must match generateStealthKeysFromSignature exactly)
const STEALTH_SIGN_MESSAGE = `Sign this message to generate your WaveSwap stealth viewing keys.

This signature will be used to derive your private viewing keys. Never share this signature with anyone.

Domain: OceanVault:ViewingKeys:v1`

// SESSION_SIG_CACHE REMOVED — Signature no longer cached in main thread.
// Both hooks share StealthWorkerClient singleton (Worker holds keys, not main thread).
// PRIVATE KEY CACHING REMOVED — X-Wing SK never touches main thread or localStorage.

// Build a StealthKeyPair with PUBLIC keys only (private keys zeroed).
// Used to set client keys for operations that only need public data.
// Private keys stay in the Stealth Worker and never touch the main thread.
function buildPublicOnlyKeys(spendPubkey: Uint8Array, viewPubkey: Uint8Array, xwingPubkey: Uint8Array): StealthKeyPair {
  const MLKEM_PK_SIZE = 1184
  return {
    spendPrivkey: new Uint8Array(32), // zeroed — stays in Worker
    spendPubkey,
    viewPrivkey: new Uint8Array(32),  // zeroed — stays in Worker
    viewPubkey,
    xwingKeys: {
      publicKey: {
        mlkem: xwingPubkey.slice(0, MLKEM_PK_SIZE),
        x25519: xwingPubkey.slice(MLKEM_PK_SIZE, MLKEM_PK_SIZE + 32),
      },
      secretKey: {
        mlkem: new Uint8Array(2400),  // zeroed — stays in Worker
        x25519: new Uint8Array(32),   // zeroed — stays in Worker
      },
    },
  }
}

function normalizeSignature(result: any): Uint8Array {
  if (result instanceof Uint8Array) return result
  if (result && typeof result === 'object' && 'signature' in result) {
    return result.signature instanceof Uint8Array ? result.signature : new Uint8Array(result.signature)
  }
  if (result && ArrayBuffer.isView(result)) {
    return new Uint8Array((result as any).buffer, (result as any).byteOffset, (result as any).byteLength)
  }
  if (Array.isArray(result)) return new Uint8Array(result)
  throw new Error('Unexpected signature format from wallet')
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
  // Worker-based key management: private keys NEVER in React state
  const [workerReady, setWorkerReady] = useState(false)
  const [registrationProgress, setRegistrationProgress] = useState<RegistrationProgress | null>(null)

  // Initialize the stealth client with DEVNET connection
  // Uses Helius RPC if configured, falls back to public devnet
  const devnetConnection = useMemo(() => {
    const rpcUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/api/v1/rpc`
      : (process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com')
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

  // Check registration status when wallet connects
  // Note: encrypted cache requires signature, so auto-init deferred to initializeKeys
  useEffect(() => {
    const checkStatus = async () => {
      if (!connected || !publicKey) {
        setIsRegistered(false)
        setIsInitialized(false)
        setWorkerReady(false)
        // Wipe Worker keys on disconnect
        if (StealthWorkerClient.hasInstance()) {
          StealthWorkerClient.getInstance()?.wipe().catch(() => {})
        }
        return
      }

      // Check registration status — must have X-Wing keys for WAVETEK privacy flow
      try {
        const registered = await client.isRecipientRegistered(publicKey)
        setIsRegistered(registered)
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

    checkStatus()
  }, [connected, publicKey, client])

  // Initialize stealth keys via Worker — private keys NEVER in main thread
  // One wallet signature popup per session. Worker.isReady() avoids duplicates.
  const initializeKeys = useCallback(async (): Promise<boolean> => {
    if (!signMessage || !publicKey) {
      setError('Wallet does not support message signing')
      return false
    }

    setIsLoading(true)
    setError(null)

    try {
      // Get or create singleton Worker
      const workerClient = StealthWorkerClient.getInstance()
      if (!workerClient) {
        throw new Error('Stealth Worker unavailable — please refresh the page')
      }

      // Check if Worker already initialized (by useAutoClaim) — avoids duplicate popup
      const alreadyReady = await workerClient.isReady()
      if (alreadyReady) {
        // Worker has keys — get public keys for client
        const pubkeys = await workerClient.getPublicKeys()
        const publicOnlyKeys = buildPublicOnlyKeys(pubkeys.spendPubkey, pubkeys.viewPubkey, pubkeys.xwingPubkey)
        client.setKeys(publicOnlyKeys)
        setWorkerReady(true)
        setIsInitialized(true)
        return true
      }

      // Worker not ready — need wallet signature
      const messageBytes = new TextEncoder().encode(STEALTH_SIGN_MESSAGE)
      const result = await signMessage(messageBytes)
      const signature = normalizeSignature(result)
      if (signature.length === 0) throw new Error('Empty signature')

      // Send signature to Worker (zero-copy transfer, main thread zeroed immediately)
      const pubkeys = await workerClient.init(signature)
      // signature is now zeroed by StealthWorkerClient.init()

      // Set client with PUBLIC keys only (private keys stay in Worker)
      const publicOnlyKeys = buildPublicOnlyKeys(pubkeys.spendPubkey, pubkeys.viewPubkey, pubkeys.xwingPubkey)
      client.setKeys(publicOnlyKeys)
      setWorkerReady(true)
      setIsInitialized(true)

      return true
    } catch (err) {
      console.error('[WAVETEK] worker initialization failed:', err)
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
    if (!walletAdapter) {
      console.error('[WAVETEK] wallet not ready')
      setError('Wallet not connected')
      return false
    }

    if (!workerReady) {
      console.error('[WAVETEK] keys not initialized')
      setError('Stealth keys not initialized. Please initialize first.')
      return false
    }

    setIsLoading(true)
    setError(null)
    setRegistrationProgress(null)

    try {
      // Get public keys from Worker for registration (private keys stay in Worker)
      const workerClient = StealthWorkerClient.getInstance()
      if (!workerClient) throw new Error('Stealth Worker unavailable')
      const pubkeys = await workerClient.getPublicKeys()
      const publicOnlyKeys = buildPublicOnlyKeys(pubkeys.spendPubkey, pubkeys.viewPubkey, pubkeys.xwingPubkey)

      // Kora gasless registration — user pays NOTHING
      let gaslessOptions: {
        payer: PublicKey;
        blockhash: string;
        submitTransaction: (txBase64: string) => Promise<string>;
      } | undefined

      if (KORA_CONFIG.ENABLED) {
        try {
          const koraUrl = KORA_CONFIG.RPC_URL

          // Get Kora fee payer
          const payerRes = await fetch(koraUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getPayerSigner', params: [] }),
          })
          const payerJson = await payerRes.json() as { result?: { signer_address: string }, error?: { message: string } }
          if (payerJson.error) throw new Error(`Kora getPayerSigner: ${payerJson.error.message}`)
          const koraFeePayer = new PublicKey(payerJson.result!.signer_address)

          // Get blockhash from Kora
          const bhRes = await fetch(koraUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBlockhash', params: [] }),
          })
          const bhJson = await bhRes.json() as { result?: { blockhash: string }, error?: { message: string } }
          if (bhJson.error) throw new Error(`Kora getBlockhash: ${bhJson.error.message}`)

          gaslessOptions = {
            payer: koraFeePayer,
            blockhash: bhJson.result!.blockhash,
            submitTransaction: async (txBase64: string): Promise<string> => {
              const res = await fetch(koraUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'signAndSendTransaction', params: [txBase64] }),
              })
              const json = await res.json() as { result?: { signed_transaction: string }, error?: { message: string } }
              if (json.error) throw new Error(`Kora signAndSend: ${json.error.message}`)

              // Extract TX signature from Kora's signed transaction bytes
              const signedTxBytes = Buffer.from(json.result!.signed_transaction, 'base64')
              const signatureBytes = signedTxBytes.slice(1, 65) // byte 0 = sig count, 1-64 = feePayer sig
              const bs58Chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
              let sig = ''
              let num = BigInt(0)
              for (const byte of signatureBytes) num = num * BigInt(256) + BigInt(byte)
              while (num > 0) { sig = bs58Chars[Number(num % BigInt(58))] + sig; num = num / BigInt(58) }
              return sig
            },
          }
        } catch (koraErr) {
          // Kora unavailable — fall back to user-paid registration
          console.warn('[WAVETEK] Kora gasless unavailable, falling back to user-paid registration')
          gaslessOptions = undefined
        }
      }

      // Use full X-Wing registration (uploads 1216-byte public key in chunks)
      // With Kora: user signs to prove ownership, Kora pays rent + fees
      // Without Kora: user pays everything (fallback)
      const progressCb = (progress: RegistrationProgress) => setRegistrationProgress(progress)

      let result = await client.register(walletAdapter, publicOnlyKeys, undefined, progressCb, gaslessOptions)

      // If Kora gasless failed (program not whitelisted, etc.), retry with user-paid
      if (!result.success && gaslessOptions && result.error?.includes('Kora')) {
        console.warn('[WAVETEK] Kora gasless failed, retrying with user-paid registration:', result.error)
        setRegistrationProgress(null)
        result = await client.register(walletAdapter, publicOnlyKeys, undefined, progressCb, undefined)
      }

      if (result.success) {
        setIsRegistered(true)
        setRegistrationProgress(null)
        return true
      } else {
        console.error('[WAVETEK] registration failed:', result.error)
        setError(result.error || 'Registration failed')
        setRegistrationProgress(null)
        return false
      }
    } catch (err) {
      console.error('[WAVETEK] registration error:', err)
      const message = err instanceof Error ? err.message : 'Registration failed'
      setError(message)
      setRegistrationProgress(null)
      return false
    } finally {
      setIsLoading(false)
    }
  }, [walletAdapter, workerReady, client])

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
        console.error('[WAVETEK] wallet not ready')
        return { success: false, error: 'Wallet not connected' }
      }

      if (!workerReady) {
        setError('Please initialize stealth keys first')
        return { success: false, error: 'Please initialize stealth keys first' }
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
        const isSol = !params.tokenMint || params.tokenMint === NATIVE_SOL_MINT.toBase58()
        const amount = isSol
          ? BigInt(Math.floor(amountFloat * LAMPORTS_PER_SOL))
          : BigInt(Math.floor(amountFloat * 1e6))

        const sendParams: WaveSendParams = {
          recipientWallet,
          amount,
          mint: params.tokenMint && !isSol ? new PublicKey(params.tokenMint) : undefined,
        }

        // WAVETEK SEQ: CREATE_SEQ → UPLOAD_CIPHERTEXT → COMPLETE_SEQ (single wallet popup)
        // Crank automatically handles: REGISTER → INPUT_TO_POOL → PREPARE_OUTPUT → POOL_TO_ESCROW
        const result = await client.waveSendV4(walletAdapter, sendParams)

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
    [walletAdapter, client, workerReady]
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
      if (!walletAdapter || !workerReady) {
        setError('Please initialize stealth keys first')
        return false
      }

      setIsLoading(true)
      setError(null)

      try {
        // Get public keys from Worker for pool registration
        const workerClient = StealthWorkerClient.getInstance()
        if (!workerClient) throw new Error('Stealth Worker unavailable')
        const pubkeys = await workerClient.getPublicKeys()
        const publicOnlyKeys = buildPublicOnlyKeys(pubkeys.spendPubkey, pubkeys.viewPubkey, pubkeys.xwingPubkey)

        const result = await client.registerPoolRegistry(
          walletAdapter,
          publicOnlyKeys,
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
    [walletAdapter, workerReady, client]
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
        const result = await client.sendViaPoolDeposit(
          walletAdapter,
          recipientPubkey,
          lamports,
          (msg, step, total) => {
          }
        )

        if (!result.success) {
          setError(result.error || 'Send failed')
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
