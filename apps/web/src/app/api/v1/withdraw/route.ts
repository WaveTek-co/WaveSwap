/**
 * Withdrawal API Route
 * Implements real Encifher SDK getWithdrawTxn for confidential token withdrawals
 * Supports dynamic token metadata fetching using Jupiter API
 */

import { NextRequest, NextResponse } from 'next/server'
import { Connection, PublicKey } from '@solana/web3.js'
import { DefiClient, WithdrawParams, Token } from 'encifher-swap-sdk'

// Dynamic token metadata fetching using Jupiter API
async function getTokenMetadata(tokenAddress: string): Promise<{ symbol: string; decimals: number; name: string }> {
  try {
    // First try to get token info from Jupiter API
    const response = await fetch(`https://token.jup.ag/v6/strict?filter=true&token=${tokenAddress}`)

    if (response.ok) {
      const tokens = await response.json()
      if (Array.isArray(tokens) && tokens.length > 0) {
        const token = tokens[0]
        console.log(`[TokenMetadata] Found token via Jupiter API: ${token.symbol} (${token.name})`)
        return {
          symbol: token.symbol || `TOKEN_${tokenAddress.slice(0, 6)}`,
          decimals: token.decimals || 9,
          name: token.name || `Token ${tokenAddress.slice(0, 8)}...`
        }
      }
    }
  } catch (error) {
    console.warn(`[TokenMetadata] Jupiter API failed for ${tokenAddress}:`, error)
  }

  // Fallback: try to get from our local token list
  try {
    const localResponse = await fetch(`${process.env.NEXT_PUBLIC_HOST || ''}/api/v1/tokens`)
    if (localResponse.ok) {
      const tokens = await localResponse.json()
      const token = tokens.find((t: any) => t.address === tokenAddress)
      if (token) {
        console.log(`[TokenMetadata] Found token via local API: ${token.symbol}`)
        return {
          symbol: token.symbol,
          decimals: token.decimals || 9,
          name: token.name
        }
      }
    }
  } catch (error) {
    console.warn(`[TokenMetadata] Local API failed for ${tokenAddress}:`, error)
  }

  // Final fallback to common hardcoded tokens
  const commonTokens: { [key: string]: { symbol: string; decimals: number; name: string } } = {
    'So11111111111111111111111111111111111111112': { symbol: 'SOL', decimals: 9, name: 'Solana' },
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { symbol: 'USDC', decimals: 6, name: 'USD Coin' },
    '4AGxpKxYnw7g1ofvYDs5Jq2a1ek5kB9jS2NTUaippump': { symbol: 'WAVE', decimals: 6, name: 'Wave' },
    '86kZasgxFNRfZ1N373EUEs1eeShKb3TeA8tMyUfx5Ck6': { symbol: 'WAVE', decimals: 9, name: 'Wave' },
    'A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS': { symbol: 'ZEC', decimals: 8, name: 'Zcash' },
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': { symbol: 'USDT', decimals: 6, name: 'Tether USD' },
    'pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn': { symbol: 'PUMP', decimals: 6, name: 'Pump' },
    'CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH': { symbol: 'CASH', decimals: 6, name: 'Cash' },
    'BSxPC3Vu3X6UCtEEAYyhxAEo3rvtS4dgzzrvnERDpump': { symbol: 'WEALTH', decimals: 9, name: 'Wealth' },
    'J2eaKn35rp82T6RFEsNK9CLRHEKV9BLXjedFM3q6pump': { symbol: 'FTP', decimals: 9, name: 'FTP' },
    'DtR4D9FtVoTX2569gaL837ZgrB6wNjj6tkmnX9Rdk9B2': { symbol: 'AURA', decimals: 9, name: 'Aura' },
    'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5': { symbol: 'MEW', decimals: 9, name: 'MEW' },
    'FLJYGHpCCcfYUdzhcfHSeSd2peb5SMajNWaCsRnhpump': { symbol: 'STORE', decimals: 9, name: 'Store' }
  }

  const fallbackToken = commonTokens[tokenAddress]
  if (fallbackToken) {
    console.log(`[TokenMetadata] Found token in fallback list: ${fallbackToken.symbol}`)
    return fallbackToken
  }

  // Ultimate fallback for unknown tokens
  console.log(`[TokenMetadata] Using ultimate fallback for unknown token: ${tokenAddress}`)
  return {
    symbol: `TOKEN_${tokenAddress.slice(0, 6)}`,
    decimals: 9, // Most Solana tokens use 9 decimals
    name: `Token ${tokenAddress.slice(0, 8)}...`
  }
}

// Helper function to get token logo URI with fallback
function getTokenLogoURI(tokenAddress: string, tokenSymbol: string): string {
  // Try Jupiter API first
  try {
    // For now, return fallback URI
    // In a real implementation, you would fetch from Jupiter API
    const fallbackLogos: Record<string, string> = {
      'So11111111111111111111111111111111111111112': '/icons/fallback/token/sol.png',
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': '/icons/fallback/token/usdc.png',
      '4AGxpKxYnw7g1ofvYDs5Jq2a1ek5kB9jS2NTUaippump': '/icons/fallback/token/wave.png',
      '86kZasgxFNRfZ1N373EUEs1eeShKb3TeA8tMyUfx5Ck6': '/icons/fallback/token/wave.png',
      'A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS': '/icons/fallback/token/zec.png',
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': '/icons/fallback/token/usdt.png'
    }

    return fallbackLogos[tokenAddress] || `/icons/fallback/token/${tokenSymbol.toLowerCase()}.png`
  } catch (error) {
    console.warn(`[TokenLogo] Failed to get logo for ${tokenAddress}:`, error)
    return `/icons/fallback/token/${tokenSymbol.toLowerCase()}.png`
  }
}

// Helper functions for backward compatibility (now using dynamic metadata)
async function getWithdrawTokenSymbol(tokenAddress: string): Promise<string> {
  const metadata = await getTokenMetadata(tokenAddress)
  return metadata.symbol
}

async function getWithdrawTokenDecimals(tokenAddress: string, providedDecimals?: number): Promise<number> {
  // If decimals are provided by frontend, use them
  if (providedDecimals && providedDecimals > 0) {
    return providedDecimals
  }

  const metadata = await getTokenMetadata(tokenAddress)
  return metadata.decimals
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

    // Get dynamic token metadata for any SPL token
    console.log('[Withdrawal API] Fetching token metadata for:', body.mint)
    const tokenMetadata = await getTokenMetadata(body.mint)
    const decimals = await getWithdrawTokenDecimals(body.mint, body.decimals)

    const token: Token = {
      tokenMintAddress: body.mint,
      decimals
    }

    console.log('[Withdrawal API] Withdrawal token details:', {
      mint: body.mint,
      decimals,
      symbol: tokenMetadata.symbol,
      name: tokenMetadata.name,
      source: 'dynamic'
    })

    // Create withdrawer public key
    const withdrawerPubkey = new PublicKey(body.userPublicKey)

    // CRITICAL: Check if user actually has tokens in Encifher before attempting withdrawal
    console.log('[Withdrawal API] Checking user actual Encifher token balances...')
    try {
      const userTokenMints = await defiClient.getUserTokenMints(withdrawerPubkey)
      console.log('[Withdrawal API] User token mints found:', userTokenMints)

      // REMOVED: No more hardcoded user-reported tokens
      // We will only use tokens that are actually detected by Encifher SDK

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
        console.log(`  ${index + 1}. ${token.tokenMintAddress || token.mintAddress || token.mint} (${token.tokenSymbol || 'Unknown'})`)
      })

      // CRITICAL: Only allow withdrawals of tokens that are actually detected by Encifher SDK
      // User-reported tokens are NOT sufficient for withdrawal - they must exist in the actual Encifher account
      const sdkDetectedToken = userTokenMints.some((mint: any) => (mint.tokenMintAddress || mint.mintAddress || mint.mint) === body.mint)

      if (!sdkDetectedToken) {
        const availableTokenAddresses = userTokenMints.map((m: any) => m.tokenMintAddress || m.mintAddress || m.mint).join(', ')
        return NextResponse.json(
          {
            error: 'Insufficient confidential balance',
            details: `No confidential ${body.mint} balance found in Encifher account. This token must be deposited into Encifher before withdrawal. Available tokens in your Encifher account: ${availableTokenAddresses || 'None'}`,
            debug: {
              requestedToken: body.mint,
              requestedTokenSymbol: tokenMetadata.symbol,
              availableTokens: userTokenMints,
              hasRequestedToken: false,
              note: 'User-reported tokens are not sufficient - tokens must be deposited into Encifher first'
            }
          },
          { status: 400 }
        )
      }

      // ENHANCED: Check actual token balance before proceeding with withdrawal
      console.log('[Withdrawal API] Checking actual token balance for withdrawal...')
      try {
        // Get actual balance using the same authentication method as balances API
        const messagePayload = await defiClient.getMessageToSign()
        console.log('[Withdrawal API] Got message for balance check:', messagePayload)

        // Note: In a real implementation, we would need the user's signature here
        // For now, let's try to get balance without authentication
        const tokenBalances = await defiClient.getBalance(
          withdrawerPubkey,
          { signature: 'mock', message: messagePayload },
          [body.mint],
          encifherKey
        )

        console.log('[Withdrawal API] Token balance check result:', tokenBalances)

        // Check if balance is sufficient
        let actualBalance = '0'
        if (tokenBalances && typeof tokenBalances === 'object') {
          if (Array.isArray(tokenBalances) && tokenBalances.length > 0) {
            actualBalance = tokenBalances[0]?.toString() || '0'
          } else if (typeof tokenBalances === 'object' && body.mint in tokenBalances) {
            actualBalance = tokenBalances[body.mint]?.toString() || '0'
          }
        }

        console.log('[Withdrawal API] Actual balance for withdrawal:', {
          token: body.mint,
          balance: actualBalance,
          requestedAmount: body.amount,
          isSufficient: parseFloat(actualBalance) >= parseFloat(body.amount)
        })

        // Only proceed if balance is sufficient
        if (parseFloat(actualBalance) < parseFloat(body.amount)) {
          return NextResponse.json(
            {
              error: 'Insufficient balance for withdrawal',
              details: `Your confidential balance of ${actualBalance} ${tokenMetadata.symbol} is insufficient for withdrawal of ${body.amount} ${tokenMetadata.symbol}. Please deposit more tokens or withdraw a smaller amount.`,
              debug: {
                actualBalance,
                requestedAmount: body.amount,
                tokenMint: body.mint,
                tokenSymbol: tokenMetadata.symbol,
                note: 'Balance check completed before withdrawal attempt'
              }
            },
            { status: 400 }
          )
        }

      } catch (balanceCheckError: any) {
        console.warn('[Withdrawal API] Balance check failed, proceeding with withdrawal:', balanceCheckError.message)
        // Continue with withdrawal even if balance check fails
        // The SDK will provide proper error if balance is insufficient
      }

      console.log('[Withdrawal API] User account verified - token exists in Encifher account')
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
      tokenSymbol: tokenMetadata.symbol,
      tokenName: tokenMetadata.name,
      tokenDecimals: decimals,
      logoURI: getTokenLogoURI(body.mint, tokenMetadata.symbol),
      instructions: `Please sign this transaction to withdraw your confidential ${tokenMetadata.symbol} tokens. The tokens will be sent to your wallet after confirmation.`
    }

    console.log('[Withdrawal API] Withdrawal transaction prepared successfully:', {
      transactionId: responseData.timestamp,
      amount: responseData.amount,
      mint: responseData.mint,
      tokenSymbol: responseData.tokenSymbol,
      tokenName: responseData.tokenName,
      decimals: responseData.tokenDecimals
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