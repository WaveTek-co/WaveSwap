'use client'

import { useWallet } from '@/hooks/useWalletAdapter'
import { useEffect, useState } from 'react'

interface HydratedWalletProviderProps {
  children: React.ReactNode
}

export function HydratedWalletProvider({ children }: HydratedWalletProviderProps) {
  const { connected, connecting } = useWallet()
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  // Don't render anything until hydrated to prevent SSR/client mismatch
  if (!isHydrated) {
    return (
      <div style={{ visibility: 'hidden' }}>
        {children}
      </div>
    )
  }

  return <>{children}</>
}