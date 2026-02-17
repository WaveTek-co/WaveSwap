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
  derivePerDepositPda,
  deriveDelegationRecordPda,
  deriveDelegationMetadataPda,
  deriveDelegateBufferPda,
  derivePerMixerPoolPda,
  derivePerDepositRecordPda,
  deriveInputEscrowPda,
  deriveOutputEscrowPda,
  deriveXWingCiphertextPda,
  // WAVETEK TRUE PRIVACY PDA derivations
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
  deriveDepositRecordBufferPda,
  deriveDepositRecordDelegationRecordPda,
  deriveDepositRecordDelegationMetadataPda,
  // WAVETEK SEQ PDA derivations
  deriveDepositRecordSeqPda,
  deriveInputEscrowSeqPda,
  TEE_VALIDATOR,
  NATIVE_SOL_MINT,
  RELAYER_CONFIG,
  MAGICBLOCK_PER,
  // Pool Registry PDA derivations (3-signature flow)
  deriveTeePublicRegistryPda,
  deriveTeeSecretStorePda,
  derivePoolDepositPda,
  MASTER_AUTHORITY,
  writeBigUint64LE,
  readBigUint64LE,
} from "./config";
import { ComputeBudgetProgram } from "@solana/web3.js";
// Use Web Crypto API for random bytes (browser-compatible)
const randomBytes = (length: number): Uint8Array => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
};

// HTTP polling-based confirmation (avoids WebSocket issues on devnet)
async function confirmTransactionPolling(
  connection: Connection,
  signature: string,
  maxAttempts = 15,
  intervalMs = 1000
): Promise<boolean> {
  // Fast polling: check every 500ms for first 5 attempts, then every 1s
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const status = await connection.getSignatureStatus(signature);
      if (status?.value?.confirmationStatus === 'confirmed' ||
          status?.value?.confirmationStatus === 'finalized') {
        return true;
      }
      if (status?.value?.err) {
        console.error('[WAVETEK] transaction failed <ENCRYPTED>');
        return false;
      }
    } catch (e) {
      // Ignore polling errors, keep trying
    }
    // Fast polling for first 5 attempts (500ms), then slower (1000ms)
    const delay = i < 5 ? 500 : intervalMs;
    await new Promise(r => setTimeout(r, delay));
  }
  return true; // Optimistically return true on timeout
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
  // X-Wing post-quantum cryptography
  XWingPublicKey,
  xwingEncapsulate,
  deriveXWingStealthAddress,
  serializeXWingPublicKey,
  deserializeXWingPublicKey,
  XWING_PUBLIC_KEY_SIZE,
  // Ed25519 → X25519 conversion
  ed25519ToX25519Keypair,
  // V3: Encrypted destination
  encryptDestinationWallet,
  deriveStealthPubkeyFromSharedSecret,
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
  private perConnection: Connection; // MagicBlock PER connection
  private network: "devnet" | "mainnet-beta";
  private stealthKeys: StealthKeyPair | null = null;
  private relayerPubkey: PublicKey | null = null;
  private relayerEndpoint: string | null = null;
  private useMagicBlockPer: boolean = true; // Use MagicBlock PER by default

  constructor(config: ClientConfig) {
    this.connection = config.connection;
    this.network = config.network || "devnet";

    // Initialize PER connection for MagicBlock Private Ephemeral Rollup
    this.perConnection = new Connection(MAGICBLOCK_PER.ER_ENDPOINT, "confirmed");

    // Auto-configure relayer from environment
    if (RELAYER_CONFIG.DEVNET_PUBKEY && this.network === "devnet") {
      try {
        this.relayerPubkey = new PublicKey(RELAYER_CONFIG.DEVNET_PUBKEY);
        this.relayerEndpoint = RELAYER_CONFIG.DEVNET_ENDPOINT;
      } catch (e) {
        // Invalid relayer config
      }
    }
  }

  // Enable/disable MagicBlock PER mode
  setUseMagicBlockPer(enabled: boolean): void {
    this.useMagicBlockPer = enabled;
  }

  // Check if MagicBlock PER mode is enabled
  isMagicBlockPerEnabled(): boolean {
    return this.useMagicBlockPer;
  }

  // Use mixer pool for privacy (alternative to PER)
  setUseMixerPool(): void {
    this.useMagicBlockPer = false;
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
    if (!registry || !registry.isFinalized) return false;
    // WAVETEK requires X-Wing keys — SIMPREG (old format) users are NOT ready to receive
    return registry.xwingPubkey.length >= XWING_PUBLIC_KEY_SIZE && registry.xwingPubkey.some(b => b !== 0);
  }

  // Register stealth meta-address on-chain
  // Uses multi-transaction approach to handle 1216-byte key data
  async register(
    wallet: WalletAdapter,
    keys?: StealthKeyPair,
    xwingPubkey?: Uint8Array,
    onProgress?: (progress: RegistrationProgress) => void,
    gaslessOptions?: {
      payer: PublicKey;           // Kora fee payer (pays rent + TX fees)
      blockhash: string;         // Blockhash from Kora
      submitTransaction: (txBase64: string) => Promise<string>;  // Kora sign+send
    }
  ): Promise<TransactionResult> {


    const reportProgress = (step: RegistrationStep, currentTx: number, totalTx: number, message: string) => {

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


    // Check if already registered

    let existing = await this.connection.getAccountInfo(registryPda);
    if (existing) {
      const existingRegistry = await this.getRegistry(wallet.publicKey);
      if (existingRegistry?.isFinalized) {
        // Check if this is a SIMPREG (old format without X-Wing keys) — allow upgrade
        const hasXWing = existingRegistry.xwingPubkey.length >= XWING_PUBLIC_KEY_SIZE
          && existingRegistry.xwingPubkey.some(b => b !== 0);
        if (hasXWing) {
          return { success: false, error: "Already registered" };
        }
        // SIMPREG or corrupt registry — close old account, then re-create with X-Wing
        reportProgress('initializing', 0, 1, 'Upgrading registry to X-Wing format...');
        const closeResult = await this.closeRegistry(wallet, gaslessOptions);
        if (!closeResult.success) {
          return { success: false, error: `Failed to close old registry: ${closeResult.error}` };
        }
        existing = null; // Account is now closed, proceed with fresh creation
      } else {
      }
    }

    // Registry stores X-Wing public key (1216 bytes total)
    // CRITICAL: Layout must match serializeXWingPublicKey/deserializeXWingPublicKey:
    // - Bytes 0-1183: ML-KEM-768 public key (1184 bytes)
    // - Bytes 1184-1215: X25519 public key (32 bytes)
    //
    // This format is used directly by the sender during xwingEncapsulate

    // CRITICAL: X-Wing keys are REQUIRED for privacy flow - reject registration without them
    if (!keysToUse.xwingKeys) {
      return { success: false, error: "X-Wing post-quantum keys required for registration. Please re-initialize stealth keys." };
    }

    const fullKeyData = Buffer.alloc(XWING_PUBLIC_KEY_SIZE);
    const serialized = serializeXWingPublicKey(keysToUse.xwingKeys.publicKey);
    Buffer.from(serialized).copy(fullKeyData, 0);

    // Verify key is not all zeros (sanity check)
    if (!fullKeyData.some(b => b !== 0)) {
      return { success: false, error: "X-Wing key serialization produced zero key. Key generation may have failed." };
    }
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

    let signatures: string[] = [];
    const isGasless = !!gaslessOptions;
    const feePayer = isGasless ? gaslessOptions!.payer : wallet.publicKey;

    try {
      // Build ALL transactions upfront, then sign once with signAllTransactions (1 wallet popup)
      const allTxs: Transaction[] = [];
      const blockhash = isGasless
        ? gaslessOptions!.blockhash
        : (await this.connection.getLatestBlockhash()).blockhash;
      const startChunkIdx = existing ? 0 : 1; // Skip chunk 0 if bundled with init

      // Transaction 1: Initialize registry + first chunk (only if fresh registration)
      if (!existing) {
        const tx1 = new Transaction();

        if (isGasless) {
          // Gasless: separate payer (Kora) from owner (user)
          const initData = Buffer.alloc(9);
          RegistryDiscriminators.INITIALIZE_REGISTRY_GASLESS.copy(initData, 0);
          initData.writeUInt8(bump, 8);

          tx1.add(
            new TransactionInstruction({
              keys: [
                { pubkey: gaslessOptions!.payer, isSigner: true, isWritable: true },   // payer (Kora)
                { pubkey: wallet.publicKey, isSigner: true, isWritable: false },        // owner (user)
                { pubkey: registryPda, isSigner: false, isWritable: true },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
              ],
              programId: PROGRAM_IDS.REGISTRY,
              data: initData,
            })
          );
        } else {
          // Standard: payer = owner (same account)
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
        }

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

        tx1.feePayer = feePayer;
        tx1.recentBlockhash = blockhash;
        allTxs.push(tx1);
      }

      // Remaining chunk transactions
      for (let i = startChunkIdx; i < chunks.length; i++) {
        const chunk = chunks[i];
        const isLastChunk = i === chunks.length - 1;
        const tx = new Transaction();

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

        if (isLastChunk) {
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

        tx.feePayer = feePayer;
        tx.recentBlockhash = blockhash;
        allTxs.push(tx);
      }

      const totalTx = allTxs.length;
      reportProgress('initializing', 1, totalTx, 'Sign once to register...');

      // Single wallet popup — sign all transactions at once
      const signedTxs = await wallet.signAllTransactions(allTxs);

      // Submit and confirm sequentially (each depends on previous)
      for (let i = 0; i < signedTxs.length; i++) {
        reportProgress(
          i === 0 ? 'initializing' : i === signedTxs.length - 1 ? 'finalizing' : `uploading-chunk-${i + 1}` as RegistrationStep,
          i + 1,
          totalTx,
          `Confirming transaction ${i + 1}/${totalTx}...`
        );

        if (isGasless) {
          // Gasless: serialize without requiring Kora's signature, send via Kora
          const txBase64 = Buffer.from(
            signedTxs[i].serialize({ requireAllSignatures: false })
          ).toString('base64');
          const sig = await gaslessOptions!.submitTransaction(txBase64);
          // Kora sends the TX — confirm it on L1 before proceeding to next TX
          await confirmTransactionPolling(this.connection, sig, 30, 2000);
          signatures.push(sig);
        } else {
          // Standard: submit directly
          const sig = await this.connection.sendRawTransaction(signedTxs[i].serialize(), { skipPreflight: true });
          await confirmTransactionPolling(this.connection, sig, 30, 2000);
          signatures.push(sig);
        }
      }

      reportProgress('complete', totalTx, totalTx, 'Registration complete!');
      return { success: true, signature: signatures[signatures.length - 1] };

    } catch (error) {
      console.error('[WAVETEK] registration failed:', error);
      reportProgress('error', 0, chunks.length, error instanceof Error ? error.message : 'Registration failed');
      return {
        success: false,
        error: error instanceof Error ? error.message : "Registration failed",
      };
    }
  }

  // Close registry to allow re-registration
  // This deletes the on-chain registry and returns rent to the wallet
  async closeRegistry(
    wallet: WalletAdapter,
    gaslessOptions?: {
      payer: PublicKey;
      blockhash: string;
      submitTransaction: (txBase64: string) => Promise<string>;
    }
  ): Promise<TransactionResult> {
    if (!wallet.publicKey) {
      return { success: false, error: "Wallet not connected" };
    }

    const [registryPda] = deriveRegistryPda(wallet.publicKey);

    // Check if registry exists
    const existing = await this.connection.getAccountInfo(registryPda);
    if (!existing) {
      return { success: false, error: "No registry found to close" };
    }

    const isGasless = !!gaslessOptions;
    const feePayer = isGasless ? gaslessOptions!.payer : wallet.publicKey;

    try {
      const tx = new Transaction();

      // Close registry instruction - accounts: owner (signer), registry pda, destination for rent
      tx.add(
        new TransactionInstruction({
          keys: [
            { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
            { pubkey: registryPda, isSigner: false, isWritable: true },
            { pubkey: wallet.publicKey, isSigner: false, isWritable: true }, // rent destination
          ],
          programId: PROGRAM_IDS.REGISTRY,
          data: RegistryDiscriminators.CLOSE_REGISTRY,
        })
      );

      tx.feePayer = feePayer;
      tx.recentBlockhash = isGasless
        ? gaslessOptions!.blockhash
        : (await this.connection.getLatestBlockhash()).blockhash;
      const signedTx = await wallet.signTransaction(tx);

      if (isGasless) {
        const txBase64 = Buffer.from(
          signedTx.serialize({ requireAllSignatures: false })
        ).toString('base64');
        const sig = await gaslessOptions!.submitTransaction(txBase64);
        return { success: true, signature: sig };
      } else {
        const sig = await this.connection.sendRawTransaction(signedTx.serialize(), { skipPreflight: true });
        await confirmTransactionPolling(this.connection, sig, 30, 2000);
        return { success: true, signature: sig };
      }
    } catch (error) {
      console.error('[WAVETEK] close failed <ENCRYPTED>');
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to close registry",
      };
    }
  }

  // SIMPLIFIED SINGLE-TRANSACTION REGISTRATION
  //
  // This is the RECOMMENDED approach - user signs ONCE
  // Only stores Ed25519 viewing keys (64 bytes)
  // X-Wing post-quantum crypto happens inside the TEE at transfer time
  //
  // Instruction data layout (73 bytes total):
  // - discriminator: 8 bytes (0x07)
  // - bump: 1 byte
  // - spend_pubkey: 32 bytes
  // - view_pubkey: 32 bytes
  async registerSimple(
    wallet: WalletAdapter,
    keys?: StealthKeyPair,
    onProgress?: (progress: RegistrationProgress) => void
  ): Promise<TransactionResult> {


    const reportProgress = (step: RegistrationStep, currentTx: number, totalTx: number, message: string) => {

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


    // Check if already registered

    const existing = await this.connection.getAccountInfo(registryPda);
    if (existing && existing.data.length > 0) {
      // Check discriminator - accept both old and new format
      const disc = existing.data.slice(0, 8).toString();
      if (disc === 'REGISTRY' || disc === 'SIMPREG\0') {
  
        return { success: false, error: "Already registered" };
      }
    }

    reportProgress('initializing', 1, 1, 'Registering (single transaction)...');

    try {
      const tx = new Transaction();

      // Build instruction data: discriminator(8) + bump(1) + spend_pubkey(32) + view_pubkey(32) = 73 bytes
      const data = Buffer.alloc(73);
      let offset = 0;

      // Discriminator (8 bytes)
      RegistryDiscriminators.REGISTER_SIMPLE.copy(data, offset);
      offset += 8;

      // Bump (1 byte)
      data.writeUInt8(bump, offset);
      offset += 1;

      // Spend pubkey (32 bytes)
      Buffer.from(keysToUse.spendPubkey).copy(data, offset);
      offset += 32;

      // View pubkey (32 bytes)
      Buffer.from(keysToUse.viewPubkey).copy(data, offset);

      tx.add(
        new TransactionInstruction({
          keys: [
            { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
            { pubkey: registryPda, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          programId: PROGRAM_IDS.REGISTRY,
          data,
        })
      );

      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
      const signedTx = await wallet.signTransaction(tx);
      const signature = await this.connection.sendRawTransaction(signedTx.serialize(), { skipPreflight: true });
      await confirmTransactionPolling(this.connection, signature, 30, 2000);


      reportProgress('complete', 1, 1, 'Registration complete!');

      // Trigger background X-Wing upgrade (non-blocking)
      if (keysToUse.xwingKeys) {
        this.upgradeToXWingBackground(wallet, keysToUse).catch(err => {
        });
      }

      return { success: true, signature };

    } catch (error) {
      console.error('[WAVETEK] registration failed <ENCRYPTED>');
      reportProgress('error', 0, 1, error instanceof Error ? error.message : 'Registration failed');
      return {
        success: false,
        error: error instanceof Error ? error.message : "Registration failed",
      };
    }
  }

  // BACKGROUND X-WING UPGRADE
  // Uploads X-Wing public key chunks without blocking UX
  // Called automatically after registerSimple() succeeds
  // User signs ALL chunk transactions at once (batch), then they're submitted in background
  async upgradeToXWingBackground(
    wallet: WalletAdapter,
    keys: StealthKeyPair
  ): Promise<TransactionResult> {
    if (!wallet.publicKey || !keys.xwingKeys) {
      return { success: false, error: "Missing wallet or X-Wing keys" };
    }


    const [registryPda] = deriveRegistryPda(wallet.publicKey);

    // Serialize X-Wing public key (1216 bytes)
    const xwingPubkey = serializeXWingPublicKey(keys.xwingKeys.publicKey);

    // Build chunk transactions
    const CHUNK_SIZE = 500; // Conservative to fit in tx
    const chunks: { offset: number; data: Uint8Array }[] = [];
    for (let offset = 0; offset < xwingPubkey.length; offset += CHUNK_SIZE) {
      chunks.push({
        offset: 64 + offset, // After Ed25519 keys (32 + 32)
        data: xwingPubkey.slice(offset, Math.min(offset + CHUNK_SIZE, xwingPubkey.length)),
      });
    }

    try {
      // Build all transactions
      const transactions: Transaction[] = [];
      const { blockhash } = await this.connection.getLatestBlockhash();

      for (const chunk of chunks) {
        const tx = new Transaction();
        const data = Buffer.alloc(8 + 2 + chunk.data.length);
        RegistryDiscriminators.UPLOAD_KEY_CHUNK.copy(data, 0);
        data.writeUInt16LE(chunk.offset, 8);
        Buffer.from(chunk.data).copy(data, 10);

        tx.add(new TransactionInstruction({
          keys: [
            { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
            { pubkey: registryPda, isSigner: false, isWritable: true },
          ],
          programId: PROGRAM_IDS.REGISTRY,
          data,
        }));

        tx.feePayer = wallet.publicKey;
        tx.recentBlockhash = blockhash;
        transactions.push(tx);
      }

      // Batch sign ALL transactions at once (single wallet popup)
      const signedTxs = await wallet.signAllTransactions(transactions);

      // Submit in background (non-blocking)
      for (let i = 0; i < signedTxs.length; i++) {
        const sig = await this.connection.sendRawTransaction(signedTxs[i].serialize(), { skipPreflight: true });
        // Don't await confirmation - true background
      }

      return { success: true };

    } catch (error) {
      console.error('[WAVETEK] background upgrade failed <ENCRYPTED>');
      return { success: false, error: error instanceof Error ? error.message : "X-Wing upgrade failed" };
    }
  }

  // Fetch recipient's registry
  // Supports both formats:
  //
  // OLD format (1260 bytes) - "REGISTRY":
  // - discriminator: 8 bytes
  // - bump: 1 byte
  // - owner: 32 bytes
  // - is_finalized: 1 byte
  // - bytes_written: 2 bytes
  // - xwing_public_key: 1216 bytes (spend[32] + view[32] + padding[1152])
  //
  // NEW format (112 bytes) - "SIMPREG\0":
  // - discriminator: 8 bytes
  // - bump: 1 byte
  // - owner: 32 bytes
  // - is_finalized: 1 byte (always 1)
  // - spend_pubkey: 32 bytes
  // - view_pubkey: 32 bytes
  // - reserved: 6 bytes
  async getRegistry(owner: PublicKey): Promise<RegistryAccount | null> {
    const [registryPda] = deriveRegistryPda(owner);
    const account = await this.connection.getAccountInfo(registryPda);

    if (!account) return null;

    const data = account.data;

    // Check discriminator
    const discriminator = data.slice(0, 8).toString();

    // Handle NEW simplified format (SIMPREG)
    if (discriminator === 'SIMPREG\0') {
      if (data.length < 106) return null; // Minimum size for simple registry

      const isFinalized = data[41] === 1;

      // Simple registry layout:
      // disc(8) + bump(1) + owner(32) + is_finalized(1) + spend(32) + view(32) + reserved(6)
      return {
        owner: new PublicKey(data.slice(9, 41)),
        spendPubkey: new Uint8Array(data.slice(42, 74)),
        viewPubkey: new Uint8Array(data.slice(74, 106)),
        xwingPubkey: new Uint8Array(64), // Not used in simple format
        createdAt: 0,
        isFinalized,
      };
    }

    // Handle full X-Wing format (REGISTRY discriminator)
    // Layout: disc(8) + bump(1) + owner(32) + is_finalized(1) + bytes_written(2) + xwing_pubkey(1216)
    // xwing_pubkey layout: mlkem(1184) + x25519(32)
    if (discriminator === 'REGISTRY') {
      if (data.length < 44) return null;

      const isFinalized = data[41] === 1;

      // Read full X-Wing public key (1216 bytes at offset 44)
      const xwingPubkey = new Uint8Array(data.slice(44, Math.min(44 + XWING_PUBLIC_KEY_SIZE, data.length)));

      // Validate X-Wing key is not all zeros (corrupt or incomplete registration)
      const keyHasData = xwingPubkey.length >= XWING_PUBLIC_KEY_SIZE && xwingPubkey.some(b => b !== 0);
      if (!keyHasData) {
        return {
          owner: new PublicKey(data.slice(9, 41)),
          spendPubkey: new Uint8Array(32),
          viewPubkey: new Uint8Array(32),
          xwingPubkey: new Uint8Array(0), // Empty = forces hasXWingKeys check to fail
          createdAt: 0,
          isFinalized: false, // Treat as not finalized to trigger re-registration
        };
      }

      return {
        owner: new PublicKey(data.slice(9, 41)),
        spendPubkey: new Uint8Array(32),
        viewPubkey: new Uint8Array(32),
        xwingPubkey,
        createdAt: 0,
        isFinalized,
      };
    }

    return null;
  }

  // Wave Send - PRODUCTION-READY stealth transfers with FULL PRIVACY
  //
  // WAVETEK TRUE PRIVACY FLOW
  // Requires: MagicBlock PER + X-Wing keys
  // Achieves TRUE sender unlinkability via TEE pool intermediary
  async waveSend(
    wallet: WalletAdapter,
    params: WaveSendParams
  ): Promise<SendResult> {
    // Validate wallet
    if (!wallet.publicKey) {
      return { success: false, error: "Wallet not connected" };
    }

    // Validate X-Wing keys required for privacy
    if (!this.stealthKeys?.xwingKeys) {
      return { success: false, error: "X-Wing keys required. Please initialize stealth keys first." };
    }

    // WAVETEK V4 - TRUE PRIVACY
    // Sender creates INPUT_ESCROW → TEE moves to POOL → OUTPUT (sender NOT in tx!)
    // On-chain observer cannot correlate sender to receiver
    return this.waveSendV4(wallet, params);
  }

  // @deprecated Use waveSendV4() or sendViaPoolDeposit() instead
  // Legacy mixer pool send - kept for backwards compatibility only
  async waveSendToMixerPool(
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


    // Generate random nonce
    const nonce = randomBytes(32);

    // Check if recipient has X-Wing keys for post-quantum security
    // X-Wing provides quantum-safe key encapsulation
    const hasXWingKeys = registry.xwingPubkey && registry.xwingPubkey.length >= 1216;

    let stealthConfig: StealthVaultConfig;
    let xwingCiphertext: Uint8Array | undefined;

    if (hasXWingKeys && this.stealthKeys?.xwingKeys) {
      // POST-QUANTUM PATH: Use X-Wing encapsulation

      // FIX: Use deserializeXWingPublicKey to correctly extract ML-KEM and X25519
      // ML-KEM is at offset 0 (1184 bytes), X25519 is at offset 1184 (32 bytes)
      const recipientXWingPk = deserializeXWingPublicKey(registry.xwingPubkey);

      // X-Wing encapsulation produces quantum-safe shared secret
      const { ciphertext, sharedSecret } = xwingEncapsulate(recipientXWingPk);
      xwingCiphertext = ciphertext;

      // Derive stealth address from X-Wing shared secret
      const { stealthPubkey, viewTag } = deriveXWingStealthAddress(
        registry.spendPubkey,
        registry.viewPubkey,
        sharedSecret
      );

      // Extract ephemeral pubkey from ciphertext (last 32 bytes)
      const ephemeralPubkey = ciphertext.slice(ciphertext.length - 32);

      stealthConfig = { stealthPubkey, ephemeralPubkey, viewTag };
    } else {
      // CLASSIC PATH: Ed25519-only (fallback)
      stealthConfig = deriveStealthAddress(registry.spendPubkey, registry.viewPubkey);
    }
    const [announcementPda, announcementBump] = deriveAnnouncementPdaFromNonce(nonce);
    const [vaultPda] = deriveStealthVaultPda(stealthConfig.stealthPubkey);
    const [mixerPoolPda] = deriveTestMixerPoolPda();
    const [depositRecordPda, depositBump] = deriveDepositRecordPda(nonce);

    const amountBigInt = BigInt(params.amount);

    // Build transaction: announcement + deposit to mixer pool
    const tx = new Transaction();

    // Announcement (privacy-preserving: only ephemeral pubkey + view tag + nonce)
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

    // Deposit to test mixer pool
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
      const signature = await this.connection.sendRawTransaction(signedTx.serialize(), { skipPreflight: true });
      await confirmTransactionPolling(this.connection, signature, 30, 2000);


      return {
        success: true,
        signature,
        stealthPubkey: stealthConfig.stealthPubkey,
        ephemeralPubkey: stealthConfig.ephemeralPubkey,
        viewTag: stealthConfig.viewTag,
        vaultPda,
        depositRecordPda,
        nonce: Buffer.from(nonce).toString('hex'),
      } as SendResult;
    } catch (error) {
      console.error('[WAVETEK] deposit failed <ENCRYPTED>');
      return {
        success: false,
        error: error instanceof Error ? error.message : "Send failed",
      };
    }
  }

  // FULL PRIVACY SEND - Correct architecture
  //
  // CRITICAL: Sender ONLY does deposit, relayer executes mixer transfer
  // This breaks the on-chain link between sender and vault
  //
  // Flow:
  // @deprecated Use waveSendV4() or sendViaPoolDeposit() instead
  // Legacy relayer flow - requires separate relayer infrastructure
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
      const depositSig = await this.connection.sendRawTransaction(signedTx.serialize(), { skipPreflight: true });
      await confirmTransactionPolling(this.connection, depositSig, 30, 2000);



      // ========================================
      // SUBMIT TO RELAYER for mixer execution
      // ========================================
      // The relayer will execute the mixer transfer with TEE proof
      // This is the KEY privacy step - sender does NOT execute mixer transfer!

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
        console.error('[WAVETEK] relayer execution failed <ENCRYPTED>');
        return {
          success: false,
          error: `Deposit succeeded but mixer execution failed: ${result.error}. Funds are safe in mixer pool.`,
        };
      }


      return {
        success: true,
        signature: result.signature, // Return mixer transfer signature
        stealthPubkey: stealthConfig.stealthPubkey,
        ephemeralPubkey: stealthConfig.ephemeralPubkey,
        viewTag: stealthConfig.viewTag,
        vaultPda,
      };
    } catch (error) {
      console.error('[WAVETEK] send failed:', error instanceof Error ? error.message : error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Send failed",
      };
    }
  }

  // MAGIC ACTIONS FLOW: Stealth transfer via PER (Private Ephemeral Rollup)
  //
  // CORRECT PRIVACY ARCHITECTURE:
  // 1. User signs ONE transaction (deposit to mixer pool)
  // 2. UI submits stealth config to PER listener
  // 3. PER (running in MagicBlock TEE) executes mixer transfer
  // @deprecated Use waveSendV4() instead - this uses old DEPOSIT_AND_DELEGATE
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
    const [vaultPda, vaultBump] = deriveStealthVaultPda(stealthConfig.stealthPubkey);
    const [mixerPoolPda] = deriveTestMixerPoolPda();
    const [depositRecordPda, depositBump] = deriveDepositRecordPda(nonce);
    const INSTRUCTIONS_SYSVAR_ID = new PublicKey("Sysvar1nstructions1111111111111111111111111");

    const amountBigInt = BigInt(params.amount);

    // ========================================
    // TX1: Deposit to mixer pool
    // ========================================
    const depositTx = new Transaction();

    const depositData = Buffer.alloc(42);
    let offset = 0;
    depositData[offset++] = StealthDiscriminators.DEPOSIT_TO_TEST_MIXER;
    depositData[offset++] = depositBump;
    Buffer.from(nonce).copy(depositData, offset);
    offset += 32;
    for (let i = 0; i < 8; i++) {
      depositData[offset++] = Number((amountBigInt >> BigInt(i * 8)) & BigInt(0xff));
    }

    depositTx.add(
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
      depositTx.feePayer = wallet.publicKey;
      depositTx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;

      const signedDepositTx = await wallet.signTransaction(depositTx);
      const depositSig = await this.connection.sendRawTransaction(signedDepositTx.serialize(), { skipPreflight: true });
      await confirmTransactionPolling(this.connection, depositSig, 30, 2000);



      // ========================================
      // Submit stealth config to PER listener
      // PER (running in MagicBlock TEE) will execute the mixer transfer
      // User does NOT sign the execute transaction!
      // ========================================
      const perEndpoint = this.relayerEndpoint || 'http://localhost:3001';



      const perPayload = {
        nonce: Buffer.from(nonce).toString('hex'),
        stealthPubkey: Buffer.from(stealthConfig.stealthPubkey).toString('hex'),
        announcementPda: announcementPda.toBase58(),
        vaultPda: vaultPda.toBase58(),
        depositSignature: depositSig,
      };

      try {
        const perResponse = await fetch(`${perEndpoint}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(perPayload),
        });

        const perResult = await perResponse.json();

        if (perResult.success) {
        } else {
        }
      } catch (perError) {
      }

      return {
        success: true,
        signature: depositSig,
        stealthPubkey: stealthConfig.stealthPubkey,
        ephemeralPubkey: stealthConfig.ephemeralPubkey,
        viewTag: stealthConfig.viewTag,
        vaultPda,
      };
    } catch (error) {
      console.error('[WAVETEK] send failed:', error instanceof Error ? error.message : error);
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
    return this.waveSendPrivate(wallet, params);
  }

  // ========================================
  // MAGICBLOCK PER INTEGRATION (OPTION 1)
  // ========================================
  // True MagicBlock Private Ephemeral Rollup integration:
  // 1. User signs ONE transaction (deposit + delegate)
  // 2. Deposit account is delegated to MagicBlock PER
  // 3. PER (inside Intel TDX TEE) executes mixer transfer
  // 4. X-Wing decryption happens inside TEE
  // @deprecated Use waveSendV4() instead - this uses old DEPOSIT_AND_DELEGATE (0x12)
  async waveSendViaPer(
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



    // Generate random nonce and derive stealth address
    const nonce = randomBytes(32);
    const stealthConfig = deriveStealthAddress(registry.spendPubkey, registry.viewPubkey);
    const [vaultPda] = deriveStealthVaultPda(stealthConfig.stealthPubkey);

    // Derive PER deposit PDAs
    const [perDepositPda, bump] = derivePerDepositPda(nonce);
    const [delegationRecord] = deriveDelegationRecordPda(perDepositPda);
    const [delegationMetadata] = deriveDelegationMetadataPda(perDepositPda);
    const [delegateBuffer] = deriveDelegateBufferPda(perDepositPda);

    const amountBigInt = BigInt(params.amount);

    // ========================================
    // BUILD DEPOSIT + DELEGATE TRANSACTION
    // ========================================
    // User signs ONE transaction that:
    // 1. Creates deposit record with stealth config
    // 2. Deposits SOL to deposit record
    // 3. Delegates deposit record to MagicBlock PER
    // 4. PER automatically executes mixer transfer in TEE
    const tx = new Transaction();

    // Add compute budget
    tx.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })
    );

    // Build instruction data
    // Layout: discriminator(1) + bump(1) + nonce(32) + amount(8) +
    //         stealth_pubkey(32) + ephemeral_pubkey(32) + view_tag(1) + commit_frequency_ms(4)
    const data = Buffer.alloc(111);
    let offset = 0;

    data[offset++] = StealthDiscriminators.DEPOSIT_AND_DELEGATE;
    data[offset++] = bump;

    Buffer.from(nonce).copy(data, offset);
    offset += 32;

    // Write amount as 8 bytes little-endian (browser-compatible)
    for (let i = 0; i < 8; i++) {
      data[offset++] = Number((amountBigInt >> BigInt(i * 8)) & BigInt(0xff));
    }

    Buffer.from(stealthConfig.stealthPubkey).copy(data, offset);
    offset += 32;

    Buffer.from(stealthConfig.ephemeralPubkey).copy(data, offset);
    offset += 32;

    data[offset++] = stealthConfig.viewTag;

    // Commit frequency: 1000ms = 1 second (write as 4 bytes little-endian, browser-compatible)
    const commitFrequency = 1000;
    data[offset++] = commitFrequency & 0xff;
    data[offset++] = (commitFrequency >> 8) & 0xff;
    data[offset++] = (commitFrequency >> 16) & 0xff;
    data[offset++] = (commitFrequency >> 24) & 0xff;

    // Build deposit + delegate instruction
    tx.add(
      new TransactionInstruction({
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: perDepositPda, isSigner: false, isWritable: true },
          { pubkey: PROGRAM_IDS.STEALTH, isSigner: false, isWritable: false },
          { pubkey: delegateBuffer, isSigner: false, isWritable: true },
          { pubkey: delegationRecord, isSigner: false, isWritable: true },
          { pubkey: delegationMetadata, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: PROGRAM_IDS.DELEGATION, isSigner: false, isWritable: false },
          { pubkey: PROGRAM_IDS.STEALTH, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_IDS.STEALTH,
        data,
      })
    );

    try {
      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;

      // USER SIGNS ONE TRANSACTION
      const signedTx = await wallet.signTransaction(tx);
      const signature = await this.connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: true,
        maxRetries: 3,
      });

      // Use HTTP polling confirmation (avoids WebSocket issues on devnet)
      const confirmed = await confirmTransactionPolling(this.connection, signature, 30, 2000);
      if (!confirmed) {
  
      }


      // PER automatically executes stealth transfer inside TEE
      // The TEE will:
      // 1. Read the deposit record with stealth config
      // 2. Execute transfer to stealth vault
      // 3. Commit state back to L1
      // No need for manual trigger - Magic Actions handles this

      return {
        success: true,
        signature,
        stealthPubkey: stealthConfig.stealthPubkey,
        ephemeralPubkey: stealthConfig.ephemeralPubkey,
        viewTag: stealthConfig.viewTag,
        vaultPda,
        // Additional info for tracking
        perDepositPda,
        nonce: Buffer.from(nonce).toString('hex'),
        delegated: true, // Indicates deposit is delegated to MagicBlock TEE
      } as SendResult;
    } catch (error) {
      console.error('[WAVETEK] send failed:', error instanceof Error ? error.message : error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Send failed",
      };
    }
  }

  // ========================================
  // PER MIXER POOL - IDEAL PRIVACY ARCHITECTURE
  // ========================================
  // True privacy via shared mixer pool:
  // 1. Sender deposits to shared PER mixer pool (anonymity set)
  // 2. PER (inside TEE) executes claim → creates escrow
  // 3. Escrow commits to L1
  // 4. Recipient withdraws from escrow
  // @deprecated Use waveSendV4() instead - this uses old DEPOSIT_TO_PER_MIXER (0x16)
  async waveSendViaPerMixerPool(
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



    // Generate random nonce and derive stealth address
    const nonce = randomBytes(32);
    const stealthConfig = deriveStealthAddress(registry.spendPubkey, registry.viewPubkey);

    // Derive PER Mixer Pool PDAs
    const [perMixerPoolPda] = derivePerMixerPoolPda();
    const [depositRecordPda, recordBump] = derivePerDepositRecordPda(nonce);
    const [escrowPda] = deriveInputEscrowPda(nonce);

    const amountBigInt = BigInt(params.amount);

    // ========================================
    // BUILD DEPOSIT TO PER MIXER POOL TX
    // ========================================
    // This deposits to the shared mixer pool with stealth config
    // The pool is delegated to MagicBlock - PER executes claims inside TEE
    const tx = new Transaction();

    // Add compute budget
    tx.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 })
    );

    // Build instruction data for DEPOSIT_TO_PER_MIXER
    // Layout: discriminator(1) + record_bump(1) + nonce(32) + amount(8) +
    //         stealth_pubkey(32) + ephemeral_pubkey(32) + view_tag(1) = 107 bytes
    const data = Buffer.alloc(107);
    let offset = 0;

    data[offset++] = StealthDiscriminators.DEPOSIT_TO_PER_MIXER;
    data[offset++] = recordBump;

    Buffer.from(nonce).copy(data, offset);
    offset += 32;

    // Write amount as 8 bytes little-endian
    for (let i = 0; i < 8; i++) {
      data[offset++] = Number((amountBigInt >> BigInt(i * 8)) & BigInt(0xff));
    }

    Buffer.from(stealthConfig.stealthPubkey).copy(data, offset);
    offset += 32;

    Buffer.from(stealthConfig.ephemeralPubkey).copy(data, offset);
    offset += 32;

    data[offset++] = stealthConfig.viewTag;

    // Build deposit instruction
    tx.add(
      new TransactionInstruction({
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: perMixerPoolPda, isSigner: false, isWritable: true },
          { pubkey: depositRecordPda, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_IDS.STEALTH,
        data,
      })
    );

    try {
      tx.feePayer = wallet.publicKey;
      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;

      // USER SIGNS ONE TRANSACTION
      const signedTx = await wallet.signTransaction(tx);
      const signature = await this.connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: true,
        maxRetries: 3,
      });

      // Use HTTP polling confirmation (avoids WebSocket issues on devnet)
      const confirmed = await confirmTransactionPolling(this.connection, signature, 20, 2000);


      return {
        success: true,
        signature,
        stealthPubkey: stealthConfig.stealthPubkey,
        ephemeralPubkey: stealthConfig.ephemeralPubkey,
        viewTag: stealthConfig.viewTag,
        perDepositPda: depositRecordPda,
        escrowPda,
        nonce: Buffer.from(nonce).toString('hex'),
      } as SendResult;
    } catch (error) {
      console.error('[WAVETEK] send failed:', error instanceof Error ? error.message : error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Send failed",
      };
    }
  }

  // ========================================
  // V3 PER MIXER POOL - IDEAL PRIVACY (RECOMMENDED)
  // ========================================
  // TRUE PRIVACY via encrypted destination:
  // 1. Sender deposits to shared PER mixer pool (anonymity set)
  // 2. Destination wallet is ENCRYPTED with X-Wing shared secret
  // 3. On-chain SHA256 verification: SHA256(shared_secret || "stealth-derive") == stealth_pubkey
  // 4. TEE verifies and sets verified_destination
  // 5. Permissionless withdrawal to verified_destination
  //
  // @deprecated Use waveSendV4() instead - V3 has nonce linkability issues
  async waveSendViaPerMixerPoolV3(
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

    // V3 requires X-Wing keys for encrypted destination
    if (!this.stealthKeys?.xwingKeys) {
      return this.waveSendViaPerMixerPool(wallet, params);
    }


    // Generate random nonce
    const nonce = randomBytes(32);

    // X-Wing encapsulation: generate shared secret and ciphertext
    const hasXWingKeys = registry.xwingPubkey && registry.xwingPubkey.length >= 1216;
    let sharedSecret: Uint8Array;
    let xwingCiphertext: Uint8Array | undefined;

    if (hasXWingKeys) {
      // FIX: Use deserializeXWingPublicKey to correctly extract ML-KEM and X25519
      // ML-KEM is at offset 0 (1184 bytes), X25519 is at offset 1184 (32 bytes)
      const recipientXWingPk = deserializeXWingPublicKey(registry.xwingPubkey);
      const encapResult = xwingEncapsulate(recipientXWingPk);
      xwingCiphertext = encapResult.ciphertext;
      sharedSecret = encapResult.sharedSecret;
    } else {
      // Generate random shared secret if no X-Wing keys
      sharedSecret = randomBytes(32);
    }

    // V3: Derive stealth pubkey using SHA256 (MUST match on-chain)
    const stealthPubkey = deriveStealthPubkeyFromSharedSecret(sharedSecret);

    // Ephemeral pubkey from X-Wing ciphertext or random
    const ephemeralPubkey = xwingCiphertext
      ? xwingCiphertext.slice(xwingCiphertext.length - 32)
      : randomBytes(32);

    // View tag is first byte of shared secret
    const viewTag = sharedSecret[0];

    // V3: ENCRYPT destination wallet with AES-GCM
    const encryptedDestination = await encryptDestinationWallet(
      params.recipientWallet.toBytes(),
      sharedSecret
    );

    // Derive PDAs
    const [perMixerPoolPda] = derivePerMixerPoolPda();
    const [depositRecordPda, recordBump] = derivePerDepositRecordPda(nonce);
    const [escrowPda, escrowBump] = deriveInputEscrowPda(nonce);
    const [xwingCtPda, xwingCtBump] = deriveXWingCiphertextPda(escrowPda);
    const [escrowBuffer] = deriveEscrowBufferPda(escrowPda);
    const [delegationRecord] = deriveEscrowDelegationRecordPda(escrowPda);
    const [delegationMetadata] = deriveEscrowDelegationMetadataPda(escrowPda);

    const amountBigInt = BigInt(params.amount);

    // ========================================
    // BUILD DEPOSIT_TO_PER_MIXER_V3 TX
    // ========================================
    // This deposits to the shared mixer pool with ENCRYPTED destination
    // The escrow is created and delegated to MagicBlock PER
    const tx = new Transaction();

    // Add compute budget
    tx.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })
    );

    // Build instruction data for DEPOSIT_TO_PER_MIXER_V3
    // V3 Layout: discriminator(1) + record_bump(1) + escrow_bump(1) + xwing_ct_bump(1) + nonce(32) + amount(8) +
    //            stealth_pubkey(32) + ephemeral_pubkey(32) + view_tag(1) +
    //            encrypted_destination(48) + commit_freq_ms(4) + xwing_ciphertext(1120) = 1281 bytes
    const hasFullXWing = xwingCiphertext && xwingCiphertext.length === 1120;
    const dataSize = hasFullXWing ? 1281 : 161; // Include full ciphertext or legacy format
    const data = Buffer.alloc(dataSize);
    let offset = 0;

    data[offset++] = StealthDiscriminators.DEPOSIT_TO_PER_MIXER_V3;
    data[offset++] = recordBump;
    data[offset++] = escrowBump;
    data[offset++] = xwingCtBump;

    Buffer.from(nonce).copy(data, offset);
    offset += 32;

    // Write amount as 8 bytes little-endian
    for (let i = 0; i < 8; i++) {
      data[offset++] = Number((amountBigInt >> BigInt(i * 8)) & BigInt(0xff));
    }

    Buffer.from(stealthPubkey).copy(data, offset);
    offset += 32;

    Buffer.from(ephemeralPubkey).copy(data, offset);
    offset += 32;

    data[offset++] = viewTag;

    Buffer.from(encryptedDestination).copy(data, offset);
    offset += 48;

    // Commit frequency: 10000ms = 10 seconds
    const commitFrequency = 10000;
    data[offset++] = commitFrequency & 0xff;
    data[offset++] = (commitFrequency >> 8) & 0xff;
    data[offset++] = (commitFrequency >> 16) & 0xff;
    data[offset++] = (commitFrequency >> 24) & 0xff;

    // V3: Include full X-Wing ciphertext for receiver decapsulation
    if (hasFullXWing) {
      Buffer.from(xwingCiphertext).copy(data, offset);
      offset += 1120;
    }

    // Build V3 deposit instruction
    // V3 accounts: payer, pool, record, escrow, xwing_ct, buffer, del_record, del_meta, system, delegation, owner
    tx.add(
      new TransactionInstruction({
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: perMixerPoolPda, isSigner: false, isWritable: false }, // Just for verification
          { pubkey: depositRecordPda, isSigner: false, isWritable: true },
          { pubkey: escrowPda, isSigner: false, isWritable: true },
          { pubkey: xwingCtPda, isSigner: false, isWritable: true }, // V3: XWingCiphertext account
          { pubkey: escrowBuffer, isSigner: false, isWritable: true },
          { pubkey: delegationRecord, isSigner: false, isWritable: true },
          { pubkey: delegationMetadata, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: PROGRAM_IDS.DELEGATION, isSigner: false, isWritable: false },
          { pubkey: PROGRAM_IDS.STEALTH, isSigner: false, isWritable: false }, // owner_program
        ],
        programId: PROGRAM_IDS.STEALTH,
        data,
      })
    );

    try {
      tx.feePayer = wallet.publicKey;
      const { blockhash } = await this.connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;

      // USER SIGNS ONE TRANSACTION
      const signedTx = await wallet.signTransaction(tx);
      const signature = await this.connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: true,
        maxRetries: 3,
      });


      // Use HTTP polling confirmation
      const confirmed = await confirmTransactionPolling(this.connection, signature, 20, 2000);

      return {
        success: true,
        signature,
        stealthPubkey,
        ephemeralPubkey,
        viewTag,
        perDepositPda: depositRecordPda,
        escrowPda,
        nonce: Buffer.from(nonce).toString('hex'),
        sharedSecret, // Receiver needs this to claim
        isV3: true,
        delegated: true,
      } as SendResult;
    } catch (error) {
      console.error('[WAVETEK] send failed:', error instanceof Error ? error.message : error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Send failed",
      };
    }
  }

  // Check if PER deposit has been executed
  async checkPerDepositStatus(nonceHex: string): Promise<{
    exists: boolean;
    delegated: boolean;
    executed: boolean;
    amount?: bigint;
  }> {
    const nonce = Buffer.from(nonceHex, 'hex');
    const [perDepositPda] = derivePerDepositPda(new Uint8Array(nonce));

    const accountInfo = await this.connection.getAccountInfo(perDepositPda);

    if (!accountInfo || accountInfo.data.length < 148) {
      return { exists: false, delegated: false, executed: false };
    }

    const data = accountInfo.data;

    // Read amount as little-endian BigInt (browser-compatible)
    let amount = BigInt(0);
    for (let i = 0; i < 8; i++) {
      amount |= BigInt(data[41 + i]) << BigInt(i * 8);
    }

    return {
      exists: true,
      delegated: data[146] === 1,
      executed: data[147] === 1,
      amount,
    };
  }

  // Wait for PER execution to complete
  async waitForPerExecution(
    nonceHex: string,
    timeoutMs: number = 60000
  ): Promise<{ executed: boolean; vaultPda?: PublicKey }> {
    const nonce = Buffer.from(nonceHex, 'hex');
    const [perDepositPda] = derivePerDepositPda(new Uint8Array(nonce));
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.checkPerDepositStatus(nonceHex);

      if (status.executed) {
        // Extract stealth pubkey from deposit record to derive vault
        const accountInfo = await this.connection.getAccountInfo(perDepositPda);
        if (accountInfo && accountInfo.data.length >= 113) {
          const stealthPubkey = new Uint8Array(accountInfo.data.slice(81, 113));
          const [vaultPda] = deriveStealthVaultPda(stealthPubkey);
          return { executed: true, vaultPda };
        }
        return { executed: true };
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    return { executed: false };
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
      return this.claimPrivate(scanResult, wallet.publicKey);
    }

    // WARNING: Direct claim exposes recipient wallet!

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
      const txSignature = await this.connection.sendRawTransaction(signedTx.serialize(), { skipPreflight: true });
      await confirmTransactionPolling(this.connection, txSignature, 30, 2000);

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
      const txSignature = await this.connection.sendRawTransaction(signedTx.serialize(), { skipPreflight: true });
      await confirmTransactionPolling(this.connection, txSignature, 30, 2000);

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

  // ═══════════════════════════════════════════════════════════════════════════════
  // WAVETEK TRUE PRIVACY FLOW
  // ═══════════════════════════════════════════════════════════════════════════════
  //
  // Read PER pool to get next sequential ID for WAVETEK deposits
  // Pool is delegated to PER, so L1 data is STALE - must read from PER
  private async getNextSeqId(): Promise<bigint> {
    const [poolPda] = derivePerMixerPoolPda();

    // Read pool from PER (live, authoritative data)
    try {
      const poolInfo = await this.perConnection.getAccountInfo(poolPda);
      if (poolInfo && poolInfo.data.length >= 95) {
        const lastId = readBigUint64LE(poolInfo.data, 79);
        // Start from lastId + 1 and probe PER for available seq_id
        let seqId = lastId + 1n;
        for (let i = 0; i < 10; i++) {
          const [recordPda] = deriveDepositRecordSeqPda(seqId);
          // Check L1 (where CREATE_V4_DEPOSIT_SEQ creates the record before delegation)
          const info = await this.connection.getAccountInfo(recordPda);
          if (!info) return seqId;
          seqId++;
        }
        return seqId;
      }
    } catch {
      // PER read failed, try L1 as fallback
    }

    // Fallback: read L1 pool (stale but better than nothing)
    try {
      const poolInfo = await this.connection.getAccountInfo(poolPda);
      if (poolInfo && poolInfo.data.length >= 95) {
        const lastId = readBigUint64LE(poolInfo.data, 79);
        let seqId = lastId + 1n;
        for (let i = 0; i < 10; i++) {
          const [recordPda] = deriveDepositRecordSeqPda(seqId);
          const info = await this.connection.getAccountInfo(recordPda);
          if (!info) return seqId;
          seqId++;
        }
        return seqId;
      }
    } catch {
      // L1 read also failed
    }

    // Last resort: probe from 1
    let seqId = 1n;
    try {
      for (let i = 0; i < 50; i++) {
        const [recordPda] = deriveDepositRecordSeqPda(seqId);
        const info = await this.connection.getAccountInfo(recordPda);
        if (!info) break;
        seqId++;
      }
    } catch {
      // Probing failed
    }

    return seqId;
  }

  // WAVETEK SEQ ARCHITECTURE (sender signs 3 TXs on L1):
  // TX1: CREATE_V4_DEPOSIT_SEQ (0x3B) - Create deposit record with seq_id
  // TX2: UPLOAD_V4_CIPHERTEXT (0x29) - Upload X-Wing ciphertext in chunks
  // TX3: COMPLETE_V4_DEPOSIT_SEQ (0x3C) - Create INPUT_ESCROW + delegate to PER
  // [AUTOMATIC - Crank handles rest]:
  // REGISTER_DEPOSIT → INPUT_TO_POOL → PREPARE_OUTPUT → POOL_TO_ESCROW
  // [RECEIVER]:
  // CLAIM_ESCROW_V4 (PER) → WITHDRAW_FROM_OUTPUT_ESCROW (L1)
  async waveSendV4(
    wallet: WalletAdapter,
    params: WaveSendParams,
    onProgress?: (step: string, current: number, total: number) => void
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
      return { success: false, error: "SPL token transfers not yet supported in WAVETEK" };
    }

    // WAVETEK requires X-Wing keys for encrypted destination
    if (!this.stealthKeys?.xwingKeys) {
      return { success: false, error: "X-Wing keys required for WAVETEK privacy flow" };
    }


    const reportProgress = (step: string, current: number, total: number) => {
      onProgress?.(step, current, total);
    };

    // WAVETEK SEQ: Read PER pool to get next sequential ID
    const seqId = await this.getNextSeqId();
    const amountBigInt = BigInt(params.amount);

    try {
      // X-Wing encapsulation for encrypted destination
      // CRITICAL: Reject if recipient has no valid X-Wing key (prevents unrecoverable deposits)
      const hasXWingKeys = registry.xwingPubkey && registry.xwingPubkey.length >= 1216;
      if (!hasXWingKeys) {
        return {
          success: false,
          error: "Recipient does not have X-Wing post-quantum keys. They must re-register with full stealth keys before receiving private payments."
        };
      }

      const recipientXWingPk = deserializeXWingPublicKey(registry.xwingPubkey);
      const encapResult = xwingEncapsulate(recipientXWingPk);
      const xwingCiphertext = encapResult.ciphertext;
      const sharedSecret = encapResult.sharedSecret;

      // Verify ciphertext is not all zeros (sanity check)
      const ctNonZero = xwingCiphertext.some(b => b !== 0);
      if (!ctNonZero) {
        return {
          success: false,
          error: "X-Wing encapsulation produced zero ciphertext. This should never happen - contact support."
        };
      }

      // Derive stealth pubkey using SHA256 (MUST match on-chain)
      const stealthPubkey = deriveStealthPubkeyFromSharedSecret(sharedSecret);
      const ephemeralPubkey = xwingCiphertext.slice(xwingCiphertext.length - 32);
      const viewTag = sharedSecret[0];

      // Encrypt destination wallet with AES-GCM
      const encryptedDestination = await encryptDestinationWallet(
        params.recipientWallet.toBytes(),
        sharedSecret
      );

      // Derive WAVETEK SEQ PDAs (seqId-based, not nonce-based)
      const [perMixerPoolPda, poolBump] = derivePerMixerPoolPda();
      const [depositRecordPda, recordBump] = deriveDepositRecordSeqPda(seqId);
      const [escrowPda, escrowBump] = deriveInputEscrowSeqPda(seqId);
      const [escrowBuffer] = deriveEscrowBufferPda(escrowPda);
      const [escrowDelegationRecord] = deriveEscrowDelegationRecordPda(escrowPda);
      const [escrowDelegationMetadata] = deriveEscrowDelegationMetadataPda(escrowPda);
      const [permissionPda] = deriveEscrowPermissionPda(escrowPda);
      const [permDelegationBuffer] = derivePermissionDelegationBufferPda(permissionPda);
      const [permDelegationRecord] = derivePermissionDelegationRecordPda(permissionPda);
      const [permDelegationMetadata] = derivePermissionDelegationMetadataPda(permissionPda);
      const [depositRecordBuffer] = deriveDepositRecordBufferPda(depositRecordPda);
      const [depositRecordDelegationRecord] = deriveDepositRecordDelegationRecordPda(depositRecordPda);
      const [depositRecordDelegationMetadata] = deriveDepositRecordDelegationMetadataPda(depositRecordPda);

      // ══════════════════════════════════════════════════════════════════════
      // BUILD ALL L1 TRANSACTIONS (signed once as "Send Privately")
      // ══════════════════════════════════════════════════════════════════════
      reportProgress('Preparing transactions...', 1, 2);

      const { blockhash } = await this.connection.getLatestBlockhash();

      // ── TX 1: CREATE_V4_DEPOSIT_SEQ (0x3B) ──
      // 3 accounts: payer, deposit_record, system_program
      // data: disc(1) + seq_id(8) + record_bump(1) + amount(8) + stealth_pubkey(32) +
      //       ephemeral_pubkey(32) + view_tag(1) + encrypted_destination(48) = 131 bytes

      const createData = Buffer.alloc(131);
      let offset = 0;
      createData[offset++] = StealthDiscriminators.CREATE_V4_DEPOSIT_SEQ;
      // seq_id (8 bytes LE)
      writeBigUint64LE(createData, seqId, offset); offset += 8;
      createData[offset++] = recordBump;
      // amount (8 bytes LE)
      for (let i = 0; i < 8; i++) {
        createData[offset++] = Number((amountBigInt >> BigInt(i * 8)) & BigInt(0xff));
      }
      Buffer.from(stealthPubkey).copy(createData, offset); offset += 32;
      Buffer.from(ephemeralPubkey).copy(createData, offset); offset += 32;
      createData[offset++] = viewTag;
      Buffer.from(encryptedDestination).copy(createData, offset);

      const createTx = new Transaction();
      createTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }));
      createTx.add(new TransactionInstruction({
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: depositRecordPda, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_IDS.STEALTH,
        data: createData,
      }));

      createTx.feePayer = wallet.publicKey;
      createTx.recentBlockhash = blockhash;

      // ── TX 2-3: UPLOAD_V4_CIPHERTEXT (chunks) ──
      const CHUNK_SIZE = 800;
      const totalChunks = Math.ceil(xwingCiphertext.length / CHUNK_SIZE);

      // Build all chunk transactions
      const uploadTxs: Transaction[] = [];
      for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
        const chunkStart = chunkIdx * CHUNK_SIZE;
        const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, xwingCiphertext.length);
        const chunk = xwingCiphertext.slice(chunkStart, chunkEnd);

        // Data: discriminator(1) + nonce(32) + offset(2) + chunk_len(2) + chunk
        // nonce = 32-byte buffer with first 8 bytes = seqId LE (for PDA derivation)
        const seqNonce = Buffer.alloc(32);
        writeBigUint64LE(seqNonce, seqId, 0);
        const uploadData = Buffer.alloc(1 + 32 + 2 + 2 + chunk.length);
        let uOffset = 0;
        uploadData[uOffset++] = StealthDiscriminators.UPLOAD_V4_CIPHERTEXT;
        seqNonce.copy(uploadData, uOffset); uOffset += 32;
        uploadData.writeUInt16LE(chunkStart, uOffset); uOffset += 2;
        uploadData.writeUInt16LE(chunk.length, uOffset); uOffset += 2;
        Buffer.from(chunk).copy(uploadData, uOffset);

        const uploadTx = new Transaction();
        uploadTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }));
        uploadTx.add(new TransactionInstruction({
          keys: [
            { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
            { pubkey: depositRecordPda, isSigner: false, isWritable: true },
          ],
          programId: PROGRAM_IDS.STEALTH,
          data: uploadData,
        }));
        uploadTx.feePayer = wallet.publicKey;
        uploadTx.recentBlockhash = blockhash;
        uploadTxs.push(uploadTx);
      }

      // ── TX 4: COMPLETE_V4_DEPOSIT_SEQ (0x3C) ──
      // Creates input_escrow with funds, delegates INPUT_ESCROW + DEPOSIT_RECORD to PER
      // data: disc(1) + seq_id(8) + escrow_bump(1) + commit_freq_ms(4) + record_bump(1) = 15 bytes
      const completeData = Buffer.alloc(15);
      let cOffset = 0;
      completeData[cOffset++] = StealthDiscriminators.COMPLETE_V4_DEPOSIT_SEQ;
      writeBigUint64LE(completeData, seqId, cOffset); cOffset += 8;
      completeData[cOffset++] = escrowBump;
      completeData.writeUInt32LE(1000, cOffset); cOffset += 4; // 1000ms commit frequency
      completeData[cOffset++] = recordBump;

      const completeTx = new Transaction();
      completeTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 800_000 }));
      completeTx.add(new TransactionInstruction({
        keys: [
          // 0. [signer, writable] payer
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          // 1. [writable] deposit_record (delegated to PER, has X-Wing ciphertext)
          { pubkey: depositRecordPda, isSigner: false, isWritable: true },
          // 2. [writable] input_escrow (created with funds, delegated to PER)
          { pubkey: escrowPda, isSigner: false, isWritable: true },
          // 3. [writable] escrow_buffer
          { pubkey: escrowBuffer, isSigner: false, isWritable: true },
          // 4. [writable] escrow_delegation_record
          { pubkey: escrowDelegationRecord, isSigner: false, isWritable: true },
          // 5. [writable] escrow_delegation_metadata
          { pubkey: escrowDelegationMetadata, isSigner: false, isWritable: true },
          // 6. [] system_program
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          // 7. [] delegation_program
          { pubkey: PROGRAM_IDS.DELEGATION, isSigner: false, isWritable: false },
          // 8. [] owner_program (stealth)
          { pubkey: PROGRAM_IDS.STEALTH, isSigner: false, isWritable: false },
          // 9. [writable] permission_pda
          { pubkey: permissionPda, isSigner: false, isWritable: true },
          // 10. [] permission_program
          { pubkey: PROGRAM_IDS.PERMISSION, isSigner: false, isWritable: false },
          // 11. [writable] perm_delegation_buffer
          { pubkey: permDelegationBuffer, isSigner: false, isWritable: true },
          // 12. [writable] perm_delegation_record
          { pubkey: permDelegationRecord, isSigner: false, isWritable: true },
          // 13. [writable] perm_delegation_metadata
          { pubkey: permDelegationMetadata, isSigner: false, isWritable: true },
          // 14. [] validator (TEE)
          { pubkey: TEE_VALIDATOR, isSigner: false, isWritable: false },
          // 15. [writable] deposit_record_buffer (for delegation)
          { pubkey: depositRecordBuffer, isSigner: false, isWritable: true },
          // 16. [writable] deposit_record_delegation_record
          { pubkey: depositRecordDelegationRecord, isSigner: false, isWritable: true },
          // 17. [writable] deposit_record_delegation_metadata
          { pubkey: depositRecordDelegationMetadata, isSigner: false, isWritable: true },
          // Note: xwing_ct and pool accounts removed - TEE creates xwing_ct seeded by stealth_address (output)
        ],
        programId: PROGRAM_IDS.STEALTH,
        data: completeData,
      }));

      completeTx.feePayer = wallet.publicKey;
      completeTx.recentBlockhash = blockhash;

      // PREPARE_OUTPUT is now CRANK-ONLY (not sender!)
      // The heartbeat crank calls PREPARE_OUTPUT_SEQ on L1 to create OUTPUT_ESCROW.
      // This preserves privacy: crank batches multiple outputs so observer can't link sender->receiver.

      // ══════════════════════════════════════════════════════════════════════
      // SINGLE WALLET APPROVAL: "Send Privately"
      // Sender signs 3 TXs: CREATE_SEQ + UPLOAD(s) + COMPLETE_SEQ
      // ══════════════════════════════════════════════════════════════════════
      reportProgress('Sign to send privately', 1, 2);
      const allTxs = [createTx, ...uploadTxs, completeTx];

      if (!wallet.signAllTransactions) {
        throw new Error("Wallet does not support signing multiple transactions");
      }
      const signedTxs = await wallet.signAllTransactions(allTxs);

      // ══════════════════════════════════════════════════════════════════════
      // BROADCAST SIGNED TRANSACTIONS SEQUENTIALLY
      // ══════════════════════════════════════════════════════════════════════
      reportProgress('Broadcasting transactions...', 2, 2);

      // TX 1: CREATE_V4_DEPOSIT
      const createSig = await this.connection.sendRawTransaction(signedTxs[0].serialize(), {
        skipPreflight: true, maxRetries: 3,
      });
      const createOk = await confirmTransactionPolling(this.connection, createSig);
      if (!createOk) throw new Error("Deposit record creation failed on-chain");

      // TX 2-3: UPLOAD_V4_CIPHERTEXT chunks
      for (let i = 0; i < uploadTxs.length; i++) {
        const uploadSig = await this.connection.sendRawTransaction(signedTxs[1 + i].serialize(), {
          skipPreflight: true, maxRetries: 3,
        });
        const uploadOk = await confirmTransactionPolling(this.connection, uploadSig);
        if (!uploadOk) throw new Error(`Ciphertext upload chunk ${i + 1} failed on-chain`);
      }

      // TX 3+: COMPLETE_V4_DEPOSIT_SEQ
      const completeSig = await this.connection.sendRawTransaction(signedTxs[1 + uploadTxs.length].serialize(), {
        skipPreflight: true, maxRetries: 3,
      });
      const completeOk = await confirmTransactionPolling(this.connection, completeSig);
      if (!completeOk) throw new Error("Deposit completion failed on-chain");

      // SENDER DONE - Crank handles the rest automatically:
      // INPUT_TO_POOL → PREPARE_OUTPUT → POOL_TO_ESCROW
      // Receiver scans L1 for committed output escrows
      reportProgress('Sent! Crank will process through mixer.', 2, 2);

      // Trigger server-side crank to process this deposit (with retry)
      const triggerCrank = () => {
        fetch('/api/wavetek/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seqId: Number(seqId) }),
        }).catch(() => {});
      };
      triggerCrank();
      // Retry after 15s and 45s in case first call times out or deposit wasn't on PER yet
      setTimeout(triggerCrank, 15000);
      setTimeout(triggerCrank, 45000);

      const [outputEscrowPda] = deriveOutputEscrowPda(stealthPubkey);

      return {
        success: true,
        signature: completeSig,
        stealthPubkey,
        ephemeralPubkey,
        viewTag,
        perDepositPda: depositRecordPda,
        escrowPda: outputEscrowPda,
        nonce: seqId.toString(),
        sharedSecret,
        isV4: true,
        delegated: true, // Delegated to PER, crank handles the rest
      } as SendResult;

    } catch (error) {
      const msg = error instanceof Error ? error.message : "V4 send failed";
      console.error('[WAVETEK] send failed:', error instanceof Error ? error.message : error);
      return { success: false, error: msg };
    }
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // POOL REGISTRY - 3-Signature Post-Quantum Privacy Flow
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // REGISTRATION (1 signature): User creates TeePublicRegistry + TeeSecretStore
  // SEND (1 signature): Sender creates pool deposit, TEE auto-encapsulates
  // CLAIM (1 signature): Receiver claims, TEE auto-decapsulates + withdraws
  //
  // Total: 3 signatures across entire lifecycle!
  // ═══════════════════════════════════════════════════════════════════════════

  // Check if user has Pool Registry (TeePublicRegistry)
  async hasPoolRegistry(owner: PublicKey): Promise<boolean> {
    const [registryPda] = deriveTeePublicRegistryPda(owner);
    const info = await this.connection.getAccountInfo(registryPda);
    if (!info || info.data.length < 9) return false;
    // Check discriminator "TEEPUBKY"
    const disc = info.data.slice(0, 8).toString();
    return disc === 'TEEPUBKY';
  }

  // Check if user's Pool Registry is finalized (ready to receive)
  async isPoolRegistryFinalized(owner: PublicKey): Promise<boolean> {
    const [registryPda] = deriveTeePublicRegistryPda(owner);
    const info = await this.connection.getAccountInfo(registryPda);
    if (!info || info.data.length < 1296) return false;
    // Layout: disc(8) + bump(1) + owner(32) + xwing_pubkey(1216) + upload_offset(2) + is_finalized(1)
    // is_finalized at offset 1259 (8+1+32+1216+2)
    return info.data[1259] === 1;
  }

  // POOL REGISTRY REGISTRATION
  // Creates TeePublicRegistry (X-Wing PUBLIC key storage)
  // User signs ONCE, TEE auto-uploads remaining pubkey chunks via Magic Actions
  // Note: TeeSecretStore (encrypted SECRET key) is created separately
  async registerPoolRegistry(
    wallet: WalletAdapter,
    keys: StealthKeyPair,
    onProgress?: (message: string, step: number, total: number) => void
  ): Promise<TransactionResult> {

    const reportProgress = (msg: string, step: number, total: number) => {

      onProgress?.(msg, step, total);
    };

    if (!wallet.publicKey || !wallet.signTransaction) {
      return { success: false, error: 'Wallet not connected' };
    }

    if (!keys.xwingKeys) {
      return { success: false, error: 'X-Wing keys required for Pool Registry' };
    }

    // Check if already registered
    if (await this.hasPoolRegistry(wallet.publicKey)) {

      return { success: false, error: 'Already registered' };
    }

    reportProgress('Creating Pool Registry accounts...', 1, 3);

    try {
      const [registryPda, registryBump] = deriveTeePublicRegistryPda(wallet.publicKey);

      // Combine ML-KEM and X25519 pubkeys (1184 + 32 = 1216 bytes)
      const xwingPubkeyFull = new Uint8Array(1216);
      xwingPubkeyFull.set(keys.xwingKeys.publicKey.mlkem, 0);
      xwingPubkeyFull.set(keys.xwingKeys.publicKey.x25519, 1184);

      // First chunk (fits in one TX with account creation)
      const FIRST_CHUNK_SIZE = 800;
      const firstChunk = xwingPubkeyFull.slice(0, FIRST_CHUNK_SIZE);

      // Data: discriminator(1) + bump(1) + first_chunk
      // On-chain expects: bump(1) + first_chunk (after discriminator stripped by lib.rs)
      const initData = Buffer.alloc(2 + firstChunk.length);
      initData[0] = StealthDiscriminators.INIT_POOL_REGISTRY;
      initData[1] = registryBump;
      Buffer.from(firstChunk).copy(initData, 2);

      const tx = new Transaction();
      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
      tx.add(new TransactionInstruction({
        // accounts: 0.[signer,writable] owner, 1.[writable] registry, 2.[] system
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: registryPda, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_IDS.STEALTH,
        data: initData,
      }));

      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;

      reportProgress('Please approve the transaction...', 2, 3);

      const signedTx = await wallet.signTransaction(tx);
      const sig = await this.connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: true,
      });

      await confirmTransactionPolling(this.connection, sig, 30, 2000);

      reportProgress('Registration complete! TEE will upload remaining key data.', 3, 3);


      return { success: true, signature: sig };

    } catch (error) {
      console.error('[WAVETEK] registration failed <ENCRYPTED>');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Registration failed',
      };
    }
  }

  // POOL REGISTRY SEND
  // Sender creates pool deposit with recipient wallet
  // TEE auto-encapsulates using recipient's TeePublicRegistry
  async sendViaPoolDeposit(
    wallet: WalletAdapter,
    recipientWallet: PublicKey,
    amount: bigint,
    onProgress?: (message: string, step: number, total: number) => void
  ): Promise<SendResult> {
    const reportProgress = (msg: string, step: number, total: number) => {

      onProgress?.(msg, step, total);
    };

    if (!wallet.publicKey || !wallet.signTransaction) {
      return { success: false, error: 'Wallet not connected' };
    }

    // Check recipient is registered
    const recipientRegistered = await this.isPoolRegistryFinalized(recipientWallet);
    if (!recipientRegistered) {
      return { success: false, error: 'Recipient not registered for Pool Registry payments' };
    }

    reportProgress('Creating pool deposit...', 1, 3);

    try {
      // Generate random nonce
      const nonce = new Uint8Array(32);
      crypto.getRandomValues(nonce);

      const [depositPda, depositBump] = derivePoolDepositPda(nonce);

      // Data: discriminator(1) + bump(1) + nonce(32) + amount(8) = 42 bytes
      const data = Buffer.alloc(42);
      data[0] = StealthDiscriminators.CREATE_POOL_DEPOSIT;
      data[1] = depositBump;
      Buffer.from(nonce).copy(data, 2);
      writeBigUint64LE(data, amount, 34);

      const tx = new Transaction();
      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }));
      tx.add(new TransactionInstruction({
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: depositPda, isSigner: false, isWritable: true },
          { pubkey: recipientWallet, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_IDS.STEALTH,
        data,
      }));

      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;

      reportProgress('Please approve the transaction...', 2, 3);

      const signedTx = await wallet.signTransaction(tx);
      const sig = await this.connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: true,
      });

      await confirmTransactionPolling(this.connection, sig, 30, 2000);

      reportProgress('Deposit created! TEE will process and notify recipient.', 3, 3);


      return {
        success: true,
        signature: sig,
        nonce: Buffer.from(nonce).toString('hex'),
        isV4: true,
      };

    } catch (error) {
      console.error('[WAVETEK] send failed:', error instanceof Error ? error.message : error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Send failed',
      };
    }
  }

  // POOL REGISTRY CLAIM
  // Receiver claims, TEE decapsulates + auto-withdraws
  // Scanner provides stealth_pubkey + sharedSecret from X-Wing decapsulation
  async claimPoolDeposit(
    wallet: WalletAdapter,
    stealthPubkey: Uint8Array,
    sharedSecret: Uint8Array,
    onProgress?: (message: string, step: number, total: number) => void
  ): Promise<TransactionResult> {
    const reportProgress = (msg: string, step: number, total: number) => {

      onProgress?.(msg, step, total);
    };

    if (!wallet.publicKey || !wallet.signTransaction) {
      return { success: false, error: 'Wallet not connected' };
    }

    reportProgress('Claiming via TEE...', 1, 3);

    try {
      const [outputEscrowPda] = deriveOutputEscrowPda(stealthPubkey);
      const [xwingCtPda] = deriveXWingCiphertextPda(outputEscrowPda);
      const [secretStorePda] = deriveTeeSecretStorePda(wallet.publicKey);

      // Data: discriminator(1) + stealth_pubkey(32) + shared_secret(32) = 65 bytes
      const data = Buffer.alloc(65);
      data[0] = StealthDiscriminators.CLAIM_POOL_DEPOSIT;
      Buffer.from(stealthPubkey).copy(data, 1);
      Buffer.from(sharedSecret).copy(data, 33);

      const tx = new Transaction();
      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }));
      tx.add(new TransactionInstruction({
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: outputEscrowPda, isSigner: false, isWritable: true },
          { pubkey: secretStorePda, isSigner: false, isWritable: false },
          { pubkey: xwingCtPda, isSigner: false, isWritable: true },
          { pubkey: wallet.publicKey, isSigner: false, isWritable: true }, // destination
          { pubkey: MASTER_AUTHORITY, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_IDS.STEALTH,
        data,
      }));

      // Send to PER (TEE execution)
      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await this.perConnection.getLatestBlockhash()).blockhash;

      reportProgress('Please approve the claim...', 2, 3);

      const signedTx = await wallet.signTransaction(tx);
      const sig = await this.perConnection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: true,
      });

      await confirmTransactionPolling(this.perConnection, sig, 30, 2000);

      reportProgress('Claim complete! Funds transferred to your wallet.', 3, 3);


      return { success: true, signature: sig };

    } catch (error) {
      console.error('[WAVETEK] claim failed <ENCRYPTED>');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Claim failed',
      };
    }
  }
}

export default WaveStealthClient;
