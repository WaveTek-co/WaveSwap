'use client'

import { useState, useEffect } from 'react'

export function usePrivacySettings() {
  const [privacyMode, setPrivacyMode] = useState(true) // Default to true for privacy

  useEffect(() => {
    // Load privacy mode from localStorage on mount
    const saved = localStorage.getItem('waveswap-privacy-mode')
    if (saved !== null) {
      setPrivacyMode(saved === 'true')
    }
  }, [])

  const togglePrivacyMode = () => {
    const newMode = !privacyMode
    setPrivacyMode(newMode)
    localStorage.setItem('waveswap-privacy-mode', newMode.toString())
  }

  return {
    privacyMode,
    togglePrivacyMode,
    setPrivacyMode
  }
}