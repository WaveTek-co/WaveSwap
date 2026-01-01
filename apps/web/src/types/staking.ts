export interface StakingPool {
  id: string
  name: string
  stakeMint: string
  rewardMint: string
  baseApy: number
  lockBonusApy: number
  totalStaked: number
  rewardRate: number
  periodFinish: number
  isActive: boolean
}

export interface UserStake {
  user: string
  poolId: string
  stakedAmount: number
  rewardsEarned: number
  rewardPerTokenPaid: number
  lockType: 'flexible' | 'locked_30'
  lockEnd?: number
  lastUpdated: number
}

export interface StakingQuote {
  pool: StakingPool
  amount: number
  lockType: 'flexible' | 'locked_30'
  estimatedRewards: number
  apy: number
  lockBonus: number
  estimatedLockEnd?: number
}

export interface StakingTransaction {
  type: 'stake' | 'withdraw' | 'claim'
  poolId: string
  amount?: number
  lockType?: 'flexible' | 'locked_30'
  transaction: string
  fee: number
}

export interface StakingBalance {
  poolId: string
  stakedAmount: number
  pendingRewards: number
  claimableRewards: number
  currentValue: number
  lockInfo: {
    type: 'flexible' | 'locked_30'
    unlockTime?: number
    isLocked: boolean
  }
}

// Pool configurations matching the UI
export const STAKING_POOLS: StakingPool[] = [
  {
    id: 'zec-pool',
    name: 'ZEC',
    stakeMint: '2B5VTGATza3pKJsgksNa8RRzwG3V8hKRJxEyN76Ut59qp', // ZEC mint address
    rewardMint: '8K9QWCrqJUbKMKJKf4xNHRd9YDBze6hY8a2ZkKhJKWMn', // WEALTH mint address
    baseApy: 0.28, // 28%
    lockBonusApy: 0.0888, // 8.88%
    totalStaked: 0,
    rewardRate: 0,
    periodFinish: 0,
    isActive: true
  },
  {
    id: 'wave-pool',
    name: 'WAVE',
    stakeMint: '8K9QWCrqJUbKMKJKf4xNHRd9YDBze6hY8a2ZkKhJKWMn', // WEALTH mint address
    rewardMint: '2B5VTGATza3pKJsgksNa8RRzwG3V8hKRJxEyN76Ut59qp', // ZEC mint address
    baseApy: 0.28, // 28%
    lockBonusApy: 0.0888, // 8.88%
    totalStaked: 0,
    rewardRate: 0,
    periodFinish: 0,
    isActive: true
  },
  {
    id: 'wealth-pool',
    name: 'WEALTH',
    stakeMint: '8K9QWCrqJUbKMKJKf4xNHRd9YDBze6hY8a2ZkKhJKWMn', // WEALTH mint address
    rewardMint: '2B5VTGATza3pKJsgksNa8RRzwG3V8hKRJxEyN76Ut59qp', // ZEC mint address
    baseApy: 0.28, // 28%
    lockBonusApy: 0.0888, // 8.88%
    totalStaked: 0,
    rewardRate: 0,
    periodFinish: 0,
    isActive: true
  },
  {
    id: 'gold-pool',
    name: 'GOLD',
    stakeMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC mint address (placeholder for GOLD)
    rewardMint: '2B5VTGATza3pKJsgksNa8RRzwG3V8hKRJxEyN76Ut59qp', // ZEC mint address
    baseApy: 0.08, // 8%
    lockBonusApy: 0.028, // 2.8%
    totalStaked: 0,
    rewardRate: 0,
    periodFinish: 0,
    isActive: false // Coming soon
  }
]

export const LOCK_DURATION = 30 * 24 * 60 * 60 // 30 days in seconds

export function calculateRewards(
  stakedAmount: number,
  rewardPerToken: number,
  rewardPerTokenPaid: number,
  rewardsEarned: number
): number {
  const rewardDiff = rewardPerToken - rewardPerTokenPaid
  const newReward = (stakedAmount * rewardDiff) / 1_000_000
  return rewardsEarned + newReward
}

export function calculateApy(baseApy: number, lockBonusApy: number, lockType: 'flexible' | 'locked_30'): number {
  if (lockType === 'locked_30') {
    return baseApy + lockBonusApy
  }
  return baseApy
}

export function formatTokenAmount(amount: number, decimals: number = 6): string {
  return (amount / Math.pow(10, decimals)).toFixed(decimals).replace(/\.?0+$/, '')
}

export function calculateLockEnd(lockType: 'flexible' | 'locked_30'): number | undefined {
  if (lockType === 'locked_30') {
    return Math.floor(Date.now() / 1000) + LOCK_DURATION
  }
  return undefined
}