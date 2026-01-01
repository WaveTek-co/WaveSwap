'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useWallet, useConnection } from '@/hooks/useWalletAdapter'
import { Connection, PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token'
import { ArrowsUpDownIcon, ExclamationTriangleIcon, ArrowDownTrayIcon, WalletIcon, LockClosedIcon } from '@heroicons/react/24/outline'
import { TokenSelector } from './TokenSelector'
import { AmountInput } from './AmountInput'
import { SwapButton } from './SwapButton'
import { WithdrawConfirmModal, WithdrawSuccessModal, WithdrawErrorModal } from '@/components/ui/Modal'
import { MaintenanceModal } from '@/components/ui/MaintenanceModal'
import { useSwap } from '@/hooks/useSwap'
import { config } from '@/lib/config'
import { Token, SwapStatus } from '@/types/token'
import { useThemeConfig, createGlassStyles } from '@/lib/theme'
import { EncifherClient, EncifherUtils } from '@/lib/encifher'
import { formatTokenAmount } from '@/lib/token-formatting'
import { clearBalanceCache } from '@/lib/tokens'

interface SwapComponentProps {
  privacyMode: boolean
}

export function SwapComponent({ privacyMode }: SwapComponentProps) {
  const { publicKey, signMessage } = useWallet()
  const { connection } = useConnection()
  const theme = useThemeConfig()
  const [activeTab, setActiveTab] = useState<'swap' | 'withdraw'>('swap')

  // Withdrawal modal states
  const [showWithdrawConfirmModal, setShowWithdrawConfirmModal] = useState(false)
  const [showWithdrawSuccessModal, setShowWithdrawSuccessModal] = useState(false)
  const [showWithdrawErrorModal, setShowWithdrawErrorModal] = useState(false)
  const [pendingWithdrawal, setPendingWithdrawal] = useState<{
    tokenAddress: string
    amount: number
    symbol: string
  } | null>(null)
  const [withdrawalError, setWithdrawalError] = useState<string>('')
  const [withdrawalTransactionSignature, setWithdrawalTransactionSignature] = useState<string>('')
  const [isWithdrawing, setIsWithdrawing] = useState(false)

  // Maintenance modal state
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false)

  // Withdrawal input amounts for each token
  const [withdrawalAmounts, setWithdrawalAmounts] = useState<{ [key: string]: string }>({})
  const [apiConfidentialBalances, setApiConfidentialBalances] = useState<any[]>([])
  const [isLoadingConfidentialBalances, setIsLoadingConfidentialBalances] = useState(false)

  // Check if swap is in maintenance mode
  const checkMaintenanceMode = useCallback(() => {
    if (config.swap.maintenanceMode) {
      setShowMaintenanceModal(true)
      return true
    }
    return false
  }, [])

  // API function to fetch confidential balances
  const fetchConfidentialBalances = useCallback(async () => {
    if (!publicKey) return

    setIsLoadingConfidentialBalances(true)
    try {
      console.log('[SwapComponent] Fetching confidential balances from API for user:', publicKey.toString())

      const response = await fetch(`/api/v1/confidential/balances?userPublicKey=${publicKey.toString()}`)

      if (response.ok) {
        const data = await response.json()
        console.log('[SwapComponent] Successfully fetched confidential balances:', data)
        setApiConfidentialBalances(data.confidentialBalances || [])
      } else if (response.status === 401) {
        console.log('[SwapComponent] Authentication required for confidential balances')
        setApiConfidentialBalances([])
      } else {
        console.error('[SwapComponent] Failed to fetch confidential balances:', response.status, response.statusText)
        setApiConfidentialBalances([])
      }
    } catch (error) {
      console.error('[SwapComponent] Error fetching confidential balances:', error)
      setApiConfidentialBalances([])
    } finally {
      setIsLoadingConfidentialBalances(false)
    }
  }, [publicKey])

  // Clear balance cache when privacy mode changes to prevent stale data
  useEffect(() => {
    console.log('[SwapComponent] Privacy mode changed to:', privacyMode)
    clearBalanceCache()

    // Fetch confidential balances from API when privacy mode is enabled and user is connected
    if (privacyMode && publicKey) {
      fetchConfidentialBalances()
    } else {
      setApiConfidentialBalances([])
    }
  }, [privacyMode, publicKey, fetchConfidentialBalances])

  // API function to fetch authenticated confidential balances using Encifher SDK
  const fetchAuthenticatedBalances = async () => {
    if (!publicKey || !signMessage) {
      console.error('[SwapComponent] Wallet not connected or signing not available')
      alert('Please connect your wallet and ensure it supports message signing.')
      return
    }

    setIsLoadingConfidentialBalances(true)
    try {
      console.log('[SwapComponent] Initiating authenticated balance fetch for user:', publicKey.toString())

      // Use existing connection from wallet adapter

      const encifherConfig = EncifherUtils.getConfig()
      if (!encifherConfig) {
        throw new Error('Encifher SDK configuration not found')
      }

      const encifherClient = new EncifherClient(connection, encifherConfig)

      // Check if client is ready
      if (!encifherClient.isReady()) {
        await encifherClient.initialize(encifherConfig)
      }

      console.log('[SwapComponent] Encifher client initialized, requesting message to sign...')

      // Step 1: Get message to sign from Encifher SDK
      const msgPayload = await (encifherClient as any).client.getMessageToSign()
      console.log('[SwapComponent] Received message to sign:', msgPayload)

      // Step 2: Sign the message with user's wallet
      const messageBytes = new TextEncoder().encode(msgPayload.msgHash)
      const signatureResult = await signMessage(messageBytes)

      console.log('[SwapComponent] Signature result type:', typeof signatureResult)
      console.log('[SwapComponent] Signature result:', signatureResult)

      let signatureArray: Uint8Array

      // Handle different wallet adapter signature formats
      if (signatureResult instanceof Uint8Array) {
        signatureArray = signatureResult
      } else if (Array.isArray(signatureResult)) {
        signatureArray = new Uint8Array(signatureResult)
      } else if (typeof signatureResult === 'string') {
        // If it's already a base64 string or hex string, convert it
        try {
          // Try base64 first
          const decoded = Buffer.from(signatureResult, 'base64')
          signatureArray = new Uint8Array(decoded)
        } catch {
          // Try hex
          const hexString = (signatureResult as string).replace('0x', '')
          const decoded = Buffer.from(hexString, 'hex')
          signatureArray = new Uint8Array(decoded)
        }
      } else if (signatureResult && typeof signatureResult === 'object') {
        // Some adapters return an object with signature property
        const signatureObj = signatureResult as any
        if (signatureObj.signature) {
          signatureArray = new Uint8Array(signatureObj.signature)
        } else {
          throw new Error(`Unknown signature format: ${JSON.stringify(signatureResult)}`)
        }
      } else {
        throw new Error(`Unsupported signature type: ${typeof signatureResult}`)
      }

      const signature = Buffer.from(signatureArray).toString('base64')

      console.log('[SwapComponent] User signed message successfully')

      // Step 3: Get ONLY user's actual deposited tokens from Encifher - NO HARDCODING!
      console.log('[SwapComponent] Getting user deposited tokens from Encifher...')

      let finalTokenMints: string[] = []

      try {
        const userTokensResponse = await (encifherClient as any).client.getUserTokenMints(
          publicKey,
          { signature, ...msgPayload },
          encifherConfig.encifherKey
        )

        console.log('[SwapComponent] ✅ getUserTokenMints SUCCESS!')
        console.log('[SwapComponent] Raw response:', userTokensResponse)
        console.log('[SwapComponent] Response type:', typeof userTokensResponse)

        // Extract token addresses - handle ALL possible response formats
        if (Array.isArray(userTokensResponse)) {
          console.log('[SwapComponent] Response is array with', userTokensResponse.length, 'items')
          finalTokenMints = userTokensResponse.map((token, index) => {
            console.log(`[SwapComponent] Processing token ${index}:`, token, typeof token)

            if (typeof token === 'string') {
              return token
            } else if (token && typeof token === 'object') {
              // Try all possible property names
              const address = token.address || token.mint || token.tokenAddress || token.tokenMint
              if (address && typeof address === 'string') {
                return address
              }
              console.warn('[SwapComponent] Token object missing address property:', token)
              return token.toString()
            } else {
              console.warn('[SwapComponent] Unexpected token format:', token)
              return String(token)
            }
          })
        } else if (userTokensResponse && typeof userTokensResponse === 'object') {
          console.log('[SwapComponent] Response is object, looking for tokens array...')
          finalTokenMints = userTokensResponse.tokens || userTokensResponse.mints || userTokensResponse.data || []
        }

        console.log(`[SwapComponent] 🎉 FINAL: Found ${finalTokenMints.length} user-deposited tokens!`)
        console.log('[SwapComponent] Token addresses:', finalTokenMints)

      } catch (tokenMintsError) {
        console.error('[SwapComponent] ❌ getUserTokenMints FAILED:', tokenMintsError)
        throw new Error(`Failed to get user tokens: ${tokenMintsError instanceof Error ? tokenMintsError.message : String(tokenMintsError)}`)
      }

      // If no tokens found, don't proceed - user needs to deposit first
      if (finalTokenMints.length === 0) {
        console.log('[SwapComponent] No tokens found - user has not deposited anything to Encifher yet')
        setApiConfidentialBalances([])
        alert('✅ Authentication successful! No tokens found in your Encifher account. Deposit some tokens first to see balances.')
        return
      }

      console.log(`[SwapComponent] Final token list for balance checking (${finalTokenMints.length} tokens):`, finalTokenMints.slice(0, 20))

      // Step 5: Get authenticated balances for user's actual tokens
      const authenticatedBalance = await (encifherClient as any).client.getBalance(
        publicKey,
        { signature, ...msgPayload },
        finalTokenMints,
        encifherConfig.encifherKey
      )

      console.log('[SwapComponent] Successfully fetched authenticated balance:', authenticatedBalance)
      console.log('[SwapComponent] Balance response type:', typeof authenticatedBalance)
      console.log('[SwapComponent] Balance response isArray:', Array.isArray(authenticatedBalance))

      if (Array.isArray(authenticatedBalance)) {
        console.log('[SwapComponent] Balance array length:', authenticatedBalance.length)

        // Debug each balance object completely (handle BigInt)
        authenticatedBalance.forEach((balance, index) => {
          console.log(`[SwapComponent] 🔍 Balance[${index}] COMPLETE DEBUG:`)
          console.log('  - Raw object:', balance)
          console.log('  - Object keys:', Object.keys(balance))

          // Handle BigInt serialization
          const balanceForStringify = { ...balance }
          Object.keys(balanceForStringify).forEach(key => {
            if (typeof balanceForStringify[key] === 'bigint') {
              balanceForStringify[key] = balanceForStringify[key].toString()
            }
          })

          try {
            console.log('  - Stringified:', JSON.stringify(balanceForStringify, null, 2))
          } catch (stringifyError) {
            console.log('  - Stringify error:', stringifyError instanceof Error ? stringifyError.message : String(stringifyError))
            console.log('  - Balance object keys:', Object.keys(balance))
          }

          // Check all possible amount fields
          console.log('  - amount:', balance.amount, typeof balance.amount)
          console.log('  - balanceAmount:', balance.balanceAmount, typeof balance.balanceAmount)
          console.log('  - value:', balance.value, typeof balance.value)
          console.log('  - quantity:', balance.quantity, typeof balance.quantity)
          console.log('  - tokenAmount:', balance.tokenAmount, typeof balance.tokenAmount)

          // Check for actual values (convert BigInt to string)
          if (balance.amount && typeof balance.amount === 'bigint') {
            console.log('  - ✅ Found BigInt amount:', balance.amount.toString())
          }
          if (balance.balanceAmount && typeof balance.balanceAmount === 'bigint') {
            console.log('  - ✅ Found BigInt balanceAmount:', balance.balanceAmount.toString())
          }

          // Check token info fields
          console.log('  - tokenSymbol:', balance.tokenSymbol)
          console.log('  - symbol:', balance.symbol)
          console.log('  - token:', balance.token)

          // Check visibility
          console.log('  - isVisible:', balance.isVisible)
          console.log('  - visible:', balance.visible)
        })
      }

      // Update the API confidential balances with real authenticated data
      if (authenticatedBalance && Array.isArray(authenticatedBalance)) {
        // Create a map of token addresses to token metadata for lookup (minimal to avoid rate limiting)
        let tokenMetadataMap = new Map<string, any>()

        // Basic token metadata for common tokens only
        const basicTokenMetadata = {
          'So11111111111111111111111111111111111111112': { symbol: 'SOL', name: 'Solana', decimals: 9 },
          'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
          'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': { symbol: 'USDT', name: 'Tether USD', decimals: 6 },
        }

        tokenMetadataMap = new Map(Object.entries(basicTokenMetadata))

        // Debug token mapping
        console.log('[SwapComponent] Token mapping debug:')
        console.log('[SwapComponent] Total finalTokenMints requested:', finalTokenMints.length)
        console.log('[SwapComponent] Total balances received:', authenticatedBalance.length)

        // Check for mapping issues
        if (authenticatedBalance.length !== finalTokenMints.length) {
          console.warn('[SwapComponent] MISMATCH: balances length != finalTokenMints length!')
          console.warn('[SwapComponent] This could indicate API response format issues')
        }

        // Debug filtering logic - show all balances first, then filter
        console.log('[SwapComponent] Analyzing balances before filtering:')
        authenticatedBalance.forEach((balance: any, index: number) => {
          const tokenAddress = finalTokenMints[index] || 'unknown'

          // Handle the actual balance format: { "tokenAddress": "amount" }
          let amount: string | number | bigint | unknown = '0'
          if (balance && typeof balance === 'object') {
            // Extract amount from the balance object using token address as key
            if (tokenAddress in balance) {
              amount = balance[tokenAddress]
            } else {
              // Fallback: try common amount fields
              amount = balance.amount || balance.balanceAmount || balance.value || balance.quantity || '0'
            }
          } else {
            // Fallback for other formats
            amount = balance?.amount || balance?.balanceAmount || balance?.value || balance?.quantity || '0'
          }

          // Ensure amount is a string for consistent handling
          if (typeof amount === 'bigint') {
            amount = amount.toString()
          } else if (typeof amount === 'number') {
            amount = amount.toString()
          } else if (typeof amount === 'string') {
            // Keep amount as string if it's already a string
          } else {
            amount = String(amount || '0')
          }

          // At this point, amount should be a string
          const amountAsString = String(amount || '0')
          const parsedAmount = parseFloat(amountAsString)
          const hasBalance = amountAsString && amountAsString !== '0' && parsedAmount > 0

          console.log(`[SwapComponent] Token ${index} (${tokenAddress}):`, {
            balanceObject: balance,
            rawAmount: amount,
            parsedAmount,
            hasBalance,
            isVisible: balance.isVisible,
            wouldBeFiltered: !hasBalance,
            amountType: typeof amount,
            tokenAddressInBalance: tokenAddress in balance
          })
        })

        // Filter out tokens with zero balances and map to proper token info
        const updatedBalances = authenticatedBalance
          .filter((balance: any, index: number) => {
            const tokenAddress = finalTokenMints[index]

            // Handle the actual balance format: { "tokenAddress": "amount" }
            let amount: string | number | bigint | unknown = '0'
            if (balance && typeof balance === 'object') {
              // Extract amount from the balance object using token address as key
              if (tokenAddress && tokenAddress in balance) {
                amount = balance[tokenAddress]
              } else {
                // Fallback: try common amount fields
                amount = balance.amount || balance.balanceAmount || balance.value || balance.quantity || '0'
              }
            } else {
              // Fallback for other formats
              amount = balance?.amount || balance?.balanceAmount || balance?.value || balance?.quantity || '0'
            }

            if (typeof amount === 'bigint') {
              amount = amount.toString()
            }

            const amountAsString = String(amount || '0')
            const parsedAmount = parseFloat(amountAsString)
            const hasBalance = amountAsString && amountAsString !== '0' && parsedAmount > 0

            console.log(`[SwapComponent] Token ${index} (${tokenAddress}) filter check:`, {
              balanceObject: balance,
              rawAmount: amount,
              parsedAmount,
              hasBalance,
              amountType: typeof amount,
              tokenAddressInBalance: tokenAddress in (balance || {}),
              finalDecision: hasBalance ? 'KEEP' : 'FILTER OUT'
            })

            if (!hasBalance) {
              console.log(`[SwapComponent] Filtering out token ${tokenAddress} - zero balance`)
              return false
            }

            return hasBalance
          })
          .map((balance: any, index: number) => {
            const tokenAddress = finalTokenMints[index] || balance.tokenAddress
            const metadata = tokenMetadataMap.get(tokenAddress)

            // Handle the actual balance format: { "tokenAddress": "amount" }
            let amount: string | number | bigint | unknown = '0'
            if (balance && typeof balance === 'object') {
              // Extract amount from the balance object using token address as key
              if (tokenAddress && tokenAddress in balance) {
                amount = balance[tokenAddress]
              } else {
                // Fallback: try common amount fields
                amount = balance.amount || balance.balanceAmount || balance.value || balance.quantity || '0'
              }
            } else {
              // Fallback for other formats
              amount = balance?.amount || balance?.balanceAmount || balance?.value || balance?.quantity || '0'
            }

            const finalAmount = String(amount || '0')

            return {
              tokenAddress,
              tokenSymbol: metadata ? `c${metadata.symbol}` : balance.tokenSymbol || `cToken${index}`,
              tokenName: metadata ? `Confidential ${metadata.name}` : balance.tokenName || 'Confidential Token',
              decimals: metadata?.decimals || balance.decimals || 9,
              amount: finalAmount,
              isVisible: balance.isVisible !== false,
              lastUpdated: new Date().toISOString(),
              source: 'authenticated',
              requiresAuth: false,
              note: 'Balance successfully authenticated and loaded',
              logoURI: metadata?.logoURI
            }
          })

        // Sort by balance value (descending) for better UX
        updatedBalances.sort((a: any, b: any) => {
          const aValue = parseFloat(a.amount) / Math.pow(10, a.decimals)
          const bValue = parseFloat(b.amount) / Math.pow(10, b.decimals)
          return bValue - aValue
        })

        setApiConfidentialBalances(updatedBalances)

        console.log('[SwapComponent] Successfully updated authenticated balances in UI:', {
          totalTokens: updatedBalances.length,
          tokens: updatedBalances.map(b => `${b.tokenSymbol}: ${b.amount}`)
        })

        // Show success message with count of tokens found
        const tokenCount = updatedBalances.length
        if (tokenCount > 0) {
          alert(`✅ Authentication successful!\n\n🔍 Found ${tokenCount} confidential token${tokenCount > 1 ? 's' : ''} in your account:\n${updatedBalances.slice(0, 5).map(b => `• ${b.tokenSymbol}: ${b.amount}`).join('\n')}${tokenCount > 5 ? `\n... and ${tokenCount - 5} more` : ''}`)
        } else {
          alert('✅ Authentication successful! No confidential tokens found in your account. Try depositing some tokens first.')
        }
      } else {
        console.log('[SwapComponent] No authenticated balance data received')
        setApiConfidentialBalances([])
        alert('Authentication successful, but no confidential balances found.')
      }

    } catch (error) {
      console.error('[SwapComponent] Error in authentication process:', error)

      // Provide more specific error messages
      if (error instanceof Error) {
        if (error.message.includes('sign')) {
          alert('Wallet signature was cancelled or failed. Please try again.')
        } else if (error.message.includes('network') || error.message.includes('connection')) {
          alert('Network error. Please check your connection and try again.')
        } else {
          alert(`Authentication error: ${error.message}`)
        }
      } else {
        alert('Error during authentication. Please try again.')
      }
    } finally {
      setIsLoadingConfidentialBalances(false)
    }
  }

  const {
    inputToken,
    outputToken,
    inputAmount,
    outputAmount,
    quote,
    balances,
    isLoading,
    error,
    progress,
    availableTokens,
    setInputToken,
    setOutputToken,
    setInputAmount,
    swap,
      refreshBalances,
    clearQuote,
    clearError,
    cancelSwap,
    withdrawConfidentialTokens,
    recoverTransaction
  } = useSwap(privacyMode, publicKey)

// Add direct balance fetching as a backup when useSwap hook might not be working
  const [localBalances, setLocalBalances] = useState<Map<string, string>>(new Map())
  const [balanceUpdateTrigger, setBalanceUpdateTrigger] = useState(0)

  

  // Handle input amount change
  const handleInputChange = (amount: string) => {
    // Check maintenance mode when user tries to interact with swap
    if (amount && amount !== '0' && parseFloat(amount) > 0) {
      if (checkMaintenanceMode()) {
        return // Don't proceed if in maintenance mode
      }
    }
    setInputAmount(amount)
  }

  // Enhanced token list for selector
  const optimizedTokens = useMemo(() => {
    if (!availableTokens || availableTokens.length === 0) return []

    const hasTokenBalance = (tokenAddress: string): boolean => {
      if (!balances) return false
      const balance = balances.get(tokenAddress)
      return balance !== undefined && parseFloat(balance) > 0
    }

    const userTokens = availableTokens.filter(token => hasTokenBalance(token.address))
    const popularTokens = availableTokens.filter(token => {
      const hasBalance = hasTokenBalance(token.address)
      const isPopular = !hasBalance && (
        token.tags?.includes('popular') ||
        ['WAVE', 'SOL', 'USDC', 'USDT', 'ZEC', 'PUMP', 'WEALTH', 'FTP', 'AURA', 'MEW', 'STORE'].includes(token.symbol || '')
      )
      return isPopular
    })

    const otherTokens = availableTokens
      .filter(token => {
        const hasBalance = hasTokenBalance(token.address)
        const isPopular = token.tags?.includes('popular') ||
                        ['WAVE', 'SOL', 'USDC', 'USDT', 'ZEC', 'PUMP', 'WEALTH', 'FTP', 'AURA', 'MEW', 'STORE'].includes(token.symbol || '')
        return !hasBalance && !isPopular
      })
      .slice(0, 20)

    return [...userTokens, ...popularTokens, ...otherTokens]
  }, [availableTokens, balances])

  const safeInputToken = inputToken || availableTokens[1] || availableTokens[0] || null
  const safeOutputToken = outputToken || availableTokens[0] || availableTokens[1] || null

  // Handle token switch
  const handleTokenSwitch = () => {
    if (safeInputToken && safeOutputToken) {
      setInputToken(safeOutputToken)
      setOutputToken(safeInputToken)
      setInputAmount('')
      clearQuote()
    }
  }

  // Handle token changes
  const handleInputTokenChange = (token: Token) => {
    setInputToken(token)
    if (safeOutputToken && token.address === safeOutputToken.address) {
      const availableForOutput = availableTokens.filter(t => t.address !== token.address)
      if (availableForOutput.length > 0 && availableForOutput[0]) {
        setOutputToken(availableForOutput[0])
      }
    }
    setInputAmount('')
    clearQuote()
  }

  const handleOutputTokenChange = (token: Token) => {
    setOutputToken(token)
    if (safeInputToken && token.address === safeInputToken.address) {
      const availableForInput = availableTokens.filter(t => t.address !== token.address)
      if (availableForInput.length > 0 && availableForInput[0]) {
        setInputToken(availableForInput[0])
      }
    }
    setInputAmount('')
    clearQuote()
  }

  // Handle swap execution
  const handleSwap = async () => {
    // Check maintenance mode before attempting swap
    if (checkMaintenanceMode()) {
      return // Don't proceed if in maintenance mode
    }

    try {
      await swap()
    } catch (error) {
      // Error is already handled by useSwap hook
    }
  }

  // Handle withdrawal amount change
  const handleWithdrawalAmountChange = (tokenAddress: string, amount: string) => {
    setWithdrawalAmounts(prev => ({ ...prev, [tokenAddress]: amount }))
  }

  // Handle withdrawal confirmation
  const handleWithdrawClick = (tokenAddress: string, maxAmount: number, symbol: string) => {
    const inputAmount = withdrawalAmounts[tokenAddress] || maxAmount.toString()
    const amount = parseFloat(inputAmount)

    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid withdrawal amount')
      return
    }

    if (amount > maxAmount) {
      alert(`Amount exceeds available balance of ${maxAmount} ${symbol}`)
      return
    }

    setPendingWithdrawal({ tokenAddress, amount, symbol })
    setWithdrawalError('')
    setShowWithdrawConfirmModal(true)
  }

  // Handle withdrawal execution
  const handleWithdrawConfirm = async () => {
    if (!withdrawConfidentialTokens || !pendingWithdrawal || !publicKey) return

    setIsWithdrawing(true)
    setWithdrawalError('')

    try {
      // Call the withdrawal API and get the real transaction signature
      const withdrawalResponse = await withdrawConfidentialTokens(pendingWithdrawal.tokenAddress, pendingWithdrawal.amount)

      // Use the real transaction signature from the API response
      const realSignature = withdrawalResponse?.signature
      if (realSignature) {
        setWithdrawalTransactionSignature(realSignature)
        console.log('[Withdrawal] Real transaction signature:', realSignature)
      } else {
        console.warn('[Withdrawal] No signature found in withdrawal response:', withdrawalResponse)
        // Fallback to a more descriptive placeholder
        setWithdrawalTransactionSignature(`withdrawal_${Date.now()}`)
      }

      setShowWithdrawConfirmModal(false)
      setShowWithdrawSuccessModal(true)

      setTimeout(() => {
        refreshBalances()
        // Also refresh confidential balances from API
        fetchConfidentialBalances()
      }, 2000)
    } catch (error: any) {
      console.error('[Withdrawal] Error:', error)
      setWithdrawalError(error.message || 'Failed to process withdrawal')
      setShowWithdrawConfirmModal(false)
      setShowWithdrawErrorModal(true)
    } finally {
      setIsWithdrawing(false)
    }
  }

  // Handle withdrawal retry
  const handleWithdrawRetry = () => {
    setShowWithdrawErrorModal(false)
    if (pendingWithdrawal) {
      setShowWithdrawConfirmModal(true)
    }
  }

  
  
  // Reset modal states
  const resetModalStates = () => {
    setShowWithdrawConfirmModal(false)
    setShowWithdrawSuccessModal(false)
    setShowWithdrawErrorModal(false)
    setPendingWithdrawal(null)
    setWithdrawalError('')
    setWithdrawalTransactionSignature('')
    setIsWithdrawing(false)
    // Refresh confidential balances when closing modals
    fetchConfidentialBalances()
  }

  // Confidential token balances for withdraw tab - fetched from API
  const confidentialBalances = useMemo(() => {
    if (!privacyMode || !availableTokens || !publicKey) return []

    // Use API-fetched confidential balances
    return apiConfidentialBalances
      .filter((apiBalance: any) => {
        // Only include tokens that can actually be withdrawn (positive balance and doesn't require authentication)
        // Authentication-required tokens will be handled in the empty state UI, not in the withdrawal list
        const amount = parseFloat(apiBalance.amount) || 0
        console.log(`[SwapComponent] Filtering balance for display: ${apiBalance.tokenSymbol || apiBalance.tokenAddress}`, {
          amount: apiBalance.amount,
          parsedAmount: amount,
          requiresAuth: apiBalance.requiresAuth,
          willShow: amount > 0 && apiBalance.requiresAuth !== true
        })
        return amount > 0 && apiBalance.requiresAuth !== true
      })
      .map((apiBalance: any) => {
        const token = availableTokens.find(t => t.address === apiBalance.tokenAddress)
        if (!token) return null

        return {
          tokenAddress: apiBalance.tokenAddress,
          symbol: apiBalance.symbol || `c${token.symbol}`,
          name: apiBalance.name || `Confidential ${token.name || token.symbol}`,
          decimals: apiBalance.decimals || token.decimals || 9,
          amount: apiBalance.amount,
          usdValue: apiBalance.usdValue || 0, // Will be calculated later if needed
          canWithdraw: apiBalance.canWithdraw !== false, // Default to true
          logoURI: apiBalance.logoURI || token.logoURI,
          isEstimatedBalance: false, // This is actual API data
          lastUpdated: apiBalance.lastUpdated,
          requiresAuth: apiBalance.requiresAuth || false // Pass through authentication requirement
        }
      })
      .filter((balance): balance is NonNullable<typeof balance> => balance !== null) // Remove null entries with type guard
  }, [privacyMode, availableTokens, publicKey, apiConfidentialBalances])

  // Get balances with debugging and force re-render
  const inputBalance = safeInputToken?.address ? (balances.get(safeInputToken.address) || '0') : '0'
  const outputBalance = safeOutputToken?.address ? (balances.get(safeOutputToken.address) || '0') : '0'

  // Debug: Log balance state changes
  useEffect(() => {
    if (publicKey && safeInputToken) {
      console.log(`[Balance State] Wallet: ${publicKey.toString().slice(0, 8)}...`)
      console.log(`[Balance State] Token: ${safeInputToken.symbol} (${safeInputToken.address})`)
      console.log(`[Balance State] Raw balance from useSwap: "${inputBalance}"`)
      console.log(`[Balance State] Total balances in Map: ${balances.size}`)
      if (balances.size > 0) {
        console.log(`[Balance State] All balances:`, Array.from(balances.entries()))
      }
    }
  }, [publicKey, safeInputToken, inputBalance, balances.size])

  // Debug logging and force re-render for positive balances
  useEffect(() => {
    if (safeInputToken) {
      // Show the actual balance being displayed (from local fallback if needed)
      const actualBalance = inputBalance === '0' && localBalances.has(safeInputToken.address)
        ? localBalances.get(safeInputToken.address)!
        : inputBalance

      const lamports = parseFloat(actualBalance)
      const humanReadable = lamports / Math.pow(10, safeInputToken.decimals || 9)
      const source = actualBalance === inputBalance ? "useSwap hook" : "local fallback"

      console.log(`[Balance Debug] ${safeInputToken.symbol}: ${actualBalance} lamports (${humanReadable} ${safeInputToken.symbol}) [source: ${source}]`)

      // Force a re-render if we detect a positive balance but UI might be showing 0
      if (lamports > 0 && balanceUpdateTrigger === 0) {
        console.log(`[Balance Debug] ✅ Positive balance detected: ${humanReadable} ${safeInputToken.symbol}`)
        console.log(`[Balance Debug] Triggering re-render to update UI`)
        // Force re-render to ensure UI updates (only once)
        setBalanceUpdateTrigger(1)
      }
    }
  }, [inputBalance, safeInputToken, balances.size, balanceUpdateTrigger, localBalances])

  // Memoize formatted balances to prevent unnecessary recalculations
  const inputBalanceFormatted = useMemo(() => {
    if (!safeInputToken) return '0'

    console.log(`[Balance Debug] inputBalance: ${inputBalance}, localBalances.has(${safeInputToken.address}): ${localBalances.has(safeInputToken.address)}, localBalances.size: ${localBalances.size}`)

    // Use local balance as fallback if main balance is 0
    const balanceToUse = inputBalance === '0' && localBalances.has(safeInputToken.address)
      ? localBalances.get(safeInputToken.address)!
      : inputBalance

    console.log(`[Balance Debug] Using balance: ${balanceToUse} (source: ${balanceToUse === inputBalance ? 'useSwap hook' : 'local fallback'})`)

    try {
      const lamports = parseFloat(balanceToUse)
      const decimals = safeInputToken.decimals || 9
      const humanReadable = lamports / Math.pow(10, decimals)

      if (humanReadable > 0) {
        const source = balanceToUse === inputBalance ? "useSwap" : "local"
        console.log(`[Balance Debug] Formatting input balance (${source}): ${lamports} → ${humanReadable}`)
      }

      const formatted = formatTokenAmount(humanReadable, decimals)

      // Ensure we never return '0' when we have a positive balance
      if (lamports > 0 && formatted === '0') {
        console.warn(`[Balance Debug] ⚠️ Formatted as 0 but lamports > 0. Fallback to raw display: ${humanReadable}`)
        return humanReadable.toString()
      }

      console.log(`[Balance Debug] ✅ FINAL inputBalanceFormatted result: ${formatted}`)
      return formatted
    } catch (error) {
      console.error('[Balance Debug] Error formatting input balance:', error, balanceToUse)
      // Fallback to direct conversion if formatting fails
      try {
        const lamports = parseFloat(balanceToUse)
        const decimals = safeInputToken.decimals || 9
        const fallback = (lamports / Math.pow(10, decimals)).toString()
        console.log(`[Balance Debug] ✅ FINAL inputBalanceFormatted fallback: ${fallback}`)
        return fallback
      } catch {
        console.log(`[Balance Debug] ❌ FINAL inputBalanceFormatted: '0' (all failed)`)
        return '0'
      }
    }
  }, [inputBalance, safeInputToken, balanceUpdateTrigger, localBalances])

  const outputBalanceFormatted = useMemo(() => {
    if (!safeOutputToken) return '0'

    try {
      const lamports = parseFloat(outputBalance)
      const decimals = safeOutputToken.decimals || 9
      const humanReadable = lamports / Math.pow(10, decimals)
      const formatted = formatTokenAmount(humanReadable, decimals)

      if (lamports > 0 && formatted === '0') {
        console.warn(`[Balance Debug] ⚠️ Output balance formatted as 0 but lamports > 0: ${humanReadable}`)
        return humanReadable.toString()
      }

      return formatted
    } catch (error) {
      console.error('[Balance Debug] Error formatting output balance:', error, outputBalance)
      try {
        const lamports = parseFloat(outputBalance)
        const decimals = safeOutputToken.decimals || 9
        return (lamports / Math.pow(10, decimals)).toString()
      } catch {
        return '0'
      }
    }
  }, [outputBalance, safeOutputToken, balanceUpdateTrigger])

  const hasInsufficientBalance = safeInputToken && inputAmount && publicKey ? (() => {
    const inputAmountNum = parseFloat(inputAmount)
    if (isNaN(inputAmountNum) || inputAmountNum <= 0) return false

    // Use the actual balance being displayed (from local fallback if needed)
    const actualBalance = inputBalance === '0' && localBalances.has(safeInputToken.address)
      ? localBalances.get(safeInputToken.address)!
      : inputBalance

    const balanceNum = parseFloat(actualBalance) / Math.pow(10, safeInputToken.decimals || 9)
    console.log(`[Balance Check] Amount: ${inputAmountNum}, Balance: ${balanceNum}, Insufficient: ${inputAmountNum > balanceNum}`)
    return inputAmountNum > balanceNum
  })() : false

  const canSwap = !!(
    publicKey &&
    safeInputToken &&
    safeOutputToken &&
    inputAmount &&
    parseFloat(inputAmount) > 0 &&
    !isLoading &&
    !hasInsufficientBalance &&
    !config.swap.maintenanceMode
  )

  // Create merged balances Map with local fallbacks for child components
  const mergedBalances = useMemo(() => {
    const merged = new Map(balances)

    // Merge local fallback balances
    localBalances.forEach((localBalance, address) => {
      const currentBalance = merged.get(address) || '0'
      console.log(`[Balance Merge] ${address}: current=${currentBalance}, local=${localBalance}, using local=${parseFloat(localBalance) > parseFloat(currentBalance)}`)

      // Use local balance if it's greater than current balance (to handle the case where current is 0)
      if (parseFloat(localBalance) > parseFloat(currentBalance)) {
        merged.set(address, localBalance)
      }
    })

    return merged
  }, [balances, localBalances])

  // Store correct balance from useSwap hook when available (no more RPC calls)
  useEffect(() => {
    const storeBalanceFromHook = () => {
      if (publicKey && safeInputToken && inputBalance !== '0' && parseFloat(inputBalance) > 0) {
        console.log(`[Balance Storage] Storing correct balance from useSwap hook: ${inputBalance} for ${safeInputToken.symbol}`)
        setLocalBalances(prev => new Map(prev.set(safeInputToken.address, inputBalance)))
      } else if (publicKey && safeInputToken && inputBalance === '0' && localBalances.has(safeInputToken.address)) {
        console.log(`[Balance Storage] useSwap hook has 0, but we have local balance: ${localBalances.get(safeInputToken.address)}`)
        setBalanceUpdateTrigger(prev => prev + 1) // Force re-render to use local balance
      }
    }

    storeBalanceFromHook()
  }, [publicKey, safeInputToken, inputBalance])

  const isProgressActive = !!(progress && progress.status !== SwapStatus.IDLE && progress.status !== SwapStatus.COMPLETED)

  
  // Show confidential versions in display when privacy mode is enabled
  const displayOutputToken = outputToken || safeOutputToken || null
  const displayInputToken = inputToken || safeInputToken || null

  return (
    <div className="w-full max-w-lg sm:max-w-xl mx-auto px-2 xs:px-0">
      <div className="relative">
  
        {/* Privacy Mode Indicator */}
        {privacyMode && (
          <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 z-10">
            <div
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full backdrop-blur-sm"
              style={{
                background: `${theme.colors.success}10`,
                border: `1px solid ${theme.colors.success}20`,
              }}
            >
              <div
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ backgroundColor: theme.colors.success }}
              />
              <span
                className="text-xs font-medium"
                style={{ color: theme.colors.success }}
              >
                Privacy Mode Active
              </span>
            </div>
          </div>
        )}

        
        {/* Main Card with Professional Tabs */}
        <div
          className="relative overflow-hidden rounded-2xl"
          style={{
            background: `
              linear-gradient(135deg,
                ${theme.colors.surface}ee 0%,
                ${theme.colors.surfaceHover}cc 25%,
                ${theme.colors.surface}ee 50%,
                ${theme.colors.surfaceHover}cc 75%,
                ${theme.colors.surface}ee 100%
              ),
              radial-gradient(circle at 25% 25%,
                ${theme.colors.primary}08 0%,
                transparent 50%
              ),
              radial-gradient(circle at 75% 75%,
                ${theme.colors.success}03 0%,
                transparent 50%
              )
            `,
            border: `1px solid ${theme.colors.primary}15`,
            backdropFilter: 'blur(24px) saturate(1.8)',
            boxShadow: `
              0 20px 60px ${theme.colors.shadowHeavy},
              0 8px 24px ${theme.colors.primary}08,
              inset 0 1px 0 rgba(255, 255, 255, 0.1),
              inset 0 -1px 0 rgba(0, 0, 0, 0.2)
            `
          }}
        >
          {/* Noise grain overlay */}
          <div
            className="absolute inset-0 opacity-4 pointer-events-none"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='200' height='200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3Cfilter%3E%3Crect width='200' height='200' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
              filter: 'contrast(1.2) brightness(1.1)'
            }}
          />

          {/* Professional Tab Navigation */}
          {privacyMode && (
            <div className="relative z-10">
              <div className="flex border-b" style={{ borderColor: `${theme.colors.border}30` }}>
                <button
                  onClick={() => setActiveTab('swap')}
                  className={`flex-1 px-4 py-3 text-sm font-bold transition-all duration-200 relative`}
                  style={{
                    color: activeTab === 'swap' ? theme.colors.primary : theme.colors.textMuted,
                    backgroundColor: activeTab === 'swap' ? `${theme.colors.primary}08` : 'transparent'
                  }}
                >
                  <div className="flex items-center justify-center gap-2">
                    <ArrowsUpDownIcon className="h-4 w-4" />
                    <span>SWAP</span>
                  </div>
                  {activeTab === 'swap' && (
                    <div
                      className="absolute bottom-0 left-0 right-0 h-0.5"
                      style={{ backgroundColor: theme.colors.primary }}
                    />
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('withdraw')}
                  className={`flex-1 px-4 py-3 text-sm font-bold transition-all duration-200 relative`}
                  style={{
                    color: activeTab === 'withdraw' ? theme.colors.primary : theme.colors.textMuted,
                    backgroundColor: activeTab === 'withdraw' ? `${theme.colors.primary}08` : 'transparent'
                  }}
                >
                  <div className="flex items-center justify-center gap-2">
                    <ArrowDownTrayIcon className="h-4 w-4" />
                    <span>WITHDRAW</span>
                  </div>
                  {activeTab === 'withdraw' && (
                    <div
                      className="absolute bottom-0 left-0 right-0 h-0.5"
                      style={{ backgroundColor: theme.colors.primary }}
                    />
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Tab Content */}
          <div className="relative z-10 p-4 sm:p-5 md:p-6 space-y-4 sm:space-y-5 md:space-y-6">
            {activeTab === 'swap' ? (
              /* SWAP TAB CONTENT */
              <div className="space-y-4 sm:space-y-5 md:space-y-6">
                {/* Progress Display */}
                {progress && isProgressActive && (
                  <div
                    className="relative z-10 p-4 rounded-xl"
                    style={{
                      background: `
                        linear-gradient(135deg,
                          ${theme.colors.primary}10 0%,
                          ${theme.colors.primary}05 50%,
                          ${theme.colors.primary}10 100%
                        )
                      `,
                      border: `1px solid ${theme.colors.primary}20`,
                      backdropFilter: 'blur(16px) saturate(1.5)',
                      boxShadow: `
                        0 8px 32px ${theme.colors.shadow},
                        inset 0 1px 0 rgba(255, 255, 255, 0.1)
                      `
                    }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span
                        className="text-sm font-bold"
                        style={{ color: theme.colors.primary }}
                      >
                        {progress.message}
                      </span>
                      <button
                        onClick={cancelSwap}
                        className="text-xs font-medium transition-colors px-2 py-1 rounded-md hover:bg-black/20"
                        style={{ color: theme.colors.error }}
                      >
                        Cancel
                      </button>
                    </div>
                    <div className="w-full rounded-full h-2 bg-black/50">
                      <div
                        className="h-2 rounded-full transition-all duration-300"
                        style={{
                          width: `${(progress.currentStep / progress.totalSteps) * 100}%`,
                          background: theme.colors.primary,
                          boxShadow: `0 0 10px ${theme.colors.primary}50`
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* You Send Section */}
                <div className="relative z-10 space-y-2 sm:space-y-3">
                  <div className="flex items-center justify-between">
                    <label
                      className="text-xs sm:text-sm font-bold tracking-wide"
                      style={{ color: theme.colors.textSecondary }}
                    >
                      You Send
                    </label>
                    <div className="flex items-center gap-1 sm:gap-2">
                      {publicKey && safeInputToken && (
                        <div className="flex items-center gap-1">
                          {[
                            { label: '25%', value: 0.25 },
                            { label: '50%', value: 0.5 },
                            { label: '75%', value: 0.75 },
                            { label: 'MAX', value: 0.95 }
                          ].map(({ label, value }) => (
                            <button
                              key={label}
                              onClick={() => {
                                // Use the actual balance being displayed (from local fallback if needed)
                                const actualBalance = inputBalance === '0' && localBalances.has(safeInputToken.address)
                                  ? localBalances.get(safeInputToken.address)!
                                  : inputBalance

                                const balanceNum = parseFloat(actualBalance)
                                console.log(`[Percentage Buttons] ${label} clicked - balance: ${balanceNum} lamports`)

                                if (balanceNum > 0) {
                                  const maxAmount = balanceNum / Math.pow(10, safeInputToken.decimals || 9)
                                  const amountWithFees = maxAmount * value
                                  console.log(`[Percentage Buttons] Setting amount: ${amountWithFees} (${label} of ${maxAmount})`)
                                  setInputAmount(amountWithFees.toString())
                                } else {
                                  console.log(`[Percentage Buttons] Balance is 0, setting amount to 0`)
                                  setInputAmount('0')
                                }
                                clearQuote()
                              }}
                              className="text-xs font-medium transition-all duration-200 px-1.5 sm:px-2 py-1 rounded-md hover:scale-105 active:scale-95"
                              style={{
                                color: label === 'MAX' ? theme.colors.success : theme.colors.primary,
                                backgroundColor: label === 'MAX' ? `${theme.colors.success}08` : `${theme.colors.primary}05`,
                                border: `1px solid ${label === 'MAX' ? theme.colors.success + '20' : theme.colors.primary + '15'}`,
                                fontWeight: label === 'MAX' ? 700 : 500,
                                opacity: value === 0.95 ? 1 : 0.9
                              }}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      )}
                      <span
                        className="text-xs"
                        style={{ color: theme.colors.textMuted }}
                      >
                        {!publicKey ? (
                          'Connect wallet to see balance'
                        ) : inputBalanceFormatted === '0' ? (
                          `Balance: 0 ${safeInputToken?.symbol || ''}`
                        ) : (
                          `Balance: ${inputBalanceFormatted} ${safeInputToken?.symbol || ''}`
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="relative">
                    <div className="flex gap-2 sm:gap-3 items-stretch">
                      <div className="flex-1 min-w-0">
                        <AmountInput
                          value={inputAmount}
                          onChange={handleInputChange}
                          disabled={isLoading || isProgressActive}
                          placeholder="0.00"
                          className="text-lg sm:text-xl font-bold"
                        />
                        {hasInsufficientBalance && (
                          <div
                            className="mt-2 flex items-center gap-1.5 p-2 rounded-lg text-xs font-medium"
                            style={{
                              background: `${theme.colors.error}08`,
                              border: `1px solid ${theme.colors.error}20`,
                              color: theme.colors.error
                            }}
                          >
                            <ExclamationTriangleIcon className="h-3.5 w-3.5 flex-shrink-0" />
                            <span>Insufficient balance. You have {inputBalanceFormatted} {safeInputToken?.symbol} available.</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-shrink-0">
                        <TokenSelector
                          selectedToken={displayInputToken}
                          onTokenChange={handleInputTokenChange}
                          tokens={optimizedTokens}
                          disabled={isLoading || isProgressActive}
                          balances={mergedBalances}
                          isPrivacyMode={privacyMode}
                          isOutputSelector={false}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Switch Button */}
                <div className="flex justify-center -my-2 z-10">
                  <button
                    onClick={handleTokenSwitch}
                    className="p-2.5 rounded-full transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
                    style={{
                      ...createGlassStyles(theme),
                      border: '1px solid ' + theme.colors.border
                    }}
                    disabled={isLoading || isProgressActive}
                  >
                    <ArrowsUpDownIcon
                      className="h-5 w-5"
                      style={{ color: theme.colors.primary }}
                    />
                  </button>
                </div>

                {/* You Receive Section */}
                <div className="relative z-10 space-y-3">
                  <div className="flex items-center justify-between">
                    <label
                      className="text-sm font-bold tracking-wide"
                      style={{ color: theme.colors.textSecondary }}
                    >
                      You Receive
                    </label>
                    <div className="flex items-center gap-2">
                      <span
                        className="text-xs"
                        style={{ color: theme.colors.textMuted }}
                      >
                        Balance: {outputBalanceFormatted}
                      </span>
                      {quote && outputAmount && (
                        <span
                          className="text-xs"
                          style={{ color: theme.colors.success }}
                        >
                          ✓
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="relative">
                    <div className="flex gap-2 sm:gap-3 items-stretch">
                      <div className="flex-1 min-w-0">
                        <AmountInput
                          value={outputAmount}
                          onChange={() => {}}
                          disabled={true}
                          placeholder="0.00"
                          readOnly={true}
                          className="text-lg sm:text-xl font-bold opacity-75"
                        />
                      </div>
                      <div className="flex-shrink-0">
                        <TokenSelector
                          selectedToken={displayOutputToken}
                          onTokenChange={handleOutputTokenChange}
                          tokens={optimizedTokens}
                          disabled={isLoading || isProgressActive}
                          balances={mergedBalances}
                          isPrivacyMode={privacyMode}
                          isOutputSelector={true}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Error Display */}
                {error && (
                  <div
                    className="flex items-start gap-3 p-4 rounded-xl"
                    style={{
                      ...createGlassStyles(theme),
                      border: '1px solid ' + (error.includes('User rejected') || error.includes('cancelled') ? `${theme.colors.primary}30` : `${theme.colors.error}30`),
                      backgroundColor: error.includes('User rejected') || error.includes('cancelled') ? `${theme.colors.primary}05` : `${theme.colors.error}05`
                    }}
                  >
                    <ExclamationTriangleIcon
                      className="h-5 w-5 flex-shrink-0 mt-0.5"
                      style={{ color: error.includes('User rejected') || error.includes('cancelled') ? theme.colors.primary : theme.colors.error }}
                    />
                    <div className="flex-1">
                      <p
                        className="text-sm font-bold"
                        style={{
                          color: error.includes('User rejected') || error.includes('cancelled')
                            ? theme.colors.primary
                            : theme.colors.error
                        }}
                      >
                        {error}
                      </p>
                      <button
                        onClick={clearError}
                        className="text-xs font-medium transition-opacity hover:opacity-70 mt-2"
                        style={{
                          color: error.includes('User rejected') || error.includes('cancelled')
                            ? theme.colors.primary
                            : theme.colors.error
                        }}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}

                {/* Swap Button */}
                <div className="w-full mt-4 sm:mt-6">
                  <SwapButton
                    inputAmount={inputAmount}
                    inputToken={safeInputToken}
                    outputToken={safeOutputToken}
                    quote={quote}
                    loading={isLoading}
                    privacyMode={privacyMode}
                    canSwap={canSwap}
                    onSwap={handleSwap}
                    onCancel={cancelSwap}
                    progress={progress}
                  />
                </div>
              </div>
            ) : (
              /* WITHDRAW TAB CONTENT */
              <div className="space-y-4 sm:space-y-5 md:space-y-6">
                {!publicKey ? (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: theme.colors.surface + '33' }}>
                      <WalletIcon className="h-8 w-8" style={{ color: theme.colors.textMuted }} />
                    </div>
                    <p className="text-sm font-medium" style={{ color: theme.colors.textSecondary }}>
                      Connect your wallet to view confidential balances
                    </p>
                  </div>
                ) : confidentialBalances.length === 0 || (apiConfidentialBalances.length === 1 && apiConfidentialBalances[0]?.requiresAuth) ? (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: theme.colors.surface + '33' }}>
                      {apiConfidentialBalances.length === 1 && apiConfidentialBalances[0]?.requiresAuth ?
                        <LockClosedIcon className="h-8 w-8" style={{ color: theme.colors.textMuted }} /> :
                        <ArrowDownTrayIcon className="h-8 w-8" style={{ color: theme.colors.textMuted }} />
                      }
                    </div>
                    <p className="text-sm font-medium" style={{ color: theme.colors.textSecondary }}>
                      {apiConfidentialBalances.length === 1 && apiConfidentialBalances[0]?.requiresAuth ?
                        'Balance requires wallet signature to view' :
                        'No tracked confidential balances found'
                      }
                    </p>
                    {apiConfidentialBalances.length === 1 && apiConfidentialBalances[0]?.requiresAuth && (
                      <p className="text-xs mt-2" style={{ color: theme.colors.textMuted }}>
                        {apiConfidentialBalances[0].note}
                      </p>
                    )}
                    {!(apiConfidentialBalances.length === 1 && apiConfidentialBalances[0]?.requiresAuth) && (
                      <p className="text-xs mt-2" style={{ color: theme.colors.textMuted }}>
                        Complete a private swap to automatically track your confidential tokens,
                        or manually add tokens you already have in your Encifher account.
                      </p>
                    )}
                    {apiConfidentialBalances.length === 1 && apiConfidentialBalances[0]?.requiresAuth && publicKey && (
                      <button
                        onClick={() => fetchAuthenticatedBalances()}
                        disabled={isLoadingConfidentialBalances}
                        className="mt-4 px-4 py-2 rounded-lg text-xs font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                          background: `${theme.colors.primary}20`,
                          border: `1px solid ${theme.colors.primary}40`,
                          color: theme.colors.primary
                        }}
                      >
                        {isLoadingConfidentialBalances ? 'Authenticating...' : 'Authenticate to View Balances'}
                      </button>
                    )}
                    {!(apiConfidentialBalances.length === 1 && apiConfidentialBalances[0]?.requiresAuth) && publicKey && (
                      <button
                        onClick={() => fetchConfidentialBalances()}
                        disabled={isLoadingConfidentialBalances}
                        className="mt-4 px-4 py-2 rounded-lg text-xs font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                          background: `${theme.colors.primary}10`,
                          border: `1px solid ${theme.colors.primary}20`,
                          color: theme.colors.primary
                        }}
                      >
                        {isLoadingConfidentialBalances ? 'Loading...' : 'Refresh Balances'}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="text-center mb-6">
                      <h3 className="text-lg font-bold mb-2" style={{ color: theme.colors.textPrimary }}>
                        Confidential Balances
                      </h3>
                      <p className="text-sm" style={{ color: theme.colors.textMuted }}>
                        Your privacy-protected tokens that can be withdrawn back to regular tokens
                      </p>
                    </div>

                    {confidentialBalances.map((balance, index) => (
                      <div
                        key={index}
                        className="p-4 rounded-xl border"
                        style={{
                          background: `${theme.colors.surface}50`,
                          borderColor: theme.colors.border
                        }}
                      >
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            {balance.logoURI ? (
                              <img
                                src={balance.logoURI}
                                alt={balance.symbol}
                                className="w-10 h-10 rounded-full"
                                onError={(e) => {
                                  // Fallback to initials if image fails to load
                                  e.currentTarget.style.display = 'none'
                                  e.currentTarget.nextElementSibling?.classList.remove('hidden')
                                }}
                              />
                            ) : null}
                            <div
                              className={`w-10 h-10 rounded-full flex items-center justify-center ${balance.logoURI ? 'hidden' : ''}`}
                              style={{ backgroundColor: `${theme.colors.primary}10` }}
                            >
                              <span className="text-sm font-bold" style={{ color: theme.colors.primary }}>
                                {balance.symbol[0]}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium" style={{ color: theme.colors.textPrimary }}>
                                {balance.name}
                              </p>
                              <p className="text-xs" style={{ color: theme.colors.textMuted }}>
                                Confidential Token
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-bold" style={{ color: theme.colors.textPrimary }}>
                              {(parseFloat(balance.amount) / Math.pow(10, balance.decimals)).toLocaleString(undefined, { maximumFractionDigits: 6 })}
                            </p>
                            <p className="text-xs" style={{ color: theme.colors.textMuted }}>
                              ≈ ${balance.usdValue?.toLocaleString() || '0.00'}
                            </p>
                          </div>
                        </div>

                        {/* Withdrawal Amount Input */}
                        <div className="space-y-2">
                          <label className="text-xs font-medium" style={{ color: theme.colors.textSecondary }}>
                            Withdrawal Amount
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              value={withdrawalAmounts[balance.tokenAddress] || balance.amount.toString()}
                              onChange={(e) => handleWithdrawalAmountChange(balance.tokenAddress, e.target.value)}
                              max={balance.amount}
                              min="0"
                              step="0.000001"
                              disabled={!balance.canWithdraw || isLoading}
                              className="w-full py-2.5 px-3 pr-16 rounded-lg border text-sm font-mono transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-0"
                              style={{
                                background: theme.colors.surface,
                                borderColor: theme.colors.border,
                                color: theme.colors.textPrimary,
                                borderWidth: '1px',
                                opacity: balance.canWithdraw ? 1 : 0.5,
                                cursor: balance.canWithdraw ? 'text' : 'not-allowed'
                              }}
                              onFocus={(e) => {
                                e.target.style.borderColor = theme.colors.primary
                                e.target.style.boxShadow = `0 0 0 2px ${theme.colors.primary}20`
                              }}
                              onBlur={(e) => {
                                e.target.style.borderColor = theme.colors.border
                                e.target.style.boxShadow = 'none'
                              }}
                            />
                            <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex gap-1">
                              <button
                                onClick={() => handleWithdrawalAmountChange(balance.tokenAddress, (balance.amount / 2).toString())}
                                disabled={!balance.canWithdraw || isLoading}
                                className="text-xs px-1.5 py-0.5 rounded transition-all duration-200"
                                style={{
                                  background: theme.colors.surfaceHover + '30',
                                  color: theme.colors.textMuted,
                                  border: 'none',
                                  opacity: balance.canWithdraw ? 1 : 0.5,
                                  cursor: balance.canWithdraw ? 'pointer' : 'not-allowed'
                                }}
                                onMouseEnter={(e) => {
                                  if (balance.canWithdraw) {
                                    e.currentTarget.style.background = theme.colors.primary + '20'
                                    e.currentTarget.style.color = theme.colors.primary
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = theme.colors.surfaceHover + '30'
                                  e.currentTarget.style.color = theme.colors.textMuted
                                }}
                              >
                                HALF
                              </button>
                              <button
                                onClick={() => handleWithdrawalAmountChange(balance.tokenAddress, balance.amount.toString())}
                                disabled={!balance.canWithdraw || isLoading}
                                className="text-xs px-1.5 py-0.5 rounded transition-all duration-200"
                                style={{
                                  background: theme.colors.surfaceHover + '30',
                                  color: theme.colors.textMuted,
                                  border: 'none',
                                  opacity: balance.canWithdraw ? 1 : 0.5,
                                  cursor: balance.canWithdraw ? 'pointer' : 'not-allowed'
                                }}
                                onMouseEnter={(e) => {
                                  if (balance.canWithdraw) {
                                    e.currentTarget.style.background = theme.colors.primary + '20'
                                    e.currentTarget.style.color = theme.colors.primary
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = theme.colors.surfaceHover + '30'
                                  e.currentTarget.style.color = theme.colors.textMuted
                                }}
                              >
                                MAX
                              </button>
                            </div>
                          </div>
                          <div className="flex justify-between items-center text-xs" style={{ color: theme.colors.textMuted }}>
                            <span>
                              Available: {(parseFloat(balance.amount) / Math.pow(10, balance.decimals)).toLocaleString(undefined, { maximumFractionDigits: 6 })} {balance.symbol}
                            </span>
                            <span>
                              {/* No additional info needed since we now show actual balances */}
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleWithdrawClick(balance.tokenAddress, balance.amount, balance.symbol)}
                          disabled={!balance.canWithdraw || isLoading}
                          className="w-full py-3 px-4 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{
                            background: balance.canWithdraw ? `${theme.colors.success}10` : `${theme.colors.border}50`,
                            border: balance.canWithdraw ? `1px solid ${theme.colors.success}20` : `1px solid ${theme.colors.border}`,
                            color: balance.canWithdraw ? theme.colors.success : theme.colors.textMuted
                          }}
                        >
                          <ArrowDownTrayIcon className="h-4 w-4" />
                          {balance.canWithdraw ? 'Withdraw to Regular Token' : 'Withdrawal Unavailable'}
                        </button>
                      </div>
                    ))}

                    <div className="mt-6 p-4 rounded-xl" style={{ background: `${theme.colors.info}05`, borderColor: `${theme.colors.info}20` }}>
                      <div className="flex items-start gap-3">
                        <ArrowDownTrayIcon className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: theme.colors.info }} />
                        <div>
                          <p className="text-sm font-medium mb-1" style={{ color: theme.colors.info }}>
                            Withdrawal Information
                          </p>
                          <p className="text-xs" style={{ color: theme.colors.textMuted }}>
                            Your confidential tokens are privacy-protected and can only be accessed by you.
                            Withdrawal converts them back to regular tokens instantly.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Security & Info Footer */}
          {!privacyMode || activeTab === 'swap' ? (
            <div
              className="mt-6 pt-4"
              style={{ borderTop: `1px solid ${theme.colors.border}` }}
            >
              <div
                className="flex items-center justify-center gap-6 text-xs"
                style={{ color: theme.colors.textMuted }}
              >
                <div className="flex items-center gap-1">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: theme.colors.primary }}
                  />
                  <span>Encrypted</span>
                </div>
                <div className="flex items-center gap-1">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: theme.colors.primary }}
                  />
                  <span>{privacyMode ? 'Private' : 'Public'} Route</span>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Disclaimer */}
        <div className="mt-4 text-center">
          <p
            className="text-xs max-w-md mx-auto"
            style={{ color: theme.colors.textMuted }}
          >
            {activeTab === 'withdraw'
              ? "Withdrawal converts your confidential tokens back to regular tokens. This process may take a few seconds to complete."
              : privacyMode
                ? "Private swaps use enhanced encryption to protect transaction privacy. Fees may be higher than public swaps."
                : "Public swaps are executed on-chain transparently. All transaction details are publicly visible."
            }
          </p>
        </div>
      </div>

      {/* Withdrawal Modals */}
      {pendingWithdrawal && (
        <>
          <WithdrawConfirmModal
            isOpen={showWithdrawConfirmModal}
            onClose={() => setShowWithdrawConfirmModal(false)}
            onConfirm={handleWithdrawConfirm}
            tokenSymbol={pendingWithdrawal.symbol}
            tokenAmount={pendingWithdrawal.amount.toString()}
            recipientAddress={publicKey?.toString() || ''}
            isLoading={isWithdrawing}
          />

          <WithdrawSuccessModal
            isOpen={showWithdrawSuccessModal}
            onClose={resetModalStates}
            transactionSignature={withdrawalTransactionSignature}
            tokenSymbol={pendingWithdrawal.symbol}
            tokenAmount={pendingWithdrawal.amount.toString()}
            recipientAddress={publicKey?.toString() || ''}
          />

          <WithdrawErrorModal
            isOpen={showWithdrawErrorModal}
            onClose={resetModalStates}
            error={withdrawalError}
            onRetry={handleWithdrawRetry}
            tokenSymbol={pendingWithdrawal.symbol}
            tokenAmount={pendingWithdrawal.amount.toString()}
          />
        </>
      )}

      {/* Maintenance Modal */}
      <MaintenanceModal
        isOpen={showMaintenanceModal}
        onClose={() => setShowMaintenanceModal(false)}
      />
    </div>
  )
}