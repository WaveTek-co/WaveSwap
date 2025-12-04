/**
 * Confidential Balance API Route (Clean Version)
 * Redirects to authenticated API to get real Encifher data
 * No more hardcoded tokens or fake balance data
 */

import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest
) {
  try {
    console.log('[Confidential Balance API] Processing balance request')

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const userPublicKey = searchParams.get('userPublicKey')

    if (!userPublicKey) {
      return NextResponse.json(
        {
          error: 'Missing user public key',
          details: 'userPublicKey parameter is required'
        },
        { status: 400 }
      )
    }

    console.log('[Confidential Balance API] Redirecting to authenticated API for real Encifher data:', userPublicKey)

    // Get the real authenticated balances from the auth API
    // This API actually authenticates and gets real data from Encifher
    const authApiUrl = new URL(`${request.nextUrl.origin}/api/v1/confidential/authenticated-balances`)
    authApiUrl.searchParams.set('userPublicKey', userPublicKey)

    const authResponse = await fetch(authApiUrl.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!authResponse.ok) {
      const errorText = await authResponse.text()
      console.error('[Confidential Balance API] Auth API failed:', authResponse.status, errorText)

      // Return the auth API error
      const errorData = {
        error: 'Authentication required for confidential balances',
        details: 'Please authenticate with Encifher to view your confidential balances',
        requiresAuth: true,
        authApiUrl: '/api/v1/confidential/auth'
      }

      // Try to parse the auth API response if possible
      try {
        const authError = JSON.parse(errorText)
        return NextResponse.json(
          {
            ...errorData,
            originalError: authError
          },
          { status: authResponse.status }
        )
      } catch {
        return NextResponse.json(errorData, { status: authResponse.status })
      }
    }

    const authData = await authResponse.json()
    console.log('[Confidential Balance API] Success: Got real data from auth API')

    // Return the authenticated data directly
    return NextResponse.json(authData, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, x-api-key',
        'Access-Control-Allow-Credentials': 'true',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    })

  } catch (error) {
    console.error('[Confidential Balance API] Error processing request:', error)

    return NextResponse.json(
      {
        error: 'Failed to process balance request',
        details: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    )
  }
}

export async function OPTIONS() {
  // Handle CORS preflight requests
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, x-api-key',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400' // Cache preflight for 24 hours
    }
  })
}