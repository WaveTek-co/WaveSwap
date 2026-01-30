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
} from "@solana/web3.js";
import { sha3_256 } from "js-sha3";
import { ed25519 } from "@noble/curves/ed25519";
import {
  PROGRAM_IDS,
  StealthDiscriminators,
  deriveStealthVaultPda,
  deriveAnnouncementPdaFromNonce,
  deriveTestMixerPoolPda,
  deriveDepositRecordPda,
  deriveRelayerAuthPda,
} from "./config";
import {
  StealthKeyPair,
  deriveStealthAddress,
  stealthSign,
} from "./crypto";

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
      await this.mainnetConnection.confirmTransaction(signature, "confirmed");

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
      await this.mainnetConnection.confirmTransaction(signature, "confirmed");

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
      await this.mainnetConnection.confirmTransaction(signature, "confirmed");

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
}

export default PERPrivacyClient;
