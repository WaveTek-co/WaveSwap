import { NextRequest, NextResponse } from 'next/server'
import { STAKING_POOLS, calculateLockEnd } from '@/types/staking'
import { Connection, PublicKey, Transaction, SystemProgram } from '@solana/web3.js'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { wallet, poolId, amount, lockType = 'flexible' } = body

    if (!wallet || !poolId || !amount) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required parameters: wallet, poolId, amount'
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

    // Convert amount to token units (assuming 6 decimals like most SPL tokens)
    const tokenAmount = Math.floor(stakeAmount * 1_000_000)

    // For now, return a mock transaction
    // In production, this would build an actual Solana transaction
    const connection = new Connection(process.env.NEXT_PUBLIC_HELIUS_RPC_URL!)

    const mockTransaction = {
      type: 'stake' as const,
      poolId,
      amount: tokenAmount,
      lockType,
      wallet,
      estimatedFee: 0.000005, // 5000 lamports
      transaction: 'mock_transaction_base64', // Would be actual transaction
      lockEnd: calculateLockEnd(lockType),
      instructions: [
        {
          programId: '11111111111111111111111111111112', // Mock program ID
          accounts: [
            { pubkey: wallet, isSigner: true, isWritable: true },
            { pubkey: pool.stakeMint, isSigner: false, isWritable: false }
          ],
          data: Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8]) // Mock instruction data
        }
      ]
    }

    // Calculate estimated rewards for display
    const apy = lockType === 'locked_30' ? pool.baseApy + pool.lockBonusApy : pool.baseApy
    const dailyRate = apy / 365
    const lockDays = lockType === 'locked_30' ? 30 : 30
    const estimatedRewards = stakeAmount * dailyRate * lockDays

    return NextResponse.json({
      success: true,
      data: {
        ...mockTransaction,
        estimatedRewards,
        formatted: {
          amount: stakeAmount.toFixed(6),
          estimatedRewards: estimatedRewards.toFixed(6),
          fee: mockTransaction.estimatedFee.toString(),
          apy: `${(apy * 100).toFixed(2)}%`,
          lockEnd: mockTransaction.lockEnd ?
            new Date(mockTransaction.lockEnd * 1000).toLocaleDateString() :
            'Flexible'
        }
      }
    })
  } catch (error) {
    console.error('Error creating stake transaction:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create stake transaction',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}