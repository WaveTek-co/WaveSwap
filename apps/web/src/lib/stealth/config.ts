// OceanVault program configuration for stealth transactions

import { PublicKey } from "@solana/web3.js";

// Browser-compatible BigInt LE read/write
// (Buffer polyfill in Next.js browser bundles lacks writeBigUInt64LE/readBigUInt64LE)
export function writeBigUint64LE(buf: Buffer | Uint8Array, value: bigint, offset: number): void {
  let v = value;
  for (let i = 0; i < 8; i++) {
    buf[offset + i] = Number(v & 0xFFn);
    v >>= 8n;
  }
}

export function readBigUint64LE(buf: Buffer | Uint8Array, offset: number): bigint {
  let value = 0n;
  for (let i = 7; i >= 0; i--) {
    value = (value << 8n) | BigInt(buf[offset + i]);
  }
  return value;
}

// OceanVault Program IDs (Devnet)
// CRITICAL: Must match deployed on-chain programs
export const PROGRAM_IDS = {
  REGISTRY: new PublicKey("DgoW9MneWt6B3mBZqDf52csXMtJpgqwaHgP46tPs1tWu"),
  STEALTH: new PublicKey("4jFg8uSh4jWkeoz6itdbsD7GadkTYLwfbyfDeNeB5nFX"),
  DEFI: new PublicKey("8Xi4D44Xt3DnT6r8LogM4K9CSt3bHtpc1m21nErGawaA"),
  BRIDGE: new PublicKey("AwZHcaizUMSsQC7fNAMbrahK2w3rLYXUDFCK4MvMKz1f"),
  DELEGATION: new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"),
  MAGICBLOCK_ER: new PublicKey("ERdXRZQiAooqHBRQqhr6ZxppjUfuXsgPijBZaZLiZPfL"),
  PERMISSION: new PublicKey("ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1"),
};

// Master authority wallet - receives rent fees from closed accounts
export const MASTER_AUTHORITY = new PublicKey("DNKKC4uCNE55w66GFENJSEo7PYVSDLnSL62jvHoNeeBU");

// Native SOL mint address
export const NATIVE_SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

// Registry instruction discriminators
export const RegistryDiscriminators = {
  INITIALIZE_REGISTRY: Buffer.from([0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  UPLOAD_KEY_CHUNK: Buffer.from([0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  FINALIZE_REGISTRY: Buffer.from([0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  CLOSE_REGISTRY: Buffer.from([0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  // Simplified single-tx registration (Ed25519 viewing keys only)
  REGISTER_SIMPLE: Buffer.from([0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  // Gasless initialization - separate payer from owner (Kora pays rent)
  INITIALIZE_REGISTRY_GASLESS: Buffer.from([0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
};

// Stealth instruction discriminators (must match on-chain program)
export const StealthDiscriminators = {
  // ═══════════════════════════════════════════════════════════════════════
  // CURRENT: WAVETEK V4 TRUE PRIVACY (0x25-0x2F) - RECOMMENDED
  // ═══════════════════════════════════════════════════════════════════════
  DEPOSIT_TO_POOL_V4: 0x25,
  POOL_TO_ESCROW_V4: 0x26,
  CLAIM_ESCROW_V4: 0x27,
  CLAIM_ESCROW_WAVETEK: 0x27,
  CREATE_V4_DEPOSIT: 0x28,
  UPLOAD_V4_CIPHERTEXT: 0x29,
  COMPLETE_V4_DEPOSIT: 0x2a,
  INPUT_TO_POOL_V4: 0x2b,
  TEE_PROCESS_DEPOSIT: 0x2c,
  PROCESS_DEPOSIT_V4: 0x2d,
  PREPARE_OUTPUT_V4: 0x2e,
  WITHDRAW_FROM_OUTPUT_ESCROW: 0x2f,

  // ═══════════════════════════════════════════════════════════════════════
  // WAVETEK SEQ Architecture (0x3A-0x40) - ACTIVE ON DEVNET
  // ═══════════════════════════════════════════════════════════════════════
  REGISTER_DEPOSIT: 0x3a,
  CREATE_V4_DEPOSIT_SEQ: 0x3b,
  COMPLETE_V4_DEPOSIT_SEQ: 0x3c,
  INPUT_TO_POOL_SEQ: 0x3d,
  POOL_TO_ESCROW_SEQ: 0x3e,
  ADMIN_SET_POOL_SEQ: 0x3f,
  PREPARE_OUTPUT_SEQ: 0x40,

  // ═══════════════════════════════════════════════════════════════════════
  // CURRENT: POOL REGISTRY (0x30-0x35) - 3-SIGNATURE FLOW
  // ═══════════════════════════════════════════════════════════════════════
  INIT_POOL_REGISTRY: 0x30,
  UPLOAD_REGISTRY_CHUNK: 0x31,
  FINALIZE_POOL_REGISTRY: 0x32,
  CREATE_POOL_DEPOSIT: 0x33,
  PROCESS_POOL_DEPOSIT: 0x34,
  CLAIM_POOL_DEPOSIT: 0x35,

  // ═══════════════════════════════════════════════════════════════════════
  // LEGACY: Basic stealth (0x01-0x07) - kept for backwards compatibility
  // ═══════════════════════════════════════════════════════════════════════
  PUBLISH_ANNOUNCEMENT: 0x01,
  FINALIZE_STEALTH_TRANSFER: 0x02,
  CLAIM_STEALTH_PAYMENT: 0x03,
  FINALIZE_TOKEN_TRANSFER: 0x04,
  CREATE_VAULT_TOKEN_ACCOUNT: 0x05,
  UPLOAD_CIPHERTEXT_CHUNK: 0x06,
  FINALIZE_ANNOUNCEMENT: 0x07,

  // ═══════════════════════════════════════════════════════════════════════
  // DEPRECATED: Old mixer/PER flows (0x08-0x24) - do not use for new code
  // ═══════════════════════════════════════════════════════════════════════
  INITIALIZE_MIXER_POOL: 0x08,
  DEPOSIT_TO_MIXER: 0x09,
  EXECUTE_MIXER_TRANSFER: 0x0a,
  INITIALIZE_RELAYER_AUTH: 0x0b,
  CLAIM_VIA_RELAYER: 0x0c,
  INITIALIZE_TEST_MIXER_POOL: 0x0F,
  DEPOSIT_TO_TEST_MIXER: 0x10,
  EXECUTE_TEST_MIXER_TRANSFER: 0x11,
  DEPOSIT_AND_DELEGATE: 0x12,
  EXECUTE_PER_TRANSFER: 0x13,
  UNDELEGATE_PER_DEPOSIT: 0x14,
  INITIALIZE_PER_MIXER_POOL: 0x15,
  DEPOSIT_TO_PER_MIXER: 0x16,
  EXECUTE_PER_CLAIM: 0x17,
  WITHDRAW_FROM_ESCROW: 0x18,
  DELEGATE_PER_MIXER_POOL: 0x19,
  UNDELEGATE_PER_MIXER_POOL: 0x1A,
  CREATE_POOL_PERMISSION: 0x1B,
  DEPOSIT_TO_PER_MIXER_V2: 0x1C,
  EXECUTE_PER_CLAIM_V2: 0x1D,
  UNDELEGATE_ESCROW: 0x1E,
  DEPOSIT_TO_PER_MIXER_V3: 0x1F,
  EXECUTE_PER_CLAIM_V3: 0x20,
  CREATE_VAULT_FROM_DEPOSIT: 0x24,
};

// DeFi instruction discriminators
export const DefiDiscriminators = {
  REQUEST_STEALTH_STAKE: 0x01,
  REQUEST_STEALTH_UNSTAKE: 0x02,
  CLAIM_STAKING_REWARDS: 0x03,
};

// Max chunk size for uploading x-wing public key
export const MAX_CHUNK_SIZE = 800;

// Jupiter API endpoints
export const JUPITER_API = {
  QUOTE: "https://quote-api.jup.ag/v6/quote",
  SWAP: "https://quote-api.jup.ag/v6/swap",
  SWAP_INSTRUCTIONS: "https://quote-api.jup.ag/v6/swap-instructions",
};

// Default slippage in basis points
export const DEFAULT_SLIPPAGE_BPS = 50;

// Relayer configuration for privacy-preserving claims
export const RELAYER_CONFIG = {
  // Default relayer endpoint (devnet)
  DEVNET_ENDPOINT: process.env.NEXT_PUBLIC_RELAYER_ENDPOINT || "http://localhost:3001",
  // Relayer pubkey (set via environment)
  DEVNET_PUBKEY: process.env.NEXT_PUBLIC_RELAYER_PUBKEY || null,
};

// Kora gasless transaction configuration (Solana Foundation)
// Kora pays L1 transaction fees so receivers pay NOTHING
export const KORA_CONFIG = {
  // Kora RPC endpoint - REQUIRED for gasless withdrawals
  RPC_URL: process.env.NEXT_PUBLIC_KORA_RPC_URL || "https://genuine-vibrancy-production.up.railway.app",
  // Enable/disable gasless withdrawals
  ENABLED: process.env.NEXT_PUBLIC_KORA_ENABLED !== "false",
};

// MagicBlock PER (Private Ephemeral Rollup) configuration
export const MAGICBLOCK_PER = {
  // TEE endpoint for authentication and execution
  TEE_ENDPOINT: "https://tee.magicblock.app",
  // Magic Router for intelligent routing
  ROUTER_ENDPOINT: "https://devnet-router.magicblock.app",
  // Direct ephemeral rollup endpoint (use proxy in browser to avoid CORS)
  ER_ENDPOINT: typeof window !== 'undefined'
    ? `${window.location.origin}/api/v1/per-rpc`
    : 'https://devnet-as.magicblock.app',
  // Default validator for devnet
  DEFAULT_VALIDATOR: new PublicKey("MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57"),
  // Permission program for fine-grained access control
  PERMISSION_PROGRAM: new PublicKey("ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1"),
};

// PDA derivation functions
export function deriveRegistryPda(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("registry"), owner.toBuffer()],
    PROGRAM_IDS.REGISTRY
  );
}

export function deriveAnnouncementPda(sender: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("announcement"), sender.toBuffer()],
    PROGRAM_IDS.STEALTH
  );
}

// Privacy-preserving announcement PDA (derived from nonce, not sender)
export function deriveAnnouncementPdaFromNonce(nonce: Uint8Array): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("announcement"), Buffer.from(nonce)],
    PROGRAM_IDS.STEALTH
  );
}

// Mixer pool PDA (singleton) - DEPRECATED, use deriveTestMixerPoolPda
export function deriveMixerPoolPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("mixer-pool")],
    PROGRAM_IDS.STEALTH
  );
}

// Test mixer pool PDA (non-delegated, production-ready on devnet)
export function deriveTestMixerPoolPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("test-mixer-pool")],
    PROGRAM_IDS.STEALTH
  );
}

// Deposit record PDA (derived from nonce)
export function deriveDepositRecordPda(nonce: Uint8Array): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("mixer-deposit"), Buffer.from(nonce)],
    PROGRAM_IDS.STEALTH
  );
}

// Relayer authorization PDA
export function deriveRelayerAuthPda(relayerPubkey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("relayer-auth"), relayerPubkey.toBytes()],
    PROGRAM_IDS.STEALTH
  );
}

export function deriveStealthVaultPda(stealthPubkey: Uint8Array): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("stealth_vault"), Buffer.from(stealthPubkey)],
    PROGRAM_IDS.STEALTH
  );
}

export function deriveStakePositionPda(owner: PublicKey, index: number): [PublicKey, number] {
  // Write index as 4 bytes little-endian (browser-compatible)
  const indexBuffer = Buffer.alloc(4);
  indexBuffer[0] = index & 0xff;
  indexBuffer[1] = (index >> 8) & 0xff;
  indexBuffer[2] = (index >> 16) & 0xff;
  indexBuffer[3] = (index >> 24) & 0xff;
  return PublicKey.findProgramAddressSync(
    [Buffer.from("stake_position"), owner.toBuffer(), indexBuffer],
    PROGRAM_IDS.DEFI
  );
}

// PER (Private Ephemeral Rollup) deposit record PDA
// Used for Magic Actions flow with MagicBlock TEE
export function derivePerDepositPda(nonce: Uint8Array): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("per-deposit"), Buffer.from(nonce)],
    PROGRAM_IDS.STEALTH
  );
}

// Delegation record PDA (from MagicBlock delegation program)
export function deriveDelegationRecordPda(delegatedAccount: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("delegation"), delegatedAccount.toBuffer()],
    PROGRAM_IDS.DELEGATION
  );
}

// Delegation metadata PDA
export function deriveDelegationMetadataPda(delegatedAccount: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("delegation-metadata"), delegatedAccount.toBuffer()],
    PROGRAM_IDS.DELEGATION
  );
}

// Delegate buffer PDA (for CPI to delegation program)
export function deriveDelegateBufferPda(
  delegatedAccount: PublicKey,
  ownerProgram: PublicKey = PROGRAM_IDS.STEALTH
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("buffer"), delegatedAccount.toBuffer()],
    ownerProgram
  );
}

// PER Mixer Pool PDA (delegated to MagicBlock for shared anonymity)
export function derivePerMixerPoolPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("per-mixer-pool-oceanvault")],
    PROGRAM_IDS.STEALTH
  );
}

// PER Deposit Record PDA (tracks each deposit with stealth config)
export function derivePerDepositRecordPda(nonce: Uint8Array): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("per-deposit-rec"), Buffer.from(nonce)],
    PROGRAM_IDS.STEALTH
  );
}

// Claim Escrow PDA (created by PER, holds funds for recipient)
export function deriveClaimEscrowPda(nonce: Uint8Array): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("claim-escrow"), Buffer.from(nonce)],
    PROGRAM_IDS.STEALTH
  );
}

// Input Escrow PDA (WAVETEK: holds sender's funds before mixing)
// This is the escrow that receives the INPUT from sender, linked to nonce
export function deriveInputEscrowPda(nonce: Uint8Array): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("input-escrow"), Buffer.from(nonce)],
    PROGRAM_IDS.STEALTH
  );
}

// Output Escrow PDA (WAVETEK: holds receiver's funds after mixing)
// This is the escrow that holds the OUTPUT for receiver, linked to stealth_pubkey
export function deriveOutputEscrowPda(stealthPubkey: Uint8Array): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("output-escrow"), Buffer.from(stealthPubkey)],
    PROGRAM_IDS.STEALTH
  );
}

// X-Wing Ciphertext PDA (stores full X-Wing ciphertext for receiver decapsulation)
// Derived from escrow PDA - scanner can find it automatically
export function deriveXWingCiphertextPda(escrowPda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("xwing-ct"), escrowPda.toBuffer()],
    PROGRAM_IDS.STEALTH
  );
}

// X-Wing ciphertext account size (for rent calculation)
export const XWING_CIPHERTEXT_ACCOUNT_SIZE = 1160; // 8 discriminator + 32 escrow_pda + 1120 ciphertext

// Permission PDA for TEE visibility (MagicBlock ACL)
export function derivePermissionPda(permissionedAccount: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("permission:"), permissionedAccount.toBuffer()],
    PROGRAM_IDS.PERMISSION
  );
}

// Escrow delegation buffer PDA (for delegating escrow to MagicBlock)
export function deriveEscrowBufferPda(escrowPda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("buffer"), escrowPda.toBuffer()],
    PROGRAM_IDS.STEALTH
  );
}

// Escrow delegation record PDA
export function deriveEscrowDelegationRecordPda(escrowPda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("delegation"), escrowPda.toBuffer()],
    PROGRAM_IDS.DELEGATION
  );
}

// Escrow delegation metadata PDA
export function deriveEscrowDelegationMetadataPda(escrowPda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("delegation-metadata"), escrowPda.toBuffer()],
    PROGRAM_IDS.DELEGATION
  );
}

// Permission PDA for TEE undelegation (MagicBlock Permission Program)
export function deriveEscrowPermissionPda(escrowPda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("permission:"), escrowPda.toBuffer()],
    PROGRAM_IDS.PERMISSION
  );
}

// Permission delegation buffer PDA
export function derivePermissionDelegationBufferPda(permissionPda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("buffer"), permissionPda.toBuffer()],
    PROGRAM_IDS.PERMISSION
  );
}

// Permission delegation record PDA
export function derivePermissionDelegationRecordPda(permissionPda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("delegation"), permissionPda.toBuffer()],
    PROGRAM_IDS.DELEGATION
  );
}

// Permission delegation metadata PDA
export function derivePermissionDelegationMetadataPda(permissionPda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("delegation-metadata"), permissionPda.toBuffer()],
    PROGRAM_IDS.DELEGATION
  );
}

// XWing CT buffer PDA
export function deriveXWingCtBufferPda(xwingCtPda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("buffer"), xwingCtPda.toBuffer()],
    PROGRAM_IDS.STEALTH
  );
}

// XWing CT delegation record PDA
export function deriveXWingCtDelegationRecordPda(xwingCtPda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("delegation"), xwingCtPda.toBuffer()],
    PROGRAM_IDS.DELEGATION
  );
}

// XWing CT delegation metadata PDA
export function deriveXWingCtDelegationMetadataPda(xwingCtPda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("delegation-metadata"), xwingCtPda.toBuffer()],
    PROGRAM_IDS.DELEGATION
  );
}

// Deposit record delegation buffer PDA
export function deriveDepositRecordBufferPda(depositRecordPda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("buffer"), depositRecordPda.toBuffer()],
    PROGRAM_IDS.STEALTH
  );
}

// Deposit record delegation record PDA
export function deriveDepositRecordDelegationRecordPda(depositRecordPda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("delegation"), depositRecordPda.toBuffer()],
    PROGRAM_IDS.DELEGATION
  );
}

// Deposit record delegation metadata PDA
export function deriveDepositRecordDelegationMetadataPda(depositRecordPda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("delegation-metadata"), depositRecordPda.toBuffer()],
    PROGRAM_IDS.DELEGATION
  );
}

// MagicBlock TEE Validator
export const TEE_VALIDATOR = new PublicKey("MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57");

// MagicBlock Magic Context (for commit/undelegate CPIs)
export const MAGIC_CONTEXT = new PublicKey("MagicContext1111111111111111111111111111111");
export const MAGIC_PROGRAM = new PublicKey("Magic11111111111111111111111111111111111111");

// ═══════════════════════════════════════════════════════════════════════
// POOL REGISTRY PDA DERIVATIONS
// ═══════════════════════════════════════════════════════════════════════

// TeePublicRegistry PDA - stores X-Wing PUBLIC key for encapsulation
// PDA: ["tee-pubkey", owner]
export function deriveTeePublicRegistryPda(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("tee-pubkey"), owner.toBuffer()],
    PROGRAM_IDS.STEALTH
  );
}

// TeeSecretStore PDA - stores encrypted X-Wing SECRET key
// PDA: ["tee-secret", owner]
export function deriveTeeSecretStorePda(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("tee-secret"), owner.toBuffer()],
    PROGRAM_IDS.STEALTH
  );
}

// Pool Deposit Request PDA - sender's deposit waiting for TEE processing
// PDA: ["pool-deposit", nonce]
export function derivePoolDepositPda(nonce: Uint8Array): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pool-deposit"), Buffer.from(nonce)],
    PROGRAM_IDS.STEALTH
  );
}

// ═══════════════════════════════════════════════════════════════════════
// WAVETEK SEQ PDA DERIVATIONS
// ═══════════════════════════════════════════════════════════════════════

// Deposit Record SEQ PDA - derived from sequential ID instead of random nonce
// PDA: ["deposit-seq", seq_id(8 bytes LE)]
export function deriveDepositRecordSeqPda(seqId: bigint): [PublicKey, number] {
  const seqIdBuf = Buffer.alloc(8);
  writeBigUint64LE(seqIdBuf, seqId, 0);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("deposit-seq"), seqIdBuf],
    PROGRAM_IDS.STEALTH
  );
}

// Input Escrow SEQ PDA - derived from sequential ID
// PDA: ["input-seq", seq_id(8 bytes LE)]
export function deriveInputEscrowSeqPda(seqId: bigint): [PublicKey, number] {
  const seqIdBuf = Buffer.alloc(8);
  writeBigUint64LE(seqIdBuf, seqId, 0);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("input-seq"), seqIdBuf],
    PROGRAM_IDS.STEALTH
  );
}

// WAVETEK account sizes
export const DEPOSIT_RECORD_SEQ_SIZE = 1364;
export const INPUT_ESCROW_SEQ_SIZE = 64;
export const OUTPUT_ESCROW_SIZE = 91;

// Pool Registry account sizes (for rent calculation)
export const TEE_PUBLIC_REGISTRY_SIZE = 1296;  // X-Wing pubkey (1216) + metadata
export const TEE_SECRET_STORE_SIZE = 2498;     // Encrypted X-Wing secret key
export const POOL_DEPOSIT_SIZE = 162;          // Deposit request metadata
