'use client'

import { useMemo, useEffect, useState, useCallback } from 'react'
import { useWallet } from '@/hooks/useWalletAdapter'
import { PublicKey, Transaction, Connection } from '@solana/web3.js'
import {
  waveStakeClient,
  LockType,
  WAVE_STAKE_PROGRAM_ID,
  getPoolPDA,
  getUserPDA
} from '@/lib/staking-client'

interface UserStake {
  amount: bigint
  lockType: number
  lockStartTimestamp: number
  lockEndTimestamp: number
  bonusMultiplier: number
  lastRewardClaimTimestamp: number
}

interface PoolData {
  poolId: number[]
  stakeMint: PublicKey
  lstMint: PublicKey
  rewardMint: PublicKey
  rewardPerSecond: bigint
  lockDuration: bigint
  lockBonusPercentage: number
  totalStaked: bigint
  totalRewardDistributed: bigint
  lastUpdateTimestamp: number
  authority: PublicKey
}

interface StakingState {
  userStakes: { [poolId: string]: UserStake | null }
  pools: { [poolId: string]: PoolData | null }
  loading: boolean
  error: string | null
}

export function useWaveStake() {
  const { connected, publicKey, signTransaction } = useWallet()
  const [connection] = useState(() => new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com'))
  const [state, setState] = useState<StakingState>({
    userStakes: {},
    pools: {},
    loading: false,
    error: null,
  })

  // Available pools
  const poolIds = useMemo(() => ['wave', 'wealth', 'sol'], [])

  // Initialize client with wallet
  useEffect(() => {
    console.log('[useWaveStake] Wallet state changed:', { connected, publicKey: publicKey?.toString(), hasSignTx: !!signTransaction })

    if (connected && publicKey && signTransaction) {
      try {
        console.log('[useWaveStake] Initializing WaveStake client...')
        waveStakeClient.setProvider({
          publicKey,
          signTransaction,
          signAllTransactions: async (txs) => Promise.all(txs.map(signTransaction)),
        })
        console.log('[useWaveStake] WaveStake client initialized successfully')
      } catch (error) {
        console.error('[useWaveStake] Failed to initialize WaveStake client:', error)
        setState((prev) => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Failed to initialize staking client'
        }))
      }
    } else {
      console.log('[useWaveStake] Skipping initialization - wallet not fully connected')
    }
  }, [connected, publicKey, signTransaction])

  // Fetch user stakes for all pools
  const fetchUserStakes = useCallback(async () => {
    if (!connected || !publicKey) return

    setState((prev) => ({ ...prev, loading: true, error: null }))

    try {
      const stakes: { [poolId: string]: UserStake | null } = {}

      for (const poolId of poolIds) {
        try {
          const stake = await waveStakeClient.fetchUserStake(poolId)

          if (stake) {
            stakes[poolId] = {
              amount: BigInt(stake.amount.toString()),
              lockType: stake.lockType,
              lockStartTimestamp: stake.lockStartTimestamp,
              lockEndTimestamp: stake.lockEndTimestamp,
              bonusMultiplier: stake.bonusMultiplier,
              lastRewardClaimTimestamp: stake.lastRewardClaimTimestamp,
            }
          } else {
            stakes[poolId] = null
          }
        } catch (error) {
          console.error(`Error fetching stake for pool ${poolId}:`, error)
          stakes[poolId] = null
        }
      }

      setState((prev) => ({ ...prev, userStakes: stakes, loading: false }))
    } catch (error: any) {
      console.error('Error fetching user stakes:', error)
      setState((prev) => ({ ...prev, loading: false, error: error.message }))
    }
  }, [connected, publicKey, poolIds])

  // Fetch pool data
  const fetchPools = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }))

    try {
      const pools: { [poolId: string]: PoolData | null } = {}

      for (const poolId of poolIds) {
        try {
          const pool = await waveStakeClient.fetchPool(poolId)

          if (pool) {
            pools[poolId] = {
              poolId: pool.poolId,
              stakeMint: new PublicKey(pool.stakeMint),
              lstMint: new PublicKey(pool.lstMint),
              rewardMint: new PublicKey(pool.rewardMint),
              rewardPerSecond: BigInt(pool.rewardPerSecond.toString()),
              lockDuration: BigInt(pool.lockDuration.toString()),
              lockBonusPercentage: pool.lockBonusPercentage,
              totalStaked: BigInt(pool.totalStaked.toString()),
              totalRewardDistributed: BigInt(pool.totalRewardDistributed.toString()),
              lastUpdateTimestamp: pool.lastUpdateTimestamp,
              authority: new PublicKey(pool.authority),
            }
          } else {
            pools[poolId] = null
          }
        } catch (error) {
          console.error(`Error fetching pool ${poolId}:`, error)
          pools[poolId] = null
        }
      }

      setState((prev) => ({ ...prev, pools, loading: false }))
    } catch (error: any) {
      console.error('Error fetching pools:', error)
      setState((prev) => ({ ...prev, loading: false, error: error.message }))
    }
  }, [poolIds])

  // Initial fetch
  useEffect(() => {
    if (connected) {
      fetchUserStakes()
      fetchPools()
    }
  }, [connected, fetchUserStakes, fetchPools])

  // Stake tokens
  const stake = useCallback(async (
    poolId: string,
    amount: number,
    lockType: LockType
  ) => {
    console.log('[useWaveStake] stake called:', { poolId, amount, lockType, connected, publicKey: publicKey?.toString() })

    if (!connected || !publicKey) {
      throw new Error('Wallet not connected')
    }

    // Ensure provider is initialized
    if (!signTransaction) {
      throw new Error('Wallet signTransaction not available')
    }

    // Re-initialize provider to ensure it's set
    try {
      waveStakeClient.setProvider({
        publicKey,
        signTransaction,
        signAllTransactions: async (txs) => Promise.all(txs.map(signTransaction)),
      })
      console.log('[useWaveStake] Provider re-initialized before stake')
    } catch (error) {
      console.error('[useWaveStake] Failed to initialize provider:', error)
    }

    setState((prev) => ({ ...prev, loading: true, error: null }))

    try {
      console.log('[useWaveStake] Getting recent blockhash...')
      const { blockhash } = await connection.getLatestBlockhash()

      console.log('[useWaveStake] Creating stake transaction...')
      const tx = await waveStakeClient.stake(
        poolId,
        Math.floor(amount * 1e9), // Convert SOL to lamports (1 SOL = 1e9 lamports)
        lockType
      )

      console.log('[useWaveStake] Stake transaction created successfully')

      // Create a new transaction with the instructions and set blockhash immediately
      const transaction = new Transaction()
      transaction.recentBlockhash = blockhash
      transaction.feePayer = publicKey

      // Add all instructions from the created transaction
      tx.instructions.forEach(ix => transaction.add(ix))

      console.log('[useWaveStake] Transaction prepared with blockhash:', blockhash)
      console.log('[useWaveStake] Transaction instructions count:', transaction.instructions.length)
      console.log('[useWaveStake] Fee payer:', transaction.feePayer?.toString())
      transaction.instructions.forEach((ix, i) => {
        console.log(`[useWaveStake] Instruction ${i}:`, {
          programId: ix.programId.toString(),
          keys: ix.keys.map(k => ({
            pubkey: k.pubkey?.toString() || 'UNDEFINED',
            isSigner: k.isSigner,
            isWritable: k.isWritable
          }))
        })
      })

      console.log('[useWaveStake] Signing transaction...')
      const signedTx = await signTransaction(transaction)
      console.log('[useWaveStake] Transaction signed')

      // Send transaction
      console.log('[useWaveStake] Sending transaction to blockchain...')
      const signature = await connection.sendRawTransaction(signedTx.serialize())
      console.log('[useWaveStake] Transaction sent! Signature:', signature)

      // Confirm transaction
      console.log('[useWaveStake] Confirming transaction...')
      await connection.confirmTransaction(signature, 'confirmed')
      console.log('[useWaveStake] Transaction confirmed!')

      setState((prev) => ({ ...prev, loading: false }))

      // Refresh data after successful transaction
      setTimeout(() => {
        refresh()
      }, 2000)

      return { transaction, signature }
    } catch (error: any) {
      console.error('[useWaveStake] Error creating stake transaction:', error)
      setState((prev) => ({ ...prev, loading: false, error: error.message }))
      throw error
    }
  }, [connected, publicKey, signTransaction, connection, refresh])

  // Unstake tokens
  const unstake = useCallback(async (
    poolId: string,
    amount: number
  ) => {
    if (!connected || !publicKey || !signTransaction) {
      throw new Error('Wallet not connected')
    }

    setState((prev) => ({ ...prev, loading: true, error: null }))

    try {
      console.log('[useWaveStake] Getting recent blockhash...')
      const { blockhash } = await connection.getLatestBlockhash()

      console.log('[useWaveStake] Creating unstake transaction...')
      const tx = await waveStakeClient.unstake(
        poolId,
        Math.floor(amount * 1e9) // Convert SOL to lamports
      )

      console.log('[useWaveStake] Unstake transaction created successfully')

      // Create a new transaction with the instructions and set blockhash immediately
      const transaction = new Transaction()
      transaction.recentBlockhash = blockhash
      transaction.feePayer = publicKey

      // Add all instructions from the created transaction
      tx.instructions.forEach(ix => transaction.add(ix))

      console.log('[useWaveStake] Transaction prepared with blockhash:', blockhash)
      console.log('[useWaveStake] Signing transaction...')
      const signedTx = await signTransaction(transaction)
      console.log('[useWaveStake] Transaction signed')

      // Send transaction
      console.log('[useWaveStake] Sending transaction to blockchain...')
      const signature = await connection.sendRawTransaction(signedTx.serialize())
      console.log('[useWaveStake] Transaction sent! Signature:', signature)

      // Confirm transaction
      console.log('[useWaveStake] Confirming transaction...')
      await connection.confirmTransaction(signature, 'confirmed')
      console.log('[useWaveStake] Transaction confirmed!')

      setState((prev) => ({ ...prev, loading: false }))

      // Refresh data after successful transaction
      setTimeout(() => {
        refresh()
      }, 2000)

      return { transaction, signature }
    } catch (error: any) {
      console.error('[useWaveStake] Error creating unstake transaction:', error)
      setState((prev) => ({ ...prev, loading: false, error: error.message }))
      throw error
    }
  }, [connected, publicKey, signTransaction, connection, refresh])

  // Claim rewards
  const claimRewards = useCallback(async (poolId: string) => {
    if (!connected || !publicKey || !signTransaction) {
      throw new Error('Wallet not connected')
    }

    setState((prev) => ({ ...prev, loading: true, error: null }))

    try {
      console.log('[useWaveStake] Getting recent blockhash...')
      const { blockhash } = await connection.getLatestBlockhash()

      console.log('[useWaveStake] Creating claim rewards transaction...')
      const tx = await waveStakeClient.claimRewards(poolId)

      console.log('[useWaveStake] Claim rewards transaction created successfully')

      // Create a new transaction with the instructions and set blockhash immediately
      const transaction = new Transaction()
      transaction.recentBlockhash = blockhash
      transaction.feePayer = publicKey

      // Add all instructions from the created transaction
      tx.instructions.forEach(ix => transaction.add(ix))

      console.log('[useWaveStake] Transaction prepared with blockhash:', blockhash)
      console.log('[useWaveStake] Signing transaction...')
      const signedTx = await signTransaction(transaction)
      console.log('[useWaveStake] Transaction signed')

      // Send transaction
      console.log('[useWaveStake] Sending transaction to blockchain...')
      const signature = await connection.sendRawTransaction(signedTx.serialize())
      console.log('[useWaveStake] Transaction sent! Signature:', signature)

      // Confirm transaction
      console.log('[useWaveStake] Confirming transaction...')
      await connection.confirmTransaction(signature, 'confirmed')
      console.log('[useWaveStake] Transaction confirmed!')

      setState((prev) => ({ ...prev, loading: false }))

      // Refresh data after successful transaction
      setTimeout(() => {
        refresh()
      }, 2000)

      return { transaction, signature }
    } catch (error: any) {
      console.error('[useWaveStake] Error creating claim rewards transaction:', error)
      setState((prev) => ({ ...prev, loading: false, error: error.message }))
      throw error
    }
  }, [connected, publicKey, signTransaction, connection, refresh])

  // Calculate pending rewards for a user stake
  const calculatePendingRewards = useCallback((
    userStake: UserStake,
    pool: PoolData
  ): number => {
    const now = Math.floor(Date.now() / 1000)
    const timeElapsed = now - userStake.lastRewardClaimTimestamp

    if (timeElapsed <= 0 || pool.totalStaked === 0n) {
      return 0
    }

    // Calculate user's share of the pool
    const userShare = (Number(userStake.amount) * 10000) / Number(pool.totalStaked)

    // Calculate rewards
    const rewardsPerSecond = Number(pool.rewardPerSecond)
    const baseRewards = (rewardsPerSecond * timeElapsed * userShare) / 10000

    // Apply bonus multiplier
    const bonusMultiplier = userStake.bonusMultiplier / 10000
    const totalRewards = baseRewards * bonusMultiplier

    return totalRewards / 1e6 // Convert to token units
  }, [])

  // Get user stake for a specific pool
  const getUserStake = useCallback((poolId: string): UserStake | null => {
    return state.userStakes[poolId] || null
  }, [state.userStakes])

  // Get pool data for a specific pool
  const getPoolData = useCallback((poolId: string): PoolData | null => {
    return state.pools[poolId] || null
  }, [state.pools])

  // Check if user can unstake (not in lock period)
  const canUnstake = useCallback((poolId: string): boolean => {
    const userStake = state.userStakes[poolId]
    if (!userStake) return false

    // Flexible staking can always unstake
    if (userStake.lockType === LockType.FLEXIBLE) {
      return true
    }

    // Locked staking - check if lock period has expired
    const now = Math.floor(Date.now() / 1000)
    return now >= userStake.lockEndTimestamp
  }, [state.userStakes])

  // Get time remaining for locked stakes
  const getLockTimeRemaining = useCallback((poolId: string): number | null => {
    const userStake = state.userStakes[poolId]
    if (!userStake || userStake.lockType === LockType.FLEXIBLE) {
      return null
    }

    const now = Math.floor(Date.now() / 1000)
    const remaining = userStake.lockEndTimestamp - now
    return Math.max(0, remaining)
  }, [state.userStakes])

  // Refresh all data
  const refresh = useCallback(async () => {
    await Promise.all([fetchUserStakes(), fetchPools()])
  }, [fetchUserStakes, fetchPools])

  return {
    // State
    userStakes: state.userStakes,
    pools: state.pools,
    loading: state.loading,
    error: state.error,

    // Methods
    stake,
    unstake,
    claimRewards,
    getUserStake,
    getPoolData,
    calculatePendingRewards,
    canUnstake,
    getLockTimeRemaining,
    refresh,

    // Helpers
    connected,
    publicKey,
    programId: WAVE_STAKE_PROGRAM_ID,
  }
}
