/**
 * Application Configuration
 * 
 * Central configuration file for WaveSwap
 */

export const config = {
  // Solana RPC Configuration
  rpc: {
    url: process.env.NEXT_PUBLIC_HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com',
    network: process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'mainnet-beta',
    // Fallback RPC endpoints for redundancy - all public endpoints that don't require API keys
    fallbackUrls: [
      'https://api.mainnet-beta.solana.com',
      'https://solana-api.projectserum.com',
      'https://rpc.ankr.com/solana', // Keep as last fallback - may have rate limits
      'https://solana-public.nodeinfra.com:8899' // Additional public endpoint
    ]
  },

  // Jupiter API Configuration
  jupiter: {
    // Using official @jup-ag/api SDK
    // Docs: https://hub.jup.ag/docs/swap-api/
    sdk: '@jup-ag/api',
  },

  // Arcium Configuration (for confidential swaps)
  arcium: {
    enabled: true,
    // Add Arcium-specific config when available
  },

  // Swap Configuration
  swap: {
    defaultSlippageBps: 50, // 0.5%
    maxSlippageBps: 1000,   // 10%
    maintenanceMode: false, // Maintenance mode toggle
  },
} as const

export type Config = typeof config

