'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram, ComputeBudgetProgram } from '@solana/web3.js'
import { useWallet } from './useWalletAdapter'
import {
  PROGRAM_IDS,
  StealthDiscriminators,
  deriveStealthVaultPda,
  generateStealthKeysFromSignature,
  StealthKeyPair,
} from '@/lib/stealth'
import { isPaymentForUs, checkViewTag } from '@/lib/stealth/scanner'
import { showPaymentReceived, showClaimSuccess } from '@/components/ui/TransactionToast'

// PER deposit record constants (Magic Actions)
const PER_DEPOSIT_DISCRIMINATOR = 'PERDEPST'
const PER_DEPOSIT_SIZE = 148

// Delegation program ID (accounts are owned by this after delegation)
const DELEGATION_PROGRAM_ID = new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh')

// PER deposit record layout offsets:
// discriminator(8) + bump(1) + nonce(32) + amount(8) + depositor(32) +
// stealth_pubkey(32) + ephemeral_pubkey(32) + view_tag(1) + delegated(1) + executed(1)
const PER_OFFSET_BUMP = 8
const PER_OFFSET_NONCE = 9
const PER_OFFSET_AMOUNT = 41
const PER_OFFSET_STEALTH = 81
const PER_OFFSET_EPHEMERAL = 113
const PER_OFFSET_VIEW_TAG = 145
const PER_OFFSET_EXECUTED = 147

// PER deposit seed for PDA derivation
const PER_DEPOSIT_SEED = 'per-deposit'

// Scan interval (30 seconds to reduce RPC load)
const SCAN_INTERVAL_MS = 30000

export interface PendingClaim {
  vaultAddress: string
  amount: bigint
  sender: string
  announcementPda: string
  stealthPubkey: Uint8Array
  status: 'pending' | 'claiming' | 'claimed' | 'failed'
}

export interface DelegatedDeposit {
  depositAddress: string
  vaultAddress: string
  amount: bigint
  stealthPubkey: Uint8Array
  nonce: Uint8Array
  bump: number
  executed: boolean
}

export interface UseAutoClaimReturn {
  isScanning: boolean
  pendingClaims: PendingClaim[]
  delegatedDeposits: DelegatedDeposit[]
  totalPendingAmount: bigint
  totalDelegatedAmount: bigint
  claimHistory: { signature: string; amount: bigint; timestamp: number; sender?: string }[]
  startScanning: () => void
  stopScanning: () => void
  claimAll: () => Promise<void>
  claimSingle: (vaultAddress: string) => Promise<boolean>
  undelegateDeposit: (depositAddress: string) => Promise<boolean>
  undelegateAll: () => Promise<void>
  lastScanTime: Date | null
  error: string | null
}

export function useAutoClaim(): UseAutoClaimReturn {
  const { publicKey, signTransaction, signMessage, connected } = useWallet()

  const [isScanning, setIsScanning] = useState(false)
  const [pendingClaims, setPendingClaims] = useState<PendingClaim[]>([])
  const [delegatedDeposits, setDelegatedDeposits] = useState<DelegatedDeposit[]>([])
  const [claimHistory, setClaimHistory] = useState<{ signature: string; amount: bigint; timestamp: number; sender?: string }[]>([])
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stealthKeys, setStealthKeys] = useState<StealthKeyPair | null>(null)

  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const isScanningRef = useRef(false)

  // Create devnet connection with longer timeout
  const connection = useMemo(() => {
    return new Connection('https://api.devnet.solana.com', {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000,
    })
  }, [])

  // Calculate total pending amount
  const totalPendingAmount = useMemo(() => {
    return pendingClaims
      .filter(c => c.status === 'pending')
      .reduce((sum, c) => sum + c.amount, BigInt(0))
  }, [pendingClaims])

  // Calculate total delegated amount (waiting for TEE)
  const totalDelegatedAmount = useMemo(() => {
    return delegatedDeposits.reduce((sum, d) => sum + d.amount, BigInt(0))
  }, [delegatedDeposits])

  // Magic Actions scan - scans PER deposit records
  const scanMagicActions = useCallback(async (keys: StealthKeyPair) => {
    console.log('[AutoClaim] Scanning Magic Actions (PER deposit records)...')

    try {
      // PER deposits are owned by delegation program after delegation
      // Query by size only, filter by discriminator in code
      const perAccounts = await connection.getProgramAccounts(DELEGATION_PROGRAM_ID, {
        filters: [{ dataSize: PER_DEPOSIT_SIZE }],
      })

      console.log(`[AutoClaim] Found ${perAccounts.length} delegation program accounts (148 bytes)`)

      // Also check stealth program for non-delegated/undelegated records
      const stealthPerAccounts = await connection.getProgramAccounts(PROGRAM_IDS.STEALTH, {
        filters: [{ dataSize: PER_DEPOSIT_SIZE }],
      })

      console.log(`[AutoClaim] Found ${stealthPerAccounts.length} stealth program PER records`)

      const allAccounts = [...perAccounts, ...stealthPerAccounts]
      console.log(`[AutoClaim] Total accounts to check: ${allAccounts.length}`)

      let perConfirmedPayments = 0
      let discriminatorMatches = 0

      for (const { pubkey, account } of allAccounts) {
        const data = account.data

        // Check discriminator
        const discriminator = data.slice(0, 8).toString()
        if (discriminator !== PER_DEPOSIT_DISCRIMINATOR) {
          // Log first few non-matching for debugging
          if (discriminatorMatches === 0 && allAccounts.length < 20) {
            console.log(`[AutoClaim] Discriminator mismatch: got "${discriminator}"`)
          }
          continue
        }
        discriminatorMatches++
        console.log(`[AutoClaim] Found PER deposit record: ${pubkey.toBase58()}`)

        // Check if TEE has executed the transfer
        const executed = data[PER_OFFSET_EXECUTED] === 1

        // Extract ephemeral pubkey and view tag
        const ephemeralPubkey = new Uint8Array(data.slice(PER_OFFSET_EPHEMERAL, PER_OFFSET_EPHEMERAL + 32))
        const viewTag = data[PER_OFFSET_VIEW_TAG]

        // Fast view tag check
        if (!checkViewTag(keys.viewPrivkey, ephemeralPubkey, viewTag)) {
          continue
        }

        console.log('[AutoClaim] Magic Actions: View tag match!')

        // Full cryptographic verification
        const stealthPubkey = new Uint8Array(data.slice(PER_OFFSET_STEALTH, PER_OFFSET_STEALTH + 32))
        if (!isPaymentForUs(keys, ephemeralPubkey, viewTag, stealthPubkey)) {
          console.log('[AutoClaim] Magic Actions: False positive')
          continue
        }

        // Derive stealth vault PDA from stealth pubkey
        const [vaultPda] = deriveStealthVaultPda(stealthPubkey)

        // Check vault balance (only claimable after TEE executes)
        const vaultInfo = await connection.getAccountInfo(vaultPda)

        // Check deposit record balance (funds held before TEE execution)
        const depositLamports = account.lamports
        const rentExempt = 1001920 // ~0.001 SOL rent for 148 bytes
        const depositAmount = depositLamports > rentExempt ? depositLamports - rentExempt : 0

        // Determine if funds are ready to claim
        const vaultHasFunds = vaultInfo && vaultInfo.lamports > 0
        const depositHasFunds = depositAmount > 0

        if (!vaultHasFunds && !depositHasFunds) {
          console.log('[AutoClaim] Magic Actions: No funds available')
          continue
        }

        perConfirmedPayments++

        // If TEE has executed OR vault has funds, we can claim from vault
        // Otherwise, funds are still in deposit record waiting for TEE
        const canClaim = executed || vaultHasFunds
        const amount = vaultHasFunds ? BigInt(vaultInfo.lamports) : BigInt(depositAmount)

        console.log(`[AutoClaim] Magic Actions: Found payment!`)
        console.log(`  - Deposit: ${pubkey.toBase58()}`)
        console.log(`  - Vault: ${vaultPda.toBase58()}`)
        console.log(`  - Amount: ${Number(amount) / 1e9} SOL`)
        console.log(`  - TEE Executed: ${executed}`)
        console.log(`  - Can Claim: ${canClaim}`)

        // If TEE hasn't executed, track as delegated deposit (can be undelegated)
        if (!canClaim) {
          console.log('[AutoClaim] Magic Actions: Waiting for TEE execution - tracking as delegated')

          // Extract nonce and bump for undelegation
          const nonce = new Uint8Array(data.slice(PER_OFFSET_NONCE, PER_OFFSET_NONCE + 32))
          const bump = data[PER_OFFSET_BUMP]

          // Track delegated deposit
          setDelegatedDeposits(prev => {
            if (prev.some(d => d.depositAddress === pubkey.toBase58())) return prev
            return [...prev, {
              depositAddress: pubkey.toBase58(),
              vaultAddress: vaultPda.toBase58(),
              amount,
              stealthPubkey,
              nonce,
              bump,
              executed: false,
            }]
          })
          continue
        }

        // Use vault PDA for claiming (not deposit record)
        const vaultAddress = vaultPda.toBase58()

        // Check if new payment
        const isNew = !pendingClaims.some(c => c.vaultAddress === vaultAddress)

        if (isNew) {
          showPaymentReceived({
            signature: pubkey.toBase58(),
            amount,
            symbol: 'SOL',
          })

          setPendingClaims(prev => {
            if (prev.some(c => c.vaultAddress === vaultAddress)) return prev
            return [...prev, {
              vaultAddress,
              amount,
              sender: 'MAGIC_ACTIONS',
              announcementPda: pubkey.toBase58(),
              stealthPubkey,
              status: 'pending' as const,
            }]
          })
        }
      }

      console.log(`[AutoClaim] Magic Actions: ${discriminatorMatches} PER records, ${perConfirmedPayments} confirmed for us`)
      return perConfirmedPayments
    } catch (err) {
      console.error('[AutoClaim] Magic Actions scan error:', err)
      return 0
    }
  }, [connection, pendingClaims])

  // Main privacy scan
  const startPrivacyScan = useCallback(async () => {
    if (!publicKey || !connection || !signMessage) return
    if (isScanningRef.current) return

    isScanningRef.current = true
    setIsScanning(true)
    setError(null)

    try {
      console.log('[AutoClaim] Starting scan...')

      // Generate stealth keys if needed
      let keys = stealthKeys
      if (!keys) {
        console.log('[AutoClaim] Generating stealth keys...')
        try {
          keys = await generateStealthKeysFromSignature(signMessage)
          setStealthKeys(keys)
        } catch (err) {
          console.error('[AutoClaim] Failed to generate keys:', err)
          setError('Please sign to enable scanning')
          return
        }
      }

      // Scan Magic Actions (PER deposits)
      await scanMagicActions(keys)

      console.log('[AutoClaim] Scan complete')
      setLastScanTime(new Date())
    } catch (err) {
      console.error('[AutoClaim] Scan error:', err)
      setError(err instanceof Error ? err.message : 'Scan failed')
    } finally {
      isScanningRef.current = false
      setIsScanning(false)
    }
  }, [publicKey, connection, signMessage, stealthKeys, scanMagicActions])

  // Start scanning with interval
  const startScanning = useCallback(() => {
    if (scanIntervalRef.current) return

    startPrivacyScan()
    scanIntervalRef.current = setInterval(startPrivacyScan, SCAN_INTERVAL_MS)
  }, [startPrivacyScan])

  // Stop scanning
  const stopScanning = useCallback(() => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current)
      scanIntervalRef.current = null
    }
    setIsScanning(false)
  }, [])

  // Initialize when wallet connects
  useEffect(() => {
    if (!connected || !publicKey) {
      stopScanning()
      return
    }

    console.log('[AutoClaim] Wallet connected, starting scanner...')
    startScanning()

    return () => stopScanning()
  }, [connected, publicKey, startScanning, stopScanning])

  // Claim a single payment
  const claimSingle = useCallback(async (vaultAddress: string): Promise<boolean> => {
    if (!publicKey || !signTransaction) {
      setError('Wallet not connected')
      return false
    }

    const pendingClaim = pendingClaims.find(c => c.vaultAddress === vaultAddress)
    if (!pendingClaim || pendingClaim.status !== 'pending') {
      return pendingClaim?.status === 'claimed' || false
    }

    setPendingClaims(prev => prev.map(c =>
      c.vaultAddress === vaultAddress ? { ...c, status: 'claiming' as const } : c
    ))

    try {
      const vaultPda = new PublicKey(vaultAddress)
      const vaultInfo = await connection.getAccountInfo(vaultPda)

      if (!vaultInfo || vaultInfo.lamports === 0) {
        throw new Error('Vault is empty')
      }

      const amount = BigInt(vaultInfo.lamports)

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

      showClaimSuccess({
        signature,
        amount,
        symbol: 'SOL',
      })

      setPendingClaims(prev => prev.map(c =>
        c.vaultAddress === vaultAddress ? { ...c, status: 'claimed' as const } : c
      ))

      setClaimHistory(prev => [...prev, {
        signature,
        amount,
        timestamp: Date.now(),
        sender: pendingClaim.sender,
      }])

      return true
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Claim failed'

      const isAlreadyClaimed =
        errorMessage.includes('0x9') ||
        errorMessage.includes('Vault is empty') ||
        errorMessage.includes('InsufficientFunds')

      if (isAlreadyClaimed) {
        setPendingClaims(prev => prev.map(c =>
          c.vaultAddress === vaultAddress ? { ...c, status: 'claimed' as const } : c
        ))
        return true
      }

      console.error('[AutoClaim] Claim failed:', err)
      setError(errorMessage)

      setPendingClaims(prev => prev.map(c =>
        c.vaultAddress === vaultAddress ? { ...c, status: 'failed' as const } : c
      ))

      return false
    }
  }, [publicKey, signTransaction, connection, pendingClaims])

  // Claim all pending
  const claimAll = useCallback(async () => {
    const pending = pendingClaims.filter(c => c.status === 'pending')
    for (const claim of pending) {
      await claimSingle(claim.vaultAddress)
      await new Promise(r => setTimeout(r, 1000))
    }
  }, [pendingClaims, claimSingle])

  // Undelegate a single deposit to recover funds
  const undelegateDeposit = useCallback(async (depositAddress: string): Promise<boolean> => {
    if (!publicKey || !signTransaction) {
      setError('Wallet not connected')
      return false
    }

    const deposit = delegatedDeposits.find(d => d.depositAddress === depositAddress)
    if (!deposit) {
      setError('Deposit not found')
      return false
    }

    try {
      console.log('[AutoClaim] Undelegating deposit:', depositAddress)

      const depositPda = new PublicKey(depositAddress)

      // Derive delegation PDAs
      const [delegationRecord] = PublicKey.findProgramAddressSync(
        [Buffer.from('delegation'), depositPda.toBuffer()],
        DELEGATION_PROGRAM_ID
      )
      const [delegationMetadata] = PublicKey.findProgramAddressSync(
        [Buffer.from('delegation-metadata'), depositPda.toBuffer()],
        DELEGATION_PROGRAM_ID
      )
      const [delegateBuffer] = PublicKey.findProgramAddressSync(
        [Buffer.from('buffer'), depositPda.toBuffer()],
        PROGRAM_IDS.STEALTH
      )

      // Build undelegate instruction
      // Data: discriminator (1 byte = 0x30 for UNDELEGATE) + bump (1 byte)
      const data = Buffer.alloc(9)
      data.writeUInt8(0x30, 0) // UNDELEGATE discriminator
      data.writeUInt8(deposit.bump, 8)

      const tx = new Transaction()
      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }))
      tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50000 }))
      tx.add(
        new TransactionInstruction({
          keys: [
            { pubkey: publicKey, isSigner: true, isWritable: true },
            { pubkey: publicKey, isSigner: true, isWritable: false },
            { pubkey: depositPda, isSigner: false, isWritable: true },
            { pubkey: delegateBuffer, isSigner: false, isWritable: true },
            { pubkey: delegationRecord, isSigner: false, isWritable: true },
            { pubkey: delegationMetadata, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            { pubkey: DELEGATION_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: PROGRAM_IDS.STEALTH, isSigner: false, isWritable: false },
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

      console.log('[AutoClaim] Undelegate successful:', signature)

      // Remove from delegated deposits
      setDelegatedDeposits(prev => prev.filter(d => d.depositAddress !== depositAddress))

      // Show success toast
      showClaimSuccess({
        signature,
        amount: deposit.amount,
        symbol: 'SOL',
      })

      return true
    } catch (err) {
      console.error('[AutoClaim] Undelegate failed:', err)
      setError(err instanceof Error ? err.message : 'Undelegate failed')
      return false
    }
  }, [publicKey, signTransaction, connection, delegatedDeposits])

  // Undelegate all deposits
  const undelegateAll = useCallback(async () => {
    for (const deposit of delegatedDeposits) {
      await undelegateDeposit(deposit.depositAddress)
      await new Promise(r => setTimeout(r, 1000))
    }
  }, [delegatedDeposits, undelegateDeposit])

  // Auto-claim when payments detected
  useEffect(() => {
    const pendingCount = pendingClaims.filter(c => c.status === 'pending').length
    if (pendingCount > 0 && connected && publicKey) {
      console.log(`[AutoClaim] ${pendingCount} pending, auto-claiming...`)
      const timeout = setTimeout(claimAll, 2000)
      return () => clearTimeout(timeout)
    }
  }, [pendingClaims, connected, publicKey, claimAll])

  return {
    isScanning,
    pendingClaims,
    delegatedDeposits,
    totalPendingAmount,
    totalDelegatedAmount,
    claimHistory,
    startScanning,
    stopScanning,
    claimAll,
    claimSingle,
    undelegateDeposit,
    undelegateAll,
    lastScanTime,
    error,
  }
}

export default useAutoClaim
