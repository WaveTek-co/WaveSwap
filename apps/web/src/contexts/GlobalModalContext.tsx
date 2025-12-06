'use client'

import React, { createContext, useContext, ReactNode, useState } from 'react'

interface GlobalModalContextType {
  isWalletModalOpen: boolean
  openWalletModal: () => void
  closeWalletModal: () => void
}

const GlobalModalContext = createContext<GlobalModalContextType | undefined>(undefined)

export function GlobalModalProvider({ children }: { children: ReactNode }) {
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false)

  const openWalletModal = () => setIsWalletModalOpen(true)
  const closeWalletModal = () => setIsWalletModalOpen(false)

  const contextValue: GlobalModalContextType = {
    isWalletModalOpen,
    openWalletModal,
    closeWalletModal
  }

  return (
    <GlobalModalContext.Provider value={contextValue}>
      {children}
    </GlobalModalContext.Provider>
  )
}

export function useGlobalModal() {
  const context = useContext(GlobalModalContext)
  if (context === undefined) {
    throw new Error('useGlobalModal must be used within a GlobalModalProvider')
  }
  return context
}

export default GlobalModalProvider