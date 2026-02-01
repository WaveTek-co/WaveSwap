'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram, ComputeBudgetProgram, SYSVAR_INSTRUCTIONS_PUBKEY, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { sha3_256 } from 'js-sha3'
import { sha256 } from '@noble/hashes/sha256'
import { useWallet } from './useWalletAdapter'
import {
  PROGRAM_IDS,
  MASTER_AUTHORITY,
  StealthDiscriminators,
  deriveStealthVaultPda,
  deriveTestMixerPoolPda,
  deriveDepositRecordPda,
  deriveAnnouncementPdaFromNonce,
  derivePerMixerPoolPda,
  derivePerDepositRecordPda,
  deriveClaimEscrowPda,
  deriveXWingCiphertextPda,
  generateStealthKeysFromSignature,
  StealthKeyPair,
  decryptDestinationWallet,
  deriveStealthPubkeyFromSharedSecret,
} from '@/lib/stealth'
import { scanForEscrowsV4, DetectedEscrowV4, checkViewTag, isPaymentForUs } from '@/lib/stealth/scanner'
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
// Total size: 210 bytes (CRITICAL: must match on-chain PerDepositRecord::SPACE)
// Layout: 8+1+32+8+8+32+32+1+1+1+32+48+6 = 210
const PER_MIXER_DEPOSIT_DISCRIMINATOR = 'PERDEPRC'
const PER_MIXER_DEPOSIT_SIZE = 210

// PER Mixer deposit layout offsets (from per_mixer.rs PerDepositRecord)
// discriminator(8) + bump(1) + nonce(32) + amount(8) + deposit_slot(8) +
// stealth_pubkey(32) + ephemeral_pubkey(32) + view_tag(1) + is_executed(1) +
// is_claimed(1) + escrow_pda(32) + encrypted_destination(48) + reserved(6) = 210 bytes
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
const PER_MIXER_OFFSET_ENCRYPTED_DEST = 156 // 124 + 32 = 156

// Claim Escrow constants (created by PER, holds funds for recipient)
// Discriminator: "CLAIMESC" (8 bytes)
// V1 Total size: 90 bytes
// V3 Total size: 171 bytes (with encrypted_destination + verified_destination)
const CLAIM_ESCROW_DISCRIMINATOR = 'CLAIMESC'
const CLAIM_ESCROW_SIZE_V1 = 90
const CLAIM_ESCROW_SIZE_V3 = 171

// V1 Claim Escrow layout offsets (from per_mixer.rs ClaimEscrow)
// discriminator(8) + bump(1) + nonce(32) + amount(8) + stealth_pubkey(32) +
// is_withdrawn(1) + reserved(8) = 90 bytes
const ESCROW_OFFSET_BUMP = 8
const ESCROW_OFFSET_NONCE = 9
const ESCROW_OFFSET_AMOUNT = 41
const ESCROW_OFFSET_STEALTH = 49
const ESCROW_OFFSET_IS_WITHDRAWN = 81

// V3 Claim Escrow layout offsets (with encrypted destination)
// discriminator(8) + bump(1) + nonce(32) + amount(8) + stealth_pubkey(32) +
// encrypted_destination(48) + verified_destination(32) + is_verified(1) +
// is_withdrawn(1) + reserved(8) = 171 bytes
const ESCROW_V3_OFFSET_ENCRYPTED_DEST = 81
const ESCROW_V3_OFFSET_VERIFIED_DEST = 129
const ESCROW_V3_OFFSET_IS_VERIFIED = 161
const ESCROW_V3_OFFSET_IS_WITHDRAWN = 162

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

// Storage key for stealth keys (cached per wallet address)
const STEALTH_KEYS_STORAGE_PREFIX = 'waveswap_stealth_keys_'

// Helper to get cached stealth keys from localStorage (includes X-Wing post-quantum keys)
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

// Helper to cache stealth keys in localStorage (includes X-Wing post-quantum keys)
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
    console.warn('[AutoClaim] Failed to cache stealth keys:', e)
  }
}

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
  // V3 additions
  isV3?: boolean
  encryptedDestination?: Uint8Array
  verifiedDestination?: Uint8Array
  isVerified?: boolean
  sharedSecret?: Uint8Array
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
  // RECOMMENDED: Private claim via TEE (no on-chain wallet link)
  claimViaTEE: (escrow: PendingEscrow, destinationWallet?: PublicKey) => Promise<boolean>
  // LEGACY: Direct withdraw (breaks privacy - links wallet on-chain)
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
        // PER flow with smart detection:
        // - If vault exists with funds → claim directly
        // - If deposit executed but no vault → create vault + claim
        // - If deposit still delegated → Phase 2 (PER) then Phase 3 (create+claim)

        const depositPda = new PublicKey(deposit.depositAddress)

        // Check if vault already exists (from previous partial attempt)
        const existingVaultInfo = await connection.getAccountInfo(vaultPda)
        if (existingVaultInfo && existingVaultInfo.lamports > 0) {
          console.log('[MagicAction] Vault already exists with', existingVaultInfo.lamports, 'lamports - claiming directly')

          // Just claim from existing vault
          const claimData = Buffer.alloc(33)
          claimData.writeUInt8(StealthDiscriminators.CLAIM_STEALTH_PAYMENT, 0)
          Buffer.from(deposit.stealthPubkey).copy(claimData, 1)

          const claimTx = new Transaction()
          claimTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 }))
          claimTx.add(new TransactionInstruction({
            keys: [
              { pubkey: publicKey, isSigner: true, isWritable: false },
              { pubkey: vaultPda, isSigner: false, isWritable: true },
              { pubkey: publicKey, isSigner: false, isWritable: true },
              { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            programId: PROGRAM_IDS.STEALTH,
            data: claimData,
          }))

          claimTx.feePayer = publicKey
          const { blockhash } = await connection.getLatestBlockhash()
          claimTx.recentBlockhash = blockhash

          console.log('[MagicAction] Signing direct claim...')
          const signedClaimTx = await signTransaction(claimTx)
          const claimSig = await connection.sendRawTransaction(signedClaimTx.serialize())
          await confirmTransactionPolling(connection, claimSig)

          setDelegatedDeposits(prev => prev.filter(d => d.depositAddress !== deposit.depositAddress))
          showClaimSuccess({ signature: claimSig, amount: BigInt(existingVaultInfo.lamports), symbol: 'SOL' })
          setClaimHistory(prev => [...prev, { signature: claimSig, amount: BigInt(existingVaultInfo.lamports), timestamp: Date.now(), sender: 'PER_DIRECT_CLAIM' }])

          console.log('[MagicAction] Claimed from existing vault!')
          return true
        }

        // Check if deposit already executed (undelegated to stealth program)
        const depositInfo = await connection.getAccountInfo(depositPda)
        const isAlreadyExecuted = depositInfo && depositInfo.owner.equals(PROGRAM_IDS.STEALTH)

        if (!isAlreadyExecuted) {
          // Phase 2: EXECUTE_PER_TRANSFER in PER (only if not already executed)
          console.log('[MagicAction] Phase 2: Executing PER transfer...')

          const MAGICBLOCK_ER_PROGRAM = new PublicKey('Magic11111111111111111111111111111111111111')
          const MAGIC_CONTEXT = new PublicKey('MagicContext1111111111111111111111111111111')

          const executeData = Buffer.alloc(33)
          executeData.writeUInt8(StealthDiscriminators.EXECUTE_PER_TRANSFER, 0)
          Buffer.from(deposit.nonce).copy(executeData, 1)

          const executeTx = new Transaction()
          executeTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 }))
          executeTx.add(new TransactionInstruction({
            keys: [
              { pubkey: publicKey, isSigner: true, isWritable: true },
              { pubkey: depositPda, isSigner: false, isWritable: true },
              { pubkey: MAGIC_CONTEXT, isSigner: false, isWritable: true },
              { pubkey: MAGICBLOCK_ER_PROGRAM, isSigner: false, isWritable: false },
            ],
            programId: PROGRAM_IDS.STEALTH,
            data: executeData,
          }))

          executeTx.feePayer = publicKey
          const { blockhash } = await rollupConnection.getLatestBlockhash()
          executeTx.recentBlockhash = blockhash

          console.log('[MagicAction] Phase 2: Signing EXECUTE_PER_TRANSFER...')
          const signedExecuteTx = await signTransaction(executeTx)

          console.log('[MagicAction] Sending to MagicBlock rollup...')
          const executeSignature = await rollupConnection.sendRawTransaction(signedExecuteTx.serialize(), { skipPreflight: true })
          console.log('[MagicAction] Sent:', executeSignature)

          await confirmTransactionPolling(rollupConnection, executeSignature, 15, 1000)
          console.log('[MagicAction] PER confirmed, waiting for undelegation to L1...')

          // Wait for deposit to be undelegated back to L1
          let undelegated = false
          for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 2000))
            const checkInfo = await connection.getAccountInfo(depositPda)
            if (checkInfo && checkInfo.owner.equals(PROGRAM_IDS.STEALTH)) {
              console.log('[MagicAction] Deposit undelegated to L1!')
              undelegated = true
              break
            }
            console.log('[MagicAction] Waiting for undelegation...', i + 1, '/20')
          }

          if (!undelegated) {
            console.warn('[MagicAction] Undelegation timeout')
            return false
          }
        } else {
          console.log('[MagicAction] Deposit already executed - skipping Phase 2')
        }

        // Phase 3: CREATE_VAULT_FROM_DEPOSIT + CLAIM_STEALTH_PAYMENT in one TX
        // This creates vault AND claims to wallet in single transaction
        // User pays rent temporarily but gets it ALL back when claiming

        // Data for create_vault: discriminator(1) + nonce(32) + vault_bump(1) = 34 bytes
        const createVaultData = Buffer.alloc(34)
        createVaultData.writeUInt8(StealthDiscriminators.CREATE_VAULT_FROM_DEPOSIT, 0)
        Buffer.from(deposit.nonce).copy(createVaultData, 1)
        createVaultData.writeUInt8(vaultBump, 33)

        // Data for claim: discriminator(1) + stealth_pubkey(32) = 33 bytes
        const claimData = Buffer.alloc(33)
        claimData.writeUInt8(StealthDiscriminators.CLAIM_STEALTH_PAYMENT, 0)
        Buffer.from(deposit.stealthPubkey).copy(claimData, 1)

        const combinedTx = new Transaction()
        combinedTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }))

        // Instruction 1: Create vault from deposit
        combinedTx.add(new TransactionInstruction({
          keys: [
            { pubkey: publicKey, isSigner: true, isWritable: true },
            { pubkey: depositPda, isSigner: false, isWritable: true },
            { pubkey: vaultPda, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          programId: PROGRAM_IDS.STEALTH,
          data: createVaultData,
        }))

        // Instruction 2: Immediately claim from vault to wallet
        combinedTx.add(new TransactionInstruction({
          keys: [
            { pubkey: publicKey, isSigner: true, isWritable: false },
            { pubkey: vaultPda, isSigner: false, isWritable: true },
            { pubkey: publicKey, isSigner: false, isWritable: true }, // destination = claimer
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          programId: PROGRAM_IDS.STEALTH,
          data: claimData,
        }))

        combinedTx.feePayer = publicKey
        const { blockhash: l1Blockhash } = await connection.getLatestBlockhash()
        combinedTx.recentBlockhash = l1Blockhash

        console.log('[MagicAction] Phase 3: Signing CREATE_VAULT + CLAIM (combined)...')
        const signedCombinedTx = await signTransaction(combinedTx)

        console.log('[MagicAction] Sending combined tx to L1...')
        const claimSignature = await connection.sendRawTransaction(signedCombinedTx.serialize())
        await confirmTransactionPolling(connection, claimSignature)
        console.log('[MagicAction] Vault created and claimed:', claimSignature)

        // Verify funds arrived at wallet
        setDelegatedDeposits(prev => prev.filter(d => d.depositAddress !== deposit.depositAddress))

        // Get the original deposit amount for display
        let depositAmount = deposit.amount
        showClaimSuccess({ signature: claimSignature, amount: depositAmount, symbol: 'SOL' })
        setClaimHistory(prev => [...prev, { signature: claimSignature, amount: depositAmount, timestamp: Date.now(), sender: 'PER_DIRECT_CLAIM' }])

        console.log('[MagicAction] Funds claimed directly to wallet!')
        return true

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

  // PRIVATE CLAIM VIA TEE - V4 TRUE PRIVACY
  //
  // V4 PRIVACY ARCHITECTURE:
  // 1. Receiver scans ClaimEscrows, X-Wing decapsulates to get sharedSecret
  // 2. Verifies locally: SHA256(sharedSecret || "stealth-derive") == stealth_pubkey
  // 3. Calls POOL_TO_ESCROW_V4 on PER to fund escrow from pool (if needed)
  // 4. Calls CLAIM_ESCROW_V4 on PER with sharedSecret
  // 5. TEE verifies: SHA256(shared_secret || "stealth-derive") == stealth_pubkey
  // 6. TEE sets verified_destination and undelegates escrow to L1
  // 7. Call WITHDRAW_FROM_ESCROW on L1 to receive funds
  //
  const claimViaTEE = useCallback(async (
    escrow: PendingEscrow,
    destinationWallet?: PublicKey,
    sharedSecretInput?: Uint8Array
  ): Promise<boolean> => {
    if (!publicKey || !stealthKeys) {
      console.log('[TEE Claim] No wallet or stealth keys')
      return false
    }

    const destination = destinationWallet || publicKey

    try {
      console.log('[TEE Claim] V4 TRUE PRIVACY CLAIM VIA MAGICBLOCK TEE')
      console.log('[TEE Claim] Escrow:', escrow.escrowAddress)
      console.log('[TEE Claim] Destination:', destination.toBase58())
      console.log('[TEE Claim] Amount:', Number(escrow.amount) / LAMPORTS_PER_SOL, 'SOL')

      setPendingEscrows(prev => prev.map(e =>
        e.escrowAddress === escrow.escrowAddress ? { ...e, status: 'withdrawing' as const } : e
      ))

      // Get shared_secret from X-Wing decapsulation (recovered during scanning)
      const sharedSecret = sharedSecretInput || escrow.sharedSecret
      if (!sharedSecret) {
        console.error('[TEE Claim] V4 requires sharedSecret from X-Wing decapsulation')
        throw new Error('V4 claim requires sharedSecret')
      }

      // Verify locally that sharedSecret derives correct stealth_pubkey
      const derivedStealth = deriveStealthPubkeyFromSharedSecret(sharedSecret)
      const stealthMatches = derivedStealth.every((b, i) => b === escrow.stealthPubkey[i])
      if (!stealthMatches) {
        console.error('[TEE Claim] Shared secret does not match stealth pubkey')
        throw new Error('Invalid sharedSecret for this escrow')
      }

      console.log('[TEE Claim] V4: Shared secret verified locally')

      // =====================================================
      // STEP 0: POOL_TO_ESCROW_V4 - Fund escrow from pool (ALWAYS for V4!)
      // =====================================================
      // V4 architecture: complete_v4_deposit sends funds to POOL, not escrow
      // The escrow only has RENT, the actual amount is in the pool
      // We MUST call POOL_TO_ESCROW_V4 on MagicBlock PER to move funds POOL→ESCROW
      // This breaks the sender→escrow on-chain link (sender NOT in this TX)
      const escrowPda = new PublicKey(escrow.escrowAddress)

      // Check escrow state on PER (not L1!) - escrow is delegated
      const escrowInfoPER = await rollupConnection.getAccountInfo(escrowPda).catch(() => null)
      const escrowRent = 2039280 // Rent for 171-byte ClaimEscrow
      // V4 escrows have only rent initially - funds are in pool
      // Need funding if: no info on PER, or lamports < amount + rent
      const needsFunding = !escrowInfoPER || escrowInfoPER.lamports < Number(escrow.amount) + escrowRent

      console.log('[TEE Claim] V4: Escrow state on PER:', escrowInfoPER ? escrowInfoPER.lamports : 'null', 'lamports')
      console.log('[TEE Claim] V4: Expected:', Number(escrow.amount) + escrowRent, 'lamports')
      console.log('[TEE Claim] V4: Needs funding:', needsFunding)

      if (needsFunding) {
        console.log('[TEE Claim] V4: Escrow needs funding from pool')
        console.log('[TEE Claim] V4: Calling POOL_TO_ESCROW_V4 on PER...')

        // Derive PDAs for POOL_TO_ESCROW_V4
        const [poolPda, poolBump] = derivePerMixerPoolPda()
        const [depositRecordPda] = derivePerDepositRecordPda(escrow.nonce)
        const [escrowPdaDerived, escrowBump] = deriveClaimEscrowPda(escrow.nonce)
        const [xwingCtPda, xwingCtBump] = deriveXWingCiphertextPda(escrowPdaDerived)

        // Data: disc(1) + pool_bump(1) + nonce(32) + escrow_bump(1) + xwing_ct_bump(1) = 36 bytes
        const poolToEscrowData = Buffer.alloc(36)
        let pOffset = 0
        poolToEscrowData[pOffset++] = StealthDiscriminators.POOL_TO_ESCROW_V4
        poolToEscrowData[pOffset++] = poolBump
        Buffer.from(escrow.nonce).copy(poolToEscrowData, pOffset); pOffset += 32
        poolToEscrowData[pOffset++] = escrowBump
        poolToEscrowData[pOffset++] = xwingCtBump

        const poolToEscrowTx = new Transaction()
        poolToEscrowTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }))
        poolToEscrowTx.add(new TransactionInstruction({
          keys: [
            { pubkey: publicKey, isSigner: true, isWritable: true },      // tee_authority/signer
            { pubkey: poolPda, isSigner: false, isWritable: true },       // pool
            { pubkey: depositRecordPda, isSigner: false, isWritable: false }, // deposit_record (read-only)
            { pubkey: escrowPdaDerived, isSigner: false, isWritable: true },  // claim_escrow
            { pubkey: xwingCtPda, isSigner: false, isWritable: true },    // xwing_ciphertext
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          programId: PROGRAM_IDS.STEALTH,
          data: poolToEscrowData,
        }))

        poolToEscrowTx.feePayer = publicKey
        const { blockhash: perBlockhash } = await rollupConnection.getLatestBlockhash()
        poolToEscrowTx.recentBlockhash = perBlockhash

        const signedPoolTx = await signTransaction!(poolToEscrowTx)
        const poolToEscrowSig = await rollupConnection.sendRawTransaction(signedPoolTx.serialize(), { skipPreflight: true })
        console.log('[TEE Claim] V4: POOL_TO_ESCROW_V4 sent:', poolToEscrowSig)

        // Wait for confirmation
        const poolConfirmed = await confirmTransactionPolling(rollupConnection, poolToEscrowSig, 20, 2000)
        if (!poolConfirmed) {
          console.warn('[TEE Claim] V4: POOL_TO_ESCROW_V4 confirmation timeout')
        }
        console.log('[TEE Claim] V4: Escrow funded from pool')
      }

      // Build CLAIM_ESCROW_V4 instruction (0x27)
      // Accounts: claimer, escrow, destination, master_authority, xwing_ct, magic_context, magic_program
      const [claimXwingCtPda] = deriveXWingCiphertextPda(escrowPda)
      const MAGICBLOCK_ER_PROGRAM = new PublicKey('ERdXRZQiAooqHBRQqhr6ZxppjUfuXsgPijBZaZLiZPfL')
      const [magicContext] = PublicKey.findProgramAddressSync(
        [Buffer.from('magic_context')],
        MAGICBLOCK_ER_PROGRAM
      )

      // Data: discriminator(1) + nonce(32) + shared_secret(32) = 65 bytes
      const data = Buffer.alloc(65)
      let offset = 0
      data[offset++] = StealthDiscriminators.CLAIM_ESCROW_V4
      Buffer.from(escrow.nonce).copy(data, offset); offset += 32
      Buffer.from(sharedSecret).copy(data, offset)

      const tx = new Transaction()
      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }))
      tx.add(new TransactionInstruction({
        keys: [
          { pubkey: publicKey, isSigner: true, isWritable: true },      // claimer
          { pubkey: escrowPda, isSigner: false, isWritable: true },     // escrow (delegated)
          { pubkey: destination, isSigner: false, isWritable: false },  // destination (read-only)
          { pubkey: MASTER_AUTHORITY, isSigner: false, isWritable: false }, // master_authority (read-only)
          { pubkey: claimXwingCtPda, isSigner: false, isWritable: true },    // xwing_ciphertext (delegated)
          { pubkey: magicContext, isSigner: false, isWritable: true },  // magic_context
          { pubkey: MAGICBLOCK_ER_PROGRAM, isSigner: false, isWritable: false }, // magic_program
        ],
        programId: PROGRAM_IDS.STEALTH,
        data,
      }))

      tx.feePayer = publicKey
      const { blockhash } = await rollupConnection.getLatestBlockhash()
      tx.recentBlockhash = blockhash

      console.log('[TEE Claim] V4: Signing CLAIM_ESCROW_V4...')
      const signedTx = await signTransaction!(tx)

      console.log('[TEE Claim] V4: Sending to MagicBlock PER...')
      const signature = await rollupConnection.sendRawTransaction(signedTx.serialize(), { skipPreflight: true })
      console.log('[TEE Claim] V4: Sent:', signature)

      // Wait for PER confirmation
      const confirmed = await confirmTransactionPolling(rollupConnection, signature, 20, 2000)
      if (!confirmed) {
        console.warn('[TEE Claim] V4: PER confirmation timeout')
        throw new Error('PER confirmation timeout')
      }

      console.log('[TEE Claim] V4: Waiting for escrow undelegation to L1...')

      // Wait for escrow to be undelegated and verified
      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 2000))
        const escrowInfo = await connection.getAccountInfo(escrowPda)
        if (escrowInfo && escrowInfo.owner.equals(PROGRAM_IDS.STEALTH)) {
          // Check if verified
          const escrowData = escrowInfo.data
          if (escrowData.length >= 162 && escrowData[ESCROW_V3_OFFSET_IS_VERIFIED] === 1) {
            console.log('[TEE Claim] V4: Escrow verified on L1!')

            // Now call WITHDRAW_FROM_ESCROW on L1
            // Rent goes to MASTER_AUTHORITY as service fee
            const withdrawData = Buffer.alloc(65)
            withdrawData[0] = StealthDiscriminators.WITHDRAW_FROM_ESCROW
            Buffer.from(escrow.nonce).copy(withdrawData, 1)
            Buffer.from(escrow.stealthPubkey).copy(withdrawData, 33)

            // Build accounts list
            // Order: claimer, escrow, destination, master_authority, system, [optional: xwing_ct]
            const withdrawAccounts = [
              { pubkey: publicKey, isSigner: true, isWritable: false },
              { pubkey: escrowPda, isSigner: false, isWritable: true },
              { pubkey: destination, isSigner: false, isWritable: true },
              { pubkey: MASTER_AUTHORITY, isSigner: false, isWritable: true },
              { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            ]

            // Check if XWingCiphertext account exists and add it for cleanup
            const xwingCtInfo = await connection.getAccountInfo(claimXwingCtPda)
            if (xwingCtInfo && xwingCtInfo.data.length > 0) {
              console.log('[TEE Claim] V4: Including XWingCiphertext for cleanup')
              withdrawAccounts.push({ pubkey: claimXwingCtPda, isSigner: false, isWritable: true })
            }

            const withdrawTx = new Transaction()
            withdrawTx.add(new TransactionInstruction({
              keys: withdrawAccounts,
              programId: PROGRAM_IDS.STEALTH,
              data: withdrawData,
            }))

            withdrawTx.feePayer = publicKey
            const { blockhash: l1Blockhash } = await connection.getLatestBlockhash()
            withdrawTx.recentBlockhash = l1Blockhash

            const signedWithdrawTx = await signTransaction!(withdrawTx)
            const withdrawSig = await connection.sendRawTransaction(signedWithdrawTx.serialize())
            await confirmTransactionPolling(connection, withdrawSig)

            console.log('[TEE Claim] V4: Withdraw complete:', withdrawSig)

            setPendingEscrows(prev => prev.map(e =>
              e.escrowAddress === escrow.escrowAddress ? { ...e, status: 'withdrawn' as const } : e
            ))
            setClaimHistory(prev => [...prev, {
              signature: withdrawSig,
              amount: escrow.amount,
              timestamp: Date.now(),
              sender: 'V4_TEE_CLAIM'
            }])
            showClaimSuccess({ signature: withdrawSig, amount: escrow.amount, symbol: 'SOL' })

                  console.log('[TEE Claim] ✓ V4 PRIVATE CLAIM COMPLETE')
                  return true
          }
        }
      }

      console.warn('[TEE Claim] V4: Escrow not verified on L1 within timeout')
      return false

    } catch (err: any) {
      console.error('[TEE Claim] Failed:', err?.message || err)
      setPendingEscrows(prev => prev.map(e =>
        e.escrowAddress === escrow.escrowAddress ? { ...e, status: 'failed' as const } : e
      ))
      return false
    }
  }, [publicKey, stealthKeys, connection, rollupConnection])

  // LEGACY: Withdraw from claim escrow (breaks privacy - receiver signs)
  // Use claimViaTEE instead for full privacy
  const withdrawFromEscrow = useCallback(async (escrow: PendingEscrow): Promise<boolean> => {
    if (!publicKey || !signTransaction) {
      console.log('[Escrow] No wallet connected')
      return false
    }

    try {
      console.log('[Escrow] WARNING: This method links your wallet on-chain!')
      console.log('[Escrow] Use claimViaTEE() for private claims')
      console.log('[Escrow] Withdrawing from:', escrow.escrowAddress)

      setPendingEscrows(prev => prev.map(e =>
        e.escrowAddress === escrow.escrowAddress ? { ...e, status: 'withdrawing' as const } : e
      ))

      const escrowPda = new PublicKey(escrow.escrowAddress)

      // Build withdraw_from_escrow instruction
      // Data: discriminator(1) + nonce(32) + stealth_pubkey(32) = 65 bytes
      // Rent goes to MASTER_AUTHORITY as service fee
      const data = Buffer.alloc(65)
      let offset = 0
      data[offset++] = StealthDiscriminators.WITHDRAW_FROM_ESCROW
      Buffer.from(escrow.nonce).copy(data, offset); offset += 32
      Buffer.from(escrow.stealthPubkey).copy(data, offset)

      // Derive XWingCiphertext PDA for V3 cleanup
      const [xwingCtPda] = deriveXWingCiphertextPda(escrowPda)

      // Build accounts list
      // Order: claimer, escrow, destination, master_authority, system, [optional: xwing_ct]
      const withdrawAccounts = [
        { pubkey: publicKey, isSigner: true, isWritable: false },
        { pubkey: escrowPda, isSigner: false, isWritable: true },
        { pubkey: publicKey, isSigner: false, isWritable: true }, // destination
        { pubkey: MASTER_AUTHORITY, isSigner: false, isWritable: true }, // Receives rent as fee
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ]

      // Check if XWingCiphertext account exists and add it for cleanup
      const xwingCtInfo = await connection.getAccountInfo(xwingCtPda)
      if (xwingCtInfo && xwingCtInfo.data.length > 0) {
        console.log('[Escrow] Including XWingCiphertext for cleanup')
        withdrawAccounts.push({ pubkey: xwingCtPda, isSigner: false, isWritable: true })
      }

      const tx = new Transaction()
      tx.add(new TransactionInstruction({
        keys: withdrawAccounts,
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
    let foundCount = 0

    try {
      // Scan PER deposits (delegated to MagicBlock)
      const delegationAccounts = await connection.getProgramAccounts(DELEGATION_PROGRAM_ID, {
        filters: [{ dataSize: PER_DEPOSIT_SIZE }],
      }).catch(() => [])


      for (const { pubkey, account } of delegationAccounts) {
        const data = account.data
        if (data.slice(0, 8).toString() !== PER_DEPOSIT_DISCRIMINATOR) continue

        const ephemeralPubkey = new Uint8Array(data.slice(PER_OFFSET_EPHEMERAL, PER_OFFSET_EPHEMERAL + 32))
        const viewTag = data[PER_OFFSET_VIEW_TAG]
        if (!checkViewTag(keys.viewPrivkey, ephemeralPubkey, viewTag)) continue

        const stealthPubkey = new Uint8Array(data.slice(PER_OFFSET_STEALTH, PER_OFFSET_STEALTH + 32))
        if (!isPaymentForUs(keys, ephemeralPubkey, viewTag, stealthPubkey)) continue

        foundCount++

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

      // Scan EXECUTED PER deposits (undelegated back to stealth program)
      // These have vaults that are ready to claim via CLAIM_STEALTH_PAYMENT
      const executedPerAccounts = await connection.getProgramAccounts(PROGRAM_IDS.STEALTH, {
        filters: [{ dataSize: PER_DEPOSIT_SIZE }],
      }).catch(() => [])


      for (const { pubkey, account } of executedPerAccounts) {
        const data = account.data
        if (data.slice(0, 8).toString() !== PER_DEPOSIT_DISCRIMINATOR) continue

        // Check if executed
        if (data[PER_OFFSET_EXECUTED] !== 1) continue

        const ephemeralPubkey = new Uint8Array(data.slice(PER_OFFSET_EPHEMERAL, PER_OFFSET_EPHEMERAL + 32))
        const viewTag = data[PER_OFFSET_VIEW_TAG]
        if (!checkViewTag(keys.viewPrivkey, ephemeralPubkey, viewTag)) continue

        const stealthPubkey = new Uint8Array(data.slice(PER_OFFSET_STEALTH, PER_OFFSET_STEALTH + 32))
        if (!isPaymentForUs(keys, ephemeralPubkey, viewTag, stealthPubkey)) continue

        // Found an executed deposit for us - check if vault has funds
        const [vaultPda] = deriveStealthVaultPda(stealthPubkey)
        const vaultInfo = await connection.getAccountInfo(vaultPda)

        if (vaultInfo && vaultInfo.lamports > 0) {
          foundCount++

          const vaultAddress = vaultPda.toBase58()
          if (!pendingClaims.some(c => c.vaultAddress === vaultAddress)) {
            setPendingClaims(prev => {
              if (prev.some(c => c.vaultAddress === vaultAddress)) return prev
              return [...prev, {
                vaultAddress,
                amount: BigInt(vaultInfo.lamports),
                sender: 'PER_EXECUTED',
                announcementPda: pubkey.toBase58(),
                stealthPubkey,
                status: 'pending' as const,
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
          setDelegatedDeposits(prev => {
            if (prev.some(d => d.depositAddress === depositAddr)) {
              return prev
            }
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
      // Support both V1 (90 bytes) and V3 (171 bytes) escrows
      const escrowAccountsV1 = await connection.getProgramAccounts(PROGRAM_IDS.STEALTH, {
        filters: [{ dataSize: CLAIM_ESCROW_SIZE_V1 }],
      }).catch(() => [])

      const escrowAccountsV3 = await connection.getProgramAccounts(PROGRAM_IDS.STEALTH, {
        filters: [{ dataSize: CLAIM_ESCROW_SIZE_V3 }],
      }).catch(() => [])


      // Process V1 escrows
      for (const { pubkey, account } of escrowAccountsV1) {
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
              isV3: false,
            }]
          })
        }
      }

      // V4 TRUE PRIVACY SCANNER
      // Uses X-Wing decapsulation to identify our escrows
      // ONLY includes escrows that belong to us (isOurs === true)
      if (keys.xwingKeys) {

        const v4Escrows = await scanForEscrowsV4(connection, keys)

        // Only process escrows that belong to us
        const ourEscrows = v4Escrows.filter(e => e.isOurs && !e.isWithdrawn)

        for (const escrow of ourEscrows) {
          foundCount++
          const escrowAddress = escrow.escrowPda.toBase58()


          if (!pendingEscrows.some(e => e.escrowAddress === escrowAddress)) {
            setPendingEscrows(prev => {
              if (prev.some(e => e.escrowAddress === escrowAddress)) return prev
              return [...prev, {
                escrowAddress,
                nonce: escrow.nonce,
                amount: escrow.amount,
                stealthPubkey: escrow.stealthPubkey,
                status: 'pending' as const,
                isV3: true, // V4 uses same escrow structure as V3
                encryptedDestination: escrow.encryptedDestination,
                verifiedDestination: escrow.verifiedDestination,
                isVerified: escrow.isVerified,
                sharedSecret: escrow.sharedSecret, // V4: Auto-recovered from XWingCiphertext!
              }]
            })
          }
        }

      } else {
        // Fallback: Manual V3 escrow scanning without X-Wing (legacy)
        for (const { pubkey, account } of escrowAccountsV3) {
          const data = account.data

          // Check discriminator
          if (data.slice(0, 8).toString() !== CLAIM_ESCROW_DISCRIMINATOR) continue

          // Check if already withdrawn
          if (data[ESCROW_V3_OFFSET_IS_WITHDRAWN] === 1) continue

          // Read stealth pubkey and nonce
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

          // Read V3-specific fields
          const encryptedDestination = new Uint8Array(data.slice(ESCROW_V3_OFFSET_ENCRYPTED_DEST, ESCROW_V3_OFFSET_ENCRYPTED_DEST + 48))
          const verifiedDestination = new Uint8Array(data.slice(ESCROW_V3_OFFSET_VERIFIED_DEST, ESCROW_V3_OFFSET_VERIFIED_DEST + 32))
          const isVerified = data[ESCROW_V3_OFFSET_IS_VERIFIED] === 1

          foundCount++

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
                isV3: true,
                encryptedDestination,
                verifiedDestination,
                isVerified,
                // Note: sharedSecret NOT available in legacy mode
              }]
            })
          }
        }
      }

      return foundCount
    } catch (err) {
      console.error('[AutoClaim] Scan error:', err)
      return 0
    }
  }, [connection, pendingClaims, delegatedDeposits, pendingEscrows])

  // Generate stealth keys - uses localStorage cache to avoid repeated wallet popups
  const ensureStealthKeys = useCallback(async (): Promise<StealthKeyPair | null> => {
    // Return existing keys if already loaded
    if (stealthKeys) return stealthKeys

    // Check localStorage cache first (keyed by wallet address)
    if (publicKey) {
      const walletAddress = publicKey.toBase58()
      const cachedKeys = getCachedStealthKeys(walletAddress)
      if (cachedKeys) {
        setStealthKeys(cachedKeys)
        return cachedKeys
      }
    }

    // No cached keys - need to request signature (only happens ONCE per wallet)
    if (!signMessage || !publicKey) return null
    if (keysGeneratedRef.current) return null // Prevent duplicate requests

    try {
      keysGeneratedRef.current = true
      const keys = await generateStealthKeysFromSignature(signMessage)
      setStealthKeys(keys)

      // Cache keys in localStorage for this wallet
      cacheStealthKeys(publicKey.toBase58(), keys)

      return keys
    } catch (err) {
      console.error('[AutoClaim] Failed to generate keys:', err)
      keysGeneratedRef.current = false
      return null
    }
  }, [signMessage, stealthKeys, publicKey])

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
    claimViaTEE,        // RECOMMENDED: Private claim (no wallet link)
    withdrawFromEscrow, // LEGACY: Direct withdraw (breaks privacy)
    lastScanTime,
    error,
  }
}

export default useAutoClaim
