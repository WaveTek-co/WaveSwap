import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSwap } from '../useSwap'

// Mock the Encifher SDK
vi.mock('encifher-swap-sdk', () => ({
  Encifher: {
    createClient: vi.fn(() => ({
      getBalance: vi.fn(),
      getUserTokenMints: vi.fn(),
      getDepositTxn: vi.fn(),
      getWithdrawTxn: vi.fn(),
      getSwapQuote: vi.fn(),
      getSwapTxn: vi.fn(),
      executeSwapTxn: vi.fn(),
      getMessageToSign: vi.fn(),
      getOrderStatus: vi.fn(),
    })),
  },
}))

// Mock the Jupiter API
vi.mock('@/lib/jupiter', () => ({
  JupiterAPI: {
    createClient: vi.fn(() => ({
      getQuote: vi.fn(),
    })),
  },
}))

// Mock the Solana web3.js
vi.mock('@solana/web3.js', () => ({
  Connection: vi.fn(() => ({})),
  PublicKey: vi.fn((key) => ({ toString: () => key })),
  Transaction: vi.fn(),
}))

// Mock the wallet adapter
vi.mock('@/hooks/useWalletAdapter', () => ({
  useConnection: () => ({
    connection: {},
  }),
  useWallet: () => ({
    publicKey: { toString: () => 'test-wallet-public-key' },
    signTransaction: vi.fn(),
    sendTransaction: vi.fn(),
  }),
}))

describe('useSwap Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Basic State Management', () => {
    it('initializes with default values', () => {
      const { result } = renderHook(() => useSwap(false, null))

      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBe('')
      expect(result.current.inputAmount).toBe('')
      expect(result.current.outputAmount).toBe('')
      expect(result.current.inputToken).toBe(null)
      expect(result.current.outputToken).toBe(null)
      expect(result.current.quote).toBe(null)
    })

    it('sets input token correctly', () => {
      const { result } = renderHook(() => useSwap(false, null))
      const mockToken = {
        address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        chainId: 101,
        decimals: 6,
        name: 'USD Coin',
        symbol: 'USDC',
        logoURI: 'https://example.com/usdc.png',
        isConfidentialSupported: true,
      }

      act(() => {
        result.current.setInputToken(mockToken)
      })

      expect(result.current.inputToken).toEqual(mockToken)
    })

    it('sets output token correctly', () => {
      const { result } = renderHook(() => useSwap(false, null))
      const mockToken = {
        address: 'WAVE-token-address-here',
        chainId: 101,
        decimals: 9,
        name: 'Wave',
        symbol: 'WAVE',
        logoURI: 'https://example.com/wave.png',
        isConfidentialSupported: true,
      }

      act(() => {
        result.current.setOutputToken(mockToken)
      })

      expect(result.current.outputToken).toEqual(mockToken)
    })

    it('sets input amount correctly', () => {
      const { result } = renderHook(() => useSwap(false, null))

      act(() => {
        result.current.setInputAmount('100')
      })

      expect(result.current.inputAmount).toBe('100')
    })
  })

  describe('Privacy Mode Functionality', () => {
    it('enables private swap when privacy mode is on', () => {
      const { result } = renderHook(() => useSwap(true, 'test-wallet-public-key'))

      expect(result.current.isPrivacyMode).toBe(true)
    })

    it('disables private swap when privacy mode is off', () => {
      const { result } = renderHook(() => useSwap(false, 'test-wallet-public-key'))

      expect(result.current.isPrivacyMode).toBe(false)
    })

    it('shows confidential tokens in privacy mode', async () => {
      const { result } = renderHook(() => useSwap(true, 'test-wallet-public-key'))

      const mockPrivateTokens = [
        {
          tokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          amount: '1000000000',
          symbol: 'USDC',
          decimals: 6,
        }
      ]

      // Mock the API call for confidential balances
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          confidentialBalances: mockPrivateTokens
        })
      })

      await act(async () => {
        await result.current.refreshBalances()
      })

      // Should fetch private balances when in privacy mode
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/confidential/balances')
      )
    })
  })

  describe('Quote Functionality', () => {
    it('fetches quote for regular swap', async () => {
      const { result } = renderHook(() => useSwap(false, 'test-wallet-public-key'))

      const mockInputToken = {
        address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        chainId: 101,
        decimals: 6,
        name: 'USD Coin',
        symbol: 'USDC',
        logoURI: 'https://example.com/usdc.png',
        isConfidentialSupported: true,
      }

      const mockOutputToken = {
        address: 'WAVE-token-address-here',
        chainId: 101,
        decimals: 9,
        name: 'Wave',
        symbol: 'WAVE',
        logoURI: 'https://example.com/wave.png',
        isConfidentialSupported: true,
      }

      const mockQuote = {
        inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        outputMint: 'WAVE-token-address-here',
        inputAmount: '1000000',
        outputAmount: '100000000',
        priceImpactPct: 0.5,
      }

      // Mock the API call for quote
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockQuote)
      })

      act(() => {
        result.current.setInputToken(mockInputToken)
        result.current.setOutputToken(mockOutputToken)
        result.current.setInputAmount('1')
      })

      await act(async () => {
        // Trigger quote fetch by waiting for debounced call
        await new Promise(resolve => setTimeout(resolve, 600))
      })

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/jupiter/swap/v1/quote')
      )
    })

    it('fetches quote for private swap', async () => {
      const { result } = renderHook(() => useSwap(true, 'test-wallet-public-key'))

      const mockQuote = {
        inputTokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        outputTokenAddress: 'WAVE-token-address-here',
        inputAmount: '1000000',
        outputAmount: '100000000',
        feeAmount: '10000',
      }

      // Mock the API call for private quote
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockQuote)
      })

      await act(async () => {
        // Should call private quote API when in privacy mode
        await result.current.getQuote()
      })

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/encifher/quote')
      )
    })
  })

  describe('Swap Execution', () => {
    it('executes regular swap correctly', async () => {
      const { result } = renderHook(() => useSwap(false, 'test-wallet-public-key'))

      const mockSwapResponse = {
        swapTransaction: 'base64-encoded-transaction',
        lastValidBlockHeight: 123456,
      }

      // Mock the API call for swap
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockSwapResponse)
      })

      const mockQuote = {
        inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        outputMint: 'WAVE-token-address-here',
        inputAmount: '1000000',
        outputAmount: '100000000',
        priceImpactPct: 0.5,
      }

      await act(async () => {
        await result.current.swap(mockQuote)
      })

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/jupiter/swap/v1/swap'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      )
    })

    it('executes private swap correctly', async () => {
      const { result } = renderHook(() => useSwap(true, 'test-wallet-public-key'))

      const mockPrivateSwapResponse = {
        orderId: 'order-123',
        status: 'pending',
      }

      // Mock the API call for private swap
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockPrivateSwapResponse)
      })

      const mockQuote = {
        inputTokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        outputTokenAddress: 'WAVE-token-address-here',
        inputAmount: '1000000',
        outputAmount: '100000000',
        feeAmount: '10000',
      }

      await act(async () => {
        await result.current.swap(mockQuote)
      })

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/swap/execute-private'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      )
    })
  })

  describe('Error Handling', () => {
    it('handles quote fetch errors', async () => {
      const { result } = renderHook(() => useSwap(false, 'test-wallet-public-key'))

      // Mock failed API call
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      await act(async () => {
        await result.current.getQuote()
      })

      expect(result.current.error).toContain('Network error')
      expect(result.current.isLoading).toBe(false)
    })

    it('handles swap execution errors', async () => {
      const { result } = renderHook(() => useSwap(false, 'test-wallet-public-key'))

      // Mock failed API call
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Insufficient balance' })
      })

      const mockQuote = {
        inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        outputMint: 'WAVE-token-address-here',
        inputAmount: '1000000',
        outputAmount: '100000000',
        priceImpactPct: 0.5,
      }

      await act(async () => {
        await result.current.swap(mockQuote)
      })

      expect(result.current.error).toContain('Insufficient balance')
      expect(result.current.isLoading).toBe(false)
    })

    it('clears errors correctly', () => {
      const { result } = renderHook(() => useSwap(false, 'test-wallet-public-key'))

      // Simulate an error state
      act(() => {
        result.current.setError('Test error')
      })

      expect(result.current.error).toBe('Test error')

      act(() => {
        result.current.clearError()
      })

      expect(result.current.error).toBe('')
    })
  })

  describe('Balance Management', () => {
    it('refreshes balances correctly', async () => {
      const { result } = renderHook(() => useSwap(false, 'test-wallet-public-key'))

      const mockBalances = new Map([
        ['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', '1000.50'],
        ['WAVE-token-address-here', '500.00'],
      ])

      // Mock successful balance fetch
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ balances: Object.fromEntries(mockBalances) })
      })

      await act(async () => {
        await result.current.refreshBalances()
      })

      expect(result.current.balances).toEqual(mockBalances)
    })

    it('handles balance refresh errors', async () => {
      const { result } = renderHook(() => useSwap(false, 'test-wallet-public-key'))

      // Mock failed balance fetch
      global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch balances'))

      await act(async () => {
        await result.current.refreshBalances()
      })

      // Should not crash, just keep empty balances
      expect(result.current.balances.size).toBe(0)
    })
  })

  describe('Progress Tracking', () => {
    it('updates progress during swap', async () => {
      const { result } = renderHook(() => useSwap(false, 'test-wallet-public-key'))

      const mockSwapResponse = {
        swapTransaction: 'base64-encoded-transaction',
      }

      // Mock the API call for swap
      global.fetch = vi.fn().mockImplementation(() => {
        // Simulate progress update
        setTimeout(() => {
          act(() => {
            result.current.setProgress({
              status: 'processing',
              message: 'Processing transaction...',
              percentage: 50,
            })
          })
        }, 100)

        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockSwapResponse)
        })
      })

      const mockQuote = {
        inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        outputMint: 'WAVE-token-address-here',
        inputAmount: '1000000',
        outputAmount: '100000000',
        priceImpactPct: 0.5,
      }

      act(() => {
        result.current.swap(mockQuote)
      })

      // Should show loading state
      expect(result.current.isLoading).toBe(true)
      expect(result.current.progress?.status).toBe('processing')
    })
  })
})