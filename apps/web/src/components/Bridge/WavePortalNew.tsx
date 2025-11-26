'use client'

import React, { useState, useEffect } from 'react'
import { ArrowsUpDownIcon } from '@heroicons/react/24/outline'
import { useWallet } from '@solana/wallet-adapter-react'
import { TokenSelectorNew } from '../SwapComponent/TokenSelectorNew'
import { useThemeConfig, createGlassStyles, createInputStyles } from '@/lib/theme'
import { useNearWallet } from '@/providers/NearWalletProvider'
import { useStarknetWallet } from '@/providers/StarknetWalletProvider'
import { StarknetWalletModal } from '@/providers/StarknetWalletProvider'
import { Token } from '@/types/token'
import { enhancedBridgeService } from '@/lib/services/enhancedBridgeService'
import { ComingSoon } from '@/components/ui/ComingSoon'

interface WavePortalProps {
  privacyMode: boolean
  comingSoon?: boolean
}

// Chain definitions
const SUPPORTED_CHAINS = [
  {
    id: 'zec',
    name: 'Zcash',
    fullName: 'Zcash Network',
    icon: '/static/icons/network/zcash.svg',
    color: '#F4B942',
    description: 'Privacy-focused cryptocurrency',
    chainId: 1
  },
  {
    id: 'solana',
    name: 'Solana',
    fullName: 'Solana Network',
    icon: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
    color: '#14F195',
    description: 'High-performance blockchain',
    chainId: 101
  },
  {
    id: 'starknet',
    name: 'StarkNet',
    fullName: 'StarkNet Network',
    icon: '/static/icons/network/starknet.svg',
    color: '#5F8BFF',
    description: 'Layer 2 scaling solution',
    chainId: 1
  }
]

// Bridge providers mapping
const BRIDGE_PROVIDERS = {
  'zec-solana': 'near-intents',
  'solana-zec': 'near-intents',
  'solana-starknet': 'starkgate',
  'starknet-solana': 'starkgate'
} as const

// Token mapping for different chains - convert to Token type
const CHAIN_TOKENS = {
  zec: [
    {
      address: 'zec',
      chainId: 1, // Zcash mainnet
      decimals: 8,
      name: 'Zcash',
      symbol: 'ZEC',
      logoURI: '/static/icons/network/zcash.svg',
      tags: [],
      isConfidentialSupported: true,
      isNative: true,
      addressable: true
    }
  ],
  solana: [
    {
      address: 'So11111111111111111111111111111111111111112',
      chainId: 101, // Solana mainnet
      decimals: 9,
      name: 'Solana',
      symbol: 'SOL',
      logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
      tags: [],
      isConfidentialSupported: true,
      isNative: true,
      addressable: true
    },
    {
      address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      chainId: 101,
      decimals: 6,
      name: 'USD Coin',
      symbol: 'USDC',
      logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
      tags: [],
      isConfidentialSupported: true,
      isNative: false,
      addressable: true
    },
    {
      address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
      chainId: 101,
      decimals: 6,
      name: 'USDT',
      symbol: 'USDT',
      logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png',
      tags: [],
      isConfidentialSupported: true,
      isNative: false,
      addressable: true
    },
    {
      address: 'So11111111111111111111111111111111111111112',
      chainId: 101,
      decimals: 9,
      name: 'Wrapped SOL',
      symbol: 'wSOL',
      logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
      tags: [],
      isConfidentialSupported: true,
      isNative: false,
      addressable: true
    },
    {
      address: 'wave',
      chainId: 101,
      decimals: 9,
      name: 'Wave Token',
      symbol: 'WAVE',
      logoURI: '/wave0.png',
      tags: [],
      isConfidentialSupported: true,
      isNative: false,
      addressable: true
    },
    {
      address: 'wealth',
      chainId: 101,
      decimals: 9,
      name: 'Wealth Token',
      symbol: 'WEALTH',
      logoURI: '/wave0.png',
      tags: [],
      isConfidentialSupported: true,
      isNative: false,
      addressable: true
    }
  ],
  starknet: [
    {
      address: '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7',
      chainId: 1, // StarkNet mainnet
      decimals: 18,
      name: 'Ethereum',
      symbol: 'ETH',
      logoURI: '/static/icons/network/ethereum.svg',
      tags: [],
      isConfidentialSupported: true,
      isNative: true,
      addressable: true
    },
    {
      address: '0x053c9123bc8a2a8f2e6b47d0f9d3c4b1a2e3f4d5a6b7c8d9e0f1a2b3c4d5e6f',
      chainId: 1,
      decimals: 6,
      name: 'USD Coin',
      symbol: 'USDC',
      logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
      tags: [],
      isConfidentialSupported: true,
      isNative: false,
      addressable: true
    },
    {
      address: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
      chainId: 1,
      decimals: 18,
      name: 'StarkNet Token',
      symbol: 'STRK',
      logoURI: '/static/icons/network/starknet.svg',
      tags: [],
      isConfidentialSupported: true,
      isNative: true,
      addressable: true
    },
    {
      address: '0x07394cbe418daa16e42b87ba67372d4ab4a5df0b05c6e554d158458ce245bc10',
      chainId: 1,
      decimals: 18,
      name: 'wstETH',
      symbol: 'wstETH',
      logoURI: '/static/icons/network/ethereum.svg',
      tags: [],
      isConfidentialSupported: true,
      isNative: false,
      addressable: true
    },
    {
      address: '0x05a7f0a0a91e8eebf2ac5f4e1fcdac74d67a9d7a876a2b3e0b5e9e1f2a3d4e5f',
      chainId: 1,
      decimals: 6,
      name: 'USDT',
      symbol: 'USDT',
      logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png',
      tags: [],
      isConfidentialSupported: true,
      isNative: false,
      addressable: true
    }
  ]
}

export function WavePortal({ privacyMode, comingSoon = false }: WavePortalProps) {
  const { publicKey, connected: solanaConnected } = useWallet()
  const { isConnected: nearConnected, accountId, connect: connectNear, disconnect: disconnectNear } = useNearWallet()
  const { isConnected: starknetConnected, account: starknetAccount, connect: connectStarknet, disconnect: disconnectStarknet } = useStarknetWallet()
  const theme = useThemeConfig()

  // UI State
  const [fromChain, setFromChain] = useState<string>('zec')
  const [toChain, setToChain] = useState<string>('solana')
  const [fromToken, setFromToken] = useState<Token | undefined>(CHAIN_TOKENS.zec[0])
  const [toToken, setToToken] = useState<Token | undefined>(CHAIN_TOKENS.solana[0])
  const [amount, setAmount] = useState('')
  const [isBridging, setIsBridging] = useState(false)
  const [showStarknetWalletModal, setShowStarknetWalletModal] = useState(false)
  const [isReversed, setIsReversed] = useState(false)

  
  const getBridgeProvider = (from: string, to: string) => {
    const routeKey = `${from}-${to}` as keyof typeof BRIDGE_PROVIDERS
    return BRIDGE_PROVIDERS[routeKey] || 'near-intents'
  }

  const getChainName = (chainId: string) => {
    const chain = SUPPORTED_CHAINS.find(c => c.id === chainId)
    return chain ? chain.name : chainId.toUpperCase()
  }

  const getDynamicQuote = (toChainId: string) => {
    const quotes = {
      solana: "Bridge assets seamlessly to the Solana ecosystem.",
      near: "Cross into the NEAR protocol's user-centric world.",
      zec: "Transfer assets to the privacy-focused Zcash network.",
      starknet: "Enter the StarkNet layer 2 scaling solution.",
      ethereum: "Connect to the world's largest smart contract platform.",
      polygon: "Move assets to Polygon's fast and affordable network.",
      bsc: "Bridge to Binance Smart Chain's vibrant ecosystem.",
      arbitrum: "Access Arbitrum's layer 2 scaling and low fees.",
      optimism: "Transfer to Optimism's optimistic rollup solution.",
      avalanche: "Enter Avalanche's high-throughput blockchain.",
      base: "Connect to Coinbase's Layer 2 network.",
      aptos: "Move to Aptos's next-generation blockchain.",
      sui: "Bridge to Sui's object-oriented smart contract platform.",
      intents: "Leverage cross-chain intent protocols."
    }
    return quotes[toChainId as keyof typeof quotes] || "Bridge assets seamlessly across the most innovative networks."
  }

  const handleChainSelect = (chainType: 'from' | 'to', chainId: string) => {
    if (chainType === 'from') {
      // Prevent selecting the same chain as destination
      if (chainId === toChain) {
        // Swap chains
        setFromChain(toChain)
        setToChain(chainId)
        setIsReversed(!isReversed)
      } else {
        setFromChain(chainId)
      }
    } else {
      // Prevent selecting the same chain as source
      if (chainId === fromChain) {
        // Swap chains
        setToChain(fromChain)
        setFromChain(chainId)
        setIsReversed(!isReversed)
      } else {
        setToChain(chainId)
      }
    }

    // Update tokens after chain change
    const newFromChain = chainType === 'from' ? chainId : (chainId === fromChain ? toChain : fromChain)
    const newToChain = chainType === 'to' ? chainId : (chainId === toChain ? fromChain : toChain)

    const fromTokens = CHAIN_TOKENS[newFromChain as keyof typeof CHAIN_TOKENS]
    const toTokens = CHAIN_TOKENS[newToChain as keyof typeof CHAIN_TOKENS]

    setFromToken(fromTokens[0])
    setToToken(toTokens.find(t => t.symbol === 'USDC') || toTokens[0])
    setAmount('')
  }

  // Auto-update tokens when chains change
  React.useEffect(() => {
    const fromTokens = CHAIN_TOKENS[fromChain as keyof typeof CHAIN_TOKENS]
    const toTokens = CHAIN_TOKENS[toChain as keyof typeof CHAIN_TOKENS]

    setFromToken(fromTokens[0])
    setToToken(toTokens.find(t => t.symbol === 'USDC') || toTokens[0])
  }, [fromChain, toChain])

  const getWalletConnectionStatus = () => {
    const sourceChain = fromChain

    switch (sourceChain) {
      case 'solana':
        return {
          connected: solanaConnected,
          address: publicKey?.toString(),
          label: 'Solana Wallet'
        }
      case 'zec':
        return {
          connected: nearConnected,
          address: accountId,
          label: 'NEAR Wallet (for Zcash)'
        }
      case 'starknet':
        return {
          connected: starknetConnected,
          address: starknetAccount?.address,
          label: 'StarkNet Wallet'
        }
      default:
        return {
          connected: false,
          address: null,
          label: 'Wallet'
        }
    }
  }

  const handleWalletConnect = async () => {
    const walletStatus = getWalletConnectionStatus()

    if (walletStatus.connected) {
      // Disconnect wallet
      switch (fromChain) {
        case 'zec':
          await disconnectNear()
          break
        case 'starknet':
          await disconnectStarknet()
          break
        case 'solana':
          // Solana disconnect is handled by wallet adapter
          alert('Please use the Solana wallet button in the header to disconnect')
          break
      }
      return
    }

    switch (fromChain) {
      case 'solana':
        // Solana wallet is handled by Solana wallet adapter in header
        alert('Please use the Solana wallet connect button in the header')
        break
      case 'zec':
        // NEAR wallet for Zcash
        try {
          await connectNear()
        } catch (error) {
          console.error('NEAR wallet connection failed:', error)
          alert('Failed to connect NEAR wallet. Please try again.')
        }
        break
      case 'starknet':
        // Show StarkNet wallet modal
        setShowStarknetWalletModal(true)
        break
    }
  }

const handleBridge = async () => {
    const walletStatus = getWalletConnectionStatus()
    const bridgeProvider = getBridgeProvider(fromChain, toChain)

    if (!walletStatus.connected) {
      alert(`Please connect your ${walletStatus.label}`)
      return
    }

    if (!amount || parseFloat(amount) <= 0) {
      alert('Please enter a valid amount')
      return
    }

    if (!fromToken || !toToken) {
      alert('Please select valid tokens')
      return
    }

    setIsBridging(true)

    try {
      const amountInSmallestUnits = parseFloat(amount) * Math.pow(10, fromToken.decimals)

      // Generate quote first
      const quote = await enhancedBridgeService.generateQuote(
        {
          symbol: fromToken.symbol,
          name: fromToken.name,
          address: fromToken.address,
          decimals: fromToken.decimals,
          chain: fromChain,
          logoURI: fromToken.logoURI,
          bridgeSupport: {
            nearIntents: bridgeProvider === 'near-intents',
            starkgate: bridgeProvider === 'starkgate',
            defuse: true,
            directBridge: false
          }
        },
        {
          symbol: toToken.symbol,
          name: toToken.name,
          address: toToken.address,
          decimals: toToken.decimals,
          chain: toChain,
          logoURI: toToken.logoURI,
          bridgeSupport: {
            nearIntents: bridgeProvider === 'near-intents',
            starkgate: bridgeProvider === 'starkgate',
            defuse: true,
            directBridge: false
          }
        },
        amountInSmallestUnits.toString(),
        {
          slippageBps: 50, // 0.5%
          recipientAddress: walletStatus.address || '',
          deadline: 20 * 60 // 20 minutes
        }
      )

      console.log('Bridge quote generated:', quote)

      // Execute the bridge
      const result = await enhancedBridgeService.executeBridge(quote, {
        recipientAddress: walletStatus.address || '',
        privacyMode: privacyMode
      })

      console.log('Bridge execution result:', result)
      alert(`Bridge initiated successfully! ${amount} ${fromToken.symbol} → ${toChain}`)
      setAmount('')

    } catch (error) {
      console.error('Bridge failed:', error)
      alert(`Bridge failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsBridging(false)
    }
  }

  const getAvailableFromTokens = () => {
    return CHAIN_TOKENS[fromChain as keyof typeof CHAIN_TOKENS]
  }

  const getAvailableToTokens = () => {
    return CHAIN_TOKENS[toChain as keyof typeof CHAIN_TOKENS]
  }

  const walletStatus = getWalletConnectionStatus()
  const bridgeProvider = getBridgeProvider(fromChain, toChain)

  // Show Coming Soon if enabled
  if (comingSoon) {
    return (
      <div className="w-full max-w-xl mx-auto">
        <ComingSoon
          message="Coming Soon"
          description="Seamlessly transfer assets across Solana, NEAR, StarkNet, and more. Experience lightning-fast bridging with military-grade security."
          icon={
            <svg
              className="w-10 h-10"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
              />
            </svg>
          }
          compact={false}
        />
      </div>
    )
  }

  return (
    <div className="w-full max-w-xl mx-auto">
      {/* Dynamic Quote Section */}
      <div className="mb-8 text-center">
        <div className="relative z-10">
            <p className="text-center text-sm italic" style={{ color: theme.colors.textMuted }}>
              {getDynamicQuote(toChain)}
            </p>
          </div>
      </div>

      {/* Enhanced Chain Selector */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          {/* From Chain */}
          <div className="flex-1">
            <label className="block text-sm font-medium mb-2" style={{ color: theme.colors.textSecondary }}>
              From
            </label>
            <div className="grid grid-cols-3 gap-2">
              {SUPPORTED_CHAINS.map((chain) => {
                const isDisabled = chain.id === toChain
                return (
                <button
                  key={chain.id}
                  onClick={() => !isDisabled && handleChainSelect('from', chain.id)}
                  disabled={isDisabled}
                  className={`p-3 rounded-xl border-2 transition-all hover:scale-[1.02] ${
                    fromChain === chain.id
                      ? 'ring-2 ring-blue-500/20 shadow-lg'
                      : isDisabled
                      ? 'opacity-40 cursor-not-allowed'
                      : 'hover:border-opacity-60'
                  }`}
                  style={{
                    backgroundColor: fromChain === chain.id
                      ? `${chain.color}15`
                      : isDisabled
                      ? `${theme.colors.surface}30`
                      : `${theme.colors.surface}60`,
                    borderColor: fromChain === chain.id
                      ? chain.color
                      : isDisabled
                      ? `${theme.colors.border}50`
                      : theme.colors.border,
                    borderWidth: '2px',
                    position: 'relative',
                    overflow: 'hidden',
                    cursor: isDisabled ? 'not-allowed' : 'pointer'
                  }}
                >
                  {fromChain === chain.id && (
                    <div
                      className="absolute inset-0 opacity-10"
                      style={{
                        background: `linear-gradient(135deg, ${chain.color} 0%, transparent 70%)`
                      }}
                    />
                  )}
                  <div className="relative z-10 flex flex-col items-center gap-2">
                    <div
                      className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center overflow-hidden"
                      style={{
                        backgroundColor: fromChain === chain.id ? `${chain.color}20` : 'rgba(255, 255, 255, 0.05)'
                      }}
                    >
                      <img
                        src={chain.icon}
                        alt={chain.name}
                        className="w-8 h-8 rounded-full"
                        style={{
                          filter: fromChain === chain.id ? 'brightness(1.2)' : 'brightness(0.7)',
                          transition: 'filter 0.2s'
                        }}
                        onError={(e) => {
                          e.currentTarget.src = '/icons/default-token.svg'
                        }}
                      />
                    </div>
                    <div className="text-center">
                      <div
                        className="font-semibold text-sm"
                        style={{
                          color: fromChain === chain.id
                            ? theme.colors.primary
                            : theme.colors.textPrimary
                        }}
                      >
                        {chain.name}
                      </div>
                    </div>
                  </div>
                </button>
                )
              })}
            </div>
          </div>

          {/* Arrow Button */}
          <div className="flex items-center justify-center mx-4">
            <button
              onClick={() => handleChainSelect('from', toChain)}
              className="p-3 rounded-full transition-all hover:scale-110 active:scale-95"
              style={{
                ...createGlassStyles(theme),
                backgroundColor: theme.colors.surface,
                border: `1px solid ${theme.colors.border}`,
                cursor: 'pointer'
              }}
            >
              <ArrowsUpDownIcon
                className={`w-5 h-5 transition-transform ${isReversed ? 'rotate-180' : ''}`}
                style={{ color: theme.colors.primary }}
              />
            </button>
          </div>

          {/* To Chain */}
          <div className="flex-1">
            <label className="block text-sm font-medium mb-2 text-right" style={{ color: theme.colors.textSecondary }}>
              To
            </label>
            <div className="grid grid-cols-3 gap-2">
              {SUPPORTED_CHAINS.map((chain) => {
                const isDisabled = chain.id === fromChain
                return (
                <button
                  key={chain.id}
                  onClick={() => !isDisabled && handleChainSelect('to', chain.id)}
                  disabled={isDisabled}
                  className={`p-3 rounded-xl border-2 transition-all hover:scale-[1.02] ${
                    toChain === chain.id
                      ? 'ring-2 ring-blue-500/20 shadow-lg'
                      : isDisabled
                      ? 'opacity-40 cursor-not-allowed'
                      : 'hover:border-opacity-60'
                  }`}
                  style={{
                    backgroundColor: toChain === chain.id
                      ? `${chain.color}15`
                      : isDisabled
                      ? `${theme.colors.surface}30`
                      : `${theme.colors.surface}60`,
                    borderColor: toChain === chain.id
                      ? chain.color
                      : isDisabled
                      ? `${theme.colors.border}50`
                      : theme.colors.border,
                    borderWidth: '2px',
                    position: 'relative',
                    overflow: 'hidden',
                    cursor: isDisabled ? 'not-allowed' : 'pointer'
                  }}
                >
                  {toChain === chain.id && (
                    <div
                      className="absolute inset-0 opacity-10"
                      style={{
                        background: `linear-gradient(135deg, ${chain.color} 0%, transparent 70%)`
                      }}
                    />
                  )}
                  <div className="relative z-10 flex flex-col items-center gap-2">
                    <div
                      className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center overflow-hidden"
                      style={{
                        backgroundColor: toChain === chain.id ? `${chain.color}20` : 'rgba(255, 255, 255, 0.05)'
                      }}
                    >
                      <img
                        src={chain.icon}
                        alt={chain.name}
                        className="w-8 h-8 rounded-full"
                        style={{
                          filter: toChain === chain.id ? 'brightness(1.2)' : 'brightness(0.7)',
                          transition: 'filter 0.2s'
                        }}
                        onError={(e) => {
                          e.currentTarget.src = '/icons/default-token.svg'
                        }}
                      />
                    </div>
                    <div className="text-center">
                      <div
                        className="font-semibold text-sm"
                        style={{
                          color: toChain === chain.id
                            ? theme.colors.primary
                            : theme.colors.textPrimary
                        }}
                      >
                        {chain.name}
                      </div>
                    </div>
                  </div>
                </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Bridge Provider Info */}
        <div className="mt-4 text-center">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
            style={{
              backgroundColor: `${theme.colors.primary}10`,
              color: theme.colors.primary,
              border: `1px solid ${theme.colors.primary}30`
            }}
          >
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: theme.colors.primary }} />
            <span>
              Via {getChainName(toChain)}
            </span>
          </div>
        </div>

        {/* Wallet Connection Status */}
        {walletStatus.connected && walletStatus.address && (
          <div className="mt-4 text-center">
            <div
              className="inline-flex items-center gap-3 px-4 py-2.5 rounded-full text-sm"
              style={{
                ...createGlassStyles(theme),
                backgroundColor: `${theme.colors.success}10`,
                color: theme.colors.success,
                border: `1px solid ${theme.colors.success}30`
              }}
            >
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: theme.colors.success }} />
                <span className="font-medium">
                  {walletStatus.label}
                </span>
              </div>
              <div className="h-4 w-px" style={{ backgroundColor: `${theme.colors.success}30` }} />
              <span className="font-mono text-xs">
                {walletStatus.address.slice(0, 8)}...{walletStatus.address.slice(-6)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Bridge Interface - matches swap UI exactly */}
      <div
        className="relative rounded-2xl overflow-hidden"
        style={{
          ...createGlassStyles(theme),
          backgroundColor: theme.colors.surface,
          border: `1px solid ${theme.colors.border}`
        }}
      >
        {/* From Token */}
        <div className="p-6 pb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium" style={{ color: theme.colors.textSecondary }}>
              From
            </span>
            {walletStatus.connected && walletStatus.address ? (
              <div className="text-right">
                <div className="text-xs font-medium" style={{ color: theme.colors.textPrimary }}>
                  {walletStatus.label?.split(' ')[0]}
                </div>
                <div
                  className="text-xs font-mono mt-1 px-2 py-1 rounded-full inline-block"
                  style={{
                    backgroundColor: `${theme.colors.primary}15`,
                    color: theme.colors.primary,
                    border: `1px solid ${theme.colors.primary}30`
                  }}
                >
                  {walletStatus.address.slice(0, 6)}...{walletStatus.address.slice(-4)}
                </div>
              </div>
            ) : (
              <span className="text-xs" style={{ color: theme.colors.textMuted }}>
                Not Connected
              </span>
            )}
          </div>

          <div className="space-y-4">
            <TokenSelectorNew
              selectedToken={fromToken || null}
              onTokenChange={setFromToken}
              tokens={getAvailableFromTokens()}
              privacyMode={privacyMode}
            />

            <div
              className="relative rounded-xl p-4"
              style={{
                ...createGlassStyles(theme),
                backgroundColor: theme.colors.background,
                border: `1px solid ${theme.colors.border}`
              }}
            >
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-transparent border-none outline-none text-2xl font-bold"
                style={{
                  ...createInputStyles(theme),
                  height: '3rem',
                  fontSize: '1.75rem',
                  fontWeight: 600,
                  padding: '0.75rem 1rem',
                  fontFamily: 'var(--font-mono), var(--font-jetbrains), monospace',
                  color: theme.colors.textPrimary
                }}
              />
              {fromToken && (
                <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-sm" style={{ color: theme.colors.textMuted }}>
                  {fromToken.symbol}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Arrow Divider */}
        <div className="relative h-6 flex items-center justify-center px-6">
          <div className="absolute left-6 right-6 h-px" style={{ backgroundColor: theme.colors.border }} />
          <button
            onClick={() => {
              // Swap chains
              setFromChain(toChain)
              setToChain(fromChain)
              setIsReversed(!isReversed)
            }}
            className="relative z-10 p-2 rounded-full transition-all hover:scale-110"
            style={{
              backgroundColor: theme.colors.surface,
              border: `1px solid ${theme.colors.border}`
            }}
          >
            <ArrowsUpDownIcon className="w-4 h-4" style={{ color: theme.colors.primary }} />
          </button>
        </div>

        {/* To Token */}
        <div className="p-6 pt-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium" style={{ color: theme.colors.textSecondary }}>
              To
            </span>
            <span className="text-xs" style={{ color: theme.colors.textMuted }}>
              {getChainName(toChain)}
            </span>
          </div>

          <TokenSelectorNew
            selectedToken={toToken || null}
            onTokenChange={setToToken}
            tokens={getAvailableToTokens()}
            privacyMode={privacyMode}
          />
        </div>

        {/* Wallet Status & Bridge Button */}
        <div className="p-6 pt-0">
          {!walletStatus.connected && (
            <div
              className="p-3 rounded-lg mb-4 text-sm"
              style={{
                backgroundColor: `${theme.colors.warning}10`,
                border: `1px solid ${theme.colors.warning}20`
              }}
            >
              <span style={{ color: theme.colors.warning }}>
                Connect your {walletStatus.label} to continue
              </span>
            </div>
          )}

          <button
            onClick={!walletStatus.connected ? handleWalletConnect : handleBridge}
            disabled={isBridging}
            className="w-full relative font-medium py-4 px-6 rounded-2xl transition-all transform hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 overflow-hidden"
            style={{
              ...createGlassStyles(theme),
              background: walletStatus.connected && amount && parseFloat(amount) > 0
                ? 'var(--wave-azul)'
                : `${theme.colors.surface}60`,
              border: `1px solid ${
                walletStatus.connected && amount && parseFloat(amount) > 0
                  ? theme.colors.primary
                  : theme.colors.border
              }`
            }}
          >
            {isBridging ? (
              <div className="flex items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white"></div>
                <span style={{ color: theme.colors.textPrimary }}>
                  Bridging...
                </span>
              </div>
            ) : !walletStatus.connected ? (
              <div className="text-left">
                <span style={{ color: theme.colors.textPrimary }}>
                  Connect {walletStatus.label}
                </span>
                <span className="text-xs block mt-1 opacity-80" style={{ color: theme.colors.textMuted }}>
                  Required to bridge assets
                </span>
              </div>
            ) : !amount || parseFloat(amount) <= 0 ? (
              <span style={{ color: theme.colors.textMuted }}>
                Enter Amount
              </span>
            ) : (
              <div className="text-left">
                <span style={{ color: theme.colors.textPrimary }}>
                  Send to {getChainName(toChain)}
                </span>
                {walletStatus.address && (
                  <span className="text-xs block mt-1 font-mono opacity-80" style={{ color: theme.colors.textMuted }}>
                    {walletStatus.address.slice(0, 10)}...{walletStatus.address.slice(-6)}
                  </span>
                )}
              </div>
            )}
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="mt-4 text-center">
        <p className="text-xs" style={{ color: theme.colors.textMuted }}>
          {bridgeProvider === 'starkgate'
            ? 'Powered by StarkGate - Official StarkNet Bridge'
            : 'Powered by NEAR Intents - Private Cross-chain Bridge'
          }
        </p>
      </div>

      {/* StarkNet Wallet Modal */}
      <StarknetWalletModal
        isOpen={showStarknetWalletModal}
        onClose={() => setShowStarknetWalletModal(false)}
        onSuccess={() => setShowStarknetWalletModal(false)}
      />
    </div>
  )
}