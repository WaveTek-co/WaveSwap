import { PublicKey } from '@solana/web3.js'

/**
 * Convert lamports to SOL
 */
export function lamportsToSol(lamports: number | bigint): number {
  return Number(lamports) / 1e9
}

/**
 * Convert SOL to lamports
 */
export function solToLamports(sol: number): bigint {
  return BigInt(Math.floor(sol * 1e9))
}

/**
 * Get token symbol from mint address (common tokens)
 */
export function getTokenSymbol(mint: string | PublicKey): string {
  const mintStr = typeof mint === 'string' ? mint : mint.toBase58()
  const tokenSymbols: Record<string, string> = {
    'So11111111111111111111111111111111111111112': 'SOL',
    'EPjFWdd5Au17hunJyHyer4hoi6UcsbkxNmnpDnJ55ip2': 'USDC',
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'USDT',
    'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': 'BONK',
  }
  return tokenSymbols[mintStr] || 'Unknown'
}

/**
 * Get token decimals from mint address (common tokens)
 */
export function getTokenDecimals(mint: string | PublicKey): number {
  const mintStr = typeof mint === 'string' ? mint : mint.toBase58()
  const tokenDecimals: Record<string, number> = {
    'So11111111111111111111111111111111111111112': 9,
    'EPjFWdd5Au17hunJyHyer4hoi6UcsbkxNmnpDnJ55ip2': 6,
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 6,
    'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': 5,
  }
  return tokenDecimals[mintStr] || 0
}

/**
 * Calculate fee with basis points
 */
export function calculateFee(amount: number, bps: number): number {
  return (amount * bps) / 10000
}

/**
 * Validate swap parameters
 */
export function validateSwapParams(
  inputToken: string | PublicKey,
  outputToken: string | PublicKey,
  inputAmount: number,
  slippageBps?: number
): { valid: boolean; error?: string } {
  if (!inputToken || !outputToken) {
    return { valid: false, error: 'Invalid token addresses' }
  }

  if (inputAmount <= 0) {
    return { valid: false, error: 'Invalid input amount' }
  }

  if (slippageBps !== undefined && (slippageBps < 0 || slippageBps > 1000)) {
    return { valid: false, error: 'Slippage must be between 0 and 1000 bps' }
  }

  if (inputToken === outputToken) {
    return { valid: false, error: 'Input and output tokens must be different' }
  }

  return { valid: true }
}

/**
 * Generate intent ID
 */
export function generateIntentId(): string {
  return `intent_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
}

export function formatTokenAmount(amount: number, decimals: number): string {
  return (amount / Math.pow(10, decimals)).toFixed(decimals)
}

export function formatAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`
}

// Default export with all utilities
export const utils = {
  lamportsToSol,
  solToLamports,
  getTokenSymbol,
  getTokenDecimals,
  calculateFee,
  validateSwapParams,
  generateIntentId,
  formatAddress,
  formatTokenAmount,
}