'use client'

import { useEffect, useState } from 'react'
import { ExclamationTriangleIcon, ShieldCheckIcon } from '@heroicons/react/24/outline'
import { usePrivacySettings } from '../hooks/usePrivacySettings'

export default function PrivacyReminder() {
  const { privacyMode, togglePrivacyMode } = usePrivacySettings()
  const [showReminder, setShowReminder] = useState(false)
  const [hasBeenDismissed, setHasBeenDismissed] = useState(false)

  useEffect(() => {
    // Check if user has dismissed the reminder in this session
    const dismissed = sessionStorage.getItem('privacy-reminder-dismissed')
    setHasBeenDismissed(!!dismissed)

    // Show reminder if privacy mode is off and hasn't been dismissed
    if (!privacyMode && !dismissed) {
      const timer = setTimeout(() => {
        setShowReminder(true)
      }, 3000) // Show after 3 seconds
      return () => clearTimeout(timer)
    }

    return undefined
  }, [privacyMode, hasBeenDismissed])

  const handleEnablePrivacy = () => {
    togglePrivacyMode()
    setShowReminder(false)
    sessionStorage.removeItem('privacy-reminder-dismissed')
  }

  const handleDismiss = () => {
    setShowReminder(false)
    setHasBeenDismissed(true)
    sessionStorage.setItem('privacy-reminder-dismissed', 'true')
  }

  // Don't show anything if privacy mode is on or reminder was dismissed
  if (privacyMode || hasBeenDismissed || !showReminder) {
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
  const { privacyMode } = usePrivacySettings()

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