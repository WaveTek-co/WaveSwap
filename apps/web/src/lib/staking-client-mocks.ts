/**
 * Test utilities and mocks for WaveStake
 */

import { PublicKey, Connection, Transaction } from '@solana/web3.js'
import { Wallet } from '@coral-xyz/anchor'

/**
 * Mock wallet for testing
 */
export class MockWallet implements Wallet {
  constructor(
    public publicKey: PublicKey,
    private shouldFail: boolean = false
  ) {}

  async signTransaction(tx: Transaction): Promise<Transaction> {
    if (this.shouldFail) {
      throw new Error('Mock wallet signing failed')
    }
    return tx
  }

  async signAllTransactions(txs: Transaction[]): Promise<Transaction[]> {
    if (this.shouldFail) {
      throw new Error('Mock wallet signing failed')
    }
    return txs
  }
}

/**
 * Mock connection for testing
 */
export class MockConnection {
  constructor(
    public rpcEndpoint: string,
    private accounts: Map<string, any> = new Map()
  ) {}

  async getAccountInfo(publicKey: PublicKey): Promise<any> {
    const key = publicKey.toBase58()
    return this.accounts.get(key) || null
  }

  setAccount(publicKey: PublicKey | string, data: any) {
    const key = typeof publicKey === 'string' ? publicKey : publicKey.toBase58()
    this.accounts.set(key, data)
  }
}

/**
 * Test fixtures
 */
export const TEST_WALLETS = {
  authority: new MockWallet(
    new PublicKey('1111111111111111111111111111111111111111111')
  ),
  user1: new MockWallet(
    new PublicKey('2222222222222222222222222222222222222222222')
  ),
  user2: new MockWallet(
    new PublicKey('3333333333333333333333333333333333333333333')
  ),
}

export const TEST_MINTS = {
  wave: new PublicKey('4AGxpKxYnw7g1ofvYDs5Jq2a1ek5kB9jS2NTUaippump'),
  wealth: new PublicKey('BSxPC3Vu3X6UCtEEAYyhxAEo3rvtS4dgzzrvnERDpump'),
  sol: new PublicKey('So11111111111111111111111111111111111111112'),
  lstSol: new PublicKey('So11111111111111111111111111111111111111112'),
}

export const TEST_POOLS = {
  wave: {
    poolId: 'wave',
    stakeMint: TEST_MINTS.wave,
    lstMint: TEST_MINTS.lstSol,
    rewardMint: TEST_MINTS.wave,
    rewardPerSecond: 1000000,
    lockDuration: 2592000, // 30 days
    lockBonusPercentage: 5000, // 50%
  },
  wealth: {
    poolId: 'wealth',
    stakeMint: TEST_MINTS.wealth,
    lstMint: TEST_MINTS.lstSol,
    rewardMint: TEST_MINTS.wealth,
    rewardPerSecond: 1000000,
    lockDuration: 2592000,
    lockBonusPercentage: 5000,
  },
  sol: {
    poolId: 'sol',
    stakeMint: TEST_MINTS.sol,
    lstMint: TEST_MINTS.sol,
    rewardMint: TEST_MINTS.sol,
    rewardPerSecond: 1000000,
    lockDuration: 2592000,
    lockBonusPercentage: 5000,
  },
}

/**
 * Helper to create mock pool account data
 */
export function createMockPoolAccount(overrides: any = {}) {
  return {
    bump: 255,
    poolId: new Array(32).fill(0),
    stakeMint: TEST_MINTS.wave.toBuffer(),
    lstMint: TEST_MINTS.lstSol.toBuffer(),
    rewardMint: TEST_MINTS.wave.toBuffer(),
    rewardPerSecond: BigInt(1000000),
    lockDuration: BigInt(2592000),
    lockBonusPercentage: 5000,
    totalStaked: BigInt(0),
    totalRewardDistributed: BigInt(0),
    lastUpdateTimestamp: Date.now(),
    authority: TEST_WALLETS.authority.publicKey.toBuffer(),
    ...overrides,
  }
}

/**
 * Helper to create mock user stake account data
 */
export function createMockUserStakeAccount(overrides: any = {}) {
  return {
    bump: 255,
    amount: BigInt(1000000),
    lockType: 0, // FLEXIBLE
    lockStartTimestamp: Date.now(),
    lockEndTimestamp: 0,
    bonusMultiplier: 10000, // 1x
    lastRewardClaimTimestamp: Date.now(),
    ...overrides,
  }
}

/**
 * Helper to wait for async operations
 */
export async function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Helper to run test with timeout
 */
export async function runWithTimeout<T>(
  fn: () => Promise<T>,
  timeout: number = 5000
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Test timed out after ${timeout}ms`)), timeout)
    ),
  ])
}

/**
 * Validator helper to check if transaction is valid
 */
export function validateTransaction(tx: Transaction): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (!tx.instructions) {
    errors.push('Transaction missing instructions')
  }

  if (!tx.recentBlockhash) {
    errors.push('Transaction missing recent blockhash')
  }

  if (!tx.feePayer) {
    errors.push('Transaction missing fee payer')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Type guard for transaction
 */
export function isTransaction(obj: any): obj is Transaction {
  return (
    obj &&
    typeof obj === 'object' &&
    Array.isArray(obj.instructions) &&
    typeof obj.compile === 'function'
  )
}

/**
 * Helper to convert buffer to hex string
 */
export function bufferToHex(buffer: Buffer): string {
  return '0x' + Buffer.from(buffer).toString('hex')
}

/**
 * Helper to pretty print transaction data
 */
export function prettyPrintTransaction(tx: Transaction): void {
  console.log('=== Transaction ===')
  console.log('Fee Payer:', tx.feePayer?.toBase58())
  console.log('Recent Blockhash:', tx.recentBlockhash)
  console.log('Instructions:', tx.instructions.length)

  tx.instructions.forEach((ix, index) => {
    console.log(`\nInstruction ${index + 1}:`)
    console.log('  Program:', ix.programId.toBase58())
    console.log('  Keys:', ix.keys.map(k => ({
      pubkey: k.pubkey.toBase58(),
      isSigner: k.isSigner,
      isWritable: k.isWritable,
    })))
    console.log('  Data:', bufferToHex(ix.data as Buffer))
  })
  console.log('==================\n')
}
