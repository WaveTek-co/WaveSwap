'use client'

import React, { createContext, useContext, useState, ReactNode } from 'react'

interface WalletModalContextType {
  isModalOpen: boolean
  openModal: () => void
  closeModal: () => void
}

const WalletModalContext = createContext<WalletModalContextType | undefined>(undefined)

export function WalletModalProvider({ children }: { children: ReactNode }) {
  const [isModalOpen, setIsModalOpen] = useState(false)

  const openModal = () => setIsModalOpen(true)
  const closeModal = () => setIsModalOpen(false)

  return (
    <WalletModalContext.Provider value={{ isModalOpen, openModal, closeModal }}>
      {children}
    </WalletModalContext.Provider>
  )
}

export function useWalletModal() {
  const context = useContext(WalletModalContext)
  if (context === undefined) {
    throw new Error('useWalletModal must be used within a WalletModalProvider')
  }
  return context
}