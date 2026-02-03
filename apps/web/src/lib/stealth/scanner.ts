// WAVETEK TRUE PRIVACY Scanner for WaveSwap
// Scans for ClaimEscrow accounts created by WAVETEK POOL_TO_ESCROW flow
//
// WAVETEK ARCHITECTURE:
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
import { sha3_256 } from "js-sha3";
import { ed25519 } from "@noble/curves/ed25519";
import { PROGRAM_IDS, deriveOutputEscrowPda, deriveXWingCiphertextPda, MAGICBLOCK_PER } from "./config";
import {
  StealthKeyPair,
  xwingDecapsulate,
  deriveStealthPubkeyFromSharedSecret as cryptoDeriveStealthPubkey,
} from "./crypto";

// MagicBlock PER RPC endpoint - delegated accounts live here, not L1
const MAGICBLOCK_RPC = MAGICBLOCK_PER.ER_ENDPOINT;

// Re-export from crypto for backwards compatibility
export { cryptoDeriveStealthPubkey as deriveStealthPubkeyFromSharedSecret };

// ═══════════════════════════════════════════════════════════════════════════
// WAVETEK CONSTANTS - MUST MATCH ON-CHAIN EXACTLY
// ═══════════════════════════════════════════════════════════════════════════

// WAVETEK V4: OutputEscrow discriminator and size (created by POOL_TO_ESCROW_V4)
// OutputEscrow is the privacy-preserving output - derived from stealth_pubkey, NOT nonce
const OUTPUT_ESCROW_DISCRIMINATOR = "OUTPUTES";
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
const CLAIM_ESCROW_DISCRIMINATOR = "CLAIMESC";
const CLAIM_ESCROW_SIZE = 171;

// XWingCiphertextAccount discriminator and size
const XWING_CT_DISCRIMINATOR = "XWINGCT\0";
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
  for (let i = 0; i < derived.length; i++) {
    if (derived[i] !== expectedStealthPubkey[i]) return false;
  }
  return true;
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
    console.log('[isEscrowForUs] No X-Wing keys available');
    return { isOurs: false };
  }

  // Validate ciphertext length
  if (xwingCiphertext.length !== XWING_CIPHERTEXT_LENGTH) {
    console.warn(`[isEscrowForUs] Invalid ciphertext length: ${xwingCiphertext.length}, expected ${XWING_CIPHERTEXT_LENGTH}`);
    return { isOurs: false };
  }

  try {
    // Step 1: X-Wing decapsulation
    const sharedSecret = xwingDecapsulate(keys.xwingKeys.secretKey, xwingCiphertext);
    console.log('[isEscrowForUs] X-Wing decapsulation succeeded, verifying stealth pubkey...');

    // Step 2: Verify stealth pubkey derivation
    if (!verifyStealthPubkey(sharedSecret, stealthPubkey)) {
      // Decapsulation succeeded but stealth pubkey doesn't match
      console.log('[isEscrowForUs] Stealth pubkey mismatch - escrow not ours');
      return { isOurs: false };
    }

    // Step 3: SUCCESS - This escrow is ours!
    console.log('[isEscrowForUs] MATCH - this escrow is OURS');
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
 * WAVETEK TRUE PRIVACY SCANNER
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
// Delegation program ID (accounts delegated to MagicBlock PER)
const DELEGATION_PROGRAM_ID = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");

/**
 * Fetch XWingCiphertext from MagicBlock PER (delegated accounts)
 * Falls back to L1 if not found on PER
 */
async function fetchXWingCiphertextFromPER(
  l1Connection: Connection,
  perConnection: Connection,
  escrowPda: PublicKey
): Promise<Uint8Array | undefined> {
  try {
    const [xwingCtPda] = deriveXWingCiphertextPda(escrowPda);

    // Try MagicBlock PER first (delegated accounts live there)
    let accountInfo = await perConnection.getAccountInfo(xwingCtPda);

    // Fall back to L1 if not on PER
    if (!accountInfo) {
      accountInfo = await l1Connection.getAccountInfo(xwingCtPda);
    }

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
      return undefined;
    }

    // Extract ciphertext (1120 bytes starting at offset 40)
    const ciphertext = new Uint8Array(accountInfo.data.slice(XWING_CT_OFFSET_CIPHERTEXT, XWING_CT_OFFSET_CIPHERTEXT + XWING_CIPHERTEXT_LENGTH));
    return ciphertext;
  } catch {
    return undefined;
  }
}

export async function scanForEscrowsV4(
  connection: Connection,
  keys: StealthKeyPair
): Promise<DetectedEscrowV4[]> {
  const escrows: DetectedEscrowV4[] = [];

  console.log('[WAVETEK Scanner] Starting scan, hasXWingKeys:', !!keys.xwingKeys);

  try {
    // Create MagicBlock PER connection for delegated accounts
    const perConnection = new Connection(MAGICBLOCK_RPC, "confirmed");

    // Fetch from L1 (stealth + delegation program) AND MagicBlock PER
    // WAVETEK V4: Look for OutputEscrow (91 bytes) created by POOL_TO_ESCROW_V4
    const [l1StealthAccounts, l1DelegatedAccounts, perAccounts] = await Promise.all([
      connection.getProgramAccounts(PROGRAM_IDS.STEALTH, { filters: [{ dataSize: OUTPUT_ESCROW_SIZE }] }),
      connection.getProgramAccounts(DELEGATION_PROGRAM_ID, { filters: [{ dataSize: OUTPUT_ESCROW_SIZE }] }),
      // Query MagicBlock PER for delegated escrows (stealth program owns them on PER)
      perConnection.getProgramAccounts(PROGRAM_IDS.STEALTH, { filters: [{ dataSize: OUTPUT_ESCROW_SIZE }] }).catch(() => []),
    ]);

    console.log('[WAVETEK Scanner] Found accounts - L1 stealth:', l1StealthAccounts.length, 'L1 delegated:', l1DelegatedAccounts.length, 'PER:', perAccounts.length);

    // Deduplicate by pubkey (same escrow might appear in multiple sources)
    const seenPubkeys = new Set<string>();
    const allAccounts: { pubkey: PublicKey; account: { data: Buffer; lamports: number }; source: string }[] = [];

    for (const { pubkey, account } of l1StealthAccounts) {
      if (!seenPubkeys.has(pubkey.toBase58())) {
        seenPubkeys.add(pubkey.toBase58());
        allAccounts.push({ pubkey, account, source: 'l1-stealth' });
      }
    }
    for (const { pubkey, account } of l1DelegatedAccounts) {
      if (!seenPubkeys.has(pubkey.toBase58())) {
        seenPubkeys.add(pubkey.toBase58());
        allAccounts.push({ pubkey, account, source: 'l1-delegation' });
      }
    }
    for (const { pubkey, account } of perAccounts) {
      if (!seenPubkeys.has(pubkey.toBase58())) {
        seenPubkeys.add(pubkey.toBase58());
        allAccounts.push({ pubkey, account, source: 'magicblock-per' });
      }
    }

    let oursCount = 0;
    for (const { pubkey, account, source } of allAccounts) {
      const data = account.data;

      // Verify discriminator - WAVETEK V4 uses OutputEscrow ("OUTPUTES")
      const discriminator = Buffer.from(data.slice(ESCROW_OFFSET_DISCRIMINATOR, ESCROW_OFFSET_DISCRIMINATOR + 8)).toString();
      if (discriminator !== OUTPUT_ESCROW_DISCRIMINATOR) continue;

      // Check if already withdrawn
      const isWithdrawn = data[ESCROW_OFFSET_IS_WITHDRAWN] === 1;
      if (isWithdrawn) continue;

      // Read OutputEscrow fields (WAVETEK V4 - no nonce, no encrypted_destination)
      // Layout: discriminator(8) + bump(1) + stealth_pubkey(32) + amount(8) + verified_destination(32) + is_verified(1) + is_withdrawn(1) + reserved(8)
      const stealthPubkey = new Uint8Array(data.slice(ESCROW_OFFSET_STEALTH_PUBKEY, ESCROW_OFFSET_STEALTH_PUBKEY + 32));
      const verifiedDestination = new Uint8Array(data.slice(ESCROW_OFFSET_VERIFIED_DEST, ESCROW_OFFSET_VERIFIED_DEST + 32));
      const isVerified = data[ESCROW_OFFSET_IS_VERIFIED] === 1;

      // Verify PDA derivation - WAVETEK V4 only (output-escrow from stealthPubkey)
      const [expectedPda] = deriveOutputEscrowPda(stealthPubkey);
      if (!pubkey.equals(expectedPda)) {
        continue;
      }

      // Read amount (u64 little-endian)
      let amount = BigInt(0);
      for (let i = 0; i < 8; i++) {
        amount |= BigInt(data[ESCROW_OFFSET_AMOUNT + i]) << BigInt(i * 8);
      }

      // Fetch XWingCiphertext account (check PER first, then L1)
      let sharedSecret: Uint8Array | undefined;
      let isOurs = false;

      if (keys.xwingKeys) {
        const xwingCiphertext = await fetchXWingCiphertextFromPER(connection, perConnection, pubkey);
        console.log('[WAVETEK Scanner] Escrow <ENCRYPTED> from', source, '- XWing CT:', xwingCiphertext ? 'FOUND' : 'NOT FOUND');
        if (xwingCiphertext) {
          const result = isEscrowForUs(keys, stealthPubkey, xwingCiphertext);
          console.log('[WAVETEK Scanner] isEscrowForUs result:', result.isOurs);
          if (result.isOurs) {
            isOurs = true;
            sharedSecret = result.sharedSecret;
            oursCount++;
          }
        }
      } else {
        console.log('[WAVETEK Scanner] NO X-WING KEYS - cannot check escrow <ENCRYPTED>');
      }

      escrows.push({
        escrowPda: pubkey,
        amount,
        stealthPubkey,
        verifiedDestination: isVerified ? verifiedDestination : undefined,
        isVerified,
        isWithdrawn,
        sharedSecret,
        isOurs,
      });
    }

    const oursEscrows = escrows.filter(e => e.isOurs);
    console.log('[WAVETEK Scanner] SUMMARY: Total escrows:', escrows.length, 'Ours:', oursEscrows.length);
    if (oursEscrows.length > 0) {
      console.log('[WAVETEK Scanner] OUR ESCROWS: <ENCRYPTED>', oursEscrows.length, 'found');
    }

    return escrows;
  } catch (err) {
    console.error("[WAVETEK Scanner] Scan error:", err);
    return [];
  }
}

// Alias for backwards compatibility
export const scanForEscrowsV3 = scanForEscrowsV4;

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
