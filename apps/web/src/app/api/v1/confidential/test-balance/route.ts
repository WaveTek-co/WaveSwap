/**
 * Test Balance API - Temporary endpoint to verify real Encifher data
 * Bypasses authentication for testing purposes
 */

import { NextRequest, NextResponse } from 'next/server'
import { Connection, PublicKey } from '@solana/web3.js'

// Dynamic import to avoid webpack bundling issues
const getEncifherClient = async () => {
  try {
    const encifherModule = await import('encifher-swap-sdk')
    return { DefiClient: encifherModule.DefiClient }
  } catch (error) {
    console.error('[Test Balance API] Failed to import encifher-swap-sdk:', error)
    return null
  }
}

export async function GET(request: NextRequest) {
  try {
    console.log('[Test Balance API] Testing real Encifher data fetch')

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

    // Get environment variables
    const encifherKey = process.env.ENCIFHER_SDK_KEY || process.env.NEXT_PUBLIC_ENCIFHER_SDK_KEY
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com'

    if (!encifherKey) {
      return NextResponse.json(
        {
          error: 'Missing Encifher SDK key',
          details: 'ENCIFHER_SDK_KEY environment variable is required'
        },
        { status: 500 }
      )
    }

    console.log('[Test Balance API] Initializing Encifher SDK client')

    // Get Encifher client dynamically
    const encifherImports = await getEncifherClient()
    if (!encifherImports) {
      throw new Error('Failed to import Encifher SDK')
    }

    // Initialize Encifher SDK client
    const config = {
      encifherKey,
      rpcUrl,
      mode: 'Mainnet' as const
    }
    const defiClient = new encifherImports.DefiClient(config)
    const connection = new Connection(rpcUrl)

    // Create user public key
    const userPubkey = new PublicKey(userPublicKey)

    console.log('[Test Balance API] Testing balance fetch for:', userPublicKey)

    // Step 1: Get real token mints from Encifher
    console.log('[Test Balance API] Step 1: Getting real token mints from Encifher')
    const userTokenMints = await defiClient.getUserTokenMints(userPubkey)
    console.log('[Test Balance API] Real Encifher token mints:', userTokenMints)

    if (!userTokenMints || userTokenMints.length === 0) {
      return NextResponse.json({
        success: true,
        userPublicKey,
        message: 'No tokens found in Encifher account',
        tokenMints: [],
        tokenCount: 0
      })
    }

    // Step 2: Get message for authentication
    console.log('[Test Balance API] Step 2: Getting message for authentication')
    const messagePayload = await defiClient.getMessageToSign()
    console.log('[Test Balance API] Message payload received:', messagePayload)

    // Step 3: Try to get balances without proper authentication (this will likely fail but let's see what we get)
    console.log('[Test Balance API] Step 3: Attempting balance fetch')

    const tokenAddresses = userTokenMints.map((mint: any) =>
      mint.mint || mint.tokenMintAddress || mint.mintAddress
    )

    let balanceResults: any[] = []

    for (const tokenAddress of tokenAddresses) {
      try {
        console.log(`[Test Balance API] Checking balance for token: ${tokenAddress}`)

        // Try with mock authentication to see what happens
        const balanceResult = await defiClient.getBalance(
          userPubkey,
          { signature: 'mock-test', message: messagePayload },
          [tokenAddress],
          encifherKey
        )

        console.log(`[Test Balance API] Balance result for ${tokenAddress}:`, balanceResult)
        balanceResults.push({
          tokenAddress,
          balance: balanceResult,
          success: true
        })

      } catch (balanceError: any) {
        console.log(`[Test Balance API] Balance check failed for ${tokenAddress}:`, balanceError.message)
        balanceResults.push({
          tokenAddress,
          error: balanceError.message,
          success: false
        })
      }
    }

    // Helper function to serialize BigInt values
    const serializeBigInt = (obj: any): any => {
      if (typeof obj === 'bigint') {
        return obj.toString()
      } else if (Array.isArray(obj)) {
        return obj.map(serializeBigInt)
      } else if (obj !== null && typeof obj === 'object') {
        const serialized: any = {}
        for (const [key, value] of Object.entries(obj)) {
          serialized[key] = serializeBigInt(value)
        }
        return serialized
      }
      return obj
    }

    return NextResponse.json({
      success: true,
      userPublicKey,
      testResults: {
        tokenMints: serializeBigInt(userTokenMints),
        tokenCount: userTokenMints.length,
        messagePayload: serializeBigInt(messagePayload),
        balanceCheckResults: serializeBigInt(balanceResults)
      },
      timestamp: new Date().toISOString(),
      note: 'This is a test endpoint to verify Encifher API connectivity'
    })

  } catch (error: any) {
    console.error('[Test Balance API] Error:', error)

    // Helper function to serialize BigInt values in errors
    const serializeBigInt = (obj: any): any => {
      if (typeof obj === 'bigint') {
        return obj.toString()
      } else if (Array.isArray(obj)) {
        return obj.map(serializeBigInt)
      } else if (obj !== null && typeof obj === 'object') {
        const serialized: any = {}
        for (const [key, value] of Object.entries(obj)) {
          serialized[key] = serializeBigInt(value)
        }
        return serialized
      }
      return obj
    }

    return NextResponse.json(
      {
        error: 'Test failed',
        details: error.message,
        stack: serializeBigInt(error.stack)
      },
      { status: 500 }
    )
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, x-api-key',
      'Access-Control-Allow-Credentials': 'true'
    }
  })
}