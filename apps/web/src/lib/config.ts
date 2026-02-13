/**
 * Application Configuration
 * 
 * Central configuration file for WaveSwap
 */

export const config = {
  // Solana RPC Configuration
  // Client-side: always proxy through /api/v1/rpc to hide API keys
  // Server-side: use SOLANA_RPC_URL directly (API routes)
  rpc: {
    url: typeof window !== 'undefined'
      ? `${window.location.origin}/api/v1/rpc`
      : (process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'),
    network: process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet',
    fallbackUrls: [
      'https://api.devnet.solana.com',
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

