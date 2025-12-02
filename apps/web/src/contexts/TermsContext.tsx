'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface TermsContextType {
  hasAcceptedTerms: boolean | null
  acceptTerms: () => void
  declineTerms: () => void
  showTermsModal: boolean
  setShowTermsModal: (show: boolean) => void
}

const TermsContext = createContext<TermsContextType | undefined>(undefined)

export function useTerms() {
  const context = useContext(TermsContext)
  if (!context) {
    throw new Error('useTerms must be used within a TermsProvider')
  }
  return context
}

interface TermsProviderProps {
  children: ReactNode
}

export function TermsProvider({ children }: TermsProviderProps) {
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState<boolean | null>(null)
  const [showTermsModal, setShowTermsModal] = useState(false)

  useEffect(() => {
    // Check if user has previously accepted terms
    const stored = localStorage.getItem('waveSwap_termsAccepted')
    if (stored === 'true') {
      setHasAcceptedTerms(true)
    } else if (stored === 'false') {
      setHasAcceptedTerms(false)
    } else {
      // First time visiting - show modal
      setHasAcceptedTerms(false)
      setShowTermsModal(true)
    }
  }, [])

  const acceptTerms = () => {
    setHasAcceptedTerms(true)
    setShowTermsModal(false)
    localStorage.setItem('waveSwap_termsAccepted', 'true')
    localStorage.setItem('waveSwap_termsAcceptedDate', new Date().toISOString())
  }

  const declineTerms = () => {
    setHasAcceptedTerms(false)
    setShowTermsModal(false)
    localStorage.setItem('waveSwap_termsAccepted', 'false')
  }

  const value = {
    hasAcceptedTerms,
    acceptTerms,
    declineTerms,
    showTermsModal,
    setShowTermsModal
  }

  return (
    <TermsContext.Provider value={value}>
      {children}
    </TermsContext.Provider>
  )
}