'use client'

// usePERPrivacy - Full privacy flow using MagicBlock PER + Mixer + Relayer
//
// This hook provides COMPLETE PRIVACY for stealth transactions:
// 1. SENDER UNLINKABILITY: Mixer pool breaks sender-vault link
// 2. RECEIVER UNLINKABILITY: Relayer claims break recipient-claim link
//
// The TEE proof is the SOLE authorization - trustless and decentralized

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Connection, PublicKey } from '@solana/web3.js'
import { useWallet } from './useWalletAdapter'
import {
  PERPrivacyClient,
  PROGRAM_IDS,
  generateStealthKeysFromSignature,
  deriveStealthVaultPda,
  deriveRegistryPda,
  StealthKeyPair,
  PrivacySendResult,
  PrivacyClaimResult,
} from '@/lib/stealth'
import { checkViewTag, isPaymentForUs } from '@/lib/stealth/scanner'

// Default relayer endpoint for devnet
const DEFAULT_RELAYER_ENDPOINT = process.env.NEXT_PUBLIC_RELAYER_ENDPOINT || 'http://localhost:3001'
const DEFAULT_RELAYER_PUBKEY = process.env.NEXT_PUBLIC_RELAYER_PUBKEY

export interface PendingPrivacyClaim {
  vaultAddress: string
  announcementPda: string
  amount: bigint
  stealthPubkey: Uint8Array
  status: 'pending' | 'claiming' | 'claimed' | 'failed'
  error?: string
}

export interface UsePERPrivacyReturn {
  // State
  isReady: boolean
  isScanning: boolean
  isSending: boolean
  isClaiming: boolean
  pendingClaims: PendingPrivacyClaim[]
  totalPendingAmount: bigint
  mixerPoolStatus: {
    exists: boolean
    isActive: boolean
    balance: bigint
    pendingDeposits: number
  } | null

  // Actions
  initializeKeys: () => Promise<boolean>
  privacySend: (recipientWallet: PublicKey, amount: bigint) => Promise<PrivacySendResult>
  privacyClaim: (claim: PendingPrivacyClaim) => Promise<PrivacyClaimResult>
  privacyClaimAll: () => Promise<void>
  startScanning: () => Promise<void>
  stopScanning: () => void
  refreshMixerStatus: () => Promise<void>

  // Status
  stealthKeys: StealthKeyPair | null
  lastScanTime: Date | null
  error: string | null
}

export function usePERPrivacy(): UsePERPrivacyReturn {
  const { publicKey, signMessage, connected } = useWallet()

  const [isReady, setIsReady] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isClaiming, setIsClaiming] = useState(false)
  const [pendingClaims, setPendingClaims] = useState<PendingPrivacyClaim[]>([])
  const [stealthKeys, setStealthKeys] = useState<StealthKeyPair | null>(null)
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mixerPoolStatus, setMixerPoolStatus] = useState<{
    exists: boolean
    isActive: boolean
    balance: bigint
    pendingDeposits: number
  } | null>(null)

  // Initialize PER Privacy client
  const perClient = useMemo(() => {
    const client = new PERPrivacyClient()

    // Configure relayer if available
    if (DEFAULT_RELAYER_PUBKEY) {
      try {
        const relayerPubkey = new PublicKey(DEFAULT_RELAYER_PUBKEY)
        client.setRelayer(relayerPubkey, DEFAULT_RELAYER_ENDPOINT)
      } catch (e) {
        console.warn('[PER Privacy] Invalid relayer pubkey:', e)
      }
    }

    return client
  }, [])

  // Calculate total pending amount
  const totalPendingAmount = useMemo(() => {
    return pendingClaims
      .filter(c => c.status === 'pending')
      .reduce((sum, c) => sum + c.amount, BigInt(0))
  }, [pendingClaims])

  // Initialize stealth keys from wallet signature
  const initializeKeys = useCallback(async (): Promise<boolean> => {
    if (!signMessage) {
      setError('Wallet does not support message signing')
      return false
    }

    try {
      console.log('[PER Privacy] Generating stealth keys from wallet signature...')
      const keys = await generateStealthKeysFromSignature(signMessage)
      setStealthKeys(keys)
      setIsReady(true)
      console.log('[PER Privacy] Stealth keys ready')
      return true
    } catch (err) {
      console.error('[PER Privacy] Failed to generate keys:', err)
      setError('Please sign the message to enable privacy features')
      return false
    }
  }, [signMessage])

  // Refresh mixer pool status
  const refreshMixerStatus = useCallback(async () => {
    try {
      const status = await perClient.getMixerPoolStatus()
      setMixerPoolStatus(status)
    } catch (err) {
      console.error('[PER Privacy] Failed to get mixer status:', err)
    }
  }, [perClient])

  // Privacy-preserving send using full mixer flow
  const privacySend = useCallback(async (
    recipientWallet: PublicKey,
    amount: bigint
  ): Promise<PrivacySendResult> => {
    if (!publicKey) {
      return { success: false, error: 'Wallet not connected' }
    }

    setIsSending(true)
    setError(null)

    try {
      // Get recipient's registry to get their spend/view pubkeys
      const connection = new Connection('https://api.devnet.solana.com', 'confirmed')
      const [registryPda] = deriveRegistryPda(recipientWallet)

      const registryInfo = await connection.getAccountInfo(registryPda)
      if (!registryInfo) {
        return { success: false, error: 'Recipient not registered for stealth payments' }
      }

      // Parse registry data
      // Layout: discriminator(8) + bump(1) + owner(32) + is_finalized(1) + bytes_written(2) + xwing_pubkey(1216)
      // xwing_pubkey stores: spend_pubkey(32) + view_pubkey(32) starting at offset 44
      const data = registryInfo.data
      const spendPubkey = new Uint8Array(data.slice(44, 76))
      const viewPubkey = new Uint8Array(data.slice(76, 108))

      console.log('[PER Privacy] Starting privacy send to:', recipientWallet.toBase58())

      // Use PER client for full privacy flow
      // This needs wallet adapter, but we'll construct a compatible interface
      const walletAdapter = {
        publicKey,
        signTransaction: async (tx: any) => {
          // This will be handled by the UI's wallet adapter
          throw new Error('Direct signTransaction not available - use UI flow')
        }
      }

      // For now, return the params needed for the UI to complete the flow
      return {
        success: false,
        error: 'Use waveSendViaMixer in WaveStealthClient for UI integration',
      }

    } catch (err: any) {
      console.error('[PER Privacy] Send failed:', err)
      setError(err.message)
      return { success: false, error: err.message }
    } finally {
      setIsSending(false)
    }
  }, [publicKey, perClient])

  // Privacy claim via relayer
  const privacyClaim = useCallback(async (claim: PendingPrivacyClaim): Promise<PrivacyClaimResult> => {
    if (!stealthKeys) {
      return { success: false, error: 'Stealth keys not initialized' }
    }

    if (!publicKey) {
      return { success: false, error: 'Wallet not connected' }
    }

    // Update status
    setPendingClaims(prev => prev.map(c =>
      c.vaultAddress === claim.vaultAddress ? { ...c, status: 'claiming' as const } : c
    ))

    setIsClaiming(true)
    setError(null)

    try {
      console.log('[PER Privacy] Claiming via relayer:', claim.vaultAddress)

      const result = await perClient.privacyClaim({
        stealthKeys,
        vaultPda: new PublicKey(claim.vaultAddress),
        announcementPda: new PublicKey(claim.announcementPda),
        stealthPubkey: claim.stealthPubkey,
        destination: publicKey, // Funds go to user's wallet
      })

      if (result.success) {
        setPendingClaims(prev => prev.map(c =>
          c.vaultAddress === claim.vaultAddress ? { ...c, status: 'claimed' as const } : c
        ))
        console.log('[PER Privacy] Claim successful:', result.signature)
      } else {
        setPendingClaims(prev => prev.map(c =>
          c.vaultAddress === claim.vaultAddress
            ? { ...c, status: 'failed' as const, error: result.error }
            : c
        ))
      }

      return result

    } catch (err: any) {
      console.error('[PER Privacy] Claim failed:', err)
      setPendingClaims(prev => prev.map(c =>
        c.vaultAddress === claim.vaultAddress
          ? { ...c, status: 'failed' as const, error: err.message }
          : c
      ))
      return { success: false, error: err.message }
    } finally {
      setIsClaiming(false)
    }
  }, [stealthKeys, publicKey, perClient])

  // Claim all pending payments
  const privacyClaimAll = useCallback(async () => {
    const pending = pendingClaims.filter(c => c.status === 'pending')

    for (const claim of pending) {
      await privacyClaim(claim)
      // Small delay between claims
      await new Promise(r => setTimeout(r, 1000))
    }
  }, [pendingClaims, privacyClaim])

  // Privacy-preserving scan using view key
  const startScanning = useCallback(async () => {
    if (!stealthKeys) {
      const initialized = await initializeKeys()
      if (!initialized) return
    }

    const keys = stealthKeys!
    setIsScanning(true)
    setError(null)

    try {
      console.log('[PER Privacy] Starting privacy-preserving scan...')

      const connection = new Connection('https://api.devnet.solana.com', 'confirmed')

      // Fetch all announcements
      const accounts = await connection.getProgramAccounts(PROGRAM_IDS.STEALTH, {
        filters: [{ dataSize: 1273 }], // Announcement size
      })

      console.log(`[PER Privacy] Scanning ${accounts.length} announcements...`)

      // Announcement layout offsets
      const OFFSET_EPHEMERAL = 17
      const OFFSET_STEALTH = 81
      const OFFSET_VAULT = 113
      const OFFSET_VIEW_TAG = 145
      const OFFSET_FINALIZED = 146
      const OFFSET_CLAIMED = 147

      let foundCount = 0

      for (const { pubkey, account } of accounts) {
        const data = account.data

        // Check if finalized and not claimed
        if (data[OFFSET_FINALIZED] !== 1 || data[OFFSET_CLAIMED] === 1) continue

        // Extract ephemeral pubkey and view tag
        const ephemeralPubkey = new Uint8Array(data.slice(OFFSET_EPHEMERAL, OFFSET_EPHEMERAL + 32))
        const viewTag = data[OFFSET_VIEW_TAG]

        // Fast view tag check (~99.6% rejection)
        if (!checkViewTag(keys.viewPrivkey, ephemeralPubkey, viewTag)) continue

        // Full cryptographic verification
        const stealthPubkey = new Uint8Array(data.slice(OFFSET_STEALTH, OFFSET_STEALTH + 32))
        if (!isPaymentForUs(keys, ephemeralPubkey, viewTag, stealthPubkey)) continue

        // This payment is for us!
        foundCount++
        const vaultPda = new PublicKey(data.slice(OFFSET_VAULT, OFFSET_VAULT + 32))

        // Check vault balance
        const vaultInfo = await connection.getAccountInfo(vaultPda)
        if (!vaultInfo || vaultInfo.lamports === 0) continue

        console.log(`[PER Privacy] Found payment: ${vaultInfo.lamports / 1e9} SOL`)

        setPendingClaims(prev => {
          if (prev.some(c => c.vaultAddress === vaultPda.toBase58())) return prev
          return [...prev, {
            vaultAddress: vaultPda.toBase58(),
            announcementPda: pubkey.toBase58(),
            amount: BigInt(vaultInfo.lamports),
            stealthPubkey,
            status: 'pending' as const,
          }]
        })
      }

      console.log(`[PER Privacy] Scan complete: ${foundCount} payments found`)
      setLastScanTime(new Date())

    } catch (err: any) {
      console.error('[PER Privacy] Scan failed:', err)
      setError(err.message)
    } finally {
      setIsScanning(false)
    }
  }, [stealthKeys, initializeKeys])

  const stopScanning = useCallback(() => {
    setIsScanning(false)
  }, [])

  // Auto-initialize on wallet connect
  useEffect(() => {
    if (connected && publicKey && !stealthKeys) {
      // Don't auto-init - require user action for signing
    }
  }, [connected, publicKey, stealthKeys])

  // Refresh mixer status periodically
  useEffect(() => {
    refreshMixerStatus()
    const interval = setInterval(refreshMixerStatus, 30000)
    return () => clearInterval(interval)
  }, [refreshMixerStatus])

  return {
    isReady,
    isScanning,
    isSending,
    isClaiming,
    pendingClaims,
    totalPendingAmount,
    mixerPoolStatus,
    initializeKeys,
    privacySend,
    privacyClaim,
    privacyClaimAll,
    startScanning,
    stopScanning,
    refreshMixerStatus,
    stealthKeys,
    lastScanTime,
    error,
  }
}

export default usePERPrivacy
