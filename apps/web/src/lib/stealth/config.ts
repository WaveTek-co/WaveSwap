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

// Mixer pool PDA (singleton)
export function deriveMixerPoolPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("mixer-pool")],
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
  const indexBuffer = Buffer.alloc(4);
  indexBuffer.writeUInt32LE(index);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("stake_position"), owner.toBuffer(), indexBuffer],
    PROGRAM_IDS.DEFI
  );
}
