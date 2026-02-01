use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    pubkey::Pubkey,
    rent::Rent,
    sysvar::Sysvar,
};

use crate::{state::StakePool, utils::validation};

/// Initialize a new staking pool
///
/// Accounts expected:
/// 0. `[writable]` Pool account (PDA)
/// 1. `[signer]` Authority (pool admin)
/// 2. `[]` System program
pub fn handler(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let pool_ai = next_account_info(accounts_iter)?;
    let authority_ai = next_account_info(accounts_iter)?;
    let _system_program = next_account_info(accounts_iter)?;

    // Verify authority is signer
    validation::assert_signer(authority_ai)?;

    // Verify pool account is owned by this program
    if pool_ai.owner != program_id {
        return Err(solana_program::program_error::ProgramError::IncorrectProgramId);
    }

    // Check rent exemption
    let rent = Rent::get()?;
    if !rent.is_exempt(pool_ai.lamports(), pool_ai.data_len()) {
        return Err(solana_program::program_error::ProgramError::AccountNotRentExempt);
    }

    // Initialize pool data
    let pool = StakePool {
        authority: *authority_ai.key,
        total_staked: 0,
        apy_bps: 1000, // 10% APY default
        _padding: [0; 6],
    };

    pool_ai
        .try_borrow_mut_data()?
        .copy_from_slice(bytemuck::bytes_of(&pool));

    Ok(())
}
