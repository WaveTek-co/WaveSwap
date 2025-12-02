'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface PrivacyContextType {
  privacyMode: boolean
  setPrivacyMode: (mode: boolean) => void
  togglePrivacyMode: () => void
}

const PrivacyContext = createContext<PrivacyContextType | undefined>(undefined)

export function usePrivacyMode() {
  const context = useContext(PrivacyContext)
  if (context === undefined) {
    throw new Error('usePrivacyMode must be used within a PrivacyProvider')
  }
  return context
}

interface PrivacyProviderProps {
  children: ReactNode
}

export function PrivacyProvider({ children }: PrivacyProviderProps) {
  const [privacyMode, setPrivacyModeState] = useState(true) // Default to true for privacy

  // Load privacy mode from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('waveswap-privacy-mode')
    if (saved !== null) {
      setPrivacyModeState(saved === 'true')
    }
  }, [])

  const setPrivacyMode = (mode: boolean) => {
    setPrivacyModeState(mode)
    localStorage.setItem('waveswap-privacy-mode', mode.toString())
  }

  const togglePrivacyMode = () => {
    setPrivacyMode(!privacyMode)
  }

  return (
    <PrivacyContext.Provider
      value={{
        privacyMode,
        setPrivacyMode,
        togglePrivacyMode
      }}
    >
      {children}
    </PrivacyContext.Provider>
  )
}