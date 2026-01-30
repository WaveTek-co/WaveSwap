'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram, ComputeBudgetProgram, SYSVAR_INSTRUCTIONS_PUBKEY } from '@solana/web3.js'
import { sha3_256 } from 'js-sha3'
import { useWallet } from './useWalletAdapter'
import {
  PROGRAM_IDS,
  StealthDiscriminators,
  deriveStealthVaultPda,
  deriveTestMixerPoolPda,
  deriveDepositRecordPda,
  deriveAnnouncementPdaFromNonce,
  generateStealthKeysFromSignature,
  StealthKeyPair,
} from '@/lib/stealth'
import { isPaymentForUs, checkViewTag } from '@/lib/stealth/scanner'
import { showPaymentReceived, showClaimSuccess } from '@/components/ui/TransactionToast'

// Mixer deposit record constants (shared pool for privacy)
const MIXER_DEPOSIT_DISCRIMINATOR = 'MIXDEPOT'
const MIXER_DEPOSIT_SIZE = 130

// Deposit record layout offsets
const DEPOSIT_OFFSET_BUMP = 8
const DEPOSIT_OFFSET_NONCE = 9
const DEPOSIT_OFFSET_AMOUNT = 41
const DEPOSIT_OFFSET_DEPOSIT_SLOT = 49
const DEPOSIT_OFFSET_ANNOUNCEMENT_PDA = 57
const DEPOSIT_OFFSET_VAULT_PDA = 89
const DEPOSIT_OFFSET_IS_EXECUTED = 121

// Announcement layout offsets (for reading ephemeral pubkey and view tag)
// Layout: discriminator(8) + bump(1) + timestamp(8) + ephemeral_pubkey(32) + pool_nonce(32) + stealth_pubkey(32) + vault_pda(32) + view_tag(1) + ...
const ANN_OFFSET_EPHEMERAL_PUBKEY = 17  // 8 + 1 + 8
const ANN_OFFSET_STEALTH_PUBKEY = 81    // 17 + 32 + 32
const ANN_OFFSET_VIEW_TAG = 145         // 81 + 32 + 32

// TEE proof constants (for devnet - commitment verified, signature skipped)
const TEE_PROOF_SIZE = 168
const EXPECTED_ENCLAVE_MEASUREMENT = new Uint8Array([
  0x4f, 0x63, 0x65, 0x61, 0x6e, 0x56, 0x61, 0x75,
  0x6c, 0x74, 0x54, 0x45, 0x45, 0x76, 0x31, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01,
])

// Scan interval (30 seconds)
const SCAN_INTERVAL_MS = 30000

// Devnet RPC
const DEVNET_RPC = 'https://api.devnet.solana.com'

export interface PendingClaim {
  vaultAddress: string
  amount: bigint
  sender: string
  announcementPda: string
  stealthPubkey: Uint8Array
  status: 'pending' | 'claiming' | 'claimed' | 'failed'
}

export interface MixerDeposit {
  depositAddress: string
  vaultAddress: string
  announcementAddress: string
  amount: bigint
  nonce: Uint8Array
  bump: number
  stealthPubkey: Uint8Array
  executed: boolean
  processing?: boolean
}

export interface UseAutoClaimReturn {
  isScanning: boolean
  pendingClaims: PendingClaim[]
  mixerDeposits: MixerDeposit[]
  totalPendingAmount: bigint
  totalMixerAmount: bigint
  claimHistory: { signature: string; amount: bigint; timestamp: number; sender?: string }[]
  startScanning: () => void
  stopScanning: () => void
  claimAll: () => Promise<void>
  claimSingle: (vaultAddress: string) => Promise<boolean>
  triggerMixerTransfer: (deposit: MixerDeposit) => Promise<boolean>
  lastScanTime: Date | null
  error: string | null
}

// Generate devnet TEE proof (commitment + placeholder signature + measurement)
function createDevnetTeeProof(announcement: Uint8Array, vault: Uint8Array): Uint8Array {
  const proof = new Uint8Array(TEE_PROOF_SIZE)

  // Compute commitment: SHA3-256("OceanVault:TEE:Commitment:" || announcement || vault)
  const commitmentInput = Buffer.concat([
    Buffer.from("OceanVault:TEE:Commitment:"),
    Buffer.from(announcement),
    Buffer.from(vault),
  ])
  const commitment = new Uint8Array(Buffer.from(sha3_256(commitmentInput), "hex"))
  proof.set(commitment, 0)

  // Placeholder signature (64 bytes) - not verified on devnet
  proof.fill(0x42, 32, 96)

  // Enclave measurement (32 bytes)
  proof.set(EXPECTED_ENCLAVE_MEASUREMENT, 96)

  // Timestamp (8 bytes)
  const timestamp = BigInt(Date.now())
  const timestampBytes = new Uint8Array(8)
  for (let i = 0; i < 8; i++) {
    timestampBytes[i] = Number((timestamp >> BigInt(i * 8)) & BigInt(0xff))
  }
  proof.set(timestampBytes, 128)

  // Reserved (32 bytes)
  proof.fill(0, 136, 168)

  return proof
}

export function useAutoClaim(): UseAutoClaimReturn {
  const { publicKey, signTransaction, signMessage, connected } = useWallet()

  const [isScanning, setIsScanning] = useState(false)
  const [pendingClaims, setPendingClaims] = useState<PendingClaim[]>([])
  const [mixerDeposits, setMixerDeposits] = useState<MixerDeposit[]>([])
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

  // Calculate totals
  const totalPendingAmount = useMemo(() => {
    return pendingClaims
      .filter(c => c.status === 'pending')
      .reduce((sum, c) => sum + c.amount, BigInt(0))
  }, [pendingClaims])

  const totalMixerAmount = useMemo(() => {
    return mixerDeposits.reduce((sum, d) => sum + d.amount, BigInt(0))
  }, [mixerDeposits])

  // MAGIC ACTION: Execute mixer transfer to release funds to vault
  // This is the privacy-preserving transfer from shared pool -> individual vault
  // The TEE proof authorizes the transfer without revealing the sender
  const triggerMixerTransfer = useCallback(async (deposit: MixerDeposit): Promise<boolean> => {
    if (!publicKey || !signTransaction) {
      console.log('[MixerTransfer] No wallet connected')
      return false
    }

    // Skip if already processed
    if (processedDepositsRef.current.has(deposit.depositAddress)) {
      console.log('[MixerTransfer] Already processed:', deposit.depositAddress)
      return false
    }

    try {
      console.log('[MixerTransfer] Executing mixer transfer for:', deposit.depositAddress)
      processedDepositsRef.current.add(deposit.depositAddress)

      const [mixerPoolPda] = deriveTestMixerPoolPda()
      const depositRecordPda = new PublicKey(deposit.depositAddress)
      const announcementPda = new PublicKey(deposit.announcementAddress)
      const [vaultPda, vaultBump] = deriveStealthVaultPda(deposit.stealthPubkey)
      const [, announcementBump] = deriveAnnouncementPdaFromNonce(deposit.nonce)

      // Generate TEE proof (devnet - commitment verified, signature skipped)
      const teeProof = createDevnetTeeProof(announcementPda.toBytes(), vaultPda.toBytes())

      // Build execute_test_mixer_transfer instruction
      // Data layout: discriminator(1) + nonce(32) + stealth_pubkey(32) + announcement_bump(1) + vault_bump(1) + tee_proof(168) = 235 bytes
      const data = Buffer.alloc(235)
      let offset = 0
      data[offset++] = StealthDiscriminators.EXECUTE_TEST_MIXER_TRANSFER
      Buffer.from(deposit.nonce).copy(data, offset)
      offset += 32
      Buffer.from(deposit.stealthPubkey).copy(data, offset)
      offset += 32
      data[offset++] = announcementBump
      data[offset++] = vaultBump
      Buffer.from(teeProof).copy(data, offset)

      const tx = new Transaction()
      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }))
      tx.add(
        new TransactionInstruction({
          keys: [
            { pubkey: publicKey, isSigner: true, isWritable: true },
            { pubkey: mixerPoolPda, isSigner: false, isWritable: true },
            { pubkey: depositRecordPda, isSigner: false, isWritable: true },
            { pubkey: vaultPda, isSigner: false, isWritable: true },
            { pubkey: announcementPda, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
          ],
          programId: PROGRAM_IDS.STEALTH,
          data,
        })
      )

      tx.feePayer = publicKey
      const { blockhash } = await connection.getLatestBlockhash()
      tx.recentBlockhash = blockhash

      console.log('[MixerTransfer] Signing transaction...')
      const signedTx = await signTransaction(tx)

      console.log('[MixerTransfer] Sending to mainnet...')
      const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
      })

      console.log('[MixerTransfer] Transaction sent:', signature)
      await connection.confirmTransaction(signature, 'confirmed')
      console.log('[MixerTransfer] Confirmed!')

      // Check vault balance
      const vaultInfo = await connection.getAccountInfo(vaultPda)
      if (vaultInfo && vaultInfo.lamports > 0) {
        console.log('[MixerTransfer] Funds arrived in vault:', vaultInfo.lamports, 'lamports')

        // Remove from mixer deposits, add to pending claims
        setMixerDeposits(prev => prev.filter(d => d.depositAddress !== deposit.depositAddress))
        setPendingClaims(prev => {
          if (prev.some(c => c.vaultAddress === vaultPda.toBase58())) return prev
          return [...prev, {
            vaultAddress: vaultPda.toBase58(),
            amount: BigInt(vaultInfo.lamports),
            sender: 'MIXER_POOL',
            announcementPda: deposit.announcementAddress,
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

      console.warn('[MixerTransfer] Vault empty after transfer - unexpected')
      return false
    } catch (err: any) {
      console.error('[MixerTransfer] Failed:', err?.message || err)
      // Don't remove from processed - avoid retry loop
      return false
    }
  }, [publicKey, signTransaction, connection])

  // Scan for mixer deposit records
  const scanMixerDeposits = useCallback(async (keys: StealthKeyPair): Promise<number> => {
    console.log('[AutoClaim] Scanning for mixer deposits...')

    try {
      // Fetch all deposit records owned by stealth program
      const depositAccounts = await connection.getProgramAccounts(PROGRAM_IDS.STEALTH, {
        filters: [{ dataSize: MIXER_DEPOSIT_SIZE }],
      })

      console.log(`[AutoClaim] Found ${depositAccounts.length} deposit records`)

      let foundCount = 0

      for (const { pubkey, account } of depositAccounts) {
        const data = account.data

        // Check discriminator
        const discriminator = data.slice(0, 8).toString()
        if (discriminator !== MIXER_DEPOSIT_DISCRIMINATOR) continue

        // Check if already executed
        const isExecuted = data[DEPOSIT_OFFSET_IS_EXECUTED] === 1
        if (isExecuted) continue

        // Extract announcement PDA from deposit record
        const announcementBytes = data.slice(DEPOSIT_OFFSET_ANNOUNCEMENT_PDA, DEPOSIT_OFFSET_ANNOUNCEMENT_PDA + 32)
        const announcementPda = new PublicKey(announcementBytes)

        // Fetch announcement to get ephemeral pubkey and view tag
        const announcementInfo = await connection.getAccountInfo(announcementPda)
        if (!announcementInfo || announcementInfo.data.length < 110) {
          console.log('[AutoClaim] Announcement not found for deposit:', pubkey.toBase58())
          continue
        }

        const annData = announcementInfo.data
        const ephemeralPubkey = new Uint8Array(annData.slice(ANN_OFFSET_EPHEMERAL_PUBKEY, ANN_OFFSET_EPHEMERAL_PUBKEY + 32))
        const viewTag = annData[ANN_OFFSET_VIEW_TAG]

        // Fast view tag check
        if (!checkViewTag(keys.viewPrivkey, ephemeralPubkey, viewTag)) continue

        // Extract stealth pubkey for full verification
        const stealthPubkey = new Uint8Array(annData.slice(ANN_OFFSET_STEALTH_PUBKEY, ANN_OFFSET_STEALTH_PUBKEY + 32))

        // Full verification
        if (!isPaymentForUs(keys, ephemeralPubkey, viewTag, stealthPubkey)) continue

        foundCount++
        console.log('[AutoClaim] Found mixer deposit for us:', pubkey.toBase58())

        // Extract deposit details
        const nonce = new Uint8Array(data.slice(DEPOSIT_OFFSET_NONCE, DEPOSIT_OFFSET_NONCE + 32))
        const bump = data[DEPOSIT_OFFSET_BUMP]

        // Read amount as little-endian u64
        let amount = BigInt(0)
        for (let i = 0; i < 8; i++) {
          amount |= BigInt(data[DEPOSIT_OFFSET_AMOUNT + i]) << BigInt(i * 8)
        }

        const vaultBytes = data.slice(DEPOSIT_OFFSET_VAULT_PDA, DEPOSIT_OFFSET_VAULT_PDA + 32)
        const vaultPda = new PublicKey(vaultBytes)

        // Check if vault already has funds
        const vaultInfo = await connection.getAccountInfo(vaultPda)
        const vaultHasFunds = vaultInfo && vaultInfo.lamports > 0

        console.log(`  Deposit amount: ${amount} lamports, Vault has funds: ${vaultHasFunds}`)

        if (vaultHasFunds) {
          // Funds already in vault - ready to claim
          const vaultAddress = vaultPda.toBase58()
          if (!pendingClaims.some(c => c.vaultAddress === vaultAddress)) {
            setPendingClaims(prev => {
              if (prev.some(c => c.vaultAddress === vaultAddress)) return prev
              return [...prev, {
                vaultAddress,
                amount: BigInt(vaultInfo.lamports),
                sender: 'MIXER_POOL',
                announcementPda: announcementPda.toBase58(),
                stealthPubkey,
                status: 'pending' as const,
              }]
            })
          }
        } else if (amount > 0n) {
          // Deposit exists but vault empty - needs mixer transfer
          if (!mixerDeposits.some(d => d.depositAddress === pubkey.toBase58())) {
            setMixerDeposits(prev => {
              if (prev.some(d => d.depositAddress === pubkey.toBase58())) return prev
              return [...prev, {
                depositAddress: pubkey.toBase58(),
                vaultAddress: vaultPda.toBase58(),
                announcementAddress: announcementPda.toBase58(),
                amount,
                nonce,
                bump,
                stealthPubkey,
                executed: false,
              }]
            })
          }
        }
      }

      console.log(`[AutoClaim] Found ${foundCount} deposits for us`)
      return foundCount
    } catch (err) {
      console.error('[AutoClaim] Scan error:', err)
      return 0
    }
  }, [connection, pendingClaims, mixerDeposits])

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

      await scanMixerDeposits(keys)
      setLastScanTime(new Date())
    } catch (err) {
      console.error('[AutoClaim] Scan error:', err)
    } finally {
      isScanningRef.current = false
      setIsScanning(false)
    }
  }, [publicKey, connected, ensureStealthKeys, scanMixerDeposits])

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

  // AUTO-TRIGGER mixer transfers for pending deposits
  // When we find deposits in the mixer pool, execute the transfer to release funds
  useEffect(() => {
    if (!connected || !publicKey || mixerDeposits.length === 0) return

    const triggerAll = async () => {
      for (const deposit of mixerDeposits) {
        if (processedDepositsRef.current.has(deposit.depositAddress)) continue

        console.log('[AutoClaim] Auto-triggering mixer transfer for:', deposit.depositAddress)
        await triggerMixerTransfer(deposit)
        await new Promise(r => setTimeout(r, 1000))
      }
    }

    // Delay to let UI settle
    const timeout = setTimeout(triggerAll, 2000)
    return () => clearTimeout(timeout)
  }, [mixerDeposits, connected, publicKey, triggerMixerTransfer])

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
    mixerDeposits,
    totalPendingAmount,
    totalMixerAmount,
    claimHistory,
    startScanning,
    stopScanning,
    claimAll,
    claimSingle,
    triggerMixerTransfer,
    lastScanTime,
    error,
  }
}

export default useAutoClaim
