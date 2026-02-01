use solana_program::msg;

pub fn stake_event(user: &str, amount: u64) {
    msg!("EVENT:STAKE user={} amount={}", user, amount);
}

pub fn claim_event(user: &str, reward: u64) {
    msg!("EVENT:CLAIM user={} reward={}", user, reward);
}
