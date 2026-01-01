const { Connection, Keypair, PublicKey, SystemProgram } = require('@solana/web3.js');
const { Program, AnchorProvider, Wallet } = require('@coral-xyz/anchor');
const IDL = require('/Users/vivek/projects/WaveTek/WaveSwap/packages/programs/wave_stake/target/idl/wave_stake.json');

// Your wallet
const WALLET_SECRET_KEY = new Uint8Array(JSON.parse(require('fs').readFileSync('/Users/vivek/.config/solana/id.json')));
const wallet = Keypair.fromSecretKey(WALLET_SECRET_KEY);

// Connection
const connection = new Connection('https://api.devnet.solana.com');
const provider = new AnchorProvider(connection, new Wallet(wallet), { commitment: 'confirmed' });

// Program
const program = new Program(IDL, new PublicKey('5fJF7FV29wZG6Azg1GLesEQVnGFdWHkFiauBaLCkqFZJ'), provider);

// Pools
const pools = {
  'sol': {
    poolPda: new PublicKey('BQw5wzQ2LhLAD8t8zE9jhZGGhe9zZdqAfgrLTJxtvBA3'),
    userPda: new PublicKey('BQw5wzQ2LhLAD8t8zE9jhZGGhe9zZdqAfgrLTJxtvBA3'),
  },
  'wave': {
    poolPda: new PublicKey('FX1JUyYMmQMdeJfUFktwP8yZ1mSUyzTdVRgH9T91j1iS'),
    userPda: new PublicKey('HeV4UXRbFeszVUheKJPNKWBZaYjEiyExCY4qvtEcsYB7'),
  },
};

async function closeUserAccount(poolId, poolPda, userPda) {
  console.log(`\n=== Closing ${poolId.toUpperCase()} user account ===`);
  console.log('Pool:', poolPda.toString());
  console.log('User:', userPda.toString());

  try {
    // Check if user account exists
    const accountInfo = await connection.getAccountInfo(userPda);
    if (!accountInfo) {
      console.log('✓ Account does not exist, skipping...');
      return;
    }
    console.log('Account exists, size:', accountInfo.data.length, 'bytes');

    // Close the account
    const tx = await program.methods
      .closeUserAccount()
      .accounts({
        pool: poolPda,
        user: userPda,
        userWallet: wallet.publicKey,
      })
      .rpc();

    console.log('✓ Closed successfully! Signature:', tx);
  } catch (error) {
    console.error('✗ Error:', error.message);
    if (error.logs) {
      console.error('Logs:', error.logs);
    }
  }
}

async function main() {
  console.log('Closing corrupted user stake accounts...\n');

  for (const [poolId, accounts] of Object.entries(pools)) {
    await closeUserAccount(poolId, accounts.poolPda, accounts.userPda);
  }

  console.log('\n✓ Done! You can now stake again and it will create fresh user accounts.');
}

main().catch(console.error);
