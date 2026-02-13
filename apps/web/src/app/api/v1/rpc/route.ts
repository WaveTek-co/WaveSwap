import { NextRequest, NextResponse } from 'next/server'

// Server-side only RPC URL (never exposed to browser)
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'

/**
 * RPC proxy route - forwards Solana JSON-RPC requests to Helius
 * without exposing the API key to the client.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.text()

    const response = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })

    const data = await response.text()

    return new NextResponse(data, {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    return NextResponse.json(
      { jsonrpc: '2.0', error: { code: -32000, message: 'RPC proxy error' }, id: null },
      { status: 502 }
    )
  }
}
