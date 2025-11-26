/**
 * Jupiter Token Search API
 *
 * Provides token search functionality when the official Jupiter tokens API is unavailable.
 * Returns a curated list of popular Solana tokens with support for filtering.
 */

import { NextRequest, NextResponse } from 'next/server'

// Popular Solana tokens with their metadata
const POPULAR_TOKENS = [
  {
    address: 'So11111111111111111111111111111111111111112',
    chainId: 101,
    decimals: 9,
    name: 'Wrapped SOL',
    symbol: 'SOL',
    logoURI: 'https://img-cdn.jup.ag/tokens/So11111111111111111111111111111111111111112.png',
    tags: ['native', 'solana'],
  },
  {
    address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    chainId: 101,
    decimals: 6,
    name: 'USD Coin',
    symbol: 'USDC',
    logoURI: 'https://img-cdn.jup.ag/tokens/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v.png',
    tags: ['stablecoin', 'usd'],
  },
  {
    address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    chainId: 101,
    decimals: 6,
    name: 'Tether USD',
    symbol: 'USDT',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png',
    tags: ['stablecoin', 'usd'],
  },
  {
    address: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
    chainId: 101,
    decimals: 9,
    name: 'Marinade SOL',
    symbol: 'mSOL',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png',
    tags: ['lsts', 'solana'],
  },
  {
    address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    chainId: 101,
    decimals: 5,
    name: 'Bonk',
    symbol: 'BONK',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263/logo.png',
    tags: ['meme'],
  },
  {
    address: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
    chainId: 101,
    decimals: 6,
    name: 'Raydium',
    symbol: 'RAY',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R/logo.png',
    tags: ['defi', 'dex'],
  },
  {
    address: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
    chainId: 101,
    decimals: 6,
    name: 'Jupiter',
    symbol: 'JUP',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN/logo.png',
    tags: ['defi', 'dex'],
  },
  {
    address: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',
    chainId: 101,
    decimals: 6,
    name: 'Jupiter Staked SOL',
    symbol: 'jitoSOL',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn/logo.png',
    tags: ['lsts', 'solana'],
  },
  {
    address: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr',
    chainId: 101,
    decimals: 9,
    name: 'Tensor',
    symbol: 'TNSR',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr/logo.png',
    tags: ['nft', 'defi'],
  },
  {
    address: 'WPiBRzZ1xSoNJjmwB9WZoXxVLqJQZBCXQrswGEZNSUK',
    chainId: 101,
    decimals: 9,
    name: 'W',
    symbol: 'W',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/WPiBRzZ1xSoNJjmwB9WZoXxVLqJQZBCXQrswGEZNSUK/logo.png',
    tags: ['meme'],
  },
  {
    address: 'DCKYRJbiLHZQaLwsR5p9w4GKNvR26ZE1kmtCWpUvNmB',
    chainId: 101,
    decimals: 6,
    name: 'Drift',
    symbol: 'DRIFT',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/DCKYRJbiLHZQaLwsR5p9w4GKNvR26ZE1kmtCWpUvNmB/logo.png',
    tags: ['defi', 'perpetuals'],
  },
  {
    address: 'SENDdNQtujpJeRXkVHkkKXwdpCbeucVCYcJeYJHLffe',
    chainId: 101,
    decimals: 9,
    name: 'Send',
    symbol: 'SEND',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/SENDdNQtujpJeRXkVHkkKXwdpCbeucVCYcJeYJHLffe/logo.png',
    tags: ['social'],
  },
  {
    address: 'Hfso7pVSRKGhMRyMoZ2JUpbzayVVLY4LJQqb7L1B1FML',
    chainId: 101,
    decimals: 6,
    name: 'Honey',
    symbol: 'HONEY',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Hfso7pVSRKGhMRyMoZ2JUpbzayVVLY4LJQqb7L1B1FML/logo.png',
    tags: ['stablecoin', 'bsc'],
  },
  {
    address: '9nEnbUuGBfhhLhqCmLKEA578Vdqg9GNVVErQt2qa5DS',
    chainId: 101,
    decimals: 6,
    name: 'Atlas',
    symbol: 'ATLAS',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/9nEnbUuGBfhhLhqCmLKEA578Vdqg9GNVVErQt2qa5DS/logo.png',
    tags: ['gaming', 'staratlas'],
  },
  {
    address: 'PoRMzmAnKygNbzUmby8uwGcdq3gqzJX4tUXQyamAJE3E',
    chainId: 101,
    decimals: 6,
    name: 'Pollux',
    symbol: 'POLIS',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/PoRMzmAnKygNbzUmby8uwGcdq3gqzJX4tUXQyamAJE3E/logo.png',
    tags: ['gaming', 'staratlas'],
  },
  {
    address: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
    chainId: 101,
    decimals: 9,
    name: 'WaveSwap',
    symbol: 'WAVE',
    logoURI: 'https://img-cdn.jup.ag/tokens/9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM.png',
    tags: ['defi', 'dex'],
  },
  {
    address: 'WeaL1thsNAUSLjJgmqrjhmTkpgLiu6Q9tmvAFLc2W7Rt',
    chainId: 101,
    decimals: 9,
    name: 'Wealth Token',
    symbol: 'WEALTH',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/WeaL1thsNAUSLjJgmqrjhmTkpgLiu6Q9tmvAFLc2W7Rt/logo.png',
    tags: ['defi'],
  },
  {
    address: 'zEc1pBwgY1CHwGhVmeU52sreu3v9UtQmRzKPAGBmfexr',
    chainId: 101,
    decimals: 8,
    name: 'Zcash Bridge Token',
    symbol: 'ZEC',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/zEc1pBwgY1CHwGhVmeU52sreu3v9UtQmRzKPAGBmfexr/logo.png',
    tags: ['bridge', 'privacy'],
  }
]

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('query')?.toLowerCase().trim()

    console.log(`[Token Search] Search query: "${query}"`)

    if (!query || query.length < 1) {
      // Return empty result for empty queries
      return NextResponse.json([])
    }

    // Filter tokens based on query
    const filteredTokens = POPULAR_TOKENS.filter(token => {
      const symbolMatch = token.symbol.toLowerCase().includes(query)
      const nameMatch = token.name.toLowerCase().includes(query)
      const addressMatch = token.address.toLowerCase().includes(query)

      return symbolMatch || nameMatch || addressMatch
    })

    // Sort results: exact symbol match first, then partial matches
    const sortedTokens = filteredTokens.sort((a, b) => {
      const aSymbol = a.symbol.toLowerCase()
      const bSymbol = b.symbol.toLowerCase()

      // Exact symbol match
      if (aSymbol === query) return -1
      if (bSymbol === query) return 1

      // Symbol starts with query
      const aStartsWith = aSymbol.startsWith(query)
      const bStartsWith = bSymbol.startsWith(query)

      if (aStartsWith && !bStartsWith) return -1
      if (!aStartsWith && bStartsWith) return 1

      // Alphabetical by symbol
      return aSymbol.localeCompare(bSymbol)
    })

    // Limit results to prevent large responses
    const limitedTokens = sortedTokens.slice(0, 20)

    console.log(`[Token Search] Found ${limitedTokens.length} tokens for query "${query}"`)

    return NextResponse.json(limitedTokens)

  } catch (error) {
    console.error('[Token Search] Error:', error)

    // Return empty array on error
    return NextResponse.json({
      error: 'Token search failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// Handle OPTIONS requests for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  })
}