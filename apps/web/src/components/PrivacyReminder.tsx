'use client'

import React, { useEffect, useState, useRef } from 'react'
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
            <svg className="h-6 w-6 text-yellow-400" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
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
                <svg className="h-3 w-3 mr-1" fill="currentColor" viewBox="0 0 24 24">
                    <path fillRule="evenodd" d="M12 1.586l-4 4v12.828a2 2 0 001.536 1.946l3.436.686a1 1 0 00.392 0l3.436-.686A2 2 0 0019 18.414V5.586l-4-4H12zm2.707 7.293a1 1 0 00-1.414-1.414L11 11.586l-.293-.293a1 1 0 00-1.414 1.414l1 1a1 1 0 001.414 0l3-3z" clipRule="evenodd" />
                  </svg>
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
      <svg className="h-3 w-3 mr-1" fill="currentColor" viewBox="0 0 24 24">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      Public Mode
    </div>
  )
}