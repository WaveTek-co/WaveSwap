// X-Wing Hybrid Post-Quantum Cryptography for WaveSwap
// ML-KEM-768 + X25519 for post-quantum security
//
// ARCHITECTURE: User's Ed25519 wallet key IS the X25519 component
// - Ed25519 → X25519 conversion (same curve25519, deterministic)
// - ML-KEM-768 derived from wallet signature
// - X-Wing = User's X25519 (from wallet) + ML-KEM-768 (from signature)
//
// This binds X-Wing identity directly to the user's wallet key

import { ml_kem768 } from "@noble/post-quantum";
import { x25519, ed25519 } from "@noble/curves/ed25519";
import { sha3_256 } from "js-sha3";
import { sha512 } from "@noble/hashes";

// X-Wing constants
export const MLKEM768_PUBLIC_KEY_SIZE = 1184;
export const MLKEM768_SECRET_KEY_SIZE = 2400;
export const MLKEM768_CIPHERTEXT_SIZE = 1088;
export const X25519_KEY_SIZE = 32;
export const XWING_PUBLIC_KEY_SIZE = MLKEM768_PUBLIC_KEY_SIZE + X25519_KEY_SIZE; // 1216
export const XWING_SECRET_KEY_SIZE = MLKEM768_SECRET_KEY_SIZE + X25519_KEY_SIZE; // 2432
export const XWING_CIPHERTEXT_SIZE = MLKEM768_CIPHERTEXT_SIZE + X25519_KEY_SIZE; // 1120
export const XWING_SHARED_SECRET_SIZE = 32;

// X-Wing label for hybrid key derivation (from IETF spec)
const XWING_LABEL = new Uint8Array([0x5c, 0x2e, 0x2f, 0x2f, 0x5e, 0x5c]); // "\.//^\"

// Convert Ed25519 private key (seed) to X25519 private key
// Ed25519 and X25519 share curve25519 - conversion is deterministic
export function ed25519ToX25519Private(ed25519Seed: Uint8Array): Uint8Array {
  // Ed25519 private key is hashed with SHA-512, first 32 bytes become scalar
  const hash = sha512(ed25519Seed);
  const x25519Sk = new Uint8Array(hash.slice(0, 32));
  // Clamp for X25519 (same as Ed25519 clamping)
  x25519Sk[0] &= 248;
  x25519Sk[31] &= 127;
  x25519Sk[31] |= 64;
  return x25519Sk;
}

// Convert Ed25519 keypair to X25519 keypair (deterministic)
export function ed25519ToX25519Keypair(ed25519Seed: Uint8Array): { publicKey: Uint8Array; privateKey: Uint8Array } {
  const x25519Sk = ed25519ToX25519Private(ed25519Seed);
  const x25519Pk = x25519.getPublicKey(x25519Sk);
  return { publicKey: x25519Pk, privateKey: x25519Sk };
}

export interface XWingPublicKey {
  mlkem: Uint8Array; // 1184 bytes
  x25519: Uint8Array; // 32 bytes
}

export interface XWingSecretKey {
  mlkem: Uint8Array; // 2400 bytes
  x25519: Uint8Array; // 32 bytes
}

export interface XWingKeyPair {
  publicKey: XWingPublicKey;
  secretKey: XWingSecretKey;
}

export interface XWingEncapsulationResult {
  ciphertext: Uint8Array; // 1120 bytes
  sharedSecret: Uint8Array; // 32 bytes
}

export interface XWingStealthResult {
  stealthPubkey: Uint8Array; // 32 bytes
  viewTag: number; // 1 byte
  ciphertext: Uint8Array; // 1120 bytes
  ephemeralPubkey: Uint8Array; // 32 bytes
}

// Deterministic random bytes generator from seed (for ML-KEM)
function deterministicRandom(seed: Uint8Array, domain: string, length: number): Uint8Array {
  const result = new Uint8Array(length);
  let offset = 0;
  let counter = 0;

  while (offset < length) {
    const input = Buffer.concat([
      Buffer.from(seed),
      Buffer.from(domain),
      Buffer.from([counter >> 24, counter >> 16, counter >> 8, counter & 0xff]),
    ]);
    const hash = new Uint8Array(Buffer.from(sha3_256(input), "hex"));
    const copyLen = Math.min(32, length - offset);
    result.set(hash.slice(0, copyLen), offset);
    offset += copyLen;
    counter++;
  }

  return result;
}

// Generate X-Wing keypair DETERMINISTICALLY from seed (wallet signature)
export function xwingKeyGenFromSeed(seed: Uint8Array): XWingKeyPair {
  // Derive ML-KEM seed (64 bytes needed for ml_kem768.keygen with seed)
  const mlkemSeed = deterministicRandom(seed, "oceanvault:xwing:mlkem", 64);
  const mlkemKeys = ml_kem768.keygen(mlkemSeed);

  // Derive X25519 secret key (32 bytes)
  const x25519Sk = deterministicRandom(seed, "oceanvault:xwing:x25519", 32);
  const x25519Pk = x25519.getPublicKey(x25519Sk);

  return {
    publicKey: {
      mlkem: mlkemKeys.publicKey,
      x25519: x25519Pk,
    },
    secretKey: {
      mlkem: mlkemKeys.secretKey,
      x25519: x25519Sk,
    },
  };
}

// Generate X-Wing keypair (random - for testing)
export function xwingKeyGen(): XWingKeyPair {
  const mlkemKeys = ml_kem768.keygen();
  const x25519Sk = crypto.getRandomValues(new Uint8Array(32));
  const x25519Pk = x25519.getPublicKey(x25519Sk);

  return {
    publicKey: {
      mlkem: mlkemKeys.publicKey,
      x25519: x25519Pk,
    },
    secretKey: {
      mlkem: mlkemKeys.secretKey,
      x25519: x25519Sk,
    },
  };
}

// Serialize X-Wing public key to bytes (for registry storage)
export function serializeXWingPublicKey(pk: XWingPublicKey): Uint8Array {
  const result = new Uint8Array(XWING_PUBLIC_KEY_SIZE);
  result.set(pk.mlkem, 0);
  result.set(pk.x25519, MLKEM768_PUBLIC_KEY_SIZE);
  return result;
}

// Deserialize X-Wing public key from bytes
export function deserializeXWingPublicKey(data: Uint8Array): XWingPublicKey {
  if (data.length < XWING_PUBLIC_KEY_SIZE) {
    throw new Error(`Invalid X-Wing public key size: ${data.length}`);
  }
  return {
    mlkem: data.slice(0, MLKEM768_PUBLIC_KEY_SIZE),
    x25519: data.slice(MLKEM768_PUBLIC_KEY_SIZE, XWING_PUBLIC_KEY_SIZE),
  };
}

// X-Wing combiner (SHA3-256 as per IETF spec)
function xwingCombiner(
  mlkemSs: Uint8Array,
  x25519Ss: Uint8Array,
  ctX: Uint8Array,
  pkX: Uint8Array
): Uint8Array {
  const input = new Uint8Array(6 + 32 + 32 + 32 + 32);
  let offset = 0;

  input.set(XWING_LABEL, offset);
  offset += 6;

  input.set(mlkemSs.slice(0, 32), offset);
  offset += 32;

  input.set(x25519Ss.slice(0, 32), offset);
  offset += 32;

  input.set(ctX, offset);
  offset += 32;

  input.set(pkX, offset);

  const hash = sha3_256.create();
  hash.update(input);
  return new Uint8Array(hash.arrayBuffer());
}

// X-Wing encapsulation (sender side)
export function xwingEncapsulate(recipientPk: XWingPublicKey): XWingEncapsulationResult {
  // ML-KEM-768 encapsulation
  const { cipherText: mlkemCt, sharedSecret: mlkemSs } = ml_kem768.encapsulate(recipientPk.mlkem);

  // X25519 ephemeral key generation and DH
  const ephSk = crypto.getRandomValues(new Uint8Array(32));
  const ephPk = x25519.getPublicKey(ephSk);
  const x25519Ss = x25519.getSharedSecret(ephSk, recipientPk.x25519);

  // Combine via X-Wing combiner
  const sharedSecret = xwingCombiner(mlkemSs, x25519Ss, ephPk, recipientPk.x25519);

  // Ciphertext = ML-KEM ciphertext (1088) + X25519 ephemeral pubkey (32)
  const ciphertext = new Uint8Array(XWING_CIPHERTEXT_SIZE);
  ciphertext.set(mlkemCt, 0);
  ciphertext.set(ephPk, MLKEM768_CIPHERTEXT_SIZE);

  return { ciphertext, sharedSecret };
}

// X-Wing decapsulation (recipient side)
export function xwingDecapsulate(
  secretKey: XWingSecretKey,
  ciphertext: Uint8Array
): Uint8Array {
  if (ciphertext.length < XWING_CIPHERTEXT_SIZE) {
    throw new Error(`Invalid ciphertext size: ${ciphertext.length}`);
  }

  const mlkemCt = ciphertext.slice(0, MLKEM768_CIPHERTEXT_SIZE);
  const ephPk = ciphertext.slice(MLKEM768_CIPHERTEXT_SIZE, XWING_CIPHERTEXT_SIZE);

  // ML-KEM decapsulation
  const mlkemSs = ml_kem768.decapsulate(mlkemCt, secretKey.mlkem);

  // X25519 DH
  const x25519Ss = x25519.getSharedSecret(secretKey.x25519, ephPk);

  // Derive our public key for combiner
  const myX25519Pk = x25519.getPublicKey(secretKey.x25519);

  // Combine via X-Wing combiner
  return xwingCombiner(mlkemSs, x25519Ss, ephPk, myX25519Pk);
}

// Derive stealth address from shared secret
export function deriveXWingStealthAddress(
  spendPubkey: Uint8Array,
  viewPubkey: Uint8Array,
  sharedSecret: Uint8Array
): { stealthPubkey: Uint8Array; viewTag: number } {
  // Derive stealth pubkey = H(spend_pubkey || shared_secret || "stealth")
  const stealthInput = new Uint8Array(32 + 32 + 7);
  stealthInput.set(spendPubkey.slice(0, 32), 0);
  stealthInput.set(sharedSecret.slice(0, 32), 32);
  stealthInput.set(new TextEncoder().encode("stealth"), 64);

  const stealthHash = sha3_256.create();
  stealthHash.update(stealthInput);
  const stealthPubkey = new Uint8Array(stealthHash.arrayBuffer());

  // Compute view tag for efficient scanning
  const viewTagInput = new Uint8Array(19 + 32 + 32);
  const viewTagPrefix = new TextEncoder().encode("OceanVault:ViewTag:");
  viewTagInput.set(viewTagPrefix, 0);
  viewTagInput.set(sharedSecret, 19);
  viewTagInput.set(viewPubkey, 19 + 32);

  const viewTagHash = sha3_256.create();
  viewTagHash.update(viewTagInput);
  const viewTagBytes = new Uint8Array(viewTagHash.arrayBuffer());
  const viewTag = viewTagBytes[0];

  return { stealthPubkey, viewTag };
}

// Derive stealth private key (recipient side)
export function deriveXWingStealthPrivateKey(
  spendSecretKey: Uint8Array,
  sharedSecret: Uint8Array
): Uint8Array {
  const input = new Uint8Array(32 + 32 + 12);
  input.set(spendSecretKey.slice(0, 32), 0);
  input.set(sharedSecret.slice(0, 32), 32);
  input.set(new TextEncoder().encode("stealth_priv"), 64);

  const hash = sha3_256.create();
  hash.update(input);
  return new Uint8Array(hash.arrayBuffer());
}

// Check if a view tag matches (for fast scanning)
export function checkXWingViewTag(
  viewPubkey: Uint8Array,
  sharedSecret: Uint8Array,
  expectedViewTag: number
): boolean {
  const viewTagInput = new Uint8Array(19 + 32 + 32);
  const viewTagPrefix = new TextEncoder().encode("OceanVault:ViewTag:");
  viewTagInput.set(viewTagPrefix, 0);
  viewTagInput.set(sharedSecret, 19);
  viewTagInput.set(viewPubkey, 19 + 32);

  const viewTagHash = sha3_256.create();
  viewTagHash.update(viewTagInput);
  const viewTagBytes = new Uint8Array(viewTagHash.arrayBuffer());

  return viewTagBytes[0] === expectedViewTag;
}

// Complete stealth key bundle for X-Wing (includes Ed25519 + X-Wing keys)
export interface XWingKeyBundle {
  // Ed25519 keys (derived from signature)
  spendPrivkey: Uint8Array;
  spendPubkey: Uint8Array;
  viewPrivkey: Uint8Array;
  viewPubkey: Uint8Array;
  // X-Wing keys (derived from signature)
  xwingKeys: XWingKeyPair;
}

// Generate complete X-Wing stealth key bundle from wallet signature
// LEGACY: Both X25519 and ML-KEM derived from signature
export function generateXWingKeyBundleFromSignature(signature: Uint8Array): XWingKeyBundle {
  // Derive Ed25519 spend keys
  const spendSeedHash = sha3_256(
    Buffer.concat([Buffer.from(signature), Buffer.from("oceanvault:spend")])
  );
  const spendPrivkey = new Uint8Array(Buffer.from(spendSeedHash, "hex").slice(0, 32));
  const spendPubkey = ed25519.getPublicKey(spendPrivkey);

  // Derive Ed25519 view keys
  const viewSeedHash = sha3_256(
    Buffer.concat([Buffer.from(signature), Buffer.from("oceanvault:view")])
  );
  const viewPrivkey = new Uint8Array(Buffer.from(viewSeedHash, "hex").slice(0, 32));
  const viewPubkey = ed25519.getPublicKey(viewPrivkey);

  // Derive X-Wing keys
  const xwingKeys = xwingKeyGenFromSeed(signature);

  return {
    spendPrivkey,
    spendPubkey: new Uint8Array(spendPubkey),
    viewPrivkey,
    viewPubkey: new Uint8Array(viewPubkey),
    xwingKeys,
  };
}

// RECOMMENDED: Generate X-Wing keys using user's wallet Ed25519 as X25519 component
// Architecture: User's Ed25519 wallet key → X25519 (same curve) + ML-KEM from signature
// This binds X-Wing identity directly to the user's Solana wallet
export function generateXWingFromWalletKey(
  walletEd25519Seed: Uint8Array, // User's wallet private key (32 bytes)
  signature: Uint8Array           // Signature for ML-KEM derivation
): XWingKeyPair {
  // Convert user's Ed25519 wallet key to X25519 (deterministic, same curve)
  const { publicKey: x25519Pk, privateKey: x25519Sk } = ed25519ToX25519Keypair(walletEd25519Seed);

  // Derive ML-KEM-768 keys from signature (post-quantum component)
  const mlkemSeed = deterministicRandom(signature, "oceanvault:xwing:mlkem", 64);
  const mlkemKeys = ml_kem768.keygen(mlkemSeed);

  return {
    publicKey: {
      mlkem: mlkemKeys.publicKey,
      x25519: x25519Pk,
    },
    secretKey: {
      mlkem: mlkemKeys.secretKey,
      x25519: x25519Sk,
    },
  };
}

// Generate X-Wing keys where X25519 is derived from spend key (view key based)
// This is useful when we don't have direct access to wallet private key
// but want X-Wing tied to the stealth identity
export function generateXWingFromSpendKey(
  spendPrivkey: Uint8Array, // Derived spend private key (32 bytes)
  signature: Uint8Array     // Signature for ML-KEM derivation
): XWingKeyPair {
  // Convert spend Ed25519 key to X25519
  const { publicKey: x25519Pk, privateKey: x25519Sk } = ed25519ToX25519Keypair(spendPrivkey);

  // Derive ML-KEM-768 keys from signature
  const mlkemSeed = deterministicRandom(signature, "oceanvault:xwing:mlkem", 64);
  const mlkemKeys = ml_kem768.keygen(mlkemSeed);

  return {
    publicKey: {
      mlkem: mlkemKeys.publicKey,
      x25519: x25519Pk,
    },
    secretKey: {
      mlkem: mlkemKeys.secretKey,
      x25519: x25519Sk,
    },
  };
}

// Prepare X-Wing stealth payment (sender side)
export function prepareXWingStealthPayment(params: {
  recipientXWingPk: XWingPublicKey;
  recipientSpendPk: Uint8Array;
  recipientViewPk: Uint8Array;
}): XWingStealthResult {
  // X-Wing encapsulation
  const { ciphertext, sharedSecret } = xwingEncapsulate(params.recipientXWingPk);

  // Derive stealth address
  const { stealthPubkey, viewTag } = deriveXWingStealthAddress(
    params.recipientSpendPk,
    params.recipientViewPk,
    sharedSecret
  );

  // Extract ephemeral pubkey from ciphertext for announcement
  const ephemeralPubkey = ciphertext.slice(MLKEM768_CIPHERTEXT_SIZE, XWING_CIPHERTEXT_SIZE);

  return {
    stealthPubkey,
    viewTag,
    ciphertext,
    ephemeralPubkey,
  };
}

// Scan and recover X-Wing stealth payment (recipient side)
export function recoverXWingStealthPayment(
  bundle: XWingKeyBundle,
  ciphertext: Uint8Array,
  announcedViewTag: number
): { stealthPrivateKey: Uint8Array; stealthPubkey: Uint8Array } | null {
  // X-Wing decapsulation
  const sharedSecret = xwingDecapsulate(bundle.xwingKeys.secretKey, ciphertext);

  // Check view tag for fast rejection
  if (!checkXWingViewTag(bundle.viewPubkey, sharedSecret, announcedViewTag)) {
    return null; // Not for us
  }

  // Derive stealth keys
  const { stealthPubkey } = deriveXWingStealthAddress(
    bundle.spendPubkey,
    bundle.viewPubkey,
    sharedSecret
  );

  const stealthPrivateKey = deriveXWingStealthPrivateKey(
    bundle.spendPrivkey,
    sharedSecret
  );

  return { stealthPrivateKey, stealthPubkey };
}
