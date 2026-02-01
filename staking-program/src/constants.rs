/// Default APY in basis points (1000 = 10%)
pub const DEFAULT_APY_BPS: u16 = 1000;

/// Seconds in a year (for reward calculations)
pub const SECONDS_PER_YEAR: u64 = 31_536_000;

/// Seed for stake pool PDA
pub const STAKE_POOL_SEED: &[u8] = b"stake-pool";

/// Seed for stake position PDA
pub const STAKE_POSITION_SEED: &[u8] = b"stake-position";
