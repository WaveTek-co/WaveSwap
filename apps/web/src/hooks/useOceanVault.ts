'use client'

/**
 * OceanVault Hooks
 * 
 * Custom React hooks for OceanVault stealth vault operations.
 * These hooks provide easy access to transfer, swap, and staking functionality.
 */

import { useState, useCallback, useMemo } from 'react'
import { PublicKey, Transaction, SystemProgram, ComputeBudgetProgram } from '@solana/web3.js'
import { useMultiWallet } from '@/contexts/MultiWalletContext'
import { useOceanVault, ViewingKeys } from '@/providers/OceanVaultProvider'

// Program IDs
const PROGRAM_IDS = {
  REGISTRY: new PublicKey('6pNpYWSfcVyFaRFQGZHduBSXPZ3CWKG2iV7ve7BUXfJR'),
  STEALTH: new PublicKey('4jFg8uSh4jWkeoz6itdbsD7GadkTYLwfbyfDeNeB5nFX'),
  DEFI: new PublicKey('8Xi4D44Xt3DnT6r8LogM4K9CSt3bHtpc1m21nErGawaA'),
}

const FEE_WALLET = new PublicKey('DNKKC4uCNE55w66GFENJSEo7PYVSDLnSL62jvHoNeeBU')
const FEE_BPS = 10 // 0.1%

// Types
export interface StealthTransferParams {
  recipientSpendPubkey: Uint8Array
  recipientViewPubkey: Uint8Array
  amount: bigint
  memo?: string
}

export interface StealthTransferResult {
  signature: string
  announcementPda: PublicKey
  stealthVaultPda: PublicKey
  ephemeralPubkey: Uint8Array
  viewTag: number
  amount: bigint
  feePaid: bigint
}

export interface SwapQuote {
  inputMint: PublicKey
  outputMint: PublicKey
  inputAmount: bigint
  outputAmount: bigint
  minimumOutput: bigint
  priceImpact: number
  route: string[]
  estimatedFee: bigint
}

export interface StealthSwapParams {
  inputMint: PublicKey
  outputMint: PublicKey
  inputAmount: bigint
  slippageBps?: number
}

export interface StealthSwapResult {
  signature: string
  inputAmount: bigint
  outputAmount: bigint
  priceImpact: number
  feePaid: bigint
}

// Helper functions
export function lamportsToSol(lamports: bigint): number {
  return Number(lamports) / 1_000_000_000
}

export function solToLamports(sol: number): bigint {
  return BigInt(Math.floor(sol * 1_000_000_000))
}

export function formatSol(lamports: bigint, decimals: number = 4): string {
  const sol = lamportsToSol(lamports)
  if (sol >= 1000) {
    return `${(sol / 1000).toFixed(2)}K SOL`
  } else if (sol >= 1) {
    return `${sol.toFixed(decimals)} SOL`
  } else {
    return `${(sol * 1000).toFixed(2)} mSOL`
  }
}

function calculateFeeAmount(amount: bigint, feeBps: number): bigint {
  const fee = (amount * BigInt(feeBps)) / BigInt(10000)
  const minFee = BigInt(1000)
  const maxFee = BigInt(10 * 1_000_000_000)
  if (fee < minFee) return minFee
  if (fee > maxFee) return maxFee
  return fee
}

/**
 * Hook for stealth transfers
 */
export function useStealthTransfer() {
  const multiWallet = useMultiWallet()
  const { viewingKeys } = useOceanVault()
  
  const [isTransferring, setIsTransferring] = useState(false)
  const [lastTransfer, setLastTransfer] = useState<StealthTransferResult | null>(null)
  const [error, setError] = useState<Error | null>(null)

  // Lookup recipient's public keys from registry
  const lookupRecipient = useCallback(
    async (address: PublicKey): Promise<{ spendPubkey: Uint8Array; viewPubkey: Uint8Array } | null> => {
      try {
        const [registryPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('registry'), address.toBuffer()],
          PROGRAM_IDS.REGISTRY
        )
        const registryInfo = await multiWallet.connection.getAccountInfo(registryPda)

        if (!registryInfo || registryInfo.data.length === 0) {
          return null
        }

        const data = registryInfo.data

        if (data.length < 13 + 64) {
          return null
        }

        const spendPubkey = new Uint8Array(data.slice(13, 45))
        const viewPubkey = new Uint8Array(data.slice(45, 77))

        return { spendPubkey, viewPubkey }
      } catch (err) {
        console.error('Error looking up recipient:', err)
        return null
      }
    },
    [multiWallet.connection]
  )

  // Send stealth transfer
  const sendTransfer = useCallback(
    async (params: StealthTransferParams): Promise<StealthTransferResult> => {
      if (!multiWallet.connected || !multiWallet.publicKey || !multiWallet.signTransaction) {
        throw new Error('Wallet not connected')
      }

      if (!viewingKeys) {
        throw new Error('Viewing keys not initialized')
      }

      setIsTransferring(true)
      setError(null)

      try {
        // Import crypto libraries dynamically
        const { sha3_256 } = await import('js-sha3')
        const { ed25519 } = await import('@noble/curves/ed25519')

        // Generate ephemeral keypair
        const ephemeralPrivkey = new Uint8Array(32)
        crypto.getRandomValues(ephemeralPrivkey)
        const ephemeralPubkey = ed25519.getPublicKey(ephemeralPrivkey)

        // Compute shared secret and view tag
        const sharedSecretInput = Buffer.concat([
          Buffer.from(ephemeralPubkey),
          Buffer.from(params.recipientViewPubkey),
        ])
        const sharedSecret = sha3_256(sharedSecretInput)
        const viewTag = parseInt(sharedSecret.slice(0, 2), 16)

        // Derive stealth pubkey
        const stealthDerivation = sha3_256(
          Buffer.concat([
            Buffer.from(sharedSecret, 'hex'),
            Buffer.from(params.recipientSpendPubkey),
          ])
        )
        const stealthPubkey = new Uint8Array(Buffer.from(stealthDerivation, 'hex'))

        // Derive PDAs
        const [announcementPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('announcement'), multiWallet.publicKey.toBuffer()],
          PROGRAM_IDS.STEALTH
        )

        const [stealthVaultPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('stealth_vault'), Buffer.from(stealthPubkey)],
          PROGRAM_IDS.STEALTH
        )

        // Calculate fee
        const fee = calculateFeeAmount(params.amount, FEE_BPS)

        // Build transaction
        const tx = new Transaction()

        tx.add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })
        )

        // Pay fee
        tx.add(
          SystemProgram.transfer({
            fromPubkey: multiWallet.publicKey,
            toPubkey: FEE_WALLET,
            lamports: Number(fee),
          })
        )

        // Transfer to stealth vault
        tx.add(
          SystemProgram.transfer({
            fromPubkey: multiWallet.publicKey,
            toPubkey: stealthVaultPda,
            lamports: Number(params.amount),
          })
        )

        tx.feePayer = multiWallet.publicKey
        const { blockhash } = await multiWallet.connection.getLatestBlockhash()
        tx.recentBlockhash = blockhash

        const signedTx = await multiWallet.signTransaction(tx)
        const signature = await multiWallet.connection.sendRawTransaction(signedTx.serialize())
        await multiWallet.connection.confirmTransaction(signature, 'confirmed')

        const result: StealthTransferResult = {
          signature,
          announcementPda,
          stealthVaultPda,
          ephemeralPubkey: new Uint8Array(ephemeralPubkey),
          viewTag,
          amount: params.amount,
          feePaid: fee,
        }

        setLastTransfer(result)
        return result
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        setError(error)
        throw error
      } finally {
        setIsTransferring(false)
      }
    },
    [multiWallet, viewingKeys]
  )

  return {
    isTransferring,
    lastTransfer,
    error,
    sendTransfer,
    lookupRecipient,
  }
}

/**
 * Hook for stealth swaps (via Jupiter)
 */
export function useStealthSwap() {
  const multiWallet = useMultiWallet()
  
  const [quote, setQuote] = useState<SwapQuote | null>(null)
  const [isQuoting, setIsQuoting] = useState(false)
  const [isSwapping, setIsSwapping] = useState(false)
  const [lastSwap, setLastSwap] = useState<StealthSwapResult | null>(null)
  const [error, setError] = useState<Error | null>(null)

  // Supported tokens - Use mainnet mints for Jupiter API (it only works on mainnet)
  const supportedTokens = useMemo(() => [
    {
      mint: new PublicKey('So11111111111111111111111111111111111111112'),
      symbol: 'SOL',
      name: 'Solana',
      decimals: 9,
    },
    {
      // Mainnet USDC - Jupiter only works on mainnet
      mint: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
    },
    {
      // Mainnet USDT
      mint: new PublicKey('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'),
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 6,
    },
  ], [])

  // Get swap quote from Jupiter
  const getQuote = useCallback(
    async (params: StealthSwapParams): Promise<SwapQuote> => {
      setIsQuoting(true)
      setError(null)

      try {
        const response = await fetch(
          `https://quote-api.jup.ag/v6/quote?` +
          `inputMint=${params.inputMint.toBase58()}&` +
          `outputMint=${params.outputMint.toBase58()}&` +
          `amount=${params.inputAmount.toString()}&` +
          `slippageBps=${params.slippageBps || 100}`
        )

        if (!response.ok) {
          throw new Error('Failed to get quote from Jupiter')
        }

        const data = await response.json()
        
        const oceanVaultFee = calculateFeeAmount(params.inputAmount, FEE_BPS)
        
        const swapQuote: SwapQuote = {
          inputMint: params.inputMint,
          outputMint: params.outputMint,
          inputAmount: params.inputAmount,
          outputAmount: BigInt(data.outAmount),
          minimumOutput: BigInt(data.otherAmountThreshold || data.outAmount),
          priceImpact: parseFloat(data.priceImpactPct || '0'),
          route: data.routePlan?.map((step: any) => step.swapInfo?.label || 'Unknown') || [],
          estimatedFee: oceanVaultFee,
        }

        setQuote(swapQuote)
        return swapQuote
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        setError(error)
        throw error
      } finally {
        setIsQuoting(false)
      }
    },
    []
  )

  // Execute swap
  const executeSwap = useCallback(
    async (params: StealthSwapParams): Promise<StealthSwapResult> => {
      if (!multiWallet.connected || !multiWallet.publicKey || !multiWallet.signTransaction) {
        throw new Error('Wallet not connected')
      }

      setIsSwapping(true)
      setError(null)

      try {
        // Get quote first if not already available
        let currentQuote = quote
        if (!currentQuote || 
            currentQuote.inputMint.toBase58() !== params.inputMint.toBase58() ||
            currentQuote.outputMint.toBase58() !== params.outputMint.toBase58()) {
          currentQuote = await getQuote(params)
        }

        // Get swap instruction from Jupiter
        const swapResponse = await fetch('https://quote-api.jup.ag/v6/swap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quoteResponse: {
              inputMint: params.inputMint.toBase58(),
              outputMint: params.outputMint.toBase58(),
              inAmount: params.inputAmount.toString(),
              outAmount: currentQuote.outputAmount.toString(),
              otherAmountThreshold: currentQuote.minimumOutput.toString(),
              swapMode: 'ExactIn',
              slippageBps: params.slippageBps || 100,
            },
            userPublicKey: multiWallet.publicKey.toBase58(),
            wrapAndUnwrapSol: true,
          }),
        })

        if (!swapResponse.ok) {
          throw new Error('Failed to get swap transaction from Jupiter')
        }

        const swapData = await swapResponse.json()
        
        // Decode and sign transaction
        const swapTxBuf = Buffer.from(swapData.swapTransaction, 'base64')
        const transaction = Transaction.from(swapTxBuf)
        
        // Add fee transfer
        const fee = calculateFeeAmount(params.inputAmount, FEE_BPS)
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: multiWallet.publicKey,
            toPubkey: FEE_WALLET,
            lamports: Number(fee),
          })
        )

        const signedTx = await multiWallet.signTransaction(transaction)
        const signature = await multiWallet.connection.sendRawTransaction(signedTx.serialize())
        await multiWallet.connection.confirmTransaction(signature, 'confirmed')

        const result: StealthSwapResult = {
          signature,
          inputAmount: params.inputAmount,
          outputAmount: currentQuote.outputAmount,
          priceImpact: currentQuote.priceImpact,
          feePaid: fee,
        }

        setLastSwap(result)
        return result
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        setError(error)
        throw error
      } finally {
        setIsSwapping(false)
      }
    },
    [multiWallet, quote, getQuote]
  )

  const clearQuote = useCallback(() => {
    setQuote(null)
  }, [])

  return {
    quote,
    isQuoting,
    isSwapping,
    lastSwap,
    error,
    supportedTokens,
    getQuote,
    executeSwap,
    clearQuote,
  }
}

/**
 * Hook for fee calculations
 */
export function useFees() {
  const calculateFee = useCallback(
    (operation: 'transfer' | 'swap' | 'stake' | 'unstake' | 'claim', amount: bigint) => {
      const oceanVaultFee = calculateFeeAmount(amount, FEE_BPS)
      
      const networkFees: Record<string, bigint> = {
        transfer: BigInt(10000),
        swap: BigInt(25000),
        stake: BigInt(7000),
        unstake: BigInt(7000),
        claim: BigInt(5000),
      }
      const networkFee = networkFees[operation] || BigInt(5000)

      const totalFee = oceanVaultFee + networkFee
      const amountAfterFee = amount > oceanVaultFee ? amount - oceanVaultFee : BigInt(0)

      return {
        operation,
        baseAmount: amount,
        oceanVaultFee,
        networkFee,
        totalFee,
        amountAfterFee,
        feePercentage: Number(oceanVaultFee * BigInt(10000) / amount) / 100,
      }
    },
    []
  )

  const formatFee = useCallback((fee: bigint): string => {
    return formatSol(fee)
  }, [])

  return {
    calculateFee,
    formatFee,
    feeWallet: FEE_WALLET,
    feeBps: FEE_BPS,
  }
}

export default { useStealthTransfer, useStealthSwap, useFees }
