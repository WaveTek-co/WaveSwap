export interface QuoteRequest {
  inputMint: string
  outputMint: string
  amount: number
  slippageBps?: number
  onlyDirectRoutes?: boolean
  asLegacyTransaction?: boolean
}

export interface QuoteResponse {
  inputMint: string
  inputAmount: string
  outputMint: string
  outputAmount: string
  otherAmountThreshold: string
  swapMode: string
  slippageBps: number
  priceImpactPct: string
  routePlan: RoutePlan[]
  contextSlot: number
  timeTaken: number
}

export interface RoutePlan {
  swapInfo: SwapInfo
}

export interface SwapInfo {
  ammKey: string
  label: string
  inputMint: string
  outputMint: string
  inAmount: string
  outAmount: string
  feeAmount: string
  feeMint: string
}