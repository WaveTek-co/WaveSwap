import { NextRequest, NextResponse } from 'next/server'
import { Connection } from '@solana/web3.js'
import { config } from '@/lib/config'

/**
 * Proxy API endpoint to get latest blockhash server-side to avoid CORS and timeout issues
 */
export async function GET(request: NextRequest) {
  try {
    // Create connection server-side where API key is secure
    const connection = new Connection(config.rpc.url, {
      commitment: 'confirmed',
      httpHeaders: {
        'Content-Type': 'application/json',
      }
    })

    console.log('[Blockhash Proxy] Getting latest blockhash...')

    // Get latest blockhash with server-side timeout
    const result = await Promise.race([
      connection.getLatestBlockhashAndContext(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Server-side blockhash timeout')), 30000)
      )
    ])

    console.log('[Blockhash Proxy] Blockhash received successfully')

    return NextResponse.json({
      success: true,
      blockhash: result.value.blockhash,
      lastValidBlockHeight: result.value.lastValidBlockHeight,
      context: {
        slot: result.context.slot,
        apiVersion: result.context.apiVersion
      }
    })

  } catch (error) {
    console.error('[Blockhash Proxy] Error getting blockhash:', error)

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