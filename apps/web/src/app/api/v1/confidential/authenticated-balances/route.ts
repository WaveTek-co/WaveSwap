/**
 * Authenticated Confidential Balance API Route
 * Uses proper Encifher SDK getBalance method with signed message
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
    console.log('[Authenticated Balance API] Request body:', body)

    // Validate required fields
    if (!body.userPublicKey || !body.signature || !body.msgPayload) {
      return NextResponse.json(
        {
          error: 'Missing required fields',
          details: 'userPublicKey, signature, and msgPayload are required'
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

    console.log('[Authenticated Balance API] Initializing Encifher SDK client for authenticated balance check')

    // Initialize Encifher SDK client
    const config: DefiClientConfig = {
      encifherKey,
      rpcUrl,
      mode: 'Mainnet' as const
    }
    const defiClient = new DefiClient(config)

    // Create user public key
    const userPubkey = new PublicKey(body.userPublicKey)

    console.log('[Authenticated Balance API] Getting user balances with signed message')

    try {
      // CORRECT: Use proper Encifher SDK getBalance method according to official docs
      // The signature should be base64 encoded from the frontend signing
      const balanceParams = {
        signature: body.signature,
        ...body.msgPayload
      }

      // Get all common token mints to check balances
      const tokenMints = [
        'So11111111111111111111111111111111111111112', // SOL
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
        '4AGxpKxYnw7g1ofvYDs5Jq2a1ek5kB9jS2NTUaippump', // WAVE
        'A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS', // ZEC
        'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
      ]

      const userBalances = await defiClient.getBalance(
        userPubkey,
        balanceParams,
        tokenMints,
        encifherKey
      )

      console.log('[Authenticated Balance API] Successfully retrieved user balances:', userBalances)

      // Convert TokenBalance[] to a record for easier lookup
      const balances: Record<string, string> = {}
      if (Array.isArray(userBalances)) {
        userBalances.forEach((balance: any) => {
          if (balance.mintAddress && balance.balance) {
            balances[balance.mintAddress] = balance.balance.toString()
          }
        })
      }

      // Convert to response format
      const confidentialBalances = tokenMints
        .filter(mint => balances[mint] && parseFloat(balances[mint]) > 0)
        .map(mint => {
          const balance = balances[mint]
          let tokenSymbol = 'UNKNOWN'
          let tokenName = 'Unknown Token'
          let decimals = 9

          // Known token mappings
          const knownTokens: { [key: string]: { symbol: string, name: string, decimals: number } } = {
            'So11111111111111111111111111111111111111112': { symbol: 'SOL', name: 'Solana', decimals: 9 },
            'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { symbol: 'USDC', name: 'USDC Coin', decimals: 6 },
            '4AGxpKxYnw7g1ofvYDs5Jq2a1ek5kB9jS2NTUaippump': { symbol: 'WAVE', name: 'Wave', decimals: 9 },
            'A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS': { symbol: 'ZEC', name: 'Zcash', decimals: 8 },
            'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': { symbol: 'USDT', name: 'Tether USD', decimals: 6 },
          }

          if (knownTokens[mint]) {
            tokenSymbol = knownTokens[mint].symbol
            tokenName = `Confidential ${knownTokens[mint].name}`
            decimals = knownTokens[mint].decimals
          }

          return {
            tokenAddress: mint,
            tokenSymbol,
            tokenName,
            decimals,
            amount: balance, // This will be the actual balance amount
            isVisible: true,
            lastUpdated: new Date().toISOString(),
            source: 'encifher_authenticated',
            note: `✅ Actual balance retrieved from Encifher. Ready for withdrawal.`,
            requiresAuth: false,
            hasToken: true,
            authenticatedBalance: true
          }
        })

      console.log('[Authenticated Balance API] Processed balances:', {
        totalTokens: confidentialBalances.length,
        tokens: confidentialBalances.map(b => `${b.tokenSymbol}: ${b.amount}`)
      })

      const responseData = {
        success: true,
        userPublicKey: body.userPublicKey,
        confidentialBalances,
        timestamp: new Date().toISOString(),
        network: 'mainnet',
        authenticated: true
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
      console.error('[Authenticated Balance API] Failed to get authenticated balances:', balanceError.message)

      return NextResponse.json(
        {
          error: 'Failed to get authenticated balances',
          details: balanceError.message,
          debug: {
            userPublicKey: body.userPublicKey,
            error: balanceError.message,
            suggestion: 'Please ensure the signature is valid and the message was signed correctly'
          }
        },
        { status: 400 }
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
      details: 'Only POST method is supported for authenticated balance checks'
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