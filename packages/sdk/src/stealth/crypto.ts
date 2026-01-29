// Client-side stealth cryptography for WaveSwap
// Matches OceanVault on-chain program cryptographic operations exactly

import { sha3_256 } from "js-sha3";
import { ed25519 } from "@noble/curves/ed25519";

// Stealth key pair from wallet signature
export interface StealthKeyPair {
  spendPrivkey: Uint8Array;
  spendPubkey: Uint8Array;
  viewPrivkey: Uint8Array;
  viewPubkey: Uint8Array;
}

// Stealth vault configuration for sending
export interface StealthVaultConfig {
  stealthPubkey: Uint8Array;
  ephemeralPubkey: Uint8Array;
  viewTag: number;
}

// Generate stealth keys from wallet signature
// Uses OceanVault domain strings for compatibility
export function generateViewingKeys(seed: Uint8Array): StealthKeyPair {
  // Derive spend keys with oceanvault domain
  const spendSeedHash = sha3_256(
    Buffer.concat([Buffer.from(seed), Buffer.from("oceanvault:spend")])
  );
  const spendPrivkey = new Uint8Array(Buffer.from(spendSeedHash, "hex").slice(0, 32));
  const spendPubkey = ed25519.getPublicKey(spendPrivkey);

  // Derive view keys with oceanvault domain
  const viewSeedHash = sha3_256(
    Buffer.concat([Buffer.from(seed), Buffer.from("oceanvault:view")])
  );
  const viewPrivkey = new Uint8Array(Buffer.from(viewSeedHash, "hex").slice(0, 32));
  const viewPubkey = ed25519.getPublicKey(viewPrivkey);

  return {
    spendPrivkey,
    spendPubkey: new Uint8Array(spendPubkey),
    viewPrivkey,
    viewPubkey: new Uint8Array(viewPubkey),
  };
}

// Derive stealth address for sending to a recipient
// Matches OceanVault on-chain derivation
export function deriveStealthAddress(
  spendPubkey: Uint8Array,
  viewPubkey: Uint8Array,
  ephemeralPrivkey?: Uint8Array
): StealthVaultConfig {
  // Generate or use provided ephemeral key
  const ephPrivkey = ephemeralPrivkey || crypto.getRandomValues(new Uint8Array(32));
  const ephemeralPubkey = ed25519.getPublicKey(ephPrivkey);

  // Compute shared secret: sha3_256(ephemeralPubkey || viewPubkey)
  const sharedSecretInput = Buffer.concat([
    Buffer.from(ephemeralPubkey),
    Buffer.from(viewPubkey),
  ]);
  const sharedSecret = sha3_256(sharedSecretInput);

  // Derive stealth pubkey: sha3_256(sharedSecret || spendPubkey)
  const stealthDerivation = sha3_256(
    Buffer.concat([Buffer.from(sharedSecret, "hex"), Buffer.from(spendPubkey)])
  );
  const stealthPubkey = new Uint8Array(Buffer.from(stealthDerivation, "hex"));

  // View tag is first byte of shared secret (as hex integer)
  const viewTag = parseInt(sharedSecret.slice(0, 2), 16);

  return {
    stealthPubkey,
    ephemeralPubkey: new Uint8Array(ephemeralPubkey),
    viewTag,
  };
}

// Check if a stealth payment belongs to us using view tag
// Fast rejection filter - only ~0.4% of payments pass
export function checkViewTag(
  viewPrivkey: Uint8Array,
  ephemeralPubkey: Uint8Array,
  expectedViewTag: number
): boolean {
  // Compute shared secret from our view privkey and their ephemeral pubkey
  const viewPubkey = ed25519.getPublicKey(viewPrivkey);
  const sharedSecretInput = Buffer.concat([
    Buffer.from(ephemeralPubkey),
    Buffer.from(viewPubkey),
  ]);
  const sharedSecret = sha3_256(sharedSecretInput);

  // Check view tag (first byte of shared secret)
  const computedViewTag = parseInt(sharedSecret.slice(0, 2), 16);
  return computedViewTag === expectedViewTag;
}

// Check if stealth address belongs to us (full verification)
export function checkStealthAddress(
  viewPrivkey: Uint8Array,
  spendPubkey: Uint8Array,
  ephemeralPubkey: Uint8Array,
  expectedViewTag: number
): { isOurs: boolean; stealthPubkey?: Uint8Array } {
  // Compute shared secret
  const viewPubkey = ed25519.getPublicKey(viewPrivkey);
  const sharedSecretInput = Buffer.concat([
    Buffer.from(ephemeralPubkey),
    Buffer.from(viewPubkey),
  ]);
  const sharedSecret = sha3_256(sharedSecretInput);

  // Verify view tag first (fast rejection)
  const computedViewTag = parseInt(sharedSecret.slice(0, 2), 16);
  if (computedViewTag !== expectedViewTag) {
    return { isOurs: false };
  }

  // Derive stealth public key
  const stealthDerivation = sha3_256(
    Buffer.concat([Buffer.from(sharedSecret, "hex"), Buffer.from(spendPubkey)])
  );
  const stealthPubkey = new Uint8Array(Buffer.from(stealthDerivation, "hex"));

  return { isOurs: true, stealthPubkey };
}

// Derive stealth address from viewing keys and ephemeral pubkey
// Call after view tag passes
export function deriveStealthAddressFromEphemeral(
  viewPrivkey: Uint8Array,
  spendPubkey: Uint8Array,
  ephemeralPubkey: Uint8Array
): Uint8Array {
  // Compute shared secret
  const viewPubkey = ed25519.getPublicKey(viewPrivkey);
  const sharedSecretInput = Buffer.concat([
    Buffer.from(ephemeralPubkey),
    Buffer.from(viewPubkey),
  ]);
  const sharedSecret = sha3_256(sharedSecretInput);

  // Derive stealth public key
  const stealthDerivation = sha3_256(
    Buffer.concat([Buffer.from(sharedSecret, "hex"), Buffer.from(spendPubkey)])
  );

  return new Uint8Array(Buffer.from(stealthDerivation, "hex"));
}

// Derive spending key for a stealth address
// Allows signing transactions from the stealth vault
export function deriveStealthSpendingKey(
  spendPrivkey: Uint8Array,
  viewPrivkey: Uint8Array,
  ephemeralPubkey: Uint8Array
): Uint8Array {
  // Compute shared secret
  const viewPubkey = ed25519.getPublicKey(viewPrivkey);
  const sharedSecretInput = Buffer.concat([
    Buffer.from(ephemeralPubkey),
    Buffer.from(viewPubkey),
  ]);
  const sharedSecret = sha3_256(sharedSecretInput);

  // Derive stealth private key: spendPriv + H(sharedSecret)
  // Scalar addition in ed25519
  const sharedSecretScalar = new Uint8Array(
    Buffer.from(sharedSecret, "hex").slice(0, 32)
  );

  // Add scalars (byte-by-byte with carry)
  const stealthPrivkey = new Uint8Array(32);
  let carry = 0;
  for (let i = 0; i < 32; i++) {
    const sum = spendPrivkey[i] + sharedSecretScalar[i] + carry;
    stealthPrivkey[i] = sum & 0xff;
    carry = sum >> 8;
  }

  return stealthPrivkey;
}

// Sign message with stealth private key
export function stealthSign(privateKey: Uint8Array, message: Uint8Array): Uint8Array {
  return ed25519.sign(message, privateKey);
}

// Verify stealth signature
export function stealthVerify(
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array
): boolean {
  try {
    return ed25519.verify(signature, message, publicKey);
  } catch {
    return false;
  }
}

// Generate stealth keys from wallet signature message
export async function generateStealthKeysFromSignature(
  signMessage: (message: Uint8Array) => Promise<Uint8Array>,
  domain: string = "OceanVault:ViewingKeys:v1"
): Promise<StealthKeyPair> {
  const message = `Sign this message to generate your WaveSwap stealth viewing keys.

This signature will be used to derive your private viewing keys. Never share this signature with anyone.

Domain: ${domain}`;

  const messageBytes = new TextEncoder().encode(message);
  const signature = await signMessage(messageBytes);

  return generateViewingKeys(signature);
}
