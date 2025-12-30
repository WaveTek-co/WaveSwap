#!/bin/bash

# Script to create token vaults for existing WaveStake pools
# Each vault is a token account owned by the pool's vault PDA

WAVE_STAKE_PROGRAM_ID="5fJF7FV29wZG6Azg1GLesEQVnGFdWHkFiauBaLCkqFZJ"

echo "Creating vaults for WaveStake pools..."
echo ""

# WAVE pool vault
echo "=== Creating WAVE pool vault ==="
WAVE_VAULT_PDA=$(solana program derive-buffer-pda $WAVE_STAKE_PROGRAM_ID "vault" "wave" --url devnet | grep "Buffer Address" | awk '{print $3}')
echo "WAVE Vault PDA: $WAVE_VAULT_PDA"
spl-token create-account 6D6DjjiwtWPMCb2tkRVuTDi5esUu2rzHnhpE6z3nyskE --owner $WAVE_VAULT_PDA --fee-payer ~/.config/solana/id.json --url devnet
echo ""

# WEALTH pool vault
echo "=== Creating WEALTH pool vault ==="
WEALTH_VAULT_PDA=$(solana program derive-buffer-pda $WAVE_STAKE_PROGRAM_ID "vault" "wealth" --url devnet | grep "Buffer Address" | awk '{print $3}')
echo "WEALTH Vault PDA: $WEALTH_VAULT_PDA"
spl-token create-account Diz52amvNsWFWrA8WnwQMVxSL5asMqL8MhZVSBk8TWcz --owner $WEALTH_VAULT_PDA --fee-payer ~/.config/solana/id.json --url devnet
echo ""

# GOLD pool vault
echo "=== Creating GOLD pool vault ==="
GOLD_VAULT_PDA=$(solana program derive-buffer-pda $WAVE_STAKE_PROGRAM_ID "vault" "gold" --url devnet | grep "Buffer Address" | awk '{print $3}')
echo "GOLD Vault PDA: $GOLD_VAULT_PDA"
spl-token create-account CuEXgJtrPav6otWubGPMjWVe768CGpuRDDXE1XeR4QJK --owner $GOLD_VAULT_PDA --fee-payer ~/.config/solana/id.json --url devnet
echo ""

# ZEC pool vault
echo "=== Creating ZEC pool vault ==="
ZEC_VAULT_PDA=$(solana program derive-buffer-pda $WAVE_STAKE_PROGRAM_ID "vault" "zec" --url devnet | grep "Buffer Address" | awk '{print $3}')
echo "ZEC Vault PDA: $ZEC_VAULT_PDA"
spl-token create-account 7kHuXpDPfxRss5bhADeqQR27jcXMA7AMiVdWhwF4Cjjz --owner $ZEC_VAULT_PDA --fee-payer ~/.config/solana/id.json --url devnet
echo ""

echo "Vaults created successfully!"
