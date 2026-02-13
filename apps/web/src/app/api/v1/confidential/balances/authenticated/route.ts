/**
 * Authenticated Balance API Route
 * Follows Encifher SDK documentation for proper balance querying with user signatures
 */

import { NextRequest, NextResponse } from 'next/server'
import { Connection, PublicKey } from '@solana/web3.js'
import { DefiClient, DefiClientConfig } from 'encifher-swap-sdk'

export async function POST(
  request: NextRequest
) {
  try {
    console.log('[Authenticated Balance API] Processing authenticated balance request')

    // Parse request body
    const body = await request.json()
    console.log('[Authenticated Balance API] Request body:', {
      userPublicKey: body.userPublicKey,
      hasSignature: !!body.signature,
      hasMessage: !!body.message,
      tokenMints: body.tokenMints
    })

    // Validate required fields
    if (!body.userPublicKey || !body.signature || !body.message || !body.tokenMints) {
      return NextResponse.json(
        {
          error: 'Missing required fields',
          details: 'userPublicKey, signature, message, and tokenMints are required'
        },
        { status: 400 }
      )
    }

    // Get environment variables
    const encifherKey = process.env.ENCIFHER_SDK_KEY || process.env.NEXT_PUBLIC_ENCIFHER_SDK_KEY
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'

    if (!encifherKey) {
      return NextResponse.json(
        {
          error: 'Missing Encifher SDK key',
          details: 'ENCIFHER_SDK_KEY environment variable is required'
        },
        { status: 500 }
      )
    }

    console.log('[Authenticated Balance API] Initializing Encifher SDK client')

    // Initialize Encifher SDK client (following documentation example)
    const config: DefiClientConfig = {
      encifherKey,
      rpcUrl,
      mode: 'Mainnet' as const
    }
    const defiClient = new DefiClient(config)
    const connection = new Connection(rpcUrl)

    // Create user public key
    const userPubkey = new PublicKey(body.userPublicKey)

    console.log('[Authenticated Balance API] Attempting to get authenticated balance for user:', body.userPublicKey)

    try {
      // Follow documentation example for balance checking
      // This requires the signature and message that the user signed
      const authParams = {
        signature: body.signature,
        ...body.message
      }

      console.log('[Authenticated Balance API] Calling getBalance with authentication params')

      const userBalance = await defiClient.getBalance(
        userPubkey,
        authParams,
        body.tokenMints,
        encifherKey
      )

      console.log('[Authenticated Balance API] Successfully retrieved authenticated balance:', userBalance)

      const responseData = {
        success: true,
        userPublicKey: body.userPublicKey,
        authenticatedBalances: userBalance,
        timestamp: new Date().toISOString(),
        network: 'mainnet',
        source: 'encifher_authenticated'
      }

      console.log('[Authenticated Balance API] Authenticated balance response prepared successfully')

      return NextResponse.json(responseData, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, x-api-key',
          'Access-Control-Allow-Credentials': 'true',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      })

    } catch (balanceError: any) {
      console.error('[Authenticated Balance API] Authenticated balance fetch failed:', balanceError.message)

      return NextResponse.json(
        {
          error: 'Failed to fetch authenticated balance',
          details: balanceError.message,
          suggestion: 'Please ensure you signed the correct message from Encifher SDK'
        },
        { status: 500 }
      )
    }

  } catch (error) {
    console.error('[Authenticated Balance API] Error processing authenticated balance request:', error)

    return NextResponse.json(
      {
        error: 'Failed to process authenticated balance request',
        details: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json(
    {
      error: 'Method not allowed',
      details: 'Only POST method is supported for authenticated balance checking'
    },
    { status: 405 }
  )
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