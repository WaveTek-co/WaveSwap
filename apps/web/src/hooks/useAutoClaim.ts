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

// PER deposit record layout offsets
const PER_OFFSET_BUMP = 8
const PER_OFFSET_NONCE = 9
const PER_OFFSET_AMOUNT = 41
const PER_OFFSET_STEALTH = 81
const PER_OFFSET_EPHEMERAL = 113
const PER_OFFSET_VIEW_TAG = 145
const PER_OFFSET_EXECUTED = 147

// Scan interval (45 seconds)
const SCAN_INTERVAL_MS = 45000

// MagicBlock endpoints
const MAGICBLOCK_RPC = 'https://devnet.magicblock.app'

// Alternative RPC for devnet (to avoid rate limits)
const DEVNET_RPC = 'https://api.devnet.solana.com'

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
  processing?: boolean
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
  triggerMagicAction: (deposit: DelegatedDeposit) => Promise<boolean>
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
  const processedDepositsRef = useRef<Set<string>>(new Set())
  const keysGeneratedRef = useRef(false)

  // Devnet connection
  const connection = useMemo(() => {
    return new Connection(DEVNET_RPC, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000,
    })
  }, [])

  // MagicBlock rollup connection
  const rollupConnection = useMemo(() => {
    return new Connection(MAGICBLOCK_RPC, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 120000,
    })
  }, [])

  // Calculate totals
  const totalPendingAmount = useMemo(() => {
    return pendingClaims
      .filter(c => c.status === 'pending')
      .reduce((sum, c) => sum + c.amount, BigInt(0))
  }, [pendingClaims])

  const totalDelegatedAmount = useMemo(() => {
    return delegatedDeposits.reduce((sum, d) => sum + d.amount, BigInt(0))
  }, [delegatedDeposits])

  // MAGIC ACTION: Trigger PER to commit and release funds
  // This sends execute_per_transfer to the ROLLUP (privacy preserved)
  // The L1 commit only shows state changes, not who triggered
  const triggerMagicAction = useCallback(async (deposit: DelegatedDeposit): Promise<boolean> => {
    if (!publicKey || !signTransaction) {
      console.log('[MagicAction] No wallet connected')
      return false
    }

    // Skip if already processed
    if (processedDepositsRef.current.has(deposit.depositAddress)) {
      console.log('[MagicAction] Already processed:', deposit.depositAddress)
      return false
    }

    try {
      console.log('[MagicAction] Triggering PER commit for:', deposit.depositAddress)
      processedDepositsRef.current.add(deposit.depositAddress)

      const depositPda = new PublicKey(deposit.depositAddress)
      const [vaultPda, vaultBump] = deriveStealthVaultPda(deposit.stealthPubkey)

      // Build execute_per_transfer instruction
      const data = Buffer.alloc(34)
      data.writeUInt8(StealthDiscriminators.EXECUTE_PER_TRANSFER, 0)
      Buffer.from(deposit.nonce).copy(data, 1)
      data.writeUInt8(vaultBump, 33)

      const tx = new Transaction()
      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }))
      tx.add(
        new TransactionInstruction({
          keys: [
            { pubkey: publicKey, isSigner: true, isWritable: true },
            { pubkey: depositPda, isSigner: false, isWritable: true },
            { pubkey: vaultPda, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          programId: PROGRAM_IDS.STEALTH,
          data,
        })
      )

      tx.feePayer = publicKey

      // Send to ROLLUP - this preserves privacy
      // The rollup executes inside TEE, L1 only sees state diff
      console.log('[MagicAction] Getting blockhash from rollup...')
      const { blockhash } = await rollupConnection.getLatestBlockhash()
      tx.recentBlockhash = blockhash

      console.log('[MagicAction] Signing transaction...')
      const signedTx = await signTransaction(tx)

      console.log('[MagicAction] Sending to MagicBlock rollup...')
      const signature = await rollupConnection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: true,
      })

      console.log('[MagicAction] Transaction sent:', signature)

      // Wait for rollup confirmation
      await rollupConnection.confirmTransaction(signature, 'confirmed')
      console.log('[MagicAction] Rollup confirmed, waiting for L1 commit...')

      // Poll mainnet for vault
      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 2000))
        const vaultInfo = await connection.getAccountInfo(vaultPda)
        if (vaultInfo && vaultInfo.lamports > 0) {
          console.log('[MagicAction] Funds arrived in vault:', vaultInfo.lamports, 'lamports')

          // Remove from delegated, add to pending claims
          setDelegatedDeposits(prev => prev.filter(d => d.depositAddress !== deposit.depositAddress))
          setPendingClaims(prev => {
            if (prev.some(c => c.vaultAddress === vaultPda.toBase58())) return prev
            return [...prev, {
              vaultAddress: vaultPda.toBase58(),
              amount: BigInt(vaultInfo.lamports),
              sender: 'MAGIC_ACTIONS',
              announcementPda: deposit.depositAddress,
              stealthPubkey: deposit.stealthPubkey,
              status: 'pending' as const,
            }]
          })

          showPaymentReceived({
            signature,
            amount: BigInt(vaultInfo.lamports),
            symbol: 'SOL',
          })

          return true
        }
        console.log('[MagicAction] Waiting for L1 commit...', i + 1)
      }

      console.warn('[MagicAction] Vault not visible yet, may need more time')
      return false
    } catch (err: any) {
      console.error('[MagicAction] Failed:', err?.message || err)
      // Don't remove from processed - avoid retry loop
      return false
    }
  }, [publicKey, signTransaction, rollupConnection, connection])

  // Scan for PER deposit records
  const scanMagicActions = useCallback(async (keys: StealthKeyPair): Promise<number> => {
    console.log('[AutoClaim] Scanning for payments...')

    try {
      // Check stealth program for executed deposits (funds in vault)
      const stealthAccounts = await connection.getProgramAccounts(PROGRAM_IDS.STEALTH, {
        filters: [{ dataSize: PER_DEPOSIT_SIZE }],
      })

      console.log(`[AutoClaim] Found ${stealthAccounts.length} stealth PER records`)

      // Also check delegation program for pending deposits
      let delegationAccounts: { pubkey: PublicKey; account: any }[] = []
      try {
        delegationAccounts = await connection.getProgramAccounts(DELEGATION_PROGRAM_ID, {
          filters: [{ dataSize: PER_DEPOSIT_SIZE }],
        })
        console.log(`[AutoClaim] Found ${delegationAccounts.length} delegated PER records`)
      } catch (err) {
        console.warn('[AutoClaim] Could not scan delegation program')
      }

      const allAccounts = [...stealthAccounts, ...delegationAccounts]
      let foundCount = 0

      for (const { pubkey, account } of allAccounts) {
        const data = account.data

        // Check discriminator
        const discriminator = data.slice(0, 8).toString()
        if (discriminator !== PER_DEPOSIT_DISCRIMINATOR) continue

        // Extract view tag and ephemeral pubkey
        const ephemeralPubkey = new Uint8Array(data.slice(PER_OFFSET_EPHEMERAL, PER_OFFSET_EPHEMERAL + 32))
        const viewTag = data[PER_OFFSET_VIEW_TAG]

        // Fast view tag check
        if (!checkViewTag(keys.viewPrivkey, ephemeralPubkey, viewTag)) continue

        // Full verification
        const stealthPubkey = new Uint8Array(data.slice(PER_OFFSET_STEALTH, PER_OFFSET_STEALTH + 32))
        if (!isPaymentForUs(keys, ephemeralPubkey, viewTag, stealthPubkey)) continue

        foundCount++
        console.log('[AutoClaim] Found payment for us:', pubkey.toBase58())

        const executed = data[PER_OFFSET_EXECUTED] === 1
        const [vaultPda] = deriveStealthVaultPda(stealthPubkey)
        const vaultInfo = await connection.getAccountInfo(vaultPda)
        const vaultHasFunds = vaultInfo && vaultInfo.lamports > 0

        const nonce = new Uint8Array(data.slice(PER_OFFSET_NONCE, PER_OFFSET_NONCE + 32))
        const bump = data[PER_OFFSET_BUMP]
        const depositAmount = account.lamports - 1001920 // subtract rent

        const owner = account.owner.toBase58()
        const isDelegated = owner === DELEGATION_PROGRAM_ID.toBase58()

        console.log(`  Executed: ${executed}, Vault has funds: ${vaultHasFunds}, Delegated: ${isDelegated}`)

        if (vaultHasFunds) {
          // Funds in vault - ready to claim
          const vaultAddress = vaultPda.toBase58()
          if (!pendingClaims.some(c => c.vaultAddress === vaultAddress)) {
            setPendingClaims(prev => {
              if (prev.some(c => c.vaultAddress === vaultAddress)) return prev
              return [...prev, {
                vaultAddress,
                amount: BigInt(vaultInfo.lamports),
                sender: 'MAGIC_ACTIONS',
                announcementPda: pubkey.toBase58(),
                stealthPubkey,
                status: 'pending' as const,
              }]
            })
          }
        } else if (isDelegated && depositAmount > 0) {
          // Funds still in delegated deposit - needs Magic Action trigger
          if (!delegatedDeposits.some(d => d.depositAddress === pubkey.toBase58())) {
            setDelegatedDeposits(prev => {
              if (prev.some(d => d.depositAddress === pubkey.toBase58())) return prev
              return [...prev, {
                depositAddress: pubkey.toBase58(),
                vaultAddress: vaultPda.toBase58(),
                amount: BigInt(depositAmount),
                stealthPubkey,
                nonce,
                bump,
                executed: false,
              }]
            })
          }
        }
      }

      console.log(`[AutoClaim] Found ${foundCount} payments for us`)
      return foundCount
    } catch (err) {
      console.error('[AutoClaim] Scan error:', err)
      return 0
    }
  }, [connection, pendingClaims, delegatedDeposits])

  // Generate stealth keys (one-time signature)
  const ensureStealthKeys = useCallback(async (): Promise<StealthKeyPair | null> => {
    if (stealthKeys) return stealthKeys
    if (!signMessage) return null
    if (keysGeneratedRef.current) return null

    try {
      console.log('[AutoClaim] Generating stealth keys (one-time)...')
      keysGeneratedRef.current = true
      const keys = await generateStealthKeysFromSignature(signMessage)
      setStealthKeys(keys)
      console.log('[AutoClaim] Stealth keys generated')
      return keys
    } catch (err) {
      console.error('[AutoClaim] Failed to generate keys:', err)
      keysGeneratedRef.current = false
      return null
    }
  }, [signMessage, stealthKeys])

  // Main scan function
  const runScan = useCallback(async () => {
    if (!publicKey || !connected) return
    if (isScanningRef.current) return

    isScanningRef.current = true
    setIsScanning(true)
    setError(null)

    try {
      const keys = await ensureStealthKeys()
      if (!keys) {
        console.log('[AutoClaim] No stealth keys, skipping scan')
        return
      }

      await scanMagicActions(keys)
      setLastScanTime(new Date())
    } catch (err) {
      console.error('[AutoClaim] Scan error:', err)
    } finally {
      isScanningRef.current = false
      setIsScanning(false)
    }
  }, [publicKey, connected, ensureStealthKeys, scanMagicActions])

  // Start/stop scanning
  const startScanning = useCallback(() => {
    if (scanIntervalRef.current) return
    runScan()
    scanIntervalRef.current = setInterval(runScan, SCAN_INTERVAL_MS)
  }, [runScan])

  const stopScanning = useCallback(() => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current)
      scanIntervalRef.current = null
    }
  }, [])

  // Claim single payment from vault
  const claimSingle = useCallback(async (vaultAddress: string): Promise<boolean> => {
    if (!publicKey || !signTransaction) return false

    const claim = pendingClaims.find(c => c.vaultAddress === vaultAddress)
    if (!claim || claim.status !== 'pending') return false

    setPendingClaims(prev => prev.map(c =>
      c.vaultAddress === vaultAddress ? { ...c, status: 'claiming' as const } : c
    ))

    try {
      const vaultPda = new PublicKey(vaultAddress)
      const vaultInfo = await connection.getAccountInfo(vaultPda)
      if (!vaultInfo || vaultInfo.lamports === 0) {
        throw new Error('Vault is empty')
      }

      const data = Buffer.alloc(33)
      data.writeUInt8(StealthDiscriminators.CLAIM_STEALTH_PAYMENT, 0)
      Buffer.from(claim.stealthPubkey).copy(data, 1)

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

      console.log('[AutoClaim] Claimed:', signature)

      showClaimSuccess({
        signature,
        amount: BigInt(vaultInfo.lamports),
        symbol: 'SOL',
      })

      setPendingClaims(prev => prev.map(c =>
        c.vaultAddress === vaultAddress ? { ...c, status: 'claimed' as const } : c
      ))

      setClaimHistory(prev => [...prev, {
        signature,
        amount: BigInt(vaultInfo.lamports),
        timestamp: Date.now(),
      }])

      return true
    } catch (err: any) {
      console.error('[AutoClaim] Claim failed:', err)
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
      await new Promise(r => setTimeout(r, 500))
    }
  }, [pendingClaims, claimSingle])

  // Auto-start scanning when wallet connects
  useEffect(() => {
    if (connected && publicKey) {
      console.log('[AutoClaim] Wallet connected, starting scanner...')
      startScanning()
    } else {
      stopScanning()
      processedDepositsRef.current.clear()
      keysGeneratedRef.current = false
    }
    return () => stopScanning()
  }, [connected, publicKey, startScanning, stopScanning])

  // AUTO-TRIGGER Magic Actions for delegated deposits
  // This is the key: when we find delegated deposits, trigger PER commit
  useEffect(() => {
    if (!connected || !publicKey || delegatedDeposits.length === 0) return

    const triggerAll = async () => {
      for (const deposit of delegatedDeposits) {
        if (processedDepositsRef.current.has(deposit.depositAddress)) continue

        console.log('[AutoClaim] Auto-triggering Magic Action for:', deposit.depositAddress)
        await triggerMagicAction(deposit)
        await new Promise(r => setTimeout(r, 1000))
      }
    }

    // Delay to let UI settle
    const timeout = setTimeout(triggerAll, 2000)
    return () => clearTimeout(timeout)
  }, [delegatedDeposits, connected, publicKey, triggerMagicAction])

  // Auto-claim from vaults with funds
  useEffect(() => {
    const pendingCount = pendingClaims.filter(c => c.status === 'pending').length
    if (pendingCount > 0 && connected && publicKey) {
      console.log(`[AutoClaim] ${pendingCount} ready to claim, triggering auto-claim...`)
      const timeout = setTimeout(claimAll, 3000)
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
    triggerMagicAction,
    lastScanTime,
    error,
  }
}

export default useAutoClaim
