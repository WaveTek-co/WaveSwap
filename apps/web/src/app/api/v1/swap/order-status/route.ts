/**
 * Private Swap Order Status API
 * Gets the status of confidential swap transactions
 */

import { NextRequest, NextResponse } from 'next/server'
import { DefiClient, OrderStatusParams, DefiClientConfig } from 'encifher-swap-sdk'
import { config } from '@/lib/config'

export async function POST(
  request: NextRequest
) {
  try {
    console.log('[Order Status] Processing order status request')

    // Parse request body
    const body = await request.json()
    console.log('[Order Status] Request body:', body)

    // Validate required fields
    if (!body.orderStatusIdentifier) {
      return NextResponse.json(
        {
          error: 'Missing required fields',
          details: 'orderStatusIdentifier is required'
        },
        { status: 400 }
      )
    }

    // Get environment variables
    const encifherKey = process.env.ENCIFHER_SDK_KEY || process.env.NEXT_PUBLIC_ENCIFHER_SDK_KEY
    const rpcUrl = config.rpc.url

    if (!encifherKey) {
      return NextResponse.json(
        {
          error: 'Missing Encifher SDK key',
          details: 'ENCIFHER_SDK_KEY environment variable is required'
        },
        { status: 500 }
      )
    }

    console.log('[Order Status] Initializing Encifher SDK client')

    // Initialize Encifher SDK client
    const config: DefiClientConfig = {
      encifherKey,
      rpcUrl,
      mode: 'Mainnet' as const
    }
    const defiClient = new DefiClient(config)

    // Prepare order status parameters
    const statusParams: OrderStatusParams = {
      orderStatusIdentifier: body.orderStatusIdentifier
    }

    console.log('[Order Status] Getting order status:', {
      orderStatusIdentifier: statusParams.orderStatusIdentifier
    })

    // Get order status using Encifher SDK
    const status = await defiClient.getOrderStatus(statusParams)

    console.log('[Order Status] Order status received:', {
      status: status.status,
      orderStatusIdentifier: statusParams.orderStatusIdentifier
    })

    const responseData = {
      success: true,
      ...status,
      orderStatusIdentifier: statusParams.orderStatusIdentifier
    }

    console.log('[Order Status] Status response prepared successfully')

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
    console.error('[Order Status] Error getting order status:', error)

    return NextResponse.json(
      {
        error: 'Failed to get order status',
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
      details: 'Only POST method is supported for order status'
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