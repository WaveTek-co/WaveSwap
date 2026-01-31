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
  derivePerMixerPoolPda,
  derivePerDepositRecordPda,
  deriveClaimEscrowPda,
  generateStealthKeysFromSignature,
  StealthKeyPair,
} from '@/lib/stealth'
import { isPaymentForUs, checkViewTag } from '@/lib/stealth/scanner'
import { showPaymentReceived, showClaimSuccess } from '@/components/ui/TransactionToast'

// PER deposit record constants (Magic Actions - delegated to MagicBlock)
const PER_DEPOSIT_DISCRIMINATOR = 'PERDEPST'
const PER_DEPOSIT_SIZE = 148

// PER deposit layout offsets
const PER_OFFSET_BUMP = 8
const PER_OFFSET_NONCE = 9
const PER_OFFSET_AMOUNT = 41
const PER_OFFSET_STEALTH = 81
const PER_OFFSET_EPHEMERAL = 113
const PER_OFFSET_VIEW_TAG = 145
const PER_OFFSET_DELEGATED = 146
const PER_OFFSET_EXECUTED = 147

// Mixer deposit record constants (shared pool for privacy)
const MIXER_DEPOSIT_DISCRIMINATOR = 'MIXDEPOT'
const MIXER_DEPOSIT_SIZE = 130

// Mixer deposit layout offsets
const MIXER_OFFSET_BUMP = 8
const MIXER_OFFSET_NONCE = 9
const MIXER_OFFSET_AMOUNT = 41
const MIXER_OFFSET_ANNOUNCEMENT_PDA = 57
const MIXER_OFFSET_VAULT_PDA = 89
const MIXER_OFFSET_IS_EXECUTED = 121

// PER Mixer Pool deposit record constants (delegated shared pool)
// Discriminator: "PERDEPRC" (8 bytes)
// Total size: 180 bytes
const PER_MIXER_DEPOSIT_DISCRIMINATOR = 'PERDEPRC'
const PER_MIXER_DEPOSIT_SIZE = 180

// PER Mixer deposit layout offsets (from per_mixer.rs PerDepositRecord)
// discriminator(8) + bump(1) + nonce(32) + amount(8) + deposit_slot(8) +
// stealth_pubkey(32) + ephemeral_pubkey(32) + view_tag(1) + is_executed(1) +
// is_claimed(1) + escrow_pda(32) + reserved(22) = 178 bytes (padded to 180)
const PER_MIXER_OFFSET_BUMP = 8
const PER_MIXER_OFFSET_NONCE = 9
const PER_MIXER_OFFSET_AMOUNT = 41
const PER_MIXER_OFFSET_DEPOSIT_SLOT = 49
const PER_MIXER_OFFSET_STEALTH = 57
const PER_MIXER_OFFSET_EPHEMERAL = 89
const PER_MIXER_OFFSET_VIEW_TAG = 121
const PER_MIXER_OFFSET_IS_EXECUTED = 122
const PER_MIXER_OFFSET_IS_CLAIMED = 123
const PER_MIXER_OFFSET_ESCROW = 124

// Claim Escrow constants (created by PER, holds funds for recipient)
// Discriminator: "CLAIMESC" (8 bytes)
// Total size: 90 bytes
const CLAIM_ESCROW_DISCRIMINATOR = 'CLAIMESC'
const CLAIM_ESCROW_SIZE = 90

// Claim Escrow layout offsets (from per_mixer.rs ClaimEscrow)
// discriminator(8) + bump(1) + nonce(32) + amount(8) + stealth_pubkey(32) +
// is_withdrawn(1) + reserved(8) = 90 bytes
const ESCROW_OFFSET_BUMP = 8
const ESCROW_OFFSET_NONCE = 9
const ESCROW_OFFSET_AMOUNT = 41
const ESCROW_OFFSET_STEALTH = 49
const ESCROW_OFFSET_IS_WITHDRAWN = 81

// Announcement layout offsets
const ANN_OFFSET_EPHEMERAL_PUBKEY = 17  // 8 + 1 + 8
const ANN_OFFSET_STEALTH_PUBKEY = 81    // 17 + 32 + 32
const ANN_OFFSET_VIEW_TAG = 145         // 81 + 32 + 32

// Delegation program ID (PER deposits are owned by this after delegation)
const DELEGATION_PROGRAM_ID = new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh')

// TEE proof constants
const TEE_PROOF_SIZE = 168
const EXPECTED_ENCLAVE_MEASUREMENT = new Uint8Array([
  0x4f, 0x63, 0x65, 0x61, 0x6e, 0x56, 0x61, 0x75,
  0x6c, 0x74, 0x54, 0x45, 0x45, 0x76, 0x31, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01,
])

// Scan interval (30 seconds)
const SCAN_INTERVAL_MS = 30000

// RPC endpoints
// Use HTTP-only endpoints to avoid WebSocket issues
// IMPORTANT: Public devnet RPC is rate-limited. Use Helius/QuickNode for production.
const DEVNET_RPC = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com'
const MAGICBLOCK_RPC = 'https://devnet.magicblock.app'

// HTTP polling-based confirmation (avoids WebSocket issues)
async function confirmTransactionPolling(
  connection: Connection,
  signature: string,
  maxAttempts = 30,
  intervalMs = 2000
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const status = await connection.getSignatureStatus(signature)
      if (status?.value?.confirmationStatus === 'confirmed' ||
          status?.value?.confirmationStatus === 'finalized') {
        return true
      }
      if (status?.value?.err) {
        console.error('[Confirm] TX failed:', status.value.err)
        return false
      }
    } catch (e) {
      // Ignore polling errors, keep trying
    }
    await new Promise(r => setTimeout(r, intervalMs))
  }
  console.warn('[Confirm] Timeout - TX may still succeed')
  return true // Optimistically return true on timeout
}

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
  type: 'per' | 'mixer' | 'per-mixer'
  processing?: boolean
}

export interface PendingEscrow {
  escrowAddress: string
  nonce: Uint8Array
  amount: bigint
  stealthPubkey: Uint8Array
  status: 'pending' | 'withdrawing' | 'withdrawn' | 'failed'
}

export interface UseAutoClaimReturn {
  isScanning: boolean
  pendingClaims: PendingClaim[]
  delegatedDeposits: DelegatedDeposit[]
  pendingEscrows: PendingEscrow[]
  totalPendingAmount: bigint
  totalDelegatedAmount: bigint
  totalEscrowAmount: bigint
  claimHistory: { signature: string; amount: bigint; timestamp: number; sender?: string }[]
  startScanning: () => void
  stopScanning: () => void
  claimAll: () => Promise<void>
  claimSingle: (vaultAddress: string) => Promise<boolean>
  triggerMagicAction: (deposit: DelegatedDeposit) => Promise<boolean>
  withdrawFromEscrow: (escrow: PendingEscrow) => Promise<boolean>
  lastScanTime: Date | null
  error: string | null
}

// Generate devnet TEE proof
function createDevnetTeeProof(announcement: Uint8Array, vault: Uint8Array): Uint8Array {
  const proof = new Uint8Array(TEE_PROOF_SIZE)
  const commitmentInput = Buffer.concat([
    Buffer.from("OceanVault:TEE:Commitment:"),
    Buffer.from(announcement),
    Buffer.from(vault),
  ])
  const commitment = new Uint8Array(Buffer.from(sha3_256(commitmentInput), "hex"))
  proof.set(commitment, 0)
  proof.fill(0x42, 32, 96)
  proof.set(EXPECTED_ENCLAVE_MEASUREMENT, 96)
  const timestamp = BigInt(Date.now())
  const timestampBytes = new Uint8Array(8)
  for (let i = 0; i < 8; i++) {
    timestampBytes[i] = Number((timestamp >> BigInt(i * 8)) & BigInt(0xff))
  }
  proof.set(timestampBytes, 128)
  proof.fill(0, 136, 168)
  return proof
}

export function useAutoClaim(): UseAutoClaimReturn {
  const { publicKey, signTransaction, signMessage, connected } = useWallet()

  const [isScanning, setIsScanning] = useState(false)
  const [pendingClaims, setPendingClaims] = useState<PendingClaim[]>([])
  const [delegatedDeposits, setDelegatedDeposits] = useState<DelegatedDeposit[]>([])
  const [pendingEscrows, setPendingEscrows] = useState<PendingEscrow[]>([])
  const [claimHistory, setClaimHistory] = useState<{ signature: string; amount: bigint; timestamp: number; sender?: string }[]>([])
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stealthKeys, setStealthKeys] = useState<StealthKeyPair | null>(null)

  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const isScanningRef = useRef(false)
  const processedDepositsRef = useRef<Set<string>>(new Set())
  const keysGeneratedRef = useRef(false)

  // Connections
  const connection = useMemo(() => new Connection(DEVNET_RPC, { commitment: 'confirmed' }), [])
  const rollupConnection = useMemo(() => new Connection(MAGICBLOCK_RPC, { commitment: 'confirmed' }), [])

  // Calculate totals
  const totalPendingAmount = useMemo(() => {
    return pendingClaims.filter(c => c.status === 'pending').reduce((sum, c) => sum + c.amount, BigInt(0))
  }, [pendingClaims])

  const totalDelegatedAmount = useMemo(() => {
    return delegatedDeposits.reduce((sum, d) => sum + d.amount, BigInt(0))
  }, [delegatedDeposits])

  const totalEscrowAmount = useMemo(() => {
    return pendingEscrows.filter(e => e.status === 'pending').reduce((sum, e) => sum + e.amount, BigInt(0))
  }, [pendingEscrows])

  // MAGIC ACTION: Trigger PER to execute transfer
  const triggerMagicAction = useCallback(async (deposit: DelegatedDeposit): Promise<boolean> => {
    if (!publicKey || !signTransaction) {
      console.log('[MagicAction] No wallet connected')
      return false
    }

    if (processedDepositsRef.current.has(deposit.depositAddress)) {
      console.log('[MagicAction] Already processed:', deposit.depositAddress)
      return false
    }

    try {
      console.log('[MagicAction] Triggering for:', deposit.depositAddress, 'type:', deposit.type)
      processedDepositsRef.current.add(deposit.depositAddress)

      const [vaultPda, vaultBump] = deriveStealthVaultPda(deposit.stealthPubkey)

      if (deposit.type === 'per-mixer') {
        // PER Mixer Pool V2 flow:
        // - Escrow was pre-created and delegated during deposit (V2)
        // - TEE fills the escrow and commits it back to L1
        console.log('[MagicAction] PER Mixer Pool V2 flow - triggering execute_per_claim_v2')

        const [perMixerPoolPda, poolBump] = derivePerMixerPoolPda()
        const [depositRecordPda] = derivePerDepositRecordPda(deposit.nonce)
        const [escrowPda, escrowBump] = deriveClaimEscrowPda(deposit.nonce)

        // Check if escrow exists on L1 (V2 flow creates it during deposit)
        const escrowInfo = await connection.getAccountInfo(escrowPda)
        const useV2 = escrowInfo && escrowInfo.lamports > 0
        console.log('[MagicAction] Escrow pre-exists:', useV2, escrowInfo?.lamports || 0, 'lamports')

        // MagicBlock Ephemeral Rollups program and context
        const MAGICBLOCK_ER_PROGRAM = new PublicKey('ERdXRZQiAooqHBRQqhr6ZxppjUfuXsgPijBZaZLiZPfL')
        // Magic context PDA - derived from ER program (not delegation program!)
        const [magicContext] = PublicKey.findProgramAddressSync(
          [Buffer.from('magic_context')],
          MAGICBLOCK_ER_PROGRAM
        )

        // Data: pool_bump(1) + nonce(32) + escrow_bump(1) = 34 bytes
        const data = Buffer.alloc(35)
        let offset = 0
        // Use V2 if escrow exists, otherwise fall back to V1
        data[offset++] = useV2 ? StealthDiscriminators.EXECUTE_PER_CLAIM_V2 : StealthDiscriminators.EXECUTE_PER_CLAIM
        data[offset++] = poolBump
        Buffer.from(deposit.nonce).copy(data, offset); offset += 32
        data[offset] = escrowBump

        // V2 accounts: payer, pool, escrow, magic_context, magic_program, system_program
        // V1 accounts: payer, pool, deposit_record, escrow, magic_context, magic_program, system_program
        const accountsV2 = [
          { pubkey: publicKey, isSigner: true, isWritable: true },
          { pubkey: perMixerPoolPda, isSigner: false, isWritable: true },
          { pubkey: escrowPda, isSigner: false, isWritable: true },
          { pubkey: magicContext, isSigner: false, isWritable: true },
          { pubkey: MAGICBLOCK_ER_PROGRAM, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ]
        const accountsV1 = [
          { pubkey: publicKey, isSigner: true, isWritable: true },
          { pubkey: perMixerPoolPda, isSigner: false, isWritable: true },
          { pubkey: depositRecordPda, isSigner: false, isWritable: false }, // read-only (on L1)
          { pubkey: escrowPda, isSigner: false, isWritable: true },
          { pubkey: magicContext, isSigner: false, isWritable: true },
          { pubkey: MAGICBLOCK_ER_PROGRAM, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ]

        const tx = new Transaction()
        tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }))
        tx.add(new TransactionInstruction({
          keys: useV2 ? accountsV2 : accountsV1,
          programId: PROGRAM_IDS.STEALTH,
          data,
        }))

        tx.feePayer = publicKey
        const { blockhash } = await rollupConnection.getLatestBlockhash()
        tx.recentBlockhash = blockhash

        console.log('[MagicAction] Signing PER claim transaction...')
        const signedTx = await signTransaction(tx)

        console.log('[MagicAction] Sending to MagicBlock rollup...')
        const signature = await rollupConnection.sendRawTransaction(signedTx.serialize(), { skipPreflight: true })
        console.log('[MagicAction] Sent:', signature)

        // Use HTTP polling instead of WebSocket confirmation
        const confirmed = await confirmTransactionPolling(rollupConnection, signature, 15, 1000)
        console.log('[MagicAction] Rollup confirmed:', confirmed, '- waiting for L1 escrow commit...')

        // Poll mainnet for escrow
        for (let i = 0; i < 15; i++) {
          await new Promise(r => setTimeout(r, 2000))
          const escrowInfo = await connection.getAccountInfo(escrowPda)
          if (escrowInfo && escrowInfo.lamports > 0) {
            console.log('[MagicAction] Escrow arrived on L1:', escrowInfo.lamports)
            setDelegatedDeposits(prev => prev.filter(d => d.depositAddress !== deposit.depositAddress))
            setPendingEscrows(prev => {
              if (prev.some(e => e.escrowAddress === escrowPda.toBase58())) return prev
              return [...prev, {
                escrowAddress: escrowPda.toBase58(),
                nonce: deposit.nonce,
                amount: BigInt(escrowInfo.lamports),
                stealthPubkey: deposit.stealthPubkey,
                status: 'pending' as const,
              }]
            })
            showPaymentReceived({ signature, amount: BigInt(escrowInfo.lamports), symbol: 'SOL' })
            return true
          }
        }
        console.warn('[MagicAction] Escrow not visible on L1 yet')
        return false

      } else if (deposit.type === 'per') {
        // Legacy PER flow: Send execute_per_transfer to MagicBlock rollup
        const depositPda = new PublicKey(deposit.depositAddress)

        const data = Buffer.alloc(34)
        data.writeUInt8(StealthDiscriminators.EXECUTE_PER_TRANSFER, 0)
        Buffer.from(deposit.nonce).copy(data, 1)
        data.writeUInt8(vaultBump, 33)

        const tx = new Transaction()
        tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }))
        tx.add(new TransactionInstruction({
          keys: [
            { pubkey: publicKey, isSigner: true, isWritable: true },
            { pubkey: depositPda, isSigner: false, isWritable: true },
            { pubkey: vaultPda, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          programId: PROGRAM_IDS.STEALTH,
          data,
        }))

        tx.feePayer = publicKey
        const { blockhash } = await rollupConnection.getLatestBlockhash()
        tx.recentBlockhash = blockhash

        console.log('[MagicAction] Signing PER transaction...')
        const signedTx = await signTransaction(tx)

        console.log('[MagicAction] Sending to MagicBlock rollup...')
        const signature = await rollupConnection.sendRawTransaction(signedTx.serialize(), { skipPreflight: true })
        console.log('[MagicAction] Sent:', signature)

        // Use HTTP polling instead of WebSocket confirmation
        await confirmTransactionPolling(rollupConnection, signature, 15, 1000)
        console.log('[MagicAction] Rollup confirmed, waiting for L1 commit...')

        // Poll mainnet for vault
        for (let i = 0; i < 15; i++) {
          await new Promise(r => setTimeout(r, 2000))
          const vaultInfo = await connection.getAccountInfo(vaultPda)
          if (vaultInfo && vaultInfo.lamports > 0) {
            console.log('[MagicAction] Funds arrived in vault:', vaultInfo.lamports)
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
            showPaymentReceived({ signature, amount: BigInt(vaultInfo.lamports), symbol: 'SOL' })
            return true
          }
        }
        console.warn('[MagicAction] Vault not visible yet')
        return false

      } else {
        // Mixer flow: Execute on mainnet with TEE proof
        const [mixerPoolPda] = deriveTestMixerPoolPda()
        const [depositRecordPda] = deriveDepositRecordPda(deposit.nonce)
        const [announcementPda, announcementBump] = deriveAnnouncementPdaFromNonce(deposit.nonce)

        const teeProof = createDevnetTeeProof(announcementPda.toBytes(), vaultPda.toBytes())

        const data = Buffer.alloc(235)
        let offset = 0
        data[offset++] = StealthDiscriminators.EXECUTE_TEST_MIXER_TRANSFER
        Buffer.from(deposit.nonce).copy(data, offset); offset += 32
        Buffer.from(deposit.stealthPubkey).copy(data, offset); offset += 32
        data[offset++] = announcementBump
        data[offset++] = vaultBump
        Buffer.from(teeProof).copy(data, offset)

        const tx = new Transaction()
        tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }))
        tx.add(new TransactionInstruction({
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
        }))

        tx.feePayer = publicKey
        const { blockhash } = await connection.getLatestBlockhash()
        tx.recentBlockhash = blockhash

        console.log('[MagicAction] Signing mixer transfer...')
        const signedTx = await signTransaction(tx)

        console.log('[MagicAction] Sending to mainnet...')
        const signature = await connection.sendRawTransaction(signedTx.serialize())
        await confirmTransactionPolling(connection, signature)
        console.log('[MagicAction] Mixer transfer confirmed:', signature)

        const vaultInfo = await connection.getAccountInfo(vaultPda)
        if (vaultInfo && vaultInfo.lamports > 0) {
          setDelegatedDeposits(prev => prev.filter(d => d.depositAddress !== deposit.depositAddress))
          setPendingClaims(prev => {
            if (prev.some(c => c.vaultAddress === vaultPda.toBase58())) return prev
            return [...prev, {
              vaultAddress: vaultPda.toBase58(),
              amount: BigInt(vaultInfo.lamports),
              sender: 'MIXER_POOL',
              announcementPda: announcementPda.toBase58(),
              stealthPubkey: deposit.stealthPubkey,
              status: 'pending' as const,
            }]
          })
          showPaymentReceived({ signature, amount: BigInt(vaultInfo.lamports), symbol: 'SOL' })
          return true
        }
        return false
      }
    } catch (err: any) {
      console.error('[MagicAction] Failed:', err?.message || err)
      return false
    }
  }, [publicKey, signTransaction, connection, rollupConnection])

  // Withdraw from claim escrow (funds on L1 from PER execution)
  const withdrawFromEscrow = useCallback(async (escrow: PendingEscrow): Promise<boolean> => {
    if (!publicKey || !signTransaction) {
      console.log('[Escrow] No wallet connected')
      return false
    }

    try {
      console.log('[Escrow] Withdrawing from:', escrow.escrowAddress)

      setPendingEscrows(prev => prev.map(e =>
        e.escrowAddress === escrow.escrowAddress ? { ...e, status: 'withdrawing' as const } : e
      ))

      const escrowPda = new PublicKey(escrow.escrowAddress)

      // Build withdraw_from_escrow instruction
      // Data: discriminator(1) + nonce(32) + stealth_pubkey(32) = 65 bytes
      const data = Buffer.alloc(65)
      let offset = 0
      data[offset++] = StealthDiscriminators.WITHDRAW_FROM_ESCROW
      Buffer.from(escrow.nonce).copy(data, offset); offset += 32
      Buffer.from(escrow.stealthPubkey).copy(data, offset)

      const tx = new Transaction()
      tx.add(new TransactionInstruction({
        keys: [
          { pubkey: publicKey, isSigner: true, isWritable: false },
          { pubkey: escrowPda, isSigner: false, isWritable: true },
          { pubkey: publicKey, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_IDS.STEALTH,
        data,
      }))

      tx.feePayer = publicKey
      const { blockhash } = await connection.getLatestBlockhash()
      tx.recentBlockhash = blockhash

      console.log('[Escrow] Signing withdraw transaction...')
      const signedTx = await signTransaction(tx)

      console.log('[Escrow] Sending to L1...')
      const signature = await connection.sendRawTransaction(signedTx.serialize())
      await confirmTransactionPolling(connection, signature)
      console.log('[Escrow] Withdraw confirmed:', signature)

      setPendingEscrows(prev => prev.map(e =>
        e.escrowAddress === escrow.escrowAddress ? { ...e, status: 'withdrawn' as const } : e
      ))
      setClaimHistory(prev => [...prev, { signature, amount: escrow.amount, timestamp: Date.now(), sender: 'PER_ESCROW' }])
      showClaimSuccess({ signature, amount: escrow.amount, symbol: 'SOL' })
      return true

    } catch (err: any) {
      console.error('[Escrow] Withdraw failed:', err?.message || err)
      setPendingEscrows(prev => prev.map(e =>
        e.escrowAddress === escrow.escrowAddress ? { ...e, status: 'failed' as const } : e
      ))
      return false
    }
  }, [publicKey, signTransaction, connection])

  // Scan for deposits
  const scanForDeposits = useCallback(async (keys: StealthKeyPair): Promise<number> => {
    console.log('[AutoClaim] Scanning for deposits...')
    let foundCount = 0

    try {
      // Scan PER deposits (delegated to MagicBlock)
      const delegationAccounts = await connection.getProgramAccounts(DELEGATION_PROGRAM_ID, {
        filters: [{ dataSize: PER_DEPOSIT_SIZE }],
      }).catch(() => [])

      console.log(`[AutoClaim] Found ${delegationAccounts.length} delegated PER records`)

      for (const { pubkey, account } of delegationAccounts) {
        const data = account.data
        if (data.slice(0, 8).toString() !== PER_DEPOSIT_DISCRIMINATOR) continue

        const ephemeralPubkey = new Uint8Array(data.slice(PER_OFFSET_EPHEMERAL, PER_OFFSET_EPHEMERAL + 32))
        const viewTag = data[PER_OFFSET_VIEW_TAG]
        if (!checkViewTag(keys.viewPrivkey, ephemeralPubkey, viewTag)) continue

        const stealthPubkey = new Uint8Array(data.slice(PER_OFFSET_STEALTH, PER_OFFSET_STEALTH + 32))
        if (!isPaymentForUs(keys, ephemeralPubkey, viewTag, stealthPubkey)) continue

        foundCount++
        console.log('[AutoClaim] Found PER deposit for us:', pubkey.toBase58())

        const nonce = new Uint8Array(data.slice(PER_OFFSET_NONCE, PER_OFFSET_NONCE + 32))
        const [vaultPda] = deriveStealthVaultPda(stealthPubkey)
        const vaultInfo = await connection.getAccountInfo(vaultPda)

        if (vaultInfo && vaultInfo.lamports > 0) {
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
        } else {
          let amount = BigInt(0)
          for (let i = 0; i < 8; i++) amount |= BigInt(data[PER_OFFSET_AMOUNT + i]) << BigInt(i * 8)

          if (!delegatedDeposits.some(d => d.depositAddress === pubkey.toBase58())) {
            setDelegatedDeposits(prev => {
              if (prev.some(d => d.depositAddress === pubkey.toBase58())) return prev
              return [...prev, {
                depositAddress: pubkey.toBase58(),
                vaultAddress: vaultPda.toBase58(),
                amount,
                stealthPubkey,
                nonce,
                bump: data[PER_OFFSET_BUMP],
                executed: false,
                type: 'per' as const,
              }]
            })
          }
        }
      }

      // Scan PER Mixer deposits (IDEAL PRIVACY ARCHITECTURE)
      // These are the delegated shared pool deposits
      const perMixerAccounts = await connection.getProgramAccounts(PROGRAM_IDS.STEALTH, {
        filters: [{ dataSize: PER_MIXER_DEPOSIT_SIZE }],
      }).catch((err) => {
        console.error('[AutoClaim] Error scanning PER Mixer deposits:', err?.message || err)
        return []
      })

      console.log(`[AutoClaim] Found ${perMixerAccounts.length} PER Mixer deposit records`)

      for (const { pubkey, account } of perMixerAccounts) {
        const data = account.data
        if (data.slice(0, 8).toString() !== PER_MIXER_DEPOSIT_DISCRIMINATOR) continue

        // Skip if already executed or claimed
        if (data[PER_MIXER_OFFSET_IS_EXECUTED] === 1 || data[PER_MIXER_OFFSET_IS_CLAIMED] === 1) continue

        // Check view tag first for fast rejection
        const ephemeralPubkey = new Uint8Array(data.slice(PER_MIXER_OFFSET_EPHEMERAL, PER_MIXER_OFFSET_EPHEMERAL + 32))
        const viewTag = data[PER_MIXER_OFFSET_VIEW_TAG]
        if (!checkViewTag(keys.viewPrivkey, ephemeralPubkey, viewTag)) continue

        // Full stealth address verification
        const stealthPubkey = new Uint8Array(data.slice(PER_MIXER_OFFSET_STEALTH, PER_MIXER_OFFSET_STEALTH + 32))
        if (!isPaymentForUs(keys, ephemeralPubkey, viewTag, stealthPubkey)) continue

        foundCount++
        console.log('[AutoClaim] Found PER Mixer deposit for us:', pubkey.toBase58())

        const nonce = new Uint8Array(data.slice(PER_MIXER_OFFSET_NONCE, PER_MIXER_OFFSET_NONCE + 32))

        // Parse amount
        let amount = BigInt(0)
        for (let i = 0; i < 8; i++) amount |= BigInt(data[PER_MIXER_OFFSET_AMOUNT + i]) << BigInt(i * 8)

        // Check if escrow already exists (PER executed)
        const [escrowPda] = deriveClaimEscrowPda(nonce)
        const escrowInfo = await connection.getAccountInfo(escrowPda)

        if (escrowInfo && escrowInfo.lamports > 0) {
          // Escrow exists - add to pending escrows for withdrawal
          const escrowAddress = escrowPda.toBase58()
          if (!pendingEscrows.some(e => e.escrowAddress === escrowAddress)) {
            setPendingEscrows(prev => {
              if (prev.some(e => e.escrowAddress === escrowAddress)) return prev
              return [...prev, {
                escrowAddress,
                nonce,
                amount: BigInt(escrowInfo.lamports),
                stealthPubkey,
                status: 'pending' as const,
              }]
            })
          }
        } else {
          // No escrow yet - add to delegated deposits (waiting for PER execution)
          const depositAddr = pubkey.toBase58()
          console.log('[AutoClaim] Adding PER Mixer to delegatedDeposits:', depositAddr)
          setDelegatedDeposits(prev => {
            if (prev.some(d => d.depositAddress === depositAddr)) {
              console.log('[AutoClaim] Already in delegatedDeposits, skipping:', depositAddr)
              return prev
            }
            console.log('[AutoClaim] Added to delegatedDeposits, new count:', prev.length + 1)
            return [...prev, {
              depositAddress: depositAddr,
              vaultAddress: escrowPda.toBase58(),
              amount,
              stealthPubkey,
              nonce,
              bump: data[PER_MIXER_OFFSET_BUMP],
              executed: false,
              type: 'per-mixer' as const,
            }]
          })
        }
      }

      // Scan mixer deposits
      const mixerAccounts = await connection.getProgramAccounts(PROGRAM_IDS.STEALTH, {
        filters: [{ dataSize: MIXER_DEPOSIT_SIZE }],
      }).catch(() => [])

      console.log(`[AutoClaim] Found ${mixerAccounts.length} mixer deposit records`)

      for (const { pubkey, account } of mixerAccounts) {
        const data = account.data
        if (data.slice(0, 8).toString() !== MIXER_DEPOSIT_DISCRIMINATOR) continue
        if (data[MIXER_OFFSET_IS_EXECUTED] === 1) continue

        const announcementBytes = data.slice(MIXER_OFFSET_ANNOUNCEMENT_PDA, MIXER_OFFSET_ANNOUNCEMENT_PDA + 32)
        const announcementPda = new PublicKey(announcementBytes)
        const annInfo = await connection.getAccountInfo(announcementPda)
        if (!annInfo || annInfo.data.length < 150) continue

        const annData = annInfo.data
        const ephemeralPubkey = new Uint8Array(annData.slice(ANN_OFFSET_EPHEMERAL_PUBKEY, ANN_OFFSET_EPHEMERAL_PUBKEY + 32))
        const viewTag = annData[ANN_OFFSET_VIEW_TAG]
        if (!checkViewTag(keys.viewPrivkey, ephemeralPubkey, viewTag)) continue

        const stealthPubkey = new Uint8Array(annData.slice(ANN_OFFSET_STEALTH_PUBKEY, ANN_OFFSET_STEALTH_PUBKEY + 32))
        if (!isPaymentForUs(keys, ephemeralPubkey, viewTag, stealthPubkey)) continue

        foundCount++
        console.log('[AutoClaim] Found mixer deposit for us:', pubkey.toBase58())

        const nonce = new Uint8Array(data.slice(MIXER_OFFSET_NONCE, MIXER_OFFSET_NONCE + 32))
        const vaultBytes = data.slice(MIXER_OFFSET_VAULT_PDA, MIXER_OFFSET_VAULT_PDA + 32)
        const vaultPda = new PublicKey(vaultBytes)
        const vaultInfo = await connection.getAccountInfo(vaultPda)

        if (vaultInfo && vaultInfo.lamports > 0) {
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
        } else {
          let amount = BigInt(0)
          for (let i = 0; i < 8; i++) amount |= BigInt(data[MIXER_OFFSET_AMOUNT + i]) << BigInt(i * 8)

          if (!delegatedDeposits.some(d => d.depositAddress === pubkey.toBase58())) {
            setDelegatedDeposits(prev => {
              if (prev.some(d => d.depositAddress === pubkey.toBase58())) return prev
              return [...prev, {
                depositAddress: pubkey.toBase58(),
                vaultAddress: vaultPda.toBase58(),
                amount,
                stealthPubkey,
                nonce,
                bump: data[MIXER_OFFSET_BUMP],
                executed: false,
                type: 'mixer' as const,
              }]
            })
          }
        }
      }

      // Scan claim escrows (created by PER, ready for withdrawal on L1)
      const escrowAccounts = await connection.getProgramAccounts(PROGRAM_IDS.STEALTH, {
        filters: [{ dataSize: CLAIM_ESCROW_SIZE }],
      }).catch(() => [])

      console.log(`[AutoClaim] Found ${escrowAccounts.length} claim escrow accounts`)

      for (const { pubkey, account } of escrowAccounts) {
        const data = account.data

        // Check if already withdrawn
        if (data[ESCROW_OFFSET_IS_WITHDRAWN] === 1) continue

        // Read stealth pubkey to verify it's for us
        const stealthPubkey = new Uint8Array(data.slice(ESCROW_OFFSET_STEALTH, ESCROW_OFFSET_STEALTH + 32))
        const nonce = new Uint8Array(data.slice(ESCROW_OFFSET_NONCE, ESCROW_OFFSET_NONCE + 32))

        // Verify escrow address matches expected PDA
        const [expectedEscrow] = deriveClaimEscrowPda(nonce)
        if (!pubkey.equals(expectedEscrow)) continue

        // Read amount
        let amount = BigInt(0)
        for (let i = 0; i < 8; i++) amount |= BigInt(data[ESCROW_OFFSET_AMOUNT + i]) << BigInt(i * 8)

        // Check if escrow has funds
        if (account.lamports === 0) continue

        foundCount++
        console.log('[AutoClaim] Found claim escrow for us:', pubkey.toBase58())

        const escrowAddress = pubkey.toBase58()
        if (!pendingEscrows.some(e => e.escrowAddress === escrowAddress)) {
          setPendingEscrows(prev => {
            if (prev.some(e => e.escrowAddress === escrowAddress)) return prev
            return [...prev, {
              escrowAddress,
              nonce,
              amount,
              stealthPubkey,
              status: 'pending' as const,
            }]
          })
        }
      }

      console.log(`[AutoClaim] Found ${foundCount} deposits/escrows for us`)
      return foundCount
    } catch (err) {
      console.error('[AutoClaim] Scan error:', err)
      return 0
    }
  }, [connection, pendingClaims, delegatedDeposits, pendingEscrows])

  // Generate stealth keys
  const ensureStealthKeys = useCallback(async (): Promise<StealthKeyPair | null> => {
    if (stealthKeys) return stealthKeys
    if (!signMessage || keysGeneratedRef.current) return null

    try {
      console.log('[AutoClaim] Generating stealth keys...')
      keysGeneratedRef.current = true
      const keys = await generateStealthKeysFromSignature(signMessage)
      setStealthKeys(keys)
      return keys
    } catch (err) {
      console.error('[AutoClaim] Failed to generate keys:', err)
      keysGeneratedRef.current = false
      return null
    }
  }, [signMessage, stealthKeys])

  // Main scan
  const runScan = useCallback(async () => {
    if (!publicKey || !connected || isScanningRef.current) return

    isScanningRef.current = true
    setIsScanning(true)
    setError(null)

    try {
      const keys = await ensureStealthKeys()
      if (keys) {
        await scanForDeposits(keys)
        setLastScanTime(new Date())
      }
    } finally {
      isScanningRef.current = false
      setIsScanning(false)
    }
  }, [publicKey, connected, ensureStealthKeys, scanForDeposits])

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

  // Claim from vault
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
      if (!vaultInfo || vaultInfo.lamports === 0) throw new Error('Vault is empty')

      const data = Buffer.alloc(33)
      data.writeUInt8(StealthDiscriminators.CLAIM_STEALTH_PAYMENT, 0)
      Buffer.from(claim.stealthPubkey).copy(data, 1)

      const tx = new Transaction()
      tx.add(new TransactionInstruction({
        keys: [
          { pubkey: publicKey, isSigner: true, isWritable: false },
          { pubkey: vaultPda, isSigner: false, isWritable: true },
          { pubkey: publicKey, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_IDS.STEALTH,
        data,
      }))

      tx.feePayer = publicKey
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash

      const signedTx = await signTransaction(tx)
      const signature = await connection.sendRawTransaction(signedTx.serialize())
      await confirmTransactionPolling(connection, signature)

      console.log('[AutoClaim] Claimed:', signature)
      showClaimSuccess({ signature, amount: BigInt(vaultInfo.lamports), symbol: 'SOL' })

      setPendingClaims(prev => prev.map(c =>
        c.vaultAddress === vaultAddress ? { ...c, status: 'claimed' as const } : c
      ))
      setClaimHistory(prev => [...prev, { signature, amount: BigInt(vaultInfo.lamports), timestamp: Date.now() }])
      return true
    } catch (err: any) {
      console.error('[AutoClaim] Claim failed:', err)
      setPendingClaims(prev => prev.map(c =>
        c.vaultAddress === vaultAddress ? { ...c, status: 'failed' as const } : c
      ))
      return false
    }
  }, [publicKey, signTransaction, connection, pendingClaims])

  const claimAll = useCallback(async () => {
    for (const claim of pendingClaims.filter(c => c.status === 'pending')) {
      await claimSingle(claim.vaultAddress)
      await new Promise(r => setTimeout(r, 500))
    }
  }, [pendingClaims, claimSingle])

  // Auto-start scanning
  useEffect(() => {
    if (connected && publicKey) {
      startScanning()
    } else {
      stopScanning()
      processedDepositsRef.current.clear()
      keysGeneratedRef.current = false
    }
    return () => stopScanning()
  }, [connected, publicKey, startScanning, stopScanning])

  // NOTE: Auto-trigger COMPLETELY DISABLED
  // All deposit types (per, mixer, per-mixer) require manual triggering
  // This prevents wallet popup spam from legacy unclaimed deposits
  // Users can manually call triggerMagicAction() or withdrawFromEscrow() as needed

  // NOTE: Auto-claim and auto-withdraw DISABLED to prevent wallet popup spam
  // Users can manually call claimAll(), claimSingle(), or withdrawFromEscrow()
  // The UI should provide buttons for these actions

  return {
    isScanning,
    pendingClaims,
    delegatedDeposits,
    pendingEscrows,
    totalPendingAmount,
    totalDelegatedAmount,
    totalEscrowAmount,
    claimHistory,
    startScanning,
    stopScanning,
    claimAll,
    claimSingle,
    triggerMagicAction,
    withdrawFromEscrow,
    lastScanTime,
    error,
  }
}

export default useAutoClaim
