/**
 * Setup GOLD and ZEC Pools on WaveStake Devnet
 *
 * This script initializes GOLD and ZEC staking pools on devnet
 */

import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js'
import { createHash } from 'crypto'

const PROGRAM_ID = new PublicKey('5fJF7FV29wZG6Azg1GLesEQVnGFdWHkFiauBaLCkqFZJ')
const RPC_URL = 'https://api.devnet.solana.com'

// Devnet test tokens
const GOLD_MINT = new PublicKey('CuEXgJtrPav6otWubGPMjWVe768CGpuRDDXE1XeR4QJK')
const ZEC_MINT = new PublicKey('7kHuXpDPfxRss5bhADeqQR27jcXMA7AMiVdWhwF4Cjjz')

// Load authority keypair
const fs = require('fs')
const path = require('path')
const keypairPath = path.join(__dirname, '../packages/programs/wave_stake/.keys/authority-keypair.json')

const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, 'utf-8'))))
console.log(`Authority: ${authority.publicKey.toString()}`)

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
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64LE(BigInt(value))
  return buf
}

// Helper to get Pool PDA
function getPoolPDA(poolId: string) {
  const poolIdBytes = Buffer.alloc(32)
  Buffer.from(poolId).copy(poolIdBytes)
  return PublicKey.findProgramAddressSync(
    [Buffer.from('pool'), poolIdBytes],
    PROGRAM_ID
  )
}

async function setupPools() {
  const connection = new Connection(RPC_URL, 'confirmed')

  // Setup GOLD Pool
  console.log('\n🪙 Setting up GOLD pool...')
  await setupPool(connection, authority, 'gold', GOLD_MINT, 8, 20)

  console.log('\n💰 Setting up ZEC pool...')
  await setupPool(connection, authority, 'zec', ZEC_MINT, 8, 18)

  console.log('\n✅ All pools initialized successfully!')
}

async function setupPool(
  connection: Connection,
  authority: Keypair,
  poolId: string,
  mint: PublicKey,
  decimals: number,
  rewardPerSecond: number
) {
  const [pool] = getPoolPDA(poolId)

  // Build instruction data
  // createPool(pool_id, stake_mint, lst_mint, reward_mint, reward_per_second, lock_duration, lock_bonus_percentage)
  const data = Buffer.concat([
    createDiscriminator('createPool'),
    encodePoolId(poolId),
    encodePublicKey(mint),
    encodePublicKey(mint), // lst_mint = stake_mint for now
    encodePublicKey(mint), // reward_mint = stake_mint for now
    encodeU64(rewardPerSecond * 1000000000), // reward_per_second (scaled)
    encodeU64(0), // lock_duration (0 = no lock)
    Buffer.from([100]), // lock_bonus_percentage (100% = 1x multiplier)
  ])

  const ix = new TransactionInstruction({
    keys: [
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data,
  })

  const tx = new Transaction().add(ix)
  const { blockhash } = await connection.getLatestBlockhash()
  tx.recentBlockhash = blockhash
  tx.feePayer = authority.publicKey

  try {
    const signature = await connection.sendTransaction(tx, [authority])
    console.log(`   Signature: ${signature}`)
    await connection.confirmTransaction(signature, 'confirmed')
    console.log(`   ✅ Pool '${poolId.toUpperCase()}' initialized`)
  } catch (error: any) {
    console.error(`   ❌ Error creating ${poolId} pool:`, error.message)
  }
}

function encodePoolId(poolId: string): Buffer {
  const buf = Buffer.alloc(32)
  Buffer.from(poolId).copy(buf)
  return buf
}

setupPools()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error)
    process.exit(1)
  })
