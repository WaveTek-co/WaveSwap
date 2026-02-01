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

/// Unstake tokens and claim any remaining rewards
///
/// Accounts expected:
/// 0. `[writable]` Pool account (PDA)
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
    let mut pool: StakePool = *bytemuck::from_bytes(&pool_ai.data.borrow());

    // Load position data
    let position: StakePosition = *bytemuck::from_bytes(&position_ai.data.borrow());

    // Verify user owns the position
    if position.owner != *user_ai.key {
        return Err(StakeError::InvalidOwner.into());
    }

    // Get current time for final reward calculation
    let clock = Clock::get()?;
    let current_ts = clock.unix_timestamp;

    // Calculate final rewards
    let time_delta = current_ts
        .checked_sub(position.last_claim_ts)
        .ok_or(ProgramError::from(StakeError::MathOverflow))?;

    let final_reward = math::calculate_rewards(position.amount, pool.apy_bps, time_delta);

    // Emit claim event for final rewards
    if final_reward > 0 {
        claim_event(&user_ai.key.to_string(), final_reward);
    }

    // Update pool total staked
    pool.total_staked = pool
        .total_staked
        .checked_sub(position.amount)
        .ok_or(ProgramError::from(StakeError::MathOverflow))?;

    // Write updated pool back
    pool_ai
        .try_borrow_mut_data()?
        .copy_from_slice(bytemuck::bytes_of(&pool));

    // Zero out position data (mark as closed)
    let zeroed_position = StakePosition {
        owner: Pubkey::default(),
        amount: 0,
        stake_start_ts: 0,
        last_claim_ts: 0,
    };

    position_ai
        .try_borrow_mut_data()?
        .copy_from_slice(bytemuck::bytes_of(&zeroed_position));

    // NOTE: Actual token transfers would happen here:
    // 1. Transfer staked tokens back to user
    // 2. Transfer/mint final rewards to user

    Ok(())
}
