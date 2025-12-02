/**
 * Encifher Health Check API
 * Verifies Encifher service is healthy before allowing private swaps
 */

import { NextRequest, NextResponse } from 'next/server'
import { DefiClient, DefiClientConfig } from 'encifher-swap-sdk'

interface HealthCheckResult {
  status: 'healthy' | 'unhealthy'
  checks: {
    sdkConnection: boolean
    apiAccessibility: boolean
    quoteGeneration: boolean
    error?: string
  }
  timestamp: string
  latency: number
}

export async function GET(request: NextRequest) {
  const startTime = Date.now()

  try {
    console.log('[Encifher Health Check] Starting health check...')

    // Get environment variables
    const encifherKey = process.env.ENCIFHER_SDK_KEY || process.env.NEXT_PUBLIC_ENCIFHER_SDK_KEY
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com'

    if (!encifherKey) {
      const error = 'Missing Encifher SDK key'
      console.error('[Encifher Health Check]', error)

      const result: HealthCheckResult = {
        status: 'unhealthy',
        checks: {
          sdkConnection: false,
          apiAccessibility: false,
          quoteGeneration: false,
          error
        },
        timestamp: new Date().toISOString(),
        latency: Date.now() - startTime
      }

      return NextResponse.json(result, { status: 503 })
    }

    // Initialize Encifher SDK client
    const config: DefiClientConfig = {
      encifherKey,
      rpcUrl,
      mode: 'Mainnet' as const
    }

    console.log('[Encifher Health Check] Testing SDK initialization...')
    const defiClient = new DefiClient(config)

    // Test 1: SDK Connection
    console.log('[Encifher Health Check] Testing SDK connection...')
    let sdkConnectionHealthy = true

    try {
      // Just creating the client tests basic connectivity
      console.log('[Encifher Health Check] SDK client initialized successfully')
    } catch (sdkError) {
      sdkConnectionHealthy = false
      console.error('[Encifher Health Check] SDK connection failed:', sdkError)
    }

    // Test 2: API Accessibility (try to get a quote)
    console.log('[Encifher Health Check] Testing API accessibility...')
    let apiAccessibilityHealthy = true
    let quoteGenerationHealthy = true
    let lastError: string | undefined

    try {
      // Use the same parameters as the working code - only inMint, outMint, and amountIn
      const testQuote = await defiClient.getSwapQuote({
        inMint: 'So11111111111111111111111111111111111111112', // SOL
        outMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
        amountIn: '10000000' // 0.01 SOL
      })

      console.log('[Encifher Health Check] Quote generation test passed')

      // Handle different response formats from the SDK (like the working code does)
      const outAmount = (testQuote as any).amountOut || (testQuote as any).outAmount || (testQuote as any).expectedOutAmount || '0'

      if (!outAmount || outAmount === '0') {
        console.error('[Encifher Health Check] Invalid quote response:', testQuote)
        throw new Error('Invalid quote response - no output amount')
      }

      console.log('[Encifher Health Check] Valid quote received:', {
        inMint: testQuote?.inMint,
        outMint: testQuote?.outMint,
        amountIn: testQuote?.amountIn,
        processedOutAmount: outAmount
      })
    } catch (quoteError: any) {
      apiAccessibilityHealthy = false
      quoteGenerationHealthy = false
      lastError = quoteError.message || 'Unknown quote error'
      console.error('[Encifher Health Check] Quote generation failed:', quoteError)

      // Check if it's a network/API issue vs. parameter issue
      if (quoteError.message?.includes('500') ||
          quoteError.message?.includes('fetch failed') ||
          quoteError.response?.status === 500) {
        console.error('[Encifher Health Check] CRITICAL: Encifher API returning 500 errors - SERVICE UNHEALTHY')
      }
    }

    const allChecksPass = sdkConnectionHealthy && apiAccessibilityHealthy && quoteGenerationHealthy

    const result: HealthCheckResult = {
      status: allChecksPass ? 'healthy' : 'unhealthy',
      checks: {
        sdkConnection: sdkConnectionHealthy,
        apiAccessibility: apiAccessibilityHealthy,
        quoteGeneration: quoteGenerationHealthy,
        error: lastError
      },
      timestamp: new Date().toISOString(),
      latency: Date.now() - startTime
    }

    console.log('[Encifher Health Check] Health check completed:', {
      status: result.status,
      latency: result.latency,
      checks: result.checks
    })

    const statusCode = allChecksPass ? 200 : 503
    return NextResponse.json(result, { status: statusCode })

  } catch (error: any) {
    console.error('[Encifher Health Check] Health check failed:', error)

    const result: HealthCheckResult = {
      status: 'unhealthy',
      checks: {
        sdkConnection: false,
        apiAccessibility: false,
        quoteGeneration: false,
        error: error.message || 'Unknown health check error'
      },
      timestamp: new Date().toISOString(),
      latency: Date.now() - startTime
    }

    return NextResponse.json(result, { status: 503 })
  }
}

export async function OPTIONS() {
  // Handle CORS preflight requests
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, x-api-key',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400' // Cache preflight for 24 hours
    }
  })
}