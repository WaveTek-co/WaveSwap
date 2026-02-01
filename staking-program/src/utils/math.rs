pub fn calculate_rewards(amount: u64, apy_bps: u16, time_delta: i64) -> u64 {
    let yearly = amount * apy_bps as u64 / 10_000;
    yearly * time_delta as u64 / 31_536_000
}
