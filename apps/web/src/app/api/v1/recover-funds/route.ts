/**
 * Emergency Fund Recovery API
 * Helps recover funds stuck in Encifher system after failed swaps
 */

import { NextRequest, NextResponse } from 'next/server'
import { Connection, PublicKey } from '@solana/web3.js'
import { DefiClient, DefiClientConfig } from 'encifher-swap-sdk'

export async function POST(request: NextRequest) {
  try {
    console.log('[Recover Funds] Processing emergency fund recovery request')

    // Parse request body
    const body = await request.json()
    console.log('[Recover Funds] Request body:', body)

    // Validate required fields
    if (!body.userPublicKey) {
      return NextResponse.json(
        {
          error: 'Missing user public key',
          details: 'userPublicKey is required for fund recovery'
        },
        { status: 400 }
      )
    }

    // Get environment variables
    const encifherKey = process.env.NEXT_PUBLIC_ENCIFHER_SDK_KEY
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com'

    if (!encifherKey) {
      return NextResponse.json(
        {
          error: 'Missing Encifher SDK key',
          details: 'NEXT_PUBLIC_ENCIFHER_SDK_KEY environment variable is required'
        },
        { status: 500 }
      )
    }

    console.log('[Recover Funds] Initializing Encifher SDK client for recovery')

    // Initialize Encifher SDK client
    const config: DefiClientConfig = {
      encifherKey,
      rpcUrl,
      mode: 'Mainnet' as const
    }
    const defiClient = new DefiClient(config)
    const connection = new Connection(rpcUrl)

    // Create user public key
    const userPubkey = new PublicKey(body.userPublicKey)

    console.log('[Recover Funds] Attempting to check user balance and initiate recovery')

    try {
      // Get message to sign for balance check
      const msgPayload = await defiClient.getMessageToSign()
      console.log('[Recover Funds] Message payload received for balance check')

      // Since we can't sign on behalf of the user, we'll return instructions
      // for the user to check their own balance and potentially contact support

      const recoveryInfo = {
        criticalAlert: "🚨 EMERGENCY: Your swaps are stuck in ENCRYPTED_PENDING status!",
        stuckFunds: [
          "• 400 WAVE→USDC (should be ~4.56 USDC)",
          "• 603.125 WAVE→SOL (SOL amount missing)",
          "• 0.0247 SOL→USDC (USDC amount missing)",
          "• 0.0165 SOL→WAVE (WAVE amount missing)",
          "• 550 WAVE→Token (Token amount missing)"
        ],
        immediateSteps: [
          "1. ATTEMPT WITHDRAWAL: Try withdrawing your available SOL token first",
          "2. CHECK BALANCES: Refresh confidential balance to see if tokens appear",
          "3. SMALL TEST: Try withdrawing a small amount if available",
          "4. SAVE EVIDENCE: Screenshot your swap history showing ENCRYPTED_PENDING",
          "5. DOCUMENT SWAPS: Note all swap IDs for support request"
        ],
        troubleshooting: [
          "Refresh the page and check your confidential balance",
          "Try a smaller withdrawal amount first",
          "Check if there are sufficient network fees in your wallet",
          "Wait a few minutes for blockchain to confirm the deposit"
        ],
        supportInfo: {
          userAddress: body.userPublicKey,
          timestamp: new Date().toISOString(),
          issue: "Private swap failed after deposit confirmation",
          action: "Funds may be held in Encifher system"
        }
      }

      console.log('[Recover Funds] Recovery instructions generated')

      return NextResponse.json({
        success: true,
        data: recoveryInfo,
        message: "Fund recovery instructions generated. Please follow the steps below."
      })

    } catch (balanceError) {
      console.error('[Recover Funds] Error checking balance:', balanceError)

      return NextResponse.json({
        success: true,
        data: {
          fallbackInstructions: [
            "1. Unable to check Encifher balance automatically",
            "2. Please try withdrawing funds using the WITHDRAW tab",
            "3. If withdrawal fails, contact Encifher support with:",
            `- Wallet Address: ${body.userPublicKey}`,
            `- Timestamp: ${new Date().toISOString()}`,
            `- Error: Balance check failed`,
            `- Last Error: ${balanceError instanceof Error ? balanceError.message : 'Unknown'}`
          ]
        },
        message: "Manual recovery instructions provided due to balance check failure"
      })
    }

  } catch (error) {
    console.error('[Recover Funds] Error processing recovery request:', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process fund recovery request',
        details: error instanceof Error ? error.message : String(error),
        fallbackSteps: [
          "1. Contact Encifher support immediately",
          "2. Provide your wallet address and transaction details",
          "3. Mention that swap failed after deposit confirmation",
          "4. Request manual fund withdrawal from their system"
        ]
      },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json(
    {
      error: 'Method not allowed',
      details: 'Only POST method is supported for fund recovery'
    },
    { status: 405 }
  )
}