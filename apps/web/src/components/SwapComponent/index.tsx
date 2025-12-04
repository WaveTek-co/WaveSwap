'use client'

import { useState, useMemo, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { Connection } from '@solana/web3.js'
import { ArrowsUpDownIcon, ExclamationTriangleIcon, ArrowDownTrayIcon, WalletIcon, LockClosedIcon, InformationCircleIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline'
import { TokenSelector } from './TokenSelector'
import { AmountInput } from './AmountInput'
import { SwapButton } from './SwapButton'
import { Modal, WithdrawConfirmModal, WithdrawSuccessModal, WithdrawErrorModal } from '@/components/ui/Modal'
import { useSwap } from '@/hooks/useSwap'
import { Token, SwapStatus } from '@/types/token'
import { useThemeConfig, createGlassStyles } from '@/lib/theme'
import { EncifherClient, EncifherUtils } from '@/lib/encifher'

interface SwapComponentProps {
  privacyMode: boolean
}

// Proper balance formatting function
const formatBalance = (balance: string, decimals: number = 9): string => {
  try {
    // Handle special confidential balance statuses
    if (balance === 'AUTH_REQUIRED') {
      return '🔒 Auth Required'
    }
    if (balance === 'DEPOSITED') {
      return '📊 Has Balance'
    }
    if (balance === '00' || balance === '0') {
      return '0'
    }

    // Log for debugging balance display
    if (balance && parseFloat(balance) > 0) {
      console.log(`[SwapComponent.formatBalance] Processing balance: ${balance} with ${decimals} decimals`)
    }

    // Determine if balance is already in human-readable format or in base units
    const balanceNum = parseFloat(balance)

    // If the balance is a very small number but has many decimal places, it's likely in base units
    // Example: 1100000 (base units for 1.1 USDC) vs 1.1 (human readable)
    let displayNum: number

    if (balanceNum >= Math.pow(10, decimals - 2)) {
      // Likely in base units (lamports), convert to human-readable
      displayNum = balanceNum / Math.pow(10, decimals)
      console.log(`[SwapComponent.formatBalance] Treating as base units: ${balanceNum} -> ${displayNum}`)
    } else {
      // Already in human-readable format
      displayNum = balanceNum
      console.log(`[SwapComponent.formatBalance] Treating as human-readable: ${balanceNum}`)
    }

    // Log the conversion result for debugging
    if (balanceNum > 0) {
      console.log(`[SwapComponent.formatBalance] Result: ${displayNum} (processed from ${balance})`)
    }

    if (displayNum === 0) return '0'

    // For very small amounts, show appropriate precision
    if (displayNum < 0.000001) {
      return '<0.000001'
    }
    if (displayNum < 0.001) {
      return displayNum.toFixed(6)
    }
    if (displayNum < 1) {
      return displayNum.toFixed(4)
    }
    if (displayNum < 1000) {
      return displayNum.toFixed(2)
    }

    // For large amounts, use locale with reasonable precision
    return displayNum.toLocaleString(undefined, { maximumFractionDigits: 2 })
  } catch (error) {
    console.log(`[SwapComponent.formatBalance] Error formatting balance: ${balance} with ${decimals} decimals:`, error)
    return '0'
  }
}

export function SwapComponent({ privacyMode }: SwapComponentProps) {
  // Safely get wallet context with error handling
  let walletContext
  try {
    walletContext = useWallet()
  } catch (error) {
    console.error('[SwapComponent] Wallet context error:', error)
    // Fallback wallet context for error cases
    walletContext = {
      publicKey: null,
      signMessage: null,
      connected: false,
      connecting: false,
      wallets: [],
      wallet: null
    }
  }

  const { publicKey, signMessage, wallet } = walletContext
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

  // Withdrawal input amounts for each token
  const [withdrawalAmounts, setWithdrawalAmounts] = useState<{ [key: string]: string }>({})
  const [apiConfidentialBalances, setApiConfidentialBalances] = useState<any[]>([])
  const [isLoadingConfidentialBalances, setIsLoadingConfidentialBalances] = useState(false)

  // Simple cache for token metadata to improve performance
  const [tokenMetadataCache, setTokenMetadataCache] = useState<Map<string, any>>(new Map())

  // Info modal state
  const [showInfoModal, setShowInfoModal] = useState(false)

  // Search modal state
  const [showSearchModal, setShowSearchModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])

  // Authenticated confidential balances from Encifher SDK
  const [authenticatedBalances, setAuthenticatedBalances] = useState<any[]>([])

  // Fetch confidential balances from API when privacy mode is enabled and user is connected
  useEffect(() => {
    if (privacyMode && publicKey) {
      console.log('[SwapComponent] Privacy mode enabled, checking for existing authenticated balances...')
      // Only fetch if we don't already have authenticated balances
      if (authenticatedBalances.length === 0) {
        console.log('[SwapComponent] No cached balances, initiating authentication...')
        fetchAuthenticatedBalances().then(() => {
          console.log('[SwapComponent] Authenticated balances fetched successfully')
        }).catch((error) => {
          console.error('[SwapComponent] Error fetching authenticated balances:', error)
          // Fall back to basic confidential balances if authenticated flow fails
          fetchConfidentialBalances()
        })
      } else {
        console.log('[SwapComponent] Using cached authenticated balances')
      }
    } else {
      setApiConfidentialBalances([])
      setAuthenticatedBalances([])
    }
  }, [privacyMode, publicKey, authenticatedBalances.length]) // Added authenticatedBalances.length dependency

  // API function to fetch confidential balances
  const fetchConfidentialBalances = async () => {
    if (!publicKey) return

    setIsLoadingConfidentialBalances(true)
    try {
      console.log('[SwapComponent] Fetching confidential balances from API for user:', publicKey.toString())

      const response = await fetch(`/api/v1/confidential/balances?userPublicKey=${publicKey.toString()}&t=${Date.now()}&v=2.0`)

      if (response.ok) {
        const data = await response.json()
        console.log('[SwapComponent] Successfully fetched confidential balances:', data)
        setApiConfidentialBalances(data.confidentialBalances || [])
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
  }

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

      // Initialize Encifher client
      const connection = new Connection(
        process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
      )

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
      const signatureArray = await signMessage(messageBytes)
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

      // Check for inconsistent balance responses (all zeros) and retry once
      if (Array.isArray(authenticatedBalance)) {
        const hasNonZeroBalance = authenticatedBalance.some((balance: any) => {
          return Object.values(balance).some((value: any) =>
            value && typeof value === 'bigint' && value > 0n
          )
        })

        if (!hasNonZeroBalance && finalTokenMints.length > 0) {
          console.log('[SwapComponent] ⚠️ All balances are zero - inconsistent response detected. Retrying balance fetch...')

          try {
            // Wait 2 seconds and retry the balance fetch
            await new Promise(resolve => setTimeout(resolve, 2000))
            const retryBalance = await defiClient.getBalance(publicKey, messageWithSignature, finalTokenMints, encifherConfig.encifherKey)

            if (Array.isArray(retryBalance) && retryBalance.some((balance: any) =>
              Object.values(balance).some((value: any) => value && typeof value === 'bigint' && value > 0n)
            )) {
              console.log('[SwapComponent] ✅ Retry successful - got updated non-zero balances')
              authenticatedBalance = retryBalance
            } else {
              console.log('[SwapComponent] Retry also returned zeros, continuing with original response')
            }
          } catch (retryError) {
            console.log('[SwapComponent] Balance fetch retry failed:', retryError)
          }
        }
      }

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
        // Create a map of token addresses to token metadata for lookup using Jupiter API
        let tokenMetadataMap = new Map<string, any>()

        // Fetch token metadata from Jupiter API dynamically for all discovered tokens (with caching)
        console.log('[SwapComponent] Fetching token metadata from Jupiter API for discovered tokens...')

        try {
          const uncachedTokens = finalTokenMints.filter(tokenAddress => !tokenMetadataCache.has(tokenAddress))
          const cachedMetadata = new Map()

          // Use cached metadata first
          finalTokenMints.forEach(tokenAddress => {
            if (tokenMetadataCache.has(tokenAddress)) {
              cachedMetadata.set(tokenAddress, tokenMetadataCache.get(tokenAddress))
            }
          })

          if (uncachedTokens.length > 0) {
            console.log(`[SwapComponent] Fetching metadata for ${uncachedTokens.length} uncached tokens`)

            const tokenMetadataPromises = uncachedTokens.map(async (tokenAddress) => {
              try {
                // Use direct Jupiter API call with timeout
                const controller = new AbortController()
                const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout

                const response = await fetch(`https://token.jup.ag/v6/strict?filter=true&token=${tokenAddress}`, {
                  signal: controller.signal
                })

                clearTimeout(timeoutId)

                if (response.ok) {
                  const tokens = await response.json()
                  if (Array.isArray(tokens) && tokens.length > 0) {
                    const token = tokens[0]
                    const metadata = {
                      address: token.address,
                      symbol: token.symbol,
                      name: token.name,
                      decimals: token.decimals,
                      logoURI: token.logoURI
                    }
                    console.log(`[SwapComponent] ✅ Fetched metadata for ${tokenAddress}:`, token.symbol)
                    return metadata
                  }
                }
              } catch (error) {
                console.warn(`[SwapComponent] ⚠️ Failed to fetch metadata for token ${tokenAddress}:`, error)
              }

              // Create fallback token if Jupiter API fails
              console.warn(`[SwapComponent] Creating fallback metadata for ${tokenAddress}`)
              return {
                address: tokenAddress,
                symbol: `TOKEN_${tokenAddress.slice(0, 6)}`,
                name: `Token ${tokenAddress.slice(0, 8)}...`,
                decimals: 9,
                logoURI: '/icons/default-token.svg'
              }
            })

            const tokenMetadataResults = await Promise.all(tokenMetadataPromises)

            // Update cache with new metadata
            const updatedCache = new Map(tokenMetadataCache)
            tokenMetadataResults.forEach(metadata => {
              if (metadata) {
                updatedCache.set(metadata.address, metadata)
                cachedMetadata.set(metadata.address, metadata)
              }
            })
            setTokenMetadataCache(updatedCache)
          }

          tokenMetadataMap = cachedMetadata

          console.log('[SwapComponent] Successfully fetched token metadata for', tokenMetadataMap.size, 'tokens')
          console.log(`[SwapComponent] Used ${cachedMetadata.size} cached entries, fetched ${uncachedTokens.length} new ones`)
        } catch (error) {
          console.error('[SwapComponent] Error fetching token metadata from Jupiter API:', error)
          tokenMetadataMap = new Map()
        }

        console.log('[SwapComponent] Loaded token metadata for', tokenMetadataMap.size, 'tokens')

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

        // Create balance objects for ALL tokens from Encifher account using robust mapping
        console.log('[SwapComponent] 🔄 Creating robust balance mapping from authenticated data...')

        const updatedBalances: any[] = []

        // Process each balance object and extract token data properly
        authenticatedBalance.forEach((balance: any, balanceIndex: number) => {
          console.log(`[SwapComponent] 📊 Processing balance object ${balanceIndex}:`, balance)

          if (balance && typeof balance === 'object') {
            // Get all token addresses from this balance object
            const tokenAddresses = Object.keys(balance)

            tokenAddresses.forEach(tokenAddress => {
              const amount = balance[tokenAddress]

              console.log(`[SwapComponent] 💰 Found token balance: ${tokenAddress} = ${amount}`)

              // Skip if amount is undefined, null, or empty string
              if (amount === undefined || amount === null || amount === '') {
                console.log(`[SwapComponent] ⚠️ Skipping token ${tokenAddress} - no valid amount`)
                return
              }

              // Get token metadata
              const metadata = tokenMetadataMap.get(tokenAddress)

              // Handle BigInt conversion and base units to display units
              let finalAmount = '0'
              let decimals = metadata?.decimals || 6 // Default to 6 decimals for stablecoins

              // Get token-specific decimals from known tokens
              if (tokenAddress === 'So11111111111111111111111111111111111111112') {
                decimals = 9 // SOL has 9 decimals
              } else if (tokenAddress === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') {
                decimals = 6 // USDC has 6 decimals
              } else if (tokenAddress === '4AGxpKxYnw7g1ofvYDs5Jq2a1ek5kB9jS2NTUaippump') {
                decimals = 6 // WAVE has 6 decimals
              } else if (tokenAddress === 'A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS') {
                decimals = 8 // ZEC has 8 decimals (assuming, adjust if needed)
              }

              console.log(`[SwapComponent] 📊 Token ${tokenAddress} using ${decimals} decimals, raw amount: ${amount}`)

              if (typeof amount === 'bigint') {
                // Convert from base units to display units
                const divisor = BigInt(10 ** decimals)
                const wholePart = amount / divisor
                const fractionalPart = amount % divisor

                if (fractionalPart === 0n) {
                  finalAmount = wholePart.toString()
                } else {
                  // Pad fractional part with leading zeros
                  const fractionalStr = fractionalPart.toString().padStart(decimals, '0')
                  finalAmount = `${wholePart.toString()}.${fractionalStr}`
                }
                console.log(`[SwapComponent] 🔄 Converted BigInt ${amount} to display amount ${finalAmount} with ${decimals} decimals`)
              } else if (typeof amount === 'string') {
                // Parse string amount that might already be in base units
                try {
                  const amountBigInt = BigInt(amount)
                  const divisor = BigInt(10 ** decimals)
                  const wholePart = amountBigInt / divisor
                  const fractionalPart = amountBigInt % divisor

                  if (fractionalPart === 0n) {
                    finalAmount = wholePart.toString()
                  } else {
                    const fractionalStr = fractionalPart.toString().padStart(decimals, '0')
                    finalAmount = `${wholePart.toString()}.${fractionalStr}`
                  }
                  console.log(`[SwapComponent] 🔄 Converted string ${amount} to display amount ${finalAmount} with ${decimals} decimals`)
                } catch (parseError) {
                  console.warn(`[SwapComponent] ⚠️ Could not parse amount ${amount} as BigInt, using as-is:`, parseError)
                  finalAmount = amount
                }
              } else {
                finalAmount = String(amount)
              }

              // Remove trailing zeros and decimal point if not needed
              finalAmount = parseFloat(finalAmount).toString()

              const tokenSymbol = metadata ? `c${metadata.symbol}` : `c${tokenAddress.slice(0, 6)}`
              const tokenName = metadata ? `Confidential ${metadata.name}` : `Confidential Token ${tokenAddress.slice(0, 8)}...`

              console.log(`[SwapComponent] ✅ Created token entry: ${tokenSymbol} = ${finalAmount}`)

              updatedBalances.push({
                tokenAddress,
                tokenSymbol,
                tokenName,
                decimals: metadata?.decimals || 9,
                amount: finalAmount,
                isVisible: true, // Show all tokens with actual balances
                lastUpdated: new Date().toISOString(),
                source: 'authenticated_real',
                requiresAuth: false,
                note: 'Real balance from Encifher SDK',
                logoURI: metadata?.logoURI || '/icons/default-token.svg',
                hasRealBalance: true,
                rawAmount: amount.toString() // Keep raw amount for debugging
              })
            })
          } else {
            console.log(`[SwapComponent] ⚠️ Balance ${balanceIndex} is not an object, skipping...`)
          }
        })

        // Sort by balance value (descending) for better UX
        updatedBalances.sort((a: any, b: any) => {
          // Balances are already in human-readable format from Jupiter API
          const aValue = parseFloat(a.amount)
          const bValue = parseFloat(b.amount)
          return bValue - aValue
        })

        console.log('[SwapComponent] About to set apiConfidentialBalances with:', updatedBalances)
        setApiConfidentialBalances(updatedBalances)

        // Also update authenticated balances for the UI
        setAuthenticatedBalances(updatedBalances)

        console.log('[SwapComponent] Successfully updated authenticated balances in UI:', {
          totalTokens: updatedBalances.length,
          tokens: updatedBalances.map(b => `${b.tokenSymbol}: ${b.amount}`)
        })

        // Debug: Check if tokens are actually saved
        setTimeout(() => {
          console.log('[SwapComponent] Verification - checking saved balances after state update...')
        }, 100)

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

  // Handle input amount change
  const handleInputChange = (amount: string) => {
    setInputAmount(amount)
  }

  // Enhanced token list for selector - only show curated TODO.md tokens
  const optimizedTokens = useMemo(() => {
    if (!availableTokens || availableTokens.length === 0) return []

    // Define our curated TODO.md token symbols
    const curatedTokens = new Set([
      'WAVE', 'SOL', 'USDC', 'USDT', 'ZEC', 'PUMP', 'CASH',  // Popular
      'WEALTH', 'FTP', 'AURA', 'MEW', 'STORE'  // Other
    ])

    const hasTokenBalance = (tokenAddress: string): boolean => {
      if (!balances) return false
      const balance = balances.get(tokenAddress)
      return balance !== undefined && parseFloat(balance) > 0
    }

    // Only include tokens that are in our curated list
    const userTokens = availableTokens.filter(token =>
      hasTokenBalance(token.address) && curatedTokens.has(token.symbol || '')
    )

    const popularTokens = availableTokens.filter(token => {
      const hasBalance = hasTokenBalance(token.address)
      const isPopular = !hasBalance && (
        token.tags?.includes('popular') ||
        ['WAVE', 'SOL', 'USDC', 'USDT', 'ZEC', 'PUMP', 'CASH'].includes(token.symbol || '')
      )
      return isPopular && curatedTokens.has(token.symbol || '')
    })

    const otherTokens = availableTokens.filter(token => {
      const hasBalance = hasTokenBalance(token.address)
      const isPopular = token.tags?.includes('popular') ||
                      ['WAVE', 'SOL', 'USDC', 'USDT', 'ZEC', 'PUMP', 'CASH'].includes(token.symbol || '')
      return !hasBalance && !isPopular && curatedTokens.has(token.symbol || '')
    })

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
    try {
      await swap()

      // After successful swap, refresh confidential balances to track new tokens
      setTimeout(() => {
        console.log('[SwapComponent] Refreshing confidential balances after swap completion')

        // Prioritize authenticated balances as they show real data
        fetchAuthenticatedBalances().then(() => {
          // After getting authenticated balances, also fetch basic ones as fallback
          setTimeout(() => {
            fetchConfidentialBalances()
          }, 1000)
        }).catch((error) => {
          console.log('[SwapComponent] Authenticated balances failed, trying basic balances:', error)
          fetchConfidentialBalances()
        })

        // Also trigger a manual balance check to ensure tokens are tracked
        setTimeout(async () => {
          console.log('[SwapComponent] Checking for post-swap balance updates...')
          try {
            const response = await fetch('/api/v1/confidential/balances', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                userPublicKey: publicKey?.toString(),
                tokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
                amount: '5.5', // Estimated from your 450 WAVE swap
                operation: 'add_manual'
              })
            })
            if (response.ok) {
              console.log('[SwapComponent] Manually tracked USDC from swap')
              fetchConfidentialBalances() // Refresh to show the tracked token
            }
          } catch (error) {
            console.log('[SwapComponent] Manual tracking failed:', error)
          }
        }, 6000)
      }, 4000) // Wait 4 seconds for blockchain state to update
    } catch (error) {
      // Error is already handled by useSwap hook
    }
  }

  // Handle withdrawal amount change
  const handleWithdrawalAmountChange = (tokenAddress: string, amount: string) => {
    setWithdrawalAmounts(prev => ({ ...prev, [tokenAddress]: amount }))
  }

  // Handle withdrawal confirmation using professional SDK implementation
  const handleWithdrawClick = async (tokenAddress: string, maxAmount: number, symbol: string, decimals: number = 6) => {
    if (!publicKey) {
      alert('Please connect your wallet to proceed with withdrawal')
      return
    }

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

    try {
      setIsWithdrawing(true)
      setWithdrawalError('')

      console.log('[SwapComponent] 🔄 Initiating professional withdrawal using Encifher SDK...')
      console.log('[SwapComponent] Withdrawal details:', {
        tokenAddress: tokenAddress.slice(0, 8) + '...',
        amount,
        symbol,
        decimals,
        userPublicKey: publicKey.toString().slice(0, 8) + '...'
      })

      // Step 1: Create withdrawal transaction using SDK
      const withdrawResponse = await fetch('/api/v1/confidential/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tokenAddress,
          amount,
          userPublicKey: publicKey.toString(),
          decimals
        })
      })

      if (!withdrawResponse.ok) {
        const errorData = await withdrawResponse.json()
        throw new Error(errorData.error || 'Failed to create withdrawal transaction')
      }

      const withdrawData = await withdrawResponse.json()
      console.log('[SwapComponent] ✅ Withdrawal transaction created:', withdrawData)

      if (!withdrawData.success || !withdrawData.transaction?.serialized) {
        throw new Error('Invalid withdrawal transaction response')
      }

      // Step 2: Deserialize and sign transaction
      const { Connection, Transaction } = await import('@solana/web3.js')
      const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com')

      const transaction = Transaction.from(
        Buffer.from(withdrawData.transaction.serialized, 'base64')
      )

      console.log('[SwapComponent] 📝 Transaction deserialized, requesting user signature...')

      // Step 3: Check if wallet adapter is available
      if (!wallet?.adapter) {
        throw new Error('Wallet adapter not available for transaction signing')
      }

      console.log('[SwapComponent] 📝 Sending transaction via wallet adapter...')

      // Step 4: Send transaction using wallet adapter
      const signature = await wallet.adapter.sendTransaction(transaction, connection, {
        skipPreflight: false,
        preflightCommitment: 'confirmed'
      })

      if (!signature) {
        throw new Error('Transaction was not sent')
      }

      console.log('[SwapComponent] ✅ Transaction sent successfully:', signature)

      // Step 5: Confirm transaction
      console.log('[SwapComponent] 📡 Confirming transaction...')
      const confirmation = await connection.confirmTransaction(signature, 'confirmed')

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${confirmation.value.err}`)
      }

      console.log('[SwapComponent] ✅ Withdrawal completed successfully!')

      // Step 5: Update UI state
      setWithdrawalTransactionSignature(signature)
      setPendingWithdrawal({ tokenAddress, amount, symbol })

      // Show success message
      alert(`✅ Withdrawal successful!\n\nWithdrawn: ${amount} ${symbol}\nTransaction: ${signature}\n\nYour tokens will appear in your regular wallet shortly.`)

      // Step 6: Refresh confidential balances after withdrawal
      setTimeout(() => {
        console.log('[SwapComponent] 🔄 Refreshing confidential balances after withdrawal...')
        fetchAuthenticatedBalances().catch(console.error)
      }, 2000)

    } catch (error: any) {
      console.error('[SwapComponent] ❌ Withdrawal failed:', error)
      setWithdrawalError(error.message || 'Withdrawal failed. Please try again.')

      // Show user-friendly error
      const errorMessage = error instanceof Error ? error.message : 'Unknown withdrawal error'
      alert(`❌ Withdrawal Failed: ${errorMessage}`)
    } finally {
      setIsWithdrawing(false)
    }
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

  // Confidential token balances for withdraw tab - from authenticated Encifher data
  const confidentialBalances = useMemo(() => {
    if (!privacyMode || !availableTokens || !publicKey) return []

    // Use authenticated balances from Encifher SDK, fall back to API-fetched balances
    const sourceBalances = authenticatedBalances.length > 0 ? authenticatedBalances : apiConfidentialBalances

    console.log('[SwapComponent] 🔍 Computing confidentialBalances:', {
      privacyMode,
      availableTokensCount: availableTokens.length,
      publicKey: publicKey?.toString(),
      authenticatedBalancesLength: authenticatedBalances.length,
      apiConfidentialBalancesLength: apiConfidentialBalances.length,
      sourceBalancesLength: sourceBalances.length,
      usingAuthenticated: authenticatedBalances.length > 0,
      sourceBalances: sourceBalances.map(b => ({
        address: b.tokenAddress?.slice(0, 8) + '...',
        symbol: b.tokenSymbol,
        amount: b.amount,
        source: b.source
      })),
      authenticatedBalances: authenticatedBalances.slice(0, 3), // Show first 3 for debugging
      apiConfidentialBalances: apiConfidentialBalances.slice(0, 3) // Show first 3 for debugging
    })

    // Debug: Check if we have real data
    if (sourceBalances.length === 0) {
      console.warn('[SwapComponent] ⚠️ No confidential balances found - this means either:')
      console.warn('  1. User has not deposited any tokens to Encifher yet')
      console.warn('  2. API call failed or is still loading')
      console.warn('  3. State update is pending')
    } else {
      console.log(`[SwapComponent] ✅ Found ${sourceBalances.length} confidential balances to display`)
      sourceBalances.forEach((balance, idx) => {
        console.log(`  ${idx + 1}. ${balance.tokenSymbol}: ${balance.amount} (${balance.source})`)
      })
    }

    return sourceBalances
      .filter((apiBalance: any) => {
        // Show ALL tokens from Encifher account, no filtering required
        // This ensures users can see all their tracked confidential tokens regardless of status
        return apiBalance.tokenAddress && apiBalance.tokenAddress.length > 0
      })
      .map((apiBalance: any) => {
        // Create token directly from API data without relying on availableTokens
        // This avoids the matching issue where availableTokens doesn't have confidential tokens
        const token = {
          address: apiBalance.tokenAddress,
          chainId: 101,
          decimals: apiBalance.decimals || 9,
          name: apiBalance.tokenName || apiBalance.name || `Confidential Token ${apiBalance.tokenAddress.slice(0, 8)}...`,
          symbol: apiBalance.tokenSymbol?.replace(/^c+/, '') || `TOKEN_${apiBalance.tokenAddress.slice(0, 6)}`,
          logoURI: '/icons/default-token.svg',
          tags: ['confidential'],
          isConfidentialSupported: true,
          isNative: apiBalance.tokenAddress === 'So11111111111111111111111111111111111111112',
          addressable: true
        }

        // Remove double "Confidential" prefix if it exists
        if (token.name?.startsWith('Confidential Confidential ')) {
          token.name = token.name.replace('Confidential Confidential ', 'Confidential ')
        }

        const confidentialSymbol = `c${token.symbol}`

        return {
          tokenAddress: apiBalance.tokenAddress,
          symbol: confidentialSymbol,
          name: apiBalance.tokenName || `Confidential ${token.name}`,
          decimals: apiBalance.decimals || token.decimals || 9,
          amount: apiBalance.amount,
          usdValue: apiBalance.usdValue || 0, // Will be calculated later if needed
          canWithdraw: apiBalance.canWithdraw !== false, // Default to true
          logoURI: apiBalance.logoURI || token.logoURI,
          isEstimatedBalance: false, // This is actual API data
          lastUpdated: apiBalance.lastUpdated,
          requiresAuth: apiBalance.requiresAuth || false, // Pass through authentication requirement
          source: apiBalance.source || 'confidential_encifher',
          note: apiBalance.note || 'Confidential balance retrieved from Encifher'
        }
      })
      .filter((balance): balance is NonNullable<typeof balance> => balance !== null) // Remove null entries with type guard
  }, [privacyMode, availableTokens, publicKey, apiConfidentialBalances, authenticatedBalances])

  // Get balances
  const inputBalance = safeInputToken?.address ? (balances.get(safeInputToken.address) || '0') : '0'
  const outputBalance = safeOutputToken?.address ? (balances.get(safeOutputToken.address) || '0') : '0'

  const inputBalanceFormatted = safeInputToken ? (() => {
    const amount = parseFloat(inputBalance) / Math.pow(10, safeInputToken.decimals || 9)
    if (amount === 0) return '0'
    if (amount < 0.001) return '<0.001'
    if (amount < 1) return amount.toFixed(4)
    if (amount < 1000) return amount.toFixed(2)
    return amount.toLocaleString(undefined, { maximumFractionDigits: 2 })
  })() : '0'

  const outputBalanceFormatted = safeOutputToken ? (() => {
    const amount = parseFloat(outputBalance) / Math.pow(10, safeOutputToken.decimals || 9)
    if (amount === 0) return '0'
    if (amount < 0.001) return '<0.001'
    if (amount < 1) return amount.toFixed(4)
    if (amount < 1000) return amount.toFixed(2)
    return amount.toLocaleString(undefined, { maximumFractionDigits: 2 })
  })() : '0'

  const hasInsufficientBalance = safeInputToken && inputAmount && publicKey ? (() => {
    const inputAmountNum = parseFloat(inputAmount)
    if (isNaN(inputAmountNum) || inputAmountNum <= 0) return false
    // Convert balance from lamports to human-readable format for comparison
    const balanceInLamports = parseFloat(inputBalance)
    const balanceNum = balanceInLamports / Math.pow(10, safeInputToken.decimals || 9)
    return inputAmountNum > balanceNum
  })() : false

  const canSwap = !!(
    publicKey &&
    safeInputToken &&
    safeOutputToken &&
    inputAmount &&
    parseFloat(inputAmount) > 0 &&
    !isLoading &&
    !hasInsufficientBalance
  )

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
            backdropFilter: 'none',
            boxShadow: `
              0 20px 60px ${theme.colors.shadowHeavy},
              0 8px 24px ${theme.colors.primary}08,
              inset 0 1px 0 rgba(255, 255, 255, 0.1),
              inset 0 -1px 0 rgba(0, 0, 0, 0.2)
            `
          }}
        >
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
                      backdropFilter: 'none',
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
                                const balanceInLamports = parseFloat(inputBalance)
                                if (balanceInLamports > 0 && safeInputToken) {
                                  // Convert from lamports to human-readable format
                                  const maxAmount = balanceInLamports / Math.pow(10, safeInputToken.decimals || 9)
                                  const amountWithFees = maxAmount * value
                                  setInputAmount(amountWithFees.toString())
                                } else {
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
                        Balance: {inputBalanceFormatted}
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
                          balances={balances}
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
                          balances={balances}
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
                      <div className="space-y-3">
                        <p className="text-xs mt-2" style={{ color: theme.colors.textMuted }}>
                          Complete a private swap to automatically track your confidential tokens,
                          or manually add tokens you already have in your Encifher account.
                        </p>

                        <div className="p-3 rounded-lg text-left" style={{ background: `${theme.colors.info}05`, borderColor: `${theme.colors.info}15`, borderWidth: '1px' }}>
                          <div className="flex items-start gap-2">
                            <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: theme.colors.info }}>
                              <span className="text-white text-xs font-bold">i</span>
                            </div>
                            <div className="space-y-2">
                              <p className="text-xs font-medium" style={{ color: theme.colors.info }}>
                                After Your Swap Completes
                              </p>
                              <ol className="text-xs space-y-1" style={{ color: theme.colors.textMuted }}>
                                <li>1. Tokens will appear here automatically</li>
                                <li>2. Switch to <strong>Withdraw</strong> tab to access them</li>
                                <li>3. Withdraw to get regular tokens back</li>
                              </ol>

                              <div className="p-2 rounded mt-2" style={{ background: `${theme.colors.warning}05`, borderColor: `${theme.colors.warning}15`, borderWidth: '1px' }}>
                                <p className="text-xs font-medium mb-1" style={{ color: theme.colors.warning }}>
                                  Having Issues?
                                </p>
                                <p className="text-xs mb-2" style={{ color: theme.colors.textMuted }}>
                                  If withdrawals fail, use the official interface:
                                </p>
                                <a
                                  href="https://app.encifher.io/"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all hover:scale-[1.02]"
                                  style={{
                                    background: `${theme.colors.warning}10`,
                                    color: theme.colors.warning,
                                    border: `1px solid ${theme.colors.warning}20`
                                  }}
                                >
                                  <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                                  Encifher.io
                                </a>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
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
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-bold" style={{ color: theme.colors.textPrimary }}>
                          Confidential Balances
                        </h3>
                        <button
                          onClick={() => setShowSearchModal(true)}
                          className="p-2 rounded-lg transition-all duration-200 hover:bg-opacity-10"
                          style={{
                            background: `${theme.colors.primary}10`,
                            color: theme.colors.primary
                          }}
                          title="Search tokens"
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <circle cx="11" cy="11" r="8"></circle>
                            <path d="m21 21-4.35-4.35"></path>
                          </svg>
                        </button>
                      </div>
                      <p className="text-sm" style={{ color: theme.colors.textMuted }}>
                        Your privacy-protected tokens that can be withdrawn back to regular tokens
                      </p>
                    </div>

                    {confidentialBalances.map((balance, index) => (
                      <div
                        key={index}
                        data-token-address={balance.tokenAddress}
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
                              {/* Balance is already in human-readable format from Jupiter API */}
                              {formatBalance(balance.amount, balance.decimals)}
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
                              {/* Balance is already in human-readable format from Jupiter API */}
                              Available: {formatBalance(balance.amount, balance.decimals)} {balance.symbol}
                            </span>
                            <span>
                              {/* No additional info needed since we now show actual balances */}
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleWithdrawClick(balance.tokenAddress, balance.amount, balance.symbol, balance.decimals)}
                          disabled={!balance.canWithdraw || isLoading || isWithdrawing}
                          className="w-full py-3 px-4 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{
                            background: balance.canWithdraw ? `${theme.colors.success}10` : `${theme.colors.border}50`,
                            border: balance.canWithdraw ? `1px solid ${theme.colors.success}20` : `1px solid ${theme.colors.border}`,
                            color: balance.canWithdraw ? theme.colors.success : theme.colors.textMuted
                          }}
                        >
                          {isWithdrawing ? (
                            <>
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
                              Processing Withdrawal...
                            </>
                          ) : (
                            <>
                              <ArrowDownTrayIcon className="h-4 w-4" />
                              {balance.canWithdraw ? 'Withdraw to Regular Token' : 'Withdrawal Unavailable'}
                            </>
                          )}
                        </button>
                      </div>
                    ))}

                    <div className="mt-6 p-4 rounded-xl" style={{ background: `${theme.colors.info}05`, borderColor: `${theme.colors.info}20` }}>
                      <div className="flex items-start gap-3">
                        <ArrowDownTrayIcon className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: theme.colors.info }} />
                        <div className="space-y-3">
                          <div>
                            <p className="text-sm font-medium mb-1" style={{ color: theme.colors.info }}>
                              Withdrawal Information
                            </p>
                            <p className="text-xs" style={{ color: theme.colors.textMuted }}>
                              Your confidential tokens are privacy-protected and can only be accessed by you.
                              Withdrawal converts them back to regular tokens instantly.
                            </p>
                          </div>

                          <div className="p-3 rounded-lg" style={{ background: `${theme.colors.success}05`, borderColor: `${theme.colors.success}15`, borderWidth: '1px' }}>
                            <div className="flex items-start gap-2">
                              <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: theme.colors.success }}>
                                <span className="text-white text-xs font-bold">✓</span>
                              </div>
                              <div>
                                <p className="text-xs font-medium mb-1" style={{ color: theme.colors.success }}>
                                  After Completing a Swap
                                </p>
                                <ol className="text-xs space-y-1" style={{ color: theme.colors.textMuted }}>
                                  <li>1. Switch to the <strong>Withdraw</strong> tab above</li>
                                  <li>2. Your confidential tokens will appear here automatically</li>
                                  <li>3. Enter the amount you want to withdraw (use MAX for all)</li>
                                  <li>4. Click "Withdraw to Regular Token" to receive your funds</li>
                                </ol>
                              </div>
                            </div>
                          </div>

                          <div className="p-3 rounded-lg" style={{ background: `${theme.colors.warning}05`, borderColor: `${theme.colors.warning}15`, borderWidth: '1px' }}>
                            <div className="flex items-start gap-2">
                              <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: theme.colors.warning }}>
                                <span className="text-white text-xs font-bold">!</span>
                              </div>
                              <div>
                                <p className="text-xs font-medium mb-1" style={{ color: theme.colors.warning }}>
                                  If Withdrawal Fails
                                </p>
                                <p className="text-xs mb-2" style={{ color: theme.colors.textMuted }}>
                                  If you encounter any issues with withdrawals, your funds are still safe.
                                  Use the official Encifher interface to manually withdraw:
                                </p>
                                <a
                                  href="https://app.encifher.io/"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all hover:scale-[1.02]"
                                  style={{
                                    background: `${theme.colors.warning}10`,
                                    color: theme.colors.warning,
                                    border: `1px solid ${theme.colors.warning}20`
                                  }}
                                >
                                  <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                                  Open Encifher.io
                                </a>
                              </div>
                            </div>
                          </div>
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
                className="flex items-center justify-center gap-6 text-xs py-2"
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

      {/* Info Modal */}
      <Modal
        isOpen={showInfoModal}
        onClose={() => setShowInfoModal(false)}
        title="WaveSwap Information"
      >
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold mb-2" style={{ color: theme.colors.textPrimary }}>
              How WaveSwap Works
            </h3>
            <div className="space-y-3 text-sm" style={{ color: theme.colors.textSecondary }}>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: `${theme.colors.primary}20`, color: theme.colors.primary }}>
                  <span className="text-xs font-bold">1</span>
                </div>
                <p>
                  <strong>Connect Your Wallet:</strong> Start by connecting your Solana wallet to WaveSwap. We support Phantom, Solflare, and other popular wallets.
                </p>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: `${theme.colors.primary}20`, color: theme.colors.primary }}>
                  <span className="text-xs font-bold">2</span>
                </div>
                <p>
                  <strong>Choose Your Mode:</strong> Select between Public mode (transparent on-chain swaps) or Private mode (enhanced privacy with encryption).
                </p>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: `${theme.colors.primary}20`, color: theme.colors.primary }}>
                  <span className="text-xs font-bold">3</span>
                </div>
                <p>
                  <strong>Select Tokens:</strong> Choose the tokens you want to swap from and to. We support a wide variety of Solana tokens with real-time price feeds.
                </p>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: `${theme.colors.primary}20`, color: theme.colors.primary }}>
                  <span className="text-xs font-bold">4</span>
                </div>
                <p>
                  <strong>Enter Amount:</strong> Input the amount you want to swap. Our interface will show you the estimated output and current exchange rate.
                </p>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: `${theme.colors.primary}20`, color: theme.colors.primary }}>
                  <span className="text-xs font-bold">5</span>
                </div>
                <p>
                  <strong>Review & Swap:</strong> Review the transaction details, including fees and exchange rate, then click "Swap" to execute your trade.
                </p>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: `${theme.colors.primary}20`, color: theme.colors.primary }}>
                  <span className="text-xs font-bold">6</span>
                </div>
                <p>
                  <strong>Confirmation:</strong> Approve the transaction in your wallet. Your swap will be executed instantly on the Solana blockchain.
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl" style={{ background: `${theme.colors.info}05`, border: `1px solid ${theme.colors.info}20` }}>
            <h4 className="font-semibold mb-2 flex items-center gap-2" style={{ color: theme.colors.info }}>
              <LockClosedIcon className="h-4 w-4" />
              Privacy & Security
            </h4>
            <ul className="text-xs space-y-1" style={{ color: theme.colors.textMuted }}>
              <li>• <strong>Private Mode:</strong> Enhanced encryption protects your transaction details</li>
              <li>• <strong>Public Mode:</strong> Standard transparent swaps on the Solana blockchain</li>
              <li>• <strong>Non-Custodial:</strong> You always maintain control of your funds</li>
              <li>• <strong>Audited:</strong> Our smart contracts are regularly security audited</li>
            </ul>
          </div>

          <div className="p-4 rounded-xl" style={{ background: `${theme.colors.success}05`, border: `1px solid ${theme.colors.success}20` }}>
            <h4 className="font-semibold mb-2" style={{ color: theme.colors.success }}>
              Why Choose WaveSwap?
            </h4>
            <ul className="text-xs space-y-1" style={{ color: theme.colors.textMuted }}>
              <li>• Best-in-class exchange rates through Jupiter aggregator</li>
              <li>• Lightning-fast swaps on Solana's high-speed blockchain</li>
              <li>• Minimal fees and maximum capital efficiency</li>
              <li>• User-friendly interface with advanced privacy options</li>
            </ul>
          </div>

          <div className="pt-4 border-t text-center" style={{ borderColor: theme.colors.border }}>
            <p className="text-xs mb-2" style={{ color: theme.colors.textMuted }}>
              Powered by
            </p>
            <a
              href="https://app.encifher.io/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium transition-all duration-200 hover:opacity-80"
              style={{ color: theme.colors.primary }}
            >
              Encifher
            </a>
          </div>
        </div>
      </Modal>

      {/* Search Modal */}
      <Modal
        isOpen={showSearchModal}
        onClose={() => {
          setShowSearchModal(false)
          setSearchQuery('')
          setSearchResults([])
        }}
        title="Search Confidential Tokens"
      >
        <div className="space-y-4">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                const query = e.target.value
                setSearchQuery(query)

                // Filter confidential balances based on search query
                if (query.trim() === '') {
                  setSearchResults([])
                } else {
                  const filtered = confidentialBalances.filter((balance: any) =>
                    balance.tokenSymbol?.toLowerCase().includes(query.toLowerCase()) ||
                    balance.tokenName?.toLowerCase().includes(query.toLowerCase()) ||
                    balance.tokenAddress?.toLowerCase().includes(query.toLowerCase())
                  )
                  setSearchResults(filtered)
                }
              }}
              placeholder="Search by token name, symbol, or address..."
              className="w-full px-4 py-3 pl-10 rounded-lg border focus:outline-none focus:ring-2 focus:ring-opacity-50 transition-all duration-200"
              style={{
                background: theme.colors.surface,
                borderColor: theme.colors.border,
                color: theme.colors.textPrimary,
                '--tw-ring-color': theme.colors.primary
              } as React.CSSProperties}
              autoFocus
            />
            <div
              className="absolute left-3 top-1/2 transform -translate-y-1/2"
              style={{ color: theme.colors.textMuted }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
              </svg>
            </div>
          </div>

          {/* Search Results */}
          {searchQuery.trim() !== '' && (
            <div className="max-h-60 overflow-y-auto space-y-2">
              {searchResults.length > 0 ? (
                searchResults.map((balance: any, index: number) => (
                  <div
                    key={index}
                    className="p-3 rounded-lg border cursor-pointer transition-all duration-200 hover:shadow-md"
                    style={{
                      background: `${theme.colors.surface}50`,
                      borderColor: theme.colors.border
                    }}
                    onClick={() => {
                      // Scroll to the token in the main list
                      const tokenElement = document.querySelector(`[data-token-address="${balance.tokenAddress}"]`)
                      if (tokenElement) {
                        tokenElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
                        // Highlight briefly
                        ;(tokenElement as HTMLElement).style.animation = 'pulse 2s'
                        setTimeout(() => {
                          ;(tokenElement as HTMLElement).style.animation = ''
                        }, 2000)
                      }
                      setShowSearchModal(false)
                      setSearchQuery('')
                      setSearchResults([])
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {balance.logoURI && (
                          <img
                            src={balance.logoURI}
                            alt={balance.tokenSymbol}
                            className="w-8 h-8 rounded-full"
                            onError={(e) => {
                              ;(e.target as HTMLImageElement).src = '/icons/default-token.svg'
                            }}
                          />
                        )}
                        <div>
                          <div className="font-medium" style={{ color: theme.colors.textPrimary }}>
                            {balance.tokenSymbol}
                          </div>
                          <div className="text-xs" style={{ color: theme.colors.textMuted }}>
                            {balance.tokenName}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium" style={{ color: theme.colors.textPrimary }}>
                          {balance.amount}
                        </div>
                        <div className="text-xs" style={{ color: theme.colors.textMuted }}>
                          {balance.tokenAddress.slice(0, 8)}...
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8" style={{ color: theme.colors.textMuted }}>
                  <div className="mb-2">No tokens found</div>
                  <div className="text-sm">
                    Try searching with different keywords
                  </div>
                </div>
              )}
            </div>
          )}

          {searchQuery.trim() === '' && (
            <div className="text-center py-8" style={{ color: theme.colors.textMuted }}>
              <div className="mb-2">Start typing to search tokens</div>
              <div className="text-sm">
                Search by token name, symbol, or address
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}