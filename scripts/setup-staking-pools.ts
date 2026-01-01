/**
 * Setup Script for WaveStake Pools on Devnet
 *
 * This script will:
 * 1. Initialize the global state
 * 2. Create pools for WAVE, WEALTH, and SOL
 *
 * Run with: bun scripts/setup-staking-pools.ts
 */

import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js'
import { createHash } from 'crypto'

// Program ID
const PROGRAM_ID = new PublicKey('5fJF7FV29wZG6Azg1GLesEQVnGFdWHkFiauBaLCkqFZJ')

// Devnet RPC
const RPC_URL = process.env.RPC_URL || 'https://api.devnet.solana.com'

// Pool configurations
const POOLS = [
  {
    poolId: 'wave',
    stakeMint: new PublicKey('4AGxpKxYnw7g1ofvYDs5Jq2a1ek5kB9jS2NTUaippump'),
    lstMint: new PublicKey('So11111111111111111111111111111111111111112'),
    rewardMint: new PublicKey('4AGxpKxYnw7g1ofvYDs5Jq2a1ek5kB9jS2NTUaippump'),
    rewardPerSecond: 1000000,
    lockDuration: 2592000,
    lockBonusPercentage: 5000,
  },
  {
    poolId: 'wealth',
    stakeMint: new PublicKey('BSxPC3Vu3X6UCtEEAYyhxAEo3rvtS4dgzzrvnERDpump'),
    lstMint: new PublicKey('So11111111111111111111111111111111111111112'),
    rewardMint: new PublicKey('BSxPC3Vu3X6UCtEEAYyhxAEo3rvtS4dgzzrvnERDpump'),
    rewardPerSecond: 1000000,
    lockDuration: 2592000,
    lockBonusPercentage: 5000,
  },
  {
    poolId: 'sol',
    stakeMint: new PublicKey('So11111111111111111111111111111111111111112'),
    lstMint: new PublicKey('So11111111111111111111111111111111111111112'),
    rewardMint: new PublicKey('So11111111111111111111111111111111111111112'),
    rewardPerSecond: 1000000,
    lockDuration: 2592000,
    lockBonusPercentage: 5000,
  },
]

// Helper to create instruction discriminator (8 bytes)
function createDiscriminator(name: string): Buffer {
  const preimage = `global:${name}`
  return createHash('sha256').update(preimage).digest().slice(0, 8)
}

// Helper to encode public key
function encodePublicKey(pubkey: PublicKey): Buffer {
  return Buffer.from(pubkey.toBytes())
}

// Helper to encode u64
function encodeU64(value: number): Buffer {
  const buffer = Buffer.alloc(8)
  buffer.writeBigUInt64LE(BigInt(value))
  return buffer
}

// Helper to encode u16
function encodeU16(value: number): Buffer {
  const buffer = Buffer.alloc(2)
  buffer.writeUInt16LE(value)
  return buffer
}

async function setupPools() {
  console.log('🚀 Starting WaveStake Pool Setup on Devnet\n')

  // Connect to devnet
  const connection = new Connection(RPC_URL, 'confirmed')
  console.log(`✅ Connected to ${RPC_URL}`)

  // Load authority keypair
  const fs = require('fs')
  const path = require('path')
  const keypairPath = process.env.AUTHORITY_KEYPAIR_PATH || path.join(__dirname, '../packages/programs/wave_stake/.keys/authority-keypair.json')

  let authority: Keypair
  if (fs.existsSync(keypairPath)) {
    const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'))
    authority = Keypair.fromSecretKey(Uint8Array.from(keypairData))
    console.log(`✅ Loaded authority keypair`)
  } else {
    console.log('❌ Authority keypair not found!')
    process.exit(1)
  }

  console.log(`Authority: ${authority.publicKey.toString()}\n`)

  // PDAs
  const [globalState] = PublicKey.findProgramAddressSync(
    [Buffer.from('global')],
    PROGRAM_ID
  )

  try {
    // Step 1: Initialize Global State
    console.log('📝 Step 1: Initializing Global State...')

    try {
      const ix = new TransactionInstruction({
        keys: [
          { pubkey: globalState, isSigner: false, isWritable: true },
          { pubkey: authority.publicKey, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: Buffer.concat([
          createDiscriminator('initialize'),
          encodePublicKey(authority.publicKey),
        ]),
      })

      const tx = new Transaction().add(ix)
      const { blockhash } = await connection.getLatestBlockhash()
      tx.recentBlockhash = blockhash
      tx.feePayer = authority.publicKey

      const signature = await connection.sendTransaction(tx, [authority])
      await connection.confirmTransaction(signature, 'confirmed')

      console.log(`✅ Global state initialized!`)
      console.log(`   Signature: ${signature}\n`)
    } catch (error: any) {
      if (error.toString().includes('already in use') || error.toString().includes('AccountAlreadyInitialized')) {
        console.log('⚠️  Global state already initialized\n')
      } else {
        console.error('Error initializing global state:', error.message)
        throw error
      }
    }

    // Step 2: Create Pools
    for (const pool of POOLS) {
      console.log(`📝 Creating pool: ${pool.poolId.toUpperCase()}`)

      // Derive pool PDA
      const poolIdBytes = Buffer.alloc(32)
      Buffer.from(pool.poolId).copy(poolIdBytes)

      const [poolPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('pool'), poolIdBytes],
        PROGRAM_ID
      )

      try {
        const data = Buffer.concat([
          createDiscriminator('create_pool'),
          poolIdBytes,
          encodePublicKey(pool.stakeMint),
          encodePublicKey(pool.lstMint),
          encodePublicKey(pool.rewardMint),
          encodeU64(pool.rewardPerSecond),
          encodeU64(pool.lockDuration),
          encodeU16(pool.lockBonusPercentage),
        ])

        const ix = new TransactionInstruction({
          keys: [
            { pubkey: globalState, isSigner: false, isWritable: true },
            { pubkey: poolPda, isSigner: false, isWritable: true },
            { pubkey: authority.publicKey, isSigner: true, isWritable: true },
            { pubkey: authority.publicKey, isSigner: true, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          programId: PROGRAM_ID,
          data,
        })

        const tx = new Transaction().add(ix)
        const { blockhash } = await connection.getLatestBlockhash()
        tx.recentBlockhash = blockhash
        tx.feePayer = authority.publicKey

        const signature = await connection.sendTransaction(tx, [authority])
        await connection.confirmTransaction(signature, 'confirmed')

        console.log(`✅ Pool ${pool.poolId.toUpperCase()} created!`)
        console.log(`   Pool Address: ${poolPda.toString()}`)
        console.log(`   Signature: ${signature}\n`)
      } catch (error: any) {
        if (error.toString().includes('already in use') || error.toString().includes('AccountAlreadyInitialized')) {
          console.log(`⚠️  Pool ${pool.poolId.toUpperCase()} already exists\n`)
        } else {
          console.error(`❌ Error creating pool ${pool.poolId}:`, error.message)
          console.log('')
        }
      }
    }

    console.log('🎉 Pool setup complete!')
    console.log('\n📊 Pool Summary:')
    console.log('─'.repeat(50))

    for (const pool of POOLS) {
      const poolIdBytes = Buffer.alloc(32)
      Buffer.from(pool.poolId).copy(poolIdBytes)

      const [poolPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('pool'), poolIdBytes],
        PROGRAM_ID
      )

      console.log(`${pool.poolId.toUpperCase()}:`)
      console.log(`  Address: ${poolPda.toString()}`)
      console.log(`  Stake Mint: ${pool.stakeMint.toString()}`)
      console.log(`  Reward: ${pool.rewardPerSecond / 1e6} per second`)
      console.log(`  Lock Duration: ${pool.lockDuration / 86400} days`)
      console.log(`  Bonus: ${pool.lockBonusPercentage / 100}%`)
      console.log('')
    }

    console.log('✨ You can now use the WaveStake frontend!')

  } catch (error) {
    console.error('❌ Error during setup:', error)
    process.exit(1)
  }
}

// Run the setup
setupPools()
  .then(() => {
    console.log('\n✅ Setup completed successfully!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Setup failed:', error)
    process.exit(1)
  })
