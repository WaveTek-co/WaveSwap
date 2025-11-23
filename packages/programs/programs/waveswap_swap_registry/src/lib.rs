use anchor_lang::prelude::*;

declare_id!("SwapRegistry111111111111111111111111111");

pub mod instructions;
pub mod state;
pub mod error;
pub mod events;

use instructions::*;
use state::*;
use error::*;

#[program]
pub mod waveswap_swap_registry {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        authority: Pubkey,
        fee_recipient: Pubkey,
        max_fee_bps: u16,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, authority, fee_recipient, max_fee_bps)
    }

    pub fn submit_encrypted_swap(
        ctx: Context<SubmitEncryptedSwap>,
        route_id: u32,
        slippage_bps: u16,
        input_amount: u64,
        intent_id: String,
    ) -> Result<()> {
        instructions::submit_encrypted_swap::handler(
            ctx,
            route_id,
            slippage_bps,
            input_amount,
            intent_id,
        )
    }

    pub fn settle_encrypted_swap(
        ctx: Context<SettleEncryptedSwap>,
        encrypted_output_ciphertext: Vec<u8>,
        mpc_proof: Vec<u8>,
        computation_commitment: [u8; 32],
        route_id: u32,
        fee_bps: u16,
        slippage_bps: u16,
        output_amount: u64,
    ) -> Result<()> {
        instructions::settle_encrypted_swap::handler(
            ctx,
            encrypted_output_ciphertext,
            mpc_proof,
            computation_commitment,
            route_id,
            fee_bps,
            slippage_bps,
            output_amount,
        )
    }

    pub fn cancel_encrypted_swap(ctx: Context<CancelEncryptedSwap>) -> Result<()> {
        instructions::cancel_encrypted_swap::handler(ctx)
    }

    pub fn update_config(
        ctx: Context<UpdateConfig>,
        new_authority: Option<Pubkey>,
        new_fee_recipient: Option<Pubkey>,
        new_max_fee_bps: Option<u16>,
    ) -> Result<()> {
        instructions::update_config::handler(
            ctx,
            new_authority,
            new_fee_recipient,
            new_max_fee_bps,
        )
    }

    pub fn emergency_withdraw(
        ctx: Context<EmergencyWithdraw>,
        mint: Pubkey,
        amount: u64,
    ) -> Result<()> {
        instructions::emergency_withdraw::handler(ctx, mint, amount)
    }
}