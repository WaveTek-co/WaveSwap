// WaveSwap Stealth SDK
// Privacy-preserving transactions using OceanVault stealth addresses
// Supports both Ed25519 (classical) and X-Wing (post-quantum) cryptography

export { WaveStealthClient } from "./client";
export type { ClientConfig, WalletAdapter } from "./client";

// Ed25519 stealth crypto (classical security)
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

// X-Wing post-quantum crypto (ML-KEM-768 + X25519)
export {
  xwingKeyGen,
  xwingEncapsulate,
  xwingDecapsulate,
  serializeXWingPublicKey,
  deserializeXWingPublicKey,
  deriveXWingStealthAddress,
  deriveXWingStealthPrivateKey,
  checkXWingViewTag,
  generateXWingStealthKeys,
  generateXWingKeyBundle,
  prepareXWingStealthPayment,
  recoverXWingStealthPayment,
  XWING_PUBLIC_KEY_SIZE,
  XWING_CIPHERTEXT_SIZE,
  XWING_SHARED_SECRET_SIZE,
} from "./xwing";
export type {
  XWingPublicKey,
  XWingSecretKey,
  XWingKeyPair,
  XWingEncapsulationResult,
  XWingStealthResult,
  XWingKeyBundle,
} from "./xwing";

export {
  PROGRAM_IDS,
  NATIVE_SOL_MINT,
  RegistryDiscriminators,
  StealthDiscriminators,
  DefiDiscriminators,
  JUPITER_API,
  DEFAULT_SLIPPAGE_BPS,
  MAX_CHUNK_SIZE,
  deriveRegistryPda,
  deriveAnnouncementPda,
  deriveStealthVaultPda,
  deriveStakePositionPda,
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
