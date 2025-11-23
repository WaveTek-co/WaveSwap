import { PublicKey } from '@solana/web3.js'
import { QuoteResponse } from './quote'

export interface SwapRequest {
  quoteResponse: QuoteResponse
  userPublicKey: PublicKey
  wrapAndUnwrapSol?: boolean
  useSharedAccounts?: boolean
  feeAccount?: PublicKey
  onlyDirectRoutes?: boolean
}

export interface SwapResponse {
  swapTransaction: string
  lastValidBlockHeight: number
  prioritizationFeeLamports: number
  computeUnitLimit: number
}

export interface SwapTransaction {
  transaction: string
  type: 'legacy' | 'v0'
}

export interface SwapResult {
  signature: string
  slot: number
  confirmationStatus: 'processed' | 'confirmed' | 'finalized'
}