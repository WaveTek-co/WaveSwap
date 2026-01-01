#!/bin/bash

# Create Devnet SPL Tokens for Testing
# This script creates WAVE, WEALTH, ZEC, and GOLD tokens on devnet

set -e

RPC_URL="https://api.devnet.solana.com"
KEYPAIR_DIR=".keys/devnet-tokens"
AUTHORITY_KEYPAIR=".keys/authority-keypair.json"

echo "🪙 Creating Devnet SPL Tokens..."
echo ""

# Create WAVE token (6 decimals like mainnet WAVE)
echo "📦 Creating WAVE token..."
WAVE_MINT=$(spl-token create-token \
  --url $RPC_URL \
  --decimals 6 \
  --output json | jq -r '.mintAddress')

echo "✅ WAVE token created: $WAVE_MINT"
echo "$WAVE_MINT" > $KEYPAIR_DIR/wave-mint.txt
echo ""

sleep 2

# Create WEALTH token (6 decimals)
echo "📦 Creating WEALTH token..."
WEALTH_MINT=$(spl-token create-token \
  --url $RPC_URL \
  --decimals 6 \
  --output json | jq -r '.mintAddress')

echo "✅ WEALTH token created: $WEALTH_MINT"
echo "$WEALTH_MINT" > $KEYPAIR_DIR/wealth-mint.txt
echo ""

sleep 2

# Create GOLD token (8 decimals)
echo "📦 Creating GOLD token..."
GOLD_MINT=$(spl-token create-token \
  --url $RPC_URL \
  --decimals 8 \
  --output json | jq -r '.mintAddress')

echo "✅ GOLD token created: $GOLD_MINT"
echo "$GOLD_MINT" > $KEYPAIR_DIR/gold-mint.txt
echo ""

sleep 2

# Create ZEC token (8 decimals)
echo "📦 Creating ZEC token..."
ZEC_MINT=$(spl-token create-token \
  --url $RPC_URL \
  --decimals 8 \
  --output json | jq -r '.mintAddress')

echo "✅ ZEC token created: $ZEC_MINT"
echo "$ZEC_MINT" > $KEYPAIR_DIR/zec-mint.txt
echo ""

# Mint tokens to authority wallet for testing
echo "💰 Minting tokens to authority wallet..."

# Mint 1,000,000 WAVE
spl-token mint $WAVE_MINT 1000000000000 --url $RPC_URL >/dev/null 2>&1
echo "✅ Minted 1,000,000 WAVE"

# Mint 1,000,000 WEALTH
spl-token mint $WEALTH_MINT 1000000000000 --url $RPC_URL >/dev/null 2>&1
echo "✅ Minted 1,000,000 WEALTH"

# Mint 10 GOLD (8 decimals)
spl-token mint $GOLD_MINT 1000000000 --url $RPC_URL >/dev/null 2>&1
echo "✅ Minted 10 GOLD"

# Mint 10 ZEC (8 decimals)
spl-token mint $ZEC_MINT 1000000000 --url $RPC_URL >/dev/null 2>&1
echo "✅ Minted 10 ZEC"

echo ""
echo "🎉 All tokens created and minted successfully!"
echo ""
echo "📋 Token Mint Addresses:"
echo "  WAVE:   $WAVE_MINT (6 decimals)"
echo "  WEALTH: $WEALTH_MINT (6 decimals)"
echo "  GOLD:   $GOLD_MINT (8 decimals)"
echo "  ZEC:    $ZEC_MINT (8 decimals)"
echo ""
echo "💡 Mint more tokens with:"
echo "  spl-token mint <MINT_ADDRESS> <AMOUNT> --url devnet"
