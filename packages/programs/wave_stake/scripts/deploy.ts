import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";

// Configure provider
const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const program = anchor.workspace.WaveStake;

// Program ID
const PROGRAM_ID = new PublicKey("5fJF7FV29wZG6Azg1GLesEQVnGFdWHkFiauBaLCkqFZJ");

// Pool configurations
const POOLS = [
  {
    id: "wave",
    stakeMint: new PublicKey("So11111111111111111111111111111111111111112"), // Wrapped SOL
    lstMint: new PublicKey("So11111111111111111111111111111111111111112"), // wvSOL
    rewardMint: new PublicKey("So11111111111111111111111111111111111111112"), // WEALTH (to be deployed)
    rewardPerSecond: new anchor.BN(316880), // ~10 tokens per day
    lockDuration: new anchor.BN(2592000), // 30 days
    lockBonusPercentage: 5000, // 50% bonus
  },
  {
    id: "wealth",
    stakeMint: new PublicKey("So11111111111111111111111111111111111111112"), // WEALTH (to be deployed)
    lstMint: new PublicKey("So11111111111111111111111111111111111111112"), // sWEALTH
    rewardMint: new PublicKey("So11111111111111111111111111111111111111112"), // WAVE (to be deployed)
    rewardPerSecond: new anchor.BN(316880),
    lockDuration: new anchor.BN(2592000),
    lockBonusPercentage: 5000,
  },
];

async function main() {
  console.log("🚀 WaveSwap Staking Program Deployment");
  console.log("Network:", provider.connection.rpcEndpoint);
  console.log("Program ID:", PROGRAM_ID.toString());
  console.log();

  // Step 1: Initialize global state
  console.log("Step 1: Initializing global state...");

  const authority = provider.wallet.publicKey;
  const [globalStatePDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    PROGRAM_ID
  );

  try {
    const tx = await program.methods
      .initialize(authority)
      .accounts({
        globalState: globalStatePDA,
        payer: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("✅ Global state initialized");
    console.log("   Transaction:", tx);
    console.log("   Authority:", authority.toString());
  } catch (err) {
    if (err.toString().includes("already in use")) {
      console.log("✅ Global state already initialized");
    } else {
      console.error("❌ Error initializing global state:", err);
      return;
    }
  }
  console.log();

  // Step 2: Create pools
  console.log("Step 2: Creating pools...");

  for (const poolConfig of POOLS) {
    console.log(`   Creating pool: ${poolConfig.id}`);

    const poolId = Buffer.from(poolConfig.id, "utf8");
    const poolIdPadded = Buffer.alloc(32);
    poolId.copy(poolIdPadded);
    poolIdPadded.fill(0, poolId.length);

    const [poolPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), poolIdPadded],
      PROGRAM_ID
    );

    try {
      const tx = await program.methods
        .createPool(
          Array.from(poolIdPadded),
          poolConfig.stakeMint,
          poolConfig.lstMint,
          poolConfig.rewardMint,
          poolConfig.rewardPerSecond,
          poolConfig.lockDuration,
          poolConfig.lockBonusPercentage
        )
        .accounts({
          globalState: globalStatePDA,
          pool: poolPDA,
          payer: provider.wallet.publicKey,
          authority: authority,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log(`   ✅ Pool '${poolConfig.id}' created`);
      console.log(`      Transaction: ${tx}`);
      console.log(`      Address: ${poolPDA.toString()}`);
      console.log(`      Reward Rate: ${poolConfig.rewardPerSecond.toString()} per second`);
      console.log(`      Lock Duration: ${poolConfig.lockDuration.toString()} seconds (30 days)`);
      console.log(`      Lock Bonus: ${poolConfig.lockBonusPercentage / 100}%`);
    } catch (err) {
      if (err.toString().includes("already in use")) {
        console.log(`   ✅ Pool '${poolConfig.id}' already exists`);
      } else {
        console.error(`   ❌ Error creating pool '${poolConfig.id}':`, err);
      }
    }
    console.log();
  }

  // Step 3: Display summary
  console.log("✅ Deployment complete!");
  console.log();
  console.log("📊 Summary:");
  console.log(`   Program ID: ${PROGRAM_ID.toString()}`);
  console.log(`   Global State: ${globalStatePDA.toString()}`);
  console.log(`   Total Pools: ${POOLS.length}`);
  console.log();
  console.log("📝 Pool Addresses:");
  for (const poolConfig of POOLS) {
    const poolId = Buffer.from(poolConfig.id, "utf8");
    const poolIdPadded = Buffer.alloc(32);
    poolId.copy(poolIdPadded);
    poolIdPadded.fill(0, poolId.length);

    const [poolPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), poolIdPadded],
      PROGRAM_ID
    );

    console.log(`   ${poolConfig.id}: ${poolPDA.toString()}`);
  }
  console.log();
  console.log("🎉 Ready for staking!");
  console.log();
  console.log("Next steps:");
  console.log("   1. Test staking operations");
  console.log("   2. Integrate with yield protocols (Sanctum, Meteora, Kamino)");
  console.log("   3. Build frontend UI");
}

main().catch((err) => {
  console.error("Deployment failed:", err);
  process.exit(1);
});
