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
  return true; // Optimistically return true on timeout
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
  async register(
    wallet: WalletAdapter,
    keys?: StealthKeyPair,
    xwingPubkey?: Uint8Array
  ): Promise<TransactionResult> {
    if (!wallet.publicKey) {
      return { success: false, error: "Wallet not connected" };
    }

    const keysToUse = keys || this.stealthKeys;
    if (!keysToUse) {
      return { success: false, error: "Stealth keys not initialized" };
    }

    const [registryPda] = deriveRegistryPda(wallet.publicKey);

    // Check if already registered
    const existing = await this.connection.getAccountInfo(registryPda);
    if (existing) {
      return { success: false, error: "Already registered" };
    }

    const tx = new Transaction();

    // Initialize registry
    const initData = Buffer.alloc(8 + 32 + 32);
    RegistryDiscriminators.INITIALIZE_REGISTRY.copy(initData, 0);
    Buffer.from(keysToUse.spendPubkey).copy(initData, 8);
    Buffer.from(keysToUse.viewPubkey).copy(initData, 40);

    tx.add(
      new TransactionInstruction({
        keys: [
          { pubkey: registryPda, isSigner: false, isWritable: true },
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_IDS.REGISTRY,
        data: initData,
      })
    );

    // Upload x-wing public key in chunks (if provided)
    if (xwingPubkey) {
      for (let offset = 0; offset < xwingPubkey.length; offset += MAX_CHUNK_SIZE) {
        const chunk = xwingPubkey.slice(
          offset,
          Math.min(offset + MAX_CHUNK_SIZE, xwingPubkey.length)
        );

        const chunkData = Buffer.alloc(8 + 2 + chunk.length);
        RegistryDiscriminators.UPLOAD_KEY_CHUNK.copy(chunkData, 0);
        chunkData.writeUInt16LE(offset, 8);
        Buffer.from(chunk).copy(chunkData, 10);

        tx.add(
          new TransactionInstruction({
            keys: [
              { pubkey: registryPda, isSigner: false, isWritable: true },
              { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
            ],
            programId: PROGRAM_IDS.REGISTRY,
            data: chunkData,
          })
        );
      }
    }

    // Finalize registry
    tx.add(
      new TransactionInstruction({
        keys: [
          { pubkey: registryPda, isSigner: false, isWritable: true },
          { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
        ],
        programId: PROGRAM_IDS.REGISTRY,
        data: RegistryDiscriminators.FINALIZE_REGISTRY,
      })
    );

    try {
      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;

      const signedTx = await wallet.signTransaction(tx);
      const signature = await this.connection.sendRawTransaction(signedTx.serialize(), { skipPreflight: true });
      await confirmTransactionPolling(this.connection, signature, 30, 2000);

      return { success: true, signature };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Registration failed",
      };
    }
  }

  // Fetch recipient's registry
  async getRegistry(owner: PublicKey): Promise<RegistryAccount | null> {
    const [registryPda] = deriveRegistryPda(owner);
    const account = await this.connection.getAccountInfo(registryPda);

    if (!account) return null;

    const data = account.data;
    if (data.length < 104) return null;

    // Parse registry: [8 discriminator][32 owner][32 spend][32 view]...
    return {
      owner: new PublicKey(data.slice(8, 40)),
      spendPubkey: new Uint8Array(data.slice(40, 72)),
      viewPubkey: new Uint8Array(data.slice(72, 104)),
      xwingPubkey: new Uint8Array(data.slice(104, 104 + 1216)),
      createdAt:
        data.length >= 104 + 1216 + 8
          ? Number(data.readBigInt64LE(104 + 1216))
          : 0,
      isFinalized:
        data.length >= 104 + 1216 + 8 + 1
          ? data[104 + 1216 + 8] === 1
          : false,
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
      const signature = await this.connection.sendRawTransaction(signedTx.serialize(), { skipPreflight: true });
      await confirmTransactionPolling(this.connection, signature, 30, 2000);

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
}

export default WaveStealthClient;
