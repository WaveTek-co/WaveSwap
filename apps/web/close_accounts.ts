import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js'
import { Wallet } from '@coral-xyz/anchor'

const WALLET_SECRET_KEY = JSON.parse(require('fs').readFileSync('/Users/vivek/.config/solana/id.json'))
const wallet = Keypair.fromSecretKey(new Uint8Array(WALLET_SECRET_KEY))

const connection = new Connection('https://api.devnet.solana.com')
const PROGRAM_ID = new PublicKey('5fJF7FV29wZG6Azg1GLesEQVnGFdWHkFiauBaLCkqFZJ')

// Close user account instruction data (empty)
const closeData = Buffer.from(new Uint8Array([19, 30, 105, 6, 239, 253, 174, 242])) // Discriminator for close_user_account

async function closeUserAccount(poolId: string, poolPda: string, userPda: string) {
  console.log(`\n=== Closing ${poolId.toUpperCase()} user account ===`)

  try {
    const accountInfo = await connection.getAccountInfo(new PublicKey(userPda))
    if (!accountInfo) {
      console.log('✓ Account does not exist, skipping...')
      return
    }
    console.log('Account exists, size:', accountInfo.data.length, 'bytes')

    const transaction = new Transaction()

    transaction.add({
      keys: [
        { pubkey: new PublicKey(poolPda), isSigner: false, isWritable: true },
        { pubkey: new PublicKey(userPda), isSigner: false, isWritable: true },
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      ],
      programId: PROGRAM_ID,
      data: closeData,
    })

    const { blockhash } = await connection.getLatestBlockhash()
    transaction.recentBlockhash = blockhash
    transaction.feePayer = wallet.publicKey
    transaction.sign(wallet)

    console.log('Sending transaction...')
    const signature = await connection.sendRawTransaction(transaction.serialize())
    console.log('Signature:', signature)

    await connection.confirmTransaction(signature, 'confirmed')
    console.log('✓ Closed successfully!')
  } catch (error: any) {
    console.error('✗ Error:', error.message)
  }
}

async function main() {
  console.log('Closing corrupted user stake accounts...')

  await closeUserAccount(
    'sol',
    'BQw5wzQ2LhLAD8t8zE9jhZGGhe9zZdqAfgrLTJxtvBA3',
    'BQw5wzQ2LhLAD8t8zE9jhZGGhe9zZdqAfgrLTJxtvBA3'
  )

  await closeUserAccount(
    'wave',
    'FX1JUyYMmQMdeJfUFktwP8yZ1mSUyzTdVRgH9T91j1iS',
    'HeV4UXRbFeszVUheKJPNKWBZaYjEiyExCY4qvtEcsYB7'
  )

  console.log('\n✓ Done! You can now stake again.')
}

main().catch(console.error)
