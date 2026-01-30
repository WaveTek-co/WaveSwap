// Stealth transaction types for WaveSwap
// Compatible with OceanVault on-chain programs

import { PublicKey } from "@solana/web3.js";

// Re-export crypto types
export type { StealthKeyPair, StealthVaultConfig } from "./crypto";

// Registry account stored on-chain
export interface RegistryAccount {
  owner: PublicKey;
  spendPubkey: Uint8Array;
  viewPubkey: Uint8Array;
  xwingPubkey: Uint8Array;
  createdAt: number;
  isFinalized: boolean;
}

// Stealth announcement event from on-chain
export interface StealthAnnouncement {
  pda: PublicKey;
  sender: PublicKey;
  ephemeralPubkey: Uint8Array;
  viewTag: number;
  vaultPda: PublicKey;
  slot: number;
  amount?: bigint;
  mint?: PublicKey;
  xwingCiphertext?: Uint8Array;
}

// Pending payment detected during scanning
export interface PendingPayment {
  announcementPda: PublicKey;
  vaultPda: PublicKey;
  ephemeralPubkey: Uint8Array;
  viewTag: number;
  amount?: bigint;
  mint: PublicKey;
  detectedSlot: number;
  stealthPubkey?: Uint8Array;
}

// Result from scanning
export interface ScanResult {
  payment: PendingPayment;
  stealthPrivkey: Uint8Array;
  stealthPubkey: Uint8Array;
}

// Claim result
export interface ClaimResult {
  success: boolean;
  signature?: string;
  amountClaimed?: bigint;
  destination?: PublicKey;
  error?: string;
  // For relayer claims: returns the proof for manual submission
  claimProof?: {
    vaultPda: string;
    announcementPda: string;
    destination: string;
    proof: string;
  };
}

// Transaction result
export interface TransactionResult {
  success: boolean;
  signature?: string;
  error?: string;
}

// Send result
export interface SendResult extends TransactionResult {
  stealthPubkey?: Uint8Array;
  ephemeralPubkey?: Uint8Array;
  viewTag?: number;
  vaultPda?: PublicKey;
}

// Token info
export interface TokenInfo {
  mint: PublicKey;
  symbol: string;
  name: string;
  decimals: number;
  logoUri?: string;
}

// Network type
export type NetworkType = "devnet" | "mainnet-beta";

// Wave send parameters
export interface WaveSendParams {
  recipientWallet: PublicKey;
  amount: bigint;
  mint?: PublicKey; // if undefined, send SOL
}

// Wave stake parameters
export interface WaveStakeParams {
  amount: bigint;
  lockPeriod?: number; // days
  validator?: PublicKey;
}

// Wave swap parameters
export interface WaveSwapParams {
  inputMint: PublicKey;
  outputMint: PublicKey;
  amount: bigint;
  slippageBps?: number;
  stealthOutput?: boolean; // whether to send output to stealth address
}

// Swap quote from Jupiter
export interface SwapQuote {
  inputMint: PublicKey;
  outputMint: PublicKey;
  inputAmount: bigint;
  outputAmount: bigint;
  priceImpactPct: number;
  slippageBps: number;
  routePlan: {
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }[];
}
