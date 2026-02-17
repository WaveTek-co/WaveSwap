// WAVETEK Privacy Scanner for WaveSwap
// Scans for OutputEscrow accounts (91 bytes) created by POOL_TO_ESCROW_SEQ flow
//
// TWO-PHASE SCANNING FLOW:
// Phase 1: Find deposit records (1364 bytes) on L1+PER → extract embedded ciphertext (offset 210)
// Phase 2: Derive output escrow PDAs from stealth_pubkey → fetch via getAccountInfo (PER) + L1
// Phase 3: X-Wing decapsulate ciphertext → verify SHA256(sharedSecret || "stealth-derive") == stealth_pubkey
// If match → escrow belongs to us

import { Connection, PublicKey } from "@solana/web3.js";
import { sha256 } from "@noble/hashes/sha256";
import { sha3_256 } from "js-sha3";
import { ed25519 } from "@noble/curves/ed25519";
import {
  PROGRAM_IDS, deriveOutputEscrowPda, deriveXWingCiphertextPda,
  deriveDepositRecordSeqPda, derivePerMixerPoolPda, readBigUint64LE,
} from "./config";
import {
  StealthKeyPair,
  xwingDecapsulate,
  deriveStealthPubkeyFromSharedSecret as cryptoDeriveStealthPubkey,
} from "./crypto";

// Scanner queries BOTH L1 and PER:
// - L1: undelegated output escrows (claimed/withdrawn)
// - PER: delegated output escrows (fresh amounts) + deposit records (ciphertext for X-Wing)

// Re-export from crypto for backwards compatibility
export { cryptoDeriveStealthPubkey as deriveStealthPubkeyFromSharedSecret };

// ═══════════════════════════════════════════════════════════════════════════
// WAVETEK CONSTANTS - MUST MATCH ON-CHAIN EXACTLY
// ═══════════════════════════════════════════════════════════════════════════

// WAVETEK V4: OutputEscrow discriminator and size (created by POOL_TO_ESCROW_V4)
// OutputEscrow is the privacy-preserving output - derived from stealth_pubkey, NOT nonce
const OUTPUT_ESCROW_DISCRIMINATOR = new Uint8Array([0x4f, 0x55, 0x54, 0x50, 0x55, 0x54, 0x45, 0x53]); // "OUTPUTES" as bytes
const OUTPUT_ESCROW_SIZE = 91;

// OutputEscrow layout offsets (from per_mixer.rs)
// discriminator(8) + bump(1) + stealth_pubkey(32) + amount(8) +
// verified_destination(32) + is_verified(1) + is_withdrawn(1) + reserved(8) = 91 bytes
const ESCROW_OFFSET_DISCRIMINATOR = 0;
const ESCROW_OFFSET_BUMP = 8;
const ESCROW_OFFSET_STEALTH_PUBKEY = 9;  // Starts right after bump!
const ESCROW_OFFSET_AMOUNT = 41;          // 9 + 32 = 41
const ESCROW_OFFSET_VERIFIED_DEST = 49;   // 41 + 8 = 49
const ESCROW_OFFSET_IS_VERIFIED = 81;     // 49 + 32 = 81
const ESCROW_OFFSET_IS_WITHDRAWN = 82;    // 81 + 1 = 82

// Legacy ClaimEscrow (for backwards compatibility with V3)
const CLAIM_ESCROW_DISCRIMINATOR = new Uint8Array([0x43, 0x4c, 0x41, 0x49, 0x4d, 0x45, 0x53, 0x43]); // "CLAIMESC"
const CLAIM_ESCROW_SIZE = 171;

// XWingCiphertextAccount discriminator and size
const XWING_CT_DISCRIMINATOR = new Uint8Array([0x58, 0x57, 0x49, 0x4e, 0x47, 0x43, 0x54, 0x00]); // "XWINGCT\0"
const XWING_CT_SIZE = 1160;
const XWING_CT_OFFSET_ESCROW_PDA = 8;
const XWING_CT_OFFSET_CIPHERTEXT = 40;
const XWING_CIPHERTEXT_LENGTH = 1120;

// ═══════════════════════════════════════════════════════════════════════════
// WAVETEK TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface DetectedEscrowV4 {
  escrowPda: PublicKey;
  amount: bigint;
  stealthPubkey: Uint8Array;
  verifiedDestination?: Uint8Array;
  isVerified: boolean;
  isWithdrawn: boolean;
  // WAVETEK: Auto-recovered from X-Wing decapsulation
  sharedSecret?: Uint8Array;
  isOurs: boolean;
}

export interface ScannerConfig {
  connection: Connection;
  pollIntervalMs?: number;
  maxAnnouncements?: number;
}

export interface DetectedPayment {
  announcementPda: PublicKey;
  vaultPda: PublicKey;
  sender: PublicKey;
  ephemeralPubkey: Uint8Array;
  stealthPubkey: Uint8Array;
  viewTag: number;
  amount: bigint;
  isClaimed: boolean;
  slot: number;
}

// Legacy type alias for backwards compatibility
export type DetectedEscrowV3 = DetectedEscrowV4;

// ═══════════════════════════════════════════════════════════════════════════
// WAVETEK CORE CRYPTOGRAPHY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Verify that a stealth pubkey was derived from a shared secret
 * Returns true if SHA256(sharedSecret || "stealth-derive") == expectedStealthPubkey
 * Uses cryptoDeriveStealthPubkey from crypto.ts (matches on-chain exactly)
 */
export function verifyStealthPubkey(
  sharedSecret: Uint8Array,
  expectedStealthPubkey: Uint8Array
): boolean {
  const derived = cryptoDeriveStealthPubkey(sharedSecret);
  if (derived.length !== expectedStealthPubkey.length) return false;
  // Constant-time comparison (prevents timing side-channel)
  let diff = 0;
  for (let i = 0; i < derived.length; i++) {
    diff |= derived[i] ^ expectedStealthPubkey[i];
  }
  return diff === 0;
}

/**
 * Check if a WAVETEK escrow belongs to us using X-Wing decapsulation
 *
 * FLOW:
 * 1. Decapsulate X-Wing ciphertext → sharedSecret
 * 2. Verify: SHA256(sharedSecret || "stealth-derive") == escrow.stealth_pubkey
 * 3. If match → THIS ESCROW IS OURS
 */
export function isEscrowForUs(
  keys: StealthKeyPair,
  stealthPubkey: Uint8Array,
  xwingCiphertext: Uint8Array
): { isOurs: boolean; sharedSecret?: Uint8Array } {
  // Must have X-Wing keys
  if (!keys.xwingKeys) {
    return { isOurs: false };
  }

  // Validate ciphertext length
  if (xwingCiphertext.length !== XWING_CIPHERTEXT_LENGTH) {
    return { isOurs: false };
  }

  try {
    // Step 1: X-Wing decapsulation
    const sharedSecret = xwingDecapsulate(keys.xwingKeys.secretKey, xwingCiphertext);

    // Step 2: Verify stealth pubkey derivation
    if (!verifyStealthPubkey(sharedSecret, stealthPubkey)) {
      // Decapsulation succeeded but stealth pubkey doesn't match - this is normal
      return { isOurs: false };
    }

    // Step 3: SUCCESS - This escrow is ours!
    return { isOurs: true, sharedSecret };
  } catch {
    // Decapsulation failed - escrow not ours (normal during scanning)
    return { isOurs: false };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// WAVETEK SCANNER
// ═══════════════════════════════════════════════════════════════════════════


/**
 * WAVETEK SEQ Privacy Scanner
 *
 * TWO-PHASE APPROACH:
 * Phase 1: Find deposit records (1364 bytes) → extract ciphertext + stealth_pubkey
 * Phase 2: Derive output escrow PDAs → fetch from PER (getAccountInfo) and L1
 *
 * This is more robust than getProgramAccounts on PER (which may not work on
 * MagicBlock ephemeral rollups). Uses getAccountInfo which is universally supported.
 */
// Delegation program ID (accounts delegated to MagicBlock PER)
const DELEGATION_PROGRAM_ID = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");

// Deposit record layout (PerDepositRecord base=210 + ciphertext=1120 + sender=32 + flag=2 = 1364)
const DEPOSIT_RECORD_SIZE = 1364;
const DEPOSIT_RECORD_DISCRIMINATOR = new Uint8Array([0x50, 0x45, 0x52, 0x44, 0x45, 0x50, 0x52, 0x43]); // "PERDEPRC"
const DEPOSIT_RECORD_CT_OFFSET = 210; // Ciphertext starts right after 210-byte base struct
const DEPOSIT_RECORD_STEALTH_OFFSET = 57; // stealth_pubkey at offset 57 in base struct

/**
 * Parse an OutputEscrow from account data (91 bytes)
 */
function parseOutputEscrow(
  pubkey: PublicKey,
  data: Buffer | Uint8Array
): {
  stealthPubkey: Uint8Array;
  amount: bigint;
  verifiedDestination: Uint8Array;
  isVerified: boolean;
  isWithdrawn: boolean;
} | null {
  if (data.length < OUTPUT_ESCROW_SIZE) return null;

  // Byte-level discriminator comparison (not string — avoids encoding ambiguity)
  const disc = new Uint8Array(data.slice(0, 8));
  if (disc.length !== OUTPUT_ESCROW_DISCRIMINATOR.length) return null;
  for (let i = 0; i < 8; i++) {
    if (disc[i] !== OUTPUT_ESCROW_DISCRIMINATOR[i]) return null;
  }

  const stealthPubkey = new Uint8Array(data.slice(ESCROW_OFFSET_STEALTH_PUBKEY, ESCROW_OFFSET_STEALTH_PUBKEY + 32));

  // Verify PDA derivation
  const [expectedPda] = deriveOutputEscrowPda(stealthPubkey);
  if (!pubkey.equals(expectedPda)) return null;

  let amount = BigInt(0);
  for (let i = 0; i < 8; i++) {
    amount |= BigInt(data[ESCROW_OFFSET_AMOUNT + i]) << BigInt(i * 8);
  }

  return {
    stealthPubkey,
    amount,
    verifiedDestination: new Uint8Array(data.slice(ESCROW_OFFSET_VERIFIED_DEST, ESCROW_OFFSET_VERIFIED_DEST + 32)),
    isVerified: data[ESCROW_OFFSET_IS_VERIFIED] === 1,
    isWithdrawn: data[ESCROW_OFFSET_IS_WITHDRAWN] === 1,
  };
}

/**
 * @param cache Optional persistent cache across scans. Stores ctMap entries and last scanned seqId.
 *              Dramatically speeds up repeated scans by only fetching NEW deposit records.
 */
export async function scanForEscrowsV4(
  connection: Connection,
  keys: StealthKeyPair,
  perConnection?: Connection,
  cache?: { ctMap: Map<string, Uint8Array>; lastScannedSeq: bigint }
): Promise<DetectedEscrowV4[]> {
  const escrows: DetectedEscrowV4[] = [];

  try {
    // ================================================================
    // PHASE 1: Find deposit records → extract ciphertext + stealth_pubkey
    // Uses sequential PDA derivation (getAccountInfo) instead of getProgramAccounts
    // Incremental: only fetches NEW deposits since last scan (via cache)
    // ================================================================

    // Step 1: Read pool state from PER to get lastDepositedId
    const [poolPda] = derivePerMixerPoolPda();
    let lastDepositedId = 0n;

    for (const conn of [perConnection, connection].filter(Boolean) as Connection[]) {
      try {
        const poolInfo = await conn.getAccountInfo(poolPda);
        if (poolInfo && poolInfo.data.length >= 103) {
          lastDepositedId = readBigUint64LE(new Uint8Array(poolInfo.data), 79);
          if (lastDepositedId > 0n) break;
        }
      } catch {
        // Try next connection
      }
    }

    // Step 2: Build ctMap — use cache for already-scanned deposits, only fetch NEW ones
    const ctMap = new Map<string, Uint8Array>();

    // Restore cached entries (already verified deposit records from previous scans)
    const startSeq = cache ? cache.lastScannedSeq + 1n : 1n;
    if (cache) {
      for (const [hex, ct] of cache.ctMap) {
        ctMap.set(hex, ct);
      }
    }

    // Only fetch deposit records we haven't seen before
    const newDeposits = lastDepositedId >= startSeq ? Number(lastDepositedId - startSeq) + 1 : 0;

    if (newDeposits > 0) {
      const BATCH_SIZE = 20;
      for (let batchStart = startSeq; batchStart <= lastDepositedId; batchStart += BigInt(BATCH_SIZE)) {
        const batch: Promise<void>[] = [];
        for (let seqId = batchStart; seqId <= lastDepositedId && seqId < batchStart + BigInt(BATCH_SIZE); seqId++) {
          const [drPda] = deriveDepositRecordSeqPda(seqId);
          batch.push(
            (async () => {
              for (const conn of [perConnection, connection].filter(Boolean) as Connection[]) {
                try {
                  const info = await conn.getAccountInfo(drPda);
                  if (!info || info.data.length < DEPOSIT_RECORD_SIZE) continue;

                  const data = new Uint8Array(info.data);
                  let validDisc = true;
                  for (let i = 0; i < 8; i++) {
                    if (data[i] !== DEPOSIT_RECORD_DISCRIMINATOR[i]) { validDisc = false; break; }
                  }
                  if (!validDisc) continue;

                  const stealthPubkey = data.slice(DEPOSIT_RECORD_STEALTH_OFFSET, DEPOSIT_RECORD_STEALTH_OFFSET + 32);
                  let isZero = true;
                  for (let i = 0; i < 32; i++) { if (stealthPubkey[i] !== 0) { isZero = false; break; } }
                  if (isZero) continue;

                  const ciphertext = data.slice(DEPOSIT_RECORD_CT_OFFSET, DEPOSIT_RECORD_CT_OFFSET + XWING_CIPHERTEXT_LENGTH);
                  let ctEmpty = true;
                  for (let i = 0; i < 32; i++) { if (ciphertext[i] !== 0) { ctEmpty = false; break; } }
                  if (ctEmpty) continue;

                  const hex = Buffer.from(stealthPubkey).toString('hex');
                  ctMap.set(hex, new Uint8Array(ciphertext));
                  return;
                } catch {
                  // Try next connection
                }
              }
            })()
          );
        }
        await Promise.allSettled(batch);
      }
    }

    // Update cache for next scan
    if (cache && lastDepositedId > 0n) {
      cache.ctMap = ctMap;
      cache.lastScannedSeq = lastDepositedId;
    }

    if (newDeposits > 0) console.debug(`[scanner] +${newDeposits} deposits`);

    // ================================================================
    // PHASE 2: For each deposit record, derive output escrow PDA
    // and fetch it directly from PER (getAccountInfo) + L1
    // This avoids reliance on getProgramAccounts on PER
    // ================================================================
    const accountMap = new Map<string, { pubkey: PublicKey; data: Buffer | Uint8Array }>();

    // 2a: Direct PDA lookups from deposit records (most reliable path)
    const escrowLookups: Promise<void>[] = [];
    for (const [stealthHex] of ctMap) {
      const stealthBytes = new Uint8Array(Buffer.from(stealthHex, 'hex'));
      const [escrowPda] = deriveOutputEscrowPda(stealthBytes);
      const key = escrowPda.toBase58();

      // Fetch from PER first (has fresh data), then L1 as fallback
      escrowLookups.push(
        (async () => {
          // Try PER first (delegated escrow with correct amount)
          if (perConnection) {
            try {
              const perInfo = await perConnection.getAccountInfo(escrowPda);
              if (perInfo && perInfo.data.length >= OUTPUT_ESCROW_SIZE) {
                accountMap.set(key, { pubkey: escrowPda, data: perInfo.data });
                return;
              }
            } catch {
              // PER lookup failed, fall through to L1
            }
          }
          // Fallback: L1 (may be delegated with stale data, or undelegated)
          try {
            const l1Info = await connection.getAccountInfo(escrowPda);
            if (l1Info && l1Info.data.length >= OUTPUT_ESCROW_SIZE) {
              accountMap.set(key, { pubkey: escrowPda, data: l1Info.data });
            }
          } catch {
            // L1 lookup failed
          }
        })()
      );
    }

    // Run direct PDA lookups (Phase 2a is sufficient — every OutputEscrow
    // can be derived deterministically from stealth_pubkey in the deposit record)
    await Promise.allSettled(escrowLookups);

    // ================================================================
    // PHASE 3: Parse escrows and verify ownership via X-Wing decapsulation
    // ================================================================
    for (const { pubkey, data } of accountMap.values()) {
      const parsed = parseOutputEscrow(pubkey, data);
      if (!parsed) continue;
      if (parsed.isWithdrawn) continue;
      // Skip escrows with zero amount (PREPARE_OUTPUT created but POOL_TO_ESCROW not yet run)
      if (parsed.amount === BigInt(0)) continue;

      let sharedSecret: Uint8Array | undefined;
      let isOurs = false;

      if (keys.xwingKeys) {
        // Get ciphertext from deposit record map
        const stealthHex = Buffer.from(parsed.stealthPubkey).toString('hex');
        let xwingCiphertext = ctMap.get(stealthHex);

        // Fallback: try legacy XWingCiphertext account on L1
        if (!xwingCiphertext) {
          try {
            const [xwingCtPda] = deriveXWingCiphertextPda(pubkey);
            const ctInfo = await connection.getAccountInfo(xwingCtPda);
            if (ctInfo && ctInfo.data.length >= XWING_CT_SIZE) {
              const ctDisc = new Uint8Array(ctInfo.data.slice(0, 8));
              let ctDiscMatch = true;
              for (let i = 0; i < 8; i++) { if (ctDisc[i] !== XWING_CT_DISCRIMINATOR[i]) { ctDiscMatch = false; break; } }
              if (ctDiscMatch) {
                xwingCiphertext = new Uint8Array(ctInfo.data.slice(XWING_CT_OFFSET_CIPHERTEXT, XWING_CT_OFFSET_CIPHERTEXT + XWING_CIPHERTEXT_LENGTH));
              }
            }
          } catch {
            // Legacy path failed, continue without ciphertext
          }
        }

        if (xwingCiphertext) {
          const result = isEscrowForUs(keys, parsed.stealthPubkey, xwingCiphertext);
          if (result.isOurs) {
            isOurs = true;
            sharedSecret = result.sharedSecret;
          }
        }
      }

      escrows.push({
        escrowPda: pubkey,
        amount: parsed.amount,
        stealthPubkey: parsed.stealthPubkey,
        verifiedDestination: parsed.isVerified ? parsed.verifiedDestination : undefined,
        isVerified: parsed.isVerified,
        isWithdrawn: parsed.isWithdrawn,
        sharedSecret,
        isOurs,
      });
    }

    return escrows;
  } catch (err: any) {
    console.error("[WAVETEK] scan error:", err?.message || err);
    return [];
  }
}

// Alias for backwards compatibility
export const scanForEscrowsV3 = scanForEscrowsV4;

// ═══════════════════════════════════════════════════════════════════════════
// WORKER-BASED SCANNER — Delegates X-Wing decapsulation to Stealth Worker
// X-Wing secret key (2432 bytes) NEVER touches the main thread
// ═══════════════════════════════════════════════════════════════════════════

import type { StealthWorkerClient } from './stealth-worker-client'

/**
 * Worker-based scanner: same RPC fetching as scanForEscrowsV4,
 * but delegates X-Wing decapsulation to the isolated Stealth Worker.
 *
 * SECURITY: X-Wing secret key never leaves the Worker thread.
 * Main thread only receives matched escrow indices + 32-byte sharedSecrets.
 */
export async function scanForEscrowsV4Worker(
  connection: Connection,
  workerClient: StealthWorkerClient,
  perConnection?: Connection,
  cache?: { ctMap: Map<string, Uint8Array>; lastScannedSeq: bigint },
): Promise<DetectedEscrowV4[]> {
  const escrows: DetectedEscrowV4[] = []

  try {
    // ================================================================
    // PHASE 1: Find deposit records → extract ciphertext + stealth_pubkey
    // (identical to scanForEscrowsV4)
    // ================================================================

    const [poolPda] = derivePerMixerPoolPda()
    let lastDepositedId = 0n

    for (const conn of [perConnection, connection].filter(Boolean) as Connection[]) {
      try {
        const poolInfo = await conn.getAccountInfo(poolPda)
        if (poolInfo && poolInfo.data.length >= 103) {
          lastDepositedId = readBigUint64LE(new Uint8Array(poolInfo.data), 79)
          if (lastDepositedId > 0n) break
        }
      } catch {
        // Try next connection
      }
    }

    const ctMap = new Map<string, Uint8Array>()
    const startSeq = cache ? cache.lastScannedSeq + 1n : 1n
    if (cache) {
      for (const [hex, ct] of cache.ctMap) {
        ctMap.set(hex, ct)
      }
    }

    const newDeposits = lastDepositedId >= startSeq ? Number(lastDepositedId - startSeq) + 1 : 0

    if (newDeposits > 0) {
      const BATCH_SIZE = 20
      for (let batchStart = startSeq; batchStart <= lastDepositedId; batchStart += BigInt(BATCH_SIZE)) {
        const batch: Promise<void>[] = []
        for (let seqId = batchStart; seqId <= lastDepositedId && seqId < batchStart + BigInt(BATCH_SIZE); seqId++) {
          const [drPda] = deriveDepositRecordSeqPda(seqId)
          batch.push(
            (async () => {
              for (const conn of [perConnection, connection].filter(Boolean) as Connection[]) {
                try {
                  const info = await conn.getAccountInfo(drPda)
                  if (!info || info.data.length < DEPOSIT_RECORD_SIZE) continue
                  const data = new Uint8Array(info.data)
                  let validDisc = true
                  for (let i = 0; i < 8; i++) {
                    if (data[i] !== DEPOSIT_RECORD_DISCRIMINATOR[i]) { validDisc = false; break }
                  }
                  if (!validDisc) continue
                  const stealthPubkey = data.slice(DEPOSIT_RECORD_STEALTH_OFFSET, DEPOSIT_RECORD_STEALTH_OFFSET + 32)
                  let isZero = true
                  for (let i = 0; i < 32; i++) { if (stealthPubkey[i] !== 0) { isZero = false; break } }
                  if (isZero) continue
                  const ciphertext = data.slice(DEPOSIT_RECORD_CT_OFFSET, DEPOSIT_RECORD_CT_OFFSET + XWING_CIPHERTEXT_LENGTH)
                  let ctEmpty = true
                  for (let i = 0; i < 32; i++) { if (ciphertext[i] !== 0) { ctEmpty = false; break } }
                  if (ctEmpty) continue
                  const hex = Buffer.from(stealthPubkey).toString('hex')
                  ctMap.set(hex, new Uint8Array(ciphertext))
                  return
                } catch {
                  // Try next connection
                }
              }
            })(),
          )
        }
        await Promise.allSettled(batch)
      }
    }

    if (cache && lastDepositedId > 0n) {
      cache.ctMap = ctMap
      cache.lastScannedSeq = lastDepositedId
    }

    if (newDeposits > 0) console.debug(`[scanner-worker] +${newDeposits} deposits`)

    // ================================================================
    // PHASE 2: Derive output escrow PDAs → fetch from PER + L1
    // (identical to scanForEscrowsV4)
    // ================================================================
    const accountMap = new Map<string, { pubkey: PublicKey; data: Buffer | Uint8Array }>()
    const escrowLookups: Promise<void>[] = []

    for (const [stealthHex] of ctMap) {
      const stealthBytes = new Uint8Array(Buffer.from(stealthHex, 'hex'))
      const [escrowPda] = deriveOutputEscrowPda(stealthBytes)
      const key = escrowPda.toBase58()

      escrowLookups.push(
        (async () => {
          if (perConnection) {
            try {
              const perInfo = await perConnection.getAccountInfo(escrowPda)
              if (perInfo && perInfo.data.length >= OUTPUT_ESCROW_SIZE) {
                accountMap.set(key, { pubkey: escrowPda, data: perInfo.data })
                return
              }
            } catch {
              // PER lookup failed
            }
          }
          try {
            const l1Info = await connection.getAccountInfo(escrowPda)
            if (l1Info && l1Info.data.length >= OUTPUT_ESCROW_SIZE) {
              accountMap.set(key, { pubkey: escrowPda, data: l1Info.data })
            }
          } catch {
            // L1 lookup failed
          }
        })(),
      )
    }
    await Promise.allSettled(escrowLookups)

    // ================================================================
    // PHASE 3: Parse escrows + collect ciphertexts for Worker verification
    // Instead of calling xwingDecapsulate locally, we send all deposits
    // to the Worker for batch decapsulation
    // ================================================================

    // First pass: parse all escrows and collect ciphertext pairs
    const parsedEscrows: Array<{
      pubkey: PublicKey
      stealthPubkey: Uint8Array
      amount: bigint
      verifiedDestination: Uint8Array
      isVerified: boolean
      isWithdrawn: boolean
      ciphertext: Uint8Array | null
    }> = []

    for (const { pubkey, data } of accountMap.values()) {
      const parsed = parseOutputEscrow(pubkey, data)
      if (!parsed) continue
      if (parsed.isWithdrawn) continue
      if (parsed.amount === BigInt(0)) continue

      const stealthHex = Buffer.from(parsed.stealthPubkey).toString('hex')
      let xwingCiphertext = ctMap.get(stealthHex) || null

      // Fallback: try legacy XWingCiphertext account on L1
      if (!xwingCiphertext) {
        try {
          const [xwingCtPda] = deriveXWingCiphertextPda(pubkey)
          const ctInfo = await connection.getAccountInfo(xwingCtPda)
          if (ctInfo && ctInfo.data.length >= XWING_CT_SIZE) {
            const ctDisc = new Uint8Array(ctInfo.data.slice(0, 8))
            let ctDiscMatch = true
            for (let i = 0; i < 8; i++) { if (ctDisc[i] !== XWING_CT_DISCRIMINATOR[i]) { ctDiscMatch = false; break } }
            if (ctDiscMatch) {
              xwingCiphertext = new Uint8Array(ctInfo.data.slice(XWING_CT_OFFSET_CIPHERTEXT, XWING_CT_OFFSET_CIPHERTEXT + XWING_CIPHERTEXT_LENGTH))
            }
          }
        } catch {
          // Legacy path failed
        }
      }

      parsedEscrows.push({
        pubkey,
        stealthPubkey: parsed.stealthPubkey,
        amount: parsed.amount,
        verifiedDestination: parsed.verifiedDestination,
        isVerified: parsed.isVerified,
        isWithdrawn: parsed.isWithdrawn,
        ciphertext: xwingCiphertext,
      })
    }

    // Collect deposits that have ciphertext for Worker batch verification
    const depositsForWorker: Array<{ stealthPubkey: Uint8Array; ciphertext: Uint8Array }> = []
    const workerIndexMap: number[] = [] // maps Worker deposit index → parsedEscrows index

    for (let i = 0; i < parsedEscrows.length; i++) {
      if (parsedEscrows[i].ciphertext) {
        workerIndexMap.push(i)
        depositsForWorker.push({
          stealthPubkey: parsedEscrows[i].stealthPubkey,
          ciphertext: parsedEscrows[i].ciphertext!,
        })
      }
    }

    // Send to Worker for batch X-Wing decapsulation
    const matches = depositsForWorker.length > 0
      ? await workerClient.checkEscrows(depositsForWorker)
      : []

    // Build match set for quick lookup
    const matchMap = new Map<number, Uint8Array>() // parsedEscrows index → sharedSecret
    for (const match of matches) {
      const escrowIdx = workerIndexMap[match.index]
      matchMap.set(escrowIdx, match.sharedSecret)
    }

    // Build final result
    for (let i = 0; i < parsedEscrows.length; i++) {
      const pe = parsedEscrows[i]
      const sharedSecret = matchMap.get(i)

      escrows.push({
        escrowPda: pe.pubkey,
        amount: pe.amount,
        stealthPubkey: pe.stealthPubkey,
        verifiedDestination: pe.isVerified ? pe.verifiedDestination : undefined,
        isVerified: pe.isVerified,
        isWithdrawn: pe.isWithdrawn,
        sharedSecret,
        isOurs: !!sharedSecret,
      })
    }

    return escrows
  } catch (err: any) {
    console.error('[WAVETEK] worker scan error:', err?.message || err)
    return []
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LEGACY FUNCTIONS (for backwards compatibility with older deposit types)
// These use Ed25519 view key derivation (NOT X-Wing)
// WAVETEK TRUE PRIVACY uses X-Wing decapsulation instead
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LEGACY: Check if view tag matches (Ed25519 derivation)
 * Used for old PER deposits that use ephemeral pubkey + view tag
 * WAVETEK uses X-Wing decapsulation instead
 */
export function checkViewTag(
  viewPrivkey: Uint8Array,
  ephemeralPubkey: Uint8Array,
  expectedViewTag: number
): boolean {
  try {
    const viewPubkey = ed25519.getPublicKey(viewPrivkey);
    const sharedSecretInput = new Uint8Array(ephemeralPubkey.length + viewPubkey.length);
    sharedSecretInput.set(ephemeralPubkey, 0);
    sharedSecretInput.set(viewPubkey, ephemeralPubkey.length);
    const sharedSecret = sha3_256(sharedSecretInput);
    const computedViewTag = parseInt(sharedSecret.slice(0, 2), 16);
    return computedViewTag === expectedViewTag;
  } catch {
    return false;
  }
}

/**
 * LEGACY: Derive stealth address from ephemeral pubkey
 * Used for old deposits - V4 uses X-Wing instead
 */
export function deriveStealthFromEphemeral(
  viewPrivkey: Uint8Array,
  spendPubkey: Uint8Array,
  ephemeralPubkey: Uint8Array
): Uint8Array {
  try {
    const viewPubkey = ed25519.getPublicKey(viewPrivkey);
    const sharedSecretInput = new Uint8Array(ephemeralPubkey.length + viewPubkey.length);
    sharedSecretInput.set(ephemeralPubkey, 0);
    sharedSecretInput.set(viewPubkey, ephemeralPubkey.length);
    const sharedSecret = sha3_256(sharedSecretInput);

    const stealthInput = new Uint8Array(32 + spendPubkey.length);
    const sharedSecretBytes = new Uint8Array(Buffer.from(sharedSecret, "hex"));
    stealthInput.set(sharedSecretBytes, 0);
    stealthInput.set(spendPubkey, 32);
    const stealthHash = sha3_256(stealthInput);
    return new Uint8Array(Buffer.from(stealthHash, "hex"));
  } catch {
    return new Uint8Array(32);
  }
}

/**
 * LEGACY: Full check if payment belongs to us (Ed25519 derivation)
 * Used for old PER deposits - WAVETEK uses X-Wing instead
 */
export function isPaymentForUs(
  keys: StealthKeyPair,
  ephemeralPubkey: Uint8Array,
  expectedViewTag: number,
  announcementStealthPubkey: Uint8Array
): boolean {
  // Step 1: Fast view tag check
  if (!checkViewTag(keys.viewPrivkey, ephemeralPubkey, expectedViewTag)) {
    return false;
  }

  // Step 2: Derive full stealth pubkey
  const derivedStealth = deriveStealthFromEphemeral(
    keys.viewPrivkey,
    keys.spendPubkey,
    ephemeralPubkey
  );

  // Step 3: Compare
  if (derivedStealth.length !== announcementStealthPubkey.length) {
    return false;
  }
  for (let i = 0; i < derivedStealth.length; i++) {
    if (derivedStealth[i] !== announcementStealthPubkey[i]) {
      return false;
    }
  }

  return true;
}

export function isPaymentForUsXWing(): boolean {
  return false;
}

export function isPaymentForUsUniversal(): boolean {
  return false;
}

// V3 legacy aliases
export const checkViewTagV3 = checkViewTag;
export const verifyStealthPubkeyV3 = verifyStealthPubkey;
export const isEscrowForUsV3 = isEscrowForUs;

// ═══════════════════════════════════════════════════════════════════════════
// STEALTH SCANNER CLASS (Legacy)
// ═══════════════════════════════════════════════════════════════════════════

export class StealthScanner {
  private connection: Connection;
  private pollIntervalMs: number;
  private isScanning: boolean = false;
  private scanInterval: ReturnType<typeof setInterval> | null = null;
  private detectedEscrows: Map<string, DetectedEscrowV4> = new Map();
  private onEscrowDetected: ((escrow: DetectedEscrowV4) => void) | null = null;

  constructor(config: ScannerConfig) {
    this.connection = config.connection;
    this.pollIntervalMs = config.pollIntervalMs || 30000;
  }

  onPayment(callback: (escrow: DetectedEscrowV4) => void): void {
    this.onEscrowDetected = callback;
  }

  startScanning(keys: StealthKeyPair): void {
    if (this.isScanning) return;
    this.isScanning = true;
    this.scan(keys);
    this.scanInterval = setInterval(() => this.scan(keys), this.pollIntervalMs);
  }

  stopScanning(): void {
    this.isScanning = false;
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
  }

  getUnclaimedPayments(): DetectedEscrowV4[] {
    return Array.from(this.detectedEscrows.values()).filter(e => e.isOurs && !e.isWithdrawn);
  }

  private async scan(keys: StealthKeyPair): Promise<void> {
    if (!this.isScanning) return;

    const escrows = await scanForEscrowsV4(this.connection, keys);
    for (const escrow of escrows) {
      if (escrow.isOurs && !this.detectedEscrows.has(escrow.escrowPda.toBase58())) {
        this.detectedEscrows.set(escrow.escrowPda.toBase58(), escrow);
        if (this.onEscrowDetected) {
          this.onEscrowDetected(escrow);
        }
      }
    }
  }
}

export default StealthScanner;
