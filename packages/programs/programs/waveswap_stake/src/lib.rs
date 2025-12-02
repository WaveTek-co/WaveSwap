use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer};

declare_id!("11111111111111111111111111111112");

#[program]
pub mod solana_staking_rewards {
    use super::*;

    // admin: Address, Program administrator, 9PJ8I...3555  
    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        admin: Pubkey,
    ) -> Result<()> {
        let global_state = &mut ctx.accounts.global_state;
        global_state.bump = ctx.bumps.global_state;
        global_state.admin = admin;
        global_state.reward_duration = 0;
        global_state.reward_rate = 0;
        global_state.start_time = 0;
        global_state.period_finish = 0;
        global_state.last_update_time = Clock::get()?.unix_timestamp;
        global_state.reward_per_token_stored = 0;
        global_state.total_staked = 0;

        Ok(())
    }

    // total_reward: Number, Total reward tokens, 1000000 = 1 token (6 decimals)
    // duration: Number, Reward period in seconds, 604800 = 1 week
    // start_time: Number, Unix timestamp when rewards start, 1701234567
    // reward_mint: Address, Reward token mint, 2B5VT...7777
    // stake_mint: Address, Stake token mint, 8K9QW...4444
    pub fn set_rewards(
        ctx: Context<SetRewards>,
        total_reward: u64,
        duration: u64,
        start_time: i64,
        reward_mint: Pubkey,
        stake_mint: Pubkey,
    ) -> Result<()> {
        require!(total_reward > 0, ErrorCode::InvalidAmount);
        require!(duration > 0, ErrorCode::InvalidAmount);
        let current_time = Clock::get()?.unix_timestamp;
        require!(start_time >= current_time, ErrorCode::InvalidStartTime);

        let global_state = &mut ctx.accounts.global_state;

        // Update mints if first time setting rewards
        if global_state.reward_mint == Pubkey::default() {
            global_state.reward_mint = reward_mint;
            global_state.stake_mint = stake_mint;
            global_state.reward_vault = ctx.accounts.reward_vault.key();
            global_state.stake_vault = ctx.accounts.stake_vault.key();
        }

        global_state.reward_per_token_stored = calculate_reward_per_token(
            global_state.reward_per_token_stored,
            global_state.last_update_time,
            global_state.start_time,
            global_state.period_finish,
            global_state.reward_rate,
            global_state.total_staked,
            current_time,
        )?;
        global_state.last_update_time = current_time;
        global_state.reward_rate = total_reward.checked_div(duration).ok_or(ErrorCode::MathOverflow)?;
        global_state.start_time = start_time;
        global_state.period_finish = start_time.checked_add(duration as i64).ok_or(ErrorCode::MathOverflow)?;
        global_state.reward_duration = duration;

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.admin_reward_token.to_account_info(),
                    to: ctx.accounts.reward_vault.to_account_info(),
                    authority: ctx.accounts.admin.to_account_info(),
                },
            ),
            total_reward,
        )?;

        emit!(RewardSet {
            total_reward,
            duration,
            start_time,
            reward_rate: global_state.reward_rate,
            period_finish: global_state.period_finish,
        });

        Ok(())
    }

    // amount: Number, Stake amount in tokens, 1000000 = 1 token (6 decimals)
    pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidAmount);

        let global_state = &mut ctx.accounts.global_state;
        let current_time = Clock::get()?.unix_timestamp;

        global_state.reward_per_token_stored = calculate_reward_per_token(
            global_state.reward_per_token_stored,
            global_state.last_update_time,
            global_state.start_time,
            global_state.period_finish,
            global_state.reward_rate,
            global_state.total_staked,
            current_time,
        )?;
        global_state.last_update_time = current_time;

        let user_state = &mut ctx.accounts.user_state;
        let user_key = ctx.accounts.user.key();

        if user_state.user == Pubkey::default() {
            user_state.bump = ctx.bumps.user_state;
            user_state.user = user_key;
            user_state.staked_amount = 0;
            user_state.rewards_earned = 0;
            user_state.reward_per_token_paid = 0;
        }

        user_state.rewards_earned = calculate_earned(
            user_state.staked_amount,
            global_state.reward_per_token_stored,
            user_state.reward_per_token_paid,
            user_state.rewards_earned,
        )?;
        user_state.reward_per_token_paid = global_state.reward_per_token_stored;

        user_state.staked_amount = user_state.staked_amount.checked_add(amount).ok_or(ErrorCode::MathOverflow)?;
        global_state.total_staked = global_state.total_staked.checked_add(amount).ok_or(ErrorCode::MathOverflow)?;

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_stake_token.to_account_info(),
                    to: ctx.accounts.stake_vault.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount,
        )?;

        emit!(Staked {
            user: user_key,
            amount,
            total_staked: user_state.staked_amount,
        });

        Ok(())
    }

    // amount: Number, Withdraw amount in tokens, 1000000 = 1 token (6 decimals)
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidAmount);

        let global_state = &mut ctx.accounts.global_state;
        let current_time = Clock::get()?.unix_timestamp;

        global_state.reward_per_token_stored = calculate_reward_per_token(
            global_state.reward_per_token_stored,
            global_state.last_update_time,
            global_state.start_time,
            global_state.period_finish,
            global_state.reward_rate,
            global_state.total_staked,
            current_time,
        )?;
        global_state.last_update_time = current_time;

        let user_state = &mut ctx.accounts.user_state;
        require!(user_state.staked_amount >= amount, ErrorCode::InsufficientFunds);

        user_state.rewards_earned = calculate_earned(
            user_state.staked_amount,
            global_state.reward_per_token_stored,
            user_state.reward_per_token_paid,
            user_state.rewards_earned,
        )?;
        user_state.reward_per_token_paid = global_state.reward_per_token_stored;

        user_state.staked_amount = user_state.staked_amount.checked_sub(amount).ok_or(ErrorCode::MathOverflow)?;
        global_state.total_staked = global_state.total_staked.checked_sub(amount).ok_or(ErrorCode::MathOverflow)?;

        let seeds = &[
            b"stake_vault".as_ref(),
            &[ctx.bumps.stake_vault]
        ];
        let signer_seeds: &[&[&[u8]]] = &[seeds];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.stake_vault.to_account_info(),
                    to: ctx.accounts.user_stake_token.to_account_info(),
                    authority: ctx.accounts.stake_vault.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
        )?;

        emit!(Withdrawn {
            user: ctx.accounts.user.key(),
            amount,
            remaining_staked: user_state.staked_amount,
        });

        Ok(())
    }

    pub fn claim_reward(ctx: Context<ClaimReward>) -> Result<()> {
        let global_state = &mut ctx.accounts.global_state;
        let current_time = Clock::get()?.unix_timestamp;

        global_state.reward_per_token_stored = calculate_reward_per_token(
            global_state.reward_per_token_stored,
            global_state.last_update_time,
            global_state.start_time,
            global_state.period_finish,
            global_state.reward_rate,
            global_state.total_staked,
            current_time,
        )?;
        global_state.last_update_time = current_time;

        let user_state = &mut ctx.accounts.user_state;
        user_state.rewards_earned = calculate_earned(
            user_state.staked_amount,
            global_state.reward_per_token_stored,
            user_state.reward_per_token_paid,
            user_state.rewards_earned,
        )?;
        user_state.reward_per_token_paid = global_state.reward_per_token_stored;

        let reward_amount = user_state.rewards_earned;
        require!(reward_amount > 0, ErrorCode::NoRewardsToClaim);

        user_state.rewards_earned = 0;

        let seeds = &[
            b"reward_vault".as_ref(),
            &[ctx.bumps.reward_vault]
        ];
        let signer_seeds: &[&[&[u8]]] = &[seeds];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.reward_vault.to_account_info(),
                    to: ctx.accounts.user_reward_token.to_account_info(),
                    authority: ctx.accounts.reward_vault.to_account_info(),
                },
                signer_seeds,
            ),
            reward_amount,
        )?;

        emit!(RewardClaimed {
            user: ctx.accounts.user.key(),
            reward_amount,
        });

        Ok(())
    }
}

fn calculate_reward_per_token(
    stored: u128,
    last_update: i64,
    start_time: i64,
    period_finish: i64,
    reward_rate: u64,
    total_staked: u64,
    current_time: i64,
) -> Result<u128> {
    if total_staked == 0 || current_time < start_time {
        return Ok(stored);
    }

    let effective_start = std::cmp::max(last_update, start_time);
    let last_applicable_time = if current_time < period_finish {
        current_time
    } else {
        period_finish
    };

    if last_applicable_time <= effective_start {
        return Ok(stored);
    }

    let time_diff = (last_applicable_time.checked_sub(effective_start).ok_or(ErrorCode::MathOverflow)?) as u64;
    let reward_increment = (reward_rate as u128)
        .checked_mul(time_diff as u128).ok_or(ErrorCode::MathOverflow)?
        .checked_mul(1_000_000).ok_or(ErrorCode::MathOverflow)?
        .checked_div(total_staked as u128).ok_or(ErrorCode::MathOverflow)?;

    stored.checked_add(reward_increment).ok_or(ErrorCode::MathOverflow.into())
}

fn calculate_earned(
    staked_amount: u64,
    reward_per_token: u128,
    reward_per_token_paid: u128,
    rewards_earned: u64,
) -> Result<u64> {
    let reward_diff = reward_per_token.checked_sub(reward_per_token_paid).ok_or(ErrorCode::MathOverflow)?;
    let new_reward = (staked_amount as u128)
        .checked_mul(reward_diff).ok_or(ErrorCode::MathOverflow)?
        .checked_div(1_000_000).ok_or(ErrorCode::MathOverflow)? as u64;
    
    rewards_earned.checked_add(new_reward).ok_or(ErrorCode::MathOverflow.into())
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(
        init,
        seeds = [b"global_state"],
        bump,
        payer = admin,
        space = 8 + GlobalState::LEN
    )]
    pub global_state: Account<'info, GlobalState>,
    
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetRewards<'info> {
    #[account(
        mut,
        seeds = [b"global_state"],
        bump = global_state.bump,
        has_one = admin @ ErrorCode::Unauthorized,
    )]
    pub global_state: Account<'info, GlobalState>,
    
    #[account(
        init_if_needed,
        seeds = [b"reward_vault"],
        bump,
        payer = admin,
        token::mint = reward_mint,
        token::authority = reward_vault,
    )]
    pub reward_vault: Account<'info, TokenAccount>,
    
    #[account(
        init_if_needed,
        seeds = [b"stake_vault"],
        bump,
        payer = admin,
        token::mint = stake_mint,
        token::authority = stake_vault,
    )]
    pub stake_vault: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub admin_reward_token: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub admin: Signer<'info>,
    pub reward_mint: Account<'info, Mint>,
    pub stake_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(
        mut,
        seeds = [b"global_state"],
        bump = global_state.bump,
    )]
    pub global_state: Account<'info, GlobalState>,
    
    #[account(
        init_if_needed,
        seeds = [b"user", user.key().as_ref()],
        bump,
        payer = user,
        space = 8 + UserState::LEN
    )]
    pub user_state: Account<'info, UserState>,
    
    #[account(
        mut,
        seeds = [b"stake_vault"],
        bump,
    )]
    pub stake_vault: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = user_stake_token.mint == global_state.stake_mint @ ErrorCode::InvalidMint,
    )]
    pub user_stake_token: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    pub stake_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        mut,
        seeds = [b"global_state"],
        bump = global_state.bump,
    )]
    pub global_state: Account<'info, GlobalState>,
    
    #[account(
        mut,
        seeds = [b"user", user.key().as_ref()],
        bump = user_state.bump,
    )]
    pub user_state: Account<'info, UserState>,
    
    #[account(
        mut,
        seeds = [b"stake_vault"],
        bump,
    )]
    pub stake_vault: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub user_stake_token: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ClaimReward<'info> {
    #[account(
        mut,
        seeds = [b"global_state"],
        bump = global_state.bump,
    )]
    pub global_state: Account<'info, GlobalState>,
    
    #[account(
        mut,
        seeds = [b"user", user.key().as_ref()],
        bump = user_state.bump,
    )]
    pub user_state: Account<'info, UserState>,
    
    #[account(
        mut,
        seeds = [b"reward_vault"],
        bump,
    )]
    pub reward_vault: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = user_reward_token.mint == global_state.reward_mint @ ErrorCode::InvalidMint,
    )]
    pub user_reward_token: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[account]
pub struct GlobalState {
    pub bump: u8,
    pub admin: Pubkey,
    pub reward_mint: Pubkey,
    pub stake_mint: Pubkey,
    pub reward_vault: Pubkey,
    pub stake_vault: Pubkey,
    pub reward_duration: u64,
    pub reward_rate: u64,
    pub start_time: i64,
    pub period_finish: i64,
    pub last_update_time: i64,
    pub reward_per_token_stored: u128,
    pub total_staked: u64,
}

impl GlobalState {
    pub const LEN: usize = 1 + 32 + 32 + 32 + 32 + 32 + 8 + 8 + 8 + 8 + 8 + 16 + 8;
}

#[account]
pub struct UserState {
    pub bump: u8,
    pub user: Pubkey,
    pub staked_amount: u64,
    pub rewards_earned: u64,
    pub reward_per_token_paid: u128,
}

impl UserState {
    pub const LEN: usize = 1 + 32 + 8 + 8 + 16;
}

#[event]
pub struct RewardSet {
    pub total_reward: u64,
    pub duration: u64,
    pub start_time: i64,
    pub reward_rate: u64,
    pub period_finish: i64,
}

#[event]
pub struct Staked {
    pub user: Pubkey,
    pub amount: u64,
    pub total_staked: u64,
}

#[event]
pub struct Withdrawn {
    pub user: Pubkey,
    pub amount: u64,
    pub remaining_staked: u64,
}

#[event]
pub struct RewardClaimed {
    pub user: Pubkey,
    pub reward_amount: u64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Math overflow occurred")]
    MathOverflow,
    #[msg("Insufficient funds")]
    InsufficientFunds,
    #[msg("Unauthorized access")]
    Unauthorized,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Invalid mint")]
    InvalidMint,
    #[msg("No rewards to claim")]
    NoRewardsToClaim,
    #[msg("Invalid start time")]
    InvalidStartTime,
}
