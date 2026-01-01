import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { readFileSync } from "fs";
import { join } from "path";

// Load program IDL manually
const idlPath = join(__dirname, "../src/idl.json");
const idl = JSON.parse(readFileSync(idlPath, "utf-8"));

// Configure provider
const wallet = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(readFileSync(join(__dirname, "../.keys/deployer-keypair.json"), "utf-8")))
);

const connection = new anchor.web3.Connection("https://api.devnet.solana.com");
const provider = new anchor.AnchorProvider(
  connection,
  new anchor.Wallet(wallet),
  { commitment: "confirmed" }
);

const program = new anchor.Program(idl, new PublicKey("5fJF7FV29wZG6Azg1GLesEQVnGFdWHkFiauBaLCkqFZJ"), provider);

async function getBalance(pubkey: PublicKey) {
  return await connection.getBalance(pubkey) / LAMPORTS_PER_SOL;
}

async function main() {
  console.log("🧪 WaveSwap Staking Program - Manual Test");
  console.log("Network: Devnet");
  console.log("Authority:", wallet.publicKey.toString());
  console.log("Balance:", (await getBalance(wallet.publicKey)).toFixed(2), "SOL");
  console.log();

  // Global state PDA
  const [globalStatePDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    program.programId
  );

  // Pool: WAVE
  const poolId = Buffer.alloc(32);
  Buffer.from("wave").copy(poolId);
  const [poolPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), poolId],
    program.programId
  );

  // User account
  const [userPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("user"), poolId, wallet.publicKey.toBuffer()],
    program.programId
  );

  try {
    // Test 1: Initialize Global State
    console.log("Test 1: Initialize Global State");
    console.log("   Creating global state account...");

    const initTx = await program.methods
      .initialize(wallet.publicKey)
      .accounts({
        globalState: globalStatePDA,
        payer: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("   ✅ Success! Transaction:", initTx);
    console.log();
  } catch (err) {
    console.log("   ℹ️  Already initialized or error:", err.message);
    console.log();
  }

  try {
    // Test 2: Create Pool
    console.log("Test 2: Create WAVE Pool");
    console.log("   Creating staking pool...");

    const createPoolTx = await program.methods
      .createPool(
        Array.from(poolId),
        new PublicKey("So11111111111111111111111111111111111111112"), // Stake mint (SOL)
        new PublicKey("So11111111111111111111111111111111111111112"), // LST mint (wvSOL)
        new PublicKey("So11111111111111111111111111111111111111112"), // Reward mint
        new anchor.BN(1_000_000), // 1 token per second
        new anchor.BN(2592000), // 30 days
        5000 // 50% bonus
      )
      .accounts({
        globalState: globalStatePDA,
        pool: poolPDA,
        payer: wallet.publicKey,
        authority: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("   ✅ Pool created! Transaction:", createPoolTx);
    console.log("   Pool address:", poolPDA.toString());
    console.log();
  } catch (err) {
    console.log("   ℹ️  Pool exists or error:", err.message);
    console.log();
  }

  try {
    // Test 3: Stake Tokens (Flexible)
    console.log("Test 3: Stake Tokens (Flexible)");
    console.log("   Staking 100 tokens with no lock...");

    const stakeAmount = new anchor.BN(100 * 1e6); // 100 tokens
    const stakeTx = await program.methods
      .stake(stakeAmount, 0) // 0 = flexible
      .accounts({
        pool: poolPDA,
        user: userPDA,
        payer: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("   ✅ Staked! Transaction:", stakeTx);
    console.log("   User account:", userPDA.toString());
    console.log();
  } catch (err) {
    console.log("   ❌ Error:", err.message);
    console.log();
  }

  try {
    // Fetch user account
    const userAccount = await program.account.user.fetch(userPDA);
    console.log("Current User State:");
    console.log("   Amount:", userAccount.amount.toString());
    console.log("   Lock Type:", userAccount.lockType, "(0=flexible, 1=locked)");
    console.log("   Bonus Multiplier:", userAccount.bonusMultiplier / 100, "x");
    console.log();
  } catch (err) {
    console.log("   ℹ️  User account not found");
    console.log();
  }

  try {
    // Test 4: Unstake Tokens
    console.log("Test 4: Unstake Tokens");
    console.log("   Unstaking 50 tokens...");

    const unstakeAmount = new anchor.BN(50 * 1e6);
    const unstakeTx = await program.methods
      .unstake(unstakeAmount)
      .accounts({
        pool: poolPDA,
        user: userPDA,
        authority: wallet.publicKey,
      })
      .rpc();

    console.log("   ✅ Unstaked! Transaction:", unstakeTx);
    console.log();
  } catch (err) {
    console.log("   ❌ Error:", err.message);
    console.log();
  }

  try {
    // Fetch updated user account
    const userAccount = await program.account.user.fetch(userPDA);
    console.log("Updated User State:");
    console.log("   Amount:", userAccount.amount.toString());
    console.log();
  } catch (err) {
    console.log("   ℹ️  User account not found");
    console.log();
  }

  try {
    // Test 5: Claim Rewards
    console.log("Test 5: Claim Rewards");
    console.log("   Claiming accumulated rewards...");

    const claimTx = await program.methods
      .claimRewards()
      .accounts({
        pool: poolPDA,
        user: userPDA,
        authority: wallet.publicKey,
      })
      .rpc();

    console.log("   ✅ Rewards claimed! Transaction:", claimTx);
    console.log();
  } catch (err) {
    console.log("   ℹ️  No rewards yet or error:", err.message);
    console.log();
  }

  // Summary
  console.log("📊 Test Summary:");
  console.log("   Program ID:", program.programId.toString());
  console.log("   Global State:", globalStatePDA.toString());
  console.log("   Pool:", poolPDA.toString());
  console.log("   User:", userPDA.toString());
  console.log();
  console.log("✅ Manual testing complete!");
  console.log();
  console.log("Next steps:");
  console.log("   1. Verify accounts on Solana Explorer");
  console.log("   2. Test locked staking (lock_type=1)");
  console.log("   3. Integrate yield protocols");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
