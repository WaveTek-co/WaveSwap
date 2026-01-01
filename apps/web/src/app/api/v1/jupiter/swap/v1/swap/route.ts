import { NextRequest, NextResponse } from 'next/server'
import { JupiterAPI } from '@/lib/jupiter'
import { Connection } from '@solana/web3.js'
import { config } from '@/lib/config'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { quoteResponse, userPublicKey, wrapAndUnwrapSol, useSharedAccounts, feeAccount, asLegacyTransaction, prioritizationFeeLamports } = body

    if (!quoteResponse || !userPublicKey) {
      return NextResponse.json(
        { error: 'Missing required parameters: quoteResponse, userPublicKey' },
        { status: 400 }
      )
    }

    // Initialize connection and Jupiter API using configured RPC
    const connection = new Connection(config.rpc.url, 'confirmed')

    const jupiterApi = JupiterAPI.createClient(connection)

    const swapParams = {
      quoteResponse,
      userPublicKey,
      wrapAndUnwrapSol: wrapAndUnwrapSol || true,
      useSharedAccounts: useSharedAccounts || false,
      feeAccount: feeAccount || undefined,
      asLegacyTransaction: asLegacyTransaction || false,
      prioritizationFeeLamports: prioritizationFeeLamports || undefined
    }

    const swapResult = await jupiterApi.getSwapTransaction(swapParams)

    return NextResponse.json(swapResult)
  } catch (error: any) {
    console.error('[Jupiter Swap API] Error:', error)

    // Handle specific Jupiter API errors
    if (error.message.includes('Jupiter API returned status 404')) {
      return NextResponse.json(
        { error: 'Jupiter API endpoint not found. Please check the quote.' },
        { status: 404 }
      )
    }

    if (error.message.includes('Invalid swap request')) {
      return NextResponse.json(
        { error: 'Invalid swap parameters.' },
        { status: 400 }
      )
    }

    if (error.message.includes('Rate limit')) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again in a moment.' },
        { status: 429 }
      )
    }

    return NextResponse.json(
      { error: error.message || 'Failed to execute swap with Jupiter' },
      { status: 500 }
    )
  }
}