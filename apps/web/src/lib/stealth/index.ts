// WaveSwap Stealth SDK
// Privacy-preserving transactions using OceanVault stealth addresses

export { WaveStealthClient } from "./client";
export type { ClientConfig, WalletAdapter, RegistrationStep, RegistrationProgress } from "./client";

export {
  generateViewingKeys,
  generateStealthKeysFromSignature,
  deriveStealthAddress,
  deriveStealthAddressFromEphemeral,
  deriveStealthSpendingKey,
  checkViewTag,
  checkStealthAddress,
  stealthSign,
  stealthVerify,
} from "./crypto";
export type { StealthKeyPair, StealthVaultConfig } from "./crypto";

export {
  PROGRAM_IDS,
  NATIVE_SOL_MINT,
  RegistryDiscriminators,
  StealthDiscriminators,
  DefiDiscriminators,
  JUPITER_API,
  DEFAULT_SLIPPAGE_BPS,
  MAX_CHUNK_SIZE,
  RELAYER_CONFIG,
  deriveRegistryPda,
  deriveAnnouncementPda,
  deriveAnnouncementPdaFromNonce,
  deriveStealthVaultPda,
  deriveStakePositionPda,
  deriveMixerPoolPda,
  deriveTestMixerPoolPda,
  deriveDepositRecordPda,
  deriveRelayerAuthPda,
} from "./config";

export type {
  RegistryAccount,
  StealthAnnouncement,
  PendingPayment,
  ScanResult,
  ClaimResult,
  TransactionResult,
  SendResult,
  TokenInfo,
  NetworkType,
  WaveSendParams,
  WaveStakeParams,
  WaveSwapParams,
  SwapQuote,
} from "./types";

export { StealthScanner, isPaymentForUs, deriveStealthFromEphemeral } from "./scanner";
export type { DetectedPayment, ScannerConfig } from "./scanner";

// PER Privacy Integration - Full privacy flow with MagicBlock
export { PERPrivacyClient, MAGICBLOCK_RPC_DEVNET, MAGICBLOCK_TEE_PUBKEY } from "./per-privacy";
export type {
  PrivacySendParams,
  PrivacyClaimParams,
  PrivacySendResult,
  PrivacyClaimResult,
} from "./per-privacy";
