import { Connection, PublicKey, Keypair } from '@solana/web3.js'
import {
  TOKEN_PROGRAM_ID,
  createInitializeAccountInstruction,
  getAccountLen
} from '@solana/spl-token'

const connection = new Connection('https://api.devnet.solana.com')
const payer = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(require('fs').readFileSync('./packages/programs/wave_stake/.keys/authority-keypair.json', 'utf-8')))
)

const WAVE_STAKE_PROGRAM_ID = new PublicKey('5fJF7FV29wZG6Azg1GLesEQVnGFdWHkFiauBaLCkqFZJ')

// Pool configurations
const pools = [
  { id: 'wave', mint: '6D6DjjiwtWPMCb2tkRVuTDi5esUu2rzHnhpE6z3nyskE' },
  { id: 'wealth', mint: 'Diz52amvNsWFWrA8WnwQMVxSL5asMqL8MhZVSBk8TWcz' },
  { id: 'gold', mint: 'CuEXgJtrPav6otWubGPMjWVe768CGpuRDDXE1XeR4QJK' },
  { id: 'zec', mint: '7kHuXpDPfxRss5bhADeqQR27jcXMA7AMiVdWhwF4Cjjz' },
  { id: 'sol', mint: 'So11111111111111111111111111111111111111112' }, // Wrapped SOL for testing
]

async function createVault(poolId: string, mintAddress: string) {
  console.log(`\n=== Creating vault for pool: ${poolId} ===`)

  // Find PDA for vault
  const poolIdBuffer = Buffer.alloc(32)
  Buffer.from(poolId).copy(poolIdBuffer)

  const [vaultPda] = await PublicKey.findProgramAddress(
    [Buffer.from('vault'), poolIdBuffer],
    WAVE_STAKE_PROGRAM_ID
  )

  console.log(`Vault PDA: ${vaultPda.toBase58()}`)

  // Create vault account
  const mint = new PublicKey(mintAddress)
  const vaultAccount = Keypair.generate()
  const accountLen = getAccountLen(mint)

  console.log(`Creating token account...`)

  const tx = await connection.getTransactionCount()

  // Create token account
  const createAccountIx = createInitializeAccountInstruction(
    vaultAccount.publicKey,
    mint,
    vaultPda, // Authority is the vault PDA itself
    tx
  )

  // This won't work directly - we need to use SystemProgram to create the account first
  // Let's use a simpler approach with spl-token CLI
  console.log(`\nTo create vault manually, run:`)
  console.log(`spl-token create-account ${mintAddress} --owner ${vaultPda.toBase58()()} --fee-payer ~/.config/solana/id.json`)
}

async function main() {
  for (const pool of pools) {
    await createVault(pool.id, pool.mint)
  }
}

main().catch(console.error)
