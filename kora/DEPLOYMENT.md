# WAVETEK Kora Deployment Guide

Kora is a **self-hosted Rust server** that enables gasless transactions for OceanVault privacy withdrawals. Since Vercel only supports JavaScript/TypeScript serverless functions, Kora must be deployed as a **separate service**.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        VERCEL (waveswap-ui)                     │
│  ┌─────────────┐                                                │
│  │  Next.js    │  NEXT_PUBLIC_KORA_RPC_URL                     │
│  │  Frontend   │ ────────────────────────────────────┐         │
│  └─────────────┘                                     │         │
└──────────────────────────────────────────────────────│─────────┘
                                                       │
                                                       ▼
                              ┌────────────────────────────────┐
                              │     KORA SERVER (Separate)     │
                              │  Railway / Render / Fly.io     │
                              │                                │
                              │  - signAndSendTransaction      │
                              │  - getPayerSigner              │
                              │  - getBlockhash                │
                              └────────────────────────────────┘
                                           │
                                           ▼
                              ┌────────────────────────────────┐
                              │     SOLANA DEVNET / MAINNET    │
                              └────────────────────────────────┘
```

## Deployment Options

### Option 1: Railway (Recommended for simplicity)

1. **Create Railway Account**: https://railway.app

2. **Deploy via GitHub**:
   ```bash
   # Push the kora/ directory to your repo
   git add kora/
   git commit -m "Add Kora configuration"
   git push
   ```

3. **Configure Railway**:
   - Create new project from GitHub repo
   - Set root directory to `kora/`
   - Add environment variables:
     ```
     RUST_LOG=info
     ```
   - Mount secret for `fee-payer.json` keypair

4. **Get the public URL** (e.g., `https://wavetek-kora.up.railway.app`)

### Option 2: Render

1. **Create Render Account**: https://render.com

2. **Create Web Service**:
   - Connect GitHub repo
   - Select Docker runtime
   - Set root directory to `kora/`

3. **Configure**:
   - Instance Type: Starter ($7/month) or higher
   - Add secret file for `fee-payer.json`

4. **Get the public URL** (e.g., `https://wavetek-kora.onrender.com`)

### Option 3: Fly.io

1. **Install Fly CLI**:
   ```bash
   curl -L https://fly.io/install.sh | sh
   fly auth login
   ```

2. **Create fly.toml**:
   ```toml
   app = "wavetek-kora"
   primary_region = "iad"

   [build]
     dockerfile = "Dockerfile"

   [http_service]
     internal_port = 8080
     force_https = true
     auto_stop_machines = false
     auto_start_machines = true
   ```

3. **Deploy**:
   ```bash
   cd kora/
   fly launch
   fly secrets set KORA_FEE_PAYER_KEYPAIR="$(cat fee-payer.json)"
   fly deploy
   ```

4. **Get the public URL** (e.g., `https://wavetek-kora.fly.dev`)

### Option 4: Docker on VPS (AWS/GCP/DigitalOcean)

1. **Provision a VPS** (Ubuntu 22.04 recommended)

2. **Install Docker**:
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER
   ```

3. **Deploy**:
   ```bash
   git clone <your-repo>
   cd oceanvault/kora/

   # Create fee payer keypair
   solana-keygen new -o fee-payer.json --no-bip39-passphrase

   # Fund the fee payer on devnet
   solana airdrop 5 $(solana-keygen pubkey fee-payer.json) --url devnet

   # Start Kora
   docker-compose up -d
   ```

4. **Setup HTTPS** (using Caddy or nginx):
   ```bash
   # Install Caddy
   sudo apt install -y caddy

   # Create Caddyfile
   echo "kora.yourdomain.com {
       reverse_proxy localhost:8080
   }" | sudo tee /etc/caddy/Caddyfile

   sudo systemctl restart caddy
   ```

## Local Development

For local testing before deployment:

```bash
cd kora/

# Generate fee payer keypair
solana-keygen new -o fee-payer.json --no-bip39-passphrase

# Fund on devnet
solana airdrop 5 $(solana-keygen pubkey fee-payer.json) --url devnet

# Start with Docker Compose
docker-compose up

# OR start manually
docker run -v $(pwd)/kora.toml:/app/kora.toml \
  -v $(pwd)/signers.toml:/app/signers.toml \
  -v $(pwd)/fee-payer.json:/app/fee-payer.json \
  -p 8080:8080 \
  ghcr.io/solana-foundation/kora:latest \
  rpc start --signers-config /app/signers.toml
```

Test the connection:
```bash
curl -X POST http://localhost:8080 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getPayerSigner","params":[]}'
```

## Vercel Frontend Configuration

Once Kora is deployed, configure your Vercel project:

### 1. Add Environment Variable

In Vercel Dashboard → Settings → Environment Variables:

| Name | Value | Environment |
|------|-------|-------------|
| `NEXT_PUBLIC_KORA_RPC_URL` | `https://your-kora-server.com` | Production |
| `NEXT_PUBLIC_KORA_RPC_URL` | `http://localhost:8080` | Development |

### 2. SDK Integration

The SDK already supports Kora via environment variables:

```typescript
// sdk/react/hooks/usePERPrivacyFlow.ts
const KORA_RPC_URL = process.env.NEXT_PUBLIC_KORA_RPC_URL
  || process.env.KORA_RPC_URL
  || "http://localhost:8080";
```

### 3. Usage in Frontend

```typescript
import { usePERPrivacyFlow } from "@oceanvault/sdk/react";

function WithdrawButton({ escrow }) {
  const { claimWithKora, isLoading } = usePERPrivacyFlow();

  const handleWithdraw = async () => {
    // Receiver pays NOTHING - Kora covers the tx fee
    const result = await claimWithKora({
      outputEscrowPda: escrow.pubkey,
      receiverPubkey: wallet.publicKey,
      sharedSecret: escrow.sharedSecret,
    });

    console.log("Withdrawn:", result.signature);
  };

  return (
    <button onClick={handleWithdraw} disabled={isLoading}>
      Withdraw (Gasless)
    </button>
  );
}
```

## Security Considerations

### Fee Payer Wallet

1. **Use a dedicated wallet** - Never use your main wallet as fee payer
2. **Limit funding** - Keep only enough SOL for expected transaction volume
3. **Monitor balance** - Set up alerts when balance drops below threshold
4. **Rotate keys** - Periodically rotate the fee payer keypair

### Rate Limiting

Consider adding rate limiting to prevent abuse:

```toml
# In kora.toml
[rate_limit]
requests_per_minute = 100
requests_per_hour = 1000
```

### IP Allowlisting

For production, restrict to your Vercel deployment IPs:

```toml
# In kora.toml
[security]
allowed_origins = [
    "https://waveswap.vercel.app",
    "https://your-domain.com",
]
```

## Monitoring

### Health Check Endpoint

Kora exposes a health check at `/health`:

```bash
curl https://your-kora-server.com/health
```

### Logging

View logs in your deployment platform or via Docker:

```bash
docker-compose logs -f kora
```

### Metrics

For production monitoring, consider:
- Prometheus + Grafana for metrics
- Sentry for error tracking
- UptimeRobot for availability monitoring

## Troubleshooting

### "Connection refused"
- Verify Kora is running: `docker-compose ps`
- Check port is exposed: `netstat -tlnp | grep 8080`
- Verify firewall rules allow inbound traffic

### "Fee payer has insufficient funds"
- Check fee payer balance: `solana balance $(solana-keygen pubkey fee-payer.json)`
- Airdrop on devnet: `solana airdrop 5 <pubkey> --url devnet`
- For mainnet, transfer SOL from another wallet

### "Program not in allowed list"
- Verify `4jFg8uSh4jWkeoz6itdbsD7GadkTYLwfbyfDeNeB5nFX` is in `allowed_programs`
- Restart Kora after config changes

### "CORS error"
- Add your frontend URL to `cors_origins` in `kora.toml`
- Restart Kora: `docker-compose restart`

## Cost Estimation

For devnet: Free (airdrop SOL)

For mainnet:
- Each withdrawal tx: ~5,000 lamports (~$0.001 at $150/SOL)
- 1,000 withdrawals/day: ~$1/day
- Recommended buffer: Keep 1-5 SOL in fee payer

## Summary

| Platform | Difficulty | Cost | Recommended For |
|----------|------------|------|-----------------|
| Railway | Easy | $5+/month | Quick start |
| Render | Easy | $7+/month | Production |
| Fly.io | Medium | $0-5/month | Cost-sensitive |
| VPS + Docker | Hard | $5+/month | Full control |

For waveswap-ui on Vercel:
1. Deploy Kora to Railway/Render (easiest)
2. Get public URL
3. Set `NEXT_PUBLIC_KORA_RPC_URL` in Vercel
4. Privacy withdrawals now work gaslessly!
