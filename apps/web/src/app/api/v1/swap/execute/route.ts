/**
 * API Route for Swap Execution
 *
 * Handles both normal and private swap execution flows.
 * Integrates with Jupiter for swaps and Arcium for confidential token operations.
 *
 * References:
 * - Jupiter Swap API: https://station.jup.ag/api/v6/swap
 * - Arcium Confidential SPL: https://www.arcium.com/articles/confidential-spl-token
 */

import { NextRequest, NextResponse } from 'next/server'
import { JupiterAPI } from '@/lib/jupiter'
import { ArciumClient } from '@/lib/arcium'
import { FeeCollectionService } from '@/lib/feeCollection'
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js'
import { config } from '@/lib/config'

interface SwapExecutionRequest {
  quote: any
  userPublicKey: string
  privacyMode: boolean
  wrapAndUnwrapSol?: boolean
  feeAccount?: string
  asLegacyTransaction?: boolean
}

interface ExecutionStep {
  step: number
  action: string
  status: string
  error?: string
}

export async function POST(request: NextRequest) {
  try {
    const body: SwapExecutionRequest = await request.json()
    const { quote, userPublicKey, privacyMode, ...swapParams } = body

    // Validate required parameters
    if (!quote || !userPublicKey) {
      return NextResponse.json(
        { error: 'Missing required parameters: quote, userPublicKey' },
        { status: 400 }
      )
    }

    // Initialize services with configured RPC
    const connection = new Connection(config.rpc.url)
    const jupiterApi = new JupiterAPI(connection)
    const arciumClient = new ArciumClient(connection, process.env.ARCIUM_API_KEY)
    const feeCollectionService = new FeeCollectionService(connection)

    console.log('Executing swap:', { userPublicKey, privacyMode, swapMode: privacyMode ? 'private' : 'normal' })

    let executionSteps: ExecutionStep[] = []
    let transactions = []

    try {
      // Step 1: Privacy mode - Wrap input tokens
      if (privacyMode) {
        console.log('Step 1: Wrapping input tokens for privacy')
        executionSteps.push({ step: 1, action: 'wrapping', status: 'processing' })

        const wrapParams = {
          mint: new PublicKey(quote.inputMint),
          amount: parseFloat(quote.inAmount) / Math.pow(10, 9), // Assuming SOL decimals, adjust per token
          userPublicKey: new PublicKey(userPublicKey),
          connection
        }

        const { transaction: wrapTx, confidentialAccount } = await arciumClient.wrapTokens(wrapParams)
        transactions.push({ type: 'wrap', transaction: wrapTx, confidentialAccount })

        if (executionSteps[0]) {
          executionSteps[0].status = 'completed'
        }
        console.log('Wrapping completed, confidential account:', confidentialAccount)
      }

      // Step 2: Execute swap transaction
      console.log('Step 2: Executing swap transaction')
      const currentStep = executionSteps.length + 1
      executionSteps.push({ step: currentStep, action: 'swapping', status: 'processing' })

      const swapResponse = await jupiterApi.getSwapTransaction({
        quoteResponse: quote,
        userPublicKey,
        wrapAndUnwrapSol: swapParams.wrapAndUnwrapSol || false,
        useSharedAccounts: false,
        feeAccount: swapParams.feeAccount,
        asLegacyTransaction: swapParams.asLegacyTransaction || false
      })

      const swapTransaction = await jupiterApi.prepareTransaction(swapResponse)

      // Add fee collection to the swap transaction
      const userPubkey = new PublicKey(userPublicKey)
      let transactionWithFees

      // Handle both legacy and versioned transactions
      if ('version' in swapTransaction) {
        // VersionedTransaction - for now, skip fee collection for versioned transactions
        console.warn('[FeeCollection] Skipping fee collection for versioned transaction (not yet supported)')
        transactionWithFees = swapTransaction
      } else {
        // Legacy Transaction - add fee collection
        transactionWithFees = await feeCollectionService.addFeesToTransaction(
          swapTransaction,
          quote.inputMint,
          quote.outAmount,
          userPubkey,
          privacyMode
        )
      }

      transactions.push({ type: 'swap', transaction: transactionWithFees })

      const swapStep = executionSteps[currentStep - 1]
      if (swapStep) {
        swapStep.status = 'completed'
      }

      // Calculate and log fee collection details
      const feeDetails = feeCollectionService.calculateFee(quote.outAmount, privacyMode)
      console.log('Swap transaction prepared with fees:', {
        inputMint: quote.inputMint,
        outputAmount: quote.outAmount,
        privacyMode,
        ...feeDetails
      })

      // Step 3: Privacy mode - Unwrap output tokens
      if (privacyMode) {
        console.log('Step 3: Unwrapping output tokens')
        const unwrapStep = executionSteps.length + 1
        executionSteps.push({ step: unwrapStep, action: 'unwrapping', status: 'processing' })

        const unwrapParams = {
          confidentialMint: new PublicKey(quote.outputMint), // TODO: Use actual confidential mint
          amount: parseFloat(quote.outAmount) / Math.pow(10, 6), // Assuming USDC decimals, adjust per token
          userPublicKey: new PublicKey(userPublicKey),
          connection
        }

        const { transaction: unwrapTx } = await arciumClient.unwrapTokens(unwrapParams)
        transactions.push({ type: 'unwrap', transaction: unwrapTx })

        const unwrapStepElement = executionSteps[unwrapStep - 1]
        if (unwrapStepElement) {
          unwrapStepElement.status = 'completed'
      }
        console.log('Unwrapping completed')
      }

      return NextResponse.json({
        success: true,
        transactions,
        executionSteps,
        metadata: {
          executedAt: new Date().toISOString(),
          privacyMode,
          totalTransactions: transactions.length,
          inputMint: quote.inputMint,
          outputMint: quote.outputMint,
          inputAmount: quote.inAmount,
          outputAmount: quote.outAmount,
          slippageBps: quote.slippageBps,
          priceImpactPct: quote.priceImpactPct,
          feeCollection: {
            ...feeDetails,
            feeCollected: !('version' in swapTransaction), // Indicates if fees were actually added
            feeWallet: feeCollectionService.getFeeWallet().toString()
          }
        }
      })

    } catch (executionError) {
      console.error('Error during swap execution:', executionError)

      // Mark current step as failed
      if (executionSteps.length > 0) {
        const lastStep = executionSteps[executionSteps.length - 1]
        if (lastStep) {
          lastStep.status = 'failed'
          lastStep.error = executionError instanceof Error ? executionError.message : 'Unknown error'
        }
      }

      return NextResponse.json(
        {
          success: false,
          error: 'Swap execution failed',
          details: executionError instanceof Error ? executionError.message : 'Unknown error',
          executionSteps,
          completedTransactions: transactions,
          failedAtStep: executionSteps.length
        },
        { status: 500 }
      )
    }

  } catch (error) {
    console.error('Error in swap execute API:', error)

    return NextResponse.json(
      {
        error: 'Internal server error while executing swap',
        details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  // GET method for checking execution status or getting execution information
  return NextResponse.json({
    message: 'Swap execution API - Use POST method to execute swaps',
    endpoints: {
      'POST /api/v1/swap/execute': 'Execute a swap transaction',
      parameters: {
        quote: 'Jupiter quote response',
        userPublicKey: 'User wallet public key',
        privacyMode: 'Whether to use confidential transactions (boolean)',
        wrapAndUnwrapSol: 'Whether to wrap/unwrap SOL (optional)',
        feeAccount: 'Fee account address (optional)',
        asLegacyTransaction: 'Use legacy transaction format (optional)'
      }
    },
    documentation: {
      jupiter: 'https://hub.jup.ag/docs/swap-api/',
      arcium: 'https://docs.arcium.com/developers/js-client-library'
    }
  })
}