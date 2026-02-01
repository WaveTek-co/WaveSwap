use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    pubkey::Pubkey,
    sysvar::{clock::Clock, Sysvar},
};

use crate::{
    events::stake_event,
    state::{StakePool, StakePosition},
    utils::validation,
};

/// Stake tokens into the pool
///
/// Accounts expected:
/// 0. `[writable]` Pool account (PDA)
/// 1. `[writable]` Position account (PDA)
/// 2. `[signer]` User
pub fn handler(_program_id: &Pubkey, accounts: &[AccountInfo], amount: u64) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let pool_ai = next_account_info(accounts_iter)?;
    let position_ai = next_account_info(accounts_iter)?;
    let user_ai = next_account_info(accounts_iter)?;

    // Verify user is signer
    validation::assert_signer(user_ai)?;

    // Get current time
    let clock = Clock::get()?;

    // Create new stake position
    let position = StakePosition {
        owner: *user_ai.key,
        amount,
        stake_start_ts: clock.unix_timestamp,
        last_claim_ts: clock.unix_timestamp,
    };

    position_ai
        .try_borrow_mut_data()?
        .copy_from_slice(bytemuck::bytes_of(&position));

    // Update pool total staked
    let mut pool: StakePool = *bytemuck::from_bytes(&pool_ai.data.borrow());
    pool.total_staked += amount;

    pool_ai
        .try_borrow_mut_data()?
        .copy_from_slice(bytemuck::bytes_of(&pool));

    // Emit stake event
    stake_event(&user_ai.key.to_string(), amount);

    Ok(())
}
