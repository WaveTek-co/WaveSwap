/**
 * Private Swap Execution API
 * Executes confidential swap transactions using Encifher SDK
 * Also saves transaction to database for history tracking
 */

import { NextRequest, NextResponse } from 'next/server'
import { Connection, PublicKey } from '@solana/web3.js'
import { DefiClient, SignedSwapParams, DefiClientConfig } from 'encifher-swap-sdk'
import { PrismaClient, SwapStatus } from '@prisma/client'
import { config } from '@/lib/config'

const prisma = new PrismaClient()

export async function POST(
  request: NextRequest
) {
  // Declare variables in function scope so they're accessible in catch blocks
  let swap: any = null
  let intentId: string = ''

  try {
    console.log('[Private Swap Execute] Processing private swap execution request')

    // Parse request body
    const body = await request.json()
    console.log('[Private Swap Execute] Request body:', body)

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

    // Save transaction to database for history tracking
    console.log('[Private Swap Execute] Saving transaction to database')
    try {
      intentId = `intent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      const userAddress = body.orderDetails.senderPubkey

      // Ensure user exists first
      await prisma.user.upsert({
        where: { address: userAddress },
        update: {},
        create: { address: userAddress }
      })

      swap = await prisma.swap.create({
        data: {
          intentId,
          userAddress,
          inputToken: body.orderDetails.inMint,
          outputToken: body.orderDetails.outMint,
          inputAmount: BigInt(body.orderDetails.amountIn),
          feeBps: 20, // 0.2% fee for private swaps
          privacyMode: true, // Private swap
          slippageBps: 50, // Default slippage
          status: SwapStatus.ENCRYPTED_PENDING,
        },
      })

      // Create initial stage
      await prisma.swapStage.create({
        data: {
          swapId: swap.id,
          name: 'Private Swap Initiated',
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      })

      console.log('[Private Swap Execute] Transaction saved to database with intentId:', intentId)
    } catch (dbError) {
      console.error('[Private Swap Execute] Failed to save transaction to database:', dbError)
      // Continue with execution even if database save fails
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

    console.log('[Private Swap Execute] Initializing Encifher SDK client')

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
        message: body.orderDetails.message || `Private swap ${body.orderDetails.inMint} to ${body.orderDetails.outMint}`
      }
    }

    console.log('[Private Swap Execute] Executing private swap transaction', {
      inMint: swapParams.orderDetails.inMint,
      outMint: swapParams.orderDetails.outMint,
      amountIn: swapParams.orderDetails.amountIn,
      sender: swapParams.orderDetails.senderPubkey.toString(),
      receiver: swapParams.orderDetails.receiverPubkey.toString(),
      message: swapParams.orderDetails.message
    })

    // Execute swap transaction using Encifher SDK
    let executeResponse
    try {
      console.log('[Private Swap Execute] Attempting to execute swap with Encifher SDK...')
      executeResponse = await defiClient.executeSwapTxn(swapParams)

      console.log('[Private Swap Execute] Swap executed successfully:', {
        orderStatusIdentifier: executeResponse.orderStatusIdentifier
      })
    } catch (sdkError: any) {
      console.error('[Private Swap Execute] Encifher SDK execution failed:', {
        error: sdkError.message,
        stack: sdkError.stack,
        response: sdkError.response?.data,
        status: sdkError.response?.status,
        statusText: sdkError.response?.statusText
      })

      // If it's an axios error with response data, include that
      if (sdkError.response?.data) {
        console.error('[Private Swap Execute] Encifher API error details:', sdkError.response.data)
      }

      throw sdkError
    }

    // Track confidential balance for the output token after successful swap
    try {
      console.log('[Private Swap Execute] Tracking confidential balance for output token')

      // Extract token addresses from swap request body
      const { message } = body
      if (message && message.includes('to USDC') && body.orderDetails) {
        // This was a WAVE to USDC swap - track the USDC output
        const usdcAddress = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

        // Estimate output amount (input amount minus fees)
        // TODO: Get actual output amount from swap details when available
        const estimatedOutputAmount = parseFloat(body.inputAmount || '0') * 0.98 // 2% fee estimate

        console.log(`[Private Swap Execute] Tracking ${estimatedOutputAmount} USDC for user ${body.userPublicKey}`)

        // Call confidential balance tracking API
        const balanceResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/v1/confidential/balances`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userPublicKey: body.userPublicKey,
            tokenAddress: usdcAddress,
            amount: estimatedOutputAmount,
            operation: 'add',
            source: 'private_swap_execution'
          })
        })

        if (balanceResponse.ok) {
          console.log('[Private Swap Execute] Successfully tracked confidential balance')
        } else {
          console.error('[Private Swap Execute] Failed to track confidential balance:', balanceResponse.status)
        }
      }
    } catch (balanceError) {
      console.error('[Private Swap Execute] Error tracking confidential balance:', balanceError)
      // Don't fail the swap if balance tracking fails
    }

    const responseData = {
      success: true,
      timestamp: new Date().toISOString(),
      ...executeResponse,
      message: `Private swap initiated! Order ID: ${String(executeResponse.orderStatusIdentifier).slice(0, 12)}...`
    }

    console.log('[Private Swap Execute] Execute swap response prepared successfully')

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

  } catch (error: any) {
    console.error('[Private Swap Execute] Error executing private swap:', error)

    // CRITICAL: If swap execution fails, we need to mark the transaction as failed in database
    // This indicates that funds were deposited but swap failed - requires manual intervention
    try {
      if (swap) {
        await prisma.swapStage.create({
          data: {
            swapId: swap.id,
            name: 'Private Swap Failed - FUNDS AT RISK',
            status: 'FAILED',
            completedAt: new Date(),
            error: `Swap execution failed after deposit was confirmed. Error: ${error.message}. User may need to contact support for fund recovery.`
          },
        })

        await prisma.swap.update({
          where: { id: swap.id },
          data: {
            status: SwapStatus.FAILED,
            error: `PRIVATE_SWAP_EXECUTION_FAILED: ${error.message} - DEPOSIT_CONFIRMED_BUT_SWAP_FAILED`
          }
        })

        console.error('[Private Swap Execute] CRITICAL: Swap failed after deposit confirmation - funds at risk!', {
          swapId: swap.id,
          intentId,
          error: error.message
        })
      }
    } catch (dbError) {
      console.error('[Private Swap Execute] Failed to update swap failure status:', dbError)
    }

    return NextResponse.json(
      {
        error: 'Failed to execute private swap',
        details: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        critical: 'SWAP_EXECUTION_FAILED_AFTER_DEPOSIT',
        swapId: swap?.id,
        intentId: intentId,
        requiresManualIntervention: true
      },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}

export async function GET() {
  return NextResponse.json(
    {
      error: 'Method not allowed',
      details: 'Only POST method is supported for private swap execution'
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