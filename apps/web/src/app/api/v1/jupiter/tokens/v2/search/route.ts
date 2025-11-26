/**
 * Jupiter Token Search API Proxy
 *
 * Proxies requests to the official Jupiter tokens API and provides proper response format.
 */

import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('query')?.trim()

    console.log(`[Token Search] Search query: "${query}"`)

    if (!query || query.length < 1) {
      // Return empty result for empty queries
      return NextResponse.json([])
    }

    // Proxy to Jupiter API
    const jupiterApiUrl = `https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(query)}&limit=20`

    console.log(`[Token Search] Proxying to Jupiter API: ${jupiterApiUrl}`)

    const response = await fetch(jupiterApiUrl)

    if (!response.ok) {
      console.error(`[Token Search] Jupiter API error: ${response.status} ${response.statusText}`)
      return NextResponse.json({
        error: 'Jupiter API unavailable',
        message: `Status: ${response.status} ${response.statusText}`
      }, { status: 502 })
    }

    const data = await response.json()

    // Extract only the data array from Jupiter API response
    const tokens = data.data || []

    console.log(`[Token Search] Found ${tokens.length} tokens from Jupiter API for query "${query}"`)

    return NextResponse.json(tokens)

  } catch (error) {
    console.error('[Token Search] Error:', error)

    // Return empty array on error
    return NextResponse.json({
      error: 'Token search failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// Handle OPTIONS requests for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  })
}