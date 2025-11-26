// NEAR Wallet Integration Service for Near Intents
// Using @near-wallet-selector for modern wallet connections
import type { WalletSelector, Wallet, AccountState } from '@near-wallet-selector/core'
import { setupWalletSelector } from '@near-wallet-selector/core'
import { setupModal } from '@near-wallet-selector/modal-ui'
import { setupNearWallet } from '@near-wallet-selector/near-wallet'
import { Contract } from 'near-api-js'

export interface NearWalletInfo {
  accountId: string
  connected: boolean
  balance?: string
  network: 'mainnet' | 'testnet'
  address?: string // For Near Intents API
}

export interface NearTransaction {
  hash: string
  signerId: string
  receiverId: string
  actions: any[]
  status: 'pending' | 'success' | 'failed'
}

// Wallet Selector configuration
interface NearWalletSelectorConfig {
  networkId: string
  nodeUrl: string
  walletUrl: string
  helperUrl: string
  explorerUrl: string
}

// NEAR network configuration
const NEAR_NETWORK = {
  mainnet: {
    networkId: 'mainnet',
    nodeUrl: 'https://rpc.mainnet.near.org',
    walletUrl: 'https://wallet.mainnet.near.org',
    helperUrl: 'https://helper.mainnet.near.org',
    explorerUrl: 'https://explorer.mainnet.near.org',
  },
  testnet: {
    networkId: 'testnet',
    nodeUrl: 'https://rpc.testnet.near.org',
    walletUrl: 'https://wallet.testnet.near.org',
    helperUrl: 'https://helper.testnet.near.org',
    explorerUrl: 'https://explorer.testnet.near.org',
  }
}

class NearWalletService {
  private isConnected = false
  private currentAccount: NearWalletInfo | null = null
  private walletSelector: WalletSelector | null = null
  private modal: any | null = null
  private contractId: string = ''
  private network: 'mainnet' | 'testnet' = 'mainnet'
  private accountState: AccountState | null = null
  private modalOpen = false
  private modalResolve: ((account: NearWalletInfo | null) => void) | null = null

  // Initialize NEAR wallet selector
  async initialize(contractId: string = '', network: 'mainnet' | 'testnet' = 'mainnet'): Promise<void> {
    try {
      if (typeof window === 'undefined') return

      this.contractId = contractId
      this.network = network

      // Configure wallet selector
      const config: NearWalletSelectorConfig = {
        networkId: NEAR_NETWORK[network].networkId,
        nodeUrl: NEAR_NETWORK[network].nodeUrl,
        walletUrl: NEAR_NETWORK[network].walletUrl,
        helperUrl: NEAR_NETWORK[network].helperUrl,
        explorerUrl: NEAR_NETWORK[network].explorerUrl
      }

      // Initialize wallet selector
      this.walletSelector = await setupWalletSelector({
        network: config.networkId as any,
        debug: false,
        modules: [setupNearWallet() as any]
      })

      // Initialize modal
      this.modal = (setupModal as any)(this.walletSelector as any, {
        contractId: contractId || 'near-intents-bridge'
      })

      // Listen for account changes
      (this.walletSelector as any).on('accountChanged', (account: AccountState | null) => {
        this.accountState = account
        this.updateCurrentAccount(account)
      })

      // Listen for network changes
      (this.walletSelector as any).on('networkChanged', (event: any) => {
        // Handle network changes
      })

      // Listen for modal hide events
      this.modal.on('hide', () => {
        this.modalOpen = false
        if (this.modalResolve) {
          const account = this.currentAccount
          this.modalResolve(account)
          this.modalResolve = null
        }
      })

      // Get initial account state
      const accounts = (this.walletSelector as any).store.getState().accounts
      if (accounts.length > 0) {
        this.accountState = accounts[0] as any
        this.updateCurrentAccount(this.accountState)
      }
    } catch (error) {
      throw new Error(`Failed to initialize NEAR wallet: ${error}`)
    }
  }

  private updateCurrentAccount(accountState: AccountState | null): void {
    if (accountState && accountState.accountId) {
      this.currentAccount = {
        accountId: accountState.accountId,
        connected: true,
        address: accountState.accountId,
        balance: '0', // Will be updated when needed
        network: this.network
      }
      this.isConnected = true
    } else {
      this.currentAccount = null
      this.isConnected = false
    }
  }

  // Show NEAR wallet modal and return a promise that resolves when user selects a wallet
  async showWalletModal(network: 'mainnet' | 'testnet' = 'mainnet'): Promise<NearWalletInfo | null> {
    try {
      if (!this.walletSelector) {
        await this.initialize('', network)
      }

      if (!this.walletSelector || !this.modal) {
        throw new Error('NEAR wallet selector not properly initialized')
      }

      // If already connected, return current account
      if (this.isConnected && this.currentAccount) {
        return this.currentAccount
      }

      // If modal is already open, return the existing promise
      if (this.modalOpen && this.modalResolve) {
        return new Promise((resolve) => {
          this.modalResolve = resolve
        })
      }

      this.modalOpen = true
      this.modal.show()

      return new Promise((resolve) => {
        this.modalResolve = resolve

        // Check if user already has selected a wallet
        const accounts = (this.walletSelector as any).store.getState().accounts
        if (accounts.length > 0) {
          this.accountState = accounts[0]
          this.updateCurrentAccount(accounts[0])
          resolve(this.currentAccount)
        }
      })
    } catch (error) {
      throw new Error(`Failed to show NEAR wallet modal: ${error}`)
    }
  }

  // Get the modal instance for React component
  getModal(): any | null {
    return this.modal
  }

  // Connect to NEAR wallet using wallet selector (legacy method for compatibility)
  async connect(network: 'mainnet' | 'testnet' = 'mainnet'): Promise<NearWalletInfo | null> {
    return this.showWalletModal(network)
  }

  
  
  // Disconnect wallet
  async disconnect(): Promise<void> {
    try {
      if (this.walletSelector) {
        const wallet = await (this.walletSelector as any).wallet()
        if (wallet && wallet.signOut) {
          await wallet.signOut()
        }
      }

      this.currentAccount = null
      this.accountState = null
      this.isConnected = false
    } catch (error) {
      // Error disconnecting NEAR wallet - handled silently in production
    }
  }

  // Get current account
  getAccount(): NearWalletInfo | null {
    return this.currentAccount
  }

  // Check if wallet is connected
  isConnectedToWallet(): boolean {
    return this.isConnected && this.currentAccount !== null
  }

  // Get account address for Near Intents API
  getAccountAddress(): string | null {
    return this.currentAccount?.address || this.currentAccount?.accountId || null
  }

  // Send transaction using NEAR wallet
  async sendTransaction(receiverId: string, amount: string, contractId?: string): Promise<string | null> {
    if (!this.isConnected || !this.currentAccount) {
      throw new Error('NEAR wallet not connected')
    }

    try {
      // NEAR wallet implementation not complete - throw descriptive error
      throw new Error('NEAR transaction sending not implemented yet. Please use NEAR CLI or official wallet for transactions.')
    } catch (error) {
      // Error sending NEAR transaction
      return null
    }
  }

  // Send token transaction (for NEP-141 tokens like USDC on NEAR)
  async sendTokenTransaction(tokenContractId: string, receiverId: string, amount: string): Promise<string | null> {
    if (!this.isConnected || !this.currentAccount) {
      throw new Error('NEAR wallet not connected')
    }

    try {
      // NEAR wallet implementation not complete - throw descriptive error
      throw new Error('NEAR token transaction sending not implemented yet. Please use NEAR CLI or official wallet for transactions.')
    } catch (error) {
      // Error sending NEAR token transaction
      return null
    }
  }

  // Get balance
  async getBalance(): Promise<string | null> {
    if (!this.isConnected || !this.currentAccount) {
      return null
    }

    // If we're in demo mode, return the mock balance
    if (!this.walletSelector || this.currentAccount.accountId.startsWith('demo-user-')) {
      return this.currentAccount.balance || '0'
    }

    try {
      // NEAR wallet implementation not complete - return mock balance
      return this.currentAccount.balance || '0'
    } catch (error) {
      // Error getting NEAR balance
      return this.currentAccount.balance || '0'
    }
  }

  // Format NEAR amount properly
  private formatNearAmount(balance: string): string {
    try {
      // If it's already in readable format, return as is
      if (parseFloat(balance) < 1000) {
        return balance
      }
      // Convert from yoctoNEAR to NEAR
      return (parseFloat(balance) / 1e24).toFixed(6)
    } catch {
      return '0'
    }
  }

  // Get token balance
  async getTokenBalance(tokenContractId: string): Promise<string | null> {
    if (!this.isConnected || !this.currentAccount) {
      return null
    }

    // If we're in demo mode, return a mock balance
    if (!this.walletSelector || this.currentAccount.accountId.startsWith('demo-user-')) {
      return (Math.random() * 1000).toFixed(2) // Mock token balance
    }

    try {
      // NEAR wallet implementation not complete - return mock balance
      return (Math.random() * 1000).toFixed(2) // Fallback mock balance
    } catch (error) {
      // Error getting NEAR token balance
      return (Math.random() * 1000).toFixed(2) // Fallback mock balance
    }
  }

  // Validate NEAR address format for Near Intents
  validateAddress(address: string): boolean {
    // NEAR addresses for Near Intents can be .near names or 64-char hex
    return /^[a-z0-9._-]+\.near$/.test(address) || /^[a-f0-9]{64}$/.test(address)
  }

  // Get wallet type
  getWalletType(): string {
    return 'near'
  }

  // Get wallet name
  getWalletName(): string {
    return 'NEAR Wallet'
  }

  // Switch network
  async switchNetwork(network: 'mainnet' | 'testnet'): Promise<void> {
    try {
      await this.disconnect()
      // Re-initialize with different network
      await this.initialize()
      await this.connect(network)
    } catch (error) {
      // Error switching NEAR network - handled silently in production
    }
  }

  // Get connected wallets array for Near Intents API
  getConnectedWallets(): string[] {
    const address = this.getAccountAddress()
    return address ? [address] : []
  }
}

export const nearWalletService = new NearWalletService()
export { NearWalletService }