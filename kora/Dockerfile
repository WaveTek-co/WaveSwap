# WAVETEK Kora Dockerfile
FROM ghcr.io/solana-foundation/kora:latest

WORKDIR /app

# COPY config files (changes to these files invalidate Docker cache)
COPY kora.toml /app/kora.toml
COPY signers.docker.toml /app/signers.toml

EXPOSE 8080

ENTRYPOINT ["kora"]
CMD ["--config", "/app/kora.toml", "rpc", "start", "--signers-config", "/app/signers.toml"]
