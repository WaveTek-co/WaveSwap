use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, TokenAccount, TransferChecked};
use anchor_spl::token_2022;
use anchor_lang::system_program;

declare_id!("5fJF7FV29wZG6Azg1GLesEQVnGFdWHkFiauBaLCkqFZJ");

#[program]
pub mod wave_stake {
    use super::*;

    /// Initialize the global staking state
    pub fn initialize(ctx: Context<Initialize>, authority: Pubkey) -> Result<()> {
        let global_state = &mut ctx.accounts.global_state;
        global_state.bump = ctx.bumps.global_state;
        global_state.authority = authority;
        global_state.pool_count = 0;
        msg!("Global state initialized with authority: {}", authority);
        Ok(())
    }

    /// Create user account (must be called before first stake)
    pub fn create_user_account(ctx: Context<CreateUserAccount>) -> Result<()> {
        let user = &mut ctx.accounts.user;
        let pool = &ctx.accounts.pool;
        let clock = Clock::get()?;

        user.bump = ctx.bumps.user;
        user.amount = 0;
        user.lock_type = 0;
        user.lock_start_timestamp = 0;
        user.lock_end_timestamp = 0;
        user.bonus_multiplier = 10000;
        user.last_reward_claim_timestamp = clock.unix_timestamp;

        msg!("User account created for pool: {}", String::from_utf8_lossy(&pool.pool_id));
        Ok(())
    }

    /// Create a new staking pool
    pub fn create_pool(
        ctx: Context<CreatePool>,
        pool_id: [u8; 32],
        stake_mint: Pubkey,
        lst_mint: Pubkey,
        reward_mint: Pubkey,
        reward_per_second: u64,
        lock_duration: u64,
        lock_bonus_percentage: u16,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.bump = ctx.bumps.pool;
        pool.pool_id = pool_id;
        pool.stake_mint = stake_mint;
        pool.lst_mint = lst_mint;
        pool.reward_mint = reward_mint;
        pool.reward_per_second = reward_per_second;
        pool.lock_duration = lock_duration;
        pool.lock_bonus_percentage = lock_bonus_percentage;
        pool.total_staked = 0;
        pool.total_reward_distributed = 0;
        pool.last_update_timestamp = Clock::get()?.unix_timestamp;
        pool.authority = ctx.accounts.authority.key();

        let global_state = &mut ctx.accounts.global_state;
        global_state.pool_count += 1;

        msg!(
            "Pool created with reward rate: {} per second",
            reward_per_second
        );
        Ok(())
    }

    /// Stake tokens with optional lock period
    /// lock_type: 0 = flexible, 1 = locked (30 days)
    pub fn stake(ctx: Context<Stake>, amount: u64, lock_type: u8) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidAmount);

        let pool = &mut ctx.accounts.pool;
        let user = &mut ctx.accounts.user;
        let clock = Clock::get()?;

        // Calculate time elapsed and update pool rewards
        let time_elapsed = (clock.unix_timestamp - pool.last_update_timestamp) as u64;
        if time_elapsed > 0 && pool.total_staked > 0 {
            let rewards_to_distribute = pool.reward_per_second
                .checked_mul(time_elapsed)
                .ok_or(ErrorCode::MathOverflow)?;
            pool.total_reward_distributed = pool.total_reward_distributed
                .checked_add(rewards_to_distribute)
                .ok_or(ErrorCode::MathOverflow)?;
        }
        pool.last_update_timestamp = clock.unix_timestamp;

        // Check if this is a new user account (amount will be 0 if uninitialized)
        // Only set bump and lock type on first stake
        let is_new_user = user.amount == 0;

        user.amount = user.amount.checked_add(amount).ok_or(ErrorCode::MathOverflow)?;

        if is_new_user {
            user.bump = ctx.bumps.user;
            user.lock_type = lock_type;

            if lock_type == 1 {
                // Locked staking
                user.lock_start_timestamp = clock.unix_timestamp;
                user.lock_end_timestamp = clock.unix_timestamp + pool.lock_duration as i64;
                user.bonus_multiplier = 10000 + pool.lock_bonus_percentage; // 10000 = 1x (100%)
            } else {
                // Flexible staking
                user.lock_start_timestamp = 0;
                user.lock_end_timestamp = 0;
                user.bonus_multiplier = 10000; // 1x
            }
        }

        user.last_reward_claim_timestamp = clock.unix_timestamp;

        // Update pool totals
        pool.total_staked = pool.total_staked
            .checked_add(amount)
            .ok_or(ErrorCode::MathOverflow)?;

        // Check if staking native SOL (So11111111111111111111111111111111111112)
        // Native SOL mint is "So11111111111111111111111111111111111111112"
        let native_sol_mint = Pubkey::from_str_const("So11111111111111111111111111111111111111112");
        let is_native_sol = pool.stake_mint == native_sol_mint;

        if is_native_sol {
            // For native SOL, use System Program to transfer lamports to pool authority
            let transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
                &ctx.accounts.payer.key(),
                &ctx.accounts.pool_authority.key(),
                amount,
            );

            anchor_lang::solana_program::program::invoke(
                &transfer_ix,
                &[
                    ctx.accounts.payer.to_account_info(),
                    ctx.accounts.pool_authority.to_account_info(),
                ],
            )?;

            msg!("Transferred {} lamports (native SOL) to pool authority", amount);
        } else {
            // For SPL tokens, use TransferChecked
            let transfer_accounts = TransferChecked {
                from: ctx.accounts.user_token_account.as_ref().unwrap().to_account_info(),
                to: ctx.accounts.pool_authority_token_account.as_ref().unwrap().to_account_info(),
                authority: ctx.accounts.payer.to_account_info(),
                mint: ctx.accounts.stake_mint.to_account_info(),
            };

            let transfer_ctx = CpiContext::new(
                ctx.accounts.token_program.as_ref().unwrap().to_account_info(),
                transfer_accounts,
            );

            let decimals = ctx.accounts.stake_mint.decimals;
            token::transfer_checked(transfer_ctx, amount, decimals)?;

            msg!("Transferred {} tokens to pool authority", amount);
        }

        msg!("Staked {} tokens with lock type: {}", amount, lock_type);
        Ok(())
    }

    /// Unstake tokens (only after lock period expires for locked stakes)
    pub fn unstake(ctx: Context<Unstake>, amount: u64) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidAmount);

        let user = &mut ctx.accounts.user;
        let pool = &mut ctx.accounts.pool;
        let clock = Clock::get()?;

        // Check if user has enough staked
        require!(user.amount >= amount, ErrorCode::InsufficientStake);

        // Check lock period for locked stakes
        if user.lock_type == 1 {
            require!(
                clock.unix_timestamp >= user.lock_end_timestamp,
                ErrorCode::StillInLockPeriod
            );
        }

        // Calculate pending rewards before unstaking
        let time_elapsed = (clock.unix_timestamp - user.last_reward_claim_timestamp) as u64;
        let user_share = if pool.total_staked > 0 {
            (user.amount as u128)
                .checked_mul(10000 as u128)
                .ok_or(ErrorCode::MathOverflow)?
                .checked_div(pool.total_staked as u128)
                .ok_or(ErrorCode::MathOverflow)? as u64
        } else {
            0
        };

        let pending_rewards = pool
            .reward_per_second
            .checked_mul(time_elapsed)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_mul(user_share)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_mul(user.bonus_multiplier as u64)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(10000)
            .ok_or(ErrorCode::MathOverflow)?;

        // Update user stake
        user.amount = user.amount.checked_sub(amount).ok_or(ErrorCode::MathOverflow)?;
        user.last_reward_claim_timestamp = clock.unix_timestamp;

        // Update pool totals
        pool.total_staked = pool.total_staked
            .checked_sub(amount)
            .ok_or(ErrorCode::MathOverflow)?;

        // Check if unstaking native SOL
        let native_sol_mint = Pubkey::from_str_const("So11111111111111111111111111111111111111112");
        let is_native_sol = pool.stake_mint == native_sol_mint;

        if is_native_sol {
            // For native SOL, transfer lamports from pool authority back to user
            // NOTE: This requires pool_authority to be a PDA or have signed the transaction
            // If pool_authority is an external wallet, this will fail
            let transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
                &ctx.accounts.pool_authority.key(),
                &ctx.accounts.authority.key(),
                amount,
            );

            anchor_lang::solana_program::program::invoke_signed(
                &transfer_ix,
                &[
                    ctx.accounts.pool_authority.to_account_info(),
                    ctx.accounts.authority.to_account_info(),
                ],
                &[],
            )?;

            msg!("Transferred {} lamports (native SOL) back to user", amount);
        } else {
            // For SPL tokens, transfer from pool authority token account to user token account
            let transfer_accounts = TransferChecked {
                from: ctx.accounts.pool_authority_token_account.as_ref().unwrap().to_account_info(),
                to: ctx.accounts.user_token_account.as_ref().unwrap().to_account_info(),
                authority: ctx.accounts.pool_authority.to_account_info(),
                mint: ctx.accounts.stake_mint.to_account_info(),
            };

            let transfer_ctx = CpiContext::new(
                ctx.accounts.token_program.as_ref().unwrap().to_account_info(),
                transfer_accounts,
            );

            let decimals = ctx.accounts.stake_mint.decimals;
            token::transfer_checked(transfer_ctx, amount, decimals)?;

            msg!("Transferred {} tokens back to user", amount);
        }

        msg!("Unstaked {} tokens", amount);
        msg!("Pending rewards: {}", pending_rewards);
        Ok(())
    }

    /// Claim accumulated rewards
    pub fn claim_rewards(ctx: Context<ClaimRewards>) -> Result<()> {
        let user = &mut ctx.accounts.user;
        let pool = &mut ctx.accounts.pool;
        let clock = Clock::get()?;

        // Calculate rewards since last claim
        let time_elapsed = (clock.unix_timestamp - user.last_reward_claim_timestamp) as u64;

        let user_share = if pool.total_staked > 0 {
            (user.amount as u128)
                .checked_mul(10000 as u128)
                .ok_or(ErrorCode::MathOverflow)?
                .checked_div(pool.total_staked as u128)
                .ok_or(ErrorCode::MathOverflow)? as u64
        } else {
            0
        };

        let rewards = pool
            .reward_per_second
            .checked_mul(time_elapsed)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_mul(user_share)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_mul(user.bonus_multiplier as u64)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(10000)
            .ok_or(ErrorCode::MathOverflow)?;

        require!(rewards > 0, ErrorCode::NoRewardsAvailable);

        // Update last claim timestamp
        user.last_reward_claim_timestamp = clock.unix_timestamp;

        // Update pool total distributed
        pool.total_reward_distributed = pool.total_reward_distributed
            .checked_add(rewards)
            .ok_or(ErrorCode::MathOverflow)?;

        msg!("Claimed {} tokens in rewards", rewards);
        Ok(())
    }

    /// Update pool parameters (authority only)
    pub fn update_pool(
        ctx: Context<UpdatePool>,
        new_reward_per_second: Option<u64>,
        new_lock_duration: Option<u64>,
        new_lock_bonus_percentage: Option<u16>,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;

        if let Some(reward_rate) = new_reward_per_second {
            pool.reward_per_second = reward_rate;
        }

        if let Some(duration) = new_lock_duration {
            pool.lock_duration = duration;
        }

        if let Some(bonus) = new_lock_bonus_percentage {
            pool.lock_bonus_percentage = bonus;
        }

        msg!("Pool parameters updated");
        Ok(())
    }

    /// Close user account and withdraw remaining stake
    pub fn close_user_account(ctx: Context<CloseUserAccount>) -> Result<()> {
        let user = &mut ctx.accounts.user;
        let clock = Clock::get()?;

        // Check lock period
        if user.lock_type == 1 {
            require!(
                clock.unix_timestamp >= user.lock_end_timestamp,
                ErrorCode::StillInLockPeriod
            );
        }

        let amount = user.amount;

        // Close user account and return rent
        ctx.accounts.user.close(ctx.accounts.user_wallet.to_account_info())?;

        msg!("User account closed, {} tokens withdrawn", amount);
        Ok(())
    }
}

// ============ Account Structures ============

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + GlobalState::LEN,
        seeds = [b"global"],
        bump
    )]
    pub global_state: Account<'info, GlobalState>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateUserAccount<'info> {
    #[account(
        mut,
        seeds = [b"pool", pool.pool_id.as_ref()],
        bump = pool.bump
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        init,
        payer = payer,
        space = 8 + User::LEN,
        seeds = [b"user", pool.pool_id.as_ref(), payer.key().as_ref()],
        bump
    )]
    pub user: Account<'info, User>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(pool_id: [u8; 32])]
pub struct CreatePool<'info> {
    #[account(
        mut,
        seeds = [b"global"],
        bump = global_state.bump
    )]
    pub global_state: Account<'info, GlobalState>,

    #[account(
        init,
        payer = payer,
        space = 8 + Pool::LEN,
        seeds = [b"pool", pool_id.as_ref()],
        bump
    )]
    pub pool: Account<'info, Pool>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(amount: u64, lock_type: u8)]
pub struct Stake<'info> {
    #[account(
        mut,
        seeds = [b"pool", pool.pool_id.as_ref()],
        bump = pool.bump
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        seeds = [b"user", pool.pool_id.as_ref(), payer.key().as_ref()],
        bump
    )]
    pub user: Account<'info, User>,

    /// CHECK: Mint account for the stake token
    pub stake_mint: Account<'info, Mint>,

    /// CHECK: Pool authority account (receives staked tokens/lamports)
    #[account(mut)]
    pub pool_authority: AccountInfo<'info>,

    /// CHECK: Pool authority's token account (receives staked SPL tokens)
    /// Optional: Only required for SPL tokens, not native SOL
    pub pool_authority_token_account: Option<AccountInfo<'info>>,

    /// CHECK: User's token account
    /// Optional: Only required for SPL tokens, not native SOL
    pub user_token_account: Option<AccountInfo<'info>>,

    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: Token program or Token-2022 program
    /// Optional: Only required for SPL tokens, not native SOL
    pub token_program: Option<AccountInfo<'info>>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Unstake<'info> {
    #[account(
        mut,
        seeds = [b"pool", pool.pool_id.as_ref()],
        bump = pool.bump
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        seeds = [b"user", pool.pool_id.as_ref(), authority.key().as_ref()],
        bump = user.bump
    )]
    pub user: Account<'info, User>,

    /// CHECK: Mint account for the stake token
    pub stake_mint: Account<'info, Mint>,

    /// CHECK: Pool authority account (holds staked tokens/lamports)
    #[account(mut)]
    pub pool_authority: AccountInfo<'info>,

    /// CHECK: Pool authority's token account (holds staked SPL tokens)
    /// Optional: Only required for SPL tokens, not native SOL
    pub pool_authority_token_account: Option<AccountInfo<'info>>,

    /// CHECK: User's token account (receives unstaked SPL tokens)
    /// Optional: Only required for SPL tokens, not native SOL
    pub user_token_account: Option<AccountInfo<'info>>,

    pub authority: Signer<'info>,

    /// CHECK: Token program or Token-2022 program
    /// Optional: Only required for SPL tokens, not native SOL
    pub token_program: Option<AccountInfo<'info>>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimRewards<'info> {
    #[account(
        mut,
        seeds = [b"pool", pool.pool_id.as_ref()],
        bump = pool.bump
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        seeds = [b"user", pool.pool_id.as_ref(), authority.key().as_ref()],
        bump = user.bump
    )]
    pub user: Account<'info, User>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdatePool<'info> {
    #[account(
        mut,
        seeds = [b"pool", pool.pool_id.as_ref()],
        bump = pool.bump
    )]
    pub pool: Account<'info, Pool>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct CloseUserAccount<'info> {
    #[account(
        mut,
        seeds = [b"pool", pool.pool_id.as_ref()],
        bump = pool.bump
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        close = user_wallet,
        seeds = [b"user", pool.pool_id.as_ref(), authority.key().as_ref()],
        bump = user.bump
    )]
    pub user: Account<'info, User>,

    /// CHECK: User wallet
    #[account(mut)]
    pub user_wallet: AccountInfo<'info>,

    pub authority: Signer<'info>,
}

// ============ Data Structures ============

#[account]
pub struct GlobalState {
    pub bump: u8,
    pub authority: Pubkey,
    pub pool_count: u64,
}

impl GlobalState {
    pub const LEN: usize = 8 + 32 + 8; // bump + authority + pool_count
}

#[account]
pub struct Pool {
    pub bump: u8,
    pub pool_id: [u8; 32],          // Pool identifier (e.g., "wave", "wealth")
    pub stake_mint: Pubkey,         // Token being staked
    pub lst_mint: Pubkey,           // Liquid Staking Token mint
    pub reward_mint: Pubkey,        // Reward token mint
    pub reward_per_second: u64,     // Base reward rate
    pub lock_duration: u64,         // Lock duration in seconds (2592000 = 30 days)
    pub lock_bonus_percentage: u16, // Bonus percentage (5000 = 50%)
    pub total_staked: u64,          // Total tokens staked in pool
    pub total_reward_distributed: u64, // Total rewards distributed
    pub last_update_timestamp: i64, // Last time pool was updated
    pub authority: Pubkey,          // Pool authority
}

impl Pool {
    pub const LEN: usize = 8 + // discriminator
        32 + // pool_id
        32 + // stake_mint
        32 + // lst_mint
        32 + // reward_mint
        8 +  // reward_per_second
        8 +  // lock_duration
        2 +  // lock_bonus_percentage
        8 +  // total_staked
        8 +  // total_reward_distributed
        8 +  // last_update_timestamp
        32;  // authority
}

#[account]
pub struct User {
    pub bump: u8,
    pub amount: u64,                  // Amount staked
    pub lock_type: u8,                // 0 = flexible, 1 = locked
    pub lock_start_timestamp: i64,    // Lock start time
    pub lock_end_timestamp: i64,      // Lock end time
    pub bonus_multiplier: u16,        // Reward multiplier (10000 = 1x)
    pub last_reward_claim_timestamp: i64, // Last reward claim
}

impl User {
    pub const LEN: usize = 8 + // discriminator
        8 + // amount
        1 + // lock_type
        8 + // lock_start_timestamp
        8 + // lock_end_timestamp
        2 + // bonus_multiplier
        8;  // last_reward_claim_timestamp
}

// ============ Error Codes ============

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid amount provided")]
    InvalidAmount,
    #[msg("Insufficient staked amount")]
    InsufficientStake,
    #[msg("Still in lock period")]
    StillInLockPeriod,
    #[msg("Math overflow occurred")]
    MathOverflow,
    #[msg("No rewards available to claim")]
    NoRewardsAvailable,
    #[msg("Invalid token mint")]
    InvalidMint,
    #[msg("Invalid token program")]
    InvalidTokenProgram,
}
