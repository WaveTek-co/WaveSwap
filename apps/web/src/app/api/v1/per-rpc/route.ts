import { NextRequest, NextResponse } from 'next/server'

// MagicBlock PER RPC endpoint (server-side only, bypasses CORS)
const PER_RPC_URL = process.env.MAGICBLOCK_PER_RPC_URL || 'https://devnet-as.magicblock.app'

/**
 * PER RPC proxy route - forwards Solana JSON-RPC requests to MagicBlock PER
 * without exposing the endpoint to CORS restrictions in the browser.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.text()

    const response = await fetch(PER_RPC_URL, {
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
      { jsonrpc: '2.0', error: { code: -32000, message: 'PER RPC proxy error' }, id: null },
      { status: 502 }
    )
  }
}
