use anchor_lang::prelude::*;

#[event]
pub struct SwapSubmitted {
    pub user: Pubkey,
    pub swap: Pubkey,
    pub route_id: u32,
    pub input_mint: Pubkey,
    pub output_mint: Pubkey,
    pub input_amount: u64,
    pub slippage_bps: u16,
    pub intent_id: String,
    pub timestamp: i64,
}

#[event]
pub struct SwapSettled {
    pub user: Pubkey,
    pub swap: Pubkey,
    pub route_id: u32,
    pub output_amount: u64,
    pub fee_amount: u64,
    pub proof_verified: bool,
    pub mxe_result_id: Option<String>,
    pub settled_at: i64,
}

#[event]
pub struct SwapCancelled {
    pub user: Pubkey,
    pub swap: Pubkey,
    pub reason: String,
    pub cancelled_at: i64,
}

#[event]
pub struct SwapFailed {
    pub user: Pubkey,
    pub swap: Pubkey,
    pub error: String,
    pub failed_at: i64,
}

#[event]
pub struct MXERequestSubmitted {
    pub swap: Pubkey,
    pub request_id: String,
    pub encrypted_input: Pubkey,
    pub parameters: Vec<u8>,
    pub submitted_at: i64,
}

#[event]
pub struct MXEResultReceived {
    pub swap: Pubkey,
    pub result_id: String,
    pub encrypted_output: Pubkey,
    pub proof: Vec<u8>,
    pub received_at: i64,
}

#[event]
pub struct ComputationCompleted {
    pub swap: Pubkey,
    pub computation_hash: [u8; 32],
    pub input_commitment: [u8; 32],
    pub output_commitment: [u8; 32],
    pub completed_at: i64,
}

#[event]
pub struct ConfigUpdated {
    pub authority: Pubkey,
    pub new_authority: Option<Pubkey>,
    pub new_fee_recipient: Option<Pubkey>,
    pub new_max_fee_bps: Option<u16>,
    pub updated_at: i64,
}

#[event]
pub struct EmergencyWithdrawal {
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub recipient: Pubkey,
    pub withdrawn_at: i64,
}

#[event]
pub struct RouteUpdated {
    pub route_id: u32,
    pub is_active: bool,
    pub updated_by: Pubkey,
    pub updated_at: i64,
}

#[event]
pub struct StageUpdated {
    pub swap: Pubkey,
    pub stage: String,
    pub status: String,
    pub updated_at: i64,
}