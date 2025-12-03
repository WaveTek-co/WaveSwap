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

      // Get user token mints dynamically from their Encifher account
      const userTokenMints = await defiClient.getUserTokenMints(userPubkey)
      console.log('[Authenticated Balance API] User token mints found:', userTokenMints)

      if (!userTokenMints || userTokenMints.length === 0) {
        const responseData = {
          success: true,
          userPublicKey: body.userPublicKey,
          confidentialBalances: [],
          timestamp: new Date().toISOString(),
          network: 'mainnet',
          authenticated: true,
          message: 'No confidential tokens found in Encifher account'
        }

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
      }

      // Extract mint addresses from user's actual tokens
      const tokenMints = userTokenMints.map((token: any) =>
        token.tokenMintAddress || token.mintAddress || token.mint
      )

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

      // Dynamic token metadata fetching using Jupiter API
      async function getTokenMetadata(tokenAddress: string): Promise<{ symbol: string; decimals: number; name: string }> {
        try {
          const response = await fetch(`https://token.jup.ag/v6/strict?filter=true&token=${tokenAddress}`)

          if (response.ok) {
            const tokens = await response.json()
            if (Array.isArray(tokens) && tokens.length > 0) {
              const token = tokens[0]
              return {
                symbol: token.symbol || `TOKEN_${tokenAddress.slice(0, 6)}`,
                decimals: token.decimals || 9,
                name: token.name || `Token ${tokenAddress.slice(0, 8)}...`
              }
            }
          }
        } catch (error) {
          console.warn(`[Authenticated Balance API] Jupiter API failed for ${tokenAddress}:`, error)
        }

        // Fallback to generic token info
        return {
          symbol: `TOKEN_${tokenAddress.slice(0, 6)}`,
          decimals: 9,
          name: `Token ${tokenAddress.slice(0, 8)}...`
        }
      }

      // Convert to response format with dynamic metadata
      const confidentialBalancesPromises = tokenMints
        .filter(mint => balances[mint] && parseFloat(balances[mint]) > 0)
        .map(async (mint) => {
          const balance = balances[mint]

          // Get dynamic token metadata
          const tokenMetadata = await getTokenMetadata(mint)

          return {
            tokenAddress: mint,
            tokenSymbol: `c${tokenMetadata.symbol}`,
            tokenName: `Confidential ${tokenMetadata.name}`,
            decimals: tokenMetadata.decimals,
            amount: balance,
            isVisible: true,
            lastUpdated: new Date().toISOString(),
            source: 'encifher_authenticated',
            note: `✅ Actual balance retrieved from Encifher. Ready for withdrawal.`,
            requiresAuth: false,
            hasToken: true,
            authenticatedBalance: true
          }
        })

      const confidentialBalances = await Promise.all(confidentialBalancesPromises)

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