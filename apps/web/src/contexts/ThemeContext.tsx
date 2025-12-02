'use client'

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react'

export type ThemeMode = 'light' | 'dark' | 'stealth' | 'ghost'

interface ThemeContextType {
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
  toggleLightDark: () => void
  toggleStealth: () => void
  setLightTheme: () => void
  setDarkTheme: () => void
  setStealthTheme: () => void
  setGhostTheme: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>('dark')

  // Load theme from localStorage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('wave-theme') as ThemeMode
    if (savedTheme && ['light', 'dark', 'stealth', 'ghost'].includes(savedTheme)) {
      setThemeState(savedTheme)
    }
  }, [])

  // Apply theme to document and save to localStorage
  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme)
  }

  // Toggle between light and dark
  const toggleLightDark = () => {
    if (theme === 'stealth') {
      setTheme('light')
    } else {
      setTheme(theme === 'light' ? 'dark' : 'light')
    }
  }

  // Toggle stealth mode (independent of light/dark)
  const toggleStealth = () => {
    setTheme(theme === 'stealth' ? 'dark' : 'stealth')
  }

  // Direct theme setters for specific themes
  const setLightTheme = () => setTheme('light')
  const setDarkTheme = () => setTheme('dark')
  const setStealthTheme = () => setTheme('stealth')
  const setGhostTheme = () => setTheme('ghost')

  // Set initial theme on mount
  useEffect(() => {
    // Apply dark theme by default
    const savedTheme = localStorage.getItem('wave-theme') as ThemeMode
    const initialTheme = savedTheme && ['light', 'dark', 'stealth', 'ghost'].includes(savedTheme) ? savedTheme : 'dark'
    setThemeState(initialTheme)
  }, [])

  // Apply theme when state changes
  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('light-theme', 'dark-theme', 'stealth-theme', 'ghost-theme')
    root.classList.add(`${theme}-theme`)

    // Handle stealth mode special case
    if (theme === 'stealth') {
      root.classList.add('stealth-mode')
    } else {
      root.classList.remove('stealth-mode')
    }

    // Store theme preference
    localStorage.setItem('wave-theme', theme)
  }, [theme])

  return (
    <ThemeContext.Provider value={{
      theme,
      setTheme,
      toggleLightDark,
      toggleStealth,
      setLightTheme,
      setDarkTheme,
      setStealthTheme,
      setGhostTheme
    }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}