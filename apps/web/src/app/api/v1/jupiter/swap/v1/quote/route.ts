import { NextRequest, NextResponse } from 'next/server'
import { JupiterAPI } from '@/lib/jupiter'
import { Connection } from '@solana/web3.js'
import { config } from '@/lib/config'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const inputMint = searchParams.get('inputMint')
    const outputMint = searchParams.get('outputMint')
    const amount = searchParams.get('amount')
    const slippageBps = searchParams.get('slippageBps')
    const userPublicKey = searchParams.get('userPublicKey')
    const onlyDirectRoutes = searchParams.get('onlyDirectRoutes')
    const asLegacyTransaction = searchParams.get('asLegacyTransaction')

    if (!inputMint || !outputMint || !amount) {
      return NextResponse.json(
        { error: 'Missing required parameters: inputMint, outputMint, amount' },
        { status: 400 }
      )
    }

    // Initialize connection and Jupiter API using configured RPC
    const connection = new Connection(config.rpc.url, 'confirmed')

    const jupiterApi = JupiterAPI.createClient(connection)

    const quoteParams = {
      inputMint,
      outputMint,
      amount,
      slippageBps: slippageBps ? parseInt(slippageBps) : undefined,
      userPublicKey: userPublicKey || undefined,
      onlyDirectRoutes: onlyDirectRoutes === 'true',
      asLegacyTransaction: asLegacyTransaction === 'true'
    }

    const quote = await jupiterApi.getQuote(quoteParams)

    return NextResponse.json(quote)
  } catch (error: any) {
    console.error('[Jupiter Quote API] Error:', error)

    // Handle specific Jupiter API errors
    if (error.message.includes('Jupiter API returned status 404')) {
      return NextResponse.json(
        { error: 'Jupiter API endpoint not found. Please check token addresses.' },
        { status: 404 }
      )
    }

    if (error.message.includes('Invalid token address')) {
      return NextResponse.json(
        { error: 'One or more tokens are not supported by Jupiter.' },
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
      { error: error.message || 'Failed to get quote from Jupiter' },
      { status: 500 }
    )
  }
}