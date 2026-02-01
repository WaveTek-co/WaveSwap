use bytemuck::{Pod, Zeroable};
use solana_program::pubkey::Pubkey;

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
pub struct StakePool {
    pub authority: Pubkey,
    pub total_staked: u64,
    pub apy_bps: u16,
    pub _padding: [u8; 6], // Padding for alignment
}

impl StakePool {
    pub const SIZE: usize = std::mem::size_of::<Self>();
}
