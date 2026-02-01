use solana_program::pubkey::Pubkey;

pub fn stake_pool_pda(program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"stake-pool"], program_id)
}

pub fn stake_position_pda(program_id: &Pubkey, user: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"stake-position", user.as_ref()], program_id)
}
