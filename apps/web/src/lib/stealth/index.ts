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
  // Privacy: Encrypted destination functions
  encryptDestinationWallet,
  decryptDestinationWallet,
  deriveStealthPubkeyFromSharedSecret,
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
  MASTER_AUTHORITY,
  NATIVE_SOL_MINT,
  RegistryDiscriminators,
  StealthDiscriminators,
  DefiDiscriminators,
  JUPITER_API,
  DEFAULT_SLIPPAGE_BPS,
  MAX_CHUNK_SIZE,
  RELAYER_CONFIG,
  KORA_CONFIG,
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
  deriveInputEscrowPda,
  deriveOutputEscrowPda,
  deriveXWingCiphertextPda,
  XWING_CIPHERTEXT_ACCOUNT_SIZE,
  // WAVETEK PDAs
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
  // MagicBlock constants
  TEE_VALIDATOR,
  MAGIC_CONTEXT,
  MAGIC_PROGRAM,
  // Pool Registry PDA derivations (3-signature flow)
  deriveTeePublicRegistryPda,
  deriveTeeSecretStorePda,
  derivePoolDepositPda,
  TEE_PUBLIC_REGISTRY_SIZE,
  TEE_SECRET_STORE_SIZE,
  POOL_DEPOSIT_SIZE,
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
  // WAVETEK TRUE PRIVACY Scanner (primary)
  scanForEscrowsV4,
  scanForEscrowsV4Worker,
  isEscrowForUs,
  verifyStealthPubkey,
  // Legacy aliases for backwards compatibility
  scanForEscrowsV3,
  isEscrowForUsV3,
  verifyStealthPubkeyV3,
  checkViewTagV3,
  isPaymentForUs,
  isPaymentForUsXWing,
  isPaymentForUsUniversal,
  deriveStealthFromEphemeral,
} from "./scanner";
export type { DetectedPayment, ScannerConfig, DetectedEscrowV4, DetectedEscrowV3 } from "./scanner";

// Stealth Worker — Isolated Web Worker for private key operations
// X-Wing secret key (2432 bytes) NEVER leaves the Worker thread
export { StealthWorkerClient } from "./stealth-worker-client";
export type { StealthPublicKeys, EscrowMatch } from "./stealth-worker-client";

// PER Privacy Integration - Full privacy flow with MagicBlock
export { PERPrivacyClient, MAGICBLOCK_RPC_DEVNET, MAGICBLOCK_TEE_PUBKEY } from "./per-privacy";
export type {
  PrivacySendParams,
  PrivacyClaimParams,
  PrivacySendResult,
  PrivacyClaimResult,
} from "./per-privacy";
