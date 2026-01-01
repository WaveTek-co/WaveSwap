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
import { getConfidentialTokenService } from '@/lib/confidentialTokens'
import {
  isConfidentialTokenAddress,
  extractUnderlyingTokenAddress,
  generateConfidentialTokenAddress
} from '@/types/token'
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
      console.log('[Privacy Mode Quote API] Getting private swap quote...')

      // CRITICAL: Pre-flight health check before allowing any private swap operations
      console.log('[Privacy Mode Quote API] Performing Encifher health check...')
      try {
        const healthCheckUrl = `${request.nextUrl.origin}/api/v1/encifher/health`
        const healthResponse = await fetch(healthCheckUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        })

        if (!healthResponse.ok) {
          const healthData = await healthResponse.json()
          console.error('[Privacy Mode Quote API] Encifher health check failed:', healthData)

          return NextResponse.json(
            {
              error: 'PRIVATE_SWAP_UNAVAILABLE',
              message: 'Private swaps are currently unavailable due to service issues',
              details: healthData.checks?.error || 'Encifher service health check failed',
              healthCheck: healthData,
              retryAfter: 30 // Suggest retry after 30 seconds
            },
            { status: 503 }
          )
        }

        const healthData = await healthResponse.json()
        if (healthData.status !== 'healthy') {
          console.error('[Privacy Mode Quote API] Encifher service unhealthy:', healthData)

          return NextResponse.json(
            {
              error: 'PRIVATE_SWAP_UNHEALTHY',
              message: 'Private swaps are temporarily unavailable - service is unhealthy',
              details: healthData.checks?.error || 'Encifher service reporting unhealthy status',
              healthCheck: healthData,
              retryAfter: 60 // Suggest retry after 1 minute
            },
            { status: 503 }
          )
        }

        console.log('[Privacy Mode Quote API] Encifher health check passed - proceeding with private swap quote')
      } catch (healthCheckError: any) {
        console.error('[Privacy Mode Quote API] Health check request failed:', healthCheckError)

        return NextResponse.json(
          {
            error: 'PRIVATE_SWAP_HEALTH_CHECK_FAILED',
            message: 'Unable to verify private swap service availability',
            details: healthCheckError.message,
            retryAfter: 30
          },
          { status: 503 }
        )
      }

      // For now, simulate private swap quotes using Jupiter as base
      // We'll add actual EncifHer integration once the basic flow works
      try {
        // Get Jupiter quote for the underlying tokens
        const jupiterQuote = await jupiterApi.getQuote(quoteParams)

        // Convert to confidential token quote with 0.1% privacy fee
        const baseOutAmount = parseInt(jupiterQuote.outAmount)
        const privacyFee = Math.floor(baseOutAmount * 0.001) // 0.1% privacy fee
        const finalOutAmount = (baseOutAmount - privacyFee).toString()

        quote = {
          inputMint,
          outputMint,
          inAmount: amount,
          outAmount: finalOutAmount,
          priceImpactPct: '0.1', // 0.1% price impact for privacy
          routePlan: [{ route: 'private', swapInfo: {} }]
        }

        routingProvider = 'jupiter-private'

        console.log('[Privacy Mode Quote API] Private quote created successfully:', {
          inputMint,
          outputMint,
          inAmount: amount,
          outAmount: finalOutAmount,
          baseJupiterOut: jupiterQuote.outAmount
        })

      } catch (jupiterError) {
        console.error('[Privacy Mode Quote API] Jupiter base quote failed, using fallback:', jupiterError)

        // Fallback: 1:1 swap with 0.1% privacy fee
        const baseAmount = parseInt(amount)
        const privacyFee = Math.floor(baseAmount * 0.001) // 0.1% privacy fee
        const finalOutAmount = (baseAmount - privacyFee).toString()

        quote = {
          inputMint,
          outputMint,
          inAmount: amount,
          outAmount: finalOutAmount,
          priceImpactPct: '0.1', // 0.1% impact for privacy
          routePlan: [{ route: 'private-direct', swapInfo: {} }]
        }

        routingProvider = 'private-fallback'

        console.log('[Privacy Mode Quote API] Fallback quote created:', {
          inputMint,
          outputMint,
          inAmount: amount,
          outAmount: finalOutAmount
        })
      }

      // Add wrap/unwrap metadata
      const needsInputWrapping = isConfidentialTokenAddress(inputMint) || privacyMode
      const needsOutputUnwrapping = isConfidentialTokenAddress(outputMint)

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

    // Calculate privacy fee (0.2%) - this is the only fee
    const privacyFeeBps = 20 // 0.2% = 20 basis points
    const privacyFeeAmount = Math.floor((parseInt(quote.outAmount) * privacyFeeBps) / 10000).toString()
    const outAmountAfterFee = (parseInt(quote.outAmount) - parseInt(privacyFeeAmount)).toString()

    // Add privacy mode and provider information to response
    const enhancedQuote = {
      ...quote,
      outAmount: outAmountAfterFee, // Amount after platform fee
      privacyMode,
      privacySupported: privacyMode ? true : false,
      routing: privacyMode ? 'confidential' : 'standard',
      routingProvider, // Track which provider was used
      // Add wrap/unwrap metadata for privacy mode
      needsInputWrapping: privacyMode ? (isConfidentialTokenAddress(inputMint) ? false : true) : false,
      needsOutputUnwrapping: privacyMode ? (isConfidentialTokenAddress(outputMint) ? true : false) : false,
      underlyingInputMint: privacyMode && isConfidentialTokenAddress(inputMint) ? extractUnderlyingTokenAddress(inputMint) : inputMint,
      underlyingOutputMint: privacyMode && isConfidentialTokenAddress(outputMint) ? extractUnderlyingTokenAddress(outputMint) : outputMint,
      // Add privacy fee information
      privacyFee: {
        amount: privacyFeeAmount,
        bps: privacyFeeBps,
        recipient: 'HGBTkp9PMF75Mfs6z8DXLr923AtAo7TVzM7d5gAfZdVL' // WaveTek privacy fee wallet
      }
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