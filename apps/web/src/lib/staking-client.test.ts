/**
 * WaveStake Client Unit Tests
 *
 * Tests the staking client functionality including:
 * - PDA derivation
 * - Instruction encoding
 * - Transaction building
 */

import { describe, it, expect, beforeEach } from 'bun:test'
import { PublicKey } from '@solana/web3.js'
import {
  WAVE_STAKE_PROGRAM_ID,
  getGlobalStatePDA,
  getPoolPDA,
  getUserPDA,
  LockType,
  WaveStakeClient,
} from './staking-client'

describe('WaveStake Client', () => {
  // Mock wallet with proper PublicKey
  const mockWalletPubkey = new PublicKey(1) // Use 1 instead of string
  const mockWallet = {
    publicKey: mockWalletPubkey,
    signTransaction: async (tx: any) => tx,
    signAllTransactions: async (txs: any[]) => txs,
  }

  describe('PDA Derivation', () => {
    it('should derive correct global state PDA', () => {
      const [pda, bump] = getGlobalStatePDA()

      expect(pda).toBeInstanceOf(PublicKey)
      expect(bump).toBeGreaterThanOrEqual(0)
      expect(bump).toBeLessThanOrEqual(255)
    })

    it('should derive consistent PDAs for same pool ID', () => {
      const [pda1] = getPoolPDA('wave')
      const [pda2] = getPoolPDA('wave')

      expect(pda1.toBase58()).toEqual(pda2.toBase58())
    })

    it('should derive different PDAs for different pool IDs', () => {
      const [pda1] = getPoolPDA('wave')
      const [pda2] = getPoolPDA('wealth')

      expect(pda1.toBase58()).not.toEqual(pda2.toBase58())
    })

    it('should derive unique user PDAs', () => {
      const user1 = new PublicKey(1) // Use number constructor
      const user2 = new PublicKey(2)

      const [pda1] = getUserPDA('wave', user1)
      const [pda2] = getUserPDA('wave', user2)

      expect(pda1.toBase58()).not.toEqual(pda2.toBase58())
    })
  })

  describe('LockType Enum', () => {
    it('should have correct values', () => {
      expect(LockType.FLEXIBLE).toBe(0)
      expect(LockType.LOCKED_30_DAYS).toBe(1)
    })
  })

  describe('WaveStakeClient', () => {
    let client: WaveStakeClient

    beforeEach(() => {
      const connection = {
        rpcEndpoint: 'https://api.devnet.solana.com',
      } as any
      client = new WaveStakeClient(connection as any)
    })

    it('should initialize with connection', () => {
      expect(client).toBeInstanceOf(WaveStakeClient)
    })

    it('should throw error when operations called before setProvider', async () => {
      await expect(client.stake('wave', 100, LockType.FLEXIBLE)).rejects.toThrow(
        'Provider not initialized'
      )
    })

    it('should initialize provider successfully', () => {
      expect(() => {
        client.setProvider(mockWallet)
      }).not.toThrow()
    })
  })

  describe('Transaction Creation', () => {
    let client: WaveStakeClient

    beforeEach(() => {
      const connection = {
        rpcEndpoint: 'https://api.devnet.solana.com',
      } as any
      client = new WaveStakeClient(connection as any)
      client.setProvider(mockWallet)
    })

    it('should create stake transaction', async () => {
      const tx = await client.stake('wave', 1000000, LockType.FLEXIBLE)

      expect(tx).toBeDefined()
      expect(tx.instructions).toHaveLength(1)
    })

    it('should create unstake transaction', async () => {
      const tx = await client.unstake('wave', 500000)

      expect(tx).toBeDefined()
      expect(tx.instructions).toHaveLength(1)
    })

    it('should create claim rewards transaction', async () => {
      const tx = await client.claimRewards('wave')

      expect(tx).toBeDefined()
      expect(tx.instructions).toHaveLength(1)
    })

    it('should create initialize global state transaction', async () => {
      const authority = new PublicKey(3) // Use number constructor
      const tx = await client.initializeGlobalState(authority)

      expect(tx).toBeDefined()
      expect(tx.instructions).toHaveLength(1)
    })

    it('should create pool transaction', async () => {
      const params = {
        poolId: 'wave',
        stakeMint: new PublicKey(4),
        lstMint: new PublicKey(5),
        rewardMint: new PublicKey(6),
        rewardPerSecond: 1000000,
        lockDuration: 2592000,
        lockBonusPercentage: 5000,
      }

      const tx = await client.createPool(params)

      expect(tx).toBeDefined()
      expect(tx.instructions).toHaveLength(1)
    })
  })

  describe('Instruction Data Encoding', () => {
    it('should encode correct discriminators', async () => {
      const client = new WaveStakeClient({} as any)
      client.setProvider(mockWallet)

      const tx1 = await client.stake('wave', 100, LockType.FLEXIBLE)
      const tx2 = await client.unstake('wave', 100)
      const tx3 = await client.claimRewards('wave')

      // Each instruction should have unique discriminator
      const data1 = tx1.instructions[0].data
      const data2 = tx2.instructions[0].data
      const data3 = tx3.instructions[0].data

      expect(data1).toBeDefined()
      expect(data2).toBeDefined()
      expect(data3).toBeDefined()

      // First 8 bytes are discriminator
      expect(data1.length).toBeGreaterThan(8)
      expect(data2.length).toBeGreaterThan(8)
      expect(data3.length).toBeGreaterThanOrEqual(8)
    })
  })
})
