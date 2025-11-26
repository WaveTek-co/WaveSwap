/**
 * Encifher Private Swap Transaction Preparation API Route
 *
 * Prepares private swap transactions using Encifher SDK for privacy-enabled swaps.
 * This replaces the deprecated prepare-swap-tx API endpoint with SDK-based implementation.
 */

import { NextRequest, NextResponse } from 'next/server'
import { Connection, PublicKey } from '@solana/web3.js'
import { EncifherClient, EncifherUtils } from '@/lib/encifher'

interface PrepareSwapRequest {
  inputMint: string
  outputMint: string
  amountIn: string
  senderPubkey: string
  receiverPubkey: string
  slippageBps?: number
}

interface PrepareSwapResponse {
  success: boolean
  transaction?: string // Base64 encoded transaction
  error?: string
  estimatedTime?: string
}

export async function POST(request: NextRequest): Promise<NextResponse<PrepareSwapResponse>> {
  try {
    // Parse request body
    const body: PrepareSwapRequest = await request.json()
    const { inputMint, outputMint, amountIn, senderPubkey, receiverPubkey, slippageBps = 100 } = body

    // Validate required fields
    if (!inputMint || !outputMint || !amountIn || !senderPubkey || !receiverPubkey) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: inputMint, outputMint, amountIn, senderPubkey, receiverPubkey'
      }, { status: 400 })
    }

    // Check if Encifher is configured
    if (!EncifherUtils.isConfigured()) {
      return NextResponse.json({
        success: false,
        error: 'Encifher SDK not configured'
      }, { status: 503 })
    }

    // Validate input amount
    const amount = parseFloat(amountIn)
    if (isNaN(amount) || amount <= 0) {
      return NextResponse.json({
        success: false,
        error: 'Invalid amount: must be a positive number'
      }, { status: 400 })
    }

    // Validate public keys
    try {
      new PublicKey(senderPubkey)
      new PublicKey(receiverPubkey)
      new PublicKey(inputMint)
      new PublicKey(outputMint)
    } catch {
      return NextResponse.json({
        success: false,
        error: 'Invalid public key or token address'
      }, { status: 400 })
    }

    // Initialize connection and Encifher client
    const heliusRpc = process.env.NEXT_PUBLIC_ENCIFHER_RPC_URL || 'https://api-mainnet.helius-rpc.com/v0/transactions/?api-key=5daea224-93bd-415d-ac58-9e5777656acf'
    const connection = new Connection(heliusRpc)
    const config = EncifherUtils.getConfig()!

    // Initialize Encifher client
    const encifher = EncifherUtils.createClient(connection, config)

    // Check if tokens are supported by Encifher
    if (!encifher.isPrivacySupported(inputMint) || !encifher.isPrivacySupported(outputMint)) {
      return NextResponse.json({
        success: false,
        error: 'One or both tokens are not supported for private swaps'
      }, { status: 400 })
    }

    // Prepare private swap transaction using correct SDK method
    const { transaction } = await encifher.createPrivateSwap({
      inMint: inputMint,
      outMint: outputMint,
      amountIn: amountIn,
      senderPubkey: new PublicKey(senderPubkey),
      receiverPubkey: new PublicKey(receiverPubkey)
    })

    return NextResponse.json({
      success: true,
      transaction: transaction.serialize().toString('base64'), // Convert Transaction to base64 string
      estimatedTime: '1-3 minutes'
    })

  } catch (error) {
    console.error('Error in Encifher prepare swap API:', error)

    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('Insufficient liquidity')) {
        return NextResponse.json({
          success: false,
          error: 'Insufficient liquidity for private swap'
        }, { status: 400 })
      }

      if (error.message.includes('Invalid token')) {
        return NextResponse.json({
          success: false,
          error: 'Invalid token address'
        }, { status: 400 })
      }

      if (error.message.includes('Amount too small')) {
        return NextResponse.json({
          success: false,
          error: 'Amount too small for private transaction'
        }, { status: 400 })
      }

      if (error.message.includes('Rate limit')) {
        return NextResponse.json({
          success: false,
          error: 'Rate limit exceeded. Please try again later.'
        }, { status: 429 })
      }
    }

    return NextResponse.json({
      success: false,
      error: 'Failed to prepare private swap transaction'
    }, { status: 500 })
  }
}

// Handle unsupported methods
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    success: false,
    error: 'Method not allowed. Use POST to prepare private swap transactions.'
  }, { status: 405 })
}