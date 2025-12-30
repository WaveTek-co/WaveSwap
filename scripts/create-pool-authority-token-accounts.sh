#!/bin/bash

# Create token accounts for the pool authority to receive staked tokens

POOL_AUTHORITY="8uSHCQQDycVbjj2qMLm8qS2zKUdgFfN2JEsqWvzUdqEz"

echo "Creating token accounts for pool authority..."
echo ""

# WAVE token account
echo "=== Creating WAVE token account ==="
spl-token create-account 6D6DjjiwtWPMCb2tkRVuTDi5esUu2rzHnhpE6z3nyskE --owner $POOL_AUTHORITY --fee-payer ~/.config/solana/id.json --url devnet
echo ""

# WEALTH token account
echo "=== Creating WEALTH token account ==="
spl-token create-account Diz52amvNsWFWrA8WnwQMVxSL5asMqL8MhZVSBk8TWcz --owner $POOL_AUTHORITY --fee-payer ~/.config/solana/id.json --url devnet
echo ""

# GOLD token account
echo "=== Creating GOLD token account ==="
spl-token create-account CuEXgJtrPav6otWubGPMjWVe768CGpuRDDXE1XeR4QJK --owner $POOL_AUTHORITY --fee-payer ~/.config/solana/id.json --url devnet
echo ""

# ZEC token account
echo "=== Creating ZEC token account ==="
spl-token create-account 7kHuXpDPfxRss5bhADeqQR27jcXMA7AMiVdWhwF4Cjjz --owner $POOL_AUTHORITY --fee-payer ~/.config/solana/id.json --url devnet
echo ""

echo "✅ Token accounts created successfully!"
