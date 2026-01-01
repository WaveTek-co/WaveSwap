import { NextRequest, NextResponse } from 'next/server'
import { Connection } from '@solana/web3.js'

// Direct config to avoid initialization issues
const RPC_URL = process.env.NEXT_PUBLIC_HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com'

/**
 * Proxy API endpoint to send raw transaction server-side to avoid client-side timeout issues
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { serializedTransaction, minContextSlot, preflightCommitment = 'confirmed', maxRetries = 3 } = body

    if (!serializedTransaction) {
      return NextResponse.json(
        { error: 'Missing serializedTransaction parameter' },
        { status: 400 }
      )
    }

    console.log('[Send Transaction Proxy] Processing transaction send request')

    // Create connection server-side where API key is secure
    const connection = new Connection(RPC_URL, {
      commitment: 'confirmed',
      httpHeaders: {
        'Content-Type': 'application/json',
      }
    })

    console.log('[Send Transaction Proxy] Sending transaction to Solana network...')

    // Send the transaction with server-side timeout
    const signature = await Promise.race([
      connection.sendRawTransaction(
        Buffer.from(serializedTransaction, 'base64'),
        {
          minContextSlot,
          preflightCommitment,
          maxRetries
        }
      ),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Server-side transaction send timeout')), 30000)
      )
    ])

    console.log('[Send Transaction Proxy] Transaction sent successfully:', signature)

    return NextResponse.json({
      success: true,
      signature,
      message: 'Transaction sent successfully'
    })

  } catch (error) {
    console.error('[Send Transaction Proxy] Error sending transaction:', error)

    return NextResponse.json({
      success: false,
      error: error?.message || 'Unknown error',
      details: {
        name: error?.name,
        code: error?.code,
        stack: error?.stack
      }
    }, { status: 500 })
  }
}