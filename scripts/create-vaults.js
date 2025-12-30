const { Connection, PublicKey, Keypair, SystemProgram, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID, createInitializeAccountInstruction, getAccountLen } = require('@solana/spl-token');
const fs = require('fs');

const connection = new Connection('https://api.devnet.solana.com');

// Load payer keypair
const payerSecretKey = JSON.parse(fs.readFileSync('/Users/vivek/.config/solana/id.json', 'utf-8'));
const payer = Keypair.fromSecretKey(new Uint8Array(payerSecretKey));

const WAVE_STAKE_PROGRAM_ID = new PublicKey('5fJF7FV29wZG6Azg1GLesEQVnGFdWHkFiauBaLCkqFZJ');

// Pool configurations
const pools = [
  { id: 'wave', mint: '6D6DjjiwtWPMCb2tkRVuTDi5esUu2rzHnhpE6z3nyskE' },
  { id: 'wealth', mint: 'Diz52amvNsWFWrA8WnwQMVxSL5asMqL8MhZVSBk8TWcz' },
  { id: 'gold', mint: 'CuEXgJtrPav6otWubGPMjWVe768CGpuRDDXE1XeR4QJK' },
  { id: 'zec', mint: '7kHuXpDPfxRss5bhADeqQR27jcXMA7AMiVdWhwF4Cjjz' },
];

async function getVaultPDA(poolId) {
  const poolIdBuffer = Buffer.alloc(32);
  Buffer.from(poolId).copy(poolIdBuffer);

  const [vaultPda] = await PublicKey.findProgramAddress(
    [Buffer.from('vault'), poolIdBuffer],
    WAVE_STAKE_PROGRAM_ID
  );

  return vaultPda;
}

async function createVault(poolId, mintAddress) {
  console.log(`\n=== Creating vault for pool: ${poolId} ===`);

  try {
    // Get vault PDA
    const vaultPda = await getVaultPDA(poolId);
    console.log(`Vault PDA: ${vaultPda.toBase58()}`);

    const mint = new PublicKey(mintAddress);

    // Check if vault already exists
    const vaultAccount = await connection.getAccountInfo(vaultPda);
    if (vaultAccount) {
      console.log('✅ Vault already exists, skipping...');
      return;
    }

    // Create vault keypair
    const vaultKeypair = Keypair.generate();
    const accountLen = getAccountLen(mint);

    console.log(`Creating token account at ${vaultKeypair.publicKey.toBase58()}`);

    // Calculate minimum balance for rent exemption
    const lamports = await connection.getMinimumBalanceForRentExemption(accountLen);

    const transaction = new Transaction();

    // 1. Create account
    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: vaultKeypair.publicKey,
        space: accountLen,
        lamports,
        programId: TOKEN_PROGRAM_ID,
      })
    );

    // 2. Initialize token account
    transaction.add(
      createInitializeAccountInstruction(
        vaultKeypair.publicKey,
        mint,
        vaultPda, // PDA as owner (but this won't work - PDA can't sign!)
        TOKEN_PROGRAM_ID
      )
    );

    // Send transaction
    const signature = await sendAndConfirmTransaction(connection, transaction, [payer, vaultKeypair]);
    console.log(`✅ Vault created! Signature: ${signature}`);

    // NOTE: The vault was created but has PDA as owner which can't sign
    // We need to use the pool authority as owner instead
    // Or use a different approach

  } catch (error) {
    console.error(`❌ Error creating vault: ${error.message}`);
  }
}

async function main() {
  console.log('Creating vaults for WaveStake pools...');

  for (const pool of pools) {
    await createVault(pool.id, pool.mint);
  }

  console.log('\n✨ Done!');
}

main().catch(console.error);
