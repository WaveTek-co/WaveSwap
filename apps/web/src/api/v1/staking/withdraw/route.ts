import { NextRequest, NextResponse } from 'next/server'
import { STAKING_POOLS } from '@/types/staking'
import { Connection } from '@solana/web3.js'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { wallet, poolId, amount } = body

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

    const withdrawAmount = parseFloat(amount)
    if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid amount'
        },
        { status: 400 }
      )
    }

    // Convert amount to token units
    const tokenAmount = Math.floor(withdrawAmount * 1_000_000)

    // Check if user has sufficient staked amount (mock check)
    // In production, this would query the actual user state from the program
    const mockUserStake = 1000000 // 1 token in token units

    if (tokenAmount > mockUserStake) {
      return NextResponse.json(
        {
          success: false,
          error: 'Insufficient staked amount',
          details: {
            staked: mockUserStake,
            requested: tokenAmount
          }
        },
        { status: 400 }
      )
    }

    const connection = new Connection(process.env.NEXT_PUBLIC_HELIUS_RPC_URL!)

    const mockTransaction = {
      type: 'withdraw' as const,
      poolId,
      amount: tokenAmount,
      wallet,
      estimatedFee: 0.000005, // 5000 lamports
      transaction: 'mock_withdraw_transaction_base64',
      instructions: [
        {
          programId: '11111111111111111111111111111112', // Mock program ID
          accounts: [
            { pubkey: wallet, isSigner: true, isWritable: true },
            { pubkey: pool.stakeMint, isSigner: false, isWritable: false }
          ],
          data: Buffer.from([1, 1, 2, 3, 4, 5, 6, 7, 8]) // Mock instruction data
        }
      ]
    }

    return NextResponse.json({
      success: true,
      data: {
        ...mockTransaction,
        formatted: {
          amount: withdrawAmount.toFixed(6),
          fee: mockTransaction.estimatedFee.toString(),
          remainingStaked: ((mockUserStake - tokenAmount) / 1_000_000).toFixed(6)
        }
      }
    })
  } catch (error) {
    console.error('Error creating withdraw transaction:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create withdraw transaction',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}