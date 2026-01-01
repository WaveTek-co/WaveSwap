import { Connection, PublicKey, Transaction, SystemProgram, TransactionInstruction } from '@solana/web3.js'
import { AnchorProvider, Wallet } from '@coral-xyz/anchor'
import WAVE_STAKE_IDL from '../idl/wave_stake.json'

// WaveStake Program ID (Deployed to Devnet)
export const WAVE_STAKE_PROGRAM_ID = new PublicKey('5fJF7FV29wZG6Azg1GLesEQVnGFdWHkFiauBaLCkqFZJ')

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

// Helper to encode instruction data
function encodeInstructionData(ixName: string, args: any[] = []): Buffer {
  // Get instruction from IDL
  const instruction = WAVE_STAKE_IDL.instructions.find((ix: any) => ix.name === ixName)
  if (!instruction) {
    throw new Error(`Instruction ${ixName} not found in IDL`)
  }

  // Create sha256 hash of instruction name for discriminator
  const nameHash = Buffer.from(
    require('crypto').createHash('sha256').update(`global:${ixName}`).digest().slice(0, 8)
  )

  // Encode args based on IDL
  const argsBuffers: Buffer[] = []

  if (ixName === 'initialize') {
    // publicKey
    const pubKey = Buffer.from(args[0].toBytes())
    argsBuffers.push(pubKey)
  } else if (ixName === 'createPool') {
    // poolId: [u8; 32]
    const poolId = Buffer.alloc(32)
    Buffer.from(args[0]).copy(poolId)
    argsBuffers.push(poolId)

    // stakeMint: publicKey
    argsBuffers.push(Buffer.from(args[1].toBytes()))

    // lstMint: publicKey
    argsBuffers.push(Buffer.from(args[2].toBytes()))

    // rewardMint: publicKey
    argsBuffers.push(Buffer.from(args[3].toBytes()))

    // rewardPerSecond: u64
    const rewardPerSecond = Buffer.alloc(8)
    rewardPerSecond.writeBigUInt64LE(BigInt(args[4]))
    argsBuffers.push(rewardPerSecond)

    // lockDuration: u64
    const lockDuration = Buffer.alloc(8)
    lockDuration.writeBigUInt64LE(BigInt(args[5]))
    argsBuffers.push(lockDuration)

    // lockBonusPercentage: u16
    const bonus = Buffer.alloc(2)
    bonus.writeUInt16LE(args[6])
    argsBuffers.push(bonus)
  } else if (ixName === 'stake') {
    // amount: u64
    const amount = Buffer.alloc(8)
    amount.writeBigUInt64LE(BigInt(args[0]))
    argsBuffers.push(amount)

    // lockType: u8
    argsBuffers.push(Buffer.from([args[1]]))
  } else if (ixName === 'unstake') {
    // amount: u64
    const amount = Buffer.alloc(8)
    amount.writeBigUInt64LE(BigInt(args[0]))
    argsBuffers.push(amount)
  } else if (ixName === 'claimRewards') {
    // No args
  } else if (ixName === 'updatePool') {
    // All args are optional
    const newRewardPerSecond = args[0]
    const newLockDuration = args[1]
    const newLockBonusPercentage = args[2]

    if (newRewardPerSecond !== null) {
      const buf = Buffer.alloc(8)
      buf.writeBigUInt64LE(BigInt(newRewardPerSecond))
      argsBuffers.push(buf)
    }

    if (newLockDuration !== null) {
      const buf = Buffer.alloc(8)
      buf.writeBigUInt64LE(BigInt(newLockDuration))
      argsBuffers.push(buf)
    }

    if (newLockBonusPercentage !== null) {
      const buf = Buffer.alloc(2)
      buf.writeUInt16LE(newLockBonusPercentage)
      argsBuffers.push(buf)
    }
  } else if (ixName === 'closeUserAccount') {
    // No args
  }

  return Buffer.concat([nameHash, ...argsBuffers])
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

      console.log('[WaveStake] Provider initialized successfully')
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

    const data = encodeInstructionData('initialize', [authority])

    const keys = [
      { pubkey: globalState, isSigner: false, isWritable: true },
      { pubkey: provider.wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ]

    const ix = new TransactionInstruction({
      keys,
      programId: WAVE_STAKE_PROGRAM_ID,
      data,
    })

    const transaction = new Transaction().add(ix)
    return transaction
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

    const data = encodeInstructionData('createPool', [
      params.poolId,
      params.stakeMint,
      params.lstMint,
      params.rewardMint,
      params.rewardPerSecond,
      params.lockDuration,
      params.lockBonusPercentage,
    ])

    const keys = [
      { pubkey: globalState, isSigner: false, isWritable: true },
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: provider.wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: provider.wallet.publicKey, isSigner: true, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ]

    const ix = new TransactionInstruction({
      keys,
      programId: WAVE_STAKE_PROGRAM_ID,
      data,
    })

    const transaction = new Transaction().add(ix)
    return transaction
  }

  async stake(poolId: string, amount: number, lockType: LockType): Promise<Transaction> {
    const provider = this.ensureProvider()
    const [pool] = getPoolPDA(poolId)
    const [user] = getUserPDA(poolId, provider.wallet.publicKey)

    const data = encodeInstructionData('stake', [amount, lockType])

    const keys = [
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: user, isSigner: false, isWritable: true },
      { pubkey: provider.wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ]

    const ix = new TransactionInstruction({
      keys,
      programId: WAVE_STAKE_PROGRAM_ID,
      data,
    })

    const transaction = new Transaction().add(ix)
    return transaction
  }

  async unstake(poolId: string, amount: number): Promise<Transaction> {
    const provider = this.ensureProvider()
    const [pool] = getPoolPDA(poolId)
    const [user] = getUserPDA(poolId, provider.wallet.publicKey)

    const data = encodeInstructionData('unstake', [amount])

    const keys = [
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: user, isSigner: false, isWritable: true },
      { pubkey: provider.wallet.publicKey, isSigner: true, isWritable: false },
    ]

    const ix = new TransactionInstruction({
      keys,
      programId: WAVE_STAKE_PROGRAM_ID,
      data,
    })

    const transaction = new Transaction().add(ix)
    return transaction
  }

  async claimRewards(poolId: string): Promise<Transaction> {
    const provider = this.ensureProvider()
    const [pool] = getPoolPDA(poolId)
    const [user] = getUserPDA(poolId, provider.wallet.publicKey)

    const data = encodeInstructionData('claimRewards')

    const keys = [
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: user, isSigner: false, isWritable: true },
      { pubkey: provider.wallet.publicKey, isSigner: true, isWritable: false },
    ]

    const ix = new TransactionInstruction({
      keys,
      programId: WAVE_STAKE_PROGRAM_ID,
      data,
    })

    const transaction = new Transaction().add(ix)
    return transaction
  }

  async fetchPool(poolId: string) {
    const [pool] = getPoolPDA(poolId)

    try {
      const accountInfo = await this.connection.getAccountInfo(pool)
      if (!accountInfo) {
        return null
      }

      // Decode account data (you'll need to implement proper deserialization)
      // For now, return null
      console.log('[WaveStake] Pool account found, but deserialization not implemented yet')
      return null
    } catch (error) {
      console.error('[WaveStake] Error fetching pool:', error)
      return null
    }
  }

  async fetchUserStake(poolId: string) {
    const provider = this.ensureProvider()
    const [user] = getUserPDA(poolId, provider.wallet.publicKey)

    try {
      const accountInfo = await this.connection.getAccountInfo(user)
      if (!accountInfo) {
        return null
      }

      // Decode account data (you'll need to implement proper deserialization)
      // For now, return null
      console.log('[WaveStake] User stake account found, but deserialization not implemented yet')
      return null
    } catch (error) {
      console.error('[WaveStake] Error fetching user stake:', error)
      return null
    }
  }

  async fetchGlobalState() {
    const [globalState] = getGlobalStatePDA()

    try {
      const accountInfo = await this.connection.getAccountInfo(globalState)
      if (!accountInfo) {
        return null
      }

      // Decode account data (you'll need to implement proper deserialization)
      // For now, return null
      console.log('[WaveStake] Global state found, but deserialization not implemented yet')
      return null
    } catch (error) {
      console.error('[WaveStake] Error fetching global state:', error)
      return null
    }
  }
}

// Export singleton instance
export const waveStakeClient = new WaveStakeClient(
  new Connection(process.env.NEXT_PUBLIC_HELIUS_RPC_URL || 'https://api.devnet.solana.com')
)
