/**
 * Enhanced Private Swap Service
 *
 * Handles the complete private swap flow:
 * 1. Deposit public tokens → Get wrapped confidential tokens (cUSDC, cSOL)
 * 2. Get swap quote for confidential tokens
 * 3. Execute private swap within Encifher pools
 * 4. Withdraw confidential tokens → Get public tokens back
 */

import { Connection, PublicKey, Transaction, Keypair } from '@solana/web3.js'
import { EncifherClient, EncifherTokenInfo, EncifherSwapQuoteParams } from '@/lib/encifher'
import { Token } from '@/types/token'

export interface PrivateSwapFlowParams {
  inputToken: Token
  outputToken: Token
  inputAmount: string // In display units (e.g., 1.5 USDC)
  userPublicKey: PublicKey
  slippageBps?: number
}

export interface PrivateSwapFlowResult {
  steps: PrivateSwapStep[]
  totalEstimatedTime: string
  requiresDeposit: boolean
  requiresWithdrawal: boolean
  estimatedOutputAmount: string
}

export interface PrivateSwapStep {
  type: 'deposit' | 'quote' | 'swap' | 'withdraw' | 'status_poll'
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  description: string
  transaction?: Transaction
  estimatedTime: string
  error?: string
}

export interface PrivateBalances {
  [tokenMint: string]: {
    publicBalance: string
    privateBalance: string
    tokenMintAddress: string
    decimals: number
    symbol: string
  }
}

/**
 * Enhanced service for complete private swap flows
 */
export class PrivateSwapService {
  private encifherClient: EncifherClient
  private connection: Connection
  private userKeypair: Keypair | null = null

  constructor(connection: Connection, encifherClient: EncifherClient) {
    this.connection = connection
    this.encifherClient = encifherClient
  }

  /**
   * Set user keypair for signing transactions
   */
  setUserKeypair(keypair: Keypair): void {
    this.userKeypair = keypair
    this.encifherClient.setUserKeypair(keypair)
  }

  /**
   * Get both public and private balances for a user
   */
  async getHybridBalances(tokens: Token[]): Promise<PrivateBalances> {
    if (!this.userKeypair) {
      throw new Error('User keypair not set')
    }

    const balances: PrivateBalances = {}
    const tokenMints = tokens.map(token => token.address)

    try {
      // Get public balances
      for (const token of tokens) {
        try {
          const tokenAccount = await this.connection.getTokenAccountBalance(
            // Note: In a real implementation, you'd need to find the user's token account
            new PublicKey('11111111111111111111111111111111') // Placeholder
          )
          balances[token.address] = {
            publicBalance: tokenAccount.value.uiAmountString || '0',
            privateBalance: '0',
            tokenMintAddress: token.address,
            decimals: token.decimals,
            symbol: token.symbol
          }
        } catch (error) {
          balances[token.address] = {
            publicBalance: '0',
            privateBalance: '0',
            tokenMintAddress: token.address,
            decimals: token.decimals,
            symbol: token.symbol
          }
        }
      }

      // Get private balances from Encifher
      const privateBalances = await this.encifherClient.getPrivateBalance(
        this.userKeypair.publicKey,
        tokenMints
      )

      // Merge private balances
      privateBalances.forEach((balance, tokenMint) => {
        if (balances[tokenMint]) {
          balances[tokenMint].privateBalance = balance.encryptedBalance
        }
      })

    } catch (error) {
      console.error('[WAVETEK] balance fetch failed <ENCRYPTED>')
      throw new Error(`Failed to get balances: ${error}`)
    }

    return balances
  }

  /**
   * Plan the complete private swap flow
   */
  async planPrivateSwap(params: PrivateSwapFlowParams): Promise<PrivateSwapFlowResult> {
    const { inputToken, outputToken, inputAmount, userPublicKey } = params

    // Get current balances
    const balances = await this.getHybridBalances([inputToken, outputToken])

    const inputBalance = balances[inputToken.address]
    if (!inputBalance) {
      throw new Error(`No balance found for input token: ${inputToken.address}`)
    }
    const inputAmountInBaseUnits = this.convertToBaseUnits(inputAmount, inputToken.decimals)

    // Check if user needs to deposit
    const requiresDeposit = parseFloat(inputBalance.privateBalance) < parseFloat(inputAmount)

    // Check if user will want to withdraw (most likely yes)
    const requiresWithdrawal = true // Assume users want public tokens back

    // Get private swap quote
    const quoteParams: EncifherSwapQuoteParams = {
      inMint: inputToken.address,
      outMint: outputToken.address,
      amountIn: inputAmountInBaseUnits
    }

    let estimatedOutputAmount = '0'
    try {
      const quote = await this.encifherClient.getPrivateSwapQuote(quoteParams)
      estimatedOutputAmount = quote.expectedOutAmount
    } catch (error) {
      console.error('Error getting quote:', error)
      throw new Error(`Failed to get swap quote: ${error}`)
    }

    // Build the swap flow steps
    const steps: PrivateSwapStep[] = []

    if (requiresDeposit) {
      steps.push({
        type: 'deposit',
        status: 'pending',
        description: `Deposit ${inputAmount} ${inputToken.symbol} to private pool`,
        estimatedTime: '30-60 seconds'
      })
    }

    steps.push({
      type: 'quote',
      status: 'completed', // We already got the quote
      description: `Swap ${inputAmount} ${inputToken.symbol} → ${this.convertFromBaseUnits(estimatedOutputAmount, outputToken.decimals)} ${outputToken.symbol} privately`,
      estimatedTime: '5-10 seconds'
    })

    steps.push({
      type: 'swap',
      status: 'pending',
      description: `Execute private swap transaction`,
      estimatedTime: '2-5 minutes'
    })

    steps.push({
      type: 'status_poll',
      status: 'pending',
      description: `Monitor private swap completion`,
      estimatedTime: '2-5 minutes'
    })

    if (requiresWithdrawal) {
      steps.push({
        type: 'withdraw',
        status: 'pending',
        description: `Withdraw ${outputToken.symbol} to public wallet`,
        estimatedTime: '30-60 seconds'
      })
    }

    return {
      steps,
      totalEstimatedTime: this.calculateTotalTime(steps),
      requiresDeposit,
      requiresWithdrawal,
      estimatedOutputAmount: this.convertFromBaseUnits(estimatedOutputAmount, outputToken.decimals)
    }
  }

  /**
   * Execute the complete private swap flow
   */
  async executePrivateSwap(
    params: PrivateSwapFlowParams,
    onStepUpdate?: (step: PrivateSwapStep) => void
  ): Promise<{ success: boolean; transactionSignatures: string[]; finalBalance?: string }> {
    if (!this.userKeypair) {
      throw new Error('User keypair not set')
    }

    const plan = await this.planPrivateSwap(params)
    const transactionSignatures: string[] = []

    try {
      for (const step of plan.steps) {
        // Update step status to in_progress
        step.status = 'in_progress'
        onStepUpdate?.(step)

        switch (step.type) {
          case 'deposit':
            await this.executeDeposit(step, params, onStepUpdate)
            break
          case 'swap':
            await this.executeSwap(step, params, onStepUpdate)
            break
          case 'status_poll':
            await this.pollSwapStatus(step, params, onStepUpdate)
            break
          case 'withdraw':
            await this.executeWithdrawal(step, params, onStepUpdate)
            break
          case 'quote':
            // Already done in planning
            step.status = 'completed'
            break
        }

        // Small delay between steps
        await new Promise(resolve => setTimeout(resolve, 1000))
      }

      // Get final balance
      const balances = await this.getHybridBalances([params.outputToken])
      const finalBalance = balances[params.outputToken.address]?.publicBalance || '0'

      return {
        success: true,
        transactionSignatures,
        finalBalance
      }

    } catch (error) {
      console.error('Private swap failed:', error)
      return {
        success: false,
        transactionSignatures
      }
    }
  }

  private async executeDeposit(
    step: PrivateSwapStep,
    params: PrivateSwapFlowParams,
    onStepUpdate?: (step: PrivateSwapStep) => void
  ): Promise<void> {
    try {
      const tokenInfo: EncifherTokenInfo = {
        tokenMintAddress: params.inputToken.address,
        decimals: params.inputToken.decimals,
        isConfidentialSupported: true
      }

      const { transaction } = await this.encifherClient.privateDeposit({
        token: tokenInfo,
        amount: params.inputAmount,
        userPublicKey: params.userPublicKey
      })

      // Sign and send transaction
      if (this.userKeypair) {
        transaction.partialSign(this.userKeypair)

        const signature = await this.connection.sendRawTransaction(
          transaction.serialize(),
          {
            preflightCommitment: 'confirmed'
          }
        )

        await this.connection.confirmTransaction(signature, 'confirmed')

        step.status = 'completed'
        step.transaction = transaction
        onStepUpdate?.(step)
      }
    } catch (error) {
      step.status = 'failed'
      step.error = error instanceof Error ? error.message : String(error)
      onStepUpdate?.(step)
      throw error
    }
  }

  private async executeSwap(
    step: PrivateSwapStep,
    params: PrivateSwapFlowParams,
    onStepUpdate?: (step: PrivateSwapStep) => void
  ): Promise<void> {
    try {
      const amountInBaseUnits = this.convertToBaseUnits(params.inputAmount, params.inputToken.decimals)

      const { transaction } = await this.encifherClient.createPrivateSwap({
        inMint: params.inputToken.address,
        outMint: params.outputToken.address,
        amountIn: amountInBaseUnits,
        senderPubkey: params.userPublicKey,
        receiverPubkey: params.userPublicKey
      })

      // Sign transaction (but don't broadcast - executeSwapTxn handles that)
      if (this.userKeypair) {
        transaction.partialSign(this.userKeypair)

        const serializedTxn = transaction.serialize().toString('base64')

        const executeResponse = await this.encifherClient.executePrivateSwap(
          serializedTxn,
          {
            inMint: params.inputToken.address,
            outMint: params.outputToken.address,
            amountIn: amountInBaseUnits,
            senderPubkey: params.userPublicKey,
            receiverPubkey: params.userPublicKey
          }
        )

        // Store order identifier for status polling
        ;(step as any).orderStatusIdentifier = executeResponse.orderStatusIdentifier

        step.status = 'completed'
        step.transaction = transaction
        onStepUpdate?.(step)
      }
    } catch (error) {
      step.status = 'failed'
      step.error = error instanceof Error ? error.message : String(error)
      onStepUpdate?.(step)
      throw error
    }
  }

  private async pollSwapStatus(
    step: PrivateSwapStep,
    params: PrivateSwapFlowParams,
    onStepUpdate?: (step: PrivateSwapStep) => void
  ): Promise<void> {
    try {
      const orderStatusIdentifier = (step as any).orderStatusIdentifier
      if (!orderStatusIdentifier) {
        throw new Error('No order status identifier available')
      }

      const MAX_TRIES = 40
      for (let i = 0; i < MAX_TRIES; i++) {
        const status = await this.encifherClient.getOrderStatus(orderStatusIdentifier)

        if (status.status === 'completed') {
          step.status = 'completed'
          onStepUpdate?.(step)
          return
        }

        if (status.status === 'failed') {
          throw new Error(`Swap failed: ${status.details}`)
        }

        // Update progress
        step.description = `Monitoring private swap completion (${i + 1}/${MAX_TRIES})...`
        onStepUpdate?.(step)

        await new Promise(resolve => setTimeout(resolve, 3000))
      }

      throw new Error('Swap timed out')
    } catch (error) {
      step.status = 'failed'
      step.error = error instanceof Error ? error.message : String(error)
      onStepUpdate?.(step)
      throw error
    }
  }

  private async executeWithdrawal(
    step: PrivateSwapStep,
    params: PrivateSwapFlowParams,
    onStepUpdate?: (step: PrivateSwapStep) => void
  ): Promise<void> {
    try {
      // Get the estimated output amount from the completed swap
      const balances = await this.getHybridBalances([params.outputToken])
      const privateBalance = balances[params.outputToken.address]?.privateBalance || '0'

      if (parseFloat(privateBalance) <= 0) {
        step.status = 'completed'
        step.description = 'No private balance to withdraw'
        onStepUpdate?.(step)
        return
      }

      const tokenInfo: EncifherTokenInfo = {
        tokenMintAddress: params.outputToken.address,
        decimals: params.outputToken.decimals,
        isConfidentialSupported: true
      }

      const { transaction } = await this.encifherClient.privateWithdraw({
        token: tokenInfo,
        amount: privateBalance,
        userPublicKey: params.userPublicKey
      })

      // Sign and send transaction
      if (this.userKeypair) {
        transaction.partialSign(this.userKeypair)

        const signature = await this.connection.sendRawTransaction(
          transaction.serialize(),
          {
            preflightCommitment: 'confirmed'
          }
        )

        await this.connection.confirmTransaction(signature, 'confirmed')

        step.status = 'completed'
        step.transaction = transaction
        onStepUpdate?.(step)
      }
    } catch (error) {
      step.status = 'failed'
      step.error = error instanceof Error ? error.message : String(error)
      onStepUpdate?.(step)
      throw error
    }
  }

  private calculateTotalTime(steps: PrivateSwapStep[]): string {
    // Simple estimation - could be enhanced with better calculations
    const totalSeconds = steps.reduce((total, step) => {
      const timeRange = step.estimatedTime?.match(/(\d+)-(\d+)/)
      if (timeRange) {
        return total + parseInt(timeRange[2] || '0') // Take the upper bound
      }
      const singleTime = step.estimatedTime?.match(/(\d+)/)
      if (singleTime) {
        return total + parseInt(singleTime[1] || '0')
      }
      return total + 60 // Default 1 minute
    }, 0)

    const minutes = Math.ceil(totalSeconds / 60)
    return `~${minutes} minute${minutes > 1 ? 's' : ''}`
  }

  private convertToBaseUnits(amount: string, decimals: number): string {
    const amountNum = parseFloat(amount)
    if (isNaN(amountNum)) return '0'
    return (amountNum * Math.pow(10, decimals)).toString()
  }

  private convertFromBaseUnits(amount: string, decimals: number): string {
    const amountNum = parseFloat(amount)
    if (isNaN(amountNum)) return '0'
    return (amountNum / Math.pow(10, decimals)).toString()
  }
}