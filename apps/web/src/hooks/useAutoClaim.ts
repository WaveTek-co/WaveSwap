'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js'
import { useWallet } from './useWalletAdapter'
import {
  WaveStealthClient,
  PROGRAM_IDS,
  StealthDiscriminators,
  deriveRegistryPda,
  generateStealthKeysFromSignature,
  StealthKeyPair,
} from '@/lib/stealth'
import { StealthScanner, DetectedPayment, isPaymentForUs, checkViewTag } from '@/lib/stealth/scanner'
import { sha3_256 } from 'js-sha3'
import { showPaymentReceived, showClaimSuccess } from '@/components/ui/TransactionToast'

export interface PendingClaim {
  vaultAddress: string
  amount: bigint
  sender: string
  announcementPda: string
  stealthPubkey: Uint8Array  // Required for claim instruction
  status: 'pending' | 'claiming' | 'claimed' | 'failed'
}

export interface UseAutoClaimReturn {
  // State
  isScanning: boolean
  pendingClaims: PendingClaim[]
  totalPendingAmount: bigint
  claimHistory: { signature: string; amount: bigint; timestamp: number; sender?: string }[]

  // Actions
  startScanning: () => void
  stopScanning: () => void
  claimAll: () => Promise<void>
  claimSingle: (vaultAddress: string) => Promise<boolean>

  // Status
  lastScanTime: Date | null
  error: string | null
}

export function useAutoClaim(): UseAutoClaimReturn {
  const { publicKey, signTransaction, signMessage, connected } = useWallet()

  const [isScanning, setIsScanning] = useState(false)
  const [pendingClaims, setPendingClaims] = useState<PendingClaim[]>([])
  const [claimHistory, setClaimHistory] = useState<{ signature: string; amount: bigint; timestamp: number; sender?: string }[]>([])
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stealthKeys, setStealthKeys] = useState<StealthKeyPair | null>(null)

  const scannerRef = useRef<StealthScanner | null>(null)

  // Create devnet connection
  const connection = useMemo(() => {
    return new Connection('https://api.devnet.solana.com', 'confirmed')
  }, [])

  // Calculate total pending amount
  const totalPendingAmount = useMemo(() => {
    return pendingClaims
      .filter(c => c.status === 'pending')
      .reduce((sum, c) => sum + c.amount, BigInt(0))
  }, [pendingClaims])

  // Handle detected payment
  const handlePaymentDetected = useCallback((payment: DetectedPayment) => {
    console.log('[AutoClaim] Payment detected:', payment.vaultPda.toBase58(), payment.amount.toString())

    setPendingClaims(prev => {
      // Check if already exists
      if (prev.some(c => c.vaultAddress === payment.vaultPda.toBase58())) {
        return prev
      }

      return [...prev, {
        vaultAddress: payment.vaultPda.toBase58(),
        amount: payment.amount,
        sender: 'PRIVATE', // Privacy preserved - no sender identity
        announcementPda: payment.announcementPda.toBase58(),
        stealthPubkey: payment.stealthPubkey, // Required for claim instruction
        status: 'pending' as const,
      }]
    })
  }, [])

  // PRIVACY-PRESERVING scan using view key cryptography
  // This is the correct approach - no registry matching!
  const startPrivacyScan = useCallback(async () => {
    if (!publicKey || !connection || !signMessage) return

    setIsScanning(true)
    setError(null)

    try {
      console.log('[AutoClaim] Starting PRIVACY-PRESERVING scan with view key...')

      // Step 1: Generate stealth keys if not already done
      let keys = stealthKeys
      if (!keys) {
        console.log('[AutoClaim] Generating stealth keys from wallet signature...')
        try {
          keys = await generateStealthKeysFromSignature(signMessage)
          setStealthKeys(keys)
          console.log('[AutoClaim] Stealth keys generated successfully')
        } catch (err) {
          console.error('[AutoClaim] Failed to generate stealth keys:', err)
          setError('Please sign the message to enable auto-claim scanning')
          setIsScanning(false)
          return
        }
      }

      // Step 2: Fetch ALL announcements (no filtering by recipient - that's the privacy!)
      const accounts = await connection.getProgramAccounts(PROGRAM_IDS.STEALTH, {
        filters: [
          {
            dataSize: 1273, // Announcement size
          },
        ],
      })

      console.log(`[AutoClaim] Scanning ${accounts.length} announcements with view key...`)

      // NEW announcement layout offsets (privacy-preserving):
      // discriminator(8) + bump(1) + timestamp(8) + ephemeral_pubkey(32) + pool_nonce(32) +
      // stealth_pubkey(32) + vault_pda(32) + view_tag(1) + is_finalized(1) + is_claimed(1) + ...
      const OFFSET_EPHEMERAL = 17
      const OFFSET_NONCE = 49
      const OFFSET_STEALTH = 81
      const OFFSET_VAULT = 113
      const OFFSET_VIEW_TAG = 145
      const OFFSET_FINALIZED = 146
      const OFFSET_CLAIMED = 147

      let viewTagMatches = 0
      let confirmedPayments = 0

      for (const { pubkey, account } of accounts) {
        const data = account.data

        // Check discriminator
        const discriminator = data.slice(0, 8).toString()
        if (discriminator !== 'ANNOUNCE') continue

        // Check if finalized
        if (data[OFFSET_FINALIZED] !== 1) continue

        // Check if already claimed
        if (data[OFFSET_CLAIMED] === 1) continue

        // Extract ephemeral pubkey for view tag check
        const ephemeralPubkey = new Uint8Array(data.slice(OFFSET_EPHEMERAL, OFFSET_EPHEMERAL + 32))
        const viewTag = data[OFFSET_VIEW_TAG]

        // STEP 1: Fast view tag check (~99.6% rejection rate)
        if (!checkViewTag(keys.viewPrivkey, ephemeralPubkey, viewTag)) {
          continue // Not for us
        }

        viewTagMatches++
        console.log('[AutoClaim] View tag match! Verifying stealth address...')

        // STEP 2: Full cryptographic verification
        const stealthPubkey = new Uint8Array(data.slice(OFFSET_STEALTH, OFFSET_STEALTH + 32))
        if (!isPaymentForUs(keys, ephemeralPubkey, viewTag, stealthPubkey)) {
          console.log('[AutoClaim] False positive - stealth pubkey mismatch')
          continue
        }

        // CONFIRMED: Payment is for us!
        confirmedPayments++
        console.log('[AutoClaim] CONFIRMED payment for us!')

        // Get vault PDA
        const vaultPda = new PublicKey(data.slice(OFFSET_VAULT, OFFSET_VAULT + 32))

        // Check vault balance
        const vaultInfo = await connection.getAccountInfo(vaultPda)
        if (!vaultInfo || vaultInfo.lamports === 0) {
          console.log('[AutoClaim] Vault empty - already claimed')
          continue
        }

        console.log(`[AutoClaim] Found payment: ${vaultPda.toBase58()}, Amount: ${vaultInfo.lamports / 1e9} SOL`)

        // Check if this is a new payment we haven't seen
        const isNewPayment = !pendingClaims.some(c => c.vaultAddress === vaultPda.toBase58())

        if (isNewPayment) {
          // Show "payment received" toast for new detections
          showPaymentReceived({
            signature: pubkey.toBase58(), // Use announcement as pseudo-signature for explorer
            amount: BigInt(vaultInfo.lamports),
            symbol: 'SOL',
          })
        }

        setPendingClaims(prev => {
          if (prev.some(c => c.vaultAddress === vaultPda.toBase58())) {
            return prev
          }
          return [...prev, {
            vaultAddress: vaultPda.toBase58(),
            amount: BigInt(vaultInfo.lamports),
            sender: 'PRIVATE', // No sender identity - privacy preserved!
            announcementPda: pubkey.toBase58(),
            stealthPubkey: stealthPubkey, // Store for claim instruction
            status: 'pending' as const,
          }]
        })
      }

      console.log(`[AutoClaim] Scan complete: ${viewTagMatches} view tag matches, ${confirmedPayments} confirmed`)
      setLastScanTime(new Date())
    } catch (err) {
      console.error('[AutoClaim] Scan error:', err)
      setError(err instanceof Error ? err.message : 'Scan failed')
    } finally {
      setIsScanning(false)
    }
  }, [publicKey, connection, signMessage, stealthKeys, pendingClaims])

  // Start manual scanning (privacy-preserving)
  const startScanning = useCallback(() => {
    startPrivacyScan()
  }, [startPrivacyScan])

  // Initialize scanner when wallet connects
  useEffect(() => {
    if (!connected || !publicKey) {
      if (scannerRef.current) {
        scannerRef.current.stopScanning()
        scannerRef.current = null
      }
      setIsScanning(false)
      return
    }

    // Create scanner
    const scanner = new StealthScanner({
      connection,
      pollIntervalMs: 15000, // 15 seconds
      maxAnnouncements: 50,
    })

    scanner.onPayment(handlePaymentDetected)
    scannerRef.current = scanner

    // Auto-start PRIVACY-PRESERVING scanning when wallet connects
    console.log('[AutoClaim] Wallet connected, starting privacy-preserving scanner...')
    startPrivacyScan()

    return () => {
      if (scannerRef.current) {
        scannerRef.current.stopScanning()
      }
    }
  }, [connected, publicKey, connection, handlePaymentDetected, startPrivacyScan])

  // Stop scanning
  const stopScanning = useCallback(() => {
    if (scannerRef.current) {
      scannerRef.current.stopScanning()
    }
    setIsScanning(false)
  }, [])

  // Claim a single payment
  // Note: In production, this should go through PER/relayer for privacy
  // For devnet, we claim directly (simplified)
  const claimSingle = useCallback(async (vaultAddress: string): Promise<boolean> => {
    if (!publicKey || !signTransaction) {
      setError('Wallet not connected')
      return false
    }

    // Find the pending claim to get the stealthPubkey
    const pendingClaim = pendingClaims.find(c => c.vaultAddress === vaultAddress)
    if (!pendingClaim) {
      setError('Claim not found')
      return false
    }

    // Skip if already claiming or claimed
    if (pendingClaim.status !== 'pending') {
      console.log('[AutoClaim] Skipping claim - status is:', pendingClaim.status)
      return pendingClaim.status === 'claimed'
    }

    // Update status
    setPendingClaims(prev => prev.map(c =>
      c.vaultAddress === vaultAddress ? { ...c, status: 'claiming' as const } : c
    ))

    try {
      const vaultPda = new PublicKey(vaultAddress)

      // Check vault balance
      const vaultInfo = await connection.getAccountInfo(vaultPda)
      if (!vaultInfo || vaultInfo.lamports === 0) {
        throw new Error('Vault is empty')
      }

      const amount = BigInt(vaultInfo.lamports)

      // Build claim transaction
      // Data format: discriminator (1 byte) + stealth_pubkey (32 bytes)
      const data = Buffer.alloc(33)
      data.writeUInt8(StealthDiscriminators.CLAIM_STEALTH_PAYMENT, 0)
      Buffer.from(pendingClaim.stealthPubkey).copy(data, 1)

      const tx = new Transaction()
      tx.add(
        new TransactionInstruction({
          keys: [
            { pubkey: publicKey, isSigner: true, isWritable: false },
            { pubkey: vaultPda, isSigner: false, isWritable: true },
            { pubkey: publicKey, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          programId: PROGRAM_IDS.STEALTH,
          data,
        })
      )

      tx.feePayer = publicKey
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash

      const signedTx = await signTransaction(tx)
      const signature = await connection.sendRawTransaction(signedTx.serialize())
      await connection.confirmTransaction(signature, 'confirmed')

      console.log('[AutoClaim] Claim successful:', signature)

      // Show enhanced toast with explorer link
      showClaimSuccess({
        signature,
        amount,
        symbol: 'SOL',
        sender: pendingClaim.sender !== 'PRIVATE' ? pendingClaim.sender : undefined,
      })

      // Update status
      setPendingClaims(prev => prev.map(c =>
        c.vaultAddress === vaultAddress ? { ...c, status: 'claimed' as const } : c
      ))

      // Add to history
      setClaimHistory(prev => [...prev, {
        signature,
        amount,
        timestamp: Date.now(),
        sender: pendingClaim.sender,
      }])

      return true
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Claim failed'

      // Check if error is InsufficientFunds (0x9) or vault empty - treat as already claimed
      const isAlreadyClaimed =
        errorMessage.includes('0x9') ||
        errorMessage.includes('Vault is empty') ||
        errorMessage.includes('InsufficientFunds')

      if (isAlreadyClaimed) {
        console.log('[AutoClaim] Vault already claimed, marking as claimed:', vaultAddress)
        setPendingClaims(prev => prev.map(c =>
          c.vaultAddress === vaultAddress ? { ...c, status: 'claimed' as const } : c
        ))
        return true // Not really a failure - vault was claimed (possibly by us in parallel)
      }

      console.error('[AutoClaim] Claim failed:', err)
      setError(errorMessage)

      setPendingClaims(prev => prev.map(c =>
        c.vaultAddress === vaultAddress ? { ...c, status: 'failed' as const } : c
      ))

      return false
    }
  }, [publicKey, signTransaction, connection, pendingClaims])

  // Claim all pending payments
  const claimAll = useCallback(async () => {
    const pending = pendingClaims.filter(c => c.status === 'pending')

    for (const claim of pending) {
      await claimSingle(claim.vaultAddress)
      // Small delay between claims
      await new Promise(r => setTimeout(r, 1000))
    }
  }, [pendingClaims, claimSingle])

  // Auto-claim when payments are detected
  useEffect(() => {
    const pendingCount = pendingClaims.filter(c => c.status === 'pending').length

    if (pendingCount > 0 && connected && publicKey) {
      console.log(`[AutoClaim] ${pendingCount} pending payments, auto-claiming...`)
      // Auto-claim with a small delay
      const timeout = setTimeout(() => {
        claimAll()
      }, 2000)

      return () => clearTimeout(timeout)
    }
  }, [pendingClaims, connected, publicKey, claimAll])

  return {
    isScanning,
    pendingClaims,
    totalPendingAmount,
    claimHistory,
    startScanning,
    stopScanning,
    claimAll,
    claimSingle,
    lastScanTime,
    error,
  }
}

export default useAutoClaim
