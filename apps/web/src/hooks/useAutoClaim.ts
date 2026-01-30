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

// MagicBlock Magic Router - automatically routes to correct ephemeral rollup
const MAGICBLOCK_RPC = 'https://devnet-router.magicblock.app'

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
  // Primary: execute on rollup (privacy-preserving)
  executePerTransfer: (deposit: DelegatedDeposit) => Promise<boolean>
  executeAllOnRollup: () => Promise<void>
  // Fallback: undelegate to mainnet then execute
  undelegateAndExecute: (deposit: DelegatedDeposit) => Promise<boolean>
  undelegateAndClaimAll: () => Promise<void>
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


  // MagicBlock rollup connection for delegated accounts
  const rollupConnection = useMemo(() => {
    return new Connection(MAGICBLOCK_RPC, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 120000, // 2 minutes for rollup
    })
  }, [])

  // Execute PER transfer on rollup - moves funds from deposit to stealth vault
  // PRIVACY-PRESERVING: Executes inside MagicBlock TEE, then commits to mainnet
  // Flow: rollup executes → state commits to L1 → funds in vault → auto-claim
  const executePerTransfer = useCallback(async (deposit: DelegatedDeposit): Promise<boolean> => {
    if (!publicKey || !signTransaction) {
      setError('Wallet not connected')
      return false
    }

    try {
      console.log('[AutoClaim] Executing PER transfer...')
      console.log('  Deposit:', deposit.depositAddress)

      // Check current owner to determine if delegated
      const depositPda = new PublicKey(deposit.depositAddress)
      const accountInfo = await connection.getAccountInfo(depositPda)

      if (!accountInfo) {
        console.error('[AutoClaim] Deposit account not found')
        return false
      }

      const owner = accountInfo.owner.toBase58()
      const isDelegated = owner === DELEGATION_PROGRAM_ID.toBase58()

      console.log('  Owner:', owner)
      console.log('  Delegated:', isDelegated)

      // Use appropriate RPC based on delegation status
      const targetConnection = isDelegated ? rollupConnection : connection
      const targetName = isDelegated ? 'MagicBlock rollup' : 'Solana mainnet'

      console.log(`  Target: ${targetName}`)

      const [vaultPda, vaultBump] = deriveStealthVaultPda(deposit.stealthPubkey)

      console.log('  Vault:', vaultPda.toBase58())
      console.log('  Amount:', Number(deposit.amount) / 1e9, 'SOL')

      // Build execute_per_transfer instruction
      // Data: discriminator (1 byte) + nonce (32 bytes) + vault_bump (1 byte)
      const data = Buffer.alloc(34)
      data.writeUInt8(StealthDiscriminators.EXECUTE_PER_TRANSFER, 0)
      Buffer.from(deposit.nonce).copy(data, 1)
      data.writeUInt8(vaultBump, 33)

      const tx = new Transaction()
      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }))
      tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50000 }))
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

      // Get blockhash from target connection
      console.log(`[AutoClaim] Getting blockhash from ${targetName}...`)
      const { blockhash } = await targetConnection.getLatestBlockhash()
      tx.recentBlockhash = blockhash

      console.log('[AutoClaim] Signing transaction...')
      const signedTx = await signTransaction(tx)

      console.log(`[AutoClaim] Sending to ${targetName}...`)

      // Send to target connection
      const signature = await targetConnection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: true,
        maxRetries: 3,
      })
      console.log('[AutoClaim] Transaction sent:', signature)

      // Wait for confirmation
      await targetConnection.confirmTransaction(signature, 'confirmed')
      console.log('[AutoClaim] Transaction confirmed!')

      // If delegated, wait for L1 commit
      if (isDelegated) {
        // Wait for state to commit to mainnet (rollup auto-commits)
        // Poll mainnet for vault balance
        let vaultReady = false
        for (let i = 0; i < 10; i++) {
          await new Promise(r => setTimeout(r, 2000))
          const vaultInfo = await connection.getAccountInfo(vaultPda)
          if (vaultInfo && vaultInfo.lamports > 0) {
            vaultReady = true
            console.log('[AutoClaim] Vault funded on mainnet:', vaultInfo.lamports, 'lamports')
            break
          }
          console.log('[AutoClaim] Waiting for L1 commit...', i + 1)
        }

        if (!vaultReady) {
          console.warn('[AutoClaim] Vault not yet visible on mainnet, may need more time')
        }
      }

      // Remove from delegated deposits
      setDelegatedDeposits(prev => prev.filter(d => d.depositAddress !== deposit.depositAddress))

      // Add to pending claims (claimable from vault on mainnet)
      setPendingClaims(prev => {
        if (prev.some(c => c.vaultAddress === vaultPda.toBase58())) return prev
        return [...prev, {
          vaultAddress: vaultPda.toBase58(),
          amount: deposit.amount,
          sender: 'MAGIC_ACTIONS',
          announcementPda: deposit.depositAddress,
          stealthPubkey: deposit.stealthPubkey,
          status: 'pending' as const,
        }]
      })

      return true
    } catch (err) {
      console.error('[AutoClaim] Execute PER transfer failed:', err)
      setError(err instanceof Error ? err.message : 'Execute failed')
      return false
    }
  }, [publicKey, signTransaction, rollupConnection, connection])

  // Fallback: Undelegate on rollup then execute on mainnet
  // Used when direct rollup execution fails
  // Note: This still requires rollup access (delegated accounts can only be undelegated from rollup)
  const undelegateAndExecute = useCallback(async (deposit: DelegatedDeposit): Promise<boolean> => {
    if (!publicKey || !signTransaction) {
      setError('Wallet not connected')
      return false
    }

    try {
      console.log('[AutoClaim] Fallback: Undelegate on rollup, then execute...')
      console.log('  Deposit:', deposit.depositAddress)

      const depositPda = new PublicKey(deposit.depositAddress)
      const [vaultPda, vaultBump] = deriveStealthVaultPda(deposit.stealthPubkey)

      // MagicBlock Magic Context and Program (for undelegate CPI)
      const MAGIC_CONTEXT = new PublicKey('MagicContext1111111111111111111111111111111')
      const MAGIC_PROGRAM = new PublicKey('Magic11111111111111111111111111111111111111')

      // Step 1: Undelegate on rollup (0x14 = UNDELEGATE_PER_DEPOSIT)
      // Data: nonce (32 bytes) + bump (1 byte)
      const undelegateData = Buffer.alloc(34)
      undelegateData.writeUInt8(0x14, 0) // UNDELEGATE_PER_DEPOSIT discriminator
      Buffer.from(deposit.nonce).copy(undelegateData, 1)
      undelegateData.writeUInt8(deposit.bump, 33)

      const undelegateTx = new Transaction()
      undelegateTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }))
      undelegateTx.add(
        new TransactionInstruction({
          keys: [
            { pubkey: publicKey, isSigner: true, isWritable: true },
            { pubkey: depositPda, isSigner: false, isWritable: true },
            { pubkey: MAGIC_CONTEXT, isSigner: false, isWritable: false },
            { pubkey: MAGIC_PROGRAM, isSigner: false, isWritable: false },
          ],
          programId: PROGRAM_IDS.STEALTH,
          data: undelegateData,
        })
      )

      undelegateTx.feePayer = publicKey
      undelegateTx.recentBlockhash = (await rollupConnection.getLatestBlockhash()).blockhash

      const signedUndelegateTx = await signTransaction(undelegateTx)
      const undelegateSig = await rollupConnection.sendRawTransaction(signedUndelegateTx.serialize(), {
        skipPreflight: true,
      })
      await rollupConnection.confirmTransaction(undelegateSig, 'confirmed')

      console.log('[AutoClaim] Undelegate confirmed on rollup:', undelegateSig)

      // Wait for state to commit to mainnet
      console.log('[AutoClaim] Waiting for L1 commit...')
      await new Promise(r => setTimeout(r, 10000))

      // Step 2: Execute transfer on mainnet (account is now undelegated)
      const executeData = Buffer.alloc(34)
      executeData.writeUInt8(StealthDiscriminators.EXECUTE_PER_TRANSFER, 0)
      Buffer.from(deposit.nonce).copy(executeData, 1)
      executeData.writeUInt8(vaultBump, 33)

      const executeTx = new Transaction()
      executeTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }))
      executeTx.add(
        new TransactionInstruction({
          keys: [
            { pubkey: publicKey, isSigner: true, isWritable: true },
            { pubkey: depositPda, isSigner: false, isWritable: true },
            { pubkey: vaultPda, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          programId: PROGRAM_IDS.STEALTH,
          data: executeData,
        })
      )

      executeTx.feePayer = publicKey
      executeTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash

      const signedExecuteTx = await signTransaction(executeTx)
      const executeSig = await connection.sendRawTransaction(signedExecuteTx.serialize())
      await connection.confirmTransaction(executeSig, 'confirmed')

      console.log('[AutoClaim] Execute successful on mainnet:', executeSig)

      // Remove from delegated deposits
      setDelegatedDeposits(prev => prev.filter(d => d.depositAddress !== deposit.depositAddress))

      // Add to pending claims
      setPendingClaims(prev => {
        if (prev.some(c => c.vaultAddress === vaultPda.toBase58())) return prev
        return [...prev, {
          vaultAddress: vaultPda.toBase58(),
          amount: deposit.amount,
          sender: 'MAGIC_ACTIONS',
          announcementPda: deposit.depositAddress,
          stealthPubkey: deposit.stealthPubkey,
          status: 'pending' as const,
        }]
      })

      showPaymentReceived({
        signature: executeSig,
        amount: deposit.amount,
        symbol: 'SOL',
      })

      return true
    } catch (err) {
      console.error('[AutoClaim] Undelegate + execute failed:', err)
      setError(err instanceof Error ? err.message : 'Operation failed')
      return false
    }
  }, [publicKey, signTransaction, connection, rollupConnection])

  // Process all delegated deposits via rollup (preferred) or undelegate fallback
  const executeAllOnRollup = useCallback(async () => {
    console.log('[AutoClaim] Processing all delegated deposits via rollup...')

    for (const deposit of delegatedDeposits) {
      // Try rollup execution first (privacy-preserving)
      let success = await executePerTransfer(deposit)

      // If rollup fails, fall back to undelegate + execute on mainnet
      if (!success) {
        console.log('[AutoClaim] Rollup failed, trying undelegate fallback...')
        success = await undelegateAndExecute(deposit)
      }

      if (success) {
        await new Promise(r => setTimeout(r, 1000))
      }
    }

    // Wait for L1 commits, then claim all pending
    await new Promise(r => setTimeout(r, 5000))
    await claimAll()
  }, [delegatedDeposits, executePerTransfer, undelegateAndExecute, claimAll])

  // Alias for backward compatibility
  const undelegateAndClaimAll = executeAllOnRollup

  // Track processing state to prevent duplicate triggers
  const processingRef = useRef<Set<string>>(new Set())

  // Auto-execute PER transfers on rollup when delegated deposits are found
  // This is the magic: scanner finds deposit → triggers rollup → funds appear in vault
  useEffect(() => {
    if (!connected || !publicKey || delegatedDeposits.length === 0) return

    const processDeposits = async () => {
      for (const deposit of delegatedDeposits) {
        // Skip if already processing
        if (processingRef.current.has(deposit.depositAddress)) continue
        processingRef.current.add(deposit.depositAddress)

        console.log(`[AutoClaim] Auto-executing PER transfer for ${deposit.depositAddress}`)

        try {
          const success = await executePerTransfer(deposit)
          if (success) {
            console.log('[AutoClaim] PER transfer executed, funds moving to vault...')
          }
        } catch (err) {
          console.error('[AutoClaim] Auto-execute failed:', err)
        } finally {
          processingRef.current.delete(deposit.depositAddress)
        }

        // Small delay between deposits
        await new Promise(r => setTimeout(r, 1000))
      }
    }

    // Delay to allow UI to settle
    const timeout = setTimeout(processDeposits, 3000)
    return () => clearTimeout(timeout)
  }, [delegatedDeposits, connected, publicKey, executePerTransfer])

  // Auto-claim pending payments from vaults (after PER transfer commits to L1)
  useEffect(() => {
    const pendingCount = pendingClaims.filter(c => c.status === 'pending').length

    if (pendingCount > 0 && connected && publicKey) {
      console.log(`[AutoClaim] ${pendingCount} pending claims - auto-claiming from vaults...`)
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
    executePerTransfer,
    executeAllOnRollup,
    undelegateAndExecute,
    undelegateAndClaimAll,
    lastScanTime,
    error,
  }
}

export default useAutoClaim
