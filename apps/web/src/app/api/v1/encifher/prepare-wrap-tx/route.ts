/**
 * API Route to proxy Encifher prepare-wrap-tx requests
 * This bypasses CORS issues by making server-side requests to Encifher's API
 */

import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    console.log('[Encifher Prepare Wrap API] Proxying request to bypass CORS')

    // Get the request body from the client
    const body = await request.json()
    console.log('[Encifher Prepare Wrap API] Request body:', body)

    // Get the API key from environment
    const encifherKey = process.env.NEXT_PUBLIC_ENCIFHER_SDK_KEY

    // Prepare headers with authentication
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'User-Agent': 'WaveSwap-Proxy/1.0'
    }

    // Add API key if available
    if (encifherKey && encifherKey !== 'your-api-key-here') {
      headers['Authorization'] = `Bearer ${encifherKey}`
      console.log('[Encifher Prepare Wrap API] Using API key for authentication')
    } else {
      console.log('[Encifher Prepare Wrap API] No API key configured, using default')
    }

    // Make server-side request to Encifher API (bypasses CORS)
    const encifherResponse = await fetch('https://authority.encrypt.trade/api/v1/prepare-wrap-tx', {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    })

    if (!encifherResponse.ok) {
      const errorText = await encifherResponse.text()
      console.error('[Encifher Prepare Wrap API] Encifher API error:', {
        status: encifherResponse.status,
        statusText: encifherResponse.statusText,
        errorText
      })

      return NextResponse.json(
        {
          error: `Encifher API returned ${encifherResponse.status}: ${encifherResponse.statusText}`,
          details: errorText
        },
        { status: encifherResponse.status }
      )
    }

    // Get the response from Encifher
    const encifherData = await encifherResponse.json()
    console.log('[Encifher Prepare Wrap API] Successful response from Encifher')

    // Return the Encifher response to the client
    return NextResponse.json(encifherData, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    })

  } catch (error) {
    console.error('[Encifher Prepare Wrap API] Error proxying request:', error)

    return NextResponse.json(
      {
        error: 'Failed to proxy request to Encifher API',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

export async function OPTIONS(request: NextRequest) {
  // Handle CORS preflight requests
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  })
}