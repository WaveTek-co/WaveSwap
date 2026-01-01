import { NextRequest, NextResponse } from 'next/server'
import { STAKING_POOLS, calculateApy, calculateLockEnd, formatTokenAmount } from '@/types/staking'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const poolId = searchParams.get('poolId')
    const amount = searchParams.get('amount')
    const lockType = searchParams.get('lockType') as 'flexible' | 'locked_30' || 'flexible'

    if (!poolId || !amount) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required parameters: poolId, amount'
        },
        { status: 400 }
      )
    }

    const pool = STAKING_POOLS.find(p => p.id === poolId)
    if (!pool) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid pool ID'
        },
        { status: 404 }
      )
    }

    const stakeAmount = parseFloat(amount)
    if (isNaN(stakeAmount) || stakeAmount <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid amount'
        },
        { status: 400 }
      )
    }

    // Calculate rewards based on APR
    const apy = calculateApy(pool.baseApy, pool.lockBonusApy, lockType)
    const dailyRate = apy / 365
    const lockEnd = calculateLockEnd(lockType)
    const lockDays = lockEnd ? Math.floor((lockEnd - Math.floor(Date.now() / 1000)) / (24 * 60 * 60)) : 0

    // Simple reward calculation (this would be more complex with actual time-based calculations)
    const estimatedRewards = stakeAmount * dailyRate * (lockDays || 30)

    const quote = {
      pool,
      amount: stakeAmount,
      lockType,
      estimatedRewards,
      apy,
      lockBonus: lockType === 'locked_30' ? pool.lockBonusApy : 0,
      estimatedLockEnd: lockEnd,
      lockDays,
      formatted: {
        amount: formatTokenAmount(stakeAmount * 1_000_000), // Convert to token units
        estimatedRewards: formatTokenAmount(estimatedRewards * 1_000_000),
        apy: `${(apy * 100).toFixed(2)}%`
      }
    }

    return NextResponse.json({
      success: true,
      data: quote
    })
  } catch (error) {
    console.error('Error generating staking quote:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to generate staking quote',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}