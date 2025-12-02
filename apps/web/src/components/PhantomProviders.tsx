'use client'

import React, { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'

// Dynamically import Phantom SDK components only on client side
const PhantomSDKWrapper = dynamic(
  () => import('./PhantomSDKWrapper').then(mod => ({ default: mod.PhantomSDKWrapper })),
  {
    ssr: false,
    loading: () => <div style={{ minHeight: '100vh' }}></div>
  }
)

export function PhantomProviders({ children }: { children: React.ReactNode }) {
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  // Only render Phantom SDK on client side
  if (!isClient) {
    return <div style={{ minHeight: '100vh' }}>{children}</div>
  }

  return React.createElement(PhantomSDKWrapper as any, null, children)
}