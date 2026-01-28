// Core SDK exports
export { WaveSwap } from './client'
export type { WaveSwapConfig, Network } from './types'
export { DEFAULT_CONFIG } from './types'

// Utility exports
export * from './utils'

// Error exports
export { WaveSwapError } from './errors/waveswap-error'

// Service exports
export { QuoteService } from './services/quote'
export { SwapService } from './services/swap'
export { ProgramService } from './services/program'
export { WebSocketService } from './services/websocket'

// Stealth SDK exports (OceanVault integration)
export * from './stealth'

// Re-export commonly used types
export type {
  SwapRequest,
  SwapResponse,
  QuoteRequest,
  QuoteResponse,
  SwapStatus,
  Token,
  Route,
  SwapDetails,
  TransactionStatus,
  WaveSwapError as WaveSwapErrorType,
  JupiterQuoteRequest,
  JupiterQuoteResponse,
  JupiterSwapRequest,
  JupiterSwapResponse,
} from './types'