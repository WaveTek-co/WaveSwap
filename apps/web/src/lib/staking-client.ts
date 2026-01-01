import { Connection, PublicKey, Transaction, SystemProgram, TransactionInstruction } from '@solana/web3.js'
import { AnchorProvider, Wallet } from '@coral-xyz/anchor'
import { createHash } from 'crypto'
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token'

// WaveStake Program ID (Deployed to Devnet)
// v1.1 - Fixed account size issues, removed init_if_needed
// Deployed: 2025-12-30
export const WAVE_STAKE_PROGRAM_ID = new PublicKey('6Gah3kZjZ9f9q4CUmF8BAc7ZXuACFDbLFWNTmWGS5CoZ')

// PDAs
export function getGlobalStatePDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('global')],
    WAVE_STAKE_PROGRAM_ID
  )
}

export function getPoolPDA(poolId: string): [PublicKey, number] {
  const poolIdBuffer = Buffer.alloc(32)
  Buffer.from(poolId).copy(poolIdBuffer)
  return PublicKey.findProgramAddressSync(
    [Buffer.from('pool'), poolIdBuffer],
    WAVE_STAKE_PROGRAM_ID
  )
}

export function getUserPDA(poolId: string, user: PublicKey): [PublicKey, number] {
  const poolIdBuffer = Buffer.alloc(32)
  Buffer.from(poolId).copy(poolIdBuffer)
  return PublicKey.findProgramAddressSync(
    [Buffer.from('user'), poolIdBuffer, user.toBuffer()],
    WAVE_STAKE_PROGRAM_ID
  )
}

// Lock types
export enum LockType {
  FLEXIBLE = 0,
  LOCKED_30_DAYS = 1,
}

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
function encodeU64(value: number | bigint): Buffer {
  const buf = Buffer.alloc(8)
  const bigValue = BigInt(value)

  // Write little-endian 64-bit unsigned integer
  buf[0] = Number(bigValue & 0xffn)
  buf[1] = Number((bigValue >> 8n) & 0xffn)
  buf[2] = Number((bigValue >> 16n) & 0xffn)
  buf[3] = Number((bigValue >> 24n) & 0xffn)
  buf[4] = Number((bigValue >> 32n) & 0xffn)
  buf[5] = Number((bigValue >> 40n) & 0xffn)
  buf[6] = Number((bigValue >> 48n) & 0xffn)
  buf[7] = Number((bigValue >> 56n) & 0xffn)

  return buf
}

// Helper to encode u16
function encodeU16(value: number): Buffer {
  const buf = Buffer.alloc(2)

  // Write little-endian 16-bit unsigned integer
  buf[0] = value & 0xff
  buf[1] = (value >> 8) & 0xff

  return buf
}

// Helper to encode u8
function encodeU8(value: number): Buffer {
  return Buffer.from([value])
}

// Helper to encode pool ID (32 bytes)
function encodePoolId(poolId: string): Buffer {
  const buf = Buffer.alloc(32)
  Buffer.from(poolId).copy(buf)
  return buf
}

export class WaveStakeClient {
  private connection: Connection
  private provider: AnchorProvider | null = null

  constructor(connection: Connection) {
    this.connection = connection
  }

  setProvider(wallet: Wallet) {
    try {
      console.log('[WaveStake] Initializing provider with wallet:', wallet.publicKey?.toString())

      this.provider = new AnchorProvider(this.connection, wallet, {
        commitment: 'confirmed',
        preflightCommitment: 'confirmed'
      })

      console.log('[WaveStake] Provider initialized successfully (using manual transaction building)')
    } catch (error) {
      console.error('[WaveStake] Error setting provider:', error)
      throw new Error(`Failed to initialize WaveStake provider: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private ensureProvider(): AnchorProvider {
    if (!this.provider) {
      throw new Error('Provider not initialized. Call setProvider() first.')
    }
    return this.provider
  }

  getProgramId(): PublicKey {
    return WAVE_STAKE_PROGRAM_ID
  }

  async initializeGlobalState(authority: PublicKey): Promise<Transaction> {
    const provider = this.ensureProvider()
    const [globalState] = getGlobalStatePDA()

    // Build instruction data
    const data = Buffer.concat([
      createDiscriminator('initialize'),
      encodePublicKey(authority),
    ])

    const ix = new TransactionInstruction({
      keys: [
        { pubkey: globalState, isSigner: false, isWritable: true },
        { pubkey: provider.wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: WAVE_STAKE_PROGRAM_ID,
      data,
    })

    return new Transaction().add(ix)
  }

  async createPool(params: {
    poolId: string
    stakeMint: PublicKey
    lstMint: PublicKey
    rewardMint: PublicKey
    rewardPerSecond: number
    lockDuration: number
    lockBonusPercentage: number
  }): Promise<Transaction> {
    const provider = this.ensureProvider()
    const [globalState] = getGlobalStatePDA()
    const [pool] = getPoolPDA(params.poolId)

    // Build instruction data
    const data = Buffer.concat([
      createDiscriminator('createPool'),
      encodePoolId(params.poolId),
      encodePublicKey(params.stakeMint),
      encodePublicKey(params.lstMint),
      encodePublicKey(params.rewardMint),
      encodeU64(params.rewardPerSecond),
      encodeU64(params.lockDuration),
      encodeU16(params.lockBonusPercentage),
    ])

    const ix = new TransactionInstruction({
      keys: [
        { pubkey: globalState, isSigner: false, isWritable: true },
        { pubkey: pool, isSigner: false, isWritable: true },
        { pubkey: provider.wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: provider.wallet.publicKey, isSigner: true, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: WAVE_STAKE_PROGRAM_ID,
      data,
    })

    return new Transaction().add(ix)
  }

  async createUserAccount(poolId: string): Promise<Transaction> {
    const provider = this.ensureProvider()
    const [pool] = getPoolPDA(poolId)
    const [user] = getUserPDA(poolId, provider.wallet.publicKey)

    // Build instruction data (no args for create_user_account)
    const data = createDiscriminator('createUserAccount')

    const ix = new TransactionInstruction({
      keys: [
        { pubkey: pool, isSigner: false, isWritable: true },
        { pubkey: user, isSigner: false, isWritable: true },
        { pubkey: provider.wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: WAVE_STAKE_PROGRAM_ID,
      data,
    })

    return new Transaction().add(ix)
  }

  async stake(poolId: string, amount: number, lockType: LockType): Promise<Transaction> {
    const provider = this.ensureProvider()

    console.log('[WaveStakeClient] stake called:', { poolId, amount, lockType })

    // Get PDAs
    const poolPda = getPoolPDA(poolId)
    const userPda = getUserPDA(poolId, provider.wallet.publicKey)

    console.log('[WaveStakeClient] poolPda:', poolPda[0].toString())
    console.log('[WaveStakeClient] userPda:', userPda[0].toString())
    console.log('[WaveStakeClient] provider.wallet.publicKey:', provider.wallet.publicKey?.toString())

    // Get the pool's stake mint address from pool configuration
    const tokenMints: { [key: string]: string } = {
      wave: '4AGxpKxYnw7g1ofvYDs5Jq2a1ek5kB9jS2NTUaippump',
      wealth: 'BSxPC3Vu3X6UCtEEAYyhxAEo3rvtS4dgzzrvnERDpump',
      gold: 'CuEXgJtrPav6otWubGPMjWVe768CGpuRDDXE1XeR4QJK',
      zec: '7kHuXpDPfxRss5bhADeqQR27jcXMA7AMiVdWhwF4Cjjz',
      sol: 'So11111111111111111111111111111111111111112', // Native SOL
    }
    const stakeMint = new PublicKey(tokenMints[poolId] || tokenMints.wave)
    console.log('[WaveStakeClient] stakeMint:', stakeMint.toString())

    // Check if staking native SOL
    const isNativeSOL = stakeMint.toString() === 'So11111111111111111111111111111111111111112'
    console.log('[WaveStakeClient] isNativeSOL:', isNativeSOL)

    // Get pool authority (hardcoded for now - should be fetched from pool account)
    const poolAuthority = new PublicKey('8uSHCQQDycVbjj2qMLm8qS2zKUdgFfN2JEsqWvzUdqEz')
    console.log('[WaveStakeClient] poolAuthority:', poolAuthority.toString())

    // Build instruction data
    const data = Buffer.concat([
      createDiscriminator('stake'),
      encodeU64(amount),
      encodeU8(lockType),
    ])

    // Build keys in the exact order expected by the Rust struct
    // ALWAYS send all 9 accounts - use dummy accounts for unused ones
    // 0. pool
    // 1. user
    // 2. stake_mint
    // 3. pool_authority
    // 4. pool_authority_token_account
    // 5. user_token_account
    // 6. payer
    // 7. token_program
    // 8. system_program

    let poolAuthorityTokenAccount: PublicKey
    let userTokenAccount: PublicKey

    if (!isNativeSOL) {
      // For SPL tokens, get actual token accounts
      poolAuthorityTokenAccount = getAssociatedTokenAddressSync(
        stakeMint,
        poolAuthority,
        true // allowOffscreen
      )
      userTokenAccount = getAssociatedTokenAddressSync(
        stakeMint,
        provider.wallet.publicKey,
        false // don't allow offscreen
      )
      console.log('[WaveStakeClient] poolAuthorityTokenAccount:', poolAuthorityTokenAccount.toString())
      console.log('[WaveStakeClient] userTokenAccount:', userTokenAccount.toString())
    } else {
      // For native SOL, use pool authority as dummy token accounts
      // These won't be used since is_native_sol will be true
      poolAuthorityTokenAccount = poolAuthority
      userTokenAccount = provider.wallet.publicKey
      console.log('[WaveStakeClient] Using dummy accounts for native SOL')
    }

    const keys = [
      { pubkey: poolPda[0], isSigner: false, isWritable: true }, // 0: pool
      { pubkey: userPda[0], isSigner: false, isWritable: true }, // 1: user
      { pubkey: stakeMint, isSigner: false, isWritable: false }, // 2: stake_mint
      { pubkey: poolAuthority, isSigner: false, isWritable: true }, // 3: pool_authority
      { pubkey: poolAuthorityTokenAccount, isSigner: false, isWritable: true }, // 4: pool_authority_token_account
      { pubkey: userTokenAccount, isSigner: false, isWritable: true }, // 5: user_token_account
      { pubkey: provider.wallet.publicKey, isSigner: true, isWritable: true }, // 6: payer
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // 7: token_program
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // 8: system_program
    ]

    console.log('[WaveStakeClient] Instruction keys created, count:', keys.length)
    keys.forEach((k, i) => {
      const pubkeyStr = k.pubkey?.toString() || 'UNDEFINED'
      console.log(`[WaveStakeClient] Key ${i}:`, {
        pubkey: pubkeyStr,
        signer: k.isSigner,
        writable: k.isWritable
      })
      if (!k.pubkey) {
        console.error(`[WaveStakeClient] ERROR: Key ${i} has undefined pubkey!`)
      }
    })

    const ix = new TransactionInstruction({
      keys,
      programId: WAVE_STAKE_PROGRAM_ID,
      data,
    })

    console.log('[WaveStakeClient] Creating transaction with instruction...')
    return new Transaction().add(ix)
  }

  async unstake(poolId: string, amount: number): Promise<Transaction> {
    const provider = this.ensureProvider()

    const poolPda = getPoolPDA(poolId)
    const userPda = getUserPDA(poolId, provider.wallet.publicKey)

    console.log('[WaveStakeClient] unstake called:', { poolId, amount })

    // Get the pool's stake mint address from pool configuration
    const tokenMints: { [key: string]: string } = {
      wave: '4AGxpKxYnw7g1ofvYDs5Jq2a1ek5kB9jS2NTUaippump',
      wealth: 'BSxPC3Vu3X6UCtEEAYyhxAEo3rvtS4dgzzrvnERDpump',
      gold: 'CuEXgJtrPav6otWubGPMjWVe768CGpuRDDXE1XeR4QJK',
      zec: '7kHuXpDPfxRss5bhADeqQR27jcXMA7AMiVdWhwF4Cjjz',
      sol: 'So11111111111111111111111111111111111111112', // Native SOL
    }
    const stakeMint = new PublicKey(tokenMints[poolId] || tokenMints.wave)
    console.log('[WaveStakeClient] stakeMint:', stakeMint.toString())

    // Check if unstaking native SOL
    const isNativeSOL = stakeMint.toString() === 'So11111111111111111111111111111111111111112'
    console.log('[WaveStakeClient] isNativeSOL:', isNativeSOL)

    // Get pool authority (hardcoded for now)
    const poolAuthority = new PublicKey('8uSHCQQDycVbjj2qMLm8qS2zKUdgFfN2JEsqWvzUdqEz')
    console.log('[WaveStakeClient] poolAuthority:', poolAuthority.toString())

    // Build instruction data
    const data = Buffer.concat([
      createDiscriminator('unstake'),
      encodeU64(amount),
    ])

    // Build keys in the exact order expected by the Rust struct
    // 0. pool
    // 1. user
    // 2. stake_mint
    // 3. pool_authority
    // 4. pool_authority_token_account
    // 5. user_token_account
    // 6. authority
    // 7. token_program
    // 8. system_program

    let poolAuthorityTokenAccount: PublicKey
    let userTokenAccount: PublicKey

    if (!isNativeSOL) {
      // For SPL tokens, get actual token accounts
      poolAuthorityTokenAccount = getAssociatedTokenAddressSync(
        stakeMint,
        poolAuthority,
        true // allowOffscreen
      )
      userTokenAccount = getAssociatedTokenAddressSync(
        stakeMint,
        provider.wallet.publicKey,
        false // don't allow offscreen
      )
      console.log('[WaveStakeClient] poolAuthorityTokenAccount:', poolAuthorityTokenAccount.toString())
      console.log('[WaveStakeClient] userTokenAccount:', userTokenAccount.toString())
    } else {
      // For native SOL, use dummy accounts
      poolAuthorityTokenAccount = poolAuthority
      userTokenAccount = provider.wallet.publicKey
      console.log('[WaveStakeClient] Using dummy accounts for native SOL')
    }

    const keys = [
      { pubkey: poolPda[0], isSigner: false, isWritable: true }, // 0: pool
      { pubkey: userPda[0], isSigner: false, isWritable: true }, // 1: user
      { pubkey: stakeMint, isSigner: false, isWritable: false }, // 2: stake_mint
      { pubkey: poolAuthority, isSigner: false, isWritable: true }, // 3: pool_authority
      { pubkey: poolAuthorityTokenAccount, isSigner: false, isWritable: true }, // 4: pool_authority_token_account
      { pubkey: userTokenAccount, isSigner: false, isWritable: true }, // 5: user_token_account
      { pubkey: provider.wallet.publicKey, isSigner: true, isWritable: true }, // 6: authority
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // 7: token_program
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // 8: system_program
    ]

    const ix = new TransactionInstruction({
      keys,
      programId: WAVE_STAKE_PROGRAM_ID,
      data,
    })

    return new Transaction().add(ix)
  }

  async claimRewards(poolId: string): Promise<Transaction> {
    const provider = this.ensureProvider()
    const [pool] = getPoolPDA(poolId)
    const [user] = getUserPDA(poolId, provider.wallet.publicKey)

    // Build instruction data (no args)
    const data = createDiscriminator('claimRewards')

    const ix = new TransactionInstruction({
      keys: [
        { pubkey: pool, isSigner: false, isWritable: true },
        { pubkey: user, isSigner: false, isWritable: true },
        { pubkey: provider.wallet.publicKey, isSigner: true, isWritable: false },
      ],
      programId: WAVE_STAKE_PROGRAM_ID,
      data,
    })

    return new Transaction().add(ix)
  }

  // Note: updatePool, closeUserAccount, and fetch methods removed since they require Program class
  // These can be added later if needed using manual account deserialization

  async fetchPool(poolId: string): Promise<any> {
    // For now, return null. Account deserialization requires the Program class
    // or manual Borsh deserialization which is complex
    console.log('[WaveStake] fetchPool called - returning null (needs implementation)')
    return null
  }

  async fetchUserStake(poolId: string): Promise<any> {
    const provider = this.ensureProvider()
    const userPdaResult = getUserPDA(poolId, provider.wallet.publicKey)

    if (!userPdaResult || !userPdaResult[0]) {
      console.error('[WaveStake] Failed to derive user PDA')
      return null
    }

    const [userPda] = userPdaResult

    try {
      console.log('[WaveStake] fetchUserStake for pool:', poolId, 'userPda:', userPda.toString())

      const accountInfo = await this.connection.getAccountInfo(userPda)

      if (!accountInfo || !accountInfo.data) {
        console.log('[WaveStake] No user account found')
        return null
      }

      // Decode the user account data
      // User struct: discriminator(8) + bump(1) + amount(8) + lock_type(1) + lock_start(8) + lock_end(8) + bonus(2) + last_claim(8)
      const data = Buffer.from(accountInfo.data)

      if (data.length < 36) {
        console.error('[WaveStake] Invalid user account data length:', data.length)
        return null
      }

      // Skip 8-byte discriminator
      const userData = data.slice(8)

      // Parse as little-endian
      const amount = userData.readBigUInt64LE(1)
      const lockType = userData.readUInt8(9)
      const lockStartTimestamp = userData.readBigUInt64LE(10)
      const lockEndTimestamp = userData.readBigUInt64LE(18)
      const bonusMultiplier = userData.readUInt16LE(26)
      const lastRewardClaimTimestamp = Number(userData.readBigUInt64LE(28))

      const result = {
        amount: amount.toString(),
        lockType,
        lockStartTimestamp: Number(lockStartTimestamp),
        lockEndTimestamp: Number(lockEndTimestamp),
        bonusMultiplier,
        lastRewardClaimTimestamp,
      }

      console.log('[WaveStake] User stake data:', result)
      return result
    } catch (error) {
      console.error('[WaveStake] Error fetching user stake:', error)
      return null
    }
  }

  async fetchGlobalState(): Promise<any> {
    // For now, return null. Account deserialization requires the Program class
    // or manual Borsh deserialization which is complex
    console.log('[WaveStake] fetchGlobalState called - returning null (needs implementation)')
    return null
  }

  async closeUserAccount(poolId: string): Promise<string> {
    const provider = this.ensureProvider()

    const [poolPda] = getPoolPDA(poolId)
    const [userPda] = getUserPDA(poolId, provider.wallet.publicKey)

    console.log('[WaveStake] closeUserAccount called for pool:', poolId)
    console.log('[WaveStake] poolPda:', poolPda.toString())
    console.log('[WaveStake] userPda:', userPda.toString())

    // Close user account instruction
    const instruction = {
      keys: [
        { pubkey: poolPda, isSigner: false, isWritable: true },
        { pubkey: userPda, isSigner: false, isWritable: true },
        { pubkey: provider.wallet.publicKey, isSigner: true, isWritable: true },
      ],
      programId: WAVE_STAKE_PROGRAM_ID,
      data: Buffer.from(new Uint8Array([221, 30, 232, 141, 22, 241, 136, 73])), // close_user_account discriminator
    }

    const transaction = new Transaction()
    transaction.add(instruction)

    const { blockhash } = await this.connection.getLatestBlockhash()
    transaction.recentBlockhash = blockhash
    transaction.feePayer = provider.wallet.publicKey

    console.log('[WaveStake] Transaction created, signing...')
    const signedTransaction = await provider.wallet.signTransaction(transaction)

    console.log('[WaveStake] Sending close transaction...')
    const signature = await this.connection.sendRawTransaction(signedTransaction.serialize())

    console.log('[WaveStake] Close transaction sent:', signature)
    await this.connection.confirmTransaction(signature, 'confirmed')

    return signature
  }
}

// Export singleton instance
export const waveStakeClient = new WaveStakeClient(
  new Connection(process.env.NEXT_PUBLIC_HELIUS_RPC_URL || 'https://api.devnet.solana.com')
)
