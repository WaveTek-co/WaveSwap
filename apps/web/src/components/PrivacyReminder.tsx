'use client'

import { useEffect, useState, useRef } from 'react'
import { ExclamationTriangleIcon, ShieldCheckIcon } from '@heroicons/react/24/outline'
import { usePrivacyMode } from '../contexts/PrivacyContext'

export default function PrivacyReminder() {
  const { privacyMode, togglePrivacyMode } = usePrivacyMode()
  const [showReminder, setShowReminder] = useState(false)
  const previousPrivacyModeRef = useRef(true) // Track previous state with ref

  useEffect(() => {
    // Show reminder whenever privacy mode changes from true to false
    const previousPrivacyMode = previousPrivacyModeRef.current

    if (previousPrivacyMode === true && privacyMode === false) {
      const timer = setTimeout(() => {
        setShowReminder(true)
      }, 1500) // Show after 1.5 seconds for better UX
      return () => clearTimeout(timer)
    }

    // Hide reminder when privacy mode is turned back on
    if (privacyMode === true) {
      setShowReminder(false)
    }

    // Update ref for next comparison
    previousPrivacyModeRef.current = privacyMode
    return undefined
  }, [privacyMode])

  const handleEnablePrivacy = () => {
    togglePrivacyMode()
    setShowReminder(false)
  }

  const handleDismiss = () => {
    setShowReminder(false)
  }

  // Don't show anything if privacy mode is on or reminder is not showing
  if (privacyMode || !showReminder) {
    return null
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm animate-pulse">
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-lg shadow-lg">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <ExclamationTriangleIcon className="h-6 w-6 text-yellow-400" aria-hidden="true" />
          </div>
          <div className="ml-3 flex-1">
            <p className="text-sm text-yellow-800">
              <span className="font-medium">Privacy Mode is Off</span>
              <br />
              Your transactions will be publicly visible on-chain. Enable privacy mode for confidential transactions.
            </p>
            <div className="mt-3 flex space-x-2">
              <button
                onClick={handleEnablePrivacy}
                className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-yellow-600 hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 transition-colors"
              >
                <ShieldCheckIcon className="h-3 w-3 mr-1" />
                Enable Privacy
              </button>
              <button
                onClick={handleDismiss}
                className="inline-flex items-center px-3 py-1.5 border border-yellow-300 text-xs font-medium rounded-md text-yellow-700 bg-yellow-100 hover:bg-yellow-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Also create a compact tag version for header
export function PrivacyTag() {
  const { privacyMode } = usePrivacyMode()

  if (privacyMode) {
    return null
  }

  return (
    <div className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-300">
      <ExclamationTriangleIcon className="h-3 w-3 mr-1" />
      Public Mode
    </div>
  )
}