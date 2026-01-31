// OceanVault program configuration for stealth transactions

import { PublicKey } from "@solana/web3.js";

// OceanVault Program IDs (Devnet)
export const PROGRAM_IDS = {
  REGISTRY: new PublicKey("6pNpYWSfcVyFaRFQGZHduBSXPZ3CWKG2iV7ve7BUXfJR"),
  STEALTH: new PublicKey("4jFg8uSh4jWkeoz6itdbsD7GadkTYLwfbyfDeNeB5nFX"),
  DEFI: new PublicKey("8Xi4D44Xt3DnT6r8LogM4K9CSt3bHtpc1m21nErGawaA"),
  BRIDGE: new PublicKey("AwZHcaizUMSsQC7fNAMbrahK2w3rLYXUDFCK4MvMKz1f"),
  DELEGATION: new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"),
  MAGICBLOCK_ER: new PublicKey("ERdXRZQiAooqHBRQqhr6ZxppjUfuXsgPijBZaZLiZPfL"),
  PERMISSION: new PublicKey("ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1"),
};

// Native SOL mint address
export const NATIVE_SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

// Registry instruction discriminators
export const RegistryDiscriminators = {
  INITIALIZE_REGISTRY: Buffer.from([0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  UPLOAD_KEY_CHUNK: Buffer.from([0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  FINALIZE_REGISTRY: Buffer.from([0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
};

// Stealth instruction discriminators (must match on-chain program)
export const StealthDiscriminators = {
  PUBLISH_ANNOUNCEMENT: 0x01,
  FINALIZE_STEALTH_TRANSFER: 0x02,
  CLAIM_STEALTH_PAYMENT: 0x03,
  FINALIZE_TOKEN_TRANSFER: 0x04,
  CREATE_VAULT_TOKEN_ACCOUNT: 0x05,
  UPLOAD_CIPHERTEXT_CHUNK: 0x06,
  FINALIZE_ANNOUNCEMENT: 0x07,
  // Privacy-preserving mixer and relayer
  INITIALIZE_MIXER_POOL: 0x08,
  DEPOSIT_TO_MIXER: 0x09,
  EXECUTE_MIXER_TRANSFER: 0x0a,
  INITIALIZE_RELAYER_AUTH: 0x0b,
  CLAIM_VIA_RELAYER: 0x0c,
  // Test mixer pool (non-delegated, production-ready)
  INITIALIZE_TEST_MIXER_POOL: 0x0F,
  DEPOSIT_TO_TEST_MIXER: 0x10,
  EXECUTE_TEST_MIXER_TRANSFER: 0x11,
  // Magic Actions: deposit + delegate to MagicBlock PER
  DEPOSIT_AND_DELEGATE: 0x12,
  // Execute PER transfer (permissionless - for TEE/relayer/autoClaim)
  EXECUTE_PER_TRANSFER: 0x13,
  // Undelegate PER deposit (fallback - manual recovery)
  UNDELEGATE_PER_DEPOSIT: 0x14,
  // PER Mixer Pool (delegated shared pool for privacy)
  INITIALIZE_PER_MIXER_POOL: 0x15,
  DEPOSIT_TO_PER_MIXER: 0x16,
  EXECUTE_PER_CLAIM: 0x17,
  WITHDRAW_FROM_ESCROW: 0x18,
  DELEGATE_PER_MIXER_POOL: 0x19,
  UNDELEGATE_PER_MIXER_POOL: 0x1A,
  CREATE_POOL_PERMISSION: 0x1B,
  // V2 instructions with pre-delegated escrows
  DEPOSIT_TO_PER_MIXER_V2: 0x1C,
  EXECUTE_PER_CLAIM_V2: 0x1D,
  UNDELEGATE_ESCROW: 0x1E,
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

// MagicBlock PER (Private Ephemeral Rollup) configuration
export const MAGICBLOCK_PER = {
  // TEE endpoint for authentication and execution
  TEE_ENDPOINT: "https://tee.magicblock.app",
  // Magic Router for intelligent routing
  ROUTER_ENDPOINT: "https://devnet-router.magicblock.app",
  // Direct ephemeral rollup endpoint
  ER_ENDPOINT: "https://devnet.magicblock.app",
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
    [Buffer.from("per-mixer-pool")],
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
