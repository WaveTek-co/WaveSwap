# WAVETEK Kora Dockerfile
FROM ghcr.io/solana-foundation/kora:latest

WORKDIR /app

# Create kora.toml with all required fields
RUN echo '[kora]' > /app/kora.toml && \
    echo 'rate_limit = 1000' >> /app/kora.toml && \
    echo 'liveness = true' >> /app/kora.toml && \
    echo '' >> /app/kora.toml && \
    echo '[kora.enabled_methods]' >> /app/kora.toml && \
    echo 'sign_and_send_transaction = true' >> /app/kora.toml && \
    echo 'sign_transaction = true' >> /app/kora.toml && \
    echo 'sign_all_transactions = true' >> /app/kora.toml && \
    echo 'get_payer_signer = true' >> /app/kora.toml && \
    echo 'get_blockhash = true' >> /app/kora.toml && \
    echo 'estimate_transaction_fee = true' >> /app/kora.toml && \
    echo 'get_config = true' >> /app/kora.toml && \
    echo 'transfer_transaction = true' >> /app/kora.toml && \
    echo '' >> /app/kora.toml && \
    echo '[validation]' >> /app/kora.toml && \
    echo 'max_allowed_lamports = 10000000' >> /app/kora.toml && \
    echo 'max_signatures = 10' >> /app/kora.toml && \
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
    echo '[metrics]' >> /app/kora.toml && \
    echo 'enabled = false' >> /app/kora.toml

# Create signers.toml
RUN echo '[signer_pool]' > /app/signers.toml && \
    echo 'strategy = "round_robin"' >> /app/signers.toml && \
    echo '' >> /app/signers.toml && \
    echo '[[signers]]' >> /app/signers.toml && \
    echo 'name = "wavetek-fee-payer"' >> /app/signers.toml && \
    echo 'type = "memory"' >> /app/signers.toml && \
    echo 'private_key_env = "KORA_PRIVATE_KEY"' >> /app/signers.toml && \
    echo 'weight = 1' >> /app/signers.toml

EXPOSE 8080

ENTRYPOINT ["kora"]
CMD ["--config", "/app/kora.toml", "rpc", "start", "--signers-config", "/app/signers.toml"]
