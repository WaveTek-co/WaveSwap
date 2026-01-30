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
const DEVNET_RPC = 'https://api.devnet.solana.com'
const MAGICBLOCK_RPC = 'https://devnet.magicblock.app'

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
  type: 'per' | 'mixer'
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

      if (deposit.type === 'per') {
        // PER flow: Send execute_per_transfer to MagicBlock rollup
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

        await rollupConnection.confirmTransaction(signature, 'confirmed')
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
        await connection.confirmTransaction(signature, 'confirmed')
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

      console.log(`[AutoClaim] Found ${foundCount} deposits for us`)
      return foundCount
    } catch (err) {
      console.error('[AutoClaim] Scan error:', err)
      return 0
    }
  }, [connection, pendingClaims, delegatedDeposits])

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
      await connection.confirmTransaction(signature, 'confirmed')

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

  // Auto-trigger Magic Actions
  useEffect(() => {
    if (!connected || !publicKey || delegatedDeposits.length === 0) return

    const triggerAll = async () => {
      for (const deposit of delegatedDeposits) {
        if (processedDepositsRef.current.has(deposit.depositAddress)) continue
        console.log('[AutoClaim] Auto-triggering:', deposit.depositAddress)
        await triggerMagicAction(deposit)
        await new Promise(r => setTimeout(r, 1000))
      }
    }

    const timeout = setTimeout(triggerAll, 2000)
    return () => clearTimeout(timeout)
  }, [delegatedDeposits, connected, publicKey, triggerMagicAction])

  // Auto-claim
  useEffect(() => {
    const pendingCount = pendingClaims.filter(c => c.status === 'pending').length
    if (pendingCount > 0 && connected && publicKey) {
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
