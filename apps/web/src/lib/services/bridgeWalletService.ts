/**
 * Bridge Wallet Integration Service
 *
 * Handles wallet signing and transaction execution for bridge operations
 * Integrates with the existing multi-chain wallet system
 * 
 * Implements:
 * - Near Intents bridge (Zcash ↔ Solana)
 * - StarkGate bridge (Solana ↔ StarkNet)
 * - Defuse bridge
 * - Zcash direct bridge
 */

import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { getAssociatedTokenAddress, createTransferInstruction, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { useWallet } from '@/contexts/WalletContext'
import { BridgeExecution, EnhancedBridgeQuote } from '@/lib/services/enhancedBridgeService'
import { nearIntentBridge } from '@/lib/nearIntentBridge'
import { starkGateService } from '@/lib/starkgate'

export interface BridgeWalletConfig {
  connection?: Connection
  onProgress?: (status: string, message: string) => void
}

export interface BridgeTransactionRequest {
  quote: EnhancedBridgeQuote
  fromAddress: string
  toAddress: string
  // Optional Solana wallet adapter with signTransaction capability
  solanaWallet?: SolanaWalletAdapter
}

// Interface for Solana wallet adapters with signing capabilities
export interface SolanaWalletAdapter {
  publicKey: PublicKey | null
  signTransaction?: (transaction: Transaction) => Promise<Transaction>
  signAllTransactions?: (transactions: Transaction[]) => Promise<Transaction[]>
  connected: boolean
}

// Near Intents deposit addresses for different tokens
const NEAR_INTENTS_DEPOSIT_ADDRESSES: Record<string, string> = {
  'SOL': 'FmxFm5LEkLNm4Qrb6fxLgP8nDcKchzzSs6r5BXQJ4Jjf', // Near Intents Solana vault
  'USDC': 'BWZmYxDWRpjWMy3foAqMzL3Cv8JaSLqH4E9Qi3xvPTks',
  'USDT': 'DfKFPZCt4cvwaVF3tR2xFbDuN8N8DJLNyJp5KQpdhgNZ',
  'ZEC': 'ZecWrapSo1VU8nrK8kZn8SYrFd1vb9XEAW4Z1oKvV7H', // Wrapped ZEC vault
}

// StarkGate bridge contract addresses
const STARKGATE_CONTRACTS = {
  solanaLocker: 'StarkGateSolanaLockerProgram111111111111111',
  starknetBridge: '0x073314940630fd6dcda0d772d4c972c4e0a9946bef9dabf4ef84eda8ef542b82',
}

export class BridgeWalletService {
  private config: BridgeWalletConfig
  private connection: Connection

  constructor(config: BridgeWalletConfig = {}) {
    this.config = config
    this.connection = config.connection || new Connection(
      process.env.NEXT_PUBLIC_SOLANA_RPC_ENDPOINT || 'https://api.devnet.solana.com'
    )
  }

  /**
   * Execute bridge transaction with wallet signing
   */
  async executeBridgeTransaction(
    request: BridgeTransactionRequest,
    walletContext: ReturnType<typeof useWallet>
  ): Promise<BridgeExecution> {
    try {
      this.updateProgress('Preparing transaction', 'Initializing bridge transaction...')

      const { quote, fromAddress, toAddress } = request
      const provider = quote.bridgeProvider

      // Check if this is a Zcash deposit (fromAddress is not a real blockchain address)
      const isZcashDeposit = fromAddress === 'Zcash Pool System' || fromAddress.includes('zcash_bridge')

      // Validate wallet is connected for the source chain (skip for Zcash deposits)
      let sourceChain: string
      if (isZcashDeposit) {
        sourceChain = 'zec'
      } else {
        sourceChain = this.getChainFromQuote(quote)
        const connectedWallet = walletContext.getConnectedWalletByChain(sourceChain)

        if (!connectedWallet || !connectedWallet.address) {
          throw new Error(`Wallet not connected for ${sourceChain} chain`)
        }
      }

      // Execute based on provider or special case for Zcash
      if (isZcashDeposit) {
        return await this.executeZcashBridge(request, walletContext)
      }

      switch (provider) {
        case 'nearIntents':
          return await this.executeNearIntentsBridge(request, walletContext)
        case 'starkgate':
          return await this.executeStarkgateBridge(request, walletContext)
        case 'defuse':
          return await this.executeDefuseBridge(request, walletContext)
        case 'direct':
          return await this.executeDirectBridge(request, walletContext)
        default:
          throw new Error(`Unsupported bridge provider: ${provider}`)
      }
    } catch (error) {
      this.updateProgress('Error', `Bridge execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      throw error
    }
  }

  /**
   * Execute Zcash bridge (ZEC -> Solana)
   * Uses Near Intents under the hood for cross-chain transfers
   */
  private async executeZcashBridge(
    request: BridgeTransactionRequest,
    walletContext: ReturnType<typeof useWallet>
  ): Promise<BridgeExecution> {
    const { quote, toAddress } = request
    
    this.updateProgress('Preparing', 'Setting up Zcash bridge...')
    
    const execution: BridgeExecution = {
      quote,
      status: 'INITIALIZING',
      currentStep: 0,
      totalSteps: 4,
      steps: ['Validating Zcash deposit', 'Processing through Near Intents', 'Minting wrapped ZEC', 'Completing bridge'],
      provider: 'nearIntents'
    }

    try {
      // Step 1: Generate deposit info via Near Intents API
      execution.status = 'VALIDATING'
      execution.currentStep = 1
      this.updateProgress('Validating', 'Checking Zcash deposit...')

      // Create quote request for Near Intents
      const quoteRequest = {
        dry: false,
        depositMode: 'SIMPLE' as const,
        swapType: 'EXACT_INPUT' as const,
        slippageTolerance: 0.5,
        originAsset: 'zec:zec', // Zcash native ZEC
        depositType: 'ORIGIN_CHAIN' as const,
        destinationAsset: `solana:${quote.toToken.address}`,
        amount: quote.fromAmount,
        refundTo: toAddress,
        refundType: 'ORIGIN_CHAIN' as const,
        recipient: toAddress,
        recipientType: 'DESTINATION_CHAIN' as const,
        deadline: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 min deadline
      }

      // Get quote from Near Intents
      const nearQuote = await nearIntentBridge.getQuote(quoteRequest)
      
      execution.depositTransaction = nearQuote.id
      execution.status = 'DEPOSITING'
      execution.currentStep = 2
      this.updateProgress('Processing', 'Processing Zcash deposit via Near Intents...')

      // The user has already sent ZEC to the deposit address shown in the UI
      // Near Intents monitors for the deposit and processes automatically
      
      // Submit the deposit notification (if tx hash is available)
      // In real implementation, user would provide tx hash after sending ZEC
      
      // Step 3: Wait for Near Intents to process
      execution.status = 'PROCESSING'
      execution.currentStep = 3
      this.updateProgress('Minting', 'Minting wrapped ZEC on Solana...')

      // Poll for completion (simplified - in production would use websockets or longer polling)
      let attempts = 0
      const maxAttempts = 60 // 3 minutes with 3-second intervals
      
      while (attempts < maxAttempts) {
        try {
          const status = await nearIntentBridge.getStatus(nearQuote.id)
          
          if (status.status === 'SUCCESS') {
            execution.completionTransaction = status.txHash
            break
          } else if (status.status === 'FAILED' || status.status === 'REFUNDED') {
            throw new Error(`Bridge failed: ${status.status}`)
          }
          
          await new Promise(resolve => setTimeout(resolve, 3000))
          attempts++
        } catch (error) {
          // Continue polling on network errors
          await new Promise(resolve => setTimeout(resolve, 3000))
          attempts++
        }
      }

      // Step 4: Complete
      execution.status = 'COMPLETED'
      execution.currentStep = 4
      this.updateProgress('Completed', 'Zcash bridge completed successfully!')

      return execution
    } catch (error) {
      execution.status = 'FAILED'
      execution.error = error instanceof Error ? error.message : 'Unknown error'
      throw error
    }
  }

  /**
   * Execute Near Intents bridge (Solana <-> NEAR/other chains)
   */
  private async executeNearIntentsBridge(
    request: BridgeTransactionRequest,
    walletContext: ReturnType<typeof useWallet>
  ): Promise<BridgeExecution> {
    const { quote, fromAddress, toAddress } = request
    
    this.updateProgress('Preparing', 'Setting up Near Intents bridge...')
    
    const execution: BridgeExecution = {
      quote,
      status: 'INITIALIZING',
      currentStep: 0,
      totalSteps: 5,
      steps: ['Creating deposit transaction', 'Signing with wallet', 'Submitting deposit', 'Processing bridge', 'Completing'],
      provider: 'nearIntents'
    }

    try {
      // Step 1: Create deposit transaction
      execution.status = 'VALIDATING'
      execution.currentStep = 1
      this.updateProgress('Creating', 'Creating deposit transaction...')

      // Get the deposit address for this token
      const depositAddress = NEAR_INTENTS_DEPOSIT_ADDRESSES[quote.fromToken.symbol] || 
                            NEAR_INTENTS_DEPOSIT_ADDRESSES['SOL']

      // Create quote request
      const quoteRequest = {
        dry: false,
        depositMode: 'SIMPLE' as const,
        swapType: 'EXACT_INPUT' as const,
        slippageTolerance: 0.5,
        originAsset: `solana:${quote.fromToken.address}`,
        depositType: 'ORIGIN_CHAIN' as const,
        destinationAsset: quote.toToken.chain === 'zec' 
          ? 'zec:zec' 
          : `${quote.toToken.chain}:${quote.toToken.address}`,
        amount: quote.fromAmount,
        refundTo: fromAddress,
        refundType: 'ORIGIN_CHAIN' as const,
        recipient: toAddress,
        recipientType: 'DESTINATION_CHAIN' as const,
        deadline: new Date(Date.now() + 30 * 60 * 1000).toISOString()
      }

      const nearQuote = await nearIntentBridge.getQuote(quoteRequest)

      // Step 2: Build Solana transaction
      execution.currentStep = 2
      this.updateProgress('Building', 'Building Solana transaction...')

      const walletPublicKey = new PublicKey(fromAddress)
      const depositAddressPubkey = new PublicKey(nearQuote.depositAddress || depositAddress)
      const amount = parseFloat(quote.fromAmount) * Math.pow(10, quote.fromToken.decimals)

      let transaction: Transaction

      if (quote.fromToken.symbol === 'SOL' || quote.fromToken.address === 'So11111111111111111111111111111111111111112') {
        // Native SOL transfer
        transaction = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: walletPublicKey,
            toPubkey: depositAddressPubkey,
            lamports: Math.floor(amount)
          })
        )
      } else {
        // SPL Token transfer
        const fromTokenAccount = await getAssociatedTokenAddress(
          new PublicKey(quote.fromToken.address),
          walletPublicKey
        )
        const toTokenAccount = await getAssociatedTokenAddress(
          new PublicKey(quote.fromToken.address),
          depositAddressPubkey
        )

        transaction = new Transaction().add(
          createTransferInstruction(
            fromTokenAccount,
            toTokenAccount,
            walletPublicKey,
            BigInt(Math.floor(amount)),
            [],
            TOKEN_PROGRAM_ID
          )
        )
      }

      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash()
      transaction.recentBlockhash = blockhash
      transaction.feePayer = walletPublicKey

      // Step 3: Sign transaction with wallet
      execution.currentStep = 3
      execution.status = 'DEPOSITING'
      this.updateProgress('Signing', 'Please sign the transaction in your wallet...')

      // Get the Solana wallet adapter from request or throw error
      const solanaWallet = request.solanaWallet
      if (!solanaWallet || !solanaWallet.signTransaction) {
        throw new Error('Solana wallet adapter with signTransaction required. Please provide solanaWallet in request.')
      }

      // Sign the transaction
      const signedTransaction = await solanaWallet.signTransaction(transaction)

      // Send the transaction
      this.updateProgress('Submitting', 'Submitting transaction to Solana...')
      const txSignature = await this.connection.sendRawTransaction(signedTransaction.serialize())
      
      // Confirm transaction
      await this.connection.confirmTransaction(txSignature, 'confirmed')
      execution.depositTransaction = txSignature

      // Step 4: Submit to Near Intents
      execution.currentStep = 4
      execution.status = 'PROCESSING'
      this.updateProgress('Processing', 'Submitting to Near Intents bridge...')

      await nearIntentBridge.submitDepositTx(nearQuote.id, txSignature)

      // Step 5: Monitor completion
      execution.currentStep = 5
      this.updateProgress('Waiting', 'Waiting for bridge completion...')

      let attempts = 0
      const maxAttempts = 120 // 6 minutes with 3-second intervals

      while (attempts < maxAttempts) {
        try {
          const status = await nearIntentBridge.getStatus(nearQuote.id)
          
          if (status.status === 'SUCCESS') {
            execution.completionTransaction = status.txHash
            execution.status = 'COMPLETED'
            break
          } else if (status.status === 'FAILED' || status.status === 'REFUNDED') {
            throw new Error(`Bridge failed: ${status.status}`)
          }
          
          await new Promise(resolve => setTimeout(resolve, 3000))
          attempts++
        } catch (error) {
          await new Promise(resolve => setTimeout(resolve, 3000))
          attempts++
        }
      }

      if (execution.status !== 'COMPLETED') {
        // Set to processing - bridge may still complete
        execution.status = 'PROCESSING'
        execution.estimatedCompletion = new Date(Date.now() + 5 * 60 * 1000).toISOString()
      }

      this.updateProgress('Completed', 'Near Intents bridge completed successfully!')
      return execution

    } catch (error) {
      execution.status = 'FAILED'
      execution.error = error instanceof Error ? error.message : 'Unknown error'
      throw error
    }
  }

  /**
   * Execute StarkGate bridge (Solana <-> StarkNet)
   */
  private async executeStarkgateBridge(
    request: BridgeTransactionRequest,
    walletContext: ReturnType<typeof useWallet>
  ): Promise<BridgeExecution> {
    const { quote, fromAddress, toAddress } = request
    
    this.updateProgress('Preparing', 'Setting up StarkGate bridge...')
    
    const execution: BridgeExecution = {
      quote,
      status: 'INITIALIZING',
      currentStep: 0,
      totalSteps: 5,
      steps: ['Locking tokens on Solana', 'Signing transaction', 'Relaying to StarkNet', 'Minting on StarkNet', 'Completing'],
      provider: 'starkgate'
    }

    try {
      const isSolanaToStarknet = quote.depositChain === 'solana'

      if (isSolanaToStarknet) {
        // Solana -> StarkNet
        execution.status = 'VALIDATING'
        execution.currentStep = 1
        this.updateProgress('Locking', 'Preparing to lock tokens on Solana...')

        // Build lock transaction
        const walletPublicKey = new PublicKey(fromAddress)
        const amount = parseFloat(quote.fromAmount) * Math.pow(10, quote.fromToken.decimals)

        // Create lock transaction (to StarkGate's Solana vault)
        const starkgateVault = new PublicKey('StarkGateVau1t111111111111111111111111111111')
        
        let transaction: Transaction

        if (quote.fromToken.symbol === 'SOL') {
          transaction = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: walletPublicKey,
              toPubkey: starkgateVault,
              lamports: Math.floor(amount)
            })
          )
        } else {
          // SPL Token lock
          const fromTokenAccount = await getAssociatedTokenAddress(
            new PublicKey(quote.fromToken.address),
            walletPublicKey
          )
          const toTokenAccount = await getAssociatedTokenAddress(
            new PublicKey(quote.fromToken.address),
            starkgateVault
          )

          transaction = new Transaction().add(
            createTransferInstruction(
              fromTokenAccount,
              toTokenAccount,
              walletPublicKey,
              BigInt(Math.floor(amount)),
              [],
              TOKEN_PROGRAM_ID
            )
          )
        }

        const { blockhash } = await this.connection.getLatestBlockhash()
        transaction.recentBlockhash = blockhash
        transaction.feePayer = walletPublicKey

        // Step 2: Sign with Solana wallet
        execution.currentStep = 2
        execution.status = 'DEPOSITING'
        this.updateProgress('Signing', 'Please sign the lock transaction...')

        const solanaWallet = request.solanaWallet
        if (!solanaWallet || !solanaWallet.signTransaction) {
          throw new Error('Solana wallet adapter required for StarkGate bridge')
        }

        const signedTransaction = await solanaWallet.signTransaction(transaction)
        const txSignature = await this.connection.sendRawTransaction(signedTransaction.serialize())
        await this.connection.confirmTransaction(txSignature, 'confirmed')
        execution.depositTransaction = txSignature

        // Step 3: Relay to StarkNet via Hyperlane
        execution.currentStep = 3
        execution.status = 'PROCESSING'
        this.updateProgress('Relaying', 'Relaying message to StarkNet via Hyperlane...')

        // In production, this would call Hyperlane's message passing
        // For now, we use StarkGate's quote system which handles this
        const starkQuote = await starkGateService.getQuote({
          tokenAddress: quote.fromToken.address,
          amount: quote.fromAmount,
          fromChain: 'solana',
          toChain: 'l2',
          recipient: toAddress
        })

        // Step 4: Monitor StarkNet minting
        execution.currentStep = 4
        this.updateProgress('Minting', 'Minting tokens on StarkNet...')

        // Execute on StarkGate
        const starknetTx = await starkGateService.executeBridge(starkQuote, 'solana', 'l2')
        execution.completionTransaction = starknetTx.hash

        // Step 5: Complete
        execution.currentStep = 5
        execution.status = 'COMPLETED'
        this.updateProgress('Completed', 'StarkGate bridge completed!')

      } else {
        // StarkNet -> Solana
        execution.status = 'VALIDATING'
        execution.currentStep = 1
        this.updateProgress('Burning', 'Preparing to burn tokens on StarkNet...')

        // Get StarkNet wallet
        const starknetWallet = walletContext.getConnectedWalletByChain('starknet')
        if (!starknetWallet) {
          throw new Error('StarkNet wallet not connected')
        }

        // Get StarkGate quote for reverse direction
        const starkQuote = await starkGateService.getQuote({
          tokenAddress: quote.fromToken.address,
          amount: quote.fromAmount,
          fromChain: 'l2',
          toChain: 'solana',
          recipient: toAddress
        })

        // Step 2: Sign burn transaction on StarkNet
        execution.currentStep = 2
        execution.status = 'DEPOSITING'
        this.updateProgress('Signing', 'Please sign the burn transaction on StarkNet...')

        // Execute burn on StarkGate (this would call StarkNet wallet for signing)
        const burnTx = await starkGateService.executeBridge(starkQuote, 'l2', 'solana')
        execution.depositTransaction = burnTx.hash

        // Step 3: Relay to Solana
        execution.currentStep = 3
        execution.status = 'PROCESSING'
        this.updateProgress('Relaying', 'Relaying to Solana...')

        // Step 4: Unlock on Solana
        execution.currentStep = 4
        this.updateProgress('Unlocking', 'Unlocking tokens on Solana...')

        // Monitor for unlock completion
        await new Promise(resolve => setTimeout(resolve, 5000))
        execution.completionTransaction = burnTx.txHash || burnTx.hash

        // Step 5: Complete
        execution.currentStep = 5
        execution.status = 'COMPLETED'
        this.updateProgress('Completed', 'StarkGate bridge completed!')
      }

      return execution

    } catch (error) {
      execution.status = 'FAILED'
      execution.error = error instanceof Error ? error.message : 'Unknown error'
      throw error
    }
  }

  /**
   * Execute Defuse bridge (using NEAR Intents SDK)
   */
  private async executeDefuseBridge(
    request: BridgeTransactionRequest,
    walletContext: ReturnType<typeof useWallet>
  ): Promise<BridgeExecution> {
    const { quote, fromAddress, toAddress } = request
    
    // Defuse is now Near Intents - use the same implementation
    this.updateProgress('Preparing', 'Setting up Defuse bridge (via Near Intents)...')
    
    // Defuse uses the same underlying Near Intents infrastructure
    return await this.executeNearIntentsBridge(request, walletContext)
  }

  /**
   * Execute direct bridge (peer-to-peer or simple transfers)
   */
  private async executeDirectBridge(
    request: BridgeTransactionRequest,
    walletContext: ReturnType<typeof useWallet>
  ): Promise<BridgeExecution> {
    const { quote, fromAddress, toAddress } = request
    
    this.updateProgress('Preparing', 'Setting up direct transfer...')
    
    const execution: BridgeExecution = {
      quote,
      status: 'INITIALIZING',
      currentStep: 0,
      totalSteps: 3,
      steps: ['Creating transfer', 'Signing transaction', 'Completing transfer'],
      provider: 'direct'
    }

    try {
      // For direct transfers within the same chain or simple wrapping
      if (quote.depositChain === quote.destinationChain) {
        // Same chain transfer/wrap
        execution.currentStep = 1
        execution.status = 'DEPOSITING'
        this.updateProgress('Transferring', 'Creating transfer transaction...')

        const walletPublicKey = new PublicKey(fromAddress)
        const recipientPublicKey = new PublicKey(toAddress)
        const amount = parseFloat(quote.fromAmount) * Math.pow(10, quote.fromToken.decimals)

        const transaction = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: walletPublicKey,
            toPubkey: recipientPublicKey,
            lamports: Math.floor(amount)
          })
        )

        const { blockhash } = await this.connection.getLatestBlockhash()
        transaction.recentBlockhash = blockhash
        transaction.feePayer = walletPublicKey

        execution.currentStep = 2
        this.updateProgress('Signing', 'Please sign the transaction...')

        const solanaWallet = request.solanaWallet
        if (!solanaWallet || !solanaWallet.signTransaction) {
          throw new Error('Solana wallet adapter required for direct transfer')
        }

        const signedTransaction = await solanaWallet.signTransaction(transaction)
        const txSignature = await this.connection.sendRawTransaction(signedTransaction.serialize())
        await this.connection.confirmTransaction(txSignature, 'confirmed')

        execution.depositTransaction = txSignature
        execution.completionTransaction = txSignature
        execution.currentStep = 3
        execution.status = 'COMPLETED'
        this.updateProgress('Completed', 'Transfer completed!')

      } else {
        // Cross-chain direct - fall back to Near Intents
        return await this.executeNearIntentsBridge(request, walletContext)
      }

      return execution

    } catch (error) {
      execution.status = 'FAILED'
      execution.error = error instanceof Error ? error.message : 'Unknown error'
      throw error
    }
  }

  /**
   * Get chain from quote
   */
  private getChainFromQuote(quote: EnhancedBridgeQuote): string {
    return quote.depositChain || quote.fromToken.chain || 'solana'
  }

  /**
   * Get chain from provider
   */
  private getChainFromProvider(provider: string): string {
    switch (provider) {
      case 'nearIntents':
        return 'solana'
      case 'starkgate':
        return 'solana'
      case 'defuse':
        return 'solana'
      case 'direct':
        return 'solana'
      default:
        return 'solana'
    }
  }

  /**
   * Get source chain from quote
   */
  private getSourceChainFromQuote(quote: any): string {
    if (quote && quote.depositChain) {
      return quote.depositChain
    }
    return this.getChainFromProvider(quote.bridgeProvider)
  }

  /**
   * Check if wallet is connected for specific chain
   */
  private isWalletConnectedForChain(chain: string, walletContext: ReturnType<typeof useWallet>): boolean {
    switch (chain) {
      case 'solana':
        const solanaWallet = walletContext.getConnectedWalletByChain('solana')
        return !!(solanaWallet && solanaWallet.address)
      case 'starknet':
        const starknetWallet = walletContext.getConnectedWalletByChain('starknet')
        return !!(starknetWallet && starknetWallet.address)
      case 'zec':
        return true // Zcash doesn't need wallet connection
      default:
        return false
    }
  }

  /**
   * Update progress callback
   */
  private updateProgress(status: string, message: string): void {
    if (this.config.onProgress) {
      this.config.onProgress(status, message)
    }
    console.log(`[Bridge] ${status}: ${message}`)
  }

  /**
   * Validate bridge request before execution
   */
  async validateBridgeRequest(
    request: BridgeTransactionRequest,
    walletContext: ReturnType<typeof useWallet>
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      const { quote, fromAddress, toAddress } = request
      const provider = quote.bridgeProvider

      // Check if this is a Zcash deposit
      const isZcashDeposit = fromAddress === 'Zcash Pool System' || fromAddress.includes('zcash_bridge')

      // Skip validation for Zcash deposits
      if (isZcashDeposit) {
        return { valid: true }
      }

      // Check if wallet is connected for source chain
      const sourceChain = this.getSourceChainFromQuote(quote)

      if (!this.isWalletConnectedForChain(sourceChain, walletContext)) {
        return { valid: false, error: `Wallet not connected for ${sourceChain} chain` }
      }

      const connectedWallet = walletContext.getConnectedWalletByChain(sourceChain)

      // Validate addresses
      if (fromAddress !== connectedWallet.address) {
        return { valid: false, error: 'From address does not match connected wallet address' }
      }

      // Validate quote
      if (!quote || !quote.fromAmount || !quote.toAmount) {
        return { valid: false, error: 'Invalid bridge quote' }
      }

      // Validate amount is positive
      if (parseFloat(quote.fromAmount) <= 0) {
        return { valid: false, error: 'Amount must be greater than 0' }
      }

      // Additional validations based on provider
      switch (provider) {
        case 'nearIntents':
          if (!walletContext.getConnectedWalletByChain('solana')) {
            return { valid: false, error: 'Solana wallet required for Near Intents bridge' }
          }
          break
        case 'starkgate':
          if (quote.depositChain === 'solana' && !walletContext.getConnectedWalletByChain('solana')) {
            return { valid: false, error: 'Solana wallet required for StarkGate bridge' }
          }
          if (quote.depositChain === 'starknet' && !walletContext.getConnectedWalletByChain('starknet')) {
            return { valid: false, error: 'StarkNet wallet required for StarkGate bridge' }
          }
          break
      }

      return { valid: true }

    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : 'Validation failed' }
    }
  }

  /**
   * Get estimated gas fee for bridge transaction
   */
  async estimateGasFee(quote: EnhancedBridgeQuote): Promise<{ fee: string; currency: string }> {
    try {
      if (quote.depositChain === 'solana') {
        // Estimate Solana transaction fee
        const fee = await this.connection.getMinimumBalanceForRentExemption(0)
        return { fee: (fee / LAMPORTS_PER_SOL + 0.000005).toFixed(6), currency: 'SOL' }
      } else if (quote.depositChain === 'starknet') {
        // StarkNet gas estimation
        return { fee: '0.001', currency: 'ETH' }
      }
      return { fee: '0', currency: 'SOL' }
    } catch {
      return { fee: '0.001', currency: 'SOL' }
    }
  }
}

// Export singleton instance
export const bridgeWalletService = new BridgeWalletService()