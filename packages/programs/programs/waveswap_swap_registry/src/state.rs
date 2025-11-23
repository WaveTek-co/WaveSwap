use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct SwapRegistry {
    pub authority: Pubkey,
    pub fee_recipient: Pubkey,
    pub max_fee_bps: u16,
    pub nonce_count: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace, Default, PartialEq, Eq, Debug)]
pub struct Swap {
    pub user: Pubkey,
    pub input_mint: Pubkey,
    pub output_mint: Pubkey,
    pub input_amount: u64,
    pub output_amount: u64,
    pub route_id: u32,
    pub slippage_bps: u16,
    pub fee_bps: u16,
    pub status: SwapStatus,
    pub intent_id: String,
    pub encrypted_input_account: Pubkey,
    pub encrypted_output_account: Pubkey,
    pub vault_account: Pubkey,
    pub mxe_request_id: Option<String>,
    pub mxe_result_id: Option<String>,
    pub computation_commitment: Option<[u8; 32]>,
    pub arcium_proof: Option<Vec<u8>>,
    pub created_at: i64,
    pub settled_at: Option<i64>,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug, Default)]
pub enum SwapStatus {
    #[default]
    EncryptedPending,
    EncryptedSettled,
    Cancelled,
    Failed,
    Expired,
}

#[account]
#[derive(InitSpace)]
pub struct SwapStage {
    pub swap: Pubkey,
    pub name: String,
    pub status: StageStatus,
    pub started_at: i64,
    pub completed_at: Option<i64>,
    pub error: Option<String>,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum StageStatus {
    Pending,
    InProgress,
    Completed,
    Failed,
    Skipped,
}

#[account]
#[derive(InitSpace)]
pub struct Route {
    pub id: u32,
    pub name: String,
    pub description: Option<String>,
    pub is_active: bool,
    pub priority: u32,
    pub min_amount: u64,
    pub max_amount: u64,
    pub supported_tokens: Vec<Pubkey>,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct UserNonce {
    pub user: Pubkey,
    pub nonce: u64,
    pub last_used: i64,
    pub bump: u8,
}

impl Swap {
    pub const SPACE: usize = 8 + // discriminator
        32 + // user
        32 + // input_mint
        32 + // output_mint
        8 +  // input_amount
        8 +  // output_amount
        4 +  // route_id
        2 +  // slippage_bps
        2 +  // fee_bps
        1 +  // status (enum)
        64 + // intent_id (max length)
        32 + // encrypted_input_account
        32 + // encrypted_output_account
        32 + // vault_account
        1 + 8 + 64 + // mxe_request_id (Option<String>)
        1 + 8 + 64 + // mxe_result_id (Option<String>)
        1 + 32 +    // computation_commitment (Option<[u8; 32]>)
        1 + 1024 +  // arcium_proof (Option<Vec<u8>>)
        8 +  // created_at
        9 +  // settled_at (Option<i64>) + bump
        8;   // padding for alignment
}

impl SwapStage {
    pub const MAX_NAME_LENGTH: usize = 50;
    pub const MAX_ERROR_LENGTH: usize = 200;
}

impl Route {
    pub const MAX_NAME_LENGTH: usize = 50;
    pub const MAX_DESCRIPTION_LENGTH: usize = 200;
    pub const MAX_SUPPORTED_TOKENS: usize = 100;
}