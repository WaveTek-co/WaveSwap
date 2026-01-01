/**
 * Type guards and validation utilities for WaveStake
 */

import { PublicKey, Transaction } from '@solana/web3.js'

/**
 * Validates if a string is a valid pool ID
 */
export function isValidPoolId(poolId: string): boolean {
  return (
    typeof poolId === 'string' &&
    poolId.length > 0 &&
    poolId.length <= 32 &&
    /^[a-z0-9]+$/i.test(poolId)
  )
}

/**
 * Validates if a value is a valid lock type
 */
export function isValidLockType(lockType: number): boolean {
  return lockType === 0 || lockType === 1 // FLEXIBLE or LOCKED_30_DAYS
}

/**
 * Validates if a value is a valid staking amount
 */
export function isValidStakeAmount(amount: number): boolean {
  return (
    typeof amount === 'number' &&
    !isNaN(amount) &&
    isFinite(amount) &&
    amount > 0 &&
    Number.isInteger(amount * 1e6) // Can be converted to smallest unit
  )
}

/**
 * Validates if a timestamp is valid
 */
export function isValidTimestamp(timestamp: number): boolean {
  const now = Math.floor(Date.now() / 1000)
  return (
    typeof timestamp === 'number' &&
    !isNaN(timestamp) &&
    isFinite(timestamp) &&
    timestamp > 0 &&
    timestamp <= now + 86400 * 365 // Not more than 1 year in future
  )
}

/**
 * Type guard for PublicKey
 */
export function isPublicKey(obj: any): obj is PublicKey {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.toBase58 === 'function' &&
    typeof obj.toBytes === 'function'
  )
}

/**
 * Type guard for Transaction
 */
export function isTransaction(obj: any): obj is Transaction {
  return (
    obj &&
    typeof obj === 'object' &&
    Array.isArray(obj.instructions) &&
    typeof obj.compile === 'function' &&
    typeof obj.add === 'function'
  )
}

/**
 * Validates pool configuration parameters
 */
export function validatePoolConfig(params: {
  poolId: string
  stakeMint: PublicKey
  lstMint: PublicKey
  rewardMint: PublicKey
  rewardPerSecond: number
  lockDuration: number
  lockBonusPercentage: number
}): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!isValidPoolId(params.poolId)) {
    errors.push('Invalid pool ID')
  }

  if (!isPublicKey(params.stakeMint)) {
    errors.push('Invalid stake mint')
  }

  if (!isPublicKey(params.lstMint)) {
    errors.push('Invalid LST mint')
  }

  if (!isPublicKey(params.rewardMint)) {
    errors.push('Invalid reward mint')
  }

  if (params.rewardPerSecond < 0) {
    errors.push('Reward per second must be non-negative')
  }

  if (params.lockDuration < 0) {
    errors.push('Lock duration must be non-negative')
  }

  if (params.lockBonusPercentage < 0 || params.lockBonusPercentage > 10000) {
    errors.push('Lock bonus percentage must be between 0 and 10000 (0-100%)')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Validates stake parameters
 */
export function validateStakeParams(params: {
  poolId: string
  amount: number
  lockType: number
}): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!isValidPoolId(params.poolId)) {
    errors.push('Invalid pool ID')
  }

  if (!isValidStakeAmount(params.amount)) {
    errors.push('Invalid stake amount')
  }

  if (!isValidLockType(params.lockType)) {
    errors.push('Invalid lock type')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Validates unstake parameters
 */
export function validateUnstakeParams(params: {
  poolId: string
  amount: number
  userStake?: {
    amount: bigint | number
    lockType: number
    lockEndTimestamp: number
  }
}): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!isValidPoolId(params.poolId)) {
    errors.push('Invalid pool ID')
  }

  if (!isValidStakeAmount(params.amount)) {
    errors.push('Invalid unstake amount')
  }

  if (params.userStake) {
    const userAmount = typeof params.userStake.amount === 'bigint'
      ? Number(params.userStake.amount)
      : params.userStake.amount

    if (params.amount * 1e6 > userAmount) {
      errors.push('Unstake amount exceeds user stake')
    }

    if (params.userStake.lockType === 1) { // LOCKED_30_DAYS
      const now = Math.floor(Date.now() / 1000)
      if (now < params.userStake.lockEndTimestamp) {
        errors.push('Cannot unstake during lock period')
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Formats stake amount for display
 */
export function formatStakeAmount(amount: number | bigint, decimals: number = 6): string {
  const num = typeof amount === 'bigint' ? Number(amount) / 1e6 : amount
  return num.toFixed(decimals)
}

/**
 * Formats lock duration for display
 */
export function formatLockDuration(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (days > 0) {
    return `${days} day${days > 1 ? 's' : ''}`
  } else if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''}`
  } else if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? 's' : ''}`
  } else {
    return 'Flexible'
  }
}

/**
 * Calculates APY from reward rate
 */
export function calculateAPY(
  rewardPerSecond: number,
  totalStaked: number | bigint,
  tokenDecimals: number = 6
): number {
  if (totalStaked === 0) return 0

  const staked = typeof totalStaked === 'bigint' ? Number(totalStaked) : totalStaked
  const rewardsPerYear = rewardPerSecond * 31536000 // Seconds in a year

  return (rewardsPerYear / staked) * 100
}

/**
 * Error types
 */
export enum WaveStakeErrorType {
  INVALID_POOL_ID = 'INVALID_POOL_ID',
  INVALID_AMOUNT = 'INVALID_AMOUNT',
  INVALID_LOCK_TYPE = 'INVALID_LOCK_TYPE',
  WALLET_NOT_CONNECTED = 'WALLET_NOT_CONNECTED',
  PROVIDER_NOT_INITIALIZED = 'PROVIDER_NOT_INITIALIZED',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  STILL_LOCKED = 'STILL_LOCKED',
  POOL_NOT_FOUND = 'POOL_NOT_FOUND',
}

/**
 * Custom error class
 */
export class WaveStakeError extends Error {
  constructor(
    public type: WaveStakeErrorType,
    message: string,
    public details?: any
  ) {
    super(message)
    this.name = 'WaveStakeError'
  }
}

/**
 * Wraps errors with context
 */
export function wrapError(error: unknown, context: string): WaveStakeError {
  if (error instanceof WaveStakeError) {
    return error
  }

  if (error instanceof Error) {
    return new WaveStakeError(
      WaveStakeErrorType.PROVIDER_NOT_INITIALIZED,
      `${context}: ${error.message}`,
      { originalError: error }
    )
  }

  return new WaveStakeError(
    WaveStakeErrorType.PROVIDER_NOT_INITIALIZED,
    `${context}: Unknown error`,
    { originalError: error }
  )
}
