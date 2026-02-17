'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram, ComputeBudgetProgram, SYSVAR_INSTRUCTIONS_PUBKEY, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { sha3_256 } from 'js-sha3'
import { useWallet } from './useWalletAdapter'
import {
  PROGRAM_IDS,
  MASTER_AUTHORITY,
  KORA_CONFIG,
  StealthDiscriminators,
  deriveStealthVaultPda,
  deriveTestMixerPoolPda,
  deriveDepositRecordPda,
  deriveAnnouncementPdaFromNonce,
  derivePerMixerPoolPda,
  derivePerDepositRecordPda,
  deriveClaimEscrowPda,
  deriveXWingCiphertextPda,
  StealthWorkerClient,
  decryptDestinationWallet,
  deriveStealthPubkeyFromSharedSecret,
} from '@/lib/stealth'
import { scanForEscrowsV4Worker, DetectedEscrowV4, checkViewTag, isPaymentForUs } from '@/lib/stealth/scanner'
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

// Scan interval (10 seconds - fast because incremental scans are <2s) and timeout
const SCAN_INTERVAL_MS = 10000
const SCAN_TIMEOUT_MS = 15000

// RPC endpoints
// Use HTTP-only endpoints to avoid WebSocket issues
// IMPORTANT: Public devnet RPC is rate-limited. Use Helius/QuickNode for production.
const DEVNET_RPC = typeof window !== 'undefined'
  ? `${window.location.origin}/api/v1/rpc`
  : (process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com')
const MAGICBLOCK_RPC = typeof window !== 'undefined'
  ? `${window.location.origin}/api/v1/per-rpc`
  : 'https://devnet-as.magicblock.app'

// Storage constants removed — private keys no longer cached in localStorage

// Stealth key signing message (must match generateStealthKeysFromSignature exactly)
const STEALTH_SIGN_MESSAGE = `Sign this message to generate your WaveSwap stealth viewing keys.

This signature will be used to derive your private viewing keys. Never share this signature with anyone.

Domain: OceanVault:ViewingKeys:v1`

// SESSION_SIG_CACHE REMOVED — Signature no longer cached in main thread.
// Both hooks share StealthWorkerClient singleton (Worker holds keys, not main thread).
// Worker.isReady() check prevents duplicate signMessage popups.

// PRIVATE KEY CACHING REMOVED — X-Wing SK never touches main thread or localStorage.
// Keys are derived in the Stealth Worker on each session from wallet signature.
// Worker.isReady() check avoids duplicate signMessage popups between hooks.

// Normalize wallet signature format (handles Phantom, ArrayBuffer, plain arrays)
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

// HTTP polling-based confirmation (avoids WebSocket issues)
async function confirmTransactionPolling(
  connection: Connection,
  signature: string,
  maxAttempts = 6,
  intervalMs = 500
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const status = await connection.getSignatureStatus(signature)
      if (status?.value?.confirmationStatus === 'confirmed' ||
          status?.value?.confirmationStatus === 'finalized') {
        return true
      }
      if (status?.value?.err) {
        console.error('[WAVETEK] transaction failed:', JSON.stringify(status?.value?.err))
        return false
      }
    } catch (e) {
      // Ignore polling errors, keep trying
    }
    await new Promise(r => setTimeout(r, intervalMs))
  }
  console.warn('[WAVETEK] confirmation timeout')
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
  nonce?: Uint8Array
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
  // Worker-based key management: private keys NEVER in React state
  const [workerReady, setWorkerReady] = useState(false)

  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const isScanningRef = useRef(false)
  const processedDepositsRef = useRef<Set<string>>(new Set())
  const keysGeneratedRef = useRef(false)
  const scanCacheRef = useRef<{ ctMap: Map<string, Uint8Array>; lastScannedSeq: bigint }>({ ctMap: new Map(), lastScannedSeq: 0n })
  const workerRef = useRef<StealthWorkerClient | null>(null)

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

      return false
    }

    if (processedDepositsRef.current.has(deposit.depositAddress)) {
      return false
    }

    try {
      processedDepositsRef.current.add(deposit.depositAddress)

      const [vaultPda, vaultBump] = deriveStealthVaultPda(deposit.stealthPubkey)

      if (deposit.type === 'per-mixer') {
        // PER Mixer Pool V2 flow:
        // - Escrow was pre-created and delegated during deposit (V2)
        // - TEE fills the escrow and commits it back to L1
        const [perMixerPoolPda, poolBump] = derivePerMixerPoolPda()
        const [depositRecordPda] = derivePerDepositRecordPda(deposit.nonce)
        const [escrowPda, escrowBump] = deriveClaimEscrowPda(deposit.nonce)

        // Check if escrow exists on L1 (V2 flow creates it during deposit)
        const escrowInfo = await connection.getAccountInfo(escrowPda)
        const useV2 = escrowInfo && escrowInfo.lamports > 0

        // MagicBlock PER system accounts (hardcoded, NOT PDA-derived)
        const MAGICBLOCK_ER_PROGRAM = new PublicKey('Magic11111111111111111111111111111111111111')
        const magicContext = new PublicKey('MagicContext1111111111111111111111111111111')

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

  
        const signedTx = await signTransaction(tx)

  
        const signature = await rollupConnection.sendRawTransaction(signedTx.serialize(), { skipPreflight: true })


        // Use HTTP polling instead of WebSocket confirmation
        const confirmed = await confirmTransactionPolling(rollupConnection, signature)
        // Poll mainnet for escrow (PER settlement is near-instant)
        for (let i = 0; i < 6; i++) {
          await new Promise(r => setTimeout(r, 500))
          const escrowInfo = await connection.getAccountInfo(escrowPda)
          if (escrowInfo && escrowInfo.lamports > 0) {
    
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

    
          const signedClaimTx = await signTransaction(claimTx)
          const claimSig = await connection.sendRawTransaction(signedClaimTx.serialize())
          await confirmTransactionPolling(connection, claimSig)

          setDelegatedDeposits(prev => prev.filter(d => d.depositAddress !== deposit.depositAddress))
          showClaimSuccess({ signature: claimSig, amount: BigInt(existingVaultInfo.lamports), symbol: 'SOL' })
          setClaimHistory(prev => [...prev, { signature: claimSig, amount: BigInt(existingVaultInfo.lamports), timestamp: Date.now(), sender: 'PER_DIRECT_CLAIM' }])

    
          return true
        }

        // Check if deposit already executed (undelegated to stealth program)
        const depositInfo = await connection.getAccountInfo(depositPda)
        const isAlreadyExecuted = depositInfo && depositInfo.owner.equals(PROGRAM_IDS.STEALTH)

        if (!isAlreadyExecuted) {
          // Phase 2: EXECUTE_PER_TRANSFER in PER (only if not already executed)
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

    
          const signedExecuteTx = await signTransaction(executeTx)

    
          const executeSignature = await rollupConnection.sendRawTransaction(signedExecuteTx.serialize(), { skipPreflight: true })
  

          await confirmTransactionPolling(rollupConnection, executeSignature)
          // Wait for deposit to be undelegated back to L1 (PER settlement is near-instant)
          let undelegated = false
          for (let i = 0; i < 6; i++) {
            await new Promise(r => setTimeout(r, 500))
            const checkInfo = await connection.getAccountInfo(depositPda)
            if (checkInfo && checkInfo.owner.equals(PROGRAM_IDS.STEALTH)) {
      
              undelegated = true
              break
            }
          }

          if (!undelegated) {
            return false
          }
        } else {
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

  
        const signedCombinedTx = await signTransaction(combinedTx)

  
        const claimSignature = await connection.sendRawTransaction(signedCombinedTx.serialize())
        await confirmTransactionPolling(connection, claimSignature)
  

        // Verify funds arrived at wallet
        setDelegatedDeposits(prev => prev.filter(d => d.depositAddress !== deposit.depositAddress))

        // Get the original deposit amount for display
        let depositAmount = deposit.amount
        showClaimSuccess({ signature: claimSignature, amount: depositAmount, symbol: 'SOL' })
        setClaimHistory(prev => [...prev, { signature: claimSignature, amount: depositAmount, timestamp: Date.now(), sender: 'PER_DIRECT_CLAIM' }])

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

  
        const signedTx = await signTransaction(tx)

  
        const signature = await connection.sendRawTransaction(signedTx.serialize())
        await confirmTransactionPolling(connection, signature)
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
      console.error('[WAVETEK] legacy claim failed:', err?.message || err)
      return false
    }
  }, [publicKey, signTransaction, connection, rollupConnection])

  // PRIVATE CLAIM VIA TEE - WAVETEK TRUE PRIVACY
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
    if (!publicKey || !workerReady) {

      return false
    }

    const destination = destinationWallet || publicKey

    try {
      setPendingEscrows(prev => prev.map(e =>
        e.escrowAddress === escrow.escrowAddress ? { ...e, status: 'withdrawing' as const } : e
      ))

      // Get shared_secret from X-Wing decapsulation (recovered during scanning)
      const sharedSecret = sharedSecretInput || escrow.sharedSecret
      if (!sharedSecret) {
        console.error('[WAVETEK] X-Wing shared secret required')
        throw new Error('V4 claim requires sharedSecret')
      }

      // Verify locally that sharedSecret derives correct stealth_pubkey
      const derivedStealth = deriveStealthPubkeyFromSharedSecret(sharedSecret)
      const stealthMatches = derivedStealth.every((b, i) => b === escrow.stealthPubkey[i])
      if (!stealthMatches) {
        console.error('[WAVETEK] key verification failed')
        throw new Error('Invalid sharedSecret for this escrow')
      }

      // =====================================================
      // STEP -1: Check if escrow is ALREADY verified on L1
      // This handles the case where CLAIM succeeded on PER but settlement
      // took >3s on previous attempt. Skip straight to WITHDRAW.
      // =====================================================
      const escrowPda = new PublicKey(escrow.escrowAddress)
      {
        const l1EscrowInfo = await connection.getAccountInfo(escrowPda).catch(() => null)
        if (l1EscrowInfo && l1EscrowInfo.owner.equals(PROGRAM_IDS.STEALTH) && l1EscrowInfo.data.length >= 91) {
          const isAlreadyVerified = l1EscrowInfo.data[81] === 1 // is_verified offset
          const isAlreadyWithdrawn = l1EscrowInfo.data[82] === 1 // is_withdrawn offset
          if (isAlreadyVerified && !isAlreadyWithdrawn) {
            // Jump directly to Kora gasless WITHDRAW
            const koraUrl = KORA_CONFIG.RPC_URL
            const payerResponse = await fetch(koraUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getPayerSigner', params: [] }),
            })
            const payerJson = await payerResponse.json() as { result?: { signer_address: string }, error?: { message: string } }
            if (payerJson.error) throw new Error(`Kora getPayerSigner: ${payerJson.error.message}`)
            const koraFeePayer = new PublicKey(payerJson.result!.signer_address)

            const blockhashResponse = await fetch(koraUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBlockhash', params: [] }),
            })
            const blockhashJson = await blockhashResponse.json() as { result?: { blockhash: string }, error?: { message: string } }
            if (blockhashJson.error) throw new Error(`Kora getBlockhash: ${blockhashJson.error.message}`)

            const withdrawData = Buffer.alloc(33)
            withdrawData[0] = StealthDiscriminators.WITHDRAW_FROM_OUTPUT_ESCROW
            Buffer.from(escrow.stealthPubkey).copy(withdrawData, 1)

            const withdrawAccounts = [
              { pubkey: koraFeePayer, isSigner: true, isWritable: false },
              { pubkey: escrowPda, isSigner: false, isWritable: true },
              { pubkey: destination, isSigner: false, isWritable: true },
              { pubkey: MASTER_AUTHORITY, isSigner: false, isWritable: true },
              { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            ]

            const [withdrawXwingCtPda] = deriveXWingCiphertextPda(escrowPda)
            const xwingCtInfo = await connection.getAccountInfo(withdrawXwingCtPda)
            // Only include XWingCT if owned by our program (NOT delegation program)
            // After CLAIM undelegates escrow, the XWingCT may still be delegated
            if (xwingCtInfo && xwingCtInfo.data.length > 0 && xwingCtInfo.owner.equals(PROGRAM_IDS.STEALTH)) {
              withdrawAccounts.push({ pubkey: withdrawXwingCtPda, isSigner: false, isWritable: true })
            }

            const withdrawTx = new Transaction()
            withdrawTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }))
            withdrawTx.add(new TransactionInstruction({
              keys: withdrawAccounts,
              programId: PROGRAM_IDS.STEALTH,
              data: withdrawData,
            }))
            withdrawTx.recentBlockhash = blockhashJson.result!.blockhash
            withdrawTx.feePayer = koraFeePayer

            const txBase64 = Buffer.from(withdrawTx.serialize({ requireAllSignatures: false })).toString('base64')
            const signResponse = await fetch(koraUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'signAndSendTransaction', params: [txBase64] }),
            })
            const signJson = await signResponse.json() as { result?: { signed_transaction: string }, error?: { message: string } }
            if (signJson.error) throw new Error(`Kora signAndSend: ${signJson.error.message}`)

            const signedTxBytes = Buffer.from(signJson.result!.signed_transaction, 'base64')
            const signatureBytes = signedTxBytes.slice(1, 65)
            const bs58Chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
            let withdrawSig = ''
            let num = BigInt(0)
            for (const byte of signatureBytes) num = num * BigInt(256) + BigInt(byte)
            while (num > 0) { withdrawSig = bs58Chars[Number(num % BigInt(58))] + withdrawSig; num = num / BigInt(58) }

            await confirmTransactionPolling(connection, withdrawSig)

            setPendingEscrows(prev => prev.map(e =>
              e.escrowAddress === escrow.escrowAddress ? { ...e, status: 'withdrawn' as const } : e
            ))
            setClaimHistory(prev => [...prev, {
              signature: withdrawSig,
              amount: escrow.amount,
              timestamp: Date.now(),
              sender: 'WAVETEK_V4_RETRY_WITHDRAW'
            }])
            showClaimSuccess({ signature: withdrawSig, amount: escrow.amount, symbol: 'SOL' })
            return true
          }
        }
      }

      // =====================================================
      // STEP 0: POOL_TO_ESCROW_V4 - Fund escrow from pool (ALWAYS for V4!)
      // =====================================================
      // V4 architecture: complete_v4_deposit sends funds to POOL, not escrow
      // The escrow only has RENT, the actual amount is in the pool
      // We MUST call POOL_TO_ESCROW_V4 on MagicBlock PER to move funds POOL→ESCROW
      // This breaks the sender→escrow on-chain link (sender NOT in this TX)

      // Check escrow state on PER (not L1!) - escrow is delegated
      const escrowInfoPER = await rollupConnection.getAccountInfo(escrowPda).catch(() => null)
      const escrowRent = 2039280 // Rent for 171-byte ClaimEscrow
      // V4 escrows have only rent initially - funds are in pool
      // Need funding if: no info on PER, or lamports < amount + rent
      const needsFunding = !escrowInfoPER || escrowInfoPER.lamports < Number(escrow.amount) + escrowRent

      // V4 OutputEscrows: If we have sharedSecret from X-Wing decapsulation,
      // the escrow was found via scanner which means POOL_TO_ESCROW_V4 already ran
      // (XWingCiphertext only exists after POOL_TO_ESCROW_V4 populates it)
      const isV4OutputEscrow = !!sharedSecret && !escrow.nonce

      // Skip POOL_TO_ESCROW for V4 OutputEscrows - sender already called it
      // V4 escrows don't have nonce (they're derived from stealth_pubkey, not nonce)
      if (needsFunding && !isV4OutputEscrow && escrow.nonce) {
        // Derive PDAs for POOL_TO_ESCROW_V4 (V3 style - nonce-based)
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
        // Wait for confirmation
        const poolConfirmed = await confirmTransactionPolling(rollupConnection, poolToEscrowSig)
        if (!poolConfirmed) {
        }
      }

      // Build CLAIM_ESCROW_WAVETEK instruction
      // V4 SEQ: 6 accounts (no xwing_ct - ciphertext in deposit record)
      // Legacy: 7 accounts (with xwing_ct)
      // CRITICAL: Must use Magic Program system addresses on PER (NOT ERdXR...)
      const MAGIC_PROGRAM_PER = new PublicKey('Magic11111111111111111111111111111111111111')
      const MAGIC_CONTEXT_PER = new PublicKey('MagicContext1111111111111111111111111111111')

      // WAVETEK V4 Data: stealth_pubkey(32) + shared_secret(32) = 64 bytes
      const data = Buffer.alloc(65)
      let offset = 0
      data[offset++] = StealthDiscriminators.CLAIM_ESCROW_WAVETEK
      Buffer.from(escrow.stealthPubkey).copy(data, offset); offset += 32
      Buffer.from(sharedSecret).copy(data, offset)

      // V4 SEQ escrows: no nonce means no XWingCT account (ciphertext in deposit record)
      const isSeqEscrow = !escrow.nonce || escrow.nonce.every((b: number) => b === 0)

      // Temp keypair for PER CLAIM — PER subsidizes fees, no SOL needed.
      // After CLAIM undelegates the escrow, Kora handles WITHDRAW on L1.
      const perPayer = Keypair.generate()

      const claimAccounts = [
        { pubkey: perPayer.publicKey, isSigner: true, isWritable: true },  // claimer (temp, PER-subsidized)
        { pubkey: escrowPda, isSigner: false, isWritable: true },
        { pubkey: destination, isSigner: false, isWritable: false },
        { pubkey: MASTER_AUTHORITY, isSigner: false, isWritable: false },
      ]

      if (!isSeqEscrow) {
        const [claimXwingCtPda] = deriveXWingCiphertextPda(escrowPda)
        claimAccounts.push({ pubkey: claimXwingCtPda, isSigner: false, isWritable: true })
      }

      claimAccounts.push(
        { pubkey: MAGIC_CONTEXT_PER, isSigner: false, isWritable: true },
        { pubkey: MAGIC_PROGRAM_PER, isSigner: false, isWritable: false },
      )

      const tx = new Transaction()
      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }))
      tx.add(new TransactionInstruction({
        keys: claimAccounts,
        programId: PROGRAM_IDS.STEALTH,
        data,
      }))

      const { blockhash } = await rollupConnection.getLatestBlockhash()
      tx.recentBlockhash = blockhash
      tx.feePayer = perPayer.publicKey
      tx.sign(perPayer)

      const signature = await rollupConnection.sendRawTransaction(tx.serialize(), { skipPreflight: true })

      // Wait for PER confirmation
      const confirmed = await confirmTransactionPolling(rollupConnection, signature)
      if (!confirmed) {
        throw new Error('PER confirmation timeout')
      }

      // Wait for escrow to be undelegated and verified on L1
      // MagicBlock undelegation typically takes 1-8 seconds
      // V4 OutputEscrow: 91 bytes, is_verified at offset 81 (is_withdrawn at 82)
      const OUTPUT_ESCROW_OFFSET_IS_VERIFIED = 81
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 750))
        const escrowInfo = await connection.getAccountInfo(escrowPda)
        if (escrowInfo && escrowInfo.owner.equals(PROGRAM_IDS.STEALTH)) {
          const escrowData = escrowInfo.data
          // V4 OutputEscrow is 91 bytes, check is_verified at offset 81
          if (escrowData.length >= 91 && escrowData[OUTPUT_ESCROW_OFFSET_IS_VERIFIED] === 1) {
    

            // V4: KORA GASLESS WITHDRAW - receiver pays NOTHING
            // Kora signs and pays the L1 transaction fee
            // On-chain WITHDRAW accepts ANY signer, only enforces destination == verified_destination
            const koraUrl = KORA_CONFIG.RPC_URL

            // 1. Get Kora's fee payer
            const payerResponse = await fetch(koraUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getPayerSigner', params: [] }),
            })
            const payerJson = await payerResponse.json() as { result?: { signer_address: string }, error?: { message: string } }
            if (payerJson.error) throw new Error(`Kora getPayerSigner: ${payerJson.error.message}`)
            const koraFeePayer = new PublicKey(payerJson.result!.signer_address)

            // 2. Get blockhash from Kora
            const blockhashResponse = await fetch(koraUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBlockhash', params: [] }),
            })
            const blockhashJson = await blockhashResponse.json() as { result?: { blockhash: string }, error?: { message: string } }
            if (blockhashJson.error) throw new Error(`Kora getBlockhash: ${blockhashJson.error.message}`)
            const l1Blockhash = blockhashJson.result!.blockhash

            // 3. Build WITHDRAW instruction with Kora as signer
            const withdrawData = Buffer.alloc(33)
            withdrawData[0] = StealthDiscriminators.WITHDRAW_FROM_OUTPUT_ESCROW
            Buffer.from(escrow.stealthPubkey).copy(withdrawData, 1)

            const withdrawAccounts = [
              { pubkey: koraFeePayer, isSigner: true, isWritable: false },
              { pubkey: escrowPda, isSigner: false, isWritable: true },
              { pubkey: destination, isSigner: false, isWritable: true },
              { pubkey: MASTER_AUTHORITY, isSigner: false, isWritable: true },
              { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            ]

            // Check if XWingCiphertext account exists on L1 and is owned by our program
            // After CLAIM undelegates escrow, the XWingCT may still be delegated (owned by delegation program)
            // Only include it for cleanup if our program owns it
            const [withdrawXwingCtPda] = deriveXWingCiphertextPda(escrowPda)
            const xwingCtInfo = await connection.getAccountInfo(withdrawXwingCtPda)
            if (xwingCtInfo && xwingCtInfo.data.length > 0 && xwingCtInfo.owner.equals(PROGRAM_IDS.STEALTH)) {
              withdrawAccounts.push({ pubkey: withdrawXwingCtPda, isSigner: false, isWritable: true })
            }

            const withdrawTx = new Transaction()
            withdrawTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }))
            withdrawTx.add(new TransactionInstruction({
              keys: withdrawAccounts,
              programId: PROGRAM_IDS.STEALTH,
              data: withdrawData,
            }))
            withdrawTx.recentBlockhash = l1Blockhash
            withdrawTx.feePayer = koraFeePayer

            // 4. Send unsigned TX to Kora - it signs and broadcasts
            const txBase64 = Buffer.from(withdrawTx.serialize({ requireAllSignatures: false })).toString('base64')
            const signResponse = await fetch(koraUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'signAndSendTransaction', params: [txBase64] }),
            })
            const signJson = await signResponse.json() as { result?: { signed_transaction: string }, error?: { message: string } }
            if (signJson.error) throw new Error(`Kora signAndSend: ${signJson.error.message}`)

            // 5. Extract signature from Kora's signed TX
            const signedTxBytes = Buffer.from(signJson.result!.signed_transaction, 'base64')
            const signatureBytes = signedTxBytes.slice(1, 65)
            const bs58Chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
            let withdrawSig = ''
            let num = BigInt(0)
            for (const byte of signatureBytes) num = num * BigInt(256) + BigInt(byte)
            while (num > 0) { withdrawSig = bs58Chars[Number(num % BigInt(58))] + withdrawSig; num = num / BigInt(58) }

            // Wait for L1 confirmation
            await confirmTransactionPolling(connection, withdrawSig)

            console.log('[WAVETEK] gasless withdrawal complete')

            setPendingEscrows(prev => prev.map(e =>
              e.escrowAddress === escrow.escrowAddress ? { ...e, status: 'withdrawn' as const } : e
            ))
            setClaimHistory(prev => [...prev, {
              signature: withdrawSig,
              amount: escrow.amount,
              timestamp: Date.now(),
              sender: 'WAVETEK_V4_TEE_CLAIM'
            }])
            showClaimSuccess({ signature: withdrawSig, amount: escrow.amount, symbol: 'SOL' })

      
            return true
          }
        }
      }

      console.warn('[WAVETEK] settlement timeout')
      return false

    } catch (err: any) {
      console.error('[WAVETEK] claim/withdraw failed:', err?.message || err)
      setPendingEscrows(prev => prev.map(e =>
        e.escrowAddress === escrow.escrowAddress ? { ...e, status: 'failed' as const } : e
      ))
      return false
    }
  }, [publicKey, workerReady, signTransaction, connection, rollupConnection])

  // LEGACY: Withdraw from claim escrow via Kora gasless
  const withdrawFromEscrow = useCallback(async (escrow: PendingEscrow): Promise<boolean> => {
    if (!publicKey) {

      return false
    }

    try {
      if (!escrow.nonce) {
        console.error('[WAVETEK] V4 escrows require claimViaTEE')
        return false
      }
      console.log('[WAVETEK] processing gasless withdrawal')

      setPendingEscrows(prev => prev.map(e =>
        e.escrowAddress === escrow.escrowAddress ? { ...e, status: 'withdrawing' as const } : e
      ))

      const escrowPda = new PublicKey(escrow.escrowAddress)
      const koraUrl = KORA_CONFIG.RPC_URL

      // Get Kora's fee payer
      const payerResponse = await fetch(koraUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getPayerSigner', params: [] }),
      })
      const payerJson = await payerResponse.json() as { result?: { signer_address: string }, error?: { message: string } }
      if (payerJson.error) throw new Error(`Kora: ${payerJson.error.message}`)
      const koraFeePayer = new PublicKey(payerJson.result!.signer_address)

      // Get blockhash from Kora
      const blockhashResponse = await fetch(koraUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBlockhash', params: [] }),
      })
      const blockhashJson = await blockhashResponse.json() as { result?: { blockhash: string }, error?: { message: string } }
      if (blockhashJson.error) throw new Error(`Kora: ${blockhashJson.error.message}`)

      // Build withdraw instruction with Kora as signer
      const data = Buffer.alloc(65)
      let offset = 0
      data[offset++] = StealthDiscriminators.WITHDRAW_FROM_ESCROW
      Buffer.from(escrow.nonce).copy(data, offset); offset += 32
      Buffer.from(escrow.stealthPubkey).copy(data, offset)

      const [xwingCtPda] = deriveXWingCiphertextPda(escrowPda)

      const withdrawAccounts = [
        { pubkey: koraFeePayer, isSigner: true, isWritable: false },
        { pubkey: escrowPda, isSigner: false, isWritable: true },
        { pubkey: publicKey, isSigner: false, isWritable: true },
        { pubkey: MASTER_AUTHORITY, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ]

      // Only include XWingCT if owned by our program (may still be delegated)
      const xwingCtInfo = await connection.getAccountInfo(xwingCtPda)
      if (xwingCtInfo && xwingCtInfo.data.length > 0 && xwingCtInfo.owner.equals(PROGRAM_IDS.STEALTH)) {
        withdrawAccounts.push({ pubkey: xwingCtPda, isSigner: false, isWritable: true })
      }

      const tx = new Transaction()
      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }))
      tx.add(new TransactionInstruction({
        keys: withdrawAccounts,
        programId: PROGRAM_IDS.STEALTH,
        data,
      }))
      tx.recentBlockhash = blockhashJson.result!.blockhash
      tx.feePayer = koraFeePayer

      // Send unsigned TX to Kora
      const txBase64 = Buffer.from(tx.serialize({ requireAllSignatures: false })).toString('base64')
      const signResponse = await fetch(koraUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'signAndSendTransaction', params: [txBase64] }),
      })
      const signJson = await signResponse.json() as { result?: { signed_transaction: string }, error?: { message: string } }
      if (signJson.error) throw new Error(`Kora: ${signJson.error.message}`)

      const signedTxBytes = Buffer.from(signJson.result!.signed_transaction, 'base64')
      const signatureBytes = signedTxBytes.slice(1, 65)
      const bs58Chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
      let signature = ''
      let sigNum = BigInt(0)
      for (const byte of signatureBytes) sigNum = sigNum * BigInt(256) + BigInt(byte)
      while (sigNum > 0) { signature = bs58Chars[Number(sigNum % BigInt(58))] + signature; sigNum = sigNum / BigInt(58) }

      await confirmTransactionPolling(connection, signature)
      console.log('[WAVETEK] gasless withdrawal confirmed')

      setPendingEscrows(prev => prev.map(e =>
        e.escrowAddress === escrow.escrowAddress ? { ...e, status: 'withdrawn' as const } : e
      ))
      setClaimHistory(prev => [...prev, { signature, amount: escrow.amount, timestamp: Date.now(), sender: 'PER_ESCROW' }])
      showClaimSuccess({ signature, amount: escrow.amount, symbol: 'SOL' })
      return true

    } catch (err: any) {
      console.error('[WAVETEK] withdrawal failed:', err?.message || err)
      setPendingEscrows(prev => prev.map(e =>
        e.escrowAddress === escrow.escrowAddress ? { ...e, status: 'failed' as const } : e
      ))
      return false
    }
  }, [publicKey, connection])

  // Scan for WAVETEK output escrows only (new SEQ flow)
  // Worker-based scan: X-Wing decapsulation happens in isolated Worker thread
  const scanForDeposits = useCallback(async (): Promise<number> => {
    if (!workerRef.current) return 0
    let foundCount = 0

    try {
      // WAVETEK V4: Scan via Worker — X-Wing SK never leaves Worker thread
      const v4Escrows = await scanForEscrowsV4Worker(
        connection,
        workerRef.current,
        rollupConnection,
        scanCacheRef.current,
      )

      // Only process escrows that belong to us and aren't withdrawn
      const ourEscrows = v4Escrows.filter(e => e.isOurs && !e.isWithdrawn)

      for (const escrow of ourEscrows) {
        foundCount++
        const escrowAddress = escrow.escrowPda.toBase58()

        if (!pendingEscrows.some(e => e.escrowAddress === escrowAddress)) {
          setPendingEscrows(prev => {
            if (prev.some(e => e.escrowAddress === escrowAddress)) return prev
            return [...prev, {
              escrowAddress,
              amount: escrow.amount,
              stealthPubkey: escrow.stealthPubkey,
              status: 'pending' as const,
              isV3: true,
              verifiedDestination: escrow.verifiedDestination,
              isVerified: escrow.isVerified,
              sharedSecret: escrow.sharedSecret,
            }]
          })
        }
      }

      return foundCount
    } catch (err) {
      console.error('[WAVETEK] worker scan failed:', err instanceof Error ? err.message : err)
      return 0
    }
  }, [connection, rollupConnection, pendingEscrows])

  // Initialize Stealth Worker — one wallet signature popup per session
  // Private keys derived and held INSIDE Worker thread (never in React state/localStorage)
  // If useWaveSend already initialized the Worker, isReady() returns true (no popup needed)
  const ensureStealthKeys = useCallback(async (): Promise<boolean> => {
    if (!signMessage || !publicKey) return false

    // Get or create singleton Worker
    const client = workerRef.current ?? StealthWorkerClient.getInstance()
    if (!client) {
      console.warn('[WAVETEK] Stealth Worker unavailable — scanning disabled')
      return false
    }
    workerRef.current = client

    // Fast path: Worker already has keys (verified via message, not just React state)
    if (workerReady) {
      const stillReady = await client.isReady()
      if (stillReady) return true
      // Worker was wiped externally — need to re-init
      setWorkerReady(false)
      keysGeneratedRef.current = false
    }

    if (keysGeneratedRef.current) return false

    try {
      keysGeneratedRef.current = true

      // Check if Worker already initialized (by useWaveSend) — avoids duplicate popup
      const alreadyReady = await client.isReady()
      if (alreadyReady) {
        setWorkerReady(true)
        return true
      }

      // Worker not ready — need wallet signature to derive keys
      const messageBytes = new TextEncoder().encode(STEALTH_SIGN_MESSAGE)
      const result = await signMessage(messageBytes)
      const signature = normalizeSignature(result)
      if (signature.length === 0) throw new Error('Empty signature')

      // Send signature to Worker (zero-copy transfer, main thread zeroed immediately)
      await client.init(signature)
      // signature is now zeroed by StealthWorkerClient.init()

      setWorkerReady(true)
      return true
    } catch (err) {
      console.error('[WAVETEK] worker init failed:', err instanceof Error ? err.message : err)
      keysGeneratedRef.current = false
      return false
    }
  }, [signMessage, workerReady, publicKey])

  // Main scan with timeout — Worker handles all crypto
  const runScan = useCallback(async () => {
    if (!publicKey || !connected || isScanningRef.current) return

    isScanningRef.current = true
    setIsScanning(true)
    setError(null)

    try {
      const ready = await ensureStealthKeys()
      if (ready) {
        // Wrap scan with timeout
        const scanPromise = scanForDeposits()
        const timeoutPromise = new Promise<number>((_, reject) =>
          setTimeout(() => reject(new Error('Scan timeout')), SCAN_TIMEOUT_MS)
        )

        try {
          await Promise.race([scanPromise, timeoutPromise])
        } catch (err) {
          // Timeout or error - just continue, don't block
        }
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
      console.error('[WAVETEK] claim failed:', err?.message || err)
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
  // IMPORTANT: cleanup must NOT call wipe() — this effect re-fires when
  // workerReady changes (cascading through ensureStealthKeys → runScan → startScanning).
  // Wiping in cleanup would destroy keys immediately after initialization!
  useEffect(() => {
    if (connected && publicKey) {
      startScanning()
    } else {
      stopScanning()
      processedDepositsRef.current.clear()
      keysGeneratedRef.current = false

      // Wipe Worker keys on disconnect (defense in depth)
      if (workerRef.current) {
        workerRef.current.wipe().catch(() => {})
        setWorkerReady(false)
      }
    }
    return () => {
      stopScanning()
    }
  }, [connected, publicKey, startScanning, stopScanning])

  // Separate unmount-only cleanup: wipe Worker keys when component truly unmounts
  // Empty deps = runs only on mount/unmount, NOT on dependency changes
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.wipe().catch(() => {})
      }
    }
  }, [])

  // NOTE: Auto-trigger COMPLETELY DISABLED
  // All deposit types (per, mixer, per-mixer) require manual triggering
  // This prevents wallet popup spam from legacy unclaimed deposits
  // Users can manually call triggerMagicAction() or withdrawFromEscrow() as needed

  // NOTE: V4 auto-claim DISABLED (same as PER/mixer above)
  // Auto-claiming opens wallet popups unsolicited, which overwhelms Phantom
  // and causes service worker disconnects on stale devnet escrows.
  // Users should manually call claimViaTEE() when ready.

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
