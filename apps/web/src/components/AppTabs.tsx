'use client'

import { useState, useEffect } from 'react'
import Tabs from './ui/Tabs'
import { SwapComponent } from './SwapComponent'
import { NetworkSelector } from './SwapComponent/NetworkSelector'
import { SimpleWalletButton } from './SwapComponent/SimpleWalletButton'
import Settings from './Settings'
import { HistoryTab } from './HistoryTab'

// Import icons for each tab
import {
  ArrowPathIcon,
  ArrowsRightLeftIcon,
  ClockIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline'

interface TabContentProps {
  tabId: string
  privacyMode: boolean
}

function TabContent({ tabId, privacyMode }: TabContentProps) {
  switch (tabId) {
    case 'swap':
      return (
        <div className="w-full flex justify-center">
          <SwapComponent privacyMode={privacyMode} />
        </div>
      )

    case 'bridge':
      return (
        <div className="w-full max-w-xl mx-auto">
          <div className="glass-panel p-8">
            <div className="text-center py-12">
              <div className="relative inline-flex items-center justify-center w-16 h-16 mb-6">
                <div className="absolute inset-0 bg-blue-500/20 rounded-full animate-pulse" />
                <ArrowsRightLeftIcon className="h-8 w-8 text-blue-400 relative z-10" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">Bridge Coming Soon</h3>
              <p className="text-gray-400 mb-6 max-w-sm mx-auto">
                Cross-chain asset transfer functionality will be available in the next release.
              </p>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                <span className="text-sm font-medium text-blue-400">In Development</span>
              </div>
            </div>
          </div>
        </div>
      )

    case 'history':
      return (
        <div className="w-full flex justify-center">
          <HistoryTab privacyMode={privacyMode} />
        </div>
      )

    default:
      return null
  }
}

import { usePrivacyMode } from '@/contexts/PrivacyContext'

export function AppTabs() {
  const [activeTab, setActiveTab] = useState('swap')
  const { privacyMode, setPrivacyMode } = usePrivacyMode()

  // Debug privacy mode
  console.log('AppTabs: privacyMode =', privacyMode)

  const tabs = [
    {
      id: 'swap',
      label: 'Swap',
      icon: <ArrowPathIcon className="h-4 w-4" />
    },
    {
      id: 'bridge',
      label: 'Bridge',
      icon: <ArrowsRightLeftIcon className="h-4 w-4" />
    },
    {
      id: 'history',
      label: 'History',
      icon: <ClockIcon className="h-4 w-4" />
    }
  ]

  // Apply theme changes based on privacy mode
  useEffect(() => {
    const root = document.documentElement
    if (privacyMode) {
      root.classList.add('privacy-mode')
    } else {
      root.classList.remove('privacy-mode')
    }
  }, [privacyMode])

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-black/30 border-b border-gray-800/50">
        <div className="container mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-xl flex items-center justify-center shadow-lg">
                  <span className="text-white font-bold text-lg">W</span>
                </div>
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-gray-950" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">WaveSwap</h1>
                <p className="text-xs text-gray-400">Private. Secure. Fast.</p>
              </div>
            </div>

            {/* Right side controls */}
            <div className="flex items-center gap-2 sm:gap-4">
              <NetworkSelector />
              <Settings
                privacyMode={privacyMode}
                onPrivacyModeChange={setPrivacyMode}
              />
              <SimpleWalletButton />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="w-full max-w-5xl mx-auto">
          {/* Tab Navigation with constrained width */}
          <div className="w-full max-w-xl mx-auto mb-8">
            <Tabs
              tabs={tabs}
              defaultTab="swap"
              onTabChange={setActiveTab}
              className="w-full"
            />
          </div>

          {/* Tab Content */}
          <TabContent tabId={activeTab} privacyMode={privacyMode} />
        </div>
      </main>
    </div>
  )
}

export default AppTabs