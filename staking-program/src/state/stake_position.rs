use bytemuck::{Pod, Zeroable};
use solana_program::pubkey::Pubkey;

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
pub struct StakePosition {
    pub owner: Pubkey,
    pub amount: u64,
    pub stake_start_ts: i64,
    pub last_claim_ts: i64,
}

impl StakePosition {
    pub const SIZE: usize = std::mem::size_of::<Self>();
}
