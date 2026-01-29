// WaveSwap Stealth SDK
// Privacy-preserving transactions using OceanVault stealth addresses

export { WaveStealthClient } from "./client";
export type { ClientConfig, WalletAdapter } from "./client";

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
