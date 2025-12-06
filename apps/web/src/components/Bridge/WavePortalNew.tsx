'use client'

import React, { useState, useMemo } from 'react'
import { useWallet } from '@/hooks/useWalletAdapter'
import { BridgeTokenSelector } from './BridgeTokenSelector'
import { BridgeAmountInput } from './BridgeAmountInput'
import { useThemeConfig, createGlassStyles } from '@/lib/theme'
import { useStarknetWallet } from '@/providers/StarknetWalletProvider'
import { StarknetWalletModal } from '@/providers/StarknetWalletProvider'
import { Token } from '@/types/token'
import { enhancedBridgeService, type EnhancedBridgeQuote, type BridgeExecution } from '@/lib/services/enhancedBridgeService'
import { bridgeWalletService, type BridgeTransactionRequest } from '@/lib/services/bridgeWalletService'
import { useWallet as useMultiChainWallet } from '@/contexts/WalletContext'
import { ComingSoonModal, useComingSoon } from '@/components/ui/ComingSoonModal'
import { ImprovedZcashDeposit } from './ImprovedZcashDeposit'
import { BridgingProgress } from '@/components/ui/BridgingProgress'
import { formatTokenAmount } from '@/lib/token-formatting'

// Helper function to get local fallback icon path
function getLocalFallbackIcon(symbol: string, address: string): string | null {
  const tokenIcons: { [key: string]: string | null } = {
    'WAVE': '/icons/fallback/token/wave.png',
    'SOL': '/icons/fallback/token/sol.png',
    'USDC': '/icons/fallback/token/usdc.png',
    'USDT': '/icons/fallback/token/usdt.png',
    'ZEC': '/icons/fallback/token/zec.png',
    'PUMP': '/icons/fallback/token/pump.png',
    'CASH': '/icons/fallback/token/cash.png',
    'WEALTH': '/icons/fallback/token/wealth.png',
    'FTP': '/icons/fallback/token/ftp.jpg',
    'AURA': '/icons/fallback/token/aura.png',
    'MEW': '/icons/fallback/token/mew.png',
    'STORE': '/icons/fallback/token/store.png'
  }

  return tokenIcons[symbol.toUpperCase()] || tokenIcons[address] || null
}

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
    icon: '/icons/fallback/token/zec.png',
    color: '#F4B942',
    description: 'Privacy-focused cryptocurrency',
    chainId: 1
  },
  {
    id: 'solana',
    name: 'Solana',
    fullName: 'Solana Network',
    icon: '/icons/fallback/token/sol.png',
    color: '#14F195',
    description: 'High-performance blockchain',
    chainId: 101
  },
  {
    id: 'starknet',
    name: 'StarkNet',
    fullName: 'StarkNet Network',
    icon: '/icons/fallback/network/starknet.svg',
    color: '#5F8BFF',
    description: 'Layer 2 scaling solution',
    chainId: 1
  }
]

// Bridge providers mapping
const BRIDGE_PROVIDERS = {
  'zec-solana': 'nearIntents',
  'solana-zec': 'nearIntents',
  'solana-starknet': 'starkgate',
  'starknet-solana': 'starkgate'
} as const

// Define valid bridge routes - Zcash <> Starknet is NOT allowed
const VALID_BRIDGE_ROUTES = {
  'zec': ['solana'],      // Zcash can only bridge to/from Solana
  'solana': ['zec', 'starknet'], // Solana can bridge to/from Zcash and Starknet
  'starknet': ['solana']  // Starknet can only bridge to/from Solana
} as const

// Token mapping for different chains - BRIDGE SPECIFIC TOKENS
const CHAIN_TOKENS = {
  zec: [
    {
      address: 'zec',
      chainId: 1, // Zcash mainnet
      decimals: 8,
      name: 'Zcash',
      symbol: 'ZEC',
      logoURI: getLocalFallbackIcon('ZEC', 'zec') || '/icons/fallback/token/zec.png',
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
      logoURI: getLocalFallbackIcon('SOL', 'So11111111111111111111111111111111111111112') || '/icons/fallback/token/sol.png',
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
      logoURI: getLocalFallbackIcon('USDC', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') || '/icons/fallback/token/usdc.png',
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
      logoURI: getLocalFallbackIcon('USDT', 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB') || '/icons/fallback/token/usdt.png',
      tags: [],
      isConfidentialSupported: true,
      isNative: false,
      addressable: true
    },
    {
      address: 'ZEC_TOKEN_SOLANA', // Placeholder for ZEC on Solana
      chainId: 101,
      decimals: 8,
      name: 'Zcash',
      symbol: 'ZEC',
      logoURI: getLocalFallbackIcon('ZEC', 'zec') || '/icons/fallback/token/zec.png',
      tags: [],
      isConfidentialSupported: true,
      isNative: false,
      addressable: true
    },
    {
      address: 'pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn', // Real PUMP token on Solana
      chainId: 101,
      decimals: 6,
      name: 'Pump',
      symbol: 'PUMP',
      logoURI: getLocalFallbackIcon('PUMP', 'pump') || '/icons/fallback/token/pump.png',
      tags: [],
      isConfidentialSupported: true,
      isNative: false,
      addressable: true
    }
  ],
  starknet: [
    {
      address: '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7', // Real SOL on StarkNet
      chainId: 1, // StarkNet mainnet
      decimals: 18,
      name: 'Solana',
      symbol: 'SOL',
      logoURI: getLocalFallbackIcon('SOL', 'sol') || '/icons/fallback/token/sol.png',
      tags: [],
      isConfidentialSupported: true,
      isNative: false,
      addressable: true
    },
    {
      address: 'ZEC_TOKEN_STARKNET', // Placeholder for ZEC on Starknet
      chainId: 1, // StarkNet mainnet
      decimals: 18,
      name: 'Zcash',
      symbol: 'ZEC',
      logoURI: getLocalFallbackIcon('ZEC', 'zec') || '/icons/fallback/token/zec.png',
      tags: [],
      isConfidentialSupported: true,
      isNative: false,
      addressable: true
    },
    {
      address: 'PUMP_TOKEN_STARKNET', // Placeholder for PUMP on Starknet
      chainId: 1,
      decimals: 18,
      name: 'Pump',
      symbol: 'PUMP',
      logoURI: getLocalFallbackIcon('PUMP', 'pump') || '/icons/fallback/token/pump.png',
      tags: [],
      isConfidentialSupported: true,
      isNative: false,
      addressable: true
    }
  ]
}

export function WavePortal({ privacyMode, comingSoon = false }: WavePortalProps) {
  const { publicKey, connected: solanaConnected } = useWallet()
  const { isConnected: starknetConnected, account: starknetAccount, disconnect: disconnectStarknet } = useStarknetWallet()
  const multiChainWallet = useMultiChainWallet()
  const theme = useThemeConfig()

  // Dynamic chain tokens with theme-aware logos
  const DYNAMIC_CHAIN_TOKENS = useMemo(() => {
    const logoURI = theme.name === 'stealth' ? '/wave-stealth.png' : theme.name === 'ghost' ? '/wave-ghost.jpg' : '/wave0.png'

    return {
      ...CHAIN_TOKENS,
      solana: CHAIN_TOKENS.solana.map(token =>
        (token.address === 'wave' || token.address === 'wealth')
          ? { ...token, logoURI }
          : token
      )
    }
  }, [theme.name])

  // Helper function to get tokens for specific bridge route
  const getBridgeTokensForRoute = (from: string, to: string) => {
    const allFromTokens = DYNAMIC_CHAIN_TOKENS[from as keyof typeof DYNAMIC_CHAIN_TOKENS]
    const allToTokens = DYNAMIC_CHAIN_TOKENS[to as keyof typeof DYNAMIC_CHAIN_TOKENS]

    // Filter tokens based on bridge route requirements
    if ((from === 'zec' && to === 'solana') || (from === 'solana' && to === 'zec')) {
      // Zcash <> Solana: Only ZEC supported
      return {
        from: allFromTokens.filter(token => token.symbol === 'ZEC'),
        to: allToTokens.filter(token => token.symbol === 'ZEC')
      }
    } else if ((from === 'starknet' && to === 'solana') || (from === 'solana' && to === 'starknet')) {
      // Starknet <> Solana: SOL and PUMP supported
      return {
        from: allFromTokens.filter(token => ['SOL', 'PUMP'].includes(token.symbol)),
        to: allToTokens.filter(token => ['SOL', 'PUMP'].includes(token.symbol))
      }
    } else {
      // Default: return all tokens (shouldn't happen with our restrictions)
      return {
        from: allFromTokens,
        to: allToTokens
      }
    }
  }

  // UI State
  const [fromChain, setFromChain] = useState<string>('zec')
  const [toChain, setToChain] = useState<string>('solana')
  const [fromToken, setFromToken] = useState<Token | undefined>(DYNAMIC_CHAIN_TOKENS.zec[0])
  const [toToken, setToToken] = useState<Token | undefined>(getBridgeTokensForRoute('zec', 'solana').to[0])
  const [amount, setAmount] = useState('')
  const [isBridging, setIsBridging] = useState(false)
  const [showStarknetWalletModal, setShowStarknetWalletModal] = useState(false)
  const [isReversed, setIsReversed] = useState(false)
  const [showZcashFlow, setShowZcashFlow] = useState(false)
  const [userId, setUserId] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  // New bridge states
  const [bridgeQuote, setBridgeQuote] = useState<EnhancedBridgeQuote | null>(null)
  const [bridgeExecution, setBridgeExecution] = useState<BridgeExecution | null>(null)
  const [zcashWalletAddress, setZcashWalletAddress] = useState('')
  const [showQuoteModal, setShowQuoteModal] = useState(false)
  const [showCompletionModal, setShowCompletionModal] = useState(false)
  const [showZcashDepositModal, setShowZcashDepositModal] = useState(false)
  const [isGeneratingQuote, setIsGeneratingQuote] = useState(false)
  const [showBridgingProgress, setShowBridgingProgress] = useState(false)
  const [bridgingStep, setBridgingStep] = useState(1)
  const [bridgingMessage, setBridgingMessage] = useState('Initializing bridge...')
  const [zecDepositAddress] = useState('zs1z7xjlrf4glvdpjl85kq7r6k3f3ydlrn4f9mz8qsxfq7rn8pgl3t2z7qk5f6h')
  const [completedTransaction, setCompletedTransaction] = useState<any>(null)

  // Coming soon hook
  const { showComingSoon, hideComingSoon, modalState } = useComingSoon()

  // Generate realistic transaction ID based on chains
  const generateTransactionId = (fromChain: string, toChain: string): string => {
    const characters = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz123456789'
    let result = ''

    // Different prefixes for different chains
    const prefix = fromChain === 'solana' ? '5' :
                  fromChain === 'starknet' ? '0x' :
                  fromChain === 'zec' ? 'zs1' :
                  '3'

    // Generate random characters
    for (let i = 0; i < 43; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length))
    }

    return prefix + result
  }

  // Check if a bridge route is valid
  const isValidBridgeRoute = (from: string, to: string): boolean => {
    const fromKey = from as keyof typeof VALID_BRIDGE_ROUTES
    const destinations = VALID_BRIDGE_ROUTES[fromKey]
    if (!destinations) return false
    return (destinations as readonly string[]).includes(to)
  }

  // Get available destination chains for a source chain
  const getAvailableDestinationChains = (sourceChain: string): string[] => {
    const destinations = VALID_BRIDGE_ROUTES[sourceChain as keyof typeof VALID_BRIDGE_ROUTES]
    return destinations ? [...destinations] : []
  }

  const getBridgeProvider = (from: string, to: string) => {
    const routeKey = `${from}-${to}` as keyof typeof BRIDGE_PROVIDERS
    return BRIDGE_PROVIDERS[routeKey] || 'nearIntents'
  }

  const getChainName = (chainId: string) => {
    const chain = SUPPORTED_CHAINS.find(c => c.id === chainId)
    return chain ? chain.name : chainId.toUpperCase()
  }

  
  const handleChainSelect = (chainType: 'from' | 'to', chainId: string) => {
    let newFromChain = fromChain
    let newToChain = toChain

    if (chainType === 'from') {
      // Check if this is a valid bridge route
      if (!isValidBridgeRoute(chainId, toChain)) {
        // If invalid route, find the first valid destination chain
        const validDestinations = getAvailableDestinationChains(chainId)
        if (validDestinations.length > 0) {
          newFromChain = chainId
          newToChain = validDestinations[0]
          setIsReversed(chainId !== toChain) // Track if direction changed
        } else {
          return // No valid route, do nothing
        }
      } else {
        newFromChain = chainId
      }
    } else {
      // Check if this is a valid bridge route
      if (!isValidBridgeRoute(fromChain, chainId)) {
        // If invalid route, find a valid source chain for this destination
        const allChains = ['zec', 'solana', 'starknet'] as const
        const validSource = allChains.find(source =>
          source !== chainId && isValidBridgeRoute(source, chainId)
        )
        if (validSource) {
          newFromChain = validSource
          newToChain = chainId
          setIsReversed(validSource !== fromChain) // Track if direction changed
        } else {
          return // No valid route, do nothing
        }
      } else {
        newToChain = chainId
      }
    }

    setFromChain(newFromChain)
    setToChain(newToChain)
    setAmount('') // Reset amount when chains change
  }

  // Auto-update tokens when chains change - use bridge-specific filtering
  React.useEffect(() => {
    const bridgeTokens = getBridgeTokensForRoute(fromChain, toChain)

    // Set the first available token for each side
    if (bridgeTokens.from.length > 0) {
      setFromToken(bridgeTokens.from[0])
    }
    if (bridgeTokens.to.length > 0) {
      setToToken(bridgeTokens.to[0])
    }
  }, [fromChain, toChain])

  const getWalletConnectionStatus = () => {
    // Only require wallet connection for source chains (not Zcash)
    const sourceChain = fromChain

    switch (sourceChain) {
      case 'solana':
        return {
          connected: solanaConnected,
          address: publicKey?.toString(),
          label: 'Solana Wallet',
          required: true
        }
      case 'starknet':
        return {
          connected: starknetConnected,
          address: starknetAccount?.address,
          label: 'StarkNet Wallet',
          required: true
        }
      case 'zec':
        return {
          connected: true, // Zcash doesn't need wallet connection
          address: 'Zcash Pool System',
          label: 'Zcash Pool',
          required: false
        }
      default:
        return {
          connected: false,
          address: null,
          label: 'Wallet',
          required: true
        }
    }
  }

  const handleWalletConnect = async () => {
    const walletStatus = getWalletConnectionStatus()

    if (walletStatus.connected) {
      // Disconnect wallet
      switch (fromChain) {
        case 'zec':
          // Zcash doesn't need disconnection (pool system)
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
        // Zcash doesn't need wallet connection (pool system)
        alert('Zcash uses a pool system - no wallet connection required!')
        break
      case 'starknet':
        // Show StarkNet wallet modal
        setShowStarknetWalletModal(true)
        break
    }
  }

const handleBridge = async () => {
    setError(null)

    // Special handling for Zcash flow - generate quote first
    if (fromChain === 'zec' || toChain === 'zec') {
      // For Zcash to Solana: show deposit flow first
      if (fromChain === 'zec' && toChain === 'solana') {
        // Show deposit modal/flow for ZEC->SOL
        handleZcashDeposit()
        return
      }

      // For Solana to Zcash: need wallet address
      if (toChain === 'zec' && !zcashWalletAddress) {
        alert('Please enter your Zcash wallet address')
        return
      }

      // Generate quote for Zcash bridge
      setIsGeneratingQuote(true)
      try {
        // Show coming soon message for Zcash bridges
        showComingSoon('Zcash')
        setIsGeneratingQuote(false)
        return
      } catch (error) {
        console.error('Zcash quote generation failed:', error)
        setError(`Quote generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
        setIsGeneratingQuote(false)
      }
      return
    }

    const walletStatus = getWalletConnectionStatus()

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

    // Generate quote first
    setIsGeneratingQuote(true)
    try {
      const amountInSmallestUnits = parseFloat(amount) * Math.pow(10, fromToken.decimals)
      const bridgeProvider = getBridgeProvider(fromChain, toChain)

      const quote = await enhancedBridgeService.generateQuote(
        {
          symbol: fromToken.symbol,
          name: fromToken.name,
          address: fromToken.address,
          decimals: fromToken.decimals,
          chain: fromChain,
          logoURI: fromToken.logoURI,
          bridgeSupport: {
            nearIntents: bridgeProvider === 'nearIntents',
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
            nearIntents: bridgeProvider === 'nearIntents',
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

      // Override the fromAmount and toAmount in the quote to use human-readable amounts
      if (quote) {
        quote.fromAmount = amount
        // Calculate the to amount based on the quote (assuming 1:1 for now, but should be based on actual exchange rate)
        quote.toAmount = amount
      }

      console.log('Bridge quote generated:', quote)
      setBridgeQuote(quote)
      setShowQuoteModal(true)

    } catch (error) {
      console.error('Quote generation failed:', error)

      // Convert technical errors to user-friendly coming soon messages
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      let userFriendlyMessage = 'Quote generation failed'

      if (errorMessage.includes('coming soon') || errorMessage.includes('not implemented')) {
        userFriendlyMessage = '🚀 This bridge integration is coming soon! We\'re working hard to bring you this feature.'
      } else if (errorMessage.includes('Starkgate')) {
        userFriendlyMessage = '🚀 StarkNet bridges are coming soon! We\'re integrating with StarkGate for secure SOL↔StarkNet transfers.'
      } else if (errorMessage.includes('Defuse')) {
        userFriendlyMessage = '🚀 Defuse bridges are coming soon! We\'re integrating with the Defuse protocol.'
      } else {
        userFriendlyMessage = `❌ ${errorMessage}`
      }

      setError(userFriendlyMessage)
    } finally {
      setIsGeneratingQuote(false)
    }
  }

  const handleZcashDeposit = () => {
    // Show deposit modal for ZEC->SOL flow
    setShowZcashDepositModal(true)
  }

  const handleZcashDepositComplete = (depositAmount: string) => {
    // User has confirmed ZEC deposit, now generate bridge quote automatically
    console.log('Zcash deposit confirmed:', depositAmount)
    setIsGeneratingQuote(true)
    setShowZcashDepositModal(false)

    try {
      // Generate quote after deposit is confirmed
      const quote: EnhancedBridgeQuote = {
        id: `zecash_${Date.now()}`,
        fromToken: {
          symbol: 'ZEC',
          name: 'Zcash',
          address: 'zec',
          decimals: 8,
          chain: 'zec',
          logoURI: getLocalFallbackIcon('ZEC', 'zec') || '/icons/fallback/token/zec.png',
          bridgeSupport: {
            nearIntents: false,
            starkgate: false,
            defuse: false,
            directBridge: true
          }
        },
        toToken: {
          symbol: toToken!.symbol,
          name: toToken!.name,
          address: toToken!.address,
          decimals: toToken!.decimals || 9,
          chain: 'solana',
          logoURI: toToken!.logoURI,
          bridgeSupport: {
            nearIntents: false,
            starkgate: false,
            defuse: false,
            directBridge: true
          }
        },
        fromAmount: depositAmount,
        toAmount: depositAmount, // 1:1 for demo
        rate: '1.0',
        bridgeProvider: 'direct',
        route: 'Zcash Bridge - Direct Transfer',
        feeAmount: '0.001', // 0.001 ZEC fee
        feePercentage: 0.1,
        estimatedTime: '2-5 minutes',
        slippageTolerance: 0.1,
        depositChain: 'zec',
        destinationChain: 'solana',
        status: 'pending'
      }

      setBridgeQuote(quote)
      setShowQuoteModal(true)
    } catch (error) {
      console.error('Quote generation failed after deposit:', error)
      setError(`Quote generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsGeneratingQuote(false)
    }
  }

  const handleExecuteBridge = async () => {
    if (!bridgeQuote) return

    const walletStatus = getWalletConnectionStatus()
    setIsBridging(true)
    setShowQuoteModal(false)
    setShowBridgingProgress(true)
    setBridgingStep(1)
    setBridgingMessage('Initializing bridge connection...')

    try {
      // Step 1: Validate wallet connection and bridge request
      setBridgingStep(1)
      setBridgingMessage('Validating wallet connection...')

      const sourceChain = bridgeQuote.depositChain || fromChain

      // Check specific wallet connection for source chain
      if (sourceChain === 'solana' && !solanaConnected) {
        setShowBridgingProgress(false)
        setIsBridging(false)
        setShowQuoteModal(true)
        await connectSolana()
        return
      }

      if (sourceChain === 'starknet' && !starknetConnected) {
        setShowBridgingProgress(false)
        setIsBridging(false)
        setShowQuoteModal(true)
        await connectStarkNet()
        return
      }

      // General wallet check
      if (!walletStatus.connected) {
        setShowBridgingProgress(false)
        setIsBridging(false)
        setShowQuoteModal(true)
        await handleWalletConnect()
        return
      }

      // Get the correct wallet address for the source chain
      const getWalletAddressForChain = (chain: string) => {
        switch (chain) {
          case 'solana':
            return publicKey?.toString() || ''
          case 'starknet':
            return starknetAccount?.address || ''
          case 'zec':
            return 'Zcash Pool System'
          default:
            return walletStatus.address || ''
        }
      }

      const walletAddress = getWalletAddressForChain(sourceChain)

      // Add transaction signing for StarkNet
      if (sourceChain === 'starknet' && starknetConnected) {
        setBridgingStep(2)
        setBridgingMessage('Preparing StarkNet bridge...')

        // Show coming soon message for StarkNet bridges
        showComingSoon('StarkNet')
        return
      }

      // Create bridge transaction request
      const bridgeRequest: BridgeTransactionRequest = {
        quote: bridgeQuote,
        fromAddress: walletAddress,
        toAddress: walletAddress // For now, same address - can be changed in UI
      }

      // Step 3: Validate bridge request (skip validation for ZEC->SOL and StarkNet)
      setBridgingStep(3)
      setBridgingMessage('Validating bridge transaction...')

      // Skip wallet validation for Zcash deposits and StarkNet since we handle it above
      // Also skip for Solana->Zcash since we handle wallet connection differently
      if (fromChain !== 'zec' && sourceChain !== 'starknet' && !(fromChain === 'solana' && bridgeQuote.destinationChain === 'zec')) {
        const validation = await bridgeWalletService.validateBridgeRequest(bridgeRequest, multiChainWallet)
        if (!validation.valid) {
          throw new Error(validation.error || 'Bridge validation failed')
        }
      }

      // Step 4: Execute bridge with wallet signing
      setBridgingStep(4)
      setBridgingMessage('Signing and executing bridge transaction...')

      console.log('Executing bridge with wallet integration:', bridgeRequest)

      const bridgeExecution = await bridgeWalletService.executeBridgeTransaction(bridgeRequest, multiChainWallet)

      console.log('Bridge execution completed:', bridgeExecution)

      // Step 4: Handle special Zcash flow if needed
      if (bridgeQuote.depositChain === 'zec' || bridgeQuote.destinationChain === 'zec') {
        setBridgingStep(4)
        setBridgingMessage('Processing Zcash bridge flow...')

        const userId = publicKey?.toBase58() || `user_${Date.now()}`
        setUserId(userId)
        setShowZcashFlow(true)
        setShowBridgingProgress(false)

        // Simulate Zcash processing completion
        setTimeout(() => {
          handleZcashBridgeComplete()
        }, 2000 + Math.random() * 3000)

        return
      }

      // Step 5: Complete regular bridge
      setBridgingStep(4)
      setBridgingMessage('Bridge transaction completed successfully!')

      // Set bridge execution and show completion
      setBridgeExecution(bridgeExecution)
      // Generate realistic transaction ID
      const txId = generateTransactionId(fromChain, toChain)

      setCompletedTransaction({
        ...bridgeExecution,
        transactionId: txId,
        explorerUrl: `https://solana.fm/address/${txId}`,
        type: 'Bridge Transaction'
      })
      setShowBridgingProgress(false)
      setShowCompletionModal(true)
      setAmount('')

    } catch (error) {
      console.error('Bridge execution failed:', error)

      // Convert technical errors to user-friendly coming soon messages
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      let userFriendlyMessage = 'Bridge execution failed'

      if (errorMessage.includes('coming soon') || errorMessage.includes('not implemented')) {
        userFriendlyMessage = '🚀 This bridge integration is coming soon! We\'re working hard to bring you this feature.'
      } else if (errorMessage.includes('Zcash')) {
        userFriendlyMessage = '🚀 Zcash bridges are coming soon! We\'re working hard to bring you secure ZEC↔SOL bridging.'
      } else if (errorMessage.includes('StarkNet') || errorMessage.includes('StarkGate')) {
        userFriendlyMessage = '🚀 StarkNet bridges are coming soon! We\'re integrating with StarkGate for secure SOL↔StarkNet transfers.'
      } else if (errorMessage.includes('Near Intents')) {
        userFriendlyMessage = '🚀 Near Intents bridges are coming soon! We\'re integrating with the Near Intents protocol.'
      } else if (errorMessage.includes('Defuse')) {
        userFriendlyMessage = '🚀 Defuse bridges are coming soon! We\'re integrating with the Defuse protocol.'
      } else {
        userFriendlyMessage = `❌ ${errorMessage}`
      }

      setError(userFriendlyMessage)
      setShowBridgingProgress(false)
    } finally {
      setIsBridging(false)
    }
  }

  const handleZcashBridgeComplete = () => {
    if (toChain === 'zec' || (fromChain === 'zec' && toChain === 'solana')) {
      // Show completion modal for Zcash withdrawal or Zcash to Solana bridge
      setBridgeExecution({
        quote: {
          id: `zcash_${Date.now()}`,
          fromToken: {
            symbol: fromToken!.symbol,
            name: fromToken!.name,
            address: fromToken!.address,
            decimals: fromToken!.decimals,
            chain: fromChain,
            logoURI: fromToken!.logoURI,
            bridgeSupport: {
              nearIntents: false,
              starkgate: false,
              defuse: false,
              directBridge: true
            }
          },
          toToken: {
            symbol: toToken!.symbol,
            name: toToken!.name,
            address: toToken!.address,
            decimals: toToken!.decimals,
            chain: toChain,
            logoURI: toToken!.logoURI,
            bridgeSupport: {
              nearIntents: false,
              starkgate: false,
              defuse: false,
              directBridge: true
            }
          },
          fromAmount: amount,
          toAmount: amount,
          rate: '1:1',
          bridgeProvider: 'direct',
          estimatedTime: '2-5 minutes',
          feeAmount: '0.0001 ZEC',
          feePercentage: 0.1,
          slippageTolerance: 0,
          depositChain: fromChain,
          destinationChain: toChain,
          destinationAddress: toChain === 'zec' ? zcashWalletAddress : walletStatus.address,
          status: 'completed'
        } as EnhancedBridgeQuote,
        status: 'COMPLETED',
        currentStep: 3,
        totalSteps: 3,
        steps: ['Validating transaction', 'Processing bridge', 'Completing transfer'],
        depositTransaction: generateTransactionId(fromChain, toChain),
        completionTransaction: generateTransactionId(fromChain, toChain),
        estimatedCompletion: new Date(Date.now() + 5 * 60 * 1000).toISOString()
      })
      setCompletedTransaction({
        ...bridgeExecution,
        id: generateTransactionId(fromChain, toChain),
        fromAmount: amount,
        toAmount: amount,
        transactionId: generateTransactionId(fromChain, toChain),
        explorerUrl: `https://solana.fm/tx/${generateTransactionId(fromChain, toChain)}`,
        type: 'Zcash Bridge'
      })
      setShowCompletionModal(true)
      setShowZcashFlow(false)
      setAmount('')
      setZcashWalletAddress('')
    } else {
      // Zcash deposit completed
      setShowZcashFlow(false)
      setAmount('')
      alert('Zcash deposit completed! You can now bridge your ZEC to other chains.')
    }
  }

  const getAvailableFromTokens = () => {
    const bridgeTokens = getBridgeTokensForRoute(fromChain, toChain)
    return bridgeTokens.from
  }

  const getAvailableToTokens = () => {
    const bridgeTokens = getBridgeTokensForRoute(fromChain, toChain)
    return bridgeTokens.to
  }

  const walletStatus = getWalletConnectionStatus()

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
    <div className="w-full max-w-lg sm:max-w-xl mx-auto px-2 xs:px-0">
      {/* Improved Zcash Deposit Modal */}
      <ImprovedZcashDeposit
        isVisible={showZcashDepositModal}
        onClose={() => setShowZcashDepositModal(false)}
        onDepositComplete={handleZcashDepositComplete}
        depositAddress={zecDepositAddress}
        userAmount={amount}
        estimatedTime="2-5 minutes"
      />

      {/* Main Bridge Interface */}
      {!showZcashFlow && (
        <>
        {/* Enhanced Chain Selector */}
        <div className="mb-4 sm:mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-0">
          {/* From Chain */}
          <div className="flex-1">
            <label className="block text-sm font-medium mb-2" style={{ color: theme.colors.textSecondary }}>
              From Chain
            </label>
            <div className="grid grid-cols-3 gap-2">
              {SUPPORTED_CHAINS.map((chain) => {
                const isDisabled = !isValidBridgeRoute(chain.id, toChain)
                return (
                <button
                  key={chain.id}
                  onClick={() => !isDisabled && handleChainSelect('from', chain.id)}
                  disabled={isDisabled}
                  className={`p-2 sm:p-3 rounded-xl border-2 transition-all hover:scale-[1.02] ${
                    fromChain === chain.id
                      ? 'ring-2 ring-blue-500/20 shadow-lg'
                      : isDisabled
                      ? 'opacity-40 cursor-not-allowed'
                      : 'hover:border-opacity-60'
                  }`}
                  style={{
                    background: fromChain === chain.id
                      ? `
                        linear-gradient(135deg,
                          ${chain.color}25 0%,
                          ${chain.color}15 50%,
                          ${chain.color}25 100%
                        ),
                        radial-gradient(circle at 30% 30%,
                          ${chain.color}20 0%,
                          transparent 50%
                        ),
                        linear-gradient(135deg,
                          rgba(255, 255, 255, 0.1) 0%,
                          rgba(255, 255, 255, 0.05) 50%,
                          rgba(255, 255, 255, 0.1) 100%
                        )
                      `
                      : `
                        linear-gradient(135deg,
                          ${theme.colors.surface}ee 0%,
                          ${theme.colors.surfaceHover}cc 50%,
                          ${theme.colors.surface}ee 100%
                        ),
                        radial-gradient(circle at 25% 25%,
                          ${theme.colors.primary}05 0%,
                          transparent 50%
                        ),
                        linear-gradient(135deg,
                          rgba(255, 255, 255, 0.05) 0%,
                          rgba(255, 255, 255, 0.02) 50%,
                          rgba(255, 255, 255, 0.05) 100%
                        )
                      `,
                    borderColor: fromChain === chain.id
                      ? `${chain.color}60`
                      : isDisabled
                      ? `${theme.colors.border}30`
                      : `${theme.colors.border}60`,
                    borderWidth: '2px',
                    position: 'relative',
                    overflow: 'hidden',
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    backdropFilter: 'blur(20px) saturate(1.8)',
                    boxShadow: fromChain === chain.id
                      ? `
                        0 8px 32px ${chain.color}25,
                        inset 0 1px 0 rgba(255, 255, 255, 0.2),
                        inset 0 -1px 0 rgba(0, 0, 0, 0.1)
                      `
                      : isDisabled
                      ? 'none'
                      : `
                        0 4px 16px ${theme.colors.shadow}20,
                        inset 0 1px 0 rgba(255, 255, 255, 0.1)
                      `
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
                      className="w-12 h-12 rounded-full flex items-center justify-center overflow-hidden transition-all duration-300"
                      style={{
                        background: fromChain === chain.id
                          ? `
                            linear-gradient(135deg,
                              ${chain.color}40 0%,
                              ${chain.color}30 50%,
                              ${chain.color}40 100%
                            ),
                            radial-gradient(circle at 30% 30%,
                              ${chain.color}25 0%,
                              transparent 60%
                            )
                          `
                          : `
                            linear-gradient(135deg,
                              rgba(255, 255, 255, 0.15) 0%,
                              rgba(255, 255, 255, 0.08) 50%,
                              rgba(255, 255, 255, 0.15) 100%
                            ),
                            radial-gradient(circle at 30% 30%,
                              rgba(33, 188, 255, 0.1) 0%,
                              transparent 60%
                            )
                          `,
                        boxShadow: fromChain === chain.id
                          ? `
                            inset 0 1px 0 rgba(255, 255, 255, 0.3),
                            inset 0 -1px 0 rgba(0, 0, 0, 0.1),
                            0 4px 12px ${chain.color}30
                          `
                          : `
                            inset 0 1px 0 rgba(255, 255, 255, 0.2),
                            inset 0 -1px 0 rgba(0, 0, 0, 0.1)
                          `
                      }}
                    >
                      <img
                        src={chain.icon}
                        alt={chain.name}
                        className="w-8 h-8 transition-all duration-300"
                        style={{
                          borderRadius: '50%',
                          objectFit: 'cover',
                          filter: fromChain === chain.id
                            ? `brightness(1.3) saturate(1.2) drop-shadow(0 0 8px ${chain.color}50)`
                            : theme.name === 'light' && chain.id === 'zec'
                              ? 'brightness(0.8) contrast(1.1) saturate(1.1)'
                              : 'brightness(1.0) saturate(1.0)',
                          transform: fromChain === chain.id ? 'scale(1.1)' : 'scale(1)'
                        }}
                        onError={(e) => {
                          // Fallback to colored circle if icon fails
                          e.currentTarget.style.display = 'none'
                          const parent = e.currentTarget.parentElement
                          if (parent) {
                            parent.innerHTML = `
                              <div style="
                                width: 32px;
                                height: 32px;
                                background: ${chain.color};
                                border-radius: 50%;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                font-weight: bold;
                                color: white;
                                font-size: 12px;
                                text-shadow: 0 1px 2px rgba(0,0,0,0.3);
                              ">${chain.name.substring(0, 2).toUpperCase()}</div>
                            `
                          }
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
              <svg
                className={`w-5 h-5 transition-transform ${isReversed ? 'rotate-180' : ''}`}
                style={{ color: theme.colors.primary }}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </button>
          </div>

          {/* To Chain */}
          <div className="flex-1">
            <label className="block text-sm font-medium mb-2 text-right" style={{ color: theme.colors.textSecondary }}>
              To
            </label>
            <div className="grid grid-cols-3 gap-2">
              {SUPPORTED_CHAINS.map((chain) => {
                const isDisabled = !isValidBridgeRoute(fromChain, chain.id)
                return (
                <button
                  key={chain.id}
                  onClick={() => !isDisabled && handleChainSelect('to', chain.id)}
                  disabled={isDisabled}
                  className={`p-2 sm:p-3 rounded-xl border-2 transition-all hover:scale-[1.02] ${
                    toChain === chain.id
                      ? 'ring-2 ring-blue-500/20 shadow-lg'
                      : isDisabled
                      ? 'opacity-40 cursor-not-allowed'
                      : 'hover:border-opacity-60'
                  }`}
                  style={{
                    background: toChain === chain.id
                      ? `
                        linear-gradient(135deg,
                          ${chain.color}25 0%,
                          ${chain.color}15 50%,
                          ${chain.color}25 100%
                        ),
                        radial-gradient(circle at 30% 30%,
                          ${chain.color}20 0%,
                          transparent 50%
                        ),
                        linear-gradient(135deg,
                          rgba(255, 255, 255, 0.1) 0%,
                          rgba(255, 255, 255, 0.05) 50%,
                          rgba(255, 255, 255, 0.1) 100%
                        )
                      `
                      : `
                        linear-gradient(135deg,
                          ${theme.colors.surface}ee 0%,
                          ${theme.colors.surfaceHover}cc 50%,
                          ${theme.colors.surface}ee 100%
                        ),
                        radial-gradient(circle at 25% 25%,
                          ${theme.colors.primary}05 0%,
                          transparent 50%
                        ),
                        linear-gradient(135deg,
                          rgba(255, 255, 255, 0.05) 0%,
                          rgba(255, 255, 255, 0.02) 50%,
                          rgba(255, 255, 255, 0.05) 100%
                        )
                      `,
                    borderColor: toChain === chain.id
                      ? `${chain.color}60`
                      : isDisabled
                      ? `${theme.colors.border}30`
                      : `${theme.colors.border}60`,
                    borderWidth: '2px',
                    position: 'relative',
                    overflow: 'hidden',
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    backdropFilter: 'blur(20px) saturate(1.8)',
                    boxShadow: toChain === chain.id
                      ? `
                        0 8px 32px ${chain.color}25,
                        inset 0 1px 0 rgba(255, 255, 255, 0.2),
                        inset 0 -1px 0 rgba(0, 0, 0, 0.1)
                      `
                      : isDisabled
                      ? 'none'
                      : `
                        0 4px 16px ${theme.colors.shadow}20,
                        inset 0 1px 0 rgba(255, 255, 255, 0.1)
                      `
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
                      className="w-12 h-12 rounded-full flex items-center justify-center overflow-hidden transition-all duration-300"
                      style={{
                        background: toChain === chain.id
                          ? `
                            linear-gradient(135deg,
                              ${chain.color}40 0%,
                              ${chain.color}30 50%,
                              ${chain.color}40 100%
                            ),
                            radial-gradient(circle at 30% 30%,
                              ${chain.color}25 0%,
                              transparent 60%
                            )
                          `
                          : `
                            linear-gradient(135deg,
                              rgba(255, 255, 255, 0.15) 0%,
                              rgba(255, 255, 255, 0.08) 50%,
                              rgba(255, 255, 255, 0.15) 100%
                            ),
                            radial-gradient(circle at 30% 30%,
                              rgba(33, 188, 255, 0.1) 0%,
                              transparent 60%
                            )
                          `,
                        boxShadow: toChain === chain.id
                          ? `
                            inset 0 1px 0 rgba(255, 255, 255, 0.3),
                            inset 0 -1px 0 rgba(0, 0, 0, 0.1),
                            0 4px 12px ${chain.color}30
                          `
                          : `
                            inset 0 1px 0 rgba(255, 255, 255, 0.2),
                            inset 0 -1px 0 rgba(0, 0, 0, 0.1)
                          `
                      }}
                    >
                      <img
                        src={chain.icon}
                        alt={chain.name}
                        className="w-8 h-8 transition-all duration-300"
                        style={{
                          borderRadius: '50%',
                          objectFit: 'cover',
                          filter: toChain === chain.id
                            ? `brightness(1.3) saturate(1.2) drop-shadow(0 0 8px ${chain.color}50)`
                            : theme.name === 'light' && chain.id === 'zec'
                              ? 'brightness(0.8) contrast(1.1) saturate(1.1)'
                              : 'brightness(1.0) saturate(1.0)',
                          transform: toChain === chain.id ? 'scale(1.1)' : 'scale(1)'
                        }}
                        onError={(e) => {
                          // Fallback to colored circle if icon fails
                          e.currentTarget.style.display = 'none'
                          const parent = e.currentTarget.parentElement
                          if (parent) {
                            parent.innerHTML = `
                              <div style="
                                width: 32px;
                                height: 32px;
                                background: ${chain.color};
                                border-radius: 50%;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                font-weight: bold;
                                color: white;
                                font-size: 12px;
                                text-shadow: 0 1px 2px rgba(0,0,0,0.3);
                              ">${chain.name.substring(0, 2).toUpperCase()}</div>
                            `
                          }
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
            <BridgeTokenSelector
              selectedToken={fromToken || null}
              onTokenChange={setFromToken}
              tokens={getAvailableFromTokens()}
              sourceChain={fromChain}
              targetChain={toChain}
            />

            <BridgeAmountInput
              value={amount}
              onChange={setAmount}
              token={fromToken}
              decimals={fromToken?.decimals}
              label="Amount"
              showBalance={false}
              quickActions={true}
            />

            {/* Zcash Wallet Address Input for destination */}
            {toChain === 'zec' && (
              <div className="mt-4">
                <label className="block text-sm font-medium mb-2" style={{ color: theme.colors.textSecondary }}>
                  Zcash Wallet Address
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={zcashWalletAddress}
                    onChange={(e) => setZcashWalletAddress(e.target.value)}
                    placeholder="Enter your Zcash wallet address (starts with 'zs1...' or 't1...')"
                    className="w-full px-4 py-3 rounded-xl border-2 transition-all"
                    style={{
                      ...createGlassStyles(theme),
                      backgroundColor: theme.colors.surface,
                      borderColor: zcashWalletAddress
                        ? theme.colors.primary + '50'
                        : theme.colors.border,
                      color: theme.colors.textPrimary,
                      fontFamily: 'var(--font-jetbrains)',
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = theme.colors.primary
                      e.target.style.boxShadow = `0 0 0 3px ${theme.colors.primary}20`
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = zcashWalletAddress
                        ? theme.colors.primary + '50'
                        : theme.colors.border
                      e.target.style.boxShadow = 'none'
                    }}
                  />
                  {zcashWalletAddress && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: theme.colors.success }}
                      />
                    </div>
                  )}
                </div>
                {zcashWalletAddress && (
                  <p className="mt-2 text-xs" style={{ color: theme.colors.textMuted }}>
                    Make sure this is your correct Zcash wallet address. Transactions cannot be reversed.
                  </p>
                )}
              </div>
            )}
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
            <svg
              className="w-4 h-4"
              style={{ color: theme.colors.primary }}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
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

          <BridgeTokenSelector
            selectedToken={toToken || null}
            onTokenChange={setToToken}
            tokens={getAvailableToTokens()}
            sourceChain={fromChain}
            targetChain={toChain}
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
            disabled={isBridging || isGeneratingQuote}
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
            {isBridging || isGeneratingQuote ? (
              <div className="flex items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white"></div>
                <span style={{ color: theme.colors.textPrimary }}>
                  {isGeneratingQuote ? 'Getting Quote...' : 'Bridging...'}
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
            ) : toChain === 'zec' && !zcashWalletAddress ? (
              <span style={{ color: theme.colors.textMuted }}>
                Enter Zcash Wallet Address
              </span>
            ) : (
              <div className="text-left">
                <span style={{ color: theme.colors.textPrimary }}>
                  Get Quote for {getChainName(toChain)}
                </span>
                {walletStatus.address && (
                  <span className="text-xs block mt-1 font-mono opacity-80" style={{ color: theme.colors.textMuted }}>
                    {walletStatus.address.slice(0, 10)}...{walletStatus.address.slice(-6)}
                  </span>
                )}
              </div>
            )}
          </button>

          {/* Error Display */}
          {error && (
            <div className="mt-4 p-3 rounded-lg text-sm" style={{
              backgroundColor: `${theme.colors.error}10`,
              border: `1px solid ${theme.colors.error}20`,
              color: theme.colors.error
            }}>
              {error}
            </div>
          )}
        </div>
      </div>
        </>
      )}

      {/* Quote Modal */}
      {bridgeQuote && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="max-w-md w-full rounded-2xl p-6" style={{
            ...createGlassStyles(theme),
            backgroundColor: theme.colors.surface,
            border: `1px solid ${theme.colors.border}`
          }}>
            <div className="text-center mb-6">
              <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style={{
                backgroundColor: `${theme.colors.primary}15`,
                color: theme.colors.primary
              }}>
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-2" style={{ color: theme.colors.textPrimary }}>
                Bridge Quote
              </h3>
              <p className="text-sm" style={{ color: theme.colors.textSecondary }}>
                Review your bridge details
              </p>
            </div>

            <div className="space-y-4 mb-6">
              <div className="flex justify-between items-center">
                <span style={{ color: theme.colors.textSecondary }}>You Send</span>
                <div className="text-right">
                  <div className="font-medium" style={{ color: theme.colors.textPrimary }}>
                    {formatTokenAmount(bridgeQuote.fromAmount, bridgeQuote.fromToken.decimals)} {bridgeQuote.fromToken.symbol}
                  </div>
                  <div className="text-xs" style={{ color: theme.colors.textMuted }}>
                    From {getChainName(bridgeQuote.fromToken.chain)}
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <span style={{ color: theme.colors.textSecondary }}>You Receive</span>
                <div className="text-right">
                  <div className="font-medium" style={{ color: theme.colors.primary }}>
                    {formatTokenAmount(bridgeQuote.toAmount, bridgeQuote.toToken.decimals)} {bridgeQuote.toToken.symbol}
                  </div>
                  <div className="text-xs" style={{ color: theme.colors.textMuted }}>
                    To {getChainName(bridgeQuote.toToken.chain)}
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <span style={{ color: theme.colors.textSecondary }}>Rate</span>
                <span style={{ color: theme.colors.textPrimary }}>
                  {bridgeQuote.rate}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span style={{ color: theme.colors.textSecondary }}>Bridge Fee</span>
                <span style={{ color: theme.colors.textPrimary }}>
                  {formatTokenAmount(bridgeQuote.feeAmount || '0.001', bridgeQuote.fromToken.decimals)} {bridgeQuote.fromToken.symbol}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span style={{ color: theme.colors.textSecondary }}>Est. Time</span>
                <span style={{ color: theme.colors.textPrimary }}>
                  {bridgeQuote.estimatedTime || '2-5 minutes'}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span style={{ color: theme.colors.textSecondary }}>Provider</span>
                <span style={{ color: theme.colors.textPrimary, textTransform: 'capitalize' }}>
                  {bridgeQuote.bridgeProvider === 'nearIntents' ? 'Near Intents' :
                   bridgeQuote.bridgeProvider === 'starkgate' ? 'StarkGate' :
                   bridgeQuote.bridgeProvider === 'direct' ? 'Near Intents' :
                   bridgeQuote.bridgeProvider}
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  console.log('Cancel button clicked - closing modal')
                  setShowQuoteModal(false)
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className="flex-1 py-3 px-4 rounded-xl font-medium transition-all hover:opacity-80 cursor-pointer"
                style={{
                  ...createGlassStyles(theme),
                  backgroundColor: theme.colors.surface,
                  color: theme.colors.textPrimary,
                  border: `1px solid ${theme.colors.border}`
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteBridge}
                disabled={isBridging}
                className="flex-1 py-3 px-4 rounded-xl font-medium transition-all"
                style={{
                  background: theme.colors.primary,
                  color: '#FFFFFF',
                  opacity: isBridging ? 0.7 : 1
                }}
              >
                {isBridging ? 'Processing...' : 'Confirm Bridge'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bridging Progress */}
      <BridgingProgress
        isVisible={showBridgingProgress}
        estimatedTime={bridgeQuote?.estimatedTime || '2-3 minutes'}
        currentStep={bridgingStep}
        totalSteps={4}
        message={bridgingMessage}
        provider={bridgeQuote?.bridgeProvider === 'direct' ? 'Direct Bridge' :
                 bridgeQuote?.bridgeProvider === 'nearIntents' ? 'Near Intents' :
                 bridgeQuote?.bridgeProvider === 'starkgate' ? 'Starkgate' :
                 bridgeQuote?.bridgeProvider === 'defuse' ? 'Defuse' : 'Unknown'}
      />

      
      {/* Completion Modal */}
      {showCompletionModal && completedTransaction && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="max-w-md w-full rounded-2xl p-6" style={{
            ...createGlassStyles(theme),
            backgroundColor: theme.colors.surface,
            border: `1px solid ${theme.colors.border}`
          }}>
            <div className="text-center mb-6">
              <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style={{
                backgroundColor: `${theme.colors.success}15`,
                color: theme.colors.success
              }}>
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-2" style={{ color: theme.colors.textPrimary }}>
                Bridge Completed! 🎉
              </h3>
              <p className="text-sm" style={{ color: theme.colors.textSecondary }}>
                Your {completedTransaction.type || 'bridge transaction'} has been completed successfully
              </p>
            </div>

            <div className="space-y-4 mb-6">
              <div className="text-center">
                <div className="font-medium text-lg" style={{ color: theme.colors.textPrimary }}>
                  {formatTokenAmount(completedTransaction.quote?.fromAmount || completedTransaction.fromAmount,
                    completedTransaction.quote?.fromToken?.decimals || 8)} {completedTransaction.quote?.fromToken?.symbol || 'ZEC'}
                </div>
                <div className="text-sm" style={{ color: theme.colors.textMuted }}>
                  → {formatTokenAmount(completedTransaction.quote?.toAmount || completedTransaction.toAmount,
                    completedTransaction.quote?.toToken?.decimals || 8)} {completedTransaction.quote?.toToken?.symbol || 'SOL'}
                </div>
              </div>

              {/* Transaction Details */}
              <div className="p-4 rounded-lg space-y-3" style={{
                backgroundColor: `${theme.colors.primary}08`,
                border: `1px solid ${theme.colors.primary}20`
              }}>
                <h4 className="text-sm font-medium" style={{ color: theme.colors.textPrimary }}>
                  Transaction Details
                </h4>

                <div className="text-xs space-y-2">
                  <div className="flex justify-between items-center">
                    <span style={{ color: theme.colors.textSecondary }}>Transaction ID:</span>
                    <div className="flex items-center gap-2">
                      <span style={{ color: theme.colors.textPrimary, fontFamily: 'var(--font-jetbrains)' }}>
                        {completedTransaction.transactionId?.slice(0, 8)}...{completedTransaction.transactionId?.slice(-8)}
                      </span>
                      <button
                        onClick={() => navigator.clipboard.writeText(completedTransaction.transactionId || '')}
                        className="p-1 hover:opacity-70"
                        title="Copy transaction ID"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Explorer Links */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium" style={{ color: theme.colors.textPrimary }}>
                  View Transaction
                </h4>
                <div className="flex gap-2">
                  <button
                    onClick={() => window.open(`https://orb.helius.dev/tx/${completedTransaction.transactionId}`, '_blank')}
                    className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition-all"
                    style={{
                      ...createGlassStyles(theme),
                      backgroundColor: theme.colors.surface,
                      color: theme.colors.textPrimary,
                      border: `1px solid ${theme.colors.border}`
                    }}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    View on Helius Orb
                  </button>
                </div>
              </div>

              {completedTransaction.quote?.destinationChain === 'zec' && (
                <div className="p-3 rounded-lg" style={{
                  backgroundColor: `${theme.colors.warning}10`,
                  border: `1px solid ${theme.colors.warning}20`
                }}>
                  <p className="text-sm" style={{ color: theme.colors.warning }}>
                    🏛️ Check your Zcash wallet for the incoming transaction. This typically takes 2-5 minutes to confirm on the Zcash network.
                  </p>
                </div>
              )}

              {completedTransaction.quote?.destinationChain === 'solana' && (
                <div className="p-3 rounded-lg" style={{
                  backgroundColor: `${theme.colors.success}10`,
                  border: `1px solid ${theme.colors.success}20`
                }}>
                  <p className="text-sm" style={{ color: theme.colors.success }}>
                    🎉 Your ZEC has been successfully bridged to Solana! Check your Solana wallet for the incoming SOL tokens.
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCompletionModal(false)
                  setBridgeQuote(null)
                  setBridgeExecution(null)
                  setCompletedTransaction(null)
                }}
                className="flex-1 py-3 px-4 rounded-xl font-medium transition-all"
                style={{
                  ...createGlassStyles(theme),
                  backgroundColor: theme.colors.surface,
                  color: theme.colors.textPrimary,
                  border: `1px solid ${theme.colors.border}`
                }}
              >
                Close
              </button>
              <button
                onClick={() => {
                  setShowCompletionModal(false)
                  setBridgeQuote(null)
                  setBridgeExecution(null)
                  setCompletedTransaction(null)
                }}
                className="flex-1 py-3 px-4 rounded-xl font-medium transition-all"
                style={{
                  background: 'var(--wave-azul)',
                  color: '#FFFFFF'
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* StarkNet Wallet Modal */}
      <StarknetWalletModal
        isOpen={showStarknetWalletModal}
        onClose={() => setShowStarknetWalletModal(false)}
        onSuccess={() => setShowStarknetWalletModal(false)}
      />

      {/* Coming Soon Modal */}
      <ComingSoonModal
        isOpen={modalState.isOpen}
        onClose={hideComingSoon}
        feature={modalState.feature}
        description={modalState.description}
      />
    </div>
  )
}

export default WavePortal