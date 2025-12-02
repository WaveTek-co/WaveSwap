'use client'

import React, { createContext, useContext, useState, ReactNode } from 'react'

interface EnhancedWalletModalContextType {
  isOpen: boolean
  openModal: () => void
  closeModal: () => void
}

const EnhancedWalletModalContext = createContext<EnhancedWalletModalContextType | undefined>(undefined)

export function useEnhancedWalletModal() {
  const context = useContext(EnhancedWalletModalContext)
  if (context === undefined) {
    throw new Error('useEnhancedWalletModal must be used within an EnhancedWalletModalProvider')
  }
  return context
}

interface EnhancedWalletModalProviderProps {
  children: ReactNode
}

export function EnhancedWalletModalProvider({ children }: EnhancedWalletModalProviderProps) {
  const [isOpen, setIsOpen] = useState(false)

  const openModal = () => setIsOpen(true)
  const closeModal = () => setIsOpen(false)

  const value = {
    isOpen,
    openModal,
    closeModal
  }

  return (
    <EnhancedWalletModalContext.Provider value={value}>
      {children}
    </EnhancedWalletModalContext.Provider>
  )
}

export default EnhancedWalletModalProvider