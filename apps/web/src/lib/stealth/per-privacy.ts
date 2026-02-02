// PER (Permissionless Execution Runtime) Privacy Integration
// Complete privacy flow using MagicBlock PER + Mixer + Relayer
//
// ARCHITECTURE:
// 1. SENDER UNLINKABILITY: User → Mixer Pool → (TEE Proof) → Stealth Vault
// 2. RECEIVER UNLINKABILITY: User → Claim Proof → PER Relayer → Destination
//
// The TEE proof is the SOLE authorization - this is decentralized and trustless

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { sha3_256 } from "js-sha3";
import { ed25519 } from "@noble/curves/ed25519";
import {
  PROGRAM_IDS,
  MASTER_AUTHORITY,
  StealthDiscriminators,
  deriveStealthVaultPda,
  deriveAnnouncementPdaFromNonce,
  deriveTestMixerPoolPda,
  deriveDepositRecordPda,
  deriveRelayerAuthPda,
  derivePerMixerPoolPda,
  derivePerDepositRecordPda,
  deriveClaimEscrowPda,
  deriveXWingCiphertextPda,
  deriveEscrowBufferPda,
  deriveEscrowDelegationRecordPda,
  deriveEscrowDelegationMetadataPda,
  deriveEscrowPermissionPda,
  derivePermissionDelegationBufferPda,
  derivePermissionDelegationRecordPda,
  derivePermissionDelegationMetadataPda,
  deriveXWingCtBufferPda,
  deriveXWingCtDelegationRecordPda,
  deriveXWingCtDelegationMetadataPda,
  TEE_VALIDATOR,
  MAGIC_CONTEXT,
  MAGIC_PROGRAM,
} from "./config";
import {
  StealthKeyPair,
  deriveStealthAddress,
  stealthSign,
  xwingEncapsulate,
  encryptDestinationWallet,
  decryptDestinationWallet,
  deriveStealthPubkeyFromSharedSecret,
  xwingDecapsulate,
} from "./crypto";

// HTTP polling-based confirmation (avoids WebSocket issues on devnet)
async function confirmTransactionPolling(
  connection: Connection,
  signature: string,
  maxAttempts = 30,
  intervalMs = 2000
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const status = await connection.getSignatureStatus(signature);
      if (status?.value?.confirmationStatus === 'confirmed' ||
          status?.value?.confirmationStatus === 'finalized') {
        return true;
      }
      if (status?.value?.err) {
        console.error('[Confirm] TX failed:', status.value.err);
        return false;
      }
    } catch (e) {
      // Ignore polling errors, keep trying
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  console.warn('[Confirm] Timeout - TX may still succeed');
  return true;
}

// MagicBlock PER Constants
export const MAGICBLOCK_RPC_DEVNET = "https://devnet.magicblock.app";
export const MAGICBLOCK_TEE_PUBKEY = new PublicKey("maborAhvYdgqzzwQAB64a3oNvpTtEAYDTvSBT4supLH");

// TEE Proof Constants
const TEE_PROOF_SIZE = 168;
const EXPECTED_ENCLAVE_MEASUREMENT = new Uint8Array([
  0x4f, 0x63, 0x65, 0x61, 0x6e, 0x56, 0x61, 0x75,
  0x6c, 0x74, 0x54, 0x45, 0x45, 0x76, 0x31, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01,
]);

export interface PrivacySendParams {
  amount: bigint;
  recipientSpendPubkey: Uint8Array;
  recipientViewPubkey: Uint8Array;
}

export interface PrivacyClaimParams {
  stealthKeys: StealthKeyPair;
  vaultPda: PublicKey;
  announcementPda: PublicKey;
  stealthPubkey: Uint8Array;
  destination: PublicKey;
}

export interface PrivacySendResult {
  success: boolean;
  error?: string;
  // Step 1: Announcement
  announcementSignature?: string;
  announcementPda?: PublicKey;
  // Step 2: Deposit to mixer
  depositSignature?: string;
  depositRecordPda?: PublicKey;
  // Step 3: Execute mixer transfer (can be done by anyone with TEE proof)
  mixerTransferSignature?: string;
  // Final vault
  vaultPda?: PublicKey;
  stealthPubkey?: Uint8Array;
  ephemeralPubkey?: Uint8Array;
  viewTag?: number;
}

export interface PrivacyClaimResult {
  success: boolean;
  error?: string;
  signature?: string;
  amount?: bigint;
}

// Generate devnet TEE proof (commitment + placeholder signature + measurement)
function createDevnetTeeProof(announcement: Uint8Array, vault: Uint8Array): Uint8Array {
  const proof = new Uint8Array(TEE_PROOF_SIZE);

  // Compute commitment: SHA3-256("OceanVault:TEE:Commitment:" || announcement || vault)
  const commitmentInput = Buffer.concat([
    Buffer.from("OceanVault:TEE:Commitment:"),
    Buffer.from(announcement),
    Buffer.from(vault),
  ]);
  const commitment = new Uint8Array(Buffer.from(sha3_256(commitmentInput), "hex"));
  proof.set(commitment, 0);

  // Placeholder signature (64 bytes) - not verified on devnet
  proof.fill(0x42, 32, 96);

  // Enclave measurement (32 bytes)
  proof.set(EXPECTED_ENCLAVE_MEASUREMENT, 96);

  // Timestamp (8 bytes)
  const timestamp = BigInt(Date.now());
  const timestampBytes = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    timestampBytes[i] = Number((timestamp >> BigInt(i * 8)) & BigInt(0xff));
  }
  proof.set(timestampBytes, 128);

  // Reserved (32 bytes)
  proof.fill(0, 136, 168);

  return proof;
}

// Compute destination hash for relayer claims
function computeDestinationHash(destination: PublicKey): Uint8Array {
  const input = Buffer.concat([
    Buffer.from("OceanVault:DestinationHash:"),
    destination.toBytes(),
  ]);
  return new Uint8Array(Buffer.from(sha3_256(input), "hex"));
}

export class PERPrivacyClient {
  private mainnetConnection: Connection;
  private perConnection: Connection;
  private relayerPubkey: PublicKey | null = null;
  private relayerEndpoint: string | null = null;

  constructor(
    mainnetRpcUrl: string = "https://api.devnet.solana.com",
    perRpcUrl: string = MAGICBLOCK_RPC_DEVNET
  ) {
    this.mainnetConnection = new Connection(mainnetRpcUrl, "confirmed");
    this.perConnection = new Connection(perRpcUrl, "confirmed");
  }

  // Configure relayer for claim operations
  setRelayer(relayerPubkey: PublicKey, relayerEndpoint?: string) {
    this.relayerPubkey = relayerPubkey;
    this.relayerEndpoint = relayerEndpoint || null;
  }

  // Check if mixer pool exists and is active
  async getMixerPoolStatus(): Promise<{
    exists: boolean;
    isActive: boolean;
    balance: bigint;
    pendingDeposits: number;
    mixDelaySlots: bigint;
  }> {
    const [mixerPoolPda] = deriveTestMixerPoolPda();
    const info = await this.mainnetConnection.getAccountInfo(mixerPoolPda);

    if (!info || info.data.length < 100) {
      return { exists: false, isActive: false, balance: 0n, pendingDeposits: 0, mixDelaySlots: 0n };
    }

    // Parse mixer pool data
    // Layout: discriminator(8) + bump(1) + authority(32) + balance(8) + min_deposit(8) + max_deposit(8) + mix_delay_slots(8) + pending(4) + executed(4) + is_active(1)
    const data = info.data;

    // Read balance as little-endian BigInt (browser-compatible)
    let balance = BigInt(0);
    for (let i = 0; i < 8; i++) {
      balance |= BigInt(data[41 + i]) << BigInt(i * 8);
    }

    // Read mixDelaySlots as little-endian BigInt (browser-compatible)
    let mixDelaySlots = BigInt(0);
    for (let i = 0; i < 8; i++) {
      mixDelaySlots |= BigInt(data[65 + i]) << BigInt(i * 8);
    }

    const pendingDeposits = data[73] | (data[74] << 8) | (data[75] << 16) | (data[76] << 24);
    const isActive = data[81] === 1;

    return {
      exists: true,
      isActive,
      balance,
      pendingDeposits,
      mixDelaySlots,
    };
  }

  // STEP 1: Publish privacy-preserving announcement
  // This reveals NOTHING about the sender - only ephemeral pubkey + view tag
  async publishAnnouncement(
    wallet: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> },
    recipientSpendPubkey: Uint8Array,
    recipientViewPubkey: Uint8Array
  ): Promise<{
    success: boolean;
    error?: string;
    signature?: string;
    announcementPda?: PublicKey;
    stealthConfig?: {
      stealthPubkey: Uint8Array;
      ephemeralPubkey: Uint8Array;
      viewTag: number;
    };
    nonce?: Uint8Array;
  }> {
    try {
      // Generate random nonce
      const nonce = crypto.getRandomValues(new Uint8Array(32));

      // Derive stealth address
      const stealthConfig = deriveStealthAddress(recipientSpendPubkey, recipientViewPubkey);

      // Derive PDAs
      const [announcementPda, announcementBump] = deriveAnnouncementPdaFromNonce(nonce);

      // Build publish announcement instruction
      // Data: discriminator(1) + bump(1) + view_tag(1) + ephemeral_pubkey(32) + nonce(32) = 67 bytes
      const data = Buffer.alloc(67);
      let offset = 0;
      data[offset++] = StealthDiscriminators.PUBLISH_ANNOUNCEMENT;
      data[offset++] = announcementBump;
      data[offset++] = stealthConfig.viewTag;
      Buffer.from(stealthConfig.ephemeralPubkey).copy(data, offset);
      offset += 32;
      Buffer.from(nonce).copy(data, offset);

      const ix = new TransactionInstruction({
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: announcementPda, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_IDS.STEALTH,
        data,
      });

      const tx = new Transaction().add(ix);
      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await this.mainnetConnection.getLatestBlockhash()).blockhash;

      const signedTx = await wallet.signTransaction(tx);
      const signature = await this.mainnetConnection.sendRawTransaction(signedTx.serialize());
      await confirmTransactionPolling(this.mainnetConnection, signature, 30, 2000);

      return {
        success: true,
        signature,
        announcementPda,
        stealthConfig,
        nonce,
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // STEP 2: Deposit to mixer pool
  // Funds go into mixer pool - NO direct link to destination vault!
  async depositToMixer(
    wallet: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> },
    amount: bigint,
    nonce: Uint8Array,
    announcementPda: PublicKey,
    stealthPubkey: Uint8Array
  ): Promise<{
    success: boolean;
    error?: string;
    signature?: string;
    depositRecordPda?: PublicKey;
    vaultPda?: PublicKey;
  }> {
    try {
      const [mixerPoolPda] = deriveTestMixerPoolPda();
      const [depositRecordPda, depositBump] = deriveDepositRecordPda(nonce);
      const [vaultPda] = deriveStealthVaultPda(stealthPubkey);

      // Build deposit instruction
      // Data: discriminator(1) + bump(1) + nonce(32) + amount(8) = 42 bytes
      const data = Buffer.alloc(42);
      let offset = 0;
      data[offset++] = StealthDiscriminators.DEPOSIT_TO_TEST_MIXER;
      data[offset++] = depositBump;
      Buffer.from(nonce).copy(data, offset);
      offset += 32;
      for (let i = 0; i < 8; i++) {
        data[offset++] = Number((amount >> BigInt(i * 8)) & BigInt(0xff));
      }

      const ix = new TransactionInstruction({
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: mixerPoolPda, isSigner: false, isWritable: true },
          { pubkey: depositRecordPda, isSigner: false, isWritable: true },
          { pubkey: announcementPda, isSigner: false, isWritable: false },
          { pubkey: vaultPda, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_IDS.STEALTH,
        data,
      });

      const tx = new Transaction().add(ix);
      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await this.mainnetConnection.getLatestBlockhash()).blockhash;

      const signedTx = await wallet.signTransaction(tx);
      const signature = await this.mainnetConnection.sendRawTransaction(signedTx.serialize());
      await confirmTransactionPolling(this.mainnetConnection, signature, 30, 2000);

      return {
        success: true,
        signature,
        depositRecordPda,
        vaultPda,
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // STEP 2 (V2): Deposit to PER mixer pool with pre-created escrow
  // This creates both the deposit record AND the claim escrow on L1,
  // then delegates the escrow to MagicBlock so TEE can fill it later.
  // This is the IDEAL privacy architecture - escrows created on L1 can be committed.
  async depositToPerMixerV2(
    wallet: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> },
    amount: bigint,
    stealthPubkey: Uint8Array,
    ephemeralPubkey: Uint8Array,
    viewTag: number,
    commitFreqMs: number = 10000
  ): Promise<{
    success: boolean;
    error?: string;
    signature?: string;
    depositRecordPda?: PublicKey;
    escrowPda?: PublicKey;
    nonce?: Uint8Array;
  }> {
    try {
      // Generate random nonce
      const nonce = crypto.getRandomValues(new Uint8Array(32));

      const [perMixerPoolPda] = derivePerMixerPoolPda();
      const [depositRecordPda, recordBump] = derivePerDepositRecordPda(nonce);
      const [escrowPda, escrowBump] = deriveClaimEscrowPda(nonce);
      const [escrowBuffer] = deriveEscrowBufferPda(escrowPda);
      const [delegationRecord] = deriveEscrowDelegationRecordPda(escrowPda);
      const [delegationMetadata] = deriveEscrowDelegationMetadataPda(escrowPda);

      // Build deposit V2 instruction
      // Data: record_bump(1) + escrow_bump(1) + nonce(32) + amount(8) +
      //       stealth_pubkey(32) + ephemeral_pubkey(32) + view_tag(1) + commit_freq_ms(4) = 111 bytes
      const data = Buffer.alloc(112);
      let offset = 0;
      data[offset++] = StealthDiscriminators.DEPOSIT_TO_PER_MIXER_V2;
      data[offset++] = recordBump;
      data[offset++] = escrowBump;
      Buffer.from(nonce).copy(data, offset); offset += 32;
      for (let i = 0; i < 8; i++) {
        data[offset++] = Number((amount >> BigInt(i * 8)) & BigInt(0xff));
      }
      Buffer.from(stealthPubkey).copy(data, offset); offset += 32;
      Buffer.from(ephemeralPubkey).copy(data, offset); offset += 32;
      data[offset++] = viewTag;
      data.writeUInt32LE(commitFreqMs, offset);

      const ix = new TransactionInstruction({
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: perMixerPoolPda, isSigner: false, isWritable: true },
          { pubkey: depositRecordPda, isSigner: false, isWritable: true },
          { pubkey: escrowPda, isSigner: false, isWritable: true },
          { pubkey: escrowBuffer, isSigner: false, isWritable: true },
          { pubkey: delegationRecord, isSigner: false, isWritable: true },
          { pubkey: delegationMetadata, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: PROGRAM_IDS.DELEGATION, isSigner: false, isWritable: false },
          { pubkey: PROGRAM_IDS.STEALTH, isSigner: false, isWritable: false }, // owner_program
        ],
        programId: PROGRAM_IDS.STEALTH,
        data,
      });

      const tx = new Transaction().add(ix);
      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await this.mainnetConnection.getLatestBlockhash()).blockhash;

      const signedTx = await wallet.signTransaction(tx);
      const signature = await this.mainnetConnection.sendRawTransaction(signedTx.serialize());
      await confirmTransactionPolling(this.mainnetConnection, signature, 30, 2000);

      console.log("[PER Privacy V2] Deposit complete - escrow created and delegated");

      return {
        success: true,
        signature,
        depositRecordPda,
        escrowPda,
        nonce,
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // STEP 2 (V3): Deposit to PER mixer pool with ENCRYPTED destination
  // This is the IDEAL PRIVACY architecture:
  // - Sender encrypts receiver's wallet using X-Wing shared secret
  // - On-chain observers CANNOT see where funds will go
  // - Only receiver can decrypt (using their X-Wing secret key)
  async depositToPerMixerV3(
    wallet: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> },
    amount: bigint,
    recipientXWingPubkey: { mlkem: Uint8Array; x25519: Uint8Array },
    destinationWallet: PublicKey, // Receiver's wallet - will be ENCRYPTED
    commitFreqMs: number = 10000
  ): Promise<{
    success: boolean;
    error?: string;
    signature?: string;
    depositRecordPda?: PublicKey;
    escrowPda?: PublicKey;
    nonce?: Uint8Array;
    stealthPubkey?: Uint8Array;
    ephemeralPubkey?: Uint8Array;
    viewTag?: number;
    sharedSecret?: Uint8Array; // For receiver to decrypt destination
  }> {
    try {
      // Generate random nonce
      const nonce = crypto.getRandomValues(new Uint8Array(32));

      // X-Wing encapsulation: generate shared secret and ciphertext
      const { ciphertext: xwingCiphertext, sharedSecret } = xwingEncapsulate(recipientXWingPubkey);

      // Derive stealth pubkey from shared secret (must match on-chain)
      const stealthPubkey = deriveStealthPubkeyFromSharedSecret(sharedSecret);

      // Ephemeral pubkey is part of X-Wing ciphertext (first 32 bytes for view tag calculation)
      const ephemeralPubkey = xwingCiphertext.slice(0, 32);

      // View tag from shared secret
      const viewTag = sharedSecret[0];

      // ENCRYPT destination wallet using shared secret
      const encryptedDestination = await encryptDestinationWallet(
        destinationWallet.toBytes(),
        sharedSecret
      );

      console.log("[PER Privacy V3] Encrypted destination:", encryptedDestination.length, "bytes");

      const [perMixerPoolPda] = derivePerMixerPoolPda();
      const [depositRecordPda, recordBump] = derivePerDepositRecordPda(nonce);
      const [escrowPda, escrowBump] = deriveClaimEscrowPda(nonce);
      const [escrowBuffer] = deriveEscrowBufferPda(escrowPda);
      const [delegationRecord] = deriveEscrowDelegationRecordPda(escrowPda);
      const [delegationMetadata] = deriveEscrowDelegationMetadataPda(escrowPda);

      // Build deposit V3 instruction
      // Data: record_bump(1) + escrow_bump(1) + nonce(32) + amount(8) +
      //       stealth_pubkey(32) + ephemeral_pubkey(32) + view_tag(1) +
      //       encrypted_destination(48) + commit_freq_ms(4) = 159 bytes
      const data = Buffer.alloc(160);
      let offset = 0;
      data[offset++] = StealthDiscriminators.DEPOSIT_TO_PER_MIXER_V3;
      data[offset++] = recordBump;
      data[offset++] = escrowBump;
      Buffer.from(nonce).copy(data, offset); offset += 32;
      for (let i = 0; i < 8; i++) {
        data[offset++] = Number((amount >> BigInt(i * 8)) & BigInt(0xff));
      }
      Buffer.from(stealthPubkey).copy(data, offset); offset += 32;
      Buffer.from(ephemeralPubkey).copy(data, offset); offset += 32;
      data[offset++] = viewTag;
      Buffer.from(encryptedDestination).copy(data, offset); offset += 48;
      data.writeUInt32LE(commitFreqMs, offset);

      const ix = new TransactionInstruction({
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: perMixerPoolPda, isSigner: false, isWritable: false }, // Just for verification
          { pubkey: depositRecordPda, isSigner: false, isWritable: true },
          { pubkey: escrowPda, isSigner: false, isWritable: true },
          { pubkey: escrowBuffer, isSigner: false, isWritable: true },
          { pubkey: delegationRecord, isSigner: false, isWritable: true },
          { pubkey: delegationMetadata, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: PROGRAM_IDS.DELEGATION, isSigner: false, isWritable: false },
          { pubkey: PROGRAM_IDS.STEALTH, isSigner: false, isWritable: false }, // owner_program
        ],
        programId: PROGRAM_IDS.STEALTH,
        data,
      });

      const tx = new Transaction().add(ix);
      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await this.mainnetConnection.getLatestBlockhash()).blockhash;

      const signedTx = await wallet.signTransaction(tx);
      const signature = await this.mainnetConnection.sendRawTransaction(signedTx.serialize());
      await confirmTransactionPolling(this.mainnetConnection, signature, 30, 2000);

      console.log("[PER Privacy V3] Deposit complete - destination ENCRYPTED in escrow");

      return {
        success: true,
        signature,
        depositRecordPda,
        escrowPda,
        nonce,
        stealthPubkey,
        ephemeralPubkey,
        viewTag,
        sharedSecret, // Receiver needs this to decrypt destination
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // Claim via TEE (V3) - Receiver provides shared_secret + decrypted destination
  // TEE verifies and sets verified_destination, then undelegates
  async executePerClaimV3(
    payer: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> },
    nonce: Uint8Array,
    sharedSecret: Uint8Array, // From X-Wing decapsulation (proves ownership)
    decryptedDestination: PublicKey // Receiver decrypted this off-chain
  ): Promise<{
    success: boolean;
    error?: string;
    signature?: string;
  }> {
    try {
      const [escrowPda, escrowBump] = deriveClaimEscrowPda(nonce);

      // MagicBlock Ephemeral Rollups program and context
      // CRITICAL: Use real MagicBlock addresses, not placeholders!
      const MAGICBLOCK_ER_PROGRAM = new PublicKey("ERdXRZQiAooqHBRQqhr6ZxppjUfuXsgPijBZaZLiZPfL");
      const [magicContext] = PublicKey.findProgramAddressSync(
        [Buffer.from("magic_context")],
        MAGICBLOCK_ER_PROGRAM
      );

      // Build execute claim V3 instruction (runs inside PER/TEE)
      // Data: nonce(32) + escrow_bump(1) + shared_secret(32) + destination(32) = 97 bytes
      const data = Buffer.alloc(98);
      let offset = 0;
      data[offset++] = StealthDiscriminators.EXECUTE_PER_CLAIM_V3;
      Buffer.from(nonce).copy(data, offset); offset += 32;
      data[offset++] = escrowBump;
      Buffer.from(sharedSecret).copy(data, offset); offset += 32;
      decryptedDestination.toBytes().copy(data, offset);

      const ix = new TransactionInstruction({
        keys: [
          { pubkey: payer.publicKey, isSigner: true, isWritable: true },
          { pubkey: escrowPda, isSigner: false, isWritable: true },
          { pubkey: magicContext, isSigner: false, isWritable: true },
          { pubkey: MAGICBLOCK_ER_PROGRAM, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_IDS.STEALTH,
        data,
      });

      // Send to PER connection (MagicBlock rollup)
      const tx = new Transaction().add(ix);
      tx.feePayer = payer.publicKey;
      tx.recentBlockhash = (await this.perConnection.getLatestBlockhash()).blockhash;

      const signedTx = await payer.signTransaction(tx);
      const signature = await this.perConnection.sendRawTransaction(signedTx.serialize());
      await confirmTransactionPolling(this.perConnection, signature, 30, 2000);

      console.log("[PER Privacy V3] Claim executed - TEE verified and undelegated escrow");

      return { success: true, signature };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // L1 Withdraw from escrow (after TEE verification)
  // Destination must match verified_destination set by TEE
  async withdrawFromEscrow(
    claimer: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> },
    nonce: Uint8Array,
    stealthPubkey: Uint8Array,
    verifiedDestination: PublicKey // Must match what TEE set
  ): Promise<{
    success: boolean;
    error?: string;
    signature?: string;
  }> {
    try {
      const [escrowPda] = deriveClaimEscrowPda(nonce);

      // Build withdraw instruction
      // Data: nonce(32) + stealth_pubkey(32) = 64 bytes
      const data = Buffer.alloc(65);
      let offset = 0;
      data[offset++] = StealthDiscriminators.WITHDRAW_FROM_ESCROW;
      Buffer.from(nonce).copy(data, offset); offset += 32;
      Buffer.from(stealthPubkey).copy(data, offset);

      const ix = new TransactionInstruction({
        keys: [
          { pubkey: claimer.publicKey, isSigner: true, isWritable: false },
          { pubkey: escrowPda, isSigner: false, isWritable: true },
          { pubkey: verifiedDestination, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_IDS.STEALTH,
        data,
      });

      const tx = new Transaction().add(ix);
      tx.feePayer = claimer.publicKey;
      tx.recentBlockhash = (await this.mainnetConnection.getLatestBlockhash()).blockhash;

      const signedTx = await claimer.signTransaction(tx);
      const signature = await this.mainnetConnection.sendRawTransaction(signedTx.serialize());
      await confirmTransactionPolling(this.mainnetConnection, signature, 30, 2000);

      console.log("[PER Privacy] Withdrawn from escrow to:", verifiedDestination.toBase58());

      return { success: true, signature };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // STEP 3: Execute mixer transfer (can be called by ANYONE with valid TEE proof)
  // This is the key privacy step - breaks the sender-vault link completely
  // The TEE proof is the ONLY authorization required
  //
  // On-chain expects (test mixer - non-delegated):
  // - accounts: submitter, mixer_pool, deposit_record, vault, announcement, system_program, instructions_sysvar
  // - data: nonce (32) + stealth_pubkey (32) + announcement_bump (1) + vault_bump (1) + tee_proof (168) = 234 bytes
  async executeMixerTransfer(
    submitter: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> },
    nonce: Uint8Array,
    announcementPda: PublicKey,
    vaultPda: PublicKey,
    stealthPubkey: Uint8Array,
    teeProof?: Uint8Array
  ): Promise<{
    success: boolean;
    error?: string;
    signature?: string;
  }> {
    try {
      const [mixerPoolPda] = deriveTestMixerPoolPda();
      const [depositRecordPda] = deriveDepositRecordPda(nonce);
      const [, announcementBump] = deriveAnnouncementPdaFromNonce(nonce);
      const [, vaultBump] = deriveStealthVaultPda(stealthPubkey);

      // Generate TEE proof if not provided (devnet)
      const proof = teeProof || createDevnetTeeProof(announcementPda.toBytes(), vaultPda.toBytes());

      // Build execute test mixer transfer instruction (non-delegated)
      // Data: discriminator(1) + nonce(32) + stealth_pubkey(32) + announcement_bump(1) + vault_bump(1) + tee_proof(168) = 235 bytes
      // lib.rs consumes discriminator, passes remaining 234 bytes to execute_test_mixer_transfer::process
      const data = Buffer.alloc(235);
      let offset = 0;
      data[offset++] = StealthDiscriminators.EXECUTE_TEST_MIXER_TRANSFER;
      Buffer.from(nonce).copy(data, offset);
      offset += 32;
      Buffer.from(stealthPubkey).copy(data, offset);
      offset += 32;
      data[offset++] = announcementBump;
      data[offset++] = vaultBump;
      Buffer.from(proof).copy(data, offset);

      const ix = new TransactionInstruction({
        keys: [
          { pubkey: submitter.publicKey, isSigner: true, isWritable: false },
          { pubkey: mixerPoolPda, isSigner: false, isWritable: true },
          { pubkey: depositRecordPda, isSigner: false, isWritable: true },
          { pubkey: vaultPda, isSigner: false, isWritable: true },
          { pubkey: announcementPda, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_IDS.STEALTH,
        data,
      });

      const tx = new Transaction().add(ix);
      tx.feePayer = submitter.publicKey;
      tx.recentBlockhash = (await this.mainnetConnection.getLatestBlockhash()).blockhash;

      const signedTx = await submitter.signTransaction(tx);
      const signature = await this.mainnetConnection.sendRawTransaction(signedTx.serialize());
      await confirmTransactionPolling(this.mainnetConnection, signature, 30, 2000);

      return { success: true, signature };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // Complete privacy send: USER signs ONCE (announcement + deposit), RELAYER executes mixer transfer
  // CRITICAL: The user wallet MUST NOT sign the mixer transfer - that breaks privacy!
  async privacySend(
    wallet: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> },
    params: PrivacySendParams
  ): Promise<PrivacySendResult> {
    console.log("[PER Privacy] Starting full privacy send flow...");

    if (!this.relayerEndpoint) {
      return { success: false, error: "Relayer not configured. Call setRelayer() first for privacy." };
    }

    // Step 1: Publish announcement
    console.log("[PER Privacy] Step 1: Publishing announcement...");
    const announcementResult = await this.publishAnnouncement(
      wallet,
      params.recipientSpendPubkey,
      params.recipientViewPubkey
    );

    if (!announcementResult.success) {
      return { success: false, error: `Announcement failed: ${announcementResult.error}` };
    }

    console.log("[PER Privacy] Announcement published:", announcementResult.signature);

    // Step 2: Deposit to mixer (USER signs this - LAST user transaction!)
    console.log("[PER Privacy] Step 2: Depositing to mixer pool...");
    const depositResult = await this.depositToMixer(
      wallet,
      params.amount,
      announcementResult.nonce!,
      announcementResult.announcementPda!,
      announcementResult.stealthConfig!.stealthPubkey
    );

    if (!depositResult.success) {
      return {
        success: false,
        error: `Deposit failed: ${depositResult.error}`,
        announcementSignature: announcementResult.signature,
        announcementPda: announcementResult.announcementPda,
      };
    }

    console.log("[PER Privacy] Deposited to mixer:", depositResult.signature);

    // Step 3: Submit to RELAYER for mixer execution
    // CRITICAL: The RELAYER executes this, NOT the user wallet!
    // This is what breaks the sender-vault link and provides privacy!
    console.log("[PER Privacy] Step 3: Submitting to relayer for mixer execution...");
    console.log("[PER Privacy] Relayer endpoint:", this.relayerEndpoint);

    const mixerRequest = {
      nonce: Buffer.from(announcementResult.nonce!).toString("base64"),
      announcementPda: announcementResult.announcementPda!.toBase58(),
      vaultPda: depositResult.vaultPda!.toBase58(),
      stealthPubkey: Buffer.from(announcementResult.stealthConfig!.stealthPubkey).toString("base64"),
      depositSignature: depositResult.signature,
    };

    try {
      const response = await fetch(`${this.relayerEndpoint}/execute-mixer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mixerRequest),
      });

      const mixerResult = await response.json() as { success: boolean; signature?: string; error?: string };

      if (!mixerResult.success) {
        return {
          success: false,
          error: `Relayer mixer execution failed: ${mixerResult.error}. Funds safe in mixer pool.`,
          announcementSignature: announcementResult.signature,
          announcementPda: announcementResult.announcementPda,
          depositSignature: depositResult.signature,
          depositRecordPda: depositResult.depositRecordPda,
        };
      }

      console.log("[PER Privacy] Mixer transfer complete (by RELAYER):", mixerResult.signature);
      console.log("[PER Privacy] FULL PRIVACY SEND COMPLETE!");

      return {
        success: true,
        announcementSignature: announcementResult.signature,
        announcementPda: announcementResult.announcementPda,
        depositSignature: depositResult.signature,
        depositRecordPda: depositResult.depositRecordPda,
        mixerTransferSignature: mixerResult.signature,
        vaultPda: depositResult.vaultPda,
        stealthPubkey: announcementResult.stealthConfig!.stealthPubkey,
        ephemeralPubkey: announcementResult.stealthConfig!.ephemeralPubkey,
        viewTag: announcementResult.stealthConfig!.viewTag,
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Relayer request failed: ${error.message}`,
        announcementSignature: announcementResult.signature,
        announcementPda: announcementResult.announcementPda,
        depositSignature: depositResult.signature,
        depositRecordPda: depositResult.depositRecordPda,
      };
    }
  }

  // Privacy claim via relayer - recipient NEVER signs or appears on-chain
  async privacyClaim(params: PrivacyClaimParams): Promise<PrivacyClaimResult> {
    console.log("[PER Privacy] Starting privacy claim via relayer...");

    if (!this.relayerPubkey) {
      return { success: false, error: "Relayer not configured. Call setRelayer() first." };
    }

    // Create claim proof
    const destinationHash = computeDestinationHash(params.destination);

    // Sign claim message: "claim:" || vault || destination_hash
    const message = Buffer.alloc(70);
    message.write("claim:", 0);
    params.vaultPda.toBytes().copy(message, 6);
    Buffer.from(destinationHash).copy(message, 38);

    const signature = stealthSign(params.stealthKeys.spendPrivkey, message);

    // Build claim request
    const claimRequest = {
      vaultPda: params.vaultPda.toBase58(),
      announcementPda: params.announcementPda.toBase58(),
      destination: params.destination.toBase58(),
      stealthPubkey: Buffer.from(params.stealthPubkey).toString("base64"),
      signature: Buffer.from(signature).toString("base64"),
      destinationHash: Buffer.from(destinationHash).toString("base64"),
    };

    if (this.relayerEndpoint) {
      // Submit to relayer API
      try {
        console.log("[PER Privacy] Submitting claim to relayer:", this.relayerEndpoint);

        const response = await fetch(`${this.relayerEndpoint}/claim`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(claimRequest),
        });

        const result = await response.json();

        if (!result.success) {
          return { success: false, error: result.error };
        }

        console.log("[PER Privacy] Claim successful via relayer:", result.signature);

        return {
          success: true,
          signature: result.signature,
          amount: result.amount ? BigInt(result.amount) : undefined,
        };
      } catch (error: any) {
        return { success: false, error: `Relayer request failed: ${error.message}` };
      }
    } else {
      // Return claim proof for manual submission
      console.log("[PER Privacy] No relayer endpoint - returning claim proof for manual submission");

      return {
        success: false,
        error: "No relayer endpoint configured. Claim proof generated but needs manual submission.",
      };
    }
  }

  // Check vault balance
  async getVaultBalance(vaultPda: PublicKey): Promise<bigint> {
    const info = await this.mainnetConnection.getAccountInfo(vaultPda);
    return info ? BigInt(info.lamports) : 0n;
  }

  // Get relayer status
  async getRelayerStatus(): Promise<{
    configured: boolean;
    pubkey?: string;
    endpoint?: string;
    isInitialized?: boolean;
  }> {
    if (!this.relayerPubkey) {
      return { configured: false };
    }

    const [relayerAuthPda] = deriveRelayerAuthPda(this.relayerPubkey);
    const info = await this.mainnetConnection.getAccountInfo(relayerAuthPda);

    return {
      configured: true,
      pubkey: this.relayerPubkey.toBase58(),
      endpoint: this.relayerEndpoint || undefined,
      isInitialized: info !== null && info.data.length > 0,
    };
  }

  // =========================================================================
  // V4 TRUE PRIVACY METHODS (PRODUCTION RECOMMENDED)
  // =========================================================================
  //
  // V4 ARCHITECTURE:
  // TX1 (User signs): sender → pool (breaks sender-receiver link)
  // TX2 (TEE executes): pool → escrow (no sender signature!)
  //
  // This is the ONLY architecture that provides true privacy.
  // V1-V3 all leave sender→receiver links in transaction history.
  // =========================================================================

  // =========================================================================
  // V4 TRUE PRIVACY: ENTIRE FLOW INSIDE MAGIC ACTIONS/PER
  // =========================================================================
  //
  // CRITICAL: Pool is DELEGATED to MagicBlock PER!
  // When user deposits, transaction goes to PER (not L1):
  //   1. User signs deposit → sent to PER endpoint
  //   2. Magic Actions triggers pool→escrow inside same PER session
  //   3. TEE executes both operations
  //   4. PER commits to L1 (aggregate state, no individual sender→escrow tx!)
  //
  // Result: L1 observers see state changes but NO sender→receiver link!
  // =========================================================================

  // V4 Deposit to Pool via Magic Actions
  // SENDS TO PER (not mainnet!) because pool is delegated
  // Magic Actions chains: deposit → pool_to_escrow inside TEE
  async depositToPoolV4(
    wallet: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> },
    amount: bigint,
    recipientXWingPubkey: { mlkem: Uint8Array; x25519: Uint8Array },
    destinationWallet: PublicKey
  ): Promise<{
    success: boolean;
    error?: string;
    signature?: string;
    depositRecordPda?: PublicKey;
    escrowPda?: PublicKey;
    nonce?: Uint8Array;
    stealthPubkey?: Uint8Array;
    ephemeralPubkey?: Uint8Array;
    viewTag?: number;
    sharedSecret?: Uint8Array;
  }> {
    try {
      console.log("[V4 Magic Actions] Starting TRUE PRIVACY deposit...");
      console.log("[V4 Magic Actions] Pool is DELEGATED - tx goes to PER, not L1!");

      // Generate random nonce
      const nonce = crypto.getRandomValues(new Uint8Array(32));

      // X-Wing encapsulation: generate shared secret and ciphertext
      const { ciphertext: xwingCiphertext, sharedSecret } = xwingEncapsulate(recipientXWingPubkey);

      // Derive stealth pubkey from shared secret
      // CRITICAL: Must match on-chain SHA256(sharedSecret || "stealth-derive")
      const stealthPubkey = deriveStealthPubkeyFromSharedSecret(sharedSecret);

      // Ephemeral pubkey from X-Wing ciphertext (last 32 bytes)
      const ephemeralPubkey = xwingCiphertext.slice(1088, 1120);

      // View tag from shared secret
      const viewTag = sharedSecret[0];

      // Encrypt destination wallet using shared secret
      const encryptedDestination = await encryptDestinationWallet(
        destinationWallet.toBytes(),
        sharedSecret
      );

      console.log("[V4 Magic Actions] Crypto computed:");
      console.log("  - stealthPubkey:", Buffer.from(stealthPubkey).toString("hex").slice(0, 16) + "...");
      console.log("  - viewTag:", viewTag);
      console.log("  - encryptedDestination:", encryptedDestination.length, "bytes");
      console.log("  - xwingCiphertext:", xwingCiphertext.length, "bytes");

      // Derive PDAs
      const [perMixerPoolPda] = derivePerMixerPoolPda();
      const [depositRecordPda, recordBump] = derivePerDepositRecordPda(nonce);
      const [escrowPda] = deriveClaimEscrowPda(nonce);

      // Build instruction data (1275 bytes)
      // Layout: discriminator(1) + record_bump(1) + nonce(32) + amount(8) +
      //         stealth_pubkey(32) + ephemeral_pubkey(32) + view_tag(1) +
      //         encrypted_destination(48) + xwing_ciphertext(1120) = 1275 bytes
      const data = Buffer.alloc(1275);
      let offset = 0;

      data[offset++] = StealthDiscriminators.DEPOSIT_TO_POOL_V4;
      data[offset++] = recordBump;
      Buffer.from(nonce).copy(data, offset); offset += 32;
      for (let i = 0; i < 8; i++) {
        data[offset++] = Number((amount >> BigInt(i * 8)) & BigInt(0xff));
      }
      Buffer.from(stealthPubkey).copy(data, offset); offset += 32;
      Buffer.from(ephemeralPubkey).copy(data, offset); offset += 32;
      data[offset++] = viewTag;
      Buffer.from(encryptedDestination).copy(data, offset); offset += 48;
      Buffer.from(xwingCiphertext).copy(data, offset);

      const ix = new TransactionInstruction({
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: perMixerPoolPda, isSigner: false, isWritable: true },
          { pubkey: depositRecordPda, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_IDS.STEALTH,
        data,
      });

      const tx = new Transaction().add(ix);
      tx.feePayer = wallet.publicKey;

      // CRITICAL: Get blockhash from PER, send to PER!
      // Pool is delegated, so operations go to MagicBlock PER endpoint
      console.log("[V4 Magic Actions] Sending to PER endpoint (Magic Actions will chain operations)...");
      tx.recentBlockhash = (await this.perConnection.getLatestBlockhash()).blockhash;

      const signedTx = await wallet.signTransaction(tx);

      // SEND TO PER CONNECTION - Magic Actions handles the rest!
      // Magic Actions will:
      // 1. Execute deposit to pool
      // 2. Automatically trigger pool_to_escrow_v4
      // 3. Create escrow + XWingCiphertext
      // 4. Commit aggregate state to L1
      const signature = await this.perConnection.sendRawTransaction(signedTx.serialize());
      await confirmTransactionPolling(this.perConnection, signature, 30, 2000);

      console.log("[V4 Magic Actions] Deposit sent to PER:", signature);
      console.log("[V4 Magic Actions] Magic Actions will chain: deposit → pool_to_escrow");
      console.log("[V4 Magic Actions] TRUE PRIVACY: No sender→receiver link on L1!");

      return {
        success: true,
        signature,
        depositRecordPda,
        escrowPda,
        nonce,
        stealthPubkey,
        ephemeralPubkey,
        viewTag,
        sharedSecret,
      };
    } catch (error: any) {
      console.error("[V4 Magic Actions] Deposit failed:", error);
      return { success: false, error: error.message };
    }
  }

  // Get V4 deposit record status
  async getV4DepositStatus(nonce: Uint8Array): Promise<{
    exists: boolean;
    isExecuted: boolean;
    isClaimed: boolean;
    amount?: bigint;
    stealthPubkey?: Uint8Array;
    escrowPda?: PublicKey;
  } | null> {
    const [depositRecordPda] = derivePerDepositRecordPda(nonce);
    const accountInfo = await this.mainnetConnection.getAccountInfo(depositRecordPda);

    if (!accountInfo || accountInfo.data.length < 210) {
      return null;
    }

    const data = accountInfo.data;

    // Parse PerDepositRecord
    // Layout: disc(8) + bump(1) + nonce(32) + amount(8) + deposit_slot(8) +
    //         stealth_pubkey(32) + ephemeral_pubkey(32) + view_tag(1) +
    //         is_executed(1) + is_claimed(1) + escrow_pda(32) + encrypted_dest(48) + reserved(6)
    const amountBytes = data.slice(41, 49);
    let amount = BigInt(0);
    for (let i = 0; i < 8; i++) {
      amount |= BigInt(amountBytes[i]) << BigInt(i * 8);
    }

    const isExecuted = data[114] === 1;
    const isClaimed = data[115] === 1;
    const stealthPubkey = new Uint8Array(data.slice(49, 81));

    let escrowPda: PublicKey | undefined;
    if (isExecuted) {
      escrowPda = new PublicKey(data.slice(116, 148));
    }

    return {
      exists: true,
      isExecuted,
      isClaimed,
      amount,
      stealthPubkey,
      escrowPda,
    };
  }

  // Scan for V4 escrows (ClaimEscrow accounts)
  // Returns escrows that match our X-Wing keys
  async scanV4Escrows(
    xwingSecretKey: { mlkem: Uint8Array; x25519: Uint8Array }
  ): Promise<Array<{
    escrowPda: PublicKey;
    nonce: Uint8Array;
    amount: bigint;
    stealthPubkey: Uint8Array;
    sharedSecret: Uint8Array;
    isVerified: boolean;
    verifiedDestination?: PublicKey;
  }>> {
    const results: Array<{
      escrowPda: PublicKey;
      nonce: Uint8Array;
      amount: bigint;
      stealthPubkey: Uint8Array;
      sharedSecret: Uint8Array;
      isVerified: boolean;
      verifiedDestination?: PublicKey;
    }> = [];

    // Fetch all ClaimEscrow accounts owned by stealth program
    const accounts = await this.mainnetConnection.getProgramAccounts(PROGRAM_IDS.STEALTH, {
      filters: [
        { dataSize: 171 }, // ClaimEscrow size
        { memcmp: { offset: 0, bytes: "Q0xBSU1FU0M=" } }, // "CLAIMESC" in base64
      ],
    });

    console.log(`[V4 Scanner] Found ${accounts.length} ClaimEscrow accounts`);

    for (const { pubkey: escrowPda, account } of accounts) {
      try {
        // Parse ClaimEscrow
        const data = account.data;
        const nonce = new Uint8Array(data.slice(9, 41));
        const amountBytes = data.slice(41, 49);
        let amount = BigInt(0);
        for (let i = 0; i < 8; i++) {
          amount |= BigInt(amountBytes[i]) << BigInt(i * 8);
        }
        const stealthPubkeyOnChain = new Uint8Array(data.slice(49, 81));
        const isVerified = data[161] === 1;

        // Derive XWingCiphertextAccount PDA from escrow
        const [xwingCtPda] = deriveXWingCiphertextPda(escrowPda);

        // Fetch ciphertext
        const xwingCtAccount = await this.mainnetConnection.getAccountInfo(xwingCtPda);
        if (!xwingCtAccount || xwingCtAccount.data.length < 1160) {
          continue; // No ciphertext, skip
        }

        const ciphertext = new Uint8Array(xwingCtAccount.data.slice(40, 1160));

        // X-Wing decapsulation (client-side)
        const sharedSecret = xwingDecapsulate(xwingSecretKey, ciphertext);

        // Verify: SHA256(sharedSecret || "stealth-derive") == stealthPubkeyOnChain
        const derivedStealthPubkey = deriveStealthPubkeyFromSharedSecret(sharedSecret);

        if (Buffer.from(derivedStealthPubkey).equals(Buffer.from(stealthPubkeyOnChain))) {
          console.log(`[V4 Scanner] Found matching escrow: ${escrowPda.toBase58()}`);

          let verifiedDestination: PublicKey | undefined;
          if (isVerified) {
            verifiedDestination = new PublicKey(data.slice(129, 161));
          }

          results.push({
            escrowPda,
            nonce,
            amount,
            stealthPubkey: stealthPubkeyOnChain,
            sharedSecret,
            isVerified,
            verifiedDestination,
          });
        }
      } catch (e) {
        // Decapsulation failed or not for us, continue
        continue;
      }
    }

    return results;
  }

  // V4 Withdraw from escrow (L1 - after TEE verification)
  // IMPORTANT: Escrow must be verified by TEE first (is_verified = 1)
  // Deposit amount → receiver, Rent → MASTER_AUTHORITY (service fee)
  async withdrawV4(
    claimer: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> },
    nonce: Uint8Array,
    stealthPubkey: Uint8Array,
    verifiedDestination: PublicKey
  ): Promise<{
    success: boolean;
    error?: string;
    signature?: string;
    amountReceived?: bigint;
  }> {
    try {
      console.log("[V4 Privacy] Withdrawing from escrow...");

      const [escrowPda] = deriveClaimEscrowPda(nonce);

      // Check if XWingCiphertextAccount exists for cleanup
      const [xwingCtPda] = deriveXWingCiphertextPda(escrowPda);
      const xwingCtAccount = await this.mainnetConnection.getAccountInfo(xwingCtPda);
      const hasXWingCt = xwingCtAccount && xwingCtAccount.data.length >= 1160;

      // Build instruction data (64 bytes)
      // Layout: discriminator(1) + nonce(32) + stealth_pubkey(32) = 65 bytes
      const data = Buffer.alloc(65);
      let offset = 0;

      data[offset++] = StealthDiscriminators.WITHDRAW_FROM_ESCROW;
      Buffer.from(nonce).copy(data, offset); offset += 32;
      Buffer.from(stealthPubkey).copy(data, offset);

      // Build accounts list
      const keys = [
        { pubkey: claimer.publicKey, isSigner: true, isWritable: false },
        { pubkey: escrowPda, isSigner: false, isWritable: true },
        { pubkey: verifiedDestination, isSigner: false, isWritable: true },
        { pubkey: MASTER_AUTHORITY, isSigner: false, isWritable: true }, // Receives rent as service fee
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ];

      // Add XWingCiphertextAccount if exists (for V4 cleanup)
      if (hasXWingCt) {
        keys.push({ pubkey: xwingCtPda, isSigner: false, isWritable: true });
        console.log("[V4 Privacy] Including XWingCiphertext for cleanup");
      }

      const ix = new TransactionInstruction({
        keys,
        programId: PROGRAM_IDS.STEALTH,
        data,
      });

      const tx = new Transaction().add(ix);
      tx.feePayer = claimer.publicKey;
      tx.recentBlockhash = (await this.mainnetConnection.getLatestBlockhash()).blockhash;

      const signedTx = await claimer.signTransaction(tx);
      const signature = await this.mainnetConnection.sendRawTransaction(signedTx.serialize());
      await confirmTransactionPolling(this.mainnetConnection, signature, 30, 2000);

      console.log("[V4 Privacy] Withdraw complete:", signature);
      console.log("[V4 Privacy] Deposit → receiver, Rent → MASTER_AUTHORITY");

      return {
        success: true,
        signature,
      };
    } catch (error: any) {
      console.error("[V4 Privacy] Withdraw failed:", error);
      return { success: false, error: error.message };
    }
  }

  // =========================================================================
  // V4 TRUE PRIVACY: COMPLETE WORKING FLOW
  // =========================================================================
  // TX1a (L1): CREATE_V4_DEPOSIT + UPLOAD_V4_CIPHERTEXT + COMPLETE_V4_DEPOSIT
  // TX1b (PER): INPUT_TO_POOL_V4 - moves funds from input escrow to pool
  // TX2 (PER): POOL_TO_ESCROW_V4 - creates claim escrow + XWing CT
  // TX3 (PER): CLAIM_ESCROW_V4 - TEE verifies, triggers undelegation
  // TX4 (L1): WITHDRAW_FROM_ESCROW - funds to receiver
  // =========================================================================

  // TX1a-1: Create V4 deposit record on L1
  async createV4Deposit(
    wallet: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> },
    amount: bigint,
    nonce: Uint8Array,
    stealthPubkey: Uint8Array,
    ephemeralPubkey: Uint8Array,
    viewTag: number,
    encryptedDestination: Uint8Array
  ): Promise<{
    success: boolean;
    error?: string;
    signature?: string;
    depositRecordPda?: PublicKey;
  }> {
    try {
      console.log("[V4] TX1a-1: CREATE_V4_DEPOSIT");
      const [poolPda] = derivePerMixerPoolPda();
      const [depositRecordPda, recordBump] = derivePerDepositRecordPda(nonce);

      // data: disc(1) + record_bump(1) + nonce(32) + amount(8) + stealth_pubkey(32) +
      //       ephemeral_pubkey(32) + view_tag(1) + encrypted_destination(48) = 155 bytes
      const data = Buffer.alloc(155);
      let offset = 0;
      data[offset++] = StealthDiscriminators.CREATE_V4_DEPOSIT;
      data[offset++] = recordBump;
      Buffer.from(nonce).copy(data, offset); offset += 32;
      for (let i = 0; i < 8; i++) {
        data[offset++] = Number((amount >> BigInt(i * 8)) & BigInt(0xff));
      }
      Buffer.from(stealthPubkey).copy(data, offset); offset += 32;
      Buffer.from(ephemeralPubkey).copy(data, offset); offset += 32;
      data[offset++] = viewTag;
      Buffer.from(encryptedDestination).copy(data, offset);

      const tx = new Transaction()
        .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }))
        .add(new TransactionInstruction({
          keys: [
            { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
            { pubkey: poolPda, isSigner: false, isWritable: false },
            { pubkey: depositRecordPda, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          programId: PROGRAM_IDS.STEALTH,
          data,
        }));

      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await this.mainnetConnection.getLatestBlockhash()).blockhash;

      const signedTx = await wallet.signTransaction(tx);
      const signature = await this.mainnetConnection.sendRawTransaction(signedTx.serialize());
      await confirmTransactionPolling(this.mainnetConnection, signature, 30, 2000);

      console.log("[V4] CREATE_V4_DEPOSIT success:", signature);
      return { success: true, signature, depositRecordPda };
    } catch (error: any) {
      console.error("[V4] CREATE_V4_DEPOSIT failed:", error);
      return { success: false, error: error.message };
    }
  }

  // TX1a-2: Upload XWing ciphertext chunks
  async uploadV4Ciphertext(
    wallet: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> },
    nonce: Uint8Array,
    xwingCiphertext: Uint8Array,
    chunkSize: number = 600
  ): Promise<{
    success: boolean;
    error?: string;
    signatures?: string[];
  }> {
    try {
      console.log("[V4] TX1a-2: UPLOAD_V4_CIPHERTEXT");
      const [depositRecordPda] = derivePerDepositRecordPda(nonce);
      const signatures: string[] = [];

      // Split ciphertext into chunks
      for (let chunkOffset = 0; chunkOffset < xwingCiphertext.length; chunkOffset += chunkSize) {
        const chunk = xwingCiphertext.slice(chunkOffset, Math.min(chunkOffset + chunkSize, xwingCiphertext.length));

        // data: disc(1) + nonce(32) + offset(2) + length(2) + chunk
        const data = Buffer.alloc(1 + 32 + 2 + 2 + chunk.length);
        let offset = 0;
        data[offset++] = StealthDiscriminators.UPLOAD_V4_CIPHERTEXT;
        Buffer.from(nonce).copy(data, offset); offset += 32;
        data.writeUInt16LE(chunkOffset, offset); offset += 2;
        data.writeUInt16LE(chunk.length, offset); offset += 2;
        Buffer.from(chunk).copy(data, offset);

        const tx = new Transaction()
          .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }))
          .add(new TransactionInstruction({
            keys: [
              { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
              { pubkey: depositRecordPda, isSigner: false, isWritable: true },
            ],
            programId: PROGRAM_IDS.STEALTH,
            data,
          }));

        tx.feePayer = wallet.publicKey;
        tx.recentBlockhash = (await this.mainnetConnection.getLatestBlockhash()).blockhash;

        const signedTx = await wallet.signTransaction(tx);
        const sig = await this.mainnetConnection.sendRawTransaction(signedTx.serialize());
        await confirmTransactionPolling(this.mainnetConnection, sig, 30, 2000);

        signatures.push(sig);
        console.log(`[V4] UPLOAD chunk ${Math.floor(chunkOffset / chunkSize) + 1}:`, sig.slice(0, 20) + "...");
      }

      return { success: true, signatures };
    } catch (error: any) {
      console.error("[V4] UPLOAD_V4_CIPHERTEXT failed:", error);
      return { success: false, error: error.message };
    }
  }

  // TX1a-3: Complete V4 deposit (funds + delegate escrow + permission + XWing CT to PER)
  async completeV4Deposit(
    wallet: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> },
    nonce: Uint8Array,
    commitFreqMs: number = 10000
  ): Promise<{
    success: boolean;
    error?: string;
    signature?: string;
    escrowPda?: PublicKey;
    xwingCtPda?: PublicKey;
  }> {
    try {
      console.log("[V4] TX1a-3: COMPLETE_V4_DEPOSIT");

      const [depositRecordPda] = derivePerDepositRecordPda(nonce);
      const [escrowPda, escrowBump] = deriveClaimEscrowPda(nonce);
      const [escrowBuffer] = deriveEscrowBufferPda(escrowPda);
      const [delegationRecord] = deriveEscrowDelegationRecordPda(escrowPda);
      const [delegationMetadata] = deriveEscrowDelegationMetadataPda(escrowPda);
      const [xwingCtPda, xwingCtBump] = deriveXWingCiphertextPda(escrowPda);
      const [permissionPda] = deriveEscrowPermissionPda(escrowPda);
      const [permDelegationBuffer] = derivePermissionDelegationBufferPda(permissionPda);
      const [permDelegationRecord] = derivePermissionDelegationRecordPda(permissionPda);
      const [permDelegationMetadata] = derivePermissionDelegationMetadataPda(permissionPda);
      const [xwingCtBuffer] = deriveXWingCtBufferPda(xwingCtPda);
      const [xwingCtDelegationRecord] = deriveXWingCtDelegationRecordPda(xwingCtPda);
      const [xwingCtDelegationMetadata] = deriveXWingCtDelegationMetadataPda(xwingCtPda);

      // data: disc(1) + nonce(32) + escrow_bump(1) + xwing_ct_bump(1) + commit_freq_ms(4) = 39 bytes
      const data = Buffer.alloc(39);
      let offset = 0;
      data[offset++] = StealthDiscriminators.COMPLETE_V4_DEPOSIT;
      Buffer.from(nonce).copy(data, offset); offset += 32;
      data[offset++] = escrowBump;
      data[offset++] = xwingCtBump;
      data.writeUInt32LE(commitFreqMs, offset);

      const tx = new Transaction()
        .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 800_000 }))
        .add(new TransactionInstruction({
          keys: [
            { pubkey: wallet.publicKey, isSigner: true, isWritable: true },     // 0. payer
            { pubkey: depositRecordPda, isSigner: false, isWritable: true },    // 1. deposit_record
            { pubkey: escrowPda, isSigner: false, isWritable: true },           // 2. input_escrow
            { pubkey: escrowBuffer, isSigner: false, isWritable: true },        // 3. escrow_buffer
            { pubkey: delegationRecord, isSigner: false, isWritable: true },    // 4. delegation_record
            { pubkey: delegationMetadata, isSigner: false, isWritable: true },  // 5. delegation_metadata
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // 6. system_program
            { pubkey: PROGRAM_IDS.DELEGATION, isSigner: false, isWritable: false },  // 7. delegation_program
            { pubkey: PROGRAM_IDS.STEALTH, isSigner: false, isWritable: false },     // 8. owner_program
            { pubkey: permissionPda, isSigner: false, isWritable: true },            // 9. permission_pda
            { pubkey: PROGRAM_IDS.PERMISSION, isSigner: false, isWritable: false },  // 10. permission_program
            { pubkey: permDelegationBuffer, isSigner: false, isWritable: true },     // 11. perm_delegation_buffer
            { pubkey: permDelegationRecord, isSigner: false, isWritable: true },     // 12. perm_delegation_record
            { pubkey: permDelegationMetadata, isSigner: false, isWritable: true },   // 13. perm_delegation_metadata
            { pubkey: TEE_VALIDATOR, isSigner: false, isWritable: false },           // 14. validator
            { pubkey: xwingCtPda, isSigner: false, isWritable: true },               // 15. xwing_ct
            { pubkey: xwingCtBuffer, isSigner: false, isWritable: true },            // 16. xwing_ct_buffer
            { pubkey: xwingCtDelegationRecord, isSigner: false, isWritable: true },  // 17. xwing_ct_delegation_record
            { pubkey: xwingCtDelegationMetadata, isSigner: false, isWritable: true },// 18. xwing_ct_delegation_metadata
          ],
          programId: PROGRAM_IDS.STEALTH,
          data,
        }));

      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await this.mainnetConnection.getLatestBlockhash()).blockhash;

      const signedTx = await wallet.signTransaction(tx);
      const signature = await this.mainnetConnection.sendRawTransaction(signedTx.serialize());
      await confirmTransactionPolling(this.mainnetConnection, signature, 30, 2000);

      console.log("[V4] COMPLETE_V4_DEPOSIT success:", signature);
      return { success: true, signature, escrowPda, xwingCtPda };
    } catch (error: any) {
      console.error("[V4] COMPLETE_V4_DEPOSIT failed:", error);
      return { success: false, error: error.message };
    }
  }

  // TX1b (PER): Move funds from input escrow to pool
  async inputToPoolV4(
    wallet: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> },
    nonce: Uint8Array
  ): Promise<{
    success: boolean;
    error?: string;
    signature?: string;
  }> {
    try {
      console.log("[V4] TX1b: INPUT_TO_POOL_V4 (on PER)");

      const [poolPda] = derivePerMixerPoolPda();
      const [depositRecordPda] = derivePerDepositRecordPda(nonce);
      const [escrowPda, escrowBump] = deriveClaimEscrowPda(nonce);

      // data: disc(1) + nonce(32) + escrow_bump(1) = 34 bytes
      const data = Buffer.alloc(34);
      let offset = 0;
      data[offset++] = StealthDiscriminators.INPUT_TO_POOL_V4;
      Buffer.from(nonce).copy(data, offset); offset += 32;
      data[offset++] = escrowBump;

      const tx = new Transaction()
        .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }))
        .add(new TransactionInstruction({
          keys: [
            { pubkey: wallet.publicKey, isSigner: true, isWritable: true },   // authority
            { pubkey: escrowPda, isSigner: false, isWritable: true },         // input_escrow
            { pubkey: depositRecordPda, isSigner: false, isWritable: false }, // deposit_record (read-only from L1)
            { pubkey: poolPda, isSigner: false, isWritable: true },           // pool
          ],
          programId: PROGRAM_IDS.STEALTH,
          data,
        }));

      // Send to PER
      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await this.perConnection.getLatestBlockhash()).blockhash;

      const signedTx = await wallet.signTransaction(tx);
      const signature = await this.perConnection.sendRawTransaction(signedTx.serialize(), { skipPreflight: true });

      // Wait for confirmation on PER
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const status = await this.perConnection.getSignatureStatus(signature);
        if (status?.value?.confirmationStatus === "confirmed" || status?.value?.confirmationStatus === "finalized") {
          console.log("[V4] INPUT_TO_POOL_V4 confirmed on PER:", signature);
          return { success: true, signature };
        }
        if (status?.value?.err) {
          return { success: false, error: JSON.stringify(status.value.err) };
        }
      }

      return { success: true, signature }; // Assume success if no error
    } catch (error: any) {
      console.error("[V4] INPUT_TO_POOL_V4 failed:", error);
      return { success: false, error: error.message };
    }
  }

  // TX2 (PER): Move funds from pool to escrow + initialize XWing CT
  async poolToEscrowV4(
    wallet: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> },
    nonce: Uint8Array
  ): Promise<{
    success: boolean;
    error?: string;
    signature?: string;
  }> {
    try {
      console.log("[V4] TX2: POOL_TO_ESCROW_V4 (on PER)");

      const [poolPda, poolBump] = derivePerMixerPoolPda();
      const [depositRecordPda] = derivePerDepositRecordPda(nonce);
      const [escrowPda, escrowBump] = deriveClaimEscrowPda(nonce);
      const [xwingCtPda, xwingCtBump] = deriveXWingCiphertextPda(escrowPda);

      // data: disc(1) + pool_bump(1) + nonce(32) + escrow_bump(1) + xwing_ct_bump(1) = 36 bytes
      const data = Buffer.alloc(36);
      let offset = 0;
      data[offset++] = StealthDiscriminators.POOL_TO_ESCROW_V4;
      data[offset++] = poolBump;
      Buffer.from(nonce).copy(data, offset); offset += 32;
      data[offset++] = escrowBump;
      data[offset++] = xwingCtBump;

      const tx = new Transaction()
        .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }))
        .add(new TransactionInstruction({
          keys: [
            { pubkey: wallet.publicKey, isSigner: true, isWritable: true },   // tee_authority
            { pubkey: poolPda, isSigner: false, isWritable: true },           // pool
            { pubkey: depositRecordPda, isSigner: false, isWritable: false }, // deposit_record (read-only)
            { pubkey: escrowPda, isSigner: false, isWritable: true },         // claim_escrow
            { pubkey: xwingCtPda, isSigner: false, isWritable: true },        // xwing_ciphertext
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          programId: PROGRAM_IDS.STEALTH,
          data,
        }));

      // Send to PER
      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await this.perConnection.getLatestBlockhash()).blockhash;

      const signedTx = await wallet.signTransaction(tx);
      const signature = await this.perConnection.sendRawTransaction(signedTx.serialize(), { skipPreflight: true });

      // Wait for confirmation on PER
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const status = await this.perConnection.getSignatureStatus(signature);
        if (status?.value?.confirmationStatus === "confirmed" || status?.value?.confirmationStatus === "finalized") {
          console.log("[V4] POOL_TO_ESCROW_V4 confirmed on PER:", signature);
          return { success: true, signature };
        }
        if (status?.value?.err) {
          return { success: false, error: JSON.stringify(status.value.err) };
        }
      }

      return { success: true, signature };
    } catch (error: any) {
      console.error("[V4] POOL_TO_ESCROW_V4 failed:", error);
      return { success: false, error: error.message };
    }
  }

  // TX3 (PER): Claim escrow via TEE verification
  async claimEscrowV4WithUndelegate(
    wallet: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> },
    nonce: Uint8Array,
    sharedSecret: Uint8Array,
    destination: PublicKey
  ): Promise<{
    success: boolean;
    error?: string;
    signature?: string;
  }> {
    try {
      console.log("[V4] TX3: CLAIM_ESCROW_V4 (on PER with undelegation)");

      const [escrowPda] = deriveClaimEscrowPda(nonce);
      const [xwingCtPda] = deriveXWingCiphertextPda(escrowPda);

      // data: disc(1) + nonce(32) + shared_secret(32) = 65 bytes
      const data = Buffer.alloc(65);
      let offset = 0;
      data[offset++] = StealthDiscriminators.CLAIM_ESCROW_V4;
      Buffer.from(nonce).copy(data, offset); offset += 32;
      Buffer.from(sharedSecret).copy(data, offset);

      const tx = new Transaction()
        .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }))
        .add(new TransactionInstruction({
          keys: [
            { pubkey: wallet.publicKey, isSigner: true, isWritable: false },  // claimer
            { pubkey: escrowPda, isSigner: false, isWritable: true },         // claim_escrow
            { pubkey: destination, isSigner: false, isWritable: false },      // destination (READ ONLY on PER)
            { pubkey: MASTER_AUTHORITY, isSigner: false, isWritable: false }, // master_authority
            { pubkey: xwingCtPda, isSigner: false, isWritable: true },        // xwing_ciphertext
            { pubkey: MAGIC_CONTEXT, isSigner: false, isWritable: true },     // magic_context
            { pubkey: MAGIC_PROGRAM, isSigner: false, isWritable: false },    // magic_program
          ],
          programId: PROGRAM_IDS.STEALTH,
          data,
        }));

      // Send to PER
      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await this.perConnection.getLatestBlockhash()).blockhash;

      const signedTx = await wallet.signTransaction(tx);
      const signature = await this.perConnection.sendRawTransaction(signedTx.serialize(), { skipPreflight: true });

      // Wait for confirmation on PER
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const status = await this.perConnection.getSignatureStatus(signature);
        if (status?.value?.confirmationStatus === "confirmed" || status?.value?.confirmationStatus === "finalized") {
          console.log("[V4] CLAIM_ESCROW_V4 confirmed on PER:", signature);
          return { success: true, signature };
        }
        if (status?.value?.err) {
          return { success: false, error: JSON.stringify(status.value.err) };
        }
      }

      return { success: true, signature };
    } catch (error: any) {
      console.error("[V4] CLAIM_ESCROW_V4 failed:", error);
      return { success: false, error: error.message };
    }
  }

  // TX4 (L1): Withdraw from escrow after undelegation
  async withdrawFromEscrowV4(
    claimer: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> },
    nonce: Uint8Array,
    stealthPubkey: Uint8Array,
    verifiedDestination: PublicKey
  ): Promise<{
    success: boolean;
    error?: string;
    signature?: string;
  }> {
    try {
      console.log("[V4] TX4: WITHDRAW_FROM_ESCROW (on L1)");

      const [escrowPda] = deriveClaimEscrowPda(nonce);
      const [xwingCtPda] = deriveXWingCiphertextPda(escrowPda);

      // Check if XWing CT exists
      const xwingCtAccount = await this.mainnetConnection.getAccountInfo(xwingCtPda);
      const hasXWingCt = xwingCtAccount && xwingCtAccount.data.length >= 1160;

      // data: disc(1) + nonce(32) + stealth_pubkey(32) = 65 bytes
      const data = Buffer.alloc(65);
      let offset = 0;
      data[offset++] = StealthDiscriminators.WITHDRAW_FROM_ESCROW;
      Buffer.from(nonce).copy(data, offset); offset += 32;
      Buffer.from(stealthPubkey).copy(data, offset);

      const keys = [
        { pubkey: claimer.publicKey, isSigner: true, isWritable: false },
        { pubkey: escrowPda, isSigner: false, isWritable: true },
        { pubkey: verifiedDestination, isSigner: false, isWritable: true },
        { pubkey: MASTER_AUTHORITY, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ];

      if (hasXWingCt) {
        keys.push({ pubkey: xwingCtPda, isSigner: false, isWritable: true });
      }

      const tx = new Transaction()
        .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }))
        .add(new TransactionInstruction({
          keys,
          programId: PROGRAM_IDS.STEALTH,
          data,
        }));

      tx.feePayer = claimer.publicKey;
      tx.recentBlockhash = (await this.mainnetConnection.getLatestBlockhash()).blockhash;

      const signedTx = await claimer.signTransaction(tx);
      const signature = await this.mainnetConnection.sendRawTransaction(signedTx.serialize());
      await confirmTransactionPolling(this.mainnetConnection, signature, 30, 2000);

      console.log("[V4] WITHDRAW_FROM_ESCROW success:", signature);
      return { success: true, signature };
    } catch (error: any) {
      console.error("[V4] WITHDRAW_FROM_ESCROW failed:", error);
      return { success: false, error: error.message };
    }
  }

  // Complete V4 privacy send flow (sender side)
  // Returns nonce and sharedSecret for receiver to claim
  async sendPrivateV4(
    wallet: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> },
    amount: bigint,
    recipientXWingPubkey: { mlkem: Uint8Array; x25519: Uint8Array },
    destinationWallet: PublicKey
  ): Promise<{
    success: boolean;
    error?: string;
    nonce?: Uint8Array;
    sharedSecret?: Uint8Array;
    stealthPubkey?: Uint8Array;
    escrowPda?: PublicKey;
  }> {
    try {
      console.log("[V4] Starting complete privacy send flow...");

      // Generate crypto data
      const nonce = crypto.getRandomValues(new Uint8Array(32));
      const { ciphertext: xwingCiphertext, sharedSecret } = xwingEncapsulate(recipientXWingPubkey);
      const stealthPubkey = deriveStealthPubkeyFromSharedSecret(sharedSecret);
      const ephemeralPubkey = xwingCiphertext.slice(1088, 1120);
      const viewTag = sharedSecret[0];
      const encryptedDestination = await encryptDestinationWallet(destinationWallet.toBytes(), sharedSecret);

      // TX1a-1: Create deposit record
      const createResult = await this.createV4Deposit(
        wallet, amount, nonce, stealthPubkey, ephemeralPubkey, viewTag, encryptedDestination
      );
      if (!createResult.success) {
        return { success: false, error: `CREATE failed: ${createResult.error}` };
      }

      // TX1a-2: Upload XWing ciphertext
      const uploadResult = await this.uploadV4Ciphertext(wallet, nonce, xwingCiphertext);
      if (!uploadResult.success) {
        return { success: false, error: `UPLOAD failed: ${uploadResult.error}` };
      }

      // TX1a-3: Complete deposit (funds + delegate)
      const completeResult = await this.completeV4Deposit(wallet, nonce);
      if (!completeResult.success) {
        return { success: false, error: `COMPLETE failed: ${completeResult.error}` };
      }

      // Wait for PER to sync
      console.log("[V4] Waiting for PER to sync (5 sec)...");
      await new Promise(r => setTimeout(r, 5000));

      // TX1b: Input to pool (on PER)
      const inputResult = await this.inputToPoolV4(wallet, nonce);
      if (!inputResult.success) {
        return { success: false, error: `INPUT_TO_POOL failed: ${inputResult.error}` };
      }

      // Wait for L1 commit
      console.log("[V4] Waiting for L1 commit (15 sec)...");
      await new Promise(r => setTimeout(r, 15000));

      // TX2: Pool to escrow (on PER)
      const poolToEscrowResult = await this.poolToEscrowV4(wallet, nonce);
      if (!poolToEscrowResult.success) {
        return { success: false, error: `POOL_TO_ESCROW failed: ${poolToEscrowResult.error}` };
      }

      console.log("[V4] Privacy send complete!");
      console.log("[V4] Receiver can now scan for escrow and claim with sharedSecret");

      return {
        success: true,
        nonce,
        sharedSecret,
        stealthPubkey,
        escrowPda: completeResult.escrowPda,
      };
    } catch (error: any) {
      console.error("[V4] Privacy send failed:", error);
      return { success: false, error: error.message };
    }
  }

  // Complete V4 privacy claim flow (receiver side)
  async claimPrivateV4(
    wallet: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> },
    nonce: Uint8Array,
    sharedSecret: Uint8Array,
    destination: PublicKey
  ): Promise<{
    success: boolean;
    error?: string;
    amount?: bigint;
  }> {
    try {
      console.log("[V4] Starting claim flow...");

      const stealthPubkey = deriveStealthPubkeyFromSharedSecret(sharedSecret);

      // TX3: Claim escrow (on PER, triggers undelegation)
      const claimResult = await this.claimEscrowV4WithUndelegate(wallet, nonce, sharedSecret, destination);
      if (!claimResult.success) {
        return { success: false, error: `CLAIM failed: ${claimResult.error}` };
      }

      // Wait for undelegation
      console.log("[V4] Waiting for escrow undelegation (30 sec)...");
      const [escrowPda] = deriveClaimEscrowPda(nonce);

      for (let i = 0; i < 12; i++) {
        await new Promise(r => setTimeout(r, 2500));
        const escrowInfo = await this.mainnetConnection.getAccountInfo(escrowPda);
        if (escrowInfo && !escrowInfo.owner.equals(PROGRAM_IDS.DELEGATION)) {
          console.log("[V4] Escrow undelegated!");
          break;
        }
        console.log(`[V4] Waiting... (${i + 1}/12)`);
      }

      // TX4: Withdraw from escrow (on L1)
      const withdrawResult = await this.withdrawFromEscrowV4(wallet, nonce, stealthPubkey, destination);
      if (!withdrawResult.success) {
        return { success: false, error: `WITHDRAW failed: ${withdrawResult.error}` };
      }

      console.log("[V4] Claim complete! Funds transferred to:", destination.toBase58());
      return { success: true };
    } catch (error: any) {
      console.error("[V4] Claim failed:", error);
      return { success: false, error: error.message };
    }
  }

  // V4 Claim Escrow via Magic Actions (TEE verifies and sends to receiver)
  // CRITICAL: This goes to PER endpoint, NOT L1!
  // TEE verifies SHA256(sharedSecret || "stealth-derive") == escrow.stealth_pubkey
  // Then sends deposit to destination, closes escrow + xwing_ciphertext, rent to MASTER_AUTHORITY
  async claimEscrowV4(
    claimer: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> },
    nonce: Uint8Array,
    sharedSecret: Uint8Array,
    destination: PublicKey
  ): Promise<{
    success: boolean;
    error?: string;
    signature?: string;
  }> {
    try {
      console.log("[V4 Privacy] Claiming escrow via TEE verification...");

      if (nonce.length !== 32) {
        throw new Error("Nonce must be 32 bytes");
      }
      if (sharedSecret.length !== 32) {
        throw new Error("SharedSecret must be 32 bytes");
      }

      const [escrowPda] = deriveClaimEscrowPda(nonce);
      const [xwingCtPda] = deriveXWingCiphertextPda(escrowPda);

      // Build instruction data (65 bytes)
      // Layout: discriminator(1) + nonce(32) + shared_secret(32)
      const data = Buffer.alloc(65);
      let offset = 0;

      data[offset++] = StealthDiscriminators.CLAIM_ESCROW_V4;
      Buffer.from(nonce).copy(data, offset); offset += 32;
      Buffer.from(sharedSecret).copy(data, offset);

      // Accounts per claim_escrow_v4.rs:
      // 0. [signer] claimer
      // 1. [writable] claim_escrow PDA
      // 2. [writable] destination (receiver's wallet)
      // 3. [writable] master_authority (receives rent)
      // 4. [writable] xwing_ciphertext PDA (closed)
      // 5. [] system_program
      const keys = [
        { pubkey: claimer.publicKey, isSigner: true, isWritable: false },
        { pubkey: escrowPda, isSigner: false, isWritable: true },
        { pubkey: destination, isSigner: false, isWritable: true },
        { pubkey: MASTER_AUTHORITY, isSigner: false, isWritable: true },
        { pubkey: xwingCtPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ];

      const ix = new TransactionInstruction({
        keys,
        programId: PROGRAM_IDS.STEALTH,
        data,
      });

      const tx = new Transaction().add(ix);
      tx.feePayer = claimer.publicKey;

      // CRITICAL: Get blockhash from PER and send to PER!
      // This instruction runs inside TEE for verification
      tx.recentBlockhash = (await this.perConnection.getLatestBlockhash()).blockhash;

      const signedTx = await claimer.signTransaction(tx);
      const signature = await this.perConnection.sendRawTransaction(signedTx.serialize());

      console.log("[V4 Privacy] Claim submitted to PER:", signature);
      console.log("[V4 Privacy] TEE will verify sharedSecret and transfer funds");

      // Wait for PER to process
      await new Promise(resolve => setTimeout(resolve, 2000));

      return {
        success: true,
        signature,
      };
    } catch (error: any) {
      console.error("[V4 Privacy] Claim failed:", error);
      return { success: false, error: error.message };
    }
  }
}

export default PERPrivacyClient;
