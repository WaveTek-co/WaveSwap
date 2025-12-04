// Enhanced Bridge Service with Defuse SDK Integration
// Combines Near Intents, Starkgate, and cross-chain asset identification

import { IntentsSDK, createIntentSignerNearKeyPair } from '@defuse-protocol/intents-sdk'
import { Connection, PublicKey, Transaction } from '@solana/web3.js'
import { nearIntentBridge, type BridgeQuote } from '../nearIntentBridge'
import { JupiterTokenService } from '../jupiterTokens'

// Define AssetId type locally since it's not exported from the package
type AssetId = string

// Simple implementation of parseAssetId if needed
function parseAssetId(assetId: string): AssetId {
  return assetId
}

// Enhanced token types
export interface CrossChainToken {
  // Basic token info
  symbol: string
  name: string
  address: string
  decimals: number
  chain: string
  logoURI: string

  // Cross-chain asset ID
  assetId?: string
  unifiedAssetId?: string

  // Bridge support
  bridgeSupport: {
    nearIntents: boolean
    starkgate: boolean
    defuse: boolean
    directBridge: boolean
  }

  // Metadata
  price?: number
  priceChange24h?: number
  volume24h?: number
  liquidity?: number
  tags?: string[]

  // Privacy features
  privacySupported?: boolean
  privacyProviders?: ('encifher' | 'arcium' | 'defuse')[]
}

export interface EnhancedBridgeQuote {
  // Basic quote info
  id: string
  fromToken: CrossChainToken
  toToken: CrossChainToken
  fromAmount: string
  toAmount: string
  rate: string

  // Bridge type
  bridgeProvider: 'nearIntents' | 'starkgate' | 'defuse' | 'direct'
  route?: string

  // Fees and timing
  feeAmount?: string
  feePercentage?: number
  estimatedTime: string
  slippageTolerance: number

  // Transaction details
  depositAddress?: string
  depositChain: string
  destinationAddress?: string
  destinationChain: string

  // Privacy features
  privacySupported?: boolean
  privacyFee?: string

  // Status
  status: 'pending' | 'processing' | 'completed' | 'failed'
  expiresAt?: string
}

export interface BridgeExecution {
  quote: EnhancedBridgeQuote
  status: 'INITIALIZING' | 'VALIDATING' | 'DEPOSITING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
  currentStep: number
  totalSteps: number
  steps: string[]
  error?: string
  depositTransaction?: string
  completionTransaction?: string
  estimatedCompletion?: string
}

export interface BridgeOptions {
  slippageBps?: number
  deadline?: number
  recipientAddress?: string
  refundAddress?: string
  privacyMode?: boolean
  maxRetries?: number
}

export class EnhancedBridgeService {
  private intentsSDK: IntentsSDK | null = null
  private connection: Connection
  private nearIntentClient = nearIntentBridge

  constructor(config: {
    solanaRpc?: string
    nearRpc?: string
    jwtToken?: string
    referralCode?: string
  }) {
    // Initialize Solana connection
    this.connection = new Connection(
      config.solanaRpc || process.env.NEXT_PUBLIC_SOLANA_RPC || 'https://api.mainnet-beta.solana.com'
    )

    // Initialize Intents SDK if JWT is provided
    if (config.jwtToken) {
      try {
        this.intentsSDK = new IntentsSDK({
          referral: config.referralCode || 'waveswap',
          // Note: Intent signer would need to be configured based on user's connected wallet
        })
      } catch (error) {
        console.warn('Failed to initialize Intents SDK:', error)
      }
    }
  }

  /**
   * Get comprehensive token list with cross-chain support
   */
  async getSupportedTokens(): Promise<CrossChainToken[]> {
    try {
      // Get tokens from multiple sources
      const [nearIntentTokens, defuseTokens] = await Promise.all([
        this.getNearIntentTokens(),
        this.getDefuseTokens()
      ])

      // Merge and enhance tokens
      const mergedTokens = this.mergeTokenLists(nearIntentTokens, defuseTokens)

      // Add cross-chain asset IDs
      return this.addCrossChainAssetIds(mergedTokens)
    } catch (error) {
      console.error('Failed to fetch supported tokens:', error)
      throw new Error('Failed to load supported tokens')
    }
  }

  /**
   * Get tokens from Near Intents API
   */
  private async getNearIntentTokens(): Promise<CrossChainToken[]> {
    try {
      const tokens = await this.nearIntentClient.getSupportedTokens()
      return tokens.map(token => ({
        symbol: token.symbol,
        name: token.name,
        address: token.address,
        decimals: token.decimals,
        chain: token.chain,
        logoURI: token.logoURI || '',
        bridgeSupport: {
          nearIntents: true,
          starkgate: false,
          defuse: false,
          directBridge: false
        }
      }))
    } catch (error) {
      console.warn('Failed to fetch Near Intents tokens:', error)
      return []
    }
  }

  /**
   * Get tokens from Defuse ecosystem
   */
  private async getDefuseTokens(): Promise<CrossChainToken[]> {
    try {
      if (!this.intentsSDK) {
        return []
      }

      // Get supported assets from Defuse
      const assets = await this.getDefuseAssets()

      return assets.map(asset => ({
        symbol: asset.symbol,
        name: asset.name,
        address: asset.address,
        decimals: asset.decimals,
        chain: asset.chain,
        logoURI: asset.logoURI || '',
        bridgeSupport: {
          nearIntents: false,
          starkgate: false,
          defuse: true,
          directBridge: true
        }
      }))
    } catch (error) {
      console.warn('Failed to fetch Defuse tokens:', error)
      return []
    }
  }

  /**
   * Get assets from Defuse ecosystem
   */
  private async getDefuseAssets(): Promise<any[]> {
    // This would integrate with Defuse API to get supported assets
    // For now, return commonly supported assets with dynamic icon loading from Jupiter API
    try {
      // Get token icons from Jupiter API
      const jupiterTokens = await JupiterTokenService.searchTokens('USDC')
      const usdcToken = jupiterTokens.find(t => t.id === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
      const usdtTokens = await JupiterTokenService.searchTokens('USDT')
      const usdtToken = usdtTokens.find(t => t.id === 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB')

      return [
        {
          symbol: 'USDC',
          name: 'USD Coin',
          address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          decimals: 6,
          chain: 'solana',
          logoURI: usdcToken?.icon || ''
        },
        {
          symbol: 'USDT',
          name: 'Tether USD',
          address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
          decimals: 6,
          chain: 'solana',
          logoURI: usdtToken?.icon || ''
        }
      ]
    } catch (error) {
      console.warn('Failed to fetch token icons from Jupiter API:', error)
      // Fallback without icons
      return [
        {
          symbol: 'USDC',
          name: 'USD Coin',
          address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          decimals: 6,
          chain: 'solana',
          logoURI: ''
        },
        {
          symbol: 'USDT',
          name: 'Tether USD',
          address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
          decimals: 6,
          chain: 'solana',
          logoURI: ''
        }
      ]
    }
  }

  /**
   * Merge token lists from different sources
   */
  private mergeTokenLists(
    nearIntentTokens: CrossChainToken[],
    defuseTokens: CrossChainToken[]
  ): CrossChainToken[] {
    const tokenMap = new Map<string, CrossChainToken>()

    // Add Near Intent tokens
    nearIntentTokens.forEach(token => {
      const key = `${token.chain}:${token.address}`
      tokenMap.set(key, { ...token })
    })

    // Merge Defuse tokens
    defuseTokens.forEach(defuseToken => {
      const key = `${defuseToken.chain}:${defuseToken.address}`
      const existing = tokenMap.get(key)

      if (existing) {
        // Merge bridge support
        existing.bridgeSupport = {
          nearIntents: existing.bridgeSupport.nearIntents || defuseToken.bridgeSupport.defuse,
          starkgate: existing.bridgeSupport.starkgate || defuseToken.bridgeSupport.defuse,
          defuse: existing.bridgeSupport.defuse || defuseToken.bridgeSupport.defuse,
          directBridge: existing.bridgeSupport.directBridge || defuseToken.bridgeSupport.directBridge
        }
      } else {
        tokenMap.set(key, defuseToken)
      }
    })

    return Array.from(tokenMap.values())
  }

  /**
   * Add cross-chain asset IDs using 1cs_v1 format
   */
  private addCrossChainAssetIds(tokens: CrossChainToken[]): CrossChainToken[] {
    return tokens.map(token => {
      let assetId: string | undefined

      try {
        // Create cross-chain asset ID based on chain and address
        switch (token.chain.toLowerCase()) {
          case 'solana':
            // 1cs_v1:solana:spl:<address>
            assetId = `1cs_v1:solana:spl:${token.address}`
            break
          case 'near':
            // 1cs_v1:near:nep141:<contract>
            assetId = `1cs_v1:near:nep141:${token.address}`
            break
          case 'ethereum':
            // 1cs_v1:eth:erc20:<address>
            assetId = `1cs_v1:eth:erc20:${token.address}`
            break
          case 'polygon':
            // 1cs_v1:polygon:erc20:<address>
            assetId = `1cs_v1:polygon:erc20:${token.address}`
            break
          default:
            // Use generic format for other chains
            assetId = `1cs_v1:${token.chain}:token:${token.address}`
        }
      } catch (error) {
        console.warn(`Failed to create asset ID for ${token.symbol}:`, error)
      }

      return {
        ...token,
        assetId,
        unifiedAssetId: assetId
      }
    })
  }

  /**
   * Generate comprehensive bridge quote
   */
  async generateQuote(
    fromToken: CrossChainToken,
    toToken: CrossChainToken,
    amount: string,
    options: BridgeOptions = {}
  ): Promise<EnhancedBridgeQuote> {
    const {
      slippageBps = 50, // 0.5% default
      deadline = 20 * 60, // 20 minutes default
      recipientAddress,
      refundAddress
    } = options

    // Determine best bridge provider
    const bridgeProvider = this.selectBridgeProvider(fromToken, toToken)

    let quote: EnhancedBridgeQuote

    switch (bridgeProvider) {
      case 'nearIntents':
        quote = await this.generateNearIntentsQuote(fromToken, toToken, amount, options)
        break
      case 'starkgate':
        quote = await this.generateStarkgateQuote(fromToken, toToken, amount, options)
        break
      case 'defuse':
        quote = await this.generateDefuseQuote(fromToken, toToken, amount, options)
        break
      default:
        throw new Error(`No bridge provider available for ${fromToken.chain} -> ${toToken.chain}`)
    }

    // Enhance quote with common metadata
    return {
      ...quote,
      slippageTolerance: slippageBps / 100,
      estimatedTime: this.getEstimatedTime(fromToken.chain, toToken.chain, bridgeProvider)
    }
  }

  /**
   * Select best bridge provider based on tokens and chains
   */
  private selectBridgeProvider(
    fromToken: CrossChainToken,
    toToken: CrossChainToken
  ): 'nearIntents' | 'starkgate' | 'defuse' | 'direct' {
    // Check for Starkgate (Solana <-> StarkNet)
    if ((fromToken.chain === 'solana' && toToken.chain === 'starknet') ||
        (fromToken.chain === 'starknet' && toToken.chain === 'solana')) {
      return 'starkgate'
    }

    // Check for Near Intents support
    if (fromToken.bridgeSupport.nearIntents && toToken.bridgeSupport.nearIntents) {
      return 'nearIntents'
    }

    // Check for Defuse support
    if (fromToken.bridgeSupport.defuse && toToken.bridgeSupport.defuse) {
      return 'defuse'
    }

    // Default to direct bridge
    return 'direct'
  }

  /**
   * Generate quote using Near Intents
   */
  private async generateNearIntentsQuote(
    fromToken: CrossChainToken,
    toToken: CrossChainToken,
    amount: string,
    options: BridgeOptions
  ): Promise<EnhancedBridgeQuote> {
    try {
      const nearIntentQuote = await this.nearIntentClient.getQuote({
        sourceChain: fromToken.chain as any,
        destinationChain: toToken.chain as any,
        tokenAddress: fromToken.address,
        destinationAddress: toToken.address,
        amount
      } as any)

      return {
        id: nearIntentQuote.id || `near-intents-${Date.now()}`,
        fromToken,
        toToken,
        fromAmount: amount,
        toAmount: (nearIntentQuote as any).outputAmount || '0',
        rate: (nearIntentQuote as any).rate || '0',
        bridgeProvider: 'nearIntents',
        feeAmount: (nearIntentQuote as any).fee || '0',
        feePercentage: 0.1, // 0.1% typical fee
        depositChain: fromToken.chain,
        destinationChain: toToken.chain,
        status: 'pending',
        privacySupported: false,
        estimatedTime: '4-8 minutes',
        slippageTolerance: 0.5,
        expiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString()
      }
    } catch (error) {
      throw new Error(`Near Intents quote failed: ${error}`)
    }
  }

  /**
   * Generate quote using Starkgate
   */
  private async generateStarkgateQuote(
    fromToken: CrossChainToken,
    toToken: CrossChainToken,
    amount: string,
    options: BridgeOptions
  ): Promise<EnhancedBridgeQuote> {
    // Starkgate integration would go here
    // For now, return a mock quote structure

    const mockRate = '0.95' // Mock exchange rate
    // Convert amount from smallest units to human-readable for fee calculation
    const humanReadableAmount = (parseFloat(amount) / Math.pow(10, fromToken.decimals)).toString()
    const estimatedFee = (parseFloat(humanReadableAmount) * 0.002).toString() // 0.2% fee

    return {
      id: `starkgate-${Date.now()}`,
      fromToken,
      toToken,
      fromAmount: amount,
      toAmount: (parseFloat(humanReadableAmount) * parseFloat(mockRate) - parseFloat(estimatedFee)).toString(),
      rate: mockRate,
      bridgeProvider: 'starkgate',
      route: 'solana->starknet',
      feeAmount: estimatedFee,
      feePercentage: 0.2,
      estimatedTime: '4-8 minutes',
      depositChain: fromToken.chain,
      destinationChain: toToken.chain,
      status: 'pending',
      privacySupported: false,
      slippageTolerance: 0.5,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
    }
  }

  /**
   * Generate quote using Defuse SDK
   */
  private async generateDefuseQuote(
    fromToken: CrossChainToken,
    toToken: CrossChainToken,
    amount: string,
    options: BridgeOptions
  ): Promise<EnhancedBridgeQuote> {
    if (!this.intentsSDK) {
      throw new Error('Defuse SDK not initialized')
    }

    try {
      // Use Defuse SDK for quote generation
      // This would integrate with Defuse's quote API

      // Convert amount from smallest units to human-readable for calculations
      const humanReadableAmount = (parseFloat(amount) / Math.pow(10, fromToken.decimals)).toString()

      return {
        id: `defuse-${Date.now()}`,
        fromToken,
        toToken,
        fromAmount: amount,
        toAmount: (parseFloat(humanReadableAmount) * 0.98).toString(), // Mock 2% slippage
        rate: '0.98',
        bridgeProvider: 'defuse',
        feeAmount: (parseFloat(humanReadableAmount) * 0.001).toString(), // 0.1% fee
        feePercentage: 0.1,
        estimatedTime: '3-5 minutes',
        depositChain: fromToken.chain,
        destinationChain: toToken.chain,
        status: 'pending',
        privacySupported: true,
        slippageTolerance: 2.0,
        privacyFee: (parseFloat(amount) * 0.0005).toString(), // 0.05% privacy fee
        expiresAt: new Date(Date.now() + 25 * 60 * 1000).toISOString()
      }
    } catch (error) {
      throw new Error(`Defuse quote failed: ${error}`)
    }
  }

  /**
   * Execute bridge transaction
   */
  async executeBridge(
    quote: EnhancedBridgeQuote,
    options: BridgeOptions & {
      signTransaction?: (tx: Transaction) => Promise<Transaction>
      wallet?: any
    }
  ): Promise<BridgeExecution> {
    const execution: BridgeExecution = {
      quote,
      status: 'INITIALIZING',
      currentStep: 0,
      totalSteps: this.calculateTotalSteps(quote),
      steps: [],
      error: undefined
    }

    try {
      // Step 1: Validate quote and parameters
      execution.steps.push('Validating bridge parameters')
      await this.validateQuote(quote)
      execution.currentStep++

      // Step 2: Execute deposit based on bridge provider
      switch (quote.bridgeProvider) {
        case 'nearIntents':
          await this.executeNearIntentsBridge(quote, execution, options)
          break
        case 'starkgate':
          await this.executeStarkgateBridge(quote, execution, options)
          break
        case 'defuse':
          await this.executeDefuseBridge(quote, execution, options)
          break
        default:
          throw new Error(`Unsupported bridge provider: ${quote.bridgeProvider}`)
      }

      execution.status = 'COMPLETED'
      return execution

    } catch (error) {
      execution.status = 'FAILED'
      execution.error = error instanceof Error ? error.message : 'Unknown error'
      throw error
    }
  }

  /**
   * Calculate total steps for bridge execution
   */
  private calculateTotalSteps(quote: EnhancedBridgeQuote): number {
    switch (quote.bridgeProvider) {
      case 'nearIntents':
        return 4 // Validate -> Deposit -> Submit -> Complete
      case 'starkgate':
        return 5 // Validate -> Lock -> Relay -> Execute -> Complete
      case 'defuse':
        return 4 // Validate -> Intent -> Execute -> Complete
      default:
        return 3
    }
  }

  /**
   * Validate quote before execution
   */
  private async validateQuote(quote: EnhancedBridgeQuote): Promise<void> {
    // Check if quote is expired
    if (quote.expiresAt && new Date(quote.expiresAt) < new Date()) {
      throw new Error('Quote has expired')
    }

    // Validate addresses
    if (!quote.fromToken.address || !quote.toToken.address) {
      throw new Error('Invalid token addresses in quote')
    }

    // Validate amounts
    if (!quote.fromAmount || parseFloat(quote.fromAmount) <= 0) {
      throw new Error('Invalid from amount')
    }
  }

  /**
   * Execute Near Intents bridge
   */
  private async executeNearIntentsBridge(
    quote: EnhancedBridgeQuote,
    execution: BridgeExecution,
    options: any
  ): Promise<void> {
    execution.steps.push('Executing Near Intents deposit')
    execution.currentStep++

    try {
      // Execute deposit based on source chain
      if (quote.depositChain === 'solana') {
        const depositTx = await this.executeSolanaDeposit(quote, options)
        execution.depositTransaction = depositTx
      }

      execution.currentStep++
      execution.steps.push('Submitting to Near Intents')

      // Submit deposit to Near Intents
      await (this.nearIntentClient as any).executeBridge({
        fromChain: quote.fromToken.chain as any,
        toChain: quote.toToken.chain as any,
        fromToken: quote.fromToken.address,
        toToken: quote.toToken.address,
        amount: quote.fromAmount,
        recipient: options.recipientAddress
      } as any)

      execution.currentStep++
      execution.steps.push('Monitoring bridge completion')

      // Monitor execution
      await this.monitorExecution(quote, execution)

    } catch (error) {
      throw new Error(`Near Intents execution failed: ${error}`)
    }
  }

  /**
   * Execute Starkgate bridge
   */
  private async executeStarkgateBridge(
    quote: EnhancedBridgeQuote,
    execution: BridgeExecution,
    options: any
  ): Promise<void> {
    execution.steps.push('Locking tokens on Solana via Starkgate')
    execution.currentStep++

    try {
      // Lock tokens on Solana
      const lockTx = await this.executeSolanaDeposit(quote, options)
      execution.depositTransaction = lockTx

      execution.currentStep++
      execution.steps.push('Relaying to StarkNet')

      // Relay to StarkNet (mock implementation)
      await this.relayToStarknet(lockTx, quote)

      execution.currentStep++
      execution.steps.push('Executing on StarkNet')

      // Execute on StarkNet (mock implementation)
      const starknetTx = await this.executeOnStarknet(quote)
      execution.completionTransaction = starknetTx

      execution.currentStep++
      execution.steps.push('Bridge completed')

    } catch (error) {
      throw new Error(`Starkgate execution failed: ${error}`)
    }
  }

  /**
   * Execute Defuse bridge
   */
  private async executeDefuseBridge(
    quote: EnhancedBridgeQuote,
    execution: BridgeExecution,
    options: any
  ): Promise<void> {
    if (!this.intentsSDK) {
      throw new Error('Defuse SDK not initialized')
    }

    execution.steps.push('Creating Defuse intent')
    execution.currentStep++

    try {
      // Create and execute intent using Defuse SDK
      const result = await this.intentsSDK.processWithdrawal({
        withdrawalParams: {
          assetId: quote.fromToken.assetId || `nep141:${quote.fromToken.address}`,
          amount: BigInt(parseFloat(quote.fromAmount) * Math.pow(10, quote.fromToken.decimals)),
          destinationAddress: options.recipientAddress || quote.destinationAddress || '',
          feeInclusive: false
        }
      })

      execution.depositTransaction = (result as any).intentId
      execution.currentStep++
      execution.steps.push('Intent submitted successfully')

      execution.currentStep++
      execution.steps.push('Monitoring intent execution')

      // Monitor intent execution
      await this.monitorDefuseExecution((result as any).intentId, execution)

    } catch (error) {
      throw new Error(`Defuse execution failed: ${error}`)
    }
  }

  /**
   * Execute Solana deposit transaction
   */
  private async executeSolanaDeposit(
    quote: EnhancedBridgeQuote,
    options: any
  ): Promise<string> {
    // This would create and execute the actual Solana transaction
    // For now, return a mock transaction signature
    return `solana-deposit-${Date.now()}`
  }

  /**
   * Relay transaction to StarkNet
   */
  private async relayToStarknet(solanaTx: string, quote: EnhancedBridgeQuote): Promise<string> {
    // Mock StarkNet relay implementation
    return `starknet-relay-${Date.now()}`
  }

  /**
   * Execute on StarkNet
   */
  private async executeOnStarknet(quote: EnhancedBridgeQuote): Promise<string> {
    // Mock StarkNet execution
    return `starknet-execution-${Date.now()}`
  }

  /**
   * Monitor bridge execution
   */
  private async monitorExecution(quote: EnhancedBridgeQuote, execution: BridgeExecution): Promise<void> {
    const maxAttempts = 40
    const pollingInterval = 3000

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Check execution status
        const status = await this.checkExecutionStatus(quote.id)

        if (status === 'completed') {
          execution.status = 'COMPLETED'
          return
        } else if (status === 'failed') {
          throw new Error('Bridge execution failed')
        }

        await new Promise(resolve => setTimeout(resolve, pollingInterval))
      } catch (error) {
        if (attempt === maxAttempts) {
          throw new Error('Bridge monitoring timeout')
        }
        await new Promise(resolve => setTimeout(resolve, pollingInterval))
      }
    }
  }

  /**
   * Monitor Defuse intent execution
   */
  private async monitorDefuseExecution(intentId: string, execution: BridgeExecution): Promise<void> {
    // Mock implementation - would integrate with Defuse SDK monitoring
    await new Promise(resolve => setTimeout(resolve, 5000))
    execution.status = 'COMPLETED'
  }

  /**
   * Check execution status
   */
  private async checkExecutionStatus(quoteId: string): Promise<string> {
    try {
      const status = await (this.nearIntentClient as any).getBridgeStatus(quoteId)
      return status.status || 'pending'
    } catch (error) {
      return 'pending'
    }
  }

  /**
   * Get estimated bridge time
   */
  private getEstimatedTime(fromChain: string, toChain: string, provider: string): string {
    switch (provider) {
      case 'nearIntents':
        return '3-6 minutes'
      case 'starkgate':
        return '4-8 minutes'
      case 'defuse':
        return '3-5 minutes'
      default:
        return '5-12 minutes'
    }
  }

  /**
   * Get bridge status
   */
  async getBridgeStatus(quoteId: string): Promise<any> {
    try {
      return await (this.nearIntentClient as any).getBridgeStatus(quoteId)
    } catch (error) {
      return { status: 'unknown', error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  /**
   * Validate address format for specific chain
   */
  validateAddress(address: string, chain: string): boolean {
    try {
      switch (chain.toLowerCase()) {
        case 'solana':
          // Validate Solana address
          new PublicKey(address)
          return true
        case 'near':
          // Validate NEAR address
          return address.endsWith('.near') || address.endsWith('.testnet')
        case 'ethereum':
          // Validate Ethereum address
          return /^0x[a-fA-F0-9]{40}$/.test(address)
        case 'starknet':
          // Validate StarkNet address
          return /^0x[a-fA-F0-9]{63,64}$/.test(address)
        default:
          return true // Unknown format, assume valid
      }
    } catch {
      return false
    }
  }
}

// Export singleton instance
export const enhancedBridgeService = new EnhancedBridgeService({
  solanaRpc: process.env.NEXT_PUBLIC_SOLANA_RPC,
  nearRpc: process.env.NEXT_PUBLIC_NEAR_RPC,
  referralCode: 'waveswap'
})