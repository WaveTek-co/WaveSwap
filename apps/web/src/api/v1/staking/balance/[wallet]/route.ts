import { NextRequest, NextResponse } from 'next/server'
import { STAKING_POOLS, calculateLockEnd } from '@/types/staking'

// Mock user stake data - in production this would come from the Solana program
const MOCK_USER_STAKES: Record<string, any> = {
  'vivgdu332GMEk3FaupQa92gQjYd9LX6TMgjMVsLaCu4': {
    'zec-pool': {
      stakedAmount: 1000000, // 1 ZEC in token units (6 decimals)
      rewardsEarned: 50000, // 0.05 WEALTH in token units
      rewardPerTokenPaid: 1000000, // Mock value
      lockType: 'locked_30' as const,
      lockEnd: calculateLockEnd('locked_30'),
      lastUpdated: Math.floor(Date.now() / 1000)
    },
    'wave-pool': {
      stakedAmount: 500000, // 0.5 WAVE in token units
      rewardsEarned: 25000, // 0.025 ZEC in token units
      rewardPerTokenPaid: 800000, // Mock value
      lockType: 'flexible' as const,
      lockEnd: undefined,
      lastUpdated: Math.floor(Date.now() / 1000)
    }
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { wallet: string } }
) {
  try {
    const wallet = params.wallet

    if (!wallet) {
      return NextResponse.json(
        {
          success: false,
          error: 'Wallet address is required'
        },
        { status: 400 }
      )
    }

    const userStakes = MOCK_USER_STAKES[wallet] || {}
    const balances: any[] = []

    for (const pool of STAKING_POOLS) {
      const userStake = userStakes[pool.id]

      if (userStake || pool.isActive) {
        const balance = {
          poolId: pool.id,
          poolName: pool.name,
          stakedAmount: userStake?.stakedAmount || 0,
          pendingRewards: userStake?.rewardsEarned || 0,
          claimableRewards: userStake?.rewardsEarned || 0,
          currentValue: userStake?.stakedAmount || 0,
          lockInfo: {
            type: userStake?.lockType || 'flexible',
            unlockTime: userStake?.lockEnd,
            isLocked: userStake?.lockType === 'locked_30' &&
                     (userStake?.lockEnd || 0) > Math.floor(Date.now() / 1000)
          },
          formatted: {
            stakedAmount: userStake ? (userStake.stakedAmount / 1_000_000).toFixed(6) : '0',
            pendingRewards: userStake ? (userStake.rewardsEarned / 1_000_000).toFixed(6) : '0',
            claimableRewards: userStake ? (userStake.rewardsEarned / 1_000_000).toFixed(6) : '0',
            currentValue: userStake ? (userStake.stakedAmount / 1_000_000).toFixed(6) : '0'
          }
        }

        balances.push(balance)
      }
    }

    const totalStaked = balances.reduce((sum, balance) => sum + balance.stakedAmount, 0)
    const totalRewards = balances.reduce((sum, balance) => sum + balance.claimableRewards, 0)

    return NextResponse.json({
      success: true,
      data: {
        wallet,
        balances,
        summary: {
          totalStaked,
          totalRewards,
          totalStakedFormatted: (totalStaked / 1_000_000).toFixed(6),
          totalRewardsFormatted: (totalRewards / 1_000_000).toFixed(6),
          totalValueUsd: 0 // Would calculate based on token prices
        }
      }
    })
  } catch (error) {
    console.error('Error fetching staking balance:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch staking balance',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}