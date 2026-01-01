/**
 * Close User Account Script
 *
 * This script closes a user staking account to recover rent
 */

import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js'
import { createHash } from 'crypto'

const PROGRAM_ID = new PublicKey('5fJF7FV29wZG6Azg1GLesEQVnGFdWHkFiauBaLCkqFZJ')
const RPC_URL = 'https://api.devnet.solana.com'

// User account to close
const USER_ACCOUNT = new PublicKey('GYjmvitmJcsdEtFKa5fDi2Bx945wASRMTuD8c92jgYRC')
const POOL_ID = 'wave' // Adjust if different pool

// Load authority keypair
const fs = require('fs')
const path = require('path')
const keypairPath = path.join(__dirname, '../../.keys/authority-keypair.json')

const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, 'utf-8'))))
console.log(`Authority: ${authority.publicKey.toString()}`)

// Helper to create instruction discriminator
function createDiscriminator(name: string): Buffer {
  const preimage = `global:${name}`
  return createHash('sha256').update(preimage).digest().slice(0, 8)
}

async function closeUserAccount() {
  const connection = new Connection(RPC_URL, 'confirmed')

  // Derive pool and user PDAs
  const poolIdBytes = Buffer.alloc(32)
  Buffer.from(POOL_ID).copy(poolIdBytes)

  const [pool] = PublicKey.findProgramAddressSync(
    [Buffer.from('pool'), poolIdBytes],
    PROGRAM_ID
  )

  const [userWallet] = [authority.publicKey]

  // Build instruction data
  const data = createDiscriminator('closeUserAccount')

  const ix = new TransactionInstruction({
    keys: [
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: USER_ACCOUNT, isSigner: false, isWritable: true },
      { pubkey: userWallet, isSigner: false, isWritable: true },
      { pubkey: authority.publicKey, isSigner: true, isWritable: false },
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
    console.log(`✅ User account closed!`)
    console.log(`   Signature: ${signature}`)
    await connection.confirmTransaction(signature, 'confirmed')
  } catch (error: any) {
    console.error('❌ Error closing user account:', error.message)
  }
}

closeUserAccount()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error)
    process.exit(1)
  })
