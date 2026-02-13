/**
 * Encifher Order ID API Proxy
 * Proxies executeSwapTxn requests to Encifher SDK to handle CORS
 */

import { NextRequest, NextResponse } from 'next/server'
import { Connection, PublicKey } from '@solana/web3.js'
import { DefiClient, SignedSwapParams, DefiClientConfig } from 'encifher-swap-sdk'

export async function POST(
  request: NextRequest
) {
  try {
    console.log('[Order ID API] Processing executeSwapTxn request')

    // Parse request body
    const body = await request.json()
    console.log('[Order ID API] Request body:', body)

    // Validate required fields
    if (!body.serializedTxn || !body.orderDetails) {
      return NextResponse.json(
        {
          error: 'Missing required fields',
          details: 'serializedTxn and orderDetails are required'
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

    console.log('[Order ID API] Initializing Encifher SDK client')

    // Initialize Encifher SDK client
    const config: DefiClientConfig = {
      encifherKey,
      rpcUrl,
      mode: 'Mainnet' as const
    }
    const defiClient = new DefiClient(config)

    // Prepare execute swap parameters
    const swapParams: SignedSwapParams = {
      serializedTxn: body.serializedTxn,
      orderDetails: {
        inMint: body.orderDetails.inMint,
        outMint: body.orderDetails.outMint,
        amountIn: body.orderDetails.amountIn,
        senderPubkey: new PublicKey(body.orderDetails.senderPubkey),
        receiverPubkey: new PublicKey(body.orderDetails.receiverPubkey),
        message: body.orderDetails.message || ''
      }
    }

    console.log('[Order ID API] Executing swap transaction with Encifher SDK', {
      inMint: swapParams.orderDetails.inMint,
      outMint: swapParams.orderDetails.outMint,
      amountIn: swapParams.orderDetails.amountIn,
      sender: swapParams.orderDetails.senderPubkey.toString(),
      receiver: swapParams.orderDetails.receiverPubkey.toString()
    })

    // Execute swap transaction using Encifher SDK
    const executeResponse = await defiClient.executeSwapTxn(swapParams)

    console.log('[Order ID API] Swap executed successfully:', {
      orderStatusIdentifier: executeResponse.orderStatusIdentifier
    })

    const responseData = {
      success: true,
      timestamp: new Date().toISOString(),
      ...executeResponse,
      instructions: 'Swap transaction executed successfully. Use orderStatusIdentifier to track status.'
    }

    console.log('[Order ID API] Execute swap response prepared successfully')

    // Return successful response
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

  } catch (error) {
    console.error('[Order ID API] Error processing swap execution:', error)

    return NextResponse.json(
      {
        error: 'Failed to execute swap transaction',
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
      details: 'Only POST method is supported for swap execution'
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