// Run this in your browser console to close corrupted stake accounts
// This will fix the "Left: 52, Right: 51" error

(async () => {
  const { Connection, PublicKey, Transaction } = await import('https://esm.sh/@solana/web3.js@latest')
  const connection = new Connection('https://api.devnet.solana.com')
  const PROGRAM_ID = new PublicKey('5fJF7FV29wZG6Azg1GLesEQVnGFdWHkFiauBaLCkqFZJ')

  const wallet = window.solana || window.phantom
  if (!wallet?.publicKey) {
    alert('Please connect your wallet first!')
    return
  }

  console.log('Wallet connected:', wallet.publicKey.toString())

  const closeAccount = async (poolId) => {
    const poolPda = PublicKey.findProgramAddressSync(
      [Buffer.from('pool'), Buffer.alloc(32, poolId)],
      PROGRAM_ID
    )[0]

    const userPda = PublicKey.findProgramAddressSync(
      [Buffer.from('user'), poolPda.toBuffer(), wallet.publicKey.toBuffer()],
      PROGRAM_ID
    )[0]

    console.log(`\nClosing ${poolId.toUpperCase()} account:`)
    console.log('  Pool PDA:', poolPda.toString())
    console.log('  User PDA:', userPda.toString())

    // Check if account exists
    const accountInfo = await connection.getAccountInfo(userPda)
    if (!accountInfo) {
      console.log('  ✓ Account does not exist')
      return null
    }
    console.log('  Account size:', accountInfo.data.length, 'bytes')

    const ix = {
      keys: [
        { pubkey: poolPda, isSigner: false, isWritable: true },
        { pubkey: userPda, isSigner: false, isWritable: true },
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      ],
      programId: PROGRAM_ID,
      data: Buffer.from(new Uint8Array([221, 30, 232, 141, 22, 241, 136, 73])),
    }

    const tx = new Transaction().add(ix)
    tx.feePayer = wallet.publicKey
    const { blockhash } = await connection.getLatestBlockhash()
    tx.recentBlockhash = blockhash

    const signed = await wallet.signTransaction(tx)
    const sig = await connection.sendRawTransaction(signed.serialize())
    await connection.confirmTransaction(sig)

    console.log('  ✓ Closed! Signature:', sig)
    return sig
  }

  try {
    await closeAccount('sol')
    await closeAccount('wave')
    await closeAccount('gold')
    await closeAccount('wealth')
    await closeAccount('zec')

    alert('✓ All corrupted accounts closed! You can now stake again.')
    console.log('\n✓ Done! Refresh the page and try staking again.')
  } catch (error) {
    console.error('Error:', error)
    alert('Error: ' + error.message)
  }
})()
