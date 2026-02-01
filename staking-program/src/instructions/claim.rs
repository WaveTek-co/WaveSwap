use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    program_error::ProgramError,
    pubkey::Pubkey,
    sysvar::{clock::Clock, Sysvar},
};

use crate::{
    error::StakeError,
    events::claim_event,
    state::{StakePool, StakePosition},
    utils::{math, validation},
};

/// Claim staking rewards
///
/// Accounts expected:
/// 0. `[]` Pool account (PDA)
/// 1. `[writable]` Position account (PDA)
/// 2. `[signer]` User (position owner)
pub fn handler(_program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let pool_ai = next_account_info(accounts_iter)?;
    let position_ai = next_account_info(accounts_iter)?;
    let user_ai = next_account_info(accounts_iter)?;

    // Verify user is signer
    validation::assert_signer(user_ai)?;

    // Load pool data
    let pool: StakePool = *bytemuck::from_bytes(&pool_ai.data.borrow());

    // Load position data
    let mut position: StakePosition = *bytemuck::from_bytes(&position_ai.data.borrow());

    // Verify user owns the position
    if position.owner != *user_ai.key {
        return Err(StakeError::InvalidOwner.into());
    }

    // Get current time
    let clock = Clock::get()?;
    let current_ts = clock.unix_timestamp;

    // Calculate time since last claim
    let time_delta = current_ts
        .checked_sub(position.last_claim_ts)
        .ok_or(ProgramError::from(StakeError::MathOverflow))?;

    if time_delta <= 0 {
        // No time has passed, no rewards to claim
        return Ok(());
    }

    // Calculate rewards
    let reward = math::calculate_rewards(position.amount, pool.apy_bps, time_delta);

    // Update last claim timestamp
    position.last_claim_ts = current_ts;

    // Write updated position back
    position_ai
        .try_borrow_mut_data()?
        .copy_from_slice(bytemuck::bytes_of(&position));

    // Emit claim event
    claim_event(&user_ai.key.to_string(), reward);

    // NOTE: Actual token transfer of rewards would happen here
    // This would typically involve:
    // 1. A reward token mint owned by the program
    // 2. Transfer/mint rewards to user's token account

    Ok(())
}
