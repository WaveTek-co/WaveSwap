# WAVETEK Kora Dockerfile
FROM ghcr.io/solana-foundation/kora:latest

WORKDIR /app

# Create complete kora.toml based on official config
RUN cat > /app/kora.toml << 'KORACONFIG'
[kora]
rate_limit = 1000

[kora.auth]

[kora.cache]
enabled = false
url = "redis://localhost:6379"
default_ttl = 300
account_ttl = 60

[kora.enabled_methods]
liveness = true
estimate_transaction_fee = true
get_supported_tokens = true
sign_transaction = true
sign_and_send_transaction = true
transfer_transaction = true
get_blockhash = true
get_config = true
get_payer_signer = true

[validation]
max_allowed_lamports = 10000000
max_signatures = 10
price_source = "Mock"
allow_durable_transactions = false
allowed_programs = [
    "11111111111111111111111111111111",
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
    "AddressLookupTab1e1111111111111111111111111",
    "ComputeBudget111111111111111111111111111111",
    "4jFg8uSh4jWkeoz6itdbsD7GadkTYLwfbyfDeNeB5nFX",
    "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh",
]
allowed_tokens = []
allowed_spl_paid_tokens = []
disallowed_accounts = []

[validation.fee_payer_policy]

[validation.fee_payer_policy.system]
allow_transfer = true
allow_assign = true
allow_create_account = true
allow_allocate = true

[validation.fee_payer_policy.system.nonce]
allow_initialize = true
allow_advance = true
allow_authorize = true
allow_withdraw = true

[validation.fee_payer_policy.spl_token]
allow_transfer = true
allow_burn = true
allow_close_account = true
allow_approve = true
allow_revoke = true
allow_set_authority = true
allow_mint_to = true
allow_initialize_mint = true
allow_initialize_account = true
allow_initialize_multisig = true
allow_freeze_account = true
allow_thaw_account = true

[validation.fee_payer_policy.token_2022]
allow_transfer = true
allow_burn = true
allow_close_account = true
allow_approve = true
allow_revoke = true
allow_set_authority = true
allow_mint_to = true
allow_initialize_mint = true
allow_initialize_account = true
allow_initialize_multisig = true
allow_freeze_account = true
allow_thaw_account = true

[validation.price]
type = "free"
margin = 0.0

[validation.token2022]
blocked_mint_extensions = []
blocked_account_extensions = []

[metrics]
enabled = false
endpoint = "/metrics"
port = 8080
scrape_interval = 60

[metrics.fee_payer_balance]
enabled = false
expiry_seconds = 30

[kora.usage_limit]
enabled = false
cache_url = "redis://localhost:6379"
max_transactions = 1000
fallback_if_unavailable = true
KORACONFIG

# Create signers.toml
RUN cat > /app/signers.toml << 'SIGNERSCONFIG'
[signer_pool]
strategy = "round_robin"

[[signers]]
name = "wavetek-fee-payer"
type = "memory"
private_key_env = "KORA_PRIVATE_KEY"
weight = 1
SIGNERSCONFIG

EXPOSE 8080

ENTRYPOINT ["kora"]
CMD ["--config", "/app/kora.toml", "rpc", "start", "--signers-config", "/app/signers.toml"]
