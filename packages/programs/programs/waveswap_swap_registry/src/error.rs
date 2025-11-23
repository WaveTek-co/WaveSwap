use anchor_lang::prelude::*;

#[error_code]
pub enum WaveSwapError {
    #[msg("Unauthorized access")]
    Unauthorized,

    #[msg("Invalid authority")]
    InvalidAuthority,

    #[msg("Invalid fee recipient")]
    InvalidFeeRecipient,

    #[msg("Invalid fee basis points")]
    InvalidFeeBps,

    #[msg("Invalid slippage tolerance")]
    InvalidSlippageBps,

    #[msg("Invalid swap amount")]
    InvalidSwapAmount,

    #[msg("Invalid route")]
    InvalidRoute,

    #[msg("Swap not found")]
    SwapNotFound,

    #[msg("Invalid swap status")]
    InvalidSwapStatus,

    #[msg("Swap already settled")]
    SwapAlreadySettled,

    #[msg("Swap expired")]
    SwapExpired,

    #[msg("Insufficient liquidity")]
    InsufficientLiquidity,

    #[msg("Invalid proof")]
    InvalidProof,

    #[msg("Computation failed")]
    ComputationFailed,

    #[msg("Token account not found")]
    TokenAccountNotFound,

    #[msg("Invalid token mint")]
    InvalidTokenMint,

    #[msg("Invalid intent ID")]
    InvalidIntentId,

    #[msg("Duplicate intent ID")]
    DuplicateIntentId,

    #[msg("Route not supported")]
    RouteNotSupported,

    #[msg("Amount exceeds slippage tolerance")]
    ExceedsSlippageTolerance,

    #[msg("Math overflow")]
    MathOverflow,

    #[msg("Invalid ciphertext")]
    InvalidCiphertext,

    #[msg("Computation commitment mismatch")]
    ComputationCommitmentMismatch,

    #[msg("MXE integration error")]
    MXEIntegrationError,

    #[msg("Arcium integration error")]
    ArciumIntegrationError,

    #[msg("MagicBlock integration error")]
    MagicBlockIntegrationError,

    #[msg("Invalid nonce")]
    InvalidNonce,

    #[msg("Rate limit exceeded")]
    RateLimitExceeded,

    #[msg("Account already initialized")]
    AccountAlreadyInitialized,

    #[msg("Account not initialized")]
    AccountNotInitialized,

    #[msg("Invalid token account owner")]
    InvalidTokenAccountOwner,

    #[msg("Invalid vault state")]
    InvalidVaultState,

    #[msg("Emergency mode active")]
    EmergencyModeActive,

    #[msg("Invalid configuration")]
    InvalidConfiguration,
}