/**
 * Bridge Wallet Integration Service
 *
 * Handles wallet signing and transaction execution for bridge operations
 * Integrates with the existing multi-chain wallet system
 */

import { Connection, PublicKey, Transaction, VersionedTransaction, sendAndConfirmTransaction } from '@solana/web3.js'
import { useWallet } from '@/contexts/WalletContext'
import { BridgeExecution, EnhancedBridgeQuote } from '@/lib/services/enhancedBridgeService'

export interface BridgeWalletConfig {
  connection?: Connection
  onProgress?: (status: string, message: string) => void
}

export interface BridgeTransactionRequest {
  quote: EnhancedBridgeQuote
  fromAddress: string
  toAddress: string
}

export class BridgeWalletService {
  private config: BridgeWalletConfig

  constructor(config: BridgeWalletConfig = {}) {
    this.config = config
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
        sourceChain = this.getChainFromProvider(provider)
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
   */
  private async executeZcashBridge(
    request: BridgeTransactionRequest,
    walletContext: ReturnType<typeof useWallet>
  ): Promise<BridgeExecution> {
    throw new Error('Zcash bridge integration coming soon!')
  }

  /**
   * Execute Near Intents bridge (Solana <-> NEAR)
   */
  private async executeNearIntentsBridge(
    request: BridgeTransactionRequest,
    walletContext: ReturnType<typeof useWallet>
  ): Promise<BridgeExecution> {
    throw new Error('Near Intents bridge integration coming soon!')
  }

  /**
   * Execute StarkGate bridge (Solana <-> StarkNet)
   */
  private async executeStarkgateBridge(
    request: BridgeTransactionRequest,
    walletContext: ReturnType<typeof useWallet>
  ): Promise<BridgeExecution> {
    throw new Error('StarkGate bridge integration coming soon!')
  }

  /**
   * Execute Defuse bridge
   */
  private async executeDefuseBridge(
    request: BridgeTransactionRequest,
    walletContext: ReturnType<typeof useWallet>
  ): Promise<BridgeExecution> {
    throw new Error('Defuse bridge integration coming soon!')
  }

  /**
   * Execute direct bridge (for supported direct transfers)
   */
  private async executeDirectBridge(
    request: BridgeTransactionRequest,
    walletContext: ReturnType<typeof useWallet>
  ): Promise<BridgeExecution> {
    throw new Error('Direct bridge integration coming soon!')
  }

  /**
   * Get chain from provider
   */
  private getChainFromProvider(provider: string): string {
    // Default mapping for providers to source chains
    switch (provider) {
      case 'nearIntents':
        return 'solana' // Near Intents typically starts from Solana
      case 'starkgate':
        return 'solana' // StarkGate typically starts from Solana
      case 'defuse':
        return 'solana' // Defuse typically starts from Solana
      case 'direct':
        return 'solana' // Default to Solana
      default:
        return 'solana'
    }
  }

  /**
   * Get source chain from quote
   */
  private getSourceChainFromQuote(quote: any): string {
    // Use the quote's deposit chain if available, otherwise fall back to provider mapping
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

      // Check if this is a Zcash deposit (fromAddress is not a real blockchain address)
      const isZcashDeposit = fromAddress === 'Zcash Pool System' || fromAddress.includes('zcash_bridge')

      // Skip validation for Zcash deposits since they use pool system
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

      // Additional validations based on provider
      switch (provider) {
        case 'nearIntents':
          if (!walletContext.getConnectedWalletByChain('solana')) {
            return { valid: false, error: 'Solana wallet required for Near Intents bridge' }
          }
          break
        case 'starkgate':
          if (!walletContext.getConnectedWalletByChain('solana')) {
            return { valid: false, error: 'Solana wallet required for StarkGate bridge' }
          }
          break
      }

      return { valid: true }

    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : 'Validation failed' }
    }
  }
}

// Export singleton instance
export const bridgeWalletService = new BridgeWalletService()