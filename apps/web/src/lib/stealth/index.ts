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
  // X-Wing post-quantum cryptography
  xwingKeyGenFromSeed,
  xwingEncapsulate,
  xwingDecapsulate,
  deriveXWingStealthAddress,
  deriveXWingStealthPrivateKey,
  checkXWingViewTag,
  serializeXWingPublicKey,
  deserializeXWingPublicKey,
  XWING_PUBLIC_KEY_SIZE,
  XWING_CIPHERTEXT_SIZE,
  // Ed25519 → X25519 conversion (X-Wing uses spend key as X25519)
  generateXWingFromSpendKey,
  ed25519ToX25519Keypair,
} from "./crypto";
export type {
  StealthKeyPair,
  StealthVaultConfig,
  XWingKeyPair,
  XWingPublicKey,
  XWingSecretKey,
} from "./crypto";

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
  derivePerMixerPoolPda,
  derivePerDepositRecordPda,
  deriveClaimEscrowPda,
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
  // X-Wing types (re-exported from types.ts)
  XWingKeyPair as XWingKeyPairType,
  XWingPublicKey as XWingPublicKeyType,
  XWingSecretKey as XWingSecretKeyType,
} from "./types";

export {
  StealthScanner,
  isPaymentForUs,
  isPaymentForUsXWing,
  isPaymentForUsUniversal,
  deriveStealthFromEphemeral,
} from "./scanner";
export type { DetectedPayment, ScannerConfig } from "./scanner";

// PER Privacy Integration - Full privacy flow with MagicBlock
export { PERPrivacyClient, MAGICBLOCK_RPC_DEVNET, MAGICBLOCK_TEE_PUBKEY } from "./per-privacy";
export type {
  PrivacySendParams,
  PrivacyClaimParams,
  PrivacySendResult,
  PrivacyClaimResult,
} from "./per-privacy";
