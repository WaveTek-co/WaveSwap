import { NextRequest, NextResponse } from 'next/server'
import { STAKING_POOLS } from '@/types/staking'

export async function GET(request: NextRequest) {
  try {
    // For now, return static pool configurations
    // In the future, this could fetch from the actual Solana program
    const pools = STAKING_POOLS.map(pool => ({
      ...pool,
      tvl: pool.totalStaked * 0.1, // Mock TVL calculation
      apy: pool.isActive ? pool.baseApy : 0,
      lockBonusApy: pool.isActive ? pool.lockBonusApy : 0
    }))

    return NextResponse.json({
      success: true,
      data: {
        pools,
        count: pools.length,
        totalTvl: pools.reduce((sum, pool) => sum + (pool.tvl || 0), 0)
      }
    })
  } catch (error) {
    console.error('Error fetching staking pools:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch staking pools',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}