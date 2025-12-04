/**
 * Professional Deposit API Route using Encifher SDK
 * Follows the official SDK documentation pattern
 */

import { NextRequest, NextResponse } from 'next/server'
import { Connection, PublicKey, Keypair } from '@solana/web3.js'
import { DefiClient, Token, DepositParams } from 'encifher-swap-sdk'
import { EncifherUtils } from '@/lib/utils/encifherUtils'

export async function POST(
  request: NextRequest
) {
  try {
    console.log('[Deposit API] Processing deposit request')

    const body = await request.json()
    const { tokenAddress, amount, userPublicKey, decimals = 6 } = body

    // Validate required parameters
    if (!tokenAddress || !amount || !userPublicKey) {
      return NextResponse.json({
        success: false,
        error: 'Missing required parameters: tokenAddress, amount, userPublicKey'
      }, { status: 400 })
    }

    console.log('[Deposit API] Deposit parameters:', {
      tokenAddress: tokenAddress.slice(0, 8) + '...',
      amount,
      userPublicKey: userPublicKey.slice(0, 8) + '...',
      decimals
    })

    // Initialize Encifher SDK client
    const encifherConfig = EncifherUtils.getConfig()
    if (!encifherConfig) {
      console.error('[Deposit API] Encifher configuration not found')
      return NextResponse.json({
        success: false,
        error: 'Encifher SDK configuration not available'
      }, { status: 500 })
    }

    console.log('[Deposit API] Initializing Encifher SDK client...')
    const config = {
      encifherKey: encifherConfig.encifherKey,
      rpcUrl: encifherConfig.rpcUrl
    }
    const defiClient = new DefiClient(config)

    // Convert addresses to PublicKey objects
    const userPubkey = new PublicKey(userPublicKey)
    const connection = new Connection(encifherConfig.rpcUrl)

    console.log('[Deposit API] 🏗️ Building deposit transaction...')

    // Create token object following SDK documentation
    const token: Token = {
      tokenMintAddress: tokenAddress,
      decimals: decimals
    }

    // Create deposit parameters following SDK docs
    const depositParams: DepositParams = {
      token: token,
      depositor: userPubkey,
      amount: amount // Amount in token units (not base units)
    }

    console.log('[Deposit API] 📥 Calling getDepositTxn with parameters:', {
      tokenMintAddress: token.tokenMintAddress.slice(0, 8) + '...',
      decimals: token.decimals,
      amount: depositParams.amount,
      depositor: depositParams.depositor.toString().slice(0, 8) + '...'
    })

    try {
      // Get deposit transaction using SDK
      const depositTxn = await defiClient.getDepositTxn(depositParams)

      console.log('[Deposit API] ✅ Deposit transaction created successfully')
      console.log('[Deposit API] Transaction details:', {
        instructions: depositTxn.instructions.length,
        signers: depositTxn.signatures.length,
        recentBlockhash: depositTxn.recentBlockhash
      })

      // Serialize transaction for client-side signing
      const serializedTransaction = depositTxn.serialize({
        requireAllSignatures: false,
        verifySignatures: false
      }).toString('base64')

      console.log('[Deposit API] 📦 Transaction serialized and ready for client signing')

      return NextResponse.json({
        success: true,
        transaction: {
          serialized: serializedTransaction,
          message: 'Sign this transaction to deposit your regular tokens into confidential tokens'
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
          '4. Tokens will appear in your confidential balance'
        ],
        note: 'Minimum deposit: $1 worth of SOL required for SOL deposits'
      })

    } catch (sdkError: any) {
      console.error('[Deposit API] ❌ SDK error creating deposit transaction:', sdkError)
      console.error('[Deposit API] Error details:', {
        message: sdkError.message,
        stack: sdkError.stack,
        code: sdkError.code,
        type: sdkError.constructor.name
      })

      // Handle specific SDK errors
      if (sdkError.message?.includes('insufficient funds')) {
        return NextResponse.json({
          success: false,
          error: 'Insufficient regular balance for deposit',
          details: 'You do not have enough regular tokens to complete this deposit'
        }, { status: 400 })
      }

      if (sdkError.message?.includes('Invalid token')) {
        return NextResponse.json({
          success: false,
          error: 'Invalid token address',
          details: 'The specified token address is not supported for deposit'
        }, { status: 400 })
      }

      if (sdkError.message?.includes('minimum deposit')) {
        return NextResponse.json({
          success: false,
          error: 'Minimum deposit requirement not met',
          details: 'Please deposit at least $1 worth of SOL for SOL deposits'
        }, { status: 400 })
      }

      return NextResponse.json({
        success: false,
        error: 'Failed to create deposit transaction',
        details: sdkError.message || 'Unknown SDK error'
      }, { status: 500 })
    }

  } catch (error: any) {
    console.error('[Deposit API] 💥 Unexpected error:', error)
    console.error('[Deposit API] Error stack:', error.stack)

    return NextResponse.json({
      success: false,
      error: 'Internal server error during deposit processing',
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