/**
 * API Route for Swap Quotes
 *
 * Routes quote requests to:
 * - Jupiter API for public swaps
 * - Encifher SDK for privacy-enabled swaps
 *
 * References:
 * - Jupiter Quote API: https://station.jup.ag/api/v6/quote
 * - Encifher SDK: https://docs.encifher.com/
 */

import { NextRequest, NextResponse } from 'next/server'
import { JupiterAPI } from '@/lib/jupiter'
import { EncifherClient, EncifherUtils } from '@/lib/encifher'
import { Connection, PublicKey } from '@solana/web3.js'
import { config } from '@/lib/config'

export async function GET(request: NextRequest) {
  try {
    // Get query parameters
    const searchParams = request.nextUrl.searchParams
    const inputMint = searchParams.get('inputMint')
    const outputMint = searchParams.get('outputMint')
    const amount = searchParams.get('amount')
    const slippageBps = searchParams.get('slippageBps')
    const userPublicKey = searchParams.get('userPublicKey')
    const privacyMode = searchParams.get('privacyMode') === 'true'

    // Validate required parameters
    if (!inputMint || !outputMint || !amount) {
      return NextResponse.json(
        { error: 'Missing required parameters: inputMint, outputMint, amount' },
        { status: 400 }
      )
    }

    // Validate amount - amount should be in base units (smallest units, already converted by frontend)
    const parsedAmount = parseInt(amount, 10)
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json(
        { error: 'Invalid amount. Must be a positive integer in base units.' },
        { status: 400 }
      )
    }

    // Initialize Jupiter API with configured RPC
    const connection = new Connection(config.rpc.url)
    const jupiterApi = new JupiterAPI(connection)

    // Build quote parameters
    const quoteParams = {
      inputMint,
      outputMint,
      amount,
      slippageBps: slippageBps ? parseInt(slippageBps) : 50,
      userPublicKey: userPublicKey || undefined,
      onlyDirectRoutes: false,
      asLegacyTransaction: false
    }

    console.log('[Swap Quote API] Requesting quote:', { quoteParams, privacyMode })

    let quote
    let routingProvider

    // Route to Encifher for privacy mode, Jupiter for public swaps
    if (privacyMode) {
      console.log('[Encifher Quote API] Getting private swap quote...')

      // Check if Encifher is configured
      if (!EncifherUtils.isConfigured()) {
        return NextResponse.json(
          { error: 'Encifher SDK not configured for private swaps' },
          { status: 503 }
        )
      }

      // Initialize Encifher client
      const encifherConfig = EncifherUtils.getConfig()!
      const connection = new Connection(encifherConfig.rpcUrl)
      const encifher = EncifherUtils.createClient(connection, encifherConfig)

      // Check if tokens are supported by Encifher
      if (!encifher.isPrivacySupported(inputMint) || !encifher.isPrivacySupported(outputMint)) {
        return NextResponse.json(
          { error: 'One or both tokens are not supported for private swaps' },
          { status: 400 }
        )
      }

      // Get private swap quote from Encifher
      // The amount parameter should be passed directly as it's already in base units
      console.log('[Encifher Quote API] Requesting private swap quote:', {
        inMint: inputMint,
        outMint: outputMint,
        amountIn: amount,
        amountType: typeof amount
      })

      let privateQuote
      try {
        privateQuote = await encifher.getPrivateSwapQuote({
          inMint: inputMint,
          outMint: outputMint,
          amountIn: amount // Pass amount directly - it's already in base units from Jupiter format
        })
        console.log('[Encifher Quote API] Private quote received:', privateQuote)
      } catch (encifherError) {
        console.error('[Encifher Quote API] Error getting private quote:', encifherError)
        return NextResponse.json(
          {
            error: 'Encifher private quote failed',
            details: encifherError instanceof Error ? encifherError.message : String(encifherError)
          },
          { status: 500 }
        )
      }

      // Format Encifher quote response to match Jupiter API format
      quote = {
        inputMint,
        outputMint,
        inAmount: amount,
        outAmount: privateQuote.expectedOutAmount,
        priceImpactPct: privateQuote.priceImpact || '0',
        routePlan: [{ route: privateQuote.route || 'direct', swapInfo: {} }]
      }

      routingProvider = 'encifher'

      console.log('[Encifher Quote API] Private quote received successfully:', {
        inputMint,
        outputMint,
        inAmount: amount,
        outAmount: privateQuote.expectedOutAmount,
        route: privateQuote.route
      })

    } else {
      console.log('[Jupiter Quote API] Getting public swap quote...')

      // Get quote from Jupiter for public swaps
      // Use the JupiterAPI class which has proper server-side fetch implementation
      try {
        quote = await jupiterApi.getQuote(quoteParams)
      } catch (jupiterError) {
        console.error('[Jupiter Quote API] Jupiter API error:', jupiterError)

        // If Jupiter fails, try the old proxy method as fallback
        console.log('[Jupiter Quote API] Trying proxy fallback...')
        const proxyUrl = new URL(`/api/v1/jupiter/quote`, request.url)
        Object.entries(quoteParams).forEach(([key, value]) => {
          if (value !== undefined) {
            proxyUrl.searchParams.set(key, String(value))
          }
        })

        const proxyResponse = await fetch(proxyUrl.toString())
        if (!proxyResponse.ok) {
          throw new Error(`Jupiter API and proxy both failed: ${jupiterError instanceof Error ? jupiterError.message : 'Unknown error'}`)
        }

        const proxyData = await proxyResponse.json()
        quote = proxyData.quote || proxyData
      }

      routingProvider = 'jupiter'

      console.log('[Jupiter Quote API] Quote received successfully:', {
        inputMint: quote.inputMint,
        outputMint: quote.outputMint,
        inAmount: quote.inAmount,
        outAmount: quote.outAmount,
        priceImpact: quote.priceImpactPct,
        routeCount: quote.routePlan?.length || 0
      })
    }

    // Add privacy mode and provider information to response
    const enhancedQuote = {
      ...quote,
      privacyMode,
      privacySupported: privacyMode ? true : false,
      routing: privacyMode ? 'confidential' : 'standard',
      routingProvider // Track which provider was used
    }

    return NextResponse.json({
      success: true,
      quote: enhancedQuote,
      metadata: {
        requestedAt: new Date().toISOString(),
        privacyMode,
        routingProvider,
        apiVersion: 'v1'
      }
    })

  } catch (error) {
    console.error('Error in swap quote API:', error)

    // Handle different error types
    if (error instanceof Error) {
      // Check for specific Jupiter API errors
      if (error.message.includes('Insufficient liquidity')) {
        return NextResponse.json(
          { error: 'Insufficient liquidity for this swap route' },
          { status: 400 }
        )
      }

      if (error.message.includes('No routes found')) {
        return NextResponse.json(
          { error: 'No available routes for this token pair' },
          { status: 400 }
        )
      }

      if (error.message.includes('Invalid token')) {
        return NextResponse.json(
          { error: 'One or both tokens are invalid or not supported' },
          { status: 400 }
        )
      }

      // Handle Jupiter API rate limiting (affects both Jupiter and Encifher)
      if (error.message.includes('Rate limit exceeded') || error.message.includes('429') ||
          error.message.includes('Jupiter API returned status 429')) {
        const { searchParams } = new URL(request.url)
        const isPrivacyMode = searchParams.get('privacyMode') === 'true'
        return NextResponse.json(
          {
            error: 'Swap service is experiencing high demand. Please wait a few moments and try again.',
            details: isPrivacyMode
              ? 'Private swap service is temporarily unavailable. Your transaction will remain confidential when the service is restored.'
              : 'Public swap service is temporarily busy. Please try again shortly.'
          },
          { status: 429 }
        )
      }

      // Handle Encifher specific errors
      if (error.message.includes('Private swap quote failed')) {
        return NextResponse.json(
          {
            error: 'Private swap service is temporarily unavailable. Please try again shortly.',
            details: 'The confidential swap service is experiencing issues. Your privacy preferences will be maintained.'
          },
          { status: 503 }
        )
      }

      // Handle Encifher configuration errors
      if (error.message.includes('Encifher SDK not configured')) {
        return NextResponse.json(
          {
            error: 'Private swap service is not configured. Please contact support.',
            details: 'The privacy features are temporarily unavailable.'
          },
          { status: 503 }
        )
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error while getting quote',
        details: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Support POST requests for complex quote parameters
    const { inputMint, outputMint, amount, slippageBps, userPublicKey, privacyMode, ...extraParams } = body

    if (!inputMint || !outputMint || !amount) {
      return NextResponse.json(
        { error: 'Missing required parameters: inputMint, outputMint, amount' },
        { status: 400 }
      )
    }

    // Validate amount - amount should be in base units (smallest units, already converted by frontend)
    const parsedAmount = parseInt(amount, 10)
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json(
        { error: 'Invalid amount. Must be a positive integer in base units.' },
        { status: 400 }
      )
    }

    // Initialize Jupiter API with configured RPC
    const connection = new Connection(config.rpc.url)
    const jupiterApi = new JupiterAPI(connection)

    // Build quote parameters with extra options
    const quoteParams = {
      inputMint,
      outputMint,
      amount,
      slippageBps: slippageBps || 50,
      userPublicKey,
      onlyDirectRoutes: extraParams.onlyDirectRoutes || false,
      asLegacyTransaction: extraParams.asLegacyTransaction || false,
      feeAccount: extraParams.feeAccount,
      platformFeeBps: extraParams.platformFeeBps
    }

    console.log('Getting Jupiter quote (POST):', { quoteParams, privacyMode })

    // Get quote from Jupiter
    const quote = await jupiterApi.getQuote(quoteParams)

    // Add privacy mode information to response
    const enhancedQuote = {
      ...quote,
      privacyMode: privacyMode || false,
      privacySupported: true, // TODO: Check actual Arcium support for tokens
      routing: privacyMode ? 'confidential' : 'standard'
    }

    return NextResponse.json({
      success: true,
      quote: enhancedQuote,
      metadata: {
        requestedAt: new Date().toISOString(),
        privacyMode: privacyMode || false,
        apiVersion: 'v1',
        method: 'POST'
      }
    })

  } catch (error) {
    console.error('Error in swap quote API (POST):', error)

    return NextResponse.json(
      {
        error: 'Internal server error while getting quote',
        details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined
      },
      { status: 500 }
    )
  }
}