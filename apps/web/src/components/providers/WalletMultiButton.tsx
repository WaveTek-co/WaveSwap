'use client'

import { useState, useRef, useEffect } from 'react'
import { useWallet } from '@/hooks/useWalletAdapter'
import { Wallet, ChevronDown, ExternalLink } from 'lucide-react'

export function WalletMultiButton() {
  const { publicKey, connect, connecting, connected, disconnect, wallets, select } = useWallet()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const handleConnect = async (walletName: string) => {
    try {
      setIsOpen(false)
      await select(walletName as any)
      await connect()
    } catch (error) {
      console.error('Failed to connect wallet:', error)
    }
  }

  const handleDisconnect = async () => {
    try {
      setIsOpen(false)
      await disconnect()
    } catch (error) {
      console.error('Failed to disconnect wallet:', error)
    }
  }

  const buttonText = () => {
    if (connecting) return 'Connecting...'
    if (connected && publicKey) {
      return `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}`
    }
    return 'Connect Wallet'
  }

  const getWallets = () => {
    return wallets.filter(wallet => wallet.readyState !== 'Unsupported')
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Wallet Button */}
      <button
        onClick={() => connected ? setIsOpen(!isOpen) : setIsOpen(true)}
        disabled={connecting}
        className="relative flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 glass-enhanced"
        style={{
          background: connected
            ? 'var(--wave-glass-bg)'
            : 'linear-gradient(135deg, var(--wave-azul), var(--wave-azul-dark))',
          color: connected ? 'var(--wave-text-primary)' : 'white',
          border: connected ? '1px solid var(--wave-glass-border)' : 'none',
        }}
      >
        <Wallet className="h-4 w-4" />
        <span>{buttonText()}</span>
        <ChevronDown
          className={`h-3 w-3 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-96 rounded-xl overflow-hidden relative z-[60]"
          style={{
            background: 'rgba(255, 255, 255, 0.02)',
            backdropFilter: 'blur(20px) saturate(180%)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            boxShadow: `
              0 25px 50px rgba(0, 0, 0, 0.4),
              0 0 0 1px rgba(255, 255, 255, 0.03),
              inset 0 1px 0 rgba(255, 255, 255, 0.05)
            `
          }}
        >
          {/* Noise overlay for modal */}
          <div
            className="absolute inset-0 opacity-20 pointer-events-none"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='150' height='150' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='150' height='150' filter='url(%23noise)' opacity='0.08'/%3E%3C/svg%3E")`,
              mixBlendMode: 'overlay'
            }}
          />
          {/* Content container */}
          <div className="relative z-10">
          {/* Header */}
          <div className="p-4" style={{
            borderBottom: '1px solid var(--wave-glass-border)'
          }}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold" style={{ color: 'var(--wave-text-primary)' }}>
                {connected ? 'Wallet Connected' : 'Connect Wallet'}
              </h3>
            </div>
          </div>

          {/* Content */}
          <div className="p-4">
            {connected && publicKey ? (
              // Connected state
              <div className="space-y-4">
                <div className="p-3 rounded-lg" style={{
                  background: 'rgba(33, 188, 255, 0.05)',
                  border: '1px solid rgba(33, 188, 255, 0.1)'
                }}>
                  <p className="text-xs mb-1" style={{ color: 'var(--wave-text-muted)' }}>Address</p>
                  <p className="text-sm font-mono" style={{ color: 'var(--wave-text-primary)' }}>
                    {publicKey.toBase58().slice(0, 8)}...{publicKey.toBase58().slice(-8)}
                  </p>
                </div>

                <button
                  onClick={handleDisconnect}
                  className="w-full py-2 px-4 rounded-lg text-sm font-medium transition-all duration-200"
                  style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    color: '#ef4444',
                    border: '1px solid rgba(239, 68, 68, 0.2)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'
                  }}
                >
                  Disconnect Wallet
                </button>
              </div>
            ) : (
              // Not connected state
              <div className="space-y-3">
                <p className="text-sm" style={{ color: 'var(--wave-text-muted)' }}>
                  Choose your wallet to connect
                </p>

                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {getWallets().map((wallet) => (
                    <button
                      key={wallet.adapter.name}
                      onClick={() => handleConnect(wallet.adapter.name)}
                      disabled={wallet.readyState !== 'Ready' as any}
                      className="w-full p-3 rounded-lg flex items-center justify-between transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{
                        background: 'var(--wave-glass-bg)',
                        border: '1px solid var(--wave-glass-border)'
                      }}
                      onMouseEnter={(e) => {
                        if (wallet.readyState === 'Ready' as any) {
                          e.currentTarget.style.background = 'rgba(33, 188, 255, 0.05)'
                          e.currentTarget.style.borderColor = 'rgba(33, 188, 255, 0.2)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'var(--wave-glass-bg)'
                        e.currentTarget.style.borderColor = 'var(--wave-glass-border)'
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{
                          background: 'rgba(255, 255, 255, 0.1)'
                        }}>
                          <img
                            src={wallet.adapter.icon}
                            alt={wallet.adapter.name}
                            className="w-5 h-5 rounded"
                          />
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-medium" style={{ color: 'var(--wave-text-primary)' }}>
                            {wallet.adapter.name}
                          </p>
                          <p className="text-xs" style={{ color: 'var(--wave-text-muted)' }}>
                            {wallet.readyState === 'Installed' ? 'Available' : 'Not installed'}
                          </p>
                        </div>
                      </div>
                      {wallet.readyState === 'Installed' && (
                        <div className="w-2 h-2 rounded-full" style={{
                          backgroundColor: 'var(--wave-success)'
                        }} />
                      )}
                    </button>
                  ))}
                </div>

                {getWallets().length === 0 && (
                  <div className="text-center py-6">
                    <p className="text-sm mb-3" style={{ color: 'var(--wave-text-muted)' }}>
                      No supported wallet found
                    </p>
                    <a
                      href="https://phantom.app/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm transition-all duration-200"
                      style={{ color: 'var(--wave-azul)' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#1999d4'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'var(--wave-azul)'
                      }}
                    >
                      Install Phantom Wallet
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default WalletMultiButton