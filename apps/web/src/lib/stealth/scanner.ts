// V4 TRUE PRIVACY Scanner for WaveSwap
// Scans for ClaimEscrow accounts created by V4 POOL_TO_ESCROW flow
//
// V4 ARCHITECTURE:
// 1. Sender deposits to pool (breaks sender link)
// 2. TEE creates ClaimEscrow + XWingCiphertextAccount (no sender in tx)
// 3. Receiver scans ClaimEscrows, decapsulates X-Wing, claims
//
// SCANNING FLOW:
// 1. Fetch all ClaimEscrow accounts (171 bytes)
// 2. For each: derive XWingCiphertextPda, fetch ciphertext
// 3. Attempt X-Wing decapsulation with receiver's secret key
// 4. Verify: SHA256(sharedSecret || "stealth-derive") == stealth_pubkey
// 5. If match → escrow belongs to us

import { Connection, PublicKey } from "@solana/web3.js";
import { sha256 } from "@noble/hashes/sha256";
import { PROGRAM_IDS, deriveClaimEscrowPda, deriveXWingCiphertextPda } from "./config";
import {
  StealthKeyPair,
  xwingDecapsulate,
  deriveStealthPubkeyFromSharedSecret as cryptoDeriveStealthPubkey,
} from "./crypto";

// Re-export from crypto for backwards compatibility
export { cryptoDeriveStealthPubkey as deriveStealthPubkeyFromSharedSecret };

// ═══════════════════════════════════════════════════════════════════════════
// V4 CONSTANTS - MUST MATCH ON-CHAIN EXACTLY
// ═══════════════════════════════════════════════════════════════════════════

// ClaimEscrow discriminator and size
const CLAIM_ESCROW_DISCRIMINATOR = "CLAIMESC";
const CLAIM_ESCROW_SIZE = 171;

// ClaimEscrow layout offsets (from per_mixer.rs)
// discriminator(8) + bump(1) + nonce(32) + amount(8) + stealth_pubkey(32) +
// encrypted_destination(48) + verified_destination(32) + is_verified(1) +
// is_withdrawn(1) + reserved(8) = 171 bytes
const ESCROW_OFFSET_DISCRIMINATOR = 0;
const ESCROW_OFFSET_BUMP = 8;
const ESCROW_OFFSET_NONCE = 9;
const ESCROW_OFFSET_AMOUNT = 41;
const ESCROW_OFFSET_STEALTH_PUBKEY = 49;
const ESCROW_OFFSET_ENCRYPTED_DEST = 81;
const ESCROW_OFFSET_VERIFIED_DEST = 129;
const ESCROW_OFFSET_IS_VERIFIED = 161;
const ESCROW_OFFSET_IS_WITHDRAWN = 162;

// XWingCiphertextAccount discriminator and size
const XWING_CT_DISCRIMINATOR = "XWINGCT\0";
const XWING_CT_SIZE = 1160;
const XWING_CT_OFFSET_ESCROW_PDA = 8;
const XWING_CT_OFFSET_CIPHERTEXT = 40;
const XWING_CIPHERTEXT_LENGTH = 1120;

// ═══════════════════════════════════════════════════════════════════════════
// V4 TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface DetectedEscrowV4 {
  escrowPda: PublicKey;
  nonce: Uint8Array;
  amount: bigint;
  stealthPubkey: Uint8Array;
  encryptedDestination: Uint8Array;
  verifiedDestination?: Uint8Array;
  isVerified: boolean;
  isWithdrawn: boolean;
  // V4: Auto-recovered from X-Wing decapsulation
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
// V4 CORE CRYPTOGRAPHY
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
  for (let i = 0; i < derived.length; i++) {
    if (derived[i] !== expectedStealthPubkey[i]) return false;
  }
  return true;
}

/**
 * Check if a V4 escrow belongs to us using X-Wing decapsulation
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
    console.warn(`[V4 Scanner] Invalid ciphertext length: ${xwingCiphertext.length}, expected ${XWING_CIPHERTEXT_LENGTH}`);
    return { isOurs: false };
  }

  try {
    // Step 1: X-Wing decapsulation
    const sharedSecret = xwingDecapsulate(keys.xwingKeys.secretKey, xwingCiphertext);

    // Step 2: Verify stealth pubkey derivation
    if (!verifyStealthPubkey(sharedSecret, stealthPubkey)) {
      // Decapsulation succeeded but stealth pubkey doesn't match
      // This escrow was created for someone else
      return { isOurs: false };
    }

    // Step 3: SUCCESS - This escrow is ours!
    return { isOurs: true, sharedSecret };
  } catch {
    // Decapsulation failed - escrow not ours (expected during scanning)
    return { isOurs: false };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// V4 SCANNER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch XWingCiphertext account for a given escrow PDA
 * Returns the 1120-byte ciphertext if account exists, undefined otherwise
 */
async function fetchXWingCiphertext(
  connection: Connection,
  escrowPda: PublicKey
): Promise<Uint8Array | undefined> {
  try {
    const [xwingCtPda] = deriveXWingCiphertextPda(escrowPda);
    const accountInfo = await connection.getAccountInfo(xwingCtPda);

    if (!accountInfo || accountInfo.data.length < XWING_CT_SIZE) {
      return undefined;
    }

    // Verify discriminator
    const discriminator = Buffer.from(accountInfo.data.slice(0, 8)).toString();
    if (discriminator !== XWING_CT_DISCRIMINATOR) {
      return undefined;
    }

    // Verify escrow_pda backlink matches
    const storedEscrowPda = new PublicKey(accountInfo.data.slice(XWING_CT_OFFSET_ESCROW_PDA, XWING_CT_OFFSET_ESCROW_PDA + 32));
    if (!storedEscrowPda.equals(escrowPda)) {
      console.warn(`[V4 Scanner] XWingCiphertext escrow_pda mismatch`);
      return undefined;
    }

    // Extract ciphertext (1120 bytes starting at offset 40)
    const ciphertext = new Uint8Array(accountInfo.data.slice(XWING_CT_OFFSET_CIPHERTEXT, XWING_CT_OFFSET_CIPHERTEXT + XWING_CIPHERTEXT_LENGTH));
    return ciphertext;
  } catch (err) {
    console.warn("[V4 Scanner] Failed to fetch XWingCiphertext:", err);
    return undefined;
  }
}

/**
 * V4 TRUE PRIVACY SCANNER
 *
 * Scans all ClaimEscrow accounts (171 bytes) and identifies which belong to us.
 *
 * ARCHITECTURE:
 * - Fetches ALL ClaimEscrows from the stealth program
 * - For each escrow, fetches linked XWingCiphertextAccount
 * - Attempts X-Wing decapsulation with our secret key
 * - Verifies SHA256(sharedSecret || "stealth-derive") == stealth_pubkey
 * - Returns list of escrows with isOurs flag and recovered sharedSecret
 *
 * PRIVACY: No on-chain queries reveal which escrows belong to us.
 * We scan everything and use cryptography to identify ours.
 */
export async function scanForEscrowsV4(
  connection: Connection,
  keys: StealthKeyPair
): Promise<DetectedEscrowV4[]> {
  console.log("[V4 Scanner] ═══════════════════════════════════════════════════");
  console.log("[V4 Scanner] Scanning for V4 ClaimEscrow accounts...");

  const escrows: DetectedEscrowV4[] = [];

  try {
    // Fetch all ClaimEscrow accounts (171 bytes)
    const accounts = await connection.getProgramAccounts(PROGRAM_IDS.STEALTH, {
      filters: [{ dataSize: CLAIM_ESCROW_SIZE }],
    });

    console.log(`[V4 Scanner] Found ${accounts.length} ClaimEscrow accounts`);

    let oursCount = 0;
    for (const { pubkey, account } of accounts) {
      const data = account.data;

      // Verify discriminator
      const discriminator = Buffer.from(data.slice(ESCROW_OFFSET_DISCRIMINATOR, ESCROW_OFFSET_DISCRIMINATOR + 8)).toString();
      if (discriminator !== CLAIM_ESCROW_DISCRIMINATOR) continue;

      // Check if already withdrawn
      const isWithdrawn = data[ESCROW_OFFSET_IS_WITHDRAWN] === 1;
      if (isWithdrawn) continue;

      // Check if escrow has funds
      if (account.lamports === 0) continue;

      // Read escrow fields
      const nonce = new Uint8Array(data.slice(ESCROW_OFFSET_NONCE, ESCROW_OFFSET_NONCE + 32));
      const stealthPubkey = new Uint8Array(data.slice(ESCROW_OFFSET_STEALTH_PUBKEY, ESCROW_OFFSET_STEALTH_PUBKEY + 32));
      const encryptedDestination = new Uint8Array(data.slice(ESCROW_OFFSET_ENCRYPTED_DEST, ESCROW_OFFSET_ENCRYPTED_DEST + 48));
      const verifiedDestination = new Uint8Array(data.slice(ESCROW_OFFSET_VERIFIED_DEST, ESCROW_OFFSET_VERIFIED_DEST + 32));
      const isVerified = data[ESCROW_OFFSET_IS_VERIFIED] === 1;

      // Verify PDA derivation
      const [expectedPda] = deriveClaimEscrowPda(nonce);
      if (!pubkey.equals(expectedPda)) {
        console.warn(`[V4 Scanner] PDA mismatch for ${pubkey.toBase58().slice(0, 8)}...`);
        continue;
      }

      // Read amount (u64 little-endian)
      let amount = BigInt(0);
      for (let i = 0; i < 8; i++) {
        amount |= BigInt(data[ESCROW_OFFSET_AMOUNT + i]) << BigInt(i * 8);
      }

      // Fetch XWingCiphertext account
      let sharedSecret: Uint8Array | undefined;
      let isOurs = false;

      if (keys.xwingKeys) {
        const xwingCiphertext = await fetchXWingCiphertext(connection, pubkey);
        if (xwingCiphertext) {
          const result = isEscrowForUs(keys, stealthPubkey, xwingCiphertext);
          if (result.isOurs) {
            isOurs = true;
            sharedSecret = result.sharedSecret;
            oursCount++;
            console.log(`[V4 Scanner] ✓ FOUND OUR ESCROW: ${pubkey.toBase58().slice(0, 8)}... (${Number(amount) / 1e9} SOL)`);
          }
        }
      }

      escrows.push({
        escrowPda: pubkey,
        nonce,
        amount,
        stealthPubkey,
        encryptedDestination,
        verifiedDestination: isVerified ? verifiedDestination : undefined,
        isVerified,
        isWithdrawn,
        sharedSecret,
        isOurs,
      });
    }

    console.log(`[V4 Scanner] ═══════════════════════════════════════════════════`);
    console.log(`[V4 Scanner] SCAN COMPLETE: ${escrows.length} escrows, ${oursCount} OURS`);
    console.log(`[V4 Scanner] ═══════════════════════════════════════════════════`);

    return escrows;
  } catch (err) {
    console.error("[V4 Scanner] Scan error:", err);
    return [];
  }
}

// Alias for backwards compatibility
export const scanForEscrowsV3 = scanForEscrowsV4;

// ═══════════════════════════════════════════════════════════════════════════
// LEGACY FUNCTIONS (for backwards compatibility)
// ═══════════════════════════════════════════════════════════════════════════

// Legacy view tag check (not used in V4)
export function checkViewTag(): boolean {
  return false;
}

// Legacy stealth verification (not used in V4)
export function isPaymentForUs(): boolean {
  return false;
}

export function isPaymentForUsXWing(): boolean {
  return false;
}

export function isPaymentForUsUniversal(): boolean {
  return false;
}

export function deriveStealthFromEphemeral(): Uint8Array {
  return new Uint8Array(32);
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
