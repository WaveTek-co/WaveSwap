/**
 * Enhanced Staking Hook with Yield Strategies
 *
 * Integrates with multiple yield generation protocols:
 * - Sanctum LSTs
 * - Meteora DLMM
 * - Kamino Vaults
 * - Save/Solend
 * - PMX Markets
 */

import { useState, useCallback, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { Connection, PublicKey } from '@solana/web3.js'
import {
  createYieldManager,
  YieldStrategy,
  ProtocolAPY,
  YIELD_ALLOCATION,
} from '@/lib/yield/protocols'

// ============================================================================
// Types
// ============================================================================

export interface StakingPool {
  id: string
  name: string
  stakeMint: string
  rewardMint: string
  baseApy: number
  lockBonusApy: number
  totalStaked: number
  isActive: boolean
}

export interface StakingPosition {
  poolId: string
  amount: number
  lockType: 'flexible' | 'locked_30'
  unlockTime?: number
  rewards: number
  yieldStrategy: YieldStrategy
}

export interface StakeQuote {
  expectedRewards: number
  lockBonus: number
  apy: number
  allocation: {
    protocol: string
    amount: number
    apy: number
  }[]
}

// ============================================================================
// Hook
// ============================================================================

export function useYieldStaking() {
  const { publicKey, signTransaction } = useWallet()
  const [loading, setLoading] = useState(false)
  const [pools, setPools] = useState<StakingPool[]>([])
  const [positions, setPositions] = useState<StakingPosition[]>([])
  const [protocolAPY, setProtocolAPY] = useState<ProtocolAPY | null>(null)
  const [yieldManager, setYieldManager] = useState<any>(null)

  // Initialize yield manager
  useEffect(() => {
    const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL!)
    const manager = createYieldManager(connection)
    setYieldManager(manager)

    // Fetch protocol APYs every 30 seconds
    const fetchAPYs = async () => {
      if (manager) {
        const apys = await manager.getProtocolAPYs()
        setProtocolAPY(apys)
      }
    }

    fetchAPYs()
    const interval = setInterval(fetchAPYs, 30000)

    return () => clearInterval(interval)
  }, [])

  /**
   * Get staking quote with yield strategy
   */
  const getQuote = useCallback(
    async (poolId: string, amount: number, lockType: 'flexible' | 'locked_30', strategy: YieldStrategy): Promise<StakeQuote> => {
      if (!protocolAPY) {
        throw new Error('Protocol APY data not loaded')
      }

      const pool = pools.find((p) => p.id === poolId)
      if (!pool) {
        throw new Error('Pool not found')
      }

      const allocation = YIELD_ALLOCATION[strategy]
      const baseRewards = amount * (pool.baseApy / 100)
      const lockBonus = lockType === 'locked_30' ? baseRewards * 0.5 : 0
      const expectedRewards = baseRewards + lockBonus

      // Calculate allocation breakdown
      const allocationBreakdown = Object.entries(allocation)
        .filter(([_, pct]) => pct > 0)
        .map(([protocol, pct]) => ({
          protocol,
          amount: amount * pct,
          apy: protocolAPY[protocol as keyof ProtocolAPY] || 0,
        }))

      return {
        expectedRewards,
        lockBonus,
        apy: pool.baseApy + (lockType === 'locked_30' ? pool.lockBonusApy : 0),
        allocation: allocationBreakdown,
      }
    },
    [pools, protocolAPY]
  )

  /**
   * Stake tokens with selected yield strategy
   */
  const stake = useCallback(
    async (
      poolId: string,
      amount: number,
      lockType: 'flexible' | 'locked_30',
      strategy: YieldStrategy
    ) => {
      if (!publicKey || !yieldManager) {
        throw new Error('Wallet not connected')
      }

      setLoading(true)

      try {
        // 1. Allocate to yield protocols
        const transactions = await yieldManager.stake(amount, strategy, publicKey)

        // 2. Build combined transaction
        // TODO: Combine all protocol transactions + wave_stake stake instruction

        // 3. Sign and send
        // TODO: Implement signing and sending

        console.log(`[useYieldStaking] Staked ${amount} to ${poolId} with ${strategy} strategy`)

        return {
          success: true,
          txid: 'mock_txid',
          allocation: YIELD_ALLOCATION[strategy],
        }
      } catch (error) {
        console.error('[useYieldStaking] Stake failed:', error)
        throw error
      } finally {
        setLoading(false)
      }
    },
    [publicKey, yieldManager]
  )

  /**
   * Unstake tokens
   */
  const unstake = useCallback(
    async (poolId: string, amount: number) => {
      if (!publicKey) {
        throw new Error('Wallet not connected')
      }

      setLoading(true)

      try {
        // 1. Check lock period
        const position = positions.find((p) => p.poolId === poolId)
        if (!position) {
          throw new Error('Position not found')
        }

        if (position.lockType === 'locked_30' && position.unlockTime!) {
          const now = Date.now() / 1000
          if (now < position.unlockTime) {
            throw new Error('Tokens are still locked')
          }
        }

        // 2. Withdraw from yield protocols
        // TODO: Implement withdrawal from each protocol

        // 3. Unstake from wave_stake program
        // TODO: Build unstake transaction

        console.log(`[useYieldStaking] Unstaked ${amount} from ${poolId}`)

        return {
          success: true,
          txid: 'mock_txid',
        }
      } catch (error) {
        console.error('[useYieldStaking] Unstake failed:', error)
        throw error
      } finally {
        setLoading(false)
      }
    },
    [publicKey, positions]
  )

  /**
   * Claim rewards
   */
  const claim = useCallback(
    async (poolId: string) => {
      if (!publicKey) {
        throw new Error('Wallet not connected')
      }

      setLoading(true)

      try {
        // TODO: Implement claim rewards transaction
        console.log(`[useYieldStaking] Claimed rewards from ${poolId}`)

        return {
          success: true,
          txid: 'mock_txid',
          amount: 0,
        }
      } catch (error) {
        console.error('[useYieldStaking] Claim failed:', error)
        throw error
      } finally {
        setLoading(false)
      }
    },
    [publicKey]
  )

  /**
   * Fetch user's staking positions
   */
  const fetchPositions = useCallback(async () => {
    if (!publicKey) {
      return
    }

    setLoading(true)

    try {
      // TODO: Fetch from wave_stake program
      // TODO: Fetch positions from each yield protocol

      console.log(`[useYieldStaking] Fetched positions for ${publicKey.toString()}`)

      setPositions([])
    } catch (error) {
      console.error('[useYieldStaking] Fetch positions failed:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }, [publicKey])

  /**
   * Fetch available pools
   */
  const fetchPools = useCallback(async () => {
    setLoading(true)

    try {
      // TODO: Fetch pools from API or on-chain
      const mockPools: StakingPool[] = [
        {
          id: 'wave',
          name: 'WAVE',
          stakeMint: 'WAVE_MINT_ADDRESS',
          rewardMint: 'WEALTH_MINT_ADDRESS',
          baseApy: 15.0, // Will be updated based on protocol APYs
          lockBonusApy: 7.5, // 50% bonus
          totalStaked: 0,
          isActive: true,
        },
        {
          id: 'wealth',
          name: 'WEALTH',
          stakeMint: 'WEALTH_MINT_ADDRESS',
          rewardMint: 'WAVE_MINT_ADDRESS',
          baseApy: 15.0,
          lockBonusApy: 7.5,
          totalStaked: 0,
          isActive: true,
        },
      ]

      setPools(mockPools)
    } catch (error) {
      console.error('[useYieldStaking] Fetch pools failed:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    // State
    pools,
    positions,
    protocolAPY,
    loading,

    // Methods
    stake,
    unstake,
    claim,
    getQuote,
    fetchPositions,
    fetchPools,
  }
}
