/**
 * React Hook for Swap Operations
 *
 * Provides comprehensive swap state management with privacy support
 * using Jupiter API and Arcium Confidential SPL tokens.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, Connection, Transaction, VersionedTransaction } from '@solana/web3.js'
import { createSwapService, SwapServiceConfig, SwapRequest, SwapUtils as ServiceSwapUtils } from '@/services/swap'
import { JupiterAPI, JupiterUtils } from '@/lib/jupiter'
import { EncifherClient, EncifherUtils, DefiClient, DefiClientConfig } from '@/lib/encifher'
import { PrivateSwapService } from '@/lib/privateSwapService'
import { Token, SwapQuote, SwapStatus, SwapProgress, SwapMode, getAvailableTokens } from '@/types/token'
import { COMMON_TOKENS, CONFIDENTIAL_TOKENS } from '@/types/token'
import { getUserTokens, getDefaultTokens, getTokenBalance, enrichTokenIcons, clearBalanceCache } from '@/lib/tokens'
import { parseError, WaveSwapError } from '@/lib/errors'

export interface SwapState {
  inputToken: Token | null
  outputToken: Token | null
  inputAmount: string
  outputAmount: string
  swapMode: SwapMode
  quote: SwapQuote | null
  balances: Map<string, string>
  isLoading: boolean
  error: string | null
  structuredError: WaveSwapError | null
  progress: SwapProgress | null
  availableTokens: Token[]
}

export interface SwapActions {
  setInputToken: (token: Token) => void
  setOutputToken: (token: Token) => void
  setInputAmount: (amount: string) => void
  setOutputAmount: (amount: string) => void
  setSwapMode: (mode: SwapMode) => void
  swap: () => Promise<void>
  getQuote: () => Promise<void>
  refreshBalances: () => Promise<void>
  clearQuote: () => void
  clearError: () => void
  cancelSwap: () => void
}

export function useSwap(privacyMode: boolean, publicKey: PublicKey | null): SwapState & SwapActions {
  const { connection } = useConnection()
  const { signTransaction, signAllTransactions } = useWallet()

  const debugPrivacyMode = privacyMode // Use actual privacy mode without debug override
  const swapServiceRef = useRef<any>(null)
  const privateSwapServiceRef = useRef<PrivateSwapService | null>(null)
  const encifherClientRef = useRef<EncifherClient | null>(null)

  // Core swap state - Initialize with empty tokens, will be populated by useEffect
  const [inputToken, setInputToken] = useState<Token | null>(null)
  const [outputToken, setOutputToken] = useState<Token | null>(null)
  const [inputAmount, setInputAmount] = useState('')
  const [outputAmount, setOutputAmount] = useState('')
  const [swapMode, setSwapMode] = useState<SwapMode>(privacyMode ? SwapMode.PRIVATE : SwapMode.NORMAL)
  const [quote, setQuote] = useState<SwapQuote | null>(null)
  const [balances, setBalances] = useState<Map<string, string>>(new Map())

  // Sync swapMode with privacyMode prop changes
  useEffect(() => {
    const newSwapMode = privacyMode ? SwapMode.PRIVATE : SwapMode.NORMAL
    console.log('useSwap: privacyMode prop changed, updating swapMode from', swapMode, 'to', newSwapMode)
    setSwapMode(newSwapMode)

    // Clear existing quote when switching modes
    setQuote(null)
  }, [privacyMode])

  // UI state
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [structuredError, setStructuredError] = useState<WaveSwapError | null>(null)
  const [progress, setProgress] = useState<SwapProgress | null>(null)
  const [availableTokens, setAvailableTokens] = useState<Token[]>([])

  // Initialize tokens with enriched icons on mount
  useEffect(() => {
    const initializeTokens = async () => {
      const tokens = await getAvailableTokens(privacyMode)
      setAvailableTokens(tokens)

      // Force SOL as Send and WAVE as Receive - create fallback tokens if not found
      const solToken = tokens.find(t => t.address === 'So11111111111111111111111111111111111111112') || {
        address: 'So11111111111111111111111111111111111111112',
        chainId: 101,
        decimals: 9,
        name: 'Solana',
        symbol: 'SOL',
        logoURI: 'https://img-cdn.jup.ag/tokens/SOL.svg',
        tags: ['native', 'solana'],
        isConfidentialSupported: true,
        isNative: true,
        addressable: true
      } as Token

      const waveToken = tokens.find(t => t.address === '4AGxpKxYnw7g1ofvYDs5Jq2a1ek5kB9jS2NTUaippump') || {
        address: '4AGxpKxYnw7g1ofvYDs5Jq2a1ek5kB9jS2NTUaippump',
        chainId: 101,
        decimals: 9,
        name: 'Wave',
        symbol: 'WAVE',
        logoURI: 'https://img-cdn.jup.ag/tokens/WAVE.svg',
        tags: ['defi', 'dex'],
        isConfidentialSupported: false,
        isNative: false,
        addressable: true
      } as Token

      // Always set SOL as Send and WAVE as Receive
      setInputToken(solToken)
      setOutputToken(waveToken)
    }

    initializeTokens()
  }, [privacyMode]) // Re-run when privacy mode changes

  // Initialize swap service when wallet is connected
  useEffect(() => {
    if (publicKey && connection) {
      try {
        const jupiterApi = JupiterAPI.createClient(connection)

        // Initialize Encifher client for private swaps
        const encifherClient = new EncifherClient(connection)
        encifherClientRef.current = encifherClient

        // Only initialize if configured (will fall back to default)
        if (EncifherUtils.isConfigured()) {
          const config = EncifherUtils.getConfig()!
          encifherClient.initialize(config).catch(error => {
            console.warn('[Encifher] Initialization failed, will retry on demand:', error)
          })
        }

        // Initialize PrivateSwapService for enhanced private swap flow
        privateSwapServiceRef.current = new PrivateSwapService(connection, encifherClient)

        // Integrated wallet adapter with Jupiter API (without Encifher for now)
        swapServiceRef.current = createSwapService({
          connection,
          jupiterApi,
          userPublicKey: publicKey,
          signTransaction: async (tx: Transaction | VersionedTransaction) => {
            if (!signTransaction) {
              throw new Error('Wallet signing function not available')
            }
            try {
              return await signTransaction(tx)
            } catch (error: any) {
              // Handle wallet rejection gracefully
              if (error.name === 'WalletSignTransactionError' ||
                  error.message?.includes('User rejected the request') ||
                  error.message?.includes('rejected')) {
                throw new Error('Transaction cancelled by user')
              }
              throw error
            }
          },
          signAllTransactions: async (txs: (Transaction | VersionedTransaction)[]) => {
            if (!signAllTransactions) {
              throw new Error('Wallet batch signing function not available')
            }
            try {
              return await signAllTransactions(txs)
            } catch (error: any) {
              // Handle wallet rejection gracefully
              if (error.name === 'WalletSignTransactionError' ||
                  error.message?.includes('User rejected the request') ||
                  error.message?.includes('rejected')) {
                throw new Error('Transaction cancelled by user')
              }
              throw error
            }
          },
          onProgress: setProgress
        })

        console.log('Swap service initialized successfully with Jupiter API')
      } catch (error) {
        console.error('Failed to initialize swap service:', error)
        setError('Failed to initialize swap service')
      }
    }
  }, [publicKey, connection, signTransaction, signAllTransactions])

  // Update swap mode when privacy mode changes
  useEffect(() => {
    const newMode = privacyMode ? SwapMode.PRIVATE : SwapMode.NORMAL
    setSwapMode(newMode)
  }, [privacyMode])

  // In confidential mode, we use regular tokens with Encifher privacy wrapper
  const getJupiterToken = (token: Token): string => {
    // Always use the actual token address - Encifher handles the privacy wrapping
    return token.address
  }

  // Filter tokens based on swap mode
  useEffect(() => {
    const loadFilteredTokens = async () => {
      const filtered = await getAvailableTokens(privacyMode)
      setAvailableTokens(filtered)

      // Only update tokens if current ones are not supported in current mode
      // Preserve user selection when possible
      if (inputToken && !filtered.find((t: Token) => t.address === inputToken.address)) {
        const solToken = filtered.find(t => t.address === 'So11111111111111111111111111111111111111112')
        setInputToken(solToken || filtered[0] || null)
      }
      if (outputToken && !filtered.find((t: Token) => t.address === outputToken.address)) {
        const waveToken = filtered.find(t => t.address === '4AGxpKxYnw7g1ofvYDs5Jq2a1ek5kB9jS2NTUaippump')
        setOutputToken(waveToken || filtered[1] || filtered[0] || null)
      }
    }

    loadFilteredTokens()
  }, [privacyMode])

  // Load user's tokens when wallet connects or privacy mode changes
  useEffect(() => {
    if (publicKey && connection) {
      loadUserTokens()
    } else {
      // No wallet, just show defaults
      const loadDefaultTokens = async () => {
        const defaultTokens = await getAvailableTokens(privacyMode)
        setAvailableTokens(defaultTokens)
      }
      loadDefaultTokens()
    }
  }, [publicKey, connection, privacyMode])

  // Load user's wallet tokens
  const loadUserTokens = async () => {
    if (!publicKey || !connection) return

    try {
      const userTokens = await getUserTokens(connection, publicKey)

      // Merge with available tokens based on privacy mode
      const tokenMap = new Map<string, Token>()

      // Add confidential tokens if in privacy mode
      if (privacyMode) {
        CONFIDENTIAL_TOKENS.forEach(token => tokenMap.set(token.address, token))
      }

      // Add user tokens
      userTokens.forEach(token => tokenMap.set(token.address, token))

      // Add common tokens
      COMMON_TOKENS.forEach(token => {
        if (!tokenMap.has(token.address)) {
          tokenMap.set(token.address, token)
        }
      })

      const allTokens = Array.from(tokenMap.values())

      // Enrich all tokens with icons from Jupiter API
      const enrichedTokens = await enrichTokenIcons(allTokens)
      setAvailableTokens(enrichedTokens)

      console.log('Loaded tokens:', enrichedTokens.map(t => t.symbol))
    } catch (error) {
      console.error('Error loading user tokens:', error)
      // Fall back to available tokens for current mode
      const fallbackTokens = await getAvailableTokens(privacyMode)
      setAvailableTokens(fallbackTokens)
    }
  }

  // Debounced balance refresh to avoid excessive API calls
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (publicKey && (inputToken || outputToken)) {
        refreshBalances()
      }
    }, 500) // 500ms debounce

    return () => clearTimeout(timeoutId)
  }, [publicKey, inputToken, outputToken])

  // Initial balance fetch on wallet connection
  useEffect(() => {
    if (publicKey && !inputToken && !outputToken && availableTokens.length > 0) {
      // Fetch balances for top tokens by default
      const topTokens = availableTokens.slice(0, 6) // Fetch for 6 most common tokens
      fetchMultipleBalances(topTokens).then(newBalances => {
        setBalances(prev => {
          const merged = new Map(prev)
          newBalances.forEach((balance, address) => {
            merged.set(address, balance)
          })
          return merged
        })
      })
    }
  }, [publicKey, availableTokens])

  const handleSetInputAmount = useCallback((amount: string) => {
    setInputAmount(amount)
    clearQuote()
  }, [])

  const handleSetOutputAmount = useCallback((amount: string) => {
    setOutputAmount(amount)
  }, [])

  const handleSetInputToken = useCallback((token: Token) => {
    setInputToken(token)
    clearQuote()

    if (token.address === outputToken?.address) {
      setOutputToken(inputToken || COMMON_TOKENS[1]!)
    }

    setInputAmount('')
    setOutputAmount('')
  }, [outputToken, inputToken])

  const handleSetOutputToken = useCallback((token: Token) => {
    setOutputToken(token)
    clearQuote()

    if (token.address === inputToken?.address) {
      setInputToken(outputToken || COMMON_TOKENS[0]!)
    }

    setInputAmount('')
    setOutputAmount('')
  }, [inputToken, outputToken])

  const handleSetSwapMode = useCallback((mode: SwapMode) => {
    setSwapMode(mode)
    clearQuote()

    // Check if tokens support the new mode
    if (mode === 'private' && inputToken && outputToken) {
      if (!ServiceSwapUtils.canSwapPrivately(inputToken, outputToken)) {
        setError('One or both tokens do not support private swaps')
      }
    }
  }, [inputToken, outputToken])

  
  const getQuote = useCallback(async () => {
    console.log('[getQuote] Called with privacyMode:', swapMode, 'SwapMode.PRIVATE:', SwapMode.PRIVATE)

    // Always fetch quotes - even in privacy mode we need price estimation
    // The API will route to Encifher or Jupiter based on privacyMode parameter

    // Prevent multiple rapid quote requests
    const now = Date.now()
    if (now - (getQuote as any).lastCall < 1000) { // 1 second debounce
      console.log('Quote request debounced, skipping...')
      return
    }
    (getQuote as any).lastCall = now
    if (!inputToken || !outputToken || !inputAmount || !publicKey) {
      setError('Missing required parameters for quote')
      return
    }

    // Prevent swapping the same token
    if (inputToken.address === outputToken.address) {
      setError('Cannot swap the same token. Please select different input and output tokens.')
      return
    }

    // Validate input amount
    const parsedAmount = parseFloat(inputAmount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Invalid amount')
      return
    }

    try {
      setIsLoading(true)
      setError(null)

      // Format amount as integer (smallest unit) with fallback decimals
      const inputDecimals = inputToken.decimals || 9
      const amountInSmallestUnit = Math.floor(parsedAmount * Math.pow(10, inputDecimals))
      
      // Map confidential tokens to their base tokens for Jupiter
      const jupiterInputMint = getJupiterToken(inputToken)
      const jupiterOutputMint = getJupiterToken(outputToken)
      
      console.log('Getting quote via API:', {
        inputMint: jupiterInputMint,
        outputMint: jupiterOutputMint,
        amount: amountInSmallestUnit.toString(),
        inputSymbol: inputToken.symbol,
        outputSymbol: outputToken.symbol,
        isConfidential: swapMode === 'private',
        originalInputMint: inputToken.address,
        originalOutputMint: outputToken.address
      })

      // In privacy mode, we get a Jupiter quote first for estimation, then use Encifher for execution
      // In normal mode, we use Jupiter API directly
      console.log('getQuote: swapMode is:', swapMode, '(privacyMode:', privacyMode, ')')
      console.log('getQuote: privacyMode type:', typeof privacyMode, 'value:', privacyMode)
      console.log('getQuote: privacyMode.toString():', privacyMode.toString())
      console.log('getQuote: privacyMode === true:', privacyMode === true)
      console.log('getQuote: Boolean(privacyMode):', Boolean(privacyMode))

      // Get Jupiter quote for price estimation (both for privacy and normal mode)
      const quoteUrl = `/api/v1/swap/quote?` + new URLSearchParams({
        inputMint: jupiterInputMint,
        outputMint: jupiterOutputMint,
        amount: amountInSmallestUnit.toString(),
        userPublicKey: publicKey.toString(),
        privacyMode: privacyMode.toString() // Use actual privacyMode prop
      })

      console.log('[useSwap] Fetching quote with URL:', quoteUrl)
      console.log('[useSwap] Privacy mode value:', privacyMode, 'type:', typeof privacyMode)

      const response = await fetch(quoteUrl)

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error')
        console.error('[useSwap] API Error Response:', {
          status: response.status,
          statusText: response.statusText,
          url: quoteUrl,
          errorText
        })

        let errorMessage = `HTTP ${response.status}`
        try {
          const errorData = JSON.parse(errorText)
          errorMessage = errorData.error || errorMessage
        } catch {
          errorMessage = errorText || errorMessage
        }

        throw new Error(errorMessage)
      }

      const data = await response.json()
      console.log('Quote API response:', data)

      if (!data.success || !data.quote) {
        throw new Error(data.error || 'Invalid response from API')
      }

      const jupiterQuote = data.quote

      if (swapMode === 'private') {
        console.log('Using Jupiter quote as estimate for Encifher private swap')
        // Use Jupiter quote as estimate, but mark for private execution
        const privateQuote = {
          ...jupiterQuote,
          privacyMode: true,
          privacySupported: true,
          routing: 'confidential'
        }
        setQuote(privateQuote)

        // Calculate output amount for display
        const outputAmountHuman = parseFloat(jupiterQuote.outAmount) / Math.pow(10, outputToken.decimals || 9)
        setOutputAmount(outputAmountHuman.toFixed(6))
        return
      }

      // Normal mode - use Jupiter quote directly
      const newQuote: SwapQuote = {
        inputMint: jupiterQuote.inputMint,
        outputMint: jupiterQuote.outputMint,
        inputAmount: jupiterQuote.inAmount,
        outputAmount: jupiterQuote.outAmount,
        priceImpactPct: parseFloat(jupiterQuote.priceImpactPct) * 100,
        routePlan: jupiterQuote.routePlan
      }

      setQuote(newQuote)

      // Calculate output amount with fallback decimals
      const outputDecimals = outputToken.decimals || 9
      const output = parseFloat(newQuote.outputAmount) / Math.pow(10, outputDecimals)
      setOutputAmount(output.toFixed(outputDecimals).replace(/\.?0+$/, ''))

    } catch (error) {
      console.error('Error getting quote:', error)

      // Handle rate limit errors more gracefully
      if (error instanceof Error) {
        let errorMessage = error.message
        let shouldRetry = false
        let retryDelay = 3000

        // Check for various rate limit and service unavailable errors
        if (error.message.includes('Rate limit exceeded') ||
            error.message.includes('429') ||
            error.message.includes('Jupiter API returned status 429') ||
            error.message.includes('Swap service is experiencing high demand') ||
            error.message.includes('Private swap service is temporarily unavailable')) {

          errorMessage = error.message.includes('Private swap service')
            ? 'Private swap service is experiencing high demand. Please try again shortly.'
            : 'Swap service is experiencing high demand. Please wait a moment and try again.'

          shouldRetry = true
          retryDelay = 4000 // Longer delay for privacy mode
        }

        setError(errorMessage)

        // Retry logic for rate limiting
        if (shouldRetry && inputAmount && parseFloat(inputAmount) > 0 && inputToken && outputToken && publicKey) {
          setTimeout(() => {
            setError(null)
            getQuote()
          }, retryDelay)
        }
        return
      }

      // For non-rate-limit errors, use the regular error parser
      const parsedError = parseError(error)
      setStructuredError(parsedError)
      setError(parsedError.message)
    } finally {
      setIsLoading(false)
    }
  }, [inputToken, outputToken, inputAmount, publicKey, swapMode])

  const swap = useCallback(async () => {
    if (!inputToken || !outputToken || !inputAmount || !publicKey) {
      const err = new Error('Missing swap parameters')
      const parsedError = parseError(err)
      setStructuredError(parsedError)
      setError(parsedError.message)
      return
    }

    try {
      setIsLoading(true)
      setError(null)
      setStructuredError(null)
      setProgress(null)

      console.log('Executing swap:', {
        inputToken: inputToken.symbol,
        outputToken: outputToken.symbol,
        amount: inputAmount,
        privacyMode: swapMode,
        provider: swapMode === 'private' ? 'Encifher' : 'Jupiter'
      })

      // Private swap mode - use Encifher direct integration
      if (swapMode === SwapMode.PRIVATE) {
        console.log('[Private Swap] Executing private swap with Encifher...')

        // Update progress for private swap
        setProgress({
          status: 'pending' as any,
          message: 'Preparing private swap transaction...',
          currentStep: 0,
          totalSteps: 3
        })

        try {
          // Get the Encifher client - create on-demand if not available
          let encifherClient = encifherClientRef.current
          if (!encifherClient) {
            console.log('[Private Swap] Creating Encifher client on-demand...')
            encifherClient = new EncifherClient(connection)
            encifherClientRef.current = encifherClient
          }

          // Ensure client is initialized
          if (!encifherClient.isReady()) {
            // Try to initialize if not already done
            if (EncifherUtils.isConfigured()) {
              const config = EncifherUtils.getConfig()!
              await encifherClient.initialize(config)
            } else {
              throw new Error('Encifher client not ready - missing configuration')
            }
          }

          // Convert amount to base units
          const amountInBaseUnits = Math.floor(parseFloat(inputAmount) * Math.pow(10, inputToken.decimals))

          console.log('[Private Swap] Swap parameters:', {
            inputToken: inputToken.address,
            outputToken: outputToken.address,
            inputAmount: inputAmount,
            amountInBaseUnits: amountInBaseUnits.toString(),
            decimals: inputToken.decimals
          })

          // Step 1: Deposit tokens into Encifher private pool
          setProgress({
            status: 'pending' as any,
            message: 'Depositing tokens into Encifher privacy pool...',
            currentStep: 1,
            totalSteps: 6
          })

          console.log('[Private Swap] Depositing tokens into private pool...')
          const { transaction: depositTxn } = await encifherClient.privateDeposit({
            token: {
              tokenMintAddress: inputToken.address,
              decimals: inputToken.decimals,
              isConfidentialSupported: inputToken.isConfidentialSupported || false
            },
            userPublicKey: publicKey,
            amount: inputAmount // Use human-readable amount for deposits
          })

          // Sign and send deposit transaction
          if (!signTransaction) {
            throw new Error('Wallet signing function not available')
          }
          const signedDepositTxn = await signTransaction(depositTxn)
          const depositSignature = await connection.sendRawTransaction(signedDepositTxn.serialize(), {
            skipPreflight: false,
            preflightCommitment: 'confirmed'
          })

          console.log('[Private Swap] Deposit transaction sent:', depositSignature)
          await connection.confirmTransaction(depositSignature, 'confirmed')
          console.log('[Private Swap] Deposit confirmed')

          // Step 2: Create private swap transaction using private pool balance
          setProgress({
            status: 'pending' as any,
            message: 'Creating private swap transaction...',
            currentStep: 2,
            totalSteps: 6
          })

          console.log('[Private Swap] About to call createPrivateSwap...')
          const { transaction } = await encifherClient.createPrivateSwap({
            inMint: inputToken.address,
            outMint: outputToken.address,
            amountIn: amountInBaseUnits.toString(),
            senderPubkey: publicKey,
            receiverPubkey: publicKey
          })

          console.log('[Private Swap] Transaction created successfully')
          console.log('[Private Swap] Transaction details:', {
            instructions: transaction.instructions.length,
            feePayer: transaction.feePayer?.toBase58(),
            recentBlockhash: transaction.recentBlockhash
          })

          setProgress({
            status: 'pending' as any,
            message: 'Please sign the swap transaction in your wallet...',
            currentStep: 3,
            totalSteps: 6
          })

          // Sign transaction using wallet adapter
          if (signTransaction) {
            const signedTransaction = await signTransaction(transaction)
            console.log('[Private Swap] Transaction signed, executing through Encifher...')

            setProgress({
              status: 'pending' as any,
              message: 'Executing private swap through Encifher privacy system...',
              currentStep: 4,
              totalSteps: 6
            })

            try {
              // Execute the signed transaction through Encifher's privacy system
              console.log('[Private Swap] Executing through Encifher privacy system...')
              const executeResponse = await encifherClient.executePrivateSwap(
                signedTransaction.serialize().toString('base64'),
                {
                  inMint: inputToken.address,
                  outMint: outputToken.address,
                  amountIn: amountInBaseUnits.toString(),
                  senderPubkey: publicKey,
                  receiverPubkey: publicKey,
                  message: 'WaveSwap private transaction'
                }
              )

              console.log('[Private Swap] Encifher execution response:', executeResponse)

              setProgress({
                status: 'pending' as any,
                message: 'Private swap submitted to privacy network...',
                currentStep: 5,
                totalSteps: 6
              })

              // Poll for order completion
              const orderStatusId = executeResponse.orderStatusIdentifier
              console.log('[Private Swap] Polling for order completion:', orderStatusId)

              let attempts = 0
              const maxAttempts = 30 // 5 minutes with 10-second intervals
              const pollInterval = 10000 // 10 seconds

              const pollOrderStatus = async (): Promise<void> => {
                try {
                  attempts++
                  console.log(`[Private Swap] Checking order status (attempt ${attempts}/${maxAttempts})...`)

                  const status = await encifherClient.getOrderStatus(orderStatusId)
                  console.log('[Private Swap] Order status:', status)

                  if (status.status === 'completed') {
                    console.log('[Private Swap] Private swap completed successfully!')

                    // Step 6: Withdraw swapped tokens back to wallet
                    setProgress({
                      status: 'completed' as any,
                      message: 'Withdrawing swapped tokens to your wallet...',
                      currentStep: 6,
                      totalSteps: 6
                    })

                    try {
                      const { transaction: withdrawTxn } = await encifherClient.privateWithdraw({
                        token: {
                          tokenMintAddress: outputToken.address,
                          decimals: outputToken.decimals,
                          isConfidentialSupported: outputToken.isConfidentialSupported || false
                        },
                        amount: (parseFloat(status.details?.expectedOutAmount || '0') / Math.pow(10, outputToken.decimals)).toFixed(6),
                        userPublicKey: publicKey
                      })

                      // Sign and send withdrawal transaction
                      if (!signTransaction) {
                        throw new Error('Wallet signing function not available')
                      }
                      const signedWithdrawTxn = await signTransaction(withdrawTxn)
                      const withdrawSignature = await connection.sendRawTransaction(signedWithdrawTxn.serialize(), {
                        skipPreflight: false,
                        preflightCommitment: 'confirmed'
                      })

                      console.log('[Private Swap] Withdrawal transaction sent:', withdrawSignature)
                      await connection.confirmTransaction(withdrawSignature, 'confirmed')
                      console.log('[Private Swap] Withdrawal confirmed - tokens are now in your wallet!')

                      setProgress({
                        status: 'completed' as any,
                        message: `Private swap completed! Tokens withdrawn to your wallet.`,
                        currentStep: 6,
                        totalSteps: 6
                      })

                    } catch (withdrawError) {
                      console.warn('[Private Swap] Withdrawal failed (tokens remain in private pool):', withdrawError)
                      setProgress({
                        status: 'completed' as any,
                        message: `Swap completed! Withdrawal failed - tokens remain in private pool.`,
                        currentStep: 6,
                        totalSteps: 6
                      })
                    }

                    // Clear progress after showing completion
                    setTimeout(() => {
                      setProgress(null)
                    }, 5000)
                    return
                  }

                  if (status.status === 'failed') {
                    console.error('[Private Swap] Private swap failed:', status.details)
                    throw new Error(`Private swap failed: ${status.details?.error || 'Unknown error'}`)
                  }

                  // Still pending, continue polling
                  if (attempts < maxAttempts) {
                    setTimeout(pollOrderStatus, pollInterval)
                  } else {
                    throw new Error('Private swap timed out - please check your transaction history')
                  }

                } catch (error) {
                  console.error('[Private Swap] Error polling order status:', error)
                  throw error
                }
              }

              // Start polling after a short delay
              setTimeout(pollOrderStatus, 2000)

            } catch (encifherError) {
              console.error('[Private Swap] Encifher execution failed:', encifherError)

              // Fallback to direct execution if Encifher execution fails
              console.log('[Private Swap] Falling back to direct transaction execution...')
              setProgress({
                status: 'pending' as any,
                message: 'Executing transaction directly...',
                currentStep: 3,
                totalSteps: 3
              })

              const signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
                skipPreflight: false,
                preflightCommitment: 'confirmed'
              })

              console.log('[Private Swap] Fallback transaction sent:', signature)

              await connection.confirmTransaction(signature, 'confirmed')

              console.log('[Private Swap] Fallback transaction confirmed:', signature)

              setProgress({
                status: 'completed' as any,
                message: `Transaction completed! Signature: ${signature.slice(0, 8)}...`,
                currentStep: 3,
                totalSteps: 3
              })

              // Clear progress after showing completion
              setTimeout(() => {
                setProgress(null)
              }, 5000)
            }

          } else {
            throw new Error('Wallet signing function not available')
          }

        } catch (error) {
          console.error('[Private Swap] Error:', error)
          setProgress(null)
          throw error
        }

      } else if (swapServiceRef.current) {
        // Use regular swap service for normal mode
        const request: SwapRequest = {
          inputToken,
          outputToken,
          inputAmount,
          privacyMode: false,
          privacyProvider: undefined
        }

        await swapServiceRef.current.executeSwap(request)
      } else {
        throw new Error('Swap service not available')
      }

    } catch (error) {
      console.error('Error executing swap:', error)
      const parsedError = parseError(error)
      setStructuredError(parsedError)
      setError(parsedError.message)
    } finally {
      setIsLoading(false)
      setProgress(null)
    }
  }, [inputToken, outputToken, inputAmount, swapMode, publicKey])

  // Optimized batch balance fetching
  const fetchMultipleBalances = useCallback(async (tokens: Token[]): Promise<Map<string, string>> => {
    if (!publicKey || !connection || tokens.length === 0) return new Map()

    const balancePromises = tokens.map(async (token) => {
      try {
        const balance = await getTokenBalance(connection, publicKey, token.address)
        return [token.address, balance] as [string, string]
      } catch (error) {
        console.warn(`Failed to fetch balance for ${token.address}:`, error)
        return [token.address, '0'] as [string, string]
      }
    })

    const results = await Promise.allSettled(balancePromises)
    const newBalances = new Map<string, string>()

    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value) {
        const [address, balance] = result.value
        newBalances.set(address, balance)
      }
    })

    return newBalances
  }, [publicKey, connection])

  const refreshBalances = useCallback(async () => {
    if (!publicKey || !connection) {
      setBalances(new Map())
      return
    }

    // Don't clear cache on every refresh - only clear stale entries
    // clearBalanceCache() // Commented out for better performance

    try {
      // Get user's tokens from wallet
      const userTokens = await getUserTokens(connection, publicKey)

      // Update available tokens with user's holdings
      if (userTokens.length > 0) {
        // Merge user tokens with common tokens (prioritize user tokens)
        const tokenMap = new Map<string, Token>()

        // Add user tokens first
        userTokens.forEach(token => tokenMap.set(token.address, token))

        // Add common tokens that aren't already in user's wallet
        COMMON_TOKENS.forEach(token => {
          if (!tokenMap.has(token.address)) {
            tokenMap.set(token.address, token)
          }
        })

        const mergedTokens = Array.from(tokenMap.values())

        // Enrich tokens with icons from Jupiter API
        const enrichedTokens = await enrichTokenIcons(mergedTokens)
        setAvailableTokens(enrichedTokens)
      }

      // Batch fetch balances for currently selected tokens only (faster)
      const tokensToCheck = [inputToken, outputToken].filter((token): token is Token => token !== null)

      if (tokensToCheck.length > 0) {
        const newBalances = await fetchMultipleBalances(tokensToCheck)
        setBalances(prev => {
          // Merge with existing balances to preserve other cached balances
          const merged = new Map(prev)
          newBalances.forEach((balance, address) => {
            merged.set(address, balance)
          })
          return merged
        })
      }
    } catch (error) {
      console.error('Error refreshing balances:', error)
      setBalances(new Map())
    }
  }, [publicKey, connection, inputToken, outputToken])

  const clearQuote = useCallback(() => {
    setQuote(null)
    setOutputAmount('')
  }, [])

  const clearError = useCallback(() => {
    setError(null)
    setStructuredError(null)
  }, [])

  const cancelSwap = useCallback(() => {
    if (swapServiceRef.current) {
      swapServiceRef.current.cancelSwap()
    }
    setIsLoading(false)
    setProgress(null)
  }, [])

  // Auto-fetch quote when amount changes (with debounce)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputAmount && parseFloat(inputAmount) > 0 && inputToken && outputToken && publicKey) {
        getQuote()
      }
    }, 1500) // Increased from 800ms to 1.5s to avoid rate limiting

    return () => clearTimeout(timer)
  }, [inputAmount, inputToken, outputToken, publicKey, getQuote])

  return {
    // State
    inputToken,
    outputToken,
    inputAmount,
    outputAmount,
    swapMode,
    quote,
    balances,
    isLoading,
    error,
    structuredError,
    progress,
    availableTokens,

    // Actions
    setInputToken: handleSetInputToken,
    setOutputToken: handleSetOutputToken,
    setInputAmount: handleSetInputAmount,
    setOutputAmount: handleSetOutputAmount,
    setSwapMode: handleSetSwapMode,
    swap,
    getQuote,
    refreshBalances,
    clearQuote,
    clearError,
    cancelSwap
  }
}

// Re-export utilities for easy access
export const SwapUtils = {
  /**
   * Check if tokens can be swapped in privacy mode
   */
  canSwapPrivately: (inputToken: Token, outputToken: Token): boolean => {
    return inputToken.isConfidentialSupported && outputToken.isConfidentialSupported
  },

  /**
   * Filter tokens by privacy support
   */
  filterByPrivacySupport: (tokens: Token[], privacyMode: boolean): Token[] => {
    if (!privacyMode) return tokens
    return tokens.filter(token => token.isConfidentialSupported)
  },

  /**
   * Calculate expected output amount
   */
  calculateExpectedOutput: (quote: SwapQuote, decimals: number): string => {
    const output = parseFloat(quote.outputAmount) / Math.pow(10, decimals)
    return output.toFixed(Math.max(0, 6 - decimals)).replace(/\.?0+$/, '')
  },

  /**
   * Calculate minimum output with slippage
   */
  calculateMinimumOutput: (quote: SwapQuote, decimals: number): string => {
    const output = parseFloat(quote.outputAmount) / Math.pow(10, decimals)
    const slippageFactor = (10000 - 50) / 10000 // 50 bps default slippage
    const minimumOutput = output * slippageFactor
    return minimumOutput.toFixed(Math.max(0, 6 - decimals)).replace(/\.?0+$/, '')
  }
}