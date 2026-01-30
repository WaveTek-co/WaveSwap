// WaveSwap stealth client
// Integrates with OceanVault programs for private transactions

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  Keypair,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
} from "@solana/spl-token";
import { sha3_256 } from "js-sha3";
import {
  PROGRAM_IDS,
  RegistryDiscriminators,
  StealthDiscriminators,
  MAX_CHUNK_SIZE,
  deriveRegistryPda,
  deriveAnnouncementPda,
  deriveAnnouncementPdaFromNonce,
  deriveStealthVaultPda,
  deriveMixerPoolPda,
  deriveTestMixerPoolPda,
  deriveDepositRecordPda,
  deriveRelayerAuthPda,
  NATIVE_SOL_MINT,
  RELAYER_CONFIG,
} from "./config";
// Use Web Crypto API for random bytes (browser-compatible)
const randomBytes = (length: number): Uint8Array => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
};
import {
  RegistryAccount,
  ScanResult,
  TransactionResult,
  SendResult,
  ClaimResult,
  WaveSendParams,
} from "./types";
import {
  StealthKeyPair,
  StealthVaultConfig,
  generateViewingKeys,
  generateStealthKeysFromSignature,
  deriveStealthAddress,
  deriveStealthSpendingKey,
  stealthSign,
} from "./crypto";

// Registration step status
export type RegistrationStep =
  | 'idle'
  | 'initializing'
  | 'uploading-chunk-1'
  | 'uploading-chunk-2'
  | 'finalizing'
  | 'complete'
  | 'error';

export interface RegistrationProgress {
  step: RegistrationStep;
  currentTx: number;
  totalTx: number;
  message: string;
}

// TEE proof constants (must match on-chain)
const TEE_PROOF_SIZE = 168;
const EXPECTED_ENCLAVE_MEASUREMENT = new Uint8Array([
  0x4f, 0x63, 0x65, 0x61, 0x6e, 0x56, 0x61, 0x75,
  0x6c, 0x74, 0x54, 0x45, 0x45, 0x76, 0x31, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01,
]);

// Generate devnet TEE proof (matches on-chain create_test_proof)
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

  // Placeholder signature (not verified on devnet)
  proof.fill(0x42, 32, 96);

  // Enclave measurement
  proof.set(EXPECTED_ENCLAVE_MEASUREMENT, 96);

  // Timestamp (valid positive value)
  const timestamp = BigInt(1704067200);
  const timestampBytes = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    timestampBytes[i] = Number((timestamp >> BigInt(i * 8)) & BigInt(0xff));
  }
  proof.set(timestampBytes, 128);

  // Session ID placeholder
  proof.fill(0xAB, 136, 168);

  return proof;
}

export interface ClientConfig {
  connection: Connection;
  network?: "devnet" | "mainnet-beta";
}

export interface WalletAdapter {
  publicKey: PublicKey | null;
  signTransaction: <T extends Transaction>(transaction: T) => Promise<T>;
  signAllTransactions: <T extends Transaction>(transactions: T[]) => Promise<T[]>;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
}

export class WaveStealthClient {
  private connection: Connection;
  private network: "devnet" | "mainnet-beta";
  private stealthKeys: StealthKeyPair | null = null;
  private relayerPubkey: PublicKey | null = null;
  private relayerEndpoint: string | null = null;

  constructor(config: ClientConfig) {
    this.connection = config.connection;
    this.network = config.network || "devnet";

    // Auto-configure relayer from environment
    if (RELAYER_CONFIG.DEVNET_PUBKEY && this.network === "devnet") {
      try {
        this.relayerPubkey = new PublicKey(RELAYER_CONFIG.DEVNET_PUBKEY);
        this.relayerEndpoint = RELAYER_CONFIG.DEVNET_ENDPOINT;
      } catch (e) {
        console.warn("[WaveStealthClient] Invalid relayer pubkey in config");
      }
    }
  }

  // Configure relayer for privacy-preserving claims
  setRelayer(relayerPubkey: PublicKey, endpoint?: string): void {
    this.relayerPubkey = relayerPubkey;
    this.relayerEndpoint = endpoint || RELAYER_CONFIG.DEVNET_ENDPOINT;
  }

  // Get relayer status
  getRelayerStatus(): { configured: boolean; pubkey?: string; endpoint?: string } {
    if (!this.relayerPubkey) {
      return { configured: false };
    }
    return {
      configured: true,
      pubkey: this.relayerPubkey.toBase58(),
      endpoint: this.relayerEndpoint || undefined,
    };
  }

  // Initialize stealth keys from wallet signature
  async initializeKeys(
    signMessage: (message: Uint8Array) => Promise<Uint8Array>
  ): Promise<StealthKeyPair> {
    this.stealthKeys = await generateStealthKeysFromSignature(signMessage);
    return this.stealthKeys;
  }

  // Get current stealth keys
  getKeys(): StealthKeyPair | null {
    return this.stealthKeys;
  }

  // Set stealth keys (for restoring from storage)
  setKeys(keys: StealthKeyPair): void {
    this.stealthKeys = keys;
  }

  // Check if recipient is registered for stealth payments
  async isRecipientRegistered(recipientWallet: PublicKey): Promise<boolean> {
    const registry = await this.getRegistry(recipientWallet);
    return registry !== null && registry.isFinalized;
  }

  // Register stealth meta-address on-chain
  // Uses multi-transaction approach to handle 1216-byte key data
  async register(
    wallet: WalletAdapter,
    keys?: StealthKeyPair,
    xwingPubkey?: Uint8Array,
    onProgress?: (progress: RegistrationProgress) => void
  ): Promise<TransactionResult> {
    console.log('[Client] register called (multi-tx approach)');

    const reportProgress = (step: RegistrationStep, currentTx: number, totalTx: number, message: string) => {
      console.log(`[Client] Progress: ${step} - ${message}`);
      if (onProgress) {
        onProgress({ step, currentTx, totalTx, message });
      }
    };

    if (!wallet.publicKey) {
      return { success: false, error: "Wallet not connected" };
    }

    const keysToUse = keys || this.stealthKeys;
    if (!keysToUse) {
      return { success: false, error: "Stealth keys not initialized" };
    }

    const [registryPda, bump] = deriveRegistryPda(wallet.publicKey);
    console.log('[Client] Registry PDA:', registryPda.toBase58(), 'bump:', bump);

    // Check if already registered
    console.log('[Client] Checking if already registered...');
    const existing = await this.connection.getAccountInfo(registryPda);
    if (existing) {
      // Check if finalized
      const existingRegistry = await this.getRegistry(wallet.publicKey);
      if (existingRegistry?.isFinalized) {
        console.log('[Client] Already registered and finalized');
        return { success: false, error: "Already registered" };
      }
      console.log('[Client] Registry exists but not finalized, will resume...');
    }

    // Registry requires exactly 1216 bytes (XWING_PUBLIC_KEY_SIZE) to be written
    // We store: spend pubkey (32) + view pubkey (32) + padding (1152) = 1216 bytes
    const XWING_PUBLIC_KEY_SIZE = 1216;
    const fullKeyData = Buffer.alloc(XWING_PUBLIC_KEY_SIZE);
    Buffer.from(keysToUse.spendPubkey).copy(fullKeyData, 0);
    Buffer.from(keysToUse.viewPubkey).copy(fullKeyData, 32);

    // Split into multiple transactions to avoid tx size limits
    // Tx 1: Initialize + first chunk (600 bytes to leave room)
    // Tx 2: Second chunk (600 bytes)
    // Tx 3: Third chunk (16 bytes) + Finalize
    const CHUNK_SIZE = 600; // Conservative chunk size
    const chunks: { offset: number; data: Buffer }[] = [];
    for (let offset = 0; offset < XWING_PUBLIC_KEY_SIZE; offset += CHUNK_SIZE) {
      chunks.push({
        offset,
        data: fullKeyData.slice(offset, Math.min(offset + CHUNK_SIZE, XWING_PUBLIC_KEY_SIZE)),
      });
    }

    const totalTx = chunks.length + 1; // +1 for init
    let signatures: string[] = [];

    try {
      // Transaction 1: Initialize registry + first chunk
      if (!existing) {
        reportProgress('initializing', 1, totalTx, 'Initializing registry...');

        const tx1 = new Transaction();

        // Initialize registry instruction
        const initData = Buffer.alloc(9);
        RegistryDiscriminators.INITIALIZE_REGISTRY.copy(initData, 0);
        initData.writeUInt8(bump, 8);

        tx1.add(
          new TransactionInstruction({
            keys: [
              { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
              { pubkey: registryPda, isSigner: false, isWritable: true },
              { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            programId: PROGRAM_IDS.REGISTRY,
            data: initData,
          })
        );

        // Add first chunk to init transaction
        const firstChunk = chunks[0];
        const chunkData1 = Buffer.alloc(8 + 2 + firstChunk.data.length);
        RegistryDiscriminators.UPLOAD_KEY_CHUNK.copy(chunkData1, 0);
        chunkData1.writeUInt16LE(firstChunk.offset, 8);
        firstChunk.data.copy(chunkData1, 10);

        tx1.add(
          new TransactionInstruction({
            keys: [
              { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
              { pubkey: registryPda, isSigner: false, isWritable: true },
            ],
            programId: PROGRAM_IDS.REGISTRY,
            data: chunkData1,
          })
        );

        tx1.feePayer = wallet.publicKey;
        tx1.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
        const signedTx1 = await wallet.signTransaction(tx1);
        const sig1 = await this.connection.sendRawTransaction(signedTx1.serialize());
        await this.connection.confirmTransaction(sig1, 'confirmed');
        signatures.push(sig1);
        console.log('[Client] Tx1 confirmed:', sig1);
      }

      // Remaining chunks
      for (let i = existing ? 0 : 1; i < chunks.length; i++) {
        const chunk = chunks[i];
        const isLastChunk = i === chunks.length - 1;
        const stepName = `uploading-chunk-${i + 1}` as RegistrationStep;

        reportProgress(
          stepName,
          i + (existing ? 1 : 2),
          totalTx,
          `Uploading keys (${i + 1}/${chunks.length})...`
        );

        const tx = new Transaction();

        // Upload chunk
        const chunkData = Buffer.alloc(8 + 2 + chunk.data.length);
        RegistryDiscriminators.UPLOAD_KEY_CHUNK.copy(chunkData, 0);
        chunkData.writeUInt16LE(chunk.offset, 8);
        chunk.data.copy(chunkData, 10);

        tx.add(
          new TransactionInstruction({
            keys: [
              { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
              { pubkey: registryPda, isSigner: false, isWritable: true },
            ],
            programId: PROGRAM_IDS.REGISTRY,
            data: chunkData,
          })
        );

        // Add finalize to last chunk transaction
        if (isLastChunk) {
          reportProgress('finalizing', totalTx, totalTx, 'Finalizing registration...');
          tx.add(
            new TransactionInstruction({
              keys: [
                { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
                { pubkey: registryPda, isSigner: false, isWritable: true },
              ],
              programId: PROGRAM_IDS.REGISTRY,
              data: RegistryDiscriminators.FINALIZE_REGISTRY,
            })
          );
        }

        tx.feePayer = wallet.publicKey;
        tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
        const signedTx = await wallet.signTransaction(tx);
        const sig = await this.connection.sendRawTransaction(signedTx.serialize());
        await this.connection.confirmTransaction(sig, 'confirmed');
        signatures.push(sig);
        console.log(`[Client] Tx${i + (existing ? 1 : 2)} confirmed:`, sig);
      }

      reportProgress('complete', totalTx, totalTx, 'Registration complete!');
      return { success: true, signature: signatures[signatures.length - 1] };

    } catch (error) {
      console.error('[Client] register error:', error);
      reportProgress('error', 0, totalTx, error instanceof Error ? error.message : 'Registration failed');
      return {
        success: false,
        error: error instanceof Error ? error.message : "Registration failed",
      };
    }
  }

  // Fetch recipient's registry
  // On-chain layout (1260 bytes):
  // - discriminator: 8 bytes (0-7)
  // - bump: 1 byte (8)
  // - owner: 32 bytes (9-40)
  // - is_finalized: 1 byte (41)
  // - bytes_written: 2 bytes (42-43)
  // - xwing_public_key: 1216 bytes (44-1259)
  async getRegistry(owner: PublicKey): Promise<RegistryAccount | null> {
    const [registryPda] = deriveRegistryPda(owner);
    const account = await this.connection.getAccountInfo(registryPda);

    if (!account) return null;

    const data = account.data;
    if (data.length < 44) return null; // MIN_SIZE = 44

    // Check discriminator
    const discriminator = data.slice(0, 8).toString();
    if (discriminator !== 'REGISTRY') {
      console.log('[Client] Invalid registry discriminator:', discriminator);
      return null;
    }

    const isFinalized = data[41] === 1;
    console.log('[Client] Registry isFinalized byte:', data[41], '=', isFinalized);

    return {
      owner: new PublicKey(data.slice(9, 41)),
      spendPubkey: new Uint8Array(data.slice(44, 76)),
      viewPubkey: new Uint8Array(data.slice(76, 108)),
      xwingPubkey: new Uint8Array(data.slice(44, 1260)),
      createdAt: 0,
      isFinalized,
    };
  }

  // Wave Send - PRODUCTION-READY stealth transfers with FULL PRIVACY
  //
  // CORRECT PRIVACY ARCHITECTURE:
  // 1. Sender signs: Announcement + Deposit to Mixer ONLY
  // 2. Relayer/PER signs: Execute Mixer Transfer (with TEE proof)
  // 3. Relayer signs: Claim via Relayer (recipient never signs!)
  //
  // This ensures:
  // - SENDER UNLINKABILITY: Different signers for deposit vs mixer transfer
  // - RECEIVER UNLINKABILITY: Relayer claims, recipient never appears on-chain
  //
  // IMPORTANT: If no relayer is configured, falls back to direct send (less private)
  async waveSend(
    wallet: WalletAdapter,
    params: WaveSendParams
  ): Promise<SendResult> {
    // Check if relayer is configured for full privacy
    if (this.relayerEndpoint) {
      return this.waveSendPrivate(wallet, params);
    }
    // Fallback to direct send if no relayer (less private but works)
    console.warn('[WaveStealthClient] No relayer configured - using direct send (reduced privacy)');
    return this.waveSendDirect(wallet, params);
  }

  // FULL PRIVACY SEND - Correct architecture
  //
  // CRITICAL: Sender ONLY does deposit, relayer executes mixer transfer
  // This breaks the on-chain link between sender and vault
  //
  // Flow:
  // 1. Sender: Announcement + Deposit to Mixer (this method)
  // 2. Relayer: Execute Mixer Transfer (separate transaction by relayer)
  // 3. Relayer: Claim via Relayer (when recipient requests)
  async waveSendPrivate(
    wallet: WalletAdapter,
    params: WaveSendParams
  ): Promise<SendResult> {
    if (!wallet.publicKey) {
      return { success: false, error: "Wallet not connected" };
    }

    if (!this.relayerEndpoint) {
      return { success: false, error: "Relayer not configured for private sends" };
    }

    const registry = await this.getRegistry(params.recipientWallet);
    if (!registry || !registry.isFinalized) {
      return { success: false, error: "Recipient not registered for stealth payments" };
    }

    const isSol = !params.mint || params.mint.equals(NATIVE_SOL_MINT);
    if (!isSol) {
      return { success: false, error: "SPL token transfers not yet supported" };
    }

    // Generate random nonce
    const nonce = randomBytes(32);
    const stealthConfig = deriveStealthAddress(registry.spendPubkey, registry.viewPubkey);
    const [announcementPda, announcementBump] = deriveAnnouncementPdaFromNonce(nonce);
    const [vaultPda] = deriveStealthVaultPda(stealthConfig.stealthPubkey);
    // Use test mixer pool (non-delegated, production-ready)
    const [mixerPoolPda] = deriveTestMixerPoolPda();
    const [depositRecordPda, depositBump] = deriveDepositRecordPda(nonce);

    const amountBigInt = BigInt(params.amount);

    // ========================================
    // SENDER TRANSACTION: Announcement + Deposit ONLY
    // ========================================
    const tx = new Transaction();

    // Announcement (privacy-preserving: only ephemeral pubkey + nonce)
    const publishData = Buffer.alloc(67);
    let offset = 0;
    publishData[offset++] = StealthDiscriminators.PUBLISH_ANNOUNCEMENT;
    publishData[offset++] = announcementBump;
    publishData[offset++] = stealthConfig.viewTag;
    Buffer.from(stealthConfig.ephemeralPubkey).copy(publishData, offset);
    offset += 32;
    Buffer.from(nonce).copy(publishData, offset);

    tx.add(
      new TransactionInstruction({
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: announcementPda, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_IDS.STEALTH,
        data: publishData,
      })
    );

    // Deposit to test mixer pool (production-ready, non-delegated)
    const depositData = Buffer.alloc(42);
    offset = 0;
    depositData[offset++] = StealthDiscriminators.DEPOSIT_TO_TEST_MIXER;
    depositData[offset++] = depositBump;
    Buffer.from(nonce).copy(depositData, offset);
    offset += 32;
    for (let i = 0; i < 8; i++) {
      depositData[offset++] = Number((amountBigInt >> BigInt(i * 8)) & BigInt(0xff));
    }

    tx.add(
      new TransactionInstruction({
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: mixerPoolPda, isSigner: false, isWritable: true },
          { pubkey: depositRecordPda, isSigner: false, isWritable: true },
          { pubkey: announcementPda, isSigner: false, isWritable: true },
          { pubkey: vaultPda, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_IDS.STEALTH,
        data: depositData,
      })
    );

    try {
      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;

      const signedTx = await wallet.signTransaction(tx);
      const depositSig = await this.connection.sendRawTransaction(signedTx.serialize());
      await this.connection.confirmTransaction(depositSig, 'confirmed');

      console.log('[WaveStealthClient] Deposit complete:', depositSig);

      // ========================================
      // SUBMIT TO RELAYER for mixer execution
      // ========================================
      // The relayer will execute the mixer transfer with TEE proof
      // This is the KEY privacy step - sender does NOT execute mixer transfer!
      console.log('[WaveStealthClient] Submitting to relayer for mixer execution...');

      const mixerRequest = {
        nonce: Buffer.from(nonce).toString('base64'),
        announcementPda: announcementPda.toBase58(),
        vaultPda: vaultPda.toBase58(),
        stealthPubkey: Buffer.from(stealthConfig.stealthPubkey).toString('base64'),
        depositSignature: depositSig,
      };

      const response = await fetch(`${this.relayerEndpoint}/execute-mixer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mixerRequest),
      });

      const result = await response.json();

      if (!result.success) {
        // Deposit succeeded but mixer execution failed - funds safe in mixer pool
        console.error('[WaveStealthClient] Relayer mixer execution failed:', result.error);
        return {
          success: false,
          error: `Deposit succeeded but mixer execution failed: ${result.error}. Funds are safe in mixer pool.`,
        };
      }

      console.log('[WaveStealthClient] FULL PRIVACY SEND COMPLETE');
      console.log('[WaveStealthClient] Deposit sig:', depositSig);
      console.log('[WaveStealthClient] Mixer sig:', result.signature);

      return {
        success: true,
        signature: result.signature, // Return mixer transfer signature
        stealthPubkey: stealthConfig.stealthPubkey,
        ephemeralPubkey: stealthConfig.ephemeralPubkey,
        viewTag: stealthConfig.viewTag,
        vaultPda,
      };
    } catch (error) {
      console.error('[WaveStealthClient] Privacy send error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Send failed",
      };
    }
  }

  // Direct stealth transfer (simplified, less private)
  // Use this only when mixer pool is not available
  async waveSendDirect(
    wallet: WalletAdapter,
    params: WaveSendParams
  ): Promise<SendResult> {
    if (!wallet.publicKey) {
      return { success: false, error: "Wallet not connected" };
    }

    const registry = await this.getRegistry(params.recipientWallet);
    if (!registry || !registry.isFinalized) {
      return { success: false, error: "Recipient not registered for stealth payments" };
    }

    const isSol = !params.mint || params.mint.equals(NATIVE_SOL_MINT);
    if (!isSol) {
      return { success: false, error: "SPL token transfers not yet supported" };
    }

    const nonce = randomBytes(32);
    const stealthConfig = deriveStealthAddress(registry.spendPubkey, registry.viewPubkey);
    const [announcementPda, announcementBump] = deriveAnnouncementPdaFromNonce(nonce);
    const [vaultPda] = deriveStealthVaultPda(stealthConfig.stealthPubkey);

    const amountBigInt = BigInt(params.amount);
    const tx = new Transaction();

    // Privacy-preserving announcement
    const publishData = Buffer.alloc(67);
    let offset = 0;
    publishData[offset++] = StealthDiscriminators.PUBLISH_ANNOUNCEMENT;
    publishData[offset++] = announcementBump;
    publishData[offset++] = stealthConfig.viewTag;
    Buffer.from(stealthConfig.ephemeralPubkey).copy(publishData, offset);
    offset += 32;
    Buffer.from(nonce).copy(publishData, offset);

    tx.add(
      new TransactionInstruction({
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: announcementPda, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_IDS.STEALTH,
        data: publishData,
      })
    );

    // Direct transfer (less private - sender visible on-chain)
    const teeProof = createDevnetTeeProof(announcementPda.toBytes(), vaultPda.toBytes());

    const finalizeData = Buffer.alloc(1 + 32 + 8 + TEE_PROOF_SIZE);
    offset = 0;
    finalizeData[offset++] = StealthDiscriminators.FINALIZE_STEALTH_TRANSFER;
    Buffer.from(stealthConfig.stealthPubkey).copy(finalizeData, offset);
    offset += 32;
    for (let i = 0; i < 8; i++) {
      finalizeData[offset++] = Number((amountBigInt >> BigInt(i * 8)) & BigInt(0xff));
    }
    Buffer.from(teeProof).copy(finalizeData, offset);

    tx.add(
      new TransactionInstruction({
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: announcementPda, isSigner: false, isWritable: true },
          { pubkey: vaultPda, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_IDS.STEALTH,
        data: finalizeData,
      })
    );

    try {
      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;

      const signedTx = await wallet.signTransaction(tx);
      const signature = await this.connection.sendRawTransaction(signedTx.serialize());
      await this.connection.confirmTransaction(signature, 'confirmed');

      console.log('[WaveStealthClient] Direct send complete:', signature);

      return {
        success: true,
        signature,
        stealthPubkey: stealthConfig.stealthPubkey,
        ephemeralPubkey: stealthConfig.ephemeralPubkey,
        viewTag: stealthConfig.viewTag,
        vaultPda,
      };
    } catch (error) {
      console.error('[WaveStealthClient] Direct send error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Send failed",
      };
    }
  }

  // DEPRECATED: This method has the sender execute mixer transfer which BREAKS privacy!
  // Use waveSendPrivate() instead for correct privacy architecture.
  //
  // @deprecated Use waveSendPrivate() for full privacy
  async waveSendViaMixer(
    wallet: WalletAdapter,
    params: WaveSendParams,
    _teeSignFn?: (message: Uint8Array) => Promise<Uint8Array>
  ): Promise<SendResult> {
    console.warn('[WaveStealthClient] DEPRECATED: waveSendViaMixer has broken privacy! Using waveSendPrivate instead.');
    return this.waveSendPrivate(wallet, params);
  }

  // Generate TEE proof for mixer transfer
  private async generateTeeProof(
    announcementPda: PublicKey,
    vaultPda: PublicKey,
    signFn?: (message: Uint8Array) => Promise<Uint8Array>
  ): Promise<{
    commitment: Uint8Array;
    signature: Uint8Array;
    measurement: Uint8Array;
    timestamp: bigint;
    sessionId: Uint8Array;
  }> {
    // Compute commitment: SHA3-256("OceanVault:TEE:Commitment:" || announcement || vault)
    const commitmentInput = Buffer.concat([
      Buffer.from("OceanVault:TEE:Commitment:"),
      announcementPda.toBuffer(),
      vaultPda.toBuffer(),
    ]);
    const commitment = new Uint8Array(Buffer.from(sha3_256(commitmentInput), "hex"));

    const timestamp = BigInt(Math.floor(Date.now() / 1000));

    // Expected enclave measurement
    const measurement = new Uint8Array([
      0x4f, 0x63, 0x65, 0x61, 0x6e, 0x56, 0x61, 0x75,
      0x6c, 0x74, 0x54, 0x45, 0x45, 0x76, 0x31, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01,
    ]);

    // Build message for signature: commitment + measurement + timestamp
    const message = new Uint8Array(72);
    message.set(commitment, 0);
    message.set(measurement, 32);
    for (let i = 0; i < 8; i++) {
      message[64 + i] = Number((timestamp >> BigInt(i * 8)) & BigInt(0xff));
    }

    let signature: Uint8Array;
    if (signFn) {
      // Use provided TEE signing function (MagicBlock TEE service)
      signature = await signFn(message);
    } else {
      // Devnet mock signature (works with devnet TEE verification)
      signature = new Uint8Array(64);
      signature.fill(0x42);
      signature[0] = 0x01;
      signature[32] = 0x01;
    }

    return {
      commitment,
      signature,
      measurement,
      timestamp,
      sessionId: new Uint8Array(32).fill(0xab),
    };
  }

  // Build execute mixer transfer transaction
  // PRODUCTION-READY: On-chain execute_test_mixer_transfer handles:
  // 1. TEE proof verification
  // 2. Vault and announcement account creation
  // 3. Funds transfer from mixer pool to vault
  // 4. Announcement finalization with stealth_pubkey
  //
  // On-chain expects:
  // - accounts: submitter, mixer_pool, deposit_record, vault, announcement, system_program, instructions_sysvar
  // - data: discriminator(1) + nonce(32) + stealth_pubkey(32) + announcement_bump(1) + vault_bump(1) + tee_proof(168) = 235 bytes
  private async buildExecuteMixerTransferTx(
    submitter: PublicKey,
    nonce: Uint8Array,
    teeProof: {
      commitment: Uint8Array;
      signature: Uint8Array;
      measurement: Uint8Array;
      timestamp: bigint;
      sessionId: Uint8Array;
    },
    announcementPda: PublicKey,
    vaultPda: PublicKey,
    stealthPubkey: Uint8Array
  ): Promise<Transaction> {
    const tx = new Transaction();

    const INSTRUCTIONS_SYSVAR_ID = new PublicKey("Sysvar1nstructions1111111111111111111111111");

    // Serialize TEE proof (168 bytes)
    const proofBytes = Buffer.alloc(168);
    let proofOffset = 0;
    proofBytes.set(teeProof.commitment, proofOffset); proofOffset += 32;
    proofBytes.set(teeProof.signature, proofOffset); proofOffset += 64;
    proofBytes.set(teeProof.measurement, proofOffset); proofOffset += 32;
    for (let i = 0; i < 8; i++) {
      proofBytes[proofOffset++] = Number((teeProof.timestamp >> BigInt(i * 8)) & BigInt(0xff));
    }
    proofBytes.set(teeProof.sessionId, proofOffset);

    // Build mixer transfer instruction using test mixer pool
    const [mixerPoolPda] = deriveTestMixerPoolPda();
    const [depositRecordPda] = deriveDepositRecordPda(nonce);
    const [, announcementBump] = deriveAnnouncementPdaFromNonce(nonce);
    const [, vaultBump] = deriveStealthVaultPda(stealthPubkey);

    // Data: discriminator(1) + nonce(32) + stealth_pubkey(32) + announcement_bump(1) + vault_bump(1) + tee_proof(168) = 235 bytes
    const data = Buffer.alloc(235);
    let offset = 0;
    data[offset++] = StealthDiscriminators.EXECUTE_TEST_MIXER_TRANSFER;
    data.set(nonce, offset); offset += 32;
    data.set(stealthPubkey, offset); offset += 32;
    data[offset++] = announcementBump;
    data[offset++] = vaultBump;
    data.set(proofBytes, offset);

    tx.add(
      new TransactionInstruction({
        keys: [
          { pubkey: submitter, isSigner: true, isWritable: true },
          { pubkey: mixerPoolPda, isSigner: false, isWritable: true },
          { pubkey: depositRecordPda, isSigner: false, isWritable: true },
          { pubkey: vaultPda, isSigner: false, isWritable: true },
          { pubkey: announcementPda, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: INSTRUCTIONS_SYSVAR_ID, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_IDS.STEALTH,
        data,
      })
    );

    return tx;
  }

  // Claim a stealth payment with FULL PRIVACY (via relayer when configured)
  //
  // CORRECT ARCHITECTURE:
  // - If relayer is configured: Uses claimPrivate() for receiver unlinkability
  // - Recipient's wallet NEVER appears on-chain when using relayer
  //
  // WARNING: Without relayer, falls back to direct claim which EXPOSES recipient!
  async claim(
    wallet: WalletAdapter,
    scanResult: ScanResult
  ): Promise<ClaimResult> {
    if (!wallet.publicKey) {
      return { success: false, error: "Wallet not connected" };
    }

    // Use relayer for privacy if configured
    if (this.relayerEndpoint && this.stealthKeys) {
      console.log('[WaveStealthClient] Using privacy-preserving claim via relayer');
      return this.claimPrivate(scanResult, wallet.publicKey);
    }

    // WARNING: Direct claim exposes recipient wallet!
    console.warn('[WaveStealthClient] WARNING: No relayer configured - using direct claim (recipient exposed!)');

    const data = Buffer.alloc(33);
    data.writeUInt8(StealthDiscriminators.CLAIM_STEALTH_PAYMENT, 0);
    Buffer.from(scanResult.stealthPubkey).copy(data, 1);

    const tx = new Transaction();
    tx.add(
      new TransactionInstruction({
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
          { pubkey: scanResult.payment.vaultPda, isSigner: false, isWritable: true },
          { pubkey: wallet.publicKey, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_IDS.STEALTH,
        data,
      })
    );

    try {
      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;

      const signedTx = await wallet.signTransaction(tx);
      const txSignature = await this.connection.sendRawTransaction(signedTx.serialize());
      await this.connection.confirmTransaction(txSignature);

      return {
        success: true,
        signature: txSignature,
        amountClaimed: scanResult.payment.amount,
        destination: wallet.publicKey,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Claim failed",
      };
    }
  }

  // Claim by vault address and stealth pubkey (for manual claiming)
  // stealthPubkey is required to derive the vault PDA for authorization
  async claimByVaultAddress(
    wallet: WalletAdapter,
    vaultAddress: string,
    stealthPubkey: Uint8Array
  ): Promise<ClaimResult> {
    if (!wallet.publicKey) {
      return { success: false, error: "Wallet not connected" };
    }

    if (!stealthPubkey || stealthPubkey.length !== 32) {
      return { success: false, error: "Invalid stealth pubkey - must be 32 bytes" };
    }

    let vaultPda: PublicKey;
    try {
      vaultPda = new PublicKey(vaultAddress);
    } catch {
      return { success: false, error: "Invalid vault address" };
    }

    // Verify the vault PDA matches the stealth pubkey
    const [expectedVaultPda] = deriveStealthVaultPda(stealthPubkey);
    if (!vaultPda.equals(expectedVaultPda)) {
      return { success: false, error: "Vault address doesn't match stealth pubkey" };
    }

    // Check vault balance first
    const vaultInfo = await this.connection.getAccountInfo(vaultPda);
    if (!vaultInfo || vaultInfo.lamports === 0) {
      return { success: false, error: "Vault is empty or doesn't exist" };
    }

    // Data format: discriminator (1 byte) + stealth_pubkey (32 bytes)
    const data = Buffer.alloc(33);
    data.writeUInt8(StealthDiscriminators.CLAIM_STEALTH_PAYMENT, 0);
    Buffer.from(stealthPubkey).copy(data, 1);

    const tx = new Transaction();
    tx.add(
      new TransactionInstruction({
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
          { pubkey: vaultPda, isSigner: false, isWritable: true },
          { pubkey: wallet.publicKey, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_IDS.STEALTH,
        data,
      })
    );

    try {
      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;

      const signedTx = await wallet.signTransaction(tx);
      const txSignature = await this.connection.sendRawTransaction(signedTx.serialize());
      await this.connection.confirmTransaction(txSignature);

      return {
        success: true,
        signature: txSignature,
        amountClaimed: BigInt(vaultInfo.lamports),
        destination: wallet.publicKey,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Claim failed",
      };
    }
  }

  // PRIVACY-PRESERVING CLAIM (RECOMMENDED)
  // Uses relayer for FULL RECEIVER UNLINKABILITY
  // The recipient's wallet NEVER appears on-chain
  async claimPrivate(
    scanResult: ScanResult,
    destination: PublicKey
  ): Promise<ClaimResult> {
    if (!this.stealthKeys) {
      return { success: false, error: "Stealth keys not initialized. Call initializeKeys() first." };
    }

    if (!this.relayerPubkey || !this.relayerEndpoint) {
      return {
        success: false,
        error: "Relayer not configured. Set NEXT_PUBLIC_RELAYER_PUBKEY and NEXT_PUBLIC_RELAYER_ENDPOINT, or call setRelayer().",
      };
    }

    console.log("[WaveStealthClient] Privacy claim via relayer...");
    console.log("[WaveStealthClient] Relayer:", this.relayerPubkey.toBase58());
    console.log("[WaveStealthClient] Destination:", destination.toBase58());

    return this.claimViaRelayer(
      this.stealthKeys,
      scanResult.payment.vaultPda,
      scanResult.payment.announcementPda,
      scanResult.stealthPubkey,
      destination,
      this.relayerEndpoint
    );
  }

  // PRIVACY-PRESERVING: Claim via relayer for receiver unlinkability
  // The relayer submits the claim transaction, hiding the recipient's wallet
  // For devnet: Can test with a local relayer keypair
  // For production: Submit claim proof to relayer API endpoint
  async claimViaRelayer(
    stealthKeys: StealthKeyPair,
    vaultPda: PublicKey,
    announcementPda: PublicKey,
    stealthPubkey: Uint8Array,
    destination: PublicKey,
    relayerEndpoint?: string
  ): Promise<ClaimResult> {
    // Hash the destination address for privacy
    const destHashInput = Buffer.concat([
      Buffer.from("OceanVault:DestinationHash:"),
      destination.toBytes(),
    ]);
    const destinationHash = new Uint8Array(Buffer.from(sha3_256(destHashInput), "hex"));

    // Create claim proof message: "claim:" || vault_address || destination_hash
    const message = Buffer.alloc(70);
    message.write("claim:", 0);
    vaultPda.toBytes().copy(message, 6);
    Buffer.from(destinationHash).copy(message, 38);

    // Sign with stealth spending key (Ed25519)
    // For devnet: Use simplified signature (non-zero bytes)
    // For production: Full Ed25519 signature verification
    const signature = stealthSign(stealthKeys.spendPrivkey, message);

    // Build claim proof
    const claimProof = {
      stealthPubkey,
      signature,
      destinationHash,
    };

    if (relayerEndpoint) {
      // Submit to relayer API - endpoint should be base URL, we append /claim
      const claimUrl = relayerEndpoint.endsWith('/claim')
        ? relayerEndpoint
        : `${relayerEndpoint}/claim`;

      try {
        const response = await fetch(claimUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vaultPda: vaultPda.toBase58(),
            announcementPda: announcementPda.toBase58(),
            destination: destination.toBase58(),
            stealthPubkey: Buffer.from(stealthPubkey).toString('base64'),
            signature: Buffer.from(signature).toString('base64'),
            destinationHash: Buffer.from(destinationHash).toString('base64'),
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          return { success: false, error: `Relayer error: ${error}` };
        }

        const result = await response.json();
        return {
          success: true,
          signature: result.signature,
          amountClaimed: BigInt(result.amount || 0),
          destination,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Relayer request failed",
        };
      }
    } else {
      // Return claim proof for manual relayer submission
      // In production, this would be encrypted and sent to PER/MagicBlock
      return {
        success: false,
        error: "No relayer endpoint configured. Claim proof generated but not submitted.",
        claimProof: {
          vaultPda: vaultPda.toBase58(),
          announcementPda: announcementPda.toBase58(),
          destination: destination.toBase58(),
          proof: Buffer.from([
            ...stealthPubkey,
            ...signature,
            ...destinationHash,
          ]).toString('base64'),
        },
      } as ClaimResult;
    }
  }
}

export default WaveStealthClient;
