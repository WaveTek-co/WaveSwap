import { NextRequest, NextResponse } from 'next/server'
import { STAKING_POOLS } from '@/types/staking'
import { Connection } from '@solana/web3.js'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { wallet, poolId } = body

    if (!wallet || !poolId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required parameters: wallet, poolId'
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

    // Mock user rewards check - in production this would query the program
    const mockUserRewards = 50000 // 0.05 tokens in token units

    if (mockUserRewards === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No rewards available to claim'
        },
        { status: 400 }
      )
    }

    const connection = new Connection(process.env.NEXT_PUBLIC_HELIUS_RPC_URL!)

    const mockTransaction = {
      type: 'claim' as const,
      poolId,
      amount: mockUserRewards,
      wallet,
      estimatedFee: 0.000005, // 5000 lamports
      transaction: 'mock_claim_transaction_base64',
      instructions: [
        {
          programId: '11111111111111111111111111111112', // Mock program ID
          accounts: [
            { pubkey: wallet, isSigner: true, isWritable: true },
            { pubkey: pool.rewardMint, isSigner: false, isWritable: false }
          ],
          data: Buffer.from([2, 1, 2, 3, 4, 5, 6, 7, 8]) // Mock instruction data
        }
      ]
    }

    return NextResponse.json({
      success: true,
      data: {
        ...mockTransaction,
        formatted: {
          amount: (mockUserRewards / 1_000_000).toFixed(6),
          fee: mockTransaction.estimatedFee.toString(),
          rewardToken: pool.name === 'ZEC' ? 'WEALTH' : 'ZEC'
        }
      }
    })
  } catch (error) {
    console.error('Error creating claim transaction:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create claim transaction',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}