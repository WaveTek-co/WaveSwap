// Stealth payment scanner for WaveSwap
// PRIVACY-PRESERVING SCANNING using view key cryptography
//
// Flow:
// 1. Fetch ALL announcements (not filtered by recipient)
// 2. For each: extract ephemeral_pubkey from announcement
// 3. Compute shared_secret = SHA3-256(ephemeral_pubkey || view_pubkey)
// 4. Check view_tag == shared_secret[0] (fast rejection ~99.6%)
// 5. If match: derive stealth_pubkey and verify
// 6. If stealth_pubkey matches: this payment is for us

import { Connection, PublicKey } from "@solana/web3.js";
import { sha3_256 } from "js-sha3";
import { sha256 } from "@noble/hashes/sha256";
import { ed25519 } from "@noble/curves/ed25519";
import { PROGRAM_IDS, deriveStealthVaultPda, deriveClaimEscrowPda, deriveXWingCiphertextPda } from "./config";
import {
  StealthKeyPair,
  xwingDecapsulate,
  deriveXWingStealthAddress,
  checkXWingViewTag,
  deriveStealthPubkeyFromSharedSecret,
} from "./crypto";

// XWingCiphertextAccount constants
const XWING_CIPHERTEXT_DISCRIMINATOR = "XWINGCT\0";
const XWING_CIPHERTEXT_SIZE = 1160; // 8 + 32 + 1120

// NEW privacy-preserving announcement structure offsets
// Layout: discriminator(8) + bump(1) + timestamp(8) +
//         ephemeral_pubkey(32) + pool_nonce(32) +  <-- CHANGED: no sender/recipient
//         stealth_pubkey(32) + vault_pda(32) +
//         view_tag(1) + is_finalized(1) + is_claimed(1) +
//         bytes_written(2) + reserved(3) + ciphertext(1120)
const ANNOUNCEMENT_DISCRIMINATOR = "ANNOUNCE";
const OFFSET_BUMP = 8;
const OFFSET_TIMESTAMP = 9;
const OFFSET_EPHEMERAL_PUBKEY = 17;    // NEW: ephemeral for scanning
const OFFSET_POOL_NONCE = 49;          // NEW: mixer nonce (no identity)
const OFFSET_STEALTH_PUBKEY = 81;
const OFFSET_VAULT_PDA = 113;
const OFFSET_VIEW_TAG = 145;
const OFFSET_IS_FINALIZED = 146;
const OFFSET_IS_CLAIMED = 147;
const OFFSET_CIPHERTEXT = 153;

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

export interface ScannerConfig {
  connection: Connection;
  pollIntervalMs?: number;
  maxAnnouncements?: number;
}

/**
 * Check if an announcement's view tag matches our viewing key
 * Fast rejection filter - only ~0.4% of payments pass
 * This is the CORRECT privacy-preserving approach
 */
export function checkViewTag(
  viewPrivkey: Uint8Array,
  ephemeralPubkey: Uint8Array,
  expectedViewTag: number
): boolean {
  const viewPubkey = ed25519.getPublicKey(viewPrivkey);
  const sharedSecretInput = Buffer.concat([
    Buffer.from(ephemeralPubkey),
    Buffer.from(viewPubkey),
  ]);
  const sharedSecret = sha3_256(sharedSecretInput);
  const computedViewTag = parseInt(sharedSecret.slice(0, 2), 16);
  return computedViewTag === expectedViewTag;
}

/**
 * Derive stealth address from ephemeral pubkey (called after view tag passes)
 * Returns the full stealth pubkey for verification
 */
export function deriveStealthFromEphemeral(
  viewPrivkey: Uint8Array,
  spendPubkey: Uint8Array,
  ephemeralPubkey: Uint8Array
): Uint8Array {
  const viewPubkey = ed25519.getPublicKey(viewPrivkey);
  const sharedSecretInput = Buffer.concat([
    Buffer.from(ephemeralPubkey),
    Buffer.from(viewPubkey),
  ]);
  const sharedSecret = sha3_256(sharedSecretInput);
  const stealthDerivation = sha3_256(
    Buffer.concat([Buffer.from(sharedSecret, "hex"), Buffer.from(spendPubkey)])
  );
  return new Uint8Array(Buffer.from(stealthDerivation, "hex"));
}

/**
 * Full cryptographic check if payment belongs to us
 * 1. Check view tag (fast)
 * 2. Derive full stealth pubkey
 * 3. Compare with announcement's stealth pubkey
 */
export function isPaymentForUs(
  keys: StealthKeyPair,
  ephemeralPubkey: Uint8Array,
  expectedViewTag: number,
  announcementStealthPubkey: Uint8Array
): boolean {
  // Step 1: Fast view tag check (~99.6% rejection rate)
  if (!checkViewTag(keys.viewPrivkey, ephemeralPubkey, expectedViewTag)) {
    return false;
  }

  // Step 2: Derive full stealth pubkey
  const derivedStealth = deriveStealthFromEphemeral(
    keys.viewPrivkey,
    keys.spendPubkey,
    ephemeralPubkey
  );

  // Step 3: Compare with announcement's stealth pubkey
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

/**
 * X-Wing POST-QUANTUM check if payment belongs to us
 * Uses X-Wing decapsulation for quantum-safe shared secret derivation
 *
 * @param keys - Stealth keys including X-Wing keypair
 * @param xwingCiphertext - X-Wing ciphertext from announcement (1120 bytes)
 * @param expectedViewTag - View tag for fast rejection
 * @param announcementStealthPubkey - Stealth pubkey from announcement
 */
export function isPaymentForUsXWing(
  keys: StealthKeyPair,
  xwingCiphertext: Uint8Array,
  expectedViewTag: number,
  announcementStealthPubkey: Uint8Array
): boolean {
  // Require X-Wing keys
  if (!keys.xwingKeys) {
    console.warn('[Scanner] X-Wing keys not available, falling back to classic');
    return false;
  }

  try {
    // Step 1: X-Wing decapsulation to recover shared secret
    const sharedSecret = xwingDecapsulate(keys.xwingKeys.secretKey, xwingCiphertext);

    // Step 2: Check view tag using X-Wing shared secret
    if (!checkXWingViewTag(keys.viewPubkey, sharedSecret, expectedViewTag)) {
      return false;
    }

    // Step 3: Derive stealth pubkey from X-Wing shared secret
    const { stealthPubkey: derivedStealth } = deriveXWingStealthAddress(
      keys.spendPubkey,
      keys.viewPubkey,
      sharedSecret
    );

    // Step 4: Compare with announcement's stealth pubkey
    if (derivedStealth.length !== announcementStealthPubkey.length) {
      return false;
    }
    for (let i = 0; i < derivedStealth.length; i++) {
      if (derivedStealth[i] !== announcementStealthPubkey[i]) {
        return false;
      }
    }

    return true;
  } catch (err) {
    console.error('[Scanner] X-Wing decapsulation failed:', err);
    return false;
  }
}

/**
 * Universal payment check - tries X-Wing first, falls back to Ed25519
 */
export function isPaymentForUsUniversal(
  keys: StealthKeyPair,
  ephemeralOrCiphertext: Uint8Array,
  expectedViewTag: number,
  announcementStealthPubkey: Uint8Array
): boolean {
  // If we have X-Wing keys and the data looks like X-Wing ciphertext (1120 bytes)
  if (keys.xwingKeys && ephemeralOrCiphertext.length >= 1088) {
    const isXWing = isPaymentForUsXWing(
      keys,
      ephemeralOrCiphertext,
      expectedViewTag,
      announcementStealthPubkey
    );
    if (isXWing) return true;
  }

  // Fall back to Ed25519 (ephemeral pubkey is 32 bytes)
  const ephemeralPubkey = ephemeralOrCiphertext.length > 32
    ? ephemeralOrCiphertext.slice(ephemeralOrCiphertext.length - 32) // Last 32 bytes
    : ephemeralOrCiphertext;

  return isPaymentForUs(keys, ephemeralPubkey, expectedViewTag, announcementStealthPubkey);
}

// V3 Escrow constants
const CLAIM_ESCROW_SIZE_V3 = 171;
const ESCROW_OFFSET_NONCE = 9;
const ESCROW_OFFSET_AMOUNT = 41;
const ESCROW_OFFSET_STEALTH = 49;
const ESCROW_V3_OFFSET_ENCRYPTED_DEST = 81;
const ESCROW_V3_OFFSET_VERIFIED_DEST = 129;
const ESCROW_V3_OFFSET_IS_VERIFIED = 161;
const ESCROW_V3_OFFSET_IS_WITHDRAWN = 162;

export interface DetectedEscrowV3 {
  escrowPda: PublicKey;
  nonce: Uint8Array;
  amount: bigint;
  stealthPubkey: Uint8Array;
  encryptedDestination: Uint8Array;
  verifiedDestination?: Uint8Array;
  isVerified: boolean;
  isWithdrawn: boolean;
  sharedSecret?: Uint8Array;
}

/**
 * V3 View Tag Check using X-Wing shared secret
 * View tag is the first byte of the shared secret
 */
export function checkViewTagV3(
  sharedSecret: Uint8Array,
  expectedViewTag: number
): boolean {
  return sharedSecret[0] === expectedViewTag;
}

/**
 * V3 Stealth pubkey verification using SHA256
 * Matches on-chain: SHA256(shared_secret || "stealth-derive")
 */
export function verifyStealthPubkeyV3(
  sharedSecret: Uint8Array,
  expectedStealthPubkey: Uint8Array
): boolean {
  const derived = deriveStealthPubkeyFromSharedSecret(sharedSecret);
  if (derived.length !== expectedStealthPubkey.length) return false;
  for (let i = 0; i < derived.length; i++) {
    if (derived[i] !== expectedStealthPubkey[i]) return false;
  }
  return true;
}

/**
 * Check if a V3 escrow belongs to us using X-Wing decapsulation
 * 1. Decapsulate X-Wing ciphertext to get shared secret
 * 2. Check view tag (first byte of shared secret)
 * 3. Verify SHA256(shared_secret || "stealth-derive") == stealth_pubkey
 */
export function isEscrowForUsV3(
  keys: StealthKeyPair,
  stealthPubkey: Uint8Array,
  xwingCiphertext?: Uint8Array
): { isOurs: boolean; sharedSecret?: Uint8Array } {
  // V3 requires X-Wing keys for decapsulation
  if (!keys.xwingKeys || !xwingCiphertext) {
    return { isOurs: false };
  }

  try {
    // Step 1: X-Wing decapsulation to recover shared secret
    const sharedSecret = xwingDecapsulate(keys.xwingKeys.secretKey, xwingCiphertext);

    // Step 2: Check view tag (first byte)
    const viewTag = stealthPubkey[0]; // V3 uses stealth_pubkey[0] as implicit view tag
    // Actually for V3, view tag check is implicit in the SHA256 verification

    // Step 3: Verify stealth pubkey derivation
    if (!verifyStealthPubkeyV3(sharedSecret, stealthPubkey)) {
      return { isOurs: false };
    }

    return { isOurs: true, sharedSecret };
  } catch (err) {
    console.error("[Scanner V3] X-Wing decapsulation failed:", err);
    return { isOurs: false };
  }
}

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

    if (!accountInfo || accountInfo.data.length < XWING_CIPHERTEXT_SIZE) {
      return undefined;
    }

    // Verify discriminator
    const discriminator = Buffer.from(accountInfo.data.slice(0, 8)).toString();
    if (discriminator !== XWING_CIPHERTEXT_DISCRIMINATOR) {
      return undefined;
    }

    // Extract ciphertext (offset 40 = 8 discriminator + 32 escrow_pda)
    const ciphertext = new Uint8Array(accountInfo.data.slice(40, 40 + 1120));
    return ciphertext;
  } catch (err) {
    console.error("[Scanner V3] Failed to fetch XWingCiphertext:", err);
    return undefined;
  }
}

/**
 * Scan for V3/V4 ClaimEscrow accounts (171 bytes)
 * V3: Created by DEPOSIT_TO_PER_MIXER_V3
 * V4: Created by POOL_TO_ESCROW_V4 (TEE processes in MagicBlock)
 *
 * ARCHITECTURE (works for both V3 and V4 TRUE PRIVACY):
 * - Automatically fetches XWingCiphertextAccount linked to each escrow
 * - Attempts X-Wing decapsulation to recover sharedSecret
 * - Verifies: SHA256(sharedSecret || "stealth-derive") == stealth_pubkey
 * - No off-chain communication needed between sender and receiver!
 *
 * V4 TRUE PRIVACY adds pool intermediary to break sender↔receiver link:
 * - Sender → Pool (breaks sender link)
 * - Pool → Escrow (TEE creates, no sender in tx)
 * - Escrow → Receiver (receiver claims from escrow)
 */
export async function scanForEscrowsV3(
  connection: Connection,
  keys: StealthKeyPair,
  xwingCiphertextOverride?: Uint8Array // Optional override (for legacy or testing)
): Promise<DetectedEscrowV3[]> {
  console.log("[Scanner V3/V4] Scanning for ClaimEscrow accounts (171 bytes)...");

  const escrows: DetectedEscrowV3[] = [];

  try {
    // Fetch all V3 escrow accounts
    const accounts = await connection.getProgramAccounts(PROGRAM_IDS.STEALTH, {
      filters: [{ dataSize: CLAIM_ESCROW_SIZE_V3 }],
    });

    console.log(`[Scanner V3/V4] Found ${accounts.length} ClaimEscrow accounts`);

    for (const { pubkey, account } of accounts) {
      const data = account.data;

      // Check if already withdrawn
      if (data[ESCROW_V3_OFFSET_IS_WITHDRAWN] === 1) continue;

      // Read fields
      const nonce = new Uint8Array(data.slice(ESCROW_OFFSET_NONCE, ESCROW_OFFSET_NONCE + 32));
      const stealthPubkey = new Uint8Array(data.slice(ESCROW_OFFSET_STEALTH, ESCROW_OFFSET_STEALTH + 32));
      const encryptedDestination = new Uint8Array(data.slice(ESCROW_V3_OFFSET_ENCRYPTED_DEST, ESCROW_V3_OFFSET_ENCRYPTED_DEST + 48));
      const verifiedDestination = new Uint8Array(data.slice(ESCROW_V3_OFFSET_VERIFIED_DEST, ESCROW_V3_OFFSET_VERIFIED_DEST + 32));
      const isVerified = data[ESCROW_V3_OFFSET_IS_VERIFIED] === 1;
      const isWithdrawn = data[ESCROW_V3_OFFSET_IS_WITHDRAWN] === 1;

      // Verify PDA
      const [expectedPda] = deriveClaimEscrowPda(nonce);
      if (!pubkey.equals(expectedPda)) continue;

      // Read amount
      let amount = BigInt(0);
      for (let i = 0; i < 8; i++) {
        amount |= BigInt(data[ESCROW_OFFSET_AMOUNT + i]) << BigInt(i * 8);
      }

      // Check if escrow has funds
      if (account.lamports === 0) continue;

      // V3: Fetch XWingCiphertext account from linked PDA
      let xwingCiphertext = xwingCiphertextOverride;
      if (!xwingCiphertext && keys.xwingKeys) {
        xwingCiphertext = await fetchXWingCiphertext(connection, pubkey);
        if (xwingCiphertext) {
          console.log(`[Scanner V3/V4] Found XWingCiphertext for escrow ${pubkey.toBase58().slice(0, 8)}...`);
        }
      }

      // Try to verify ownership via X-Wing decapsulation
      let sharedSecret: Uint8Array | undefined;
      if (xwingCiphertext && keys.xwingKeys) {
        const result = isEscrowForUsV3(keys, stealthPubkey, xwingCiphertext);
        if (result.isOurs) {
          sharedSecret = result.sharedSecret;
          console.log(`[Scanner V3/V4] ✓ Escrow ${pubkey.toBase58().slice(0, 8)}... is OURS (sharedSecret recovered)`);
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
      });
    }

    const ownedCount = escrows.filter(e => e.sharedSecret).length;
    console.log(`[Scanner V3/V4] Found ${escrows.length} escrows total, ${ownedCount} owned by us (sharedSecret recovered)`);
    return escrows;
  } catch (err) {
    console.error("[Scanner V3] Scan error:", err);
    return [];
  }
}

/**
 * Stealth Payment Scanner
 * Automatically detects payments belonging to the user using view key scanning
 */
export class StealthScanner {
  private connection: Connection;
  private pollIntervalMs: number;
  private maxAnnouncements: number;
  private isScanning: boolean = false;
  private scanInterval: ReturnType<typeof setInterval> | null = null;
  private detectedPayments: Map<string, DetectedPayment> = new Map();
  private onPaymentDetected: ((payment: DetectedPayment) => void) | null = null;
  private lastScannedSlot: number = 0;

  constructor(config: ScannerConfig) {
    this.connection = config.connection;
    this.pollIntervalMs = config.pollIntervalMs || 10000; // 10 seconds
    this.maxAnnouncements = config.maxAnnouncements || 100;
  }

  /**
   * Set callback for when a payment is detected
   */
  onPayment(callback: (payment: DetectedPayment) => void): void {
    this.onPaymentDetected = callback;
  }

  /**
   * Start scanning for payments
   */
  startScanning(keys: StealthKeyPair): void {
    if (this.isScanning) {
      console.log("[Scanner] Already scanning");
      return;
    }

    console.log("[Scanner] Starting payment scanner...");
    this.isScanning = true;

    // Initial scan
    this.scan(keys);

    // Set up polling
    this.scanInterval = setInterval(() => {
      this.scan(keys);
    }, this.pollIntervalMs);
  }

  /**
   * Stop scanning
   */
  stopScanning(): void {
    console.log("[Scanner] Stopping scanner");
    this.isScanning = false;
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
  }

  /**
   * Get all detected unclaimed payments
   */
  getUnclaimedPayments(): DetectedPayment[] {
    return Array.from(this.detectedPayments.values()).filter(p => !p.isClaimed);
  }

  /**
   * Mark a payment as claimed
   */
  markClaimed(announcementPda: PublicKey): void {
    const key = announcementPda.toBase58();
    const payment = this.detectedPayments.get(key);
    if (payment) {
      payment.isClaimed = true;
    }
  }

  /**
   * Perform a PRIVACY-PRESERVING scan for payments
   * Uses cryptographic view key verification instead of registry matching
   */
  private async scan(keys: StealthKeyPair): Promise<void> {
    if (!this.isScanning) return;

    try {
      console.log("[Scanner] Starting privacy-preserving scan with view key...");

      // Fetch ALL announcement accounts - no filtering by recipient!
      // This is critical for privacy: we scan everything and use crypto to find ours
      const accounts = await this.connection.getProgramAccounts(
        PROGRAM_IDS.STEALTH,
        {
          filters: [
            {
              memcmp: {
                offset: 0,
                bytes: Buffer.from(ANNOUNCEMENT_DISCRIMINATOR).toString("base64"),
              },
            },
          ],
        }
      );

      console.log(`[Scanner] Scanning ${accounts.length} announcements with view key...`);
      let checkedCount = 0;
      let viewTagMatches = 0;

      for (const { pubkey, account } of accounts) {
        // Skip if already processed
        if (this.detectedPayments.has(pubkey.toBase58())) {
          continue;
        }

        const data = account.data;
        if (data.length < 148) continue;

        // Check discriminator
        const discriminator = data.slice(0, 8).toString();
        if (discriminator !== ANNOUNCEMENT_DISCRIMINATOR) continue;

        // Check if already claimed
        const isClaimed = data[OFFSET_IS_CLAIMED] === 1;
        if (isClaimed) continue;

        // Check if finalized
        const isFinalized = data[OFFSET_IS_FINALIZED] === 1;
        if (!isFinalized) continue;

        checkedCount++;

        // Extract ephemeral pubkey for view tag check (NEW privacy-preserving field)
        const ephemeralPubkey = new Uint8Array(data.slice(OFFSET_EPHEMERAL_PUBKEY, OFFSET_EPHEMERAL_PUBKEY + 32));

        // Extract view tag
        const viewTag = data[OFFSET_VIEW_TAG];

        // STEP 1: Fast view tag check using our view key
        // This rejects ~99.6% of payments quickly
        if (!checkViewTag(keys.viewPrivkey, ephemeralPubkey, viewTag)) {
          continue; // Not for us - view tag doesn't match
        }

        viewTagMatches++;
        console.log(`[Scanner] View tag match! Verifying stealth address...`);

        // STEP 2: Derive full stealth pubkey to confirm
        const announcementStealthPubkey = new Uint8Array(data.slice(OFFSET_STEALTH_PUBKEY, OFFSET_STEALTH_PUBKEY + 32));

        // Full cryptographic verification
        if (!isPaymentForUs(keys, ephemeralPubkey, viewTag, announcementStealthPubkey)) {
          console.log(`[Scanner] False positive - stealth pubkey mismatch`);
          continue; // View tag matched but stealth pubkey didn't - false positive
        }

        // CONFIRMED: This payment is for us!
        console.log(`[Scanner] CONFIRMED payment for us!`);

        // Extract vault PDA
        const vaultPdaBytes = new Uint8Array(data.slice(OFFSET_VAULT_PDA, OFFSET_VAULT_PDA + 32));
        const vaultPda = new PublicKey(vaultPdaBytes);

        // Verify vault PDA derivation matches
        const [expectedVaultPda] = deriveStealthVaultPda(announcementStealthPubkey);
        if (!expectedVaultPda.equals(vaultPda)) {
          console.log(`[Scanner] Vault PDA mismatch - skipping`);
          continue;
        }

        // Check vault balance
        const vaultInfo = await this.connection.getAccountInfo(vaultPda);
        if (!vaultInfo || vaultInfo.lamports === 0) {
          console.log(`[Scanner] Vault empty - already claimed or never funded`);
          continue;
        }

        console.log(`[Scanner] Found payment: vault=${vaultPda.toBase58()}, amount=${vaultInfo.lamports / 1e9} SOL`);

        // Extract pool nonce (for reference, not identity)
        const poolNonce = new Uint8Array(data.slice(OFFSET_POOL_NONCE, OFFSET_POOL_NONCE + 32));

        const payment: DetectedPayment = {
          announcementPda: pubkey,
          vaultPda,
          sender: PublicKey.default, // No sender identity stored - privacy preserved!
          ephemeralPubkey,
          stealthPubkey: announcementStealthPubkey,
          viewTag,
          amount: BigInt(vaultInfo.lamports),
          isClaimed: false,
          slot: 0,
        };

        this.detectedPayments.set(pubkey.toBase58(), payment);

        if (this.onPaymentDetected) {
          this.onPaymentDetected(payment);
        }
      }

      console.log(`[Scanner] Scan complete: ${checkedCount} checked, ${viewTagMatches} view tag matches, ${this.detectedPayments.size} confirmed payments`);
    } catch (error) {
      console.error("[Scanner] Scan error:", error);
    }
  }
}

export default StealthScanner;
