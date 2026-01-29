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
  deriveStealthVaultPda,
  NATIVE_SOL_MINT,
} from "./config";
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

  constructor(config: ClientConfig) {
    this.connection = config.connection;
    this.network = config.network || "devnet";
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

  // Wave Send - unified interface for stealth transfers
  // Uses two-step process: publish_announcement + finalize_stealth_transfer
  async waveSend(
    wallet: WalletAdapter,
    params: WaveSendParams
  ): Promise<SendResult> {
    if (!wallet.publicKey) {
      return { success: false, error: "Wallet not connected" };
    }

    // Fetch recipient registry
    const [registryPda] = deriveRegistryPda(params.recipientWallet);
    const registry = await this.getRegistry(params.recipientWallet);
    if (!registry || !registry.isFinalized) {
      return { success: false, error: "Recipient not registered for stealth payments" };
    }

    // Derive stealth address
    const stealthConfig = deriveStealthAddress(
      registry.spendPubkey,
      registry.viewPubkey
    );

    // Derive PDAs
    const [announcementPda, announcementBump] = deriveAnnouncementPda(wallet.publicKey);
    const [vaultPda] = deriveStealthVaultPda(stealthConfig.stealthPubkey);

    // Check if sending SOL or SPL token
    const isSol = !params.mint || params.mint.equals(NATIVE_SOL_MINT);

    if (!isSol) {
      return { success: false, error: "SPL token transfers not yet supported in this version" };
    }

    const tx = new Transaction();

    // Step 1: Publish announcement
    // Data format: discriminator (1) + bump (1) + view_tag (1)
    const publishData = Buffer.alloc(3);
    publishData.writeUInt8(StealthDiscriminators.PUBLISH_ANNOUNCEMENT, 0);
    publishData.writeUInt8(announcementBump, 1);
    publishData.writeUInt8(stealthConfig.viewTag, 2);

    tx.add(
      new TransactionInstruction({
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: announcementPda, isSigner: false, isWritable: true },
          { pubkey: registryPda, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_IDS.STEALTH,
        data: publishData,
      })
    );

    // Step 2: Finalize stealth transfer (SOL)
    // Data format: discriminator (1) + amount (8) + tee_proof (168)
    const teeProof = createDevnetTeeProof(
      announcementPda.toBytes(),
      vaultPda.toBytes()
    );

    const finalizeData = Buffer.alloc(1 + 8 + TEE_PROOF_SIZE);
    finalizeData.writeUInt8(StealthDiscriminators.FINALIZE_STEALTH_TRANSFER, 0);
    finalizeData.writeBigUInt64LE(params.amount, 1);
    Buffer.from(teeProof).copy(finalizeData, 9);

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
      await this.connection.confirmTransaction(signature);

      return {
        success: true,
        signature,
        stealthPubkey: stealthConfig.stealthPubkey,
        ephemeralPubkey: stealthConfig.ephemeralPubkey,
        viewTag: stealthConfig.viewTag,
        vaultPda,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Send failed",
      };
    }
  }

  // Claim a stealth payment
  // On-chain: accounts = [owner (signer), vault, destination]
  async claim(
    wallet: WalletAdapter,
    scanResult: ScanResult
  ): Promise<ClaimResult> {
    if (!wallet.publicKey) {
      return { success: false, error: "Wallet not connected" };
    }

    // Data format: just the discriminator (on-chain ignores extra data)
    const data = Buffer.alloc(1);
    data.writeUInt8(StealthDiscriminators.CLAIM_STEALTH_PAYMENT, 0);

    const tx = new Transaction();
    tx.add(
      new TransactionInstruction({
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
          { pubkey: scanResult.payment.vaultPda, isSigner: false, isWritable: true },
          { pubkey: wallet.publicKey, isSigner: false, isWritable: true },
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
}

export default WaveStealthClient;
