/**
 * Withdrawal API Route
 * Implements real Encifher SDK getWithdrawTxn for confidential token withdrawals
 */

import { NextRequest, NextResponse } from 'next/server'
import { Connection, PublicKey } from '@solana/web3.js'
import { DefiClient, WithdrawParams, Token } from 'encifher-swap-sdk'

// Helper functions to support any SPL token withdrawal
function getWithdrawTokenSymbol(tokenAddress: string): string {
  // Known token mappings
  const knownTokens: { [key: string]: string } = {
    'So11111111111111111111111111111111111111112': 'SOL',
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
    '4AGxpKxYnw7g1ofvYDs5Jq2a1ek5kB9jS2NTUaippump': 'WAVE',
    '86kZasgxFNRfZ1N373EUEs1eeShKb3TeA8tMyUfx5Ck6': 'WAVE',
    'A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS': 'ZEC',
  }

  return knownTokens[tokenAddress] || `TOKEN`
}

function getWithdrawTokenDecimals(tokenAddress: string, providedDecimals?: number): number {
  // If decimals are provided by frontend, use them
  if (providedDecimals && providedDecimals > 0) {
    return providedDecimals
  }

  // Known token decimals
  const knownDecimals: { [key: string]: number } = {
    'So11111111111111111111111111111111111111112': 9,  // SOL
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 6,  // USDC
    '4AGxpKxYnw7g1ofvYDs5Jq2a1ek5kB9jS2NTUaippump': 9, // WAVE
    '86kZasgxFNRfZ1N373EUEs1eeShKb3TeA8tMyUfx5Ck6': 9,  // WAVE
    'A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS': 8,  // ZEC
  }

  return knownDecimals[tokenAddress] || 9 // Default to 9 decimals
}

export async function POST(
  request: NextRequest
) {
  try {
    console.log('[Withdrawal API] Processing withdrawal request')

    // Parse request body
    const body = await request.json()
    console.log('[Withdrawal API] Request body:', body)
    console.log('[Withdrawal API] Amount type:', typeof body.amount, 'Amount value:', body.amount)

    // Validate required fields
    if (!body.mint || !body.amount || !body.userPublicKey) {
      return NextResponse.json(
        {
          error: 'Missing required fields',
          details: 'mint, amount, and userPublicKey are required for withdrawal'
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

    console.log('[Withdrawal API] Initializing Encifher SDK client')

    // Initialize Encifher SDK client
    const config = { encifherKey, rpcUrl, mode: 'Mainnet' as const }
    const defiClient = new DefiClient(config)
    const connection = new Connection(rpcUrl)

    // Create token object with proper decimals for any SPL token
    const decimals = getWithdrawTokenDecimals(body.mint, body.decimals)
    const token: Token = {
      tokenMintAddress: body.mint,
      decimals
    }

    console.log('[Withdrawal API] Withdrawal token details:', {
      mint: body.mint,
      decimals,
      symbol: getWithdrawTokenSymbol(body.mint)
    })

    // Create withdrawer public key
    const withdrawerPubkey = new PublicKey(body.userPublicKey)

    // CRITICAL: Check if user actually has tokens in Encifher before attempting withdrawal
    console.log('[Withdrawal API] Checking user actual Encifher token balances...')
    try {
      const userTokenMints = await defiClient.getUserTokenMints(withdrawerPubkey)
      console.log('[Withdrawal API] User token mints found:', userTokenMints)

      if (!userTokenMints || userTokenMints.length === 0) {
        return NextResponse.json(
          {
            error: 'No Encifher account found',
            details: 'User has not registered with Encifher. Please complete a deposit first to create an Encifher account.',
            debug: {
              userPublicKey: body.userPublicKey,
              hasTokenMints: false,
              availableTokens: []
            }
          },
          { status: 400 }
        )
      }

      console.log('[Withdrawal API] Available tokens in Encifher account:')
      userTokenMints.forEach((token: any, index) => {
        console.log(`  ${index + 1}. ${token.tokenMintAddress || token.mintAddress} (${token.tokenSymbol || 'Unknown'})`)
      })

      const hasToken = userTokenMints.some((mint: any) => (mint.tokenMintAddress || mint.mintAddress) === body.mint)
      if (!hasToken) {
        const availableTokenAddresses = userTokenMints.map((m: any) => m.tokenMintAddress || m.mintAddress).join(', ')
        return NextResponse.json(
          {
            error: 'Insufficient confidential balance',
            details: `No confidential ${body.mint} balance found in Encifher account. Available tokens: ${availableTokenAddresses}`,
            debug: {
              requestedToken: body.mint,
              availableTokens: userTokenMints,
              hasRequestedToken: false
            }
          },
          { status: 400 }
        )
      }

      console.log('[Withdrawal API] User account verified - has requested token available')
    } catch (accountCheckError: any) {
      console.error('[Withdrawal API] Account check failed:', accountCheckError.message)
      console.error('[Withdrawal API] Account check details:', {
        error: accountCheckError,
        stack: accountCheckError.stack,
        response: accountCheckError.response?.data
      })

      return NextResponse.json(
        {
          error: 'Failed to verify Encifher account',
          details: accountCheckError.message,
          debug: {
            userPublicKey: body.userPublicKey,
            error: accountCheckError.message,
            sdkError: accountCheckError.response?.data || 'No additional error details'
          }
        },
        { status: 400 }
      )
    }

      // According to Encifher docs: amount should be in token units, NOT base units
    // For USDC: 4.56 USDC = "4.56" (not "4560000")
    // For SOL: 0.01 SOL = "0.01" (not "10000000")

    // Frontend now sends amount in correct token units format - use directly
    // No conversion needed since frontend is already sending token units
    const amountForTokenUnits = body.amount

    console.log('[Withdrawal API] Amount processing (no conversion needed):', {
      inputAmount: body.amount,
      mint: body.mint,
      decimals: body.decimals,
      amountForTokenUnits,
      note: 'Frontend sends token units directly - no conversion required'
    })

    // Prepare withdrawal parameters according to Encifher docs
    const withdrawParams: WithdrawParams = {
      token,
      amount: amountForTokenUnits, // Amount in token units, NOT base units
      withdrawer: withdrawerPubkey
    }

    console.log('[Withdrawal API] Getting withdrawal transaction from Encifher SDK', {
      mint: body.mint,
      amount: amountForTokenUnits,
      withdrawer: body.userPublicKey,
      decimals: body.decimals
    })

    // Get withdrawal transaction from Encifher SDK with retry logic
    console.log('[Withdrawal API] Getting withdrawal transaction from Encifher SDK', withdrawParams)

    let withdrawTxn
    let retryCount = 0
    const maxRetries = 3

    while (retryCount < maxRetries) {
      try {
        console.log(`[Withdrawal API] Attempt ${retryCount + 1}/${maxRetries}`)
        withdrawTxn = await defiClient.getWithdrawTxn(withdrawParams)
        console.log('[Withdrawal API] Withdrawal transaction received successfully')
        break
      } catch (sdkError: any) {
        retryCount++
        console.error(`[Withdrawal API] SDK attempt ${retryCount} failed:`, sdkError.message)

        if (retryCount >= maxRetries) {
          console.error('[Withdrawal API] All SDK attempts failed, checking if error is network-related')

          // Check if this is a network/fetch error
          if (sdkError.message.includes('fetch failed') ||
              sdkError.message.includes('ENOTFOUND') ||
              sdkError.message.includes('ECONNREFUSED') ||
              sdkError.message.includes('timeout')) {

            console.error('[Withdrawal API] Network error detected - Encifher API may be temporarily unavailable')

            // Return a more user-friendly error for network issues
            return NextResponse.json(
              {
                error: 'Encifher service temporarily unavailable',
                details: 'The Encifher withdrawal service is experiencing network issues. Please try again in a few minutes. If the problem persists, contact Encifher support.',
                isNetworkError: true,
                retryAfter: 30 // Suggest retry after 30 seconds
              },
              { status: 503 } // Service Unavailable
            )
          }

          // Re-throw the original SDK error for other types of errors
          throw sdkError
        }

        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000))
      }
    }

    // According to Encifher SDK documentation, the transaction is ready to be signed by the user
    // We should NOT modify the transaction (feePayer, blockhash are already set by Encifher)

    // Serialize transaction for client to sign - preserve all existing signatures
    if (!withdrawTxn) {
      throw new Error('Failed to generate withdrawal transaction')
    }

    const serializedTransaction = withdrawTxn.serialize({
      requireAllSignatures: false,
      verifySignatures: false
    }).toString('base64')

    console.log('[Withdrawal API] Transaction serialized for signing')

    const responseData = {
      success: true,
      serializedTransaction,
      amount: body.amount,
      mint: body.mint,
      withdrawer: body.userPublicKey,
      timestamp: new Date().toISOString(),
      networkFee: '0.000005 SOL',
      instructions: 'Please sign this transaction to withdraw your confidential USDC tokens. The tokens will be sent to your wallet after confirmation.'
    }

    console.log('[Withdrawal API] Withdrawal transaction prepared successfully:', {
      transactionId: responseData.timestamp,
      amount: responseData.amount,
      mint: responseData.mint
    })

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
    console.error('[Withdrawal API] Error processing withdrawal:', error)

    return NextResponse.json(
      {
        error: 'Failed to process withdrawal request',
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
      details: 'Only POST method is supported for withdrawals'
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