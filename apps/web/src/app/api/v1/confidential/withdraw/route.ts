/**
 * Professional Withdrawal API Route using Encifher SDK
 * Follows the official SDK documentation pattern
 */

import { NextRequest, NextResponse } from 'next/server'
import { Connection, PublicKey, Keypair } from '@solana/web3.js'
import { DefiClient, Token, WithdrawParams } from 'encifher-swap-sdk'
import { EncifherUtils } from '@/lib/utils/encifherUtils'

export async function POST(
  request: NextRequest
) {
  try {
    console.log('[Withdrawal API] Processing withdrawal request')

    const body = await request.json()
    const { tokenAddress, amount, userPublicKey, decimals = 6 } = body

    // Validate required parameters
    if (!tokenAddress || !amount || !userPublicKey) {
      return NextResponse.json({
        success: false,
        error: 'Missing required parameters: tokenAddress, amount, userPublicKey'
      }, { status: 400 })
    }

    console.log('[Withdrawal API] Withdrawal parameters:', {
      tokenAddress: tokenAddress.slice(0, 8) + '...',
      amount,
      userPublicKey: userPublicKey.slice(0, 8) + '...',
      decimals
    })

    // Initialize Encifher SDK client
    const encifherConfig = EncifherUtils.getConfig()
    if (!encifherConfig) {
      console.error('[Withdrawal API] Encifher configuration not found')
      return NextResponse.json({
        success: false,
        error: 'Encifher SDK configuration not available'
      }, { status: 500 })
    }

    console.log('[Withdrawal API] Initializing Encifher SDK client...')
    const config = {
      encifherKey: encifherConfig.encifherKey,
      rpcUrl: encifherConfig.rpcUrl
    }
    const defiClient = new DefiClient(config)

    // Convert addresses to PublicKey objects
    const userPubkey = new PublicKey(userPublicKey)
    const connection = new Connection(encifherConfig.rpcUrl)

    console.log('[Withdrawal API] 🏗️ Building withdrawal transaction...')

    // Create token object following SDK documentation
    const token: Token = {
      tokenMintAddress: tokenAddress,
      decimals: decimals
    }

    // Create withdrawal parameters following SDK docs
    const withdrawParams: WithdrawParams = {
      token: token,
      amount: amount, // Amount in token units (not base units)
      withdrawer: userPubkey
    }

    console.log('[Withdrawal API] 📤 Calling getWithdrawTxn with parameters:', {
      tokenMintAddress: token.tokenMintAddress.slice(0, 8) + '...',
      decimals: token.decimals,
      amount: withdrawParams.amount,
      withdrawer: withdrawParams.withdrawer.toString().slice(0, 8) + '...'
    })

    try {
      // Get withdrawal transaction using SDK
      const withdrawTxn = await defiClient.getWithdrawTxn(withdrawParams)

      console.log('[Withdrawal API] ✅ Withdrawal transaction created successfully')
      console.log('[Withdrawal API] Transaction details:', {
        instructions: withdrawTxn.instructions.length,
        signers: withdrawTxn.signatures.length,
        recentBlockhash: withdrawTxn.recentBlockhash
      })

      // Serialize transaction for client-side signing
      const serializedTransaction = withdrawTxn.serialize({
        requireAllSignatures: false,
        verifySignatures: false
      }).toString('base64')

      console.log('[Withdrawal API] 📦 Transaction serialized and ready for client signing')

      return NextResponse.json({
        success: true,
        transaction: {
          serialized: serializedTransaction,
          message: 'Sign this transaction to withdraw your confidential tokens back to regular tokens'
        },
        details: {
          tokenAddress,
          amount,
          decimals,
          userPublicKey,
          estimatedFee: 0.000005 // SOL fee estimate
        },
        nextSteps: [
          '1. Sign the transaction with your wallet',
          '2. Broadcast the signed transaction',
          '3. Wait for confirmation',
          '4. Tokens will appear in your regular wallet'
        ]
      })

    } catch (sdkError: any) {
      console.error('[Withdrawal API] ❌ SDK error creating withdrawal transaction:', sdkError)
      console.error('[Withdrawal API] Error details:', {
        message: sdkError.message,
        stack: sdkError.stack,
        code: sdkError.code,
        type: sdkError.constructor.name
      })

      // Handle specific SDK errors
      if (sdkError.message?.includes('insufficient funds')) {
        return NextResponse.json({
          success: false,
          error: 'Insufficient confidential balance for withdrawal',
          details: 'You do not have enough confidential tokens to complete this withdrawal'
        }, { status: 400 })
      }

      if (sdkError.message?.includes('Invalid token')) {
        return NextResponse.json({
          success: false,
          error: 'Invalid token address',
          details: 'The specified token address is not supported for withdrawal'
        }, { status: 400 })
      }

      return NextResponse.json({
        success: false,
        error: 'Failed to create withdrawal transaction',
        details: sdkError.message || 'Unknown SDK error'
      }, { status: 500 })
    }

  } catch (error: any) {
    console.error('[Withdrawal API] 💥 Unexpected error:', error)
    console.error('[Withdrawal API] Error stack:', error.stack)

    return NextResponse.json({
      success: false,
      error: 'Internal server error during withdrawal processing',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 })
  }
}

// Handle OPTIONS requests for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}