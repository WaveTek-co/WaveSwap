// Stealth Worker — Isolated Web Worker for stealth key operations
// ALL PRIVATE KEYS STAY IN THIS WORKER — NEVER EXPORTED TO MAIN THREAD
//
// This worker reimplements crypto functions using pure Uint8Array operations
// to avoid Buffer dependency issues in Web Worker context.
//
// SECURITY MODEL:
// - Wallet signature → sent once via Transferable (zero-copy, main thread loses access)
// - X-Wing secret key (2432 bytes) → derived and held here, NEVER returned
// - Spend/View private keys (32 bytes each) → derived and held here, NEVER returned
// - Only PUBLIC keys and per-escrow sharedSecrets cross the Worker boundary
//
// Attack surface eliminated:
// - XSS cannot read window globals (Worker has no window/DOM)
// - Browser extensions cannot inspect Worker memory
// - React DevTools cannot see Worker state
// - localStorage never touched by Worker

import { ml_kem768 } from '@noble/post-quantum/ml-kem.js'
import { x25519, ed25519 } from '@noble/curves/ed25519'
import { sha3_256 } from 'js-sha3'
import { sha256 } from '@noble/hashes/sha256'
import { sha512 } from '@noble/hashes/sha512'

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS (match xwing.ts exactly)
// ═══════════════════════════════════════════════════════════════════

const MLKEM768_PUBLIC_KEY_SIZE = 1184
const MLKEM768_SECRET_KEY_SIZE = 2400
const MLKEM768_CIPHERTEXT_SIZE = 1088
const X25519_KEY_SIZE = 32
const XWING_PUBLIC_KEY_SIZE = MLKEM768_PUBLIC_KEY_SIZE + X25519_KEY_SIZE // 1216
const XWING_CIPHERTEXT_SIZE = MLKEM768_CIPHERTEXT_SIZE + X25519_KEY_SIZE // 1120

// X-Wing label for hybrid key derivation (from IETF spec)
const XWING_LABEL = new Uint8Array([0x5c, 0x2e, 0x2f, 0x2f, 0x5e, 0x5c]) // "\.//^\"

// ═══════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS (Buffer-free for Worker portability)
// ═══════════════════════════════════════════════════════════════════

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((acc, a) => acc + a.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const arr of arrays) {
    result.set(arr, offset)
    offset += arr.length
  }
  return result
}

function textToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

// ═══════════════════════════════════════════════════════════════════
// X-WING POST-QUANTUM CRYPTO (reimplemented without Buffer)
// Must produce identical results to xwing.ts
// ═══════════════════════════════════════════════════════════════════

function deterministicRandom(seed: Uint8Array, domain: string, length: number): Uint8Array {
  const result = new Uint8Array(length)
  let offset = 0
  let counter = 0
  const domainBytes = textToBytes(domain)

  while (offset < length) {
    const counterBytes = new Uint8Array([
      (counter >> 24) & 0xff,
      (counter >> 16) & 0xff,
      (counter >> 8) & 0xff,
      counter & 0xff,
    ])
    const input = concatBytes(seed, domainBytes, counterBytes)
    const hash = hexToBytes(sha3_256(input))
    const copyLen = Math.min(32, length - offset)
    result.set(hash.slice(0, copyLen), offset)
    offset += copyLen
    counter++
  }

  return result
}

function ed25519ToX25519Private(ed25519Seed: Uint8Array): Uint8Array {
  const hash = sha512(ed25519Seed)
  const sk = new Uint8Array(hash.slice(0, 32))
  // Clamp for X25519 (same as Ed25519 clamping)
  sk[0] &= 248
  sk[31] &= 127
  sk[31] |= 64
  return sk
}

function ed25519ToX25519Keypair(ed25519Seed: Uint8Array): { publicKey: Uint8Array; privateKey: Uint8Array } {
  const sk = ed25519ToX25519Private(ed25519Seed)
  const pk = x25519.getPublicKey(sk)
  return { publicKey: pk, privateKey: sk }
}

// ═══════════════════════════════════════════════════════════════════
// X-WING TYPES (local to Worker)
// ═══════════════════════════════════════════════════════════════════

interface XWingPublicKey {
  mlkem: Uint8Array  // 1184 bytes
  x25519: Uint8Array // 32 bytes
}

interface XWingSecretKey {
  mlkem: Uint8Array  // 2400 bytes
  x25519: Uint8Array // 32 bytes
}

interface XWingKeyPair {
  publicKey: XWingPublicKey
  secretKey: XWingSecretKey
}

// ═══════════════════════════════════════════════════════════════════
// X-WING KEY GENERATION
// ═══════════════════════════════════════════════════════════════════

function generateXWingFromSpendKey(spendPrivkey: Uint8Array, signature: Uint8Array): XWingKeyPair {
  // X25519 component = Ed25519 spend key → X25519 (same curve25519, deterministic)
  const { publicKey: x25519Pk, privateKey: x25519Sk } = ed25519ToX25519Keypair(spendPrivkey)

  // ML-KEM-768 component = derived from signature seed (post-quantum)
  const mlkemSeed = deterministicRandom(signature, 'oceanvault:xwing:mlkem', 64)
  const mlkemKeys = ml_kem768.keygen(mlkemSeed)

  return {
    publicKey: { mlkem: mlkemKeys.publicKey, x25519: x25519Pk },
    secretKey: { mlkem: mlkemKeys.secretKey, x25519: x25519Sk },
  }
}

// ═══════════════════════════════════════════════════════════════════
// X-WING DECAPSULATION (recipient side)
// ═══════════════════════════════════════════════════════════════════

function xwingCombiner(
  mlkemSs: Uint8Array,
  x25519Ss: Uint8Array,
  ctX: Uint8Array,
  pkX: Uint8Array,
): Uint8Array {
  const input = new Uint8Array(6 + 32 + 32 + 32 + 32)
  let offset = 0

  input.set(XWING_LABEL, offset); offset += 6
  input.set(mlkemSs.slice(0, 32), offset); offset += 32
  input.set(x25519Ss.slice(0, 32), offset); offset += 32
  input.set(ctX, offset); offset += 32
  input.set(pkX, offset)

  const hash = sha3_256.create()
  hash.update(input)
  return new Uint8Array(hash.arrayBuffer())
}

function xwingDecapsulate(secretKey: XWingSecretKey, ciphertext: Uint8Array): Uint8Array {
  if (ciphertext.length < XWING_CIPHERTEXT_SIZE) {
    throw new Error(`Invalid ciphertext size: ${ciphertext.length}, expected ${XWING_CIPHERTEXT_SIZE}`)
  }
  if (!secretKey.mlkem || secretKey.mlkem.length !== MLKEM768_SECRET_KEY_SIZE) {
    throw new Error(`Invalid ML-KEM secret key size: ${secretKey.mlkem?.length}, expected ${MLKEM768_SECRET_KEY_SIZE}`)
  }
  if (!secretKey.x25519 || secretKey.x25519.length !== X25519_KEY_SIZE) {
    throw new Error(`Invalid X25519 secret key size: ${secretKey.x25519?.length}, expected ${X25519_KEY_SIZE}`)
  }

  const mlkemCt = ciphertext.slice(0, MLKEM768_CIPHERTEXT_SIZE)
  const ephPk = ciphertext.slice(MLKEM768_CIPHERTEXT_SIZE, XWING_CIPHERTEXT_SIZE)

  // ML-KEM-768 decapsulation
  const mlkemSs = ml_kem768.decapsulate(mlkemCt, secretKey.mlkem)

  // X25519 Diffie-Hellman
  const x25519Ss = x25519.getSharedSecret(secretKey.x25519, ephPk)

  // Derive our public key for combiner input
  const myX25519Pk = x25519.getPublicKey(secretKey.x25519)

  // Combine via X-Wing combiner (SHA3-256 as per IETF spec)
  return xwingCombiner(mlkemSs, x25519Ss, ephPk, myX25519Pk)
}

// ═══════════════════════════════════════════════════════════════════
// STEALTH DERIVATION
// Must match on-chain derive_stealth_pubkey() EXACTLY:
// pinocchio::sha256::hashv(&[shared_secret, "stealth-derive"])
// ═══════════════════════════════════════════════════════════════════

function deriveStealthPubkeyFromSharedSecret(sharedSecret: Uint8Array): Uint8Array {
  const domain = textToBytes('stealth-derive')
  const input = new Uint8Array(sharedSecret.length + domain.length)
  input.set(sharedSecret, 0)
  input.set(domain, sharedSecret.length)
  return sha256(input)
}

// ═══════════════════════════════════════════════════════════════════
// SERIALIZATION
// ═══════════════════════════════════════════════════════════════════

function serializeXWingPublicKey(pk: XWingPublicKey): Uint8Array {
  const result = new Uint8Array(XWING_PUBLIC_KEY_SIZE)
  result.set(pk.mlkem, 0)
  result.set(pk.x25519, MLKEM768_PUBLIC_KEY_SIZE)
  return result
}

// ═══════════════════════════════════════════════════════════════════
// KEY DERIVATION FROM WALLET SIGNATURE
// Reimplemented from crypto.ts generateViewingKeys() without Buffer
// ═══════════════════════════════════════════════════════════════════

interface FullKeySet {
  spendPrivkey: Uint8Array  // 32 bytes — PRIVATE, never exported
  spendPubkey: Uint8Array   // 32 bytes — public
  viewPrivkey: Uint8Array   // 32 bytes — PRIVATE, never exported
  viewPubkey: Uint8Array    // 32 bytes — public
  xwingKeys: XWingKeyPair   // secretKey PRIVATE (2432 bytes), publicKey public (1216 bytes)
}

function deriveKeysFromSignature(signature: Uint8Array): FullKeySet {
  // Derive spend keys with oceanvault domain (matches crypto.ts exactly)
  const spendSeedHash = sha3_256(concatBytes(signature, textToBytes('oceanvault:spend')))
  const spendPrivkey = hexToBytes(spendSeedHash).slice(0, 32)
  const spendPubkey = new Uint8Array(ed25519.getPublicKey(spendPrivkey))

  // Derive view keys with oceanvault domain
  const viewSeedHash = sha3_256(concatBytes(signature, textToBytes('oceanvault:view')))
  const viewPrivkey = hexToBytes(viewSeedHash).slice(0, 32)
  const viewPubkey = new Uint8Array(ed25519.getPublicKey(viewPrivkey))

  // X-Wing post-quantum keys:
  // - X25519 part: Ed25519 spend key → X25519 (same curve, deterministic conversion)
  // - ML-KEM-768 part: derived from signature seed
  const xwingKeys = generateXWingFromSpendKey(spendPrivkey, signature)

  return { spendPrivkey, spendPubkey, viewPrivkey, viewPubkey, xwingKeys }
}

// ═══════════════════════════════════════════════════════════════════
// SECURE WIPE — Overwrite then zero key buffers
// Two-pass: random overwrite (prevents flash memory artifacts) + zero fill
// ═══════════════════════════════════════════════════════════════════

function secureWipe(buffer: Uint8Array): void {
  crypto.getRandomValues(buffer) // Overwrite with random data
  buffer.fill(0)                 // Then zero
}

function wipeAllKeys(keySet: FullKeySet): void {
  secureWipe(keySet.spendPrivkey)
  secureWipe(keySet.viewPrivkey)
  secureWipe(keySet.xwingKeys.secretKey.mlkem)
  secureWipe(keySet.xwingKeys.secretKey.x25519)
  // Public keys don't need wiping but zero them for completeness
  keySet.spendPubkey.fill(0)
  keySet.viewPubkey.fill(0)
  keySet.xwingKeys.publicKey.mlkem.fill(0)
  keySet.xwingKeys.publicKey.x25519.fill(0)
}

// ═══════════════════════════════════════════════════════════════════
// WORKER STATE (PRIVATE — never crosses boundary)
// ═══════════════════════════════════════════════════════════════════

let keys: FullKeySet | null = null

// ═══════════════════════════════════════════════════════════════════
// HELPER: Create a transferable copy of a Uint8Array
// The copy can be transferred (zero-copy to main thread) without
// affecting the Worker's internal arrays
// ═══════════════════════════════════════════════════════════════════

function toTransferable(arr: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(arr.length)
  copy.set(arr)
  return copy.buffer
}

// ═══════════════════════════════════════════════════════════════════
// MESSAGE HANDLER
// ═══════════════════════════════════════════════════════════════════

self.onmessage = (event: MessageEvent) => {
  const msg = event.data

  try {
    switch (msg.type) {

      // ─────────────────────────────────────────────────────────
      // INIT: Derive all keys from wallet signature
      // Signature is immediately wiped after derivation
      // Returns: public keys only
      // ─────────────────────────────────────────────────────────
      case 'INIT': {
        // If already initialized, wipe old keys first
        if (keys) {
          wipeAllKeys(keys)
          keys = null
        }

        const signature = new Uint8Array(msg.signature)
        keys = deriveKeysFromSignature(signature)

        // Zero the signature immediately (it's the root seed!)
        secureWipe(signature)

        const spendBuf = toTransferable(keys.spendPubkey)
        const viewBuf = toTransferable(keys.viewPubkey)
        const xwingBuf = toTransferable(serializeXWingPublicKey(keys.xwingKeys.publicKey))

        self.postMessage({
          type: 'INIT_RESULT',
          id: msg.id,
          publicKeys: {
            spendPubkey: spendBuf,
            viewPubkey: viewBuf,
            xwingPubkey: xwingBuf,
          },
        }, [spendBuf, viewBuf, xwingBuf] as any)
        break
      }

      // ─────────────────────────────────────────────────────────
      // CHECK_ESCROWS: Verify ownership of deposits via X-Wing
      // Worker runs xwingDecapsulate internally for each deposit
      // Returns: indices of matched deposits + sharedSecrets
      // ─────────────────────────────────────────────────────────
      case 'CHECK_ESCROWS': {
        if (!keys) {
          self.postMessage({ type: 'ERROR', id: msg.id, error: 'Keys not initialized' })
          return
        }

        const matches: Array<{ index: number; sharedSecret: ArrayBuffer }> = []

        for (let i = 0; i < msg.deposits.length; i++) {
          const deposit = msg.deposits[i]
          const stealthPubkey = new Uint8Array(deposit.stealthPubkey)
          const ciphertext = new Uint8Array(deposit.ciphertext)

          // Skip invalid ciphertext
          if (ciphertext.length !== XWING_CIPHERTEXT_SIZE) continue

          // Skip zero ciphertext (fatal deposit — permanently unrecoverable)
          let ctZero = true
          for (let j = 0; j < 32; j++) {
            if (ciphertext[j] !== 0) { ctZero = false; break }
          }
          if (ctZero) continue

          try {
            // X-Wing decapsulation (ML-KEM-768 + X25519)
            const sharedSecret = xwingDecapsulate(keys.xwingKeys.secretKey, ciphertext)

            // Verify: SHA256(sharedSecret || "stealth-derive") == stealthPubkey
            const derived = deriveStealthPubkeyFromSharedSecret(sharedSecret)

            // Constant-time comparison (prevents timing side-channel)
            let diff = 0
            for (let j = 0; j < 32; j++) {
              diff |= derived[j] ^ stealthPubkey[j]
            }

            if (diff === 0) {
              // Match! This escrow belongs to us.
              matches.push({
                index: i,
                sharedSecret: toTransferable(sharedSecret),
              })
            }
          } catch {
            // Decapsulation failed — not our escrow (normal during scanning)
          }
        }

        const transferable = matches.map(m => m.sharedSecret)
        self.postMessage(
          { type: 'CHECK_ESCROWS_RESULT', id: msg.id, matches },
          transferable as any,
        )
        break
      }

      // ─────────────────────────────────────────────────────────
      // GET_REGISTRATION_KEY: Return serialized X-Wing public key
      // 1216 bytes (ML-KEM-768 pubkey 1184 + X25519 pubkey 32)
      // Used by main thread to build registration TX
      // ─────────────────────────────────────────────────────────
      case 'GET_REGISTRATION_KEY': {
        if (!keys) {
          self.postMessage({ type: 'ERROR', id: msg.id, error: 'Keys not initialized' })
          return
        }

        const keyBytes = toTransferable(serializeXWingPublicKey(keys.xwingKeys.publicKey))
        self.postMessage(
          { type: 'REGISTRATION_KEY_RESULT', id: msg.id, keyBytes },
          [keyBytes] as any,
        )
        break
      }

      // ─────────────────────────────────────────────────────────
      // GET_PUBLIC_KEYS: Return all public keys
      // For React state and localStorage cache (public keys only)
      // ─────────────────────────────────────────────────────────
      case 'GET_PUBLIC_KEYS': {
        if (!keys) {
          self.postMessage({ type: 'ERROR', id: msg.id, error: 'Keys not initialized' })
          return
        }

        self.postMessage({
          type: 'PUBLIC_KEYS_RESULT',
          id: msg.id,
          publicKeys: {
            spendPubkey: toTransferable(keys.spendPubkey),
            viewPubkey: toTransferable(keys.viewPubkey),
            xwingPubkey: toTransferable(serializeXWingPublicKey(keys.xwingKeys.publicKey)),
          },
        })
        break
      }

      // ─────────────────────────────────────────────────────────
      // WIPE: Securely destroy all key material
      // Call on wallet disconnect
      // ─────────────────────────────────────────────────────────
      case 'WIPE': {
        if (keys) {
          wipeAllKeys(keys)
          keys = null
        }
        self.postMessage({ type: 'WIPE_RESULT', id: msg.id, ok: true })
        break
      }

      // ─────────────────────────────────────────────────────────
      // IS_READY: Check if keys are initialized
      // ─────────────────────────────────────────────────────────
      case 'IS_READY': {
        self.postMessage({ type: 'IS_READY_RESULT', id: msg.id, ready: !!keys })
        break
      }

      default: {
        self.postMessage({ type: 'ERROR', id: msg.id, error: `Unknown message type: ${msg.type}` })
      }
    }
  } catch (err: any) {
    self.postMessage({ type: 'ERROR', id: msg.id, error: err?.message || 'Worker internal error' })
  }
}
