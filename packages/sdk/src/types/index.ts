import type { WalletAdapter } from '@solana/wallet-adapter-base'
import type { Connection, PublicKey, Signer, Transaction } from '@solana/web3.js'
import type { Program } from '@coral-xyz/anchor'

export type Network = 'devnet' | 'testnet' | 'mainnet-beta'

export interface WaveSwapConfig {
  network: Network
  rpcEndpoint: string
  commitment?: 'processed' | 'confirmed' | 'finalized'
  wallet?: WalletAdapter
  apiEndpoint?: string
  privacyByDefault?: boolean
  maxRetries?: number
  timeout?: number
}

export const DEFAULT_CONFIG: Partial<WaveSwapConfig> = {
  network: 'devnet',
  commitment: 'confirmed',
  privacyByDefault: true,
  maxRetries: 3,
  timeout: 30000,
}

export interface Token {
  symbol: string
  mint: PublicKey
  decimals: number
  name: string
  logoURI?: string
  isVerified?: boolean
}

export interface Route {
  id: number
  name: string
  description?: string
  isActive: boolean
  priority: number
  minAmount: number
  maxAmount: number
  supportedTokens: PublicKey[]
}

export interface SwapRequest {
  inputToken: PublicKey | string
  outputToken: PublicKey | string
  inputAmount: number | string
  slippageBps?: number
  privacyMode?: boolean
  user?: PublicKey
}

export interface QuoteRequest {
  inputToken: PublicKey | string
  outputToken: PublicKey | string
  inputAmount: number | string
  slippageBps?: number
  privacyMode?: boolean
}

export interface QuoteResponse {
  inputAmount: string
  outputAmount: string
  priceImpact: string
  fee: {
    baseBps: number
    privacyBps: number
    totalBps: number
  }
  routes: Route[]
  timestamp: number
  validFor: number
  routeId?: number
}

export interface SwapResponse {
  intentId: string
  status: SwapStatus
  inputAmount: string
  estimatedOutput: string
  fee: string
  privacyFee: string
  estimatedTime: number
  confirmation: {
    authToken: string
    validUntil: string
  }
}

export type SwapStatus =
  | 'submitted'
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'expired'

export interface SwapDetails {
  intentId: string
  userAddress: string
  inputToken: string
  outputToken: string
  inputAmount: string
  outputAmount?: string
  status: SwapStatus
  privacyMode: boolean
  feeBps: number
  routeId?: number
  slippageBps: number
  txHash?: string
  createdAt: string
  updatedAt: string
  settledAt?: string
  stages: SwapStage[]
  error?: string
}

export interface SwapStage {
  name: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped'
  startedAt: string
  completedAt?: string
  error?: string
}

export interface TransactionStatus {
  signature: string
  status: 'pending' | 'confirmed' | 'finalized' | 'failed'
  confirmationStatus?: 'confirmed' | 'finalized'
  blockTime?: number
  slot?: number
  error?: string
}

export interface WalletInfo {
  publicKey: PublicKey
  connected: boolean
  connecting: boolean
}

export interface SwapIntent {
  id: string
  onStatusChange: (callback: (status: SwapStatus, details?: SwapDetails) => void) => () => void
  wait: () => Promise<SwapDetails>
  cancel: () => Promise<void>
  getStatus: () => Promise<SwapDetails>
}

export interface WaveSwapError extends Error {
  code: string
  details?: Record<string, any>
}

export interface ProgramAccounts {
  swapRegistry: PublicKey
  authority: PublicKey
  feeRecipient: PublicKey
  vaults: Record<string, PublicKey>
}

export interface APIResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: Record<string, any>
  }
}

export interface PaginationParams {
  limit?: number
  offset?: number
  before?: string
  after?: string
}

export interface PaginatedResponse<T> {
  items: T[]
  pagination: {
    limit: number
    offset: number
    hasMore: boolean
    total?: number
  }
}

// Event types
export interface SwapEvent {
  type: 'swap_submitted' | 'swap_completed' | 'swap_failed' | 'swap_cancelled'
  data: {
    intentId: string
    user: PublicKey
    inputToken: PublicKey
    outputToken: PublicKey
    inputAmount: number
    outputAmount?: number
    status: SwapStatus
    timestamp: number
    error?: string
  }
}

export interface WebSocketConfig {
  endpoint?: string
  autoReconnect?: boolean
  maxReconnectAttempts?: number
  reconnectDelay?: number
}

// Re-export Jupiter API types
export type { QuoteRequest as JupiterQuoteRequest, QuoteResponse as JupiterQuoteResponse, RoutePlan, SwapInfo } from './quote'
export type { SwapRequest as JupiterSwapRequest, SwapResponse as JupiterSwapResponse, SwapTransaction, SwapResult } from './swap'

// Type guards
export function isSwapStatus(status: string): status is SwapStatus {
  return ['submitted', 'pending', 'processing', 'completed', 'failed', 'cancelled', 'expired'].includes(status)
}

export function isPublicKey(value: any): value is PublicKey {
  return value && typeof value.toBase58 === 'function'
}

export function isValidSwapRequest(request: SwapRequest): boolean {
  return !!(
    request.inputToken &&
    request.outputToken &&
    request.inputAmount &&
    (request.slippageBps === undefined || (request.slippageBps >= 0 && request.slippageBps <= 1000))
  )
}