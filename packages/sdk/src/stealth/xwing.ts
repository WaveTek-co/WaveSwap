// X-Wing Hybrid Post-Quantum Cryptography for WaveSwap
// ML-KEM-768 + X25519 for post-quantum security
// Runs client-side in browser/Node.js

import { ml_kem768 } from "@noble/post-quantum/ml-kem";
import { x25519, ed25519 } from "@noble/curves/ed25519";
import { sha3_256 } from "js-sha3";

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

// Generate X-Wing keypair
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

// Generate spend and view keypairs for stealth receiving
export function generateXWingStealthKeys(): {
  spendKeypair: { publicKey: Uint8Array; secretKey: Uint8Array };
  viewKeypair: { publicKey: Uint8Array; secretKey: Uint8Array };
} {
  const spendSk = crypto.getRandomValues(new Uint8Array(32));
  const spendPk = ed25519.getPublicKey(spendSk);

  const viewSk = crypto.getRandomValues(new Uint8Array(32));
  const viewPk = ed25519.getPublicKey(viewSk);

  return {
    spendKeypair: { publicKey: spendPk, secretKey: spendSk },
    viewKeypair: { publicKey: viewPk, secretKey: viewSk },
  };
}

// Complete stealth key bundle for X-Wing
export interface XWingKeyBundle {
  xwingKeys: XWingKeyPair;
  spendKeypair: { publicKey: Uint8Array; secretKey: Uint8Array };
  viewKeypair: { publicKey: Uint8Array; secretKey: Uint8Array };
}

// Generate complete X-Wing stealth key bundle
export function generateXWingKeyBundle(): XWingKeyBundle {
  const xwingKeys = xwingKeyGen();
  const { spendKeypair, viewKeypair } = generateXWingStealthKeys();

  return {
    xwingKeys,
    spendKeypair,
    viewKeypair,
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
  if (!checkXWingViewTag(bundle.viewKeypair.publicKey, sharedSecret, announcedViewTag)) {
    return null; // Not for us
  }

  // Derive stealth keys
  const { stealthPubkey } = deriveXWingStealthAddress(
    bundle.spendKeypair.publicKey,
    bundle.viewKeypair.publicKey,
    sharedSecret
  );

  const stealthPrivateKey = deriveXWingStealthPrivateKey(
    bundle.spendKeypair.secretKey,
    sharedSecret
  );

  return { stealthPrivateKey, stealthPubkey };
}
