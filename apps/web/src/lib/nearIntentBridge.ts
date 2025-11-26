// Near Intent Bridge API Integration
export interface BridgeToken {
  symbol: string
  name: string
  chain: string
  address: string
  decimals: number
  logoURI?: string
}

export interface BridgeQuoteRequest {
  dry?: boolean
  depositMode: 'SIMPLE'
  swapType: 'EXACT_INPUT' | 'EXACT_OUTPUT'
  slippageTolerance: number
  originAsset: string
  depositType: 'ORIGIN_CHAIN'
  destinationAsset: string
  amount: string
  refundTo: string
  refundType: 'ORIGIN_CHAIN'
  recipient: string
  recipientType: 'DESTINATION_CHAIN'
  deadline: string
}

export interface BridgeQuote {
  id: string
  depositAddress: string
  depositMemo?: string
  depositChain: string
  depositAsset: {
    address: string
    decimals: number
    symbol: string
  }
  destinationAsset: {
    address: string
    decimals: number
    symbol: string
  }
  amount: {
    in: string
    out: string
    fee: string
  }
  fee: {
    bps: number
    amount: string
  }
  status: 'PENDING_DEPOSIT' | 'PROCESSING' | 'SUCCESS' | 'INCOMPLETE_DEPOSIT' | 'REFUNDED' | 'FAILED'
  expiresAt: string
  createdAt: string
}

export interface BridgeTransaction {
  id: string
  type: 'deposit' | 'withdrawal'
  status: 'PENDING_DEPOSIT' | 'PROCESSING' | 'SUCCESS' | 'INCOMPLETE_DEPOSIT' | 'REFUNDED' | 'FAILED'
  amount: string
  fee: string
  fromChain: string
  toChain: string
  fromToken: string
  toToken: string
  txHash?: string
  depositAddress?: string
  recipient?: string
  createdAt: string
  updatedAt: string
}

class NearIntentBridge {
  private baseUrl = 'https://1click.chaindefuser.com/v0'
  private jwt?: string

  constructor(jwt?: string) {
    this.jwt = jwt
  }

  private get headers(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (this.jwt) {
      headers['Authorization'] = `Bearer ${this.jwt}`
    }

    return headers
  }

  // Get supported tokens
  async getSupportedTokens(): Promise<BridgeToken[]> {
    try {
      const response = await fetch(`${this.baseUrl}/tokens`, {
        headers: this.headers,
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      return data.map((token: any) => ({
        symbol: token.symbol,
        name: token.name,
        chain: token.chain,
        address: token.address,
        decimals: token.decimals,
        logoURI: token.logoURI,
      }))
    } catch (error) {
      throw error
    }
  }

  // Get bridge quote
  async getQuote(request: BridgeQuoteRequest): Promise<BridgeQuote> {
    try {
      const response = await fetch(`${this.baseUrl}/quote`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(request),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      throw error
    }
  }

  // Submit deposit transaction
  async submitDepositTx(quoteId: string, txHash: string, txData?: any): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/deposit/submit`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          quoteId,
          txHash,
          txData,
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
    } catch (error) {
      throw error
    }
  }

  // Get transaction status
  async getStatus(quoteId: string): Promise<BridgeTransaction> {
    try {
      const response = await fetch(`${this.baseUrl}/status?quoteId=${quoteId}`, {
        headers: this.headers,
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      throw error
    }
  }

  // Calculate fees
  calculateFee(amount: string, feeBps: number, swapType: 'EXACT_INPUT' | 'EXACT_OUTPUT'): string {
    const amountNum = parseFloat(amount)

    if (swapType === 'EXACT_INPUT') {
      const netIn = amountNum * (1 - feeBps / 10000)
      return (amountNum - netIn).toString()
    } else {
      const netIn = amountNum * (1 + feeBps / 10000)
      return (netIn - amountNum).toString()
    }
  }

  // Validate address format for different chains
  validateAddress(address: string, chain: string): boolean {
    switch (chain.toLowerCase()) {
      case 'solana':
        // Solana addresses are 44 chars Base58
        return /^[1-9A-HJ-NP-Za-km-z]{44}$/.test(address)

      case 'near':
        // NEAR addresses can be .near names or 64-char hex
        return /^[a-z0-9._-]+\.near$/.test(address) || /^[a-f0-9]{64}$/.test(address)

      case 'zec':
        // Zcash transparent (t1, t3) or unified (u1) addresses
        return /^[tu][1-3A-HJ-NP-Za-km-z]{33,94}$/.test(address)

      case 'ethereum':
        // Ethereum addresses are 42 chars hex with 0x prefix
        return /^0x[a-fA-F0-9]{40}$/.test(address)

      case 'starknet':
        // StarkNet addresses are 0x-prefixed hex, typically 66 chars total
        return /^0x[a-fA-F0-9]{63,64}$/.test(address)

      default:
        return false
    }
  }
}

export const nearIntentBridge = new NearIntentBridge()
export { NearIntentBridge }

// Predefined supported chains and tokens for quick access
export const SUPPORTED_CHAINS = [
  {
    id: 'solana',
    name: 'Solana',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
    color: 'from-blue-500 to-blue-600',
    gradient: 'bg-gradient-to-r from-blue-500 to-blue-600',
    icon: '◎',
    addressFormat: '44-character Base58'
  },
  {
    id: 'near',
    name: 'NEAR',
    logoURI: 'https://near.org/wp-content/uploads/2021/03/near_icon.svg',
    color: 'from-green-500 to-emerald-600',
    gradient: 'bg-gradient-to-r from-green-500 to-emerald-600',
    icon: 'N',
    addressFormat: '.near name or 64-char hex'
  },
  {
    id: 'zec',
    name: 'Zcash',
    logoURI: 'https://z.cash/wp-content/uploads/2021/03/zcash-logo-fullcolor-512x512.png',
    color: 'from-orange-500 to-yellow-600',
    gradient: 'bg-gradient-to-r from-orange-500 to-yellow-600',
    icon: 'Z',
    addressFormat: 'Transparent (t1/t3) or Unified (u1)'
  },
  {
    id: 'starknet',
    name: 'StarkNet',
    logoURI: 'https://starknet.io/wp-content/uploads/2022/06/starknet-logo-dark.png',
    color: 'from-indigo-500 to-blue-600',
    gradient: 'bg-gradient-to-r from-indigo-500 to-blue-600',
    icon: 'S',
    addressFormat: '0x-prefixed hex address'
  },
] as const

// Common token mappings - will be enhanced with CoinGecko data
export const COMMON_TOKENS = {
  solana: [
    {
      symbol: 'SOL',
      name: 'Solana',
      address: 'So11111111111111111111111111111111111111112',
      decimals: 9,
      chain: 'solana',
      logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      decimals: 6,
      chain: 'solana',
      logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
    },
    {
      symbol: 'USDT',
      name: 'Tether USD',
      address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
      decimals: 6,
      chain: 'solana',
      logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png',
    },
    {
      symbol: 'RAY',
      name: 'Raydium',
      address: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
      decimals: 6,
      chain: 'solana',
      logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R/logo.png',
    },
    {
      symbol: 'SRM',
      name: 'Serum',
      address: 'SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt',
      decimals: 6,
      chain: 'solana',
      logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt/logo.png',
    },
    {
      symbol: 'BONK',
      name: 'Bonk',
      address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
      decimals: 5,
      chain: 'solana',
      logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263/logo.png',
    },
    {
      symbol: 'WIF',
      name: 'Dogwifhat',
      address: 'EKpQGSJtjMFqKv9K6aFdJrkNVC9YwEjHRgCTKJWv3Kbz',
      decimals: 6,
      chain: 'solana',
      logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EKpQGSJtjMFqKv9K6aFdJrkNVC9YwEjHRgCTKJWv3Kbz/logo.png',
    },
    {
      symbol: 'JUP',
      name: 'Jupiter',
      address: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
      decimals: 6,
      chain: 'solana',
      logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN/logo.png',
    },
    {
      symbol: 'WAVE',
      name: 'WaveSwap',
      address: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
      decimals: 9,
      chain: 'solana',
      logoURI: 'https://img-cdn.jup.ag/tokens/9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM.png',
    },
    {
      symbol: 'WEALTH',
      name: 'Wealth Token',
      address: 'WeaL1thsNAUSLjJgmqrjhmTkpgLiu6Q9tmvAFLc2W7Rt',
      decimals: 9,
      chain: 'solana',
      logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/WeaL1thsNAUSLjJgmqrjhmTkpgLiu6Q9tmvAFLc2W7Rt/logo.png',
    },
  ],
  near: [
    {
      symbol: 'NEAR',
      name: 'NEAR',
      address: 'wrap.near',
      decimals: 24,
      chain: 'near',
      logoURI: 'https://assets.coingecko.com/coins/images/10365/large/near_icon.png?1626853647',
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      address: 'usdc.omft.near',
      decimals: 6,
      chain: 'near',
      logoURI: 'https://assets.coingecko.com/coins/images/6319/large/USD_Coin_icon.png?1547042389',
    },
    {
      symbol: 'USDT',
      name: 'Tether USD',
      address: 'usdt.near',
      decimals: 6,
      chain: 'near',
      logoURI: 'https://assets.coingecko.com/coins/images/325/large/Tether-logo.png?1668148667',
    },
    {
      symbol: 'DAI',
      name: 'Dai Stablecoin',
      address: 'dai.near',
      decimals: 24,
      chain: 'near',
      logoURI: 'https://assets.coingecko.com/coins/images/9956/large/Multi-Collateral_DAI.png?1637213118',
    },
    {
      symbol: 'ETH',
      name: 'Ethereum',
      address: 'eth.near',
      decimals: 24,
      chain: 'near',
      logoURI: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png?1625306587',
    },
    {
      symbol: 'BNB',
      name: 'Binance Coin',
      address: 'bnb.near',
      decimals: 24,
      chain: 'near',
      logoURI: 'https://assets.coingecko.com/coins/images/279/large/398x399-multiplied-factorsrcset-x2.png?1625306587',
    },
  ],
  zec: [
    {
      symbol: 'ZEC',
      name: 'Zcash',
      address: 'zec',
      decimals: 8,
      chain: 'zec',
      logoURI: 'https://assets.coingecko.com/coins/images/32/large/zcash.png?1624840133',
    },
    {
      symbol: 'TAZ',
      name: 'Testnet Zcash',
      address: 'taz',
      decimals: 8,
      chain: 'zec',
      logoURI: 'https://assets.coingecko.com/coins/images/32/large/zcash.png?1624840133',
    },
  ],
  starknet: [
    {
      symbol: 'ETH',
      name: 'Ethereum',
      address: '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7', // ETH on StarkNet
      decimals: 18,
      chain: 'starknet',
      logoURI: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png?1625306587',
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      address: '0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8', // USDC on StarkNet
      decimals: 6,
      chain: 'starknet',
      logoURI: 'https://assets.coingecko.com/coins/images/6319/large/USD_Coin_icon.png?1547042389',
    },
    {
      symbol: 'USDT',
      name: 'Tether USD',
      address: '0x07865c6e87b9f70255377e024ace6630c1eaa37f7e9e2a71ca03e7bad0dd9b5f', // USDT on StarkNet
      decimals: 6,
      chain: 'starknet',
      logoURI: 'https://assets.coingecko.com/coins/images/325/large/Tether-logo.png?1668148667',
    },
    {
      symbol: 'DAI',
      name: 'Dai Stablecoin',
      address: '0x03e85bfbb8e2a4b8c4d56d0c9a8c6786a4a1f2bf5d0f9ccf7c68d0fc5f6c6a9c7', // DAI on StarkNet
      decimals: 18,
      chain: 'starknet',
      logoURI: 'https://assets.coingecko.com/coins/images/9956/large/Multi-Collateral_DAI.png?1637213118',
    },
    {
      symbol: 'WBTC',
      name: 'Wrapped Bitcoin',
      address: '0x03f8c5b5c3a1e7e5a5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5', // WBTC on StarkNet
      decimals: 8,
      chain: 'starknet',
      logoURI: 'https://assets.coingecko.com/coins/images/7598/large/wrapped-bitcoin.png?1626504016',
    },
    {
      symbol: 'wstETH',
      name: 'Wrapped stETH',
      address: '0x04fe4c241587e29c0474d37e85c674ee8af2524db8a697c01115777ab8cca4a7c', // wstETH on StarkNet
      decimals: 18,
      chain: 'starknet',
      logoURI: 'https://assets.coingecko.com/coins/images/23713/large/wstETH.png?1656546896',
    },
  ],
} as const

// Dynamic token data with CoinGecko integration
export type EnhancedToken = {
  symbol: string
  name: string
  address: string
  decimals: number
  chain: string
  logoURI: string
  price?: number
  priceChange24h?: number
}

// Wallet connection types for different chains
export const CHAIN_WALLETS = {
  solana: {
    name: 'Solana Wallet',
    icon: '◎',
    color: 'from-blue-500 to-blue-600',
    connectedText: 'Solana Wallet Connected',
    disconnectedText: 'Connect Solana Wallet'
  },
  near: {
    name: 'NEAR Wallet',
    icon: 'N',
    color: 'from-green-500 to-emerald-600',
    connectedText: 'NEAR Wallet Connected',
    disconnectedText: 'Connect NEAR Wallet'
  },
  zec: {
    name: 'Zcash Wallet',
    icon: 'Z',
    color: 'from-orange-500 to-yellow-600',
    connectedText: 'Zcash Wallet Connected',
    disconnectedText: 'Connect Zcash Wallet'
  },
  starknet: {
    name: 'StarkNet Wallet',
    icon: 'S',
    color: 'from-indigo-500 to-blue-600',
    connectedText: 'StarkNet Wallet Connected',
    disconnectedText: 'Connect StarkNet Wallet'
  }
} as const

export type ChainId = 'solana' | 'near' | 'zec' | 'starknet'