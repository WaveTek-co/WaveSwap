# WAVETEK Kora Dockerfile - Self-contained with embedded config
FROM ghcr.io/solana-foundation/kora:latest

# Create config directory
WORKDIR /app

# Embed kora.toml directly
RUN echo '[validation]' > /app/kora.toml && \
    echo 'max_allowed_lamports = 10000000' >> /app/kora.toml && \
    echo 'max_signatures = 10' >> /app/kora.toml && \
    echo 'price_source = "Mock"' >> /app/kora.toml && \
    echo 'allowed_programs = [' >> /app/kora.toml && \
    echo '    "11111111111111111111111111111111",' >> /app/kora.toml && \
    echo '    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",' >> /app/kora.toml && \
    echo '    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",' >> /app/kora.toml && \
    echo '    "ComputeBudget111111111111111111111111111111",' >> /app/kora.toml && \
    echo '    "4jFg8uSh4jWkeoz6itdbsD7GadkTYLwfbyfDeNeB5nFX",' >> /app/kora.toml && \
    echo '    "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh",' >> /app/kora.toml && \
    echo ']' >> /app/kora.toml && \
    echo 'allowed_tokens = []' >> /app/kora.toml && \
    echo 'allowed_spl_paid_tokens = []' >> /app/kora.toml && \
    echo 'disallowed_accounts = []' >> /app/kora.toml && \
    echo '' >> /app/kora.toml && \
    echo '[rpc]' >> /app/kora.toml && \
    echo 'solana_rpc_url = "https://api.devnet.solana.com"' >> /app/kora.toml && \
    echo 'commitment = "confirmed"' >> /app/kora.toml && \
    echo '' >> /app/kora.toml && \
    echo '[server]' >> /app/kora.toml && \
    echo 'host = "0.0.0.0"' >> /app/kora.toml && \
    echo 'port = 8080' >> /app/kora.toml && \
    echo 'cors_origins = ["https://app.waveswap.live"]' >> /app/kora.toml && \
    echo '' >> /app/kora.toml && \
    echo '[logging]' >> /app/kora.toml && \
    echo 'level = "info"' >> /app/kora.toml

# Embed signers.toml
RUN echo '[signers]' > /app/signers.toml && \
    echo '' >> /app/signers.toml && \
    echo '[[signers.wallets]]' >> /app/signers.toml && \
    echo 'name = "wavetek-fee-payer"' >> /app/signers.toml && \
    echo 'keypair_env = "KORA_FEE_PAYER_KEYPAIR"' >> /app/signers.toml && \
    echo 'max_lamports_per_tx = 10000000' >> /app/signers.toml && \
    echo 'daily_limit = 100000000000' >> /app/signers.toml && \
    echo 'enabled = true' >> /app/signers.toml && \
    echo 'priority = 1' >> /app/signers.toml

# Expose port
EXPOSE 8080

# Start Kora with embedded config
CMD ["rpc", "start", "--config", "/app/kora.toml", "--signers-config", "/app/signers.toml"]
