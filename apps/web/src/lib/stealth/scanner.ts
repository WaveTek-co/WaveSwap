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
import { ed25519 } from "@noble/curves/ed25519";
import { PROGRAM_IDS, deriveStealthVaultPda } from "./config";
import { StealthKeyPair } from "./crypto";

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
