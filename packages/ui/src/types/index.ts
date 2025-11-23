// Token types
export interface Token {
  symbol: string
  mint: string
  decimals: number
  name: string
  logoURI?: string
}

// Swap types
export interface SwapQuote {
  inputToken: Token
  outputToken: Token
  inputAmount: string
  outputAmount: string
  priceImpact: string
  fee: {
    baseBps: number
    privacyBps: number
    totalBps: number
  }
  routes: Route[]
}

export interface Route {
  name: string
  output: string
  steps: Step[]
}

export interface Step {
  pool: string
  input: string
  output: string
}

// Transaction types
export interface TransactionStatus {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  type: 'swap' | 'wrap' | 'unwrap'
  timestamp: number
  details: Record<string, any>
}

// UI State types
export interface UIState {
  theme: 'light' | 'dark' | 'system'
  privacyMode: boolean
  slippage: number
  selectedInputToken: Token | null
  selectedOutputToken: Token | null
}

// Component Props
export interface BaseComponentProps {
  className?: string
  children?: React.ReactNode
}

export interface ButtonProps extends BaseComponentProps {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'privacy'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  loading?: boolean
  onClick?: () => void
}

// Form types
export interface FormField {
  name: string
  label: string
  type: 'text' | 'number' | 'select' | 'textarea'
  placeholder?: string
  required?: boolean
  validation?: {
    min?: number
    max?: number
    pattern?: RegExp
  }
}

// Network types
export type Network = 'devnet' | 'testnet' | 'mainnet-beta'

// Error types
export interface WaveSwapError {
  code: string
  message: string
  details?: Record<string, any>
}