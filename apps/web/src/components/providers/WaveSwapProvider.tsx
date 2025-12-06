'use client'

import React, { createContext, useContext, ReactNode, useState } from 'react'
import { useConnection, useWallet } from '@/hooks/useWalletAdapter'

interface WaveSwapContextType {
  isProcessing: boolean
  transactionHistory: Array<{
    id: string
    type: 'swap' | 'wrap' | 'unwrap'
    status: 'pending' | 'completed' | 'failed'
    timestamp: number
    details: Record<string, any>
  }>
  addToHistory: (transaction: any) => void
  clearHistory: () => void
}

const WaveSwapContext = createContext<WaveSwapContextType | null>(null)

export function WaveSwapProvider({ children }: { children: ReactNode }) {
  const { connection } = useConnection()
  const { publicKey } = useWallet()

  const [isProcessing, setIsProcessing] = useState(false)
  const [transactionHistory, setTransactionHistory] = useState<Array<any>>([])

  const addToHistory = (transaction: any) => {
    setTransactionHistory(prev => [transaction, ...prev].slice(0, 100)) // Keep last 100 transactions
  }

  const clearHistory = () => {
    setTransactionHistory([])
  }

  return (
    <WaveSwapContext.Provider
      value={{
        isProcessing,
        transactionHistory,
        addToHistory,
        clearHistory,
      }}
    >
      {children}
    </WaveSwapContext.Provider>
  )
}

export function useWaveSwapContext() {
  const context = useContext(WaveSwapContext)
  if (!context) {
    throw new Error('useWaveSwapContext must be used within WaveSwapProvider')
  }
  return context
}