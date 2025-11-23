import { Connection, PublicKey, sendAndConfirmTransaction } from '@solana/web3.js'
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor'
import type { WalletAdapter as BaseWalletAdapter } from '@solana/wallet-adapter-base'

import {
  WaveSwapConfig,
  Network,
  QuoteRequest,
  QuoteResponse,
  SwapRequest,
  SwapResponse,
  SwapDetails,
  SwapStatus,
  SwapIntent,
  WaveSwapError as WaveSwapErrorType,
  WalletInfo,
  DEFAULT_CONFIG,
  JupiterQuoteRequest,
  JupiterSwapRequest,
  JupiterQuoteResponse,
} from '../types'
import { WaveSwapError } from '../errors/waveswap-error'
import { QuoteService } from '../services/quote'
import { SwapService } from '../services/swap'
import { ProgramService } from '../services/program'
import { WebSocketService } from '../services/websocket'
import { utils } from '../utils'

export class WaveSwap {
  private connection: Connection
  private config: Required<WaveSwapConfig>
  private program: Program<any> | null = null
  private anchorProvider: AnchorProvider | null = null

  // Services
  private quoteService: QuoteService
  private swapService: SwapService
  private programService: ProgramService
  private webSocketService: WebSocketService | null = null

  constructor(config: WaveSwapConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    } as Required<WaveSwapConfig>

    this.connection = new Connection(this.config.rpcEndpoint, {
      commitment: this.config.commitment,
    })

    // Initialize services
    this.quoteService = new QuoteService(this.config.apiEndpoint)
    this.swapService = new SwapService(this.config.apiEndpoint)
    this.programService = new ProgramService(this.connection, this.config.network)

    // Initialize WebSocket service if needed
    if (typeof window !== 'undefined') {
      this.webSocketService = new WebSocketService(this.config.apiEndpoint)
    }

    this.initializeProgram()
  }

  private async initializeProgram() {
    try {
      if (this.config.wallet) {
        this.anchorProvider = new AnchorProvider(
          this.connection,
          new WalletAdapterWrapper(this.config.wallet),
          {
            commitment: this.config.commitment,
            preflightCommitment: this.config.commitment,
          }
        )

        const programId = this.getProgramId()
        const idl = await this.programService.getIdl()

        this.program = (Program as any)(programId, idl, this.anchorProvider)
      }
    } catch (error) {
      console.warn('Failed to initialize WaveSwap program:', error)
    }
  }

  private getProgramId(): PublicKey {
    const programIds = {
      devnet: new PublicKey('SwapRegistry111111111111111111111111111'),
      testnet: new PublicKey('SwapRegistry111111111111111111111111111'),
      'mainnet-beta': new PublicKey('SwapRegistry111111111111111111111111111'),
    }

    return programIds[this.config.network]
  }

  /**
   * Get a quote for a potential swap
   */
  async getQuote(request: QuoteRequest): Promise<QuoteResponse> {
    const jupiterResponse = await this.quoteService.getQuote({
      ...request,
      inputMint: request.inputToken.toString(),
      outputMint: request.outputToken.toString(),
      amount: request.inputAmount,
      slippageBps: request.slippageBps,
    } as JupiterQuoteRequest) as JupiterQuoteResponse

    // Convert Jupiter response to our QuoteResponse format
    return {
      inputAmount: jupiterResponse.inputAmount,
      outputAmount: jupiterResponse.outputAmount,
      priceImpact: jupiterResponse.priceImpactPct || '0',
      fee: {
        baseBps: 0, // Calculate based on routes
        privacyBps: 0,
        totalBps: 0,
      },
      routes: jupiterResponse.routePlan.map((route, index) => ({
        id: index,
        name: route.swapInfo.ammKey,
        description: `Route ${index + 1}`,
        isActive: true,
        priority: index,
        minAmount: 0,
        maxAmount: Number.MAX_SAFE_INTEGER,
        supportedTokens: [],
      })),
      timestamp: Date.now(),
      validFor: 30000, // 30 seconds
    }
  }

  /**
   * Submit a swap request
   */
  async swap(request: SwapRequest): Promise<SwapIntent> {
    if (!this.config.wallet?.publicKey) {
      throw new WaveSwapError('Wallet not connected', 'WALLET_NOT_CONNECTED')
    }

    const swapRequest = {
      ...request,
      inputToken: request.inputToken.toString(),
      outputToken: request.outputToken.toString(),
      userAddress: this.config.wallet.publicKey.toString(),
    }

    const response = await this.swapService.submitSwap(swapRequest)

    return new SwapIntentImpl(
      response.intentId,
      this.swapService,
      this.webSocketService
    )
  }

  /**
   * Get swap details by intent ID
   */
  async getSwapDetails(intentId: string): Promise<SwapDetails | null> {
    return this.swapService.getSwapDetails(intentId)
  }

  /**
   * Get swap history for a user
   */
  async getSwapHistory(
    userAddress?: string,
    options?: {
      limit?: number
      offset?: number
      status?: SwapStatus
    }
  ) {
    const address = userAddress || this.config.wallet?.publicKey?.toString()

    if (!address) {
      throw new WaveSwapError('No user address provided', 'NO_USER_ADDRESS')
    }

    return this.swapService.getSwapHistory(address, options?.limit)
  }

  /**
   * Get supported tokens
   */
  async getSupportedTokens() {
    return this.programService.getSupportedTokens()
  }

  /**
   * Get available routes
   */
  async getAvailableRoutes() {
    return this.programService.getAvailableRoutes()
  }

  /**
   * Get wallet information
   */
  getWalletInfo(): WalletInfo {
    if (!this.config.wallet) {
      return {
        publicKey: new PublicKey(0),
        connected: false,
        connecting: false,
      }
    }

    return {
      publicKey: this.config.wallet.publicKey || new PublicKey(0),
      connected: this.config.wallet.connected || false,
      connecting: this.config.wallet.connecting || false,
    }
  }

  /**
   * Get the Solana connection
   */
  getConnection(): Connection {
    return this.connection
  }

  /**
   * Get the Anchor program instance
   */
  getProgram(): Program<any> | null {
    return this.program
  }

  /**
   * Get the current configuration
   */
  getConfig(): Required<WaveSwapConfig> {
    return this.config
  }

  /**
   * Update the wallet
   */
  setWallet(wallet: BaseWalletAdapter | null) {
    this.config.wallet = wallet || undefined as any
    if (wallet) {
      this.initializeProgram()
    }
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect() {
    if (this.webSocketService) {
      await this.webSocketService.disconnect()
    }
  }
}

// Internal implementation of SwapIntent
class SwapIntentImpl implements SwapIntent {
  private statusListeners = new Set<(status: SwapStatus, details?: SwapDetails) => void>()
  private lastStatus?: SwapStatus
  private lastDetails?: SwapDetails

  constructor(
    public readonly id: string,
    private swapService: SwapService,
    private webSocketService: WebSocketService | null
  ) {
    this.setupWebSocketListener()
    this.startPolling()
  }

  onStatusChange(callback: (status: SwapStatus, details?: SwapDetails) => void): () => void {
    this.statusListeners.add(callback)
    return () => this.statusListeners.delete(callback)
  }

  async wait(): Promise<SwapDetails> {
    return new Promise((resolve, reject) => {
      const checkStatus = async () => {
        try {
          const details = await this.getStatus()
          if (['completed', 'failed', 'cancelled'].includes(details.status)) {
            resolve(details)
          } else {
            setTimeout(checkStatus, 2000)
          }
        } catch (error) {
          reject(error)
        }
      }

      checkStatus()
    })
  }

  async cancel(): Promise<void> {
    await this.swapService.cancelSwap(this.id)
  }

  async getStatus(): Promise<SwapDetails> {
    const details = await this.swapService.getSwapDetails(this.id)
    if (!details) {
      throw new WaveSwapError('Swap not found', 'SWAP_NOT_FOUND')
    }

    if (details.status !== this.lastStatus) {
      this.lastStatus = details.status
      this.lastDetails = details
      this.notifyStatusChange(details.status, details)
    }

    return details
  }

  private setupWebSocketListener() {
    if (!this.webSocketService) return

    this.webSocketService.subscribe(`swap:${this.id}`, (data) => {
      const status = data.status as SwapStatus
      if (status !== this.lastStatus) {
        this.lastStatus = status
        this.lastDetails = data.details
        this.notifyStatusChange(status, data.details)
      }
    })
  }

  private startPolling() {
    const poll = async () => {
      try {
        await this.getStatus()
      } catch (error) {
        console.warn('Failed to poll swap status:', error)
      }
    }

    // Initial poll
    poll()

    // Set up interval polling as fallback
    const interval = setInterval(poll, 5000)

    // Clean up interval when swap is completed
    this.onStatusChange((status) => {
      if (['completed', 'failed', 'cancelled'].includes(status)) {
        clearInterval(interval)
      }
    })
  }

  private notifyStatusChange(status: SwapStatus, details?: SwapDetails) {
    this.statusListeners.forEach(callback => {
      try {
        callback(status, details)
      } catch (error) {
        console.error('Error in status change callback:', error)
      }
    })
  }
}

// Wallet adapter wrapper for Anchor
class WalletAdapterWrapper {
  private _adapter: BaseWalletAdapter
  public payer: any

  constructor(adapter: BaseWalletAdapter) {
    this._adapter = adapter
    this.payer = {
      publicKey: this._adapter.publicKey || new PublicKey('11111111111111111111111111111111'),
    }
  }

  async signTransaction(tx: any): Promise<any> {
    if (!('signTransaction' in this._adapter)) {
      throw new Error('Wallet does not support transaction signing')
    }
    // @ts-ignore - WalletAdapter has optional signTransaction
    return this._adapter.signTransaction!(tx)
  }

  async signAllTransactions(txs: any[]): Promise<any[]> {
    if (!('signAllTransactions' in this._adapter)) {
      throw new Error('Wallet does not support batch transaction signing')
    }
    // @ts-ignore - WalletAdapter has optional signAllTransactions
    return this._adapter.signAllTransactions!(txs)
  }

  get publicKey(): PublicKey {
    return this._adapter.publicKey || new PublicKey('11111111111111111111111111111111')
  }

  get connected(): boolean {
    return this._adapter.connected || false
  }
}

export { WaveSwap as default }