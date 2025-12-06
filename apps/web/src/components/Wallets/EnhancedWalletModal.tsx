'use client'

import { useState, useRef, useEffect } from 'react'
import { useMultiWallet } from '@/contexts/MultiWalletContext'
import {
  X,
  Wallet,
  AlertCircle,
  ExternalLink,
  Star,
  ShieldCheck,
  Zap,
  Users,
  Globe,
  ChevronDown
} from 'lucide-react'

interface EnhancedWalletModalProps {
  isOpen: boolean
  onClose: () => void
}

interface WalletOption {
  id: string
  name: string
  description: string
  icon: string
  color: string
  installUrl: string
  isRecommended?: boolean
  features?: string[]
  userCount?: string
  category?: 'browser' | 'mobile' | 'hardware'
}

export function EnhancedWalletModal({ isOpen, onClose }: EnhancedWalletModalProps) {
  const {
    connect,
    connecting,
    connected,
    connection
  } = useMultiWallet()
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null)
  const [showOtherWallets, setShowOtherWallets] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)

  // Check if wallet is installed (browser detection)
  const isWalletInstalled = (walletName: string): boolean => {
    if (typeof window === 'undefined') return false

    switch (walletName.toLowerCase()) {
      case 'phantom':
        return !!window.solana?.isPhantom
      case 'backpack':
        return !!window.backpack?.isBackpack
      case 'solflare':
        return !!window.solflare?.isSolflare
      case 'jupiter':
        return true // Jupiter adapter is bundled
      default:
        return false
    }
  }

  const WALLET_OPTIONS: WalletOption[] = [
    // Primary wallets (top level)
    {
      id: 'phantom',
      name: 'Phantom',
      description: 'Most popular Solana wallet with DeFi focus',
      icon: '/assets/Phantom/Phantom-Icon-Purple.png',
      color: '#AB9FF2',
      installUrl: 'https://phantom.app/',
      isRecommended: true,
      features: ['NFT Support', 'Staking', 'DeFi Integration', 'Browser Extension'],
      userCount: '3M+',
      category: 'browser'
    },
    {
      id: 'google',
      name: 'Google',
      description: 'Connect with Google account via Phantom SDK',
      icon: '/assets/wallets/google.svg',
      color: '#4285F4',
      installUrl: 'https://phantom.app/',
      features: ['Google OAuth', 'Phantom SDK', 'Easy Login'],
      userCount: '2.5B+',
      category: 'browser'
    },
    {
      id: 'apple',
      name: 'Apple',
      description: 'Connect with Apple ID via Phantom SDK',
      icon: '/assets/wallets/apple.svg',
      color: '#000000',
      installUrl: 'https://phantom.app/',
      features: ['Apple ID', 'Phantom SDK', 'Secure Login'],
      userCount: '1B+',
      category: 'browser'
    },
    {
      id: 'ledger',
      name: 'Ledger',
      description: 'Hardware wallet for maximum security',
      icon: '/assets/wallets/ledger.svg',
      color: '#000000',
      installUrl: 'https://www.ledger.com/',
      features: ['Hardware Security', 'Cold Storage', 'Maximum Security'],
      userCount: '5M+',
      category: 'hardware'
    },
    // Other wallets (dropdown)
    {
      id: 'jupiter',
      name: 'Jupiter',
      description: 'Advanced trading and swap features',
      icon: '/assets/wallets/jupiter.svg',
      color: '#7B3FF2',
      installUrl: 'https://station.jup.ag/',
      features: ['Swaps', 'Limit Orders', 'DCA', 'Bridge'],
      userCount: '500K+',
      category: 'browser'
    },
    {
      id: 'backpack',
      name: 'Backpack',
      description: 'Developer-focused wallet with xNFTs',
      icon: '/assets/wallets/backpack.svg',
      color: '#6366F1',
      installUrl: 'https://backpack.app/',
      features: ['xNFT Support', 'Developer Tools', 'SOL Stake'],
      userCount: '200K+',
      category: 'browser'
    },
    {
      id: 'solflare',
      name: 'Solflare',
      description: 'Professional wallet with advanced features',
      icon: '/assets/Solflare/SolflareYellow.svg',
      color: '#F4B942',
      installUrl: 'https://solflare.com/',
      features: ['Ledger Support', 'Staking', 'Advanced Security', 'Web3Mobile'],
      userCount: '1M+',
      category: 'browser'
    }
  ]

  // Primary wallets: Phantom, Google, Apple, Ledger
  const primaryWallets = WALLET_OPTIONS.filter(wallet =>
    ['phantom', 'google', 'apple', 'ledger'].includes(wallet.id)
  )

  // Other wallets for dropdown: Jupiter, Backpack, Solflare
  const otherWallets = WALLET_OPTIONS.filter(wallet =>
    ['jupiter', 'backpack', 'solflare'].includes(wallet.id)
  )

  
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      document.addEventListener('mousedown', handleClickOutside)
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.removeEventListener('mousedown', handleClickOutside)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleWalletConnect = async (walletName: string) => {
    try {
      setSelectedWallet(walletName)

      // Use our MultiWalletContext connect function
      await connect(walletName)

      onClose()
    } catch (error) {
      console.error('Failed to connect wallet:', error)
      setSelectedWallet(null)
    }
  }

  const getCategoryIcon = (category?: string) => {
    switch (category) {
      case 'mobile':
        return <Zap className="w-3 h-3" />
      case 'hardware':
        return <ShieldCheck className="w-3 h-3" />
      default:
        return <Globe className="w-3 h-3" />
    }
  }

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 z-[998] bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div
        ref={modalRef}
        className="relative z-[999] w-full max-w-2xl transform transition-all duration-300 ease-out"
        style={{
          animation: 'modalSlideIn 0.3s ease-out'
        }}
      >
        <div
          className="relative overflow-hidden rounded-3xl border shadow-2xl"
          style={{
            background: `
              linear-gradient(135deg,
                rgba(30, 30, 45, 0.98) 0%,
                rgba(45, 45, 65, 0.95) 25%,
                rgba(30, 30, 45, 0.98) 50%,
                rgba(45, 45, 65, 0.95) 75%,
                rgba(30, 30, 45, 0.98) 100%
              ),
              radial-gradient(circle at 50% 50%,
                rgba(33, 188, 255, 0.03) 0%,
                transparent 50%
              )
            `,
            backdropFilter: 'blur(24px) saturate(1.8)',
            borderColor: 'rgba(33, 188, 255, 0.15)',
            boxShadow: `
              0 32px 80px rgba(0, 0, 0, 0.7),
              0 16px 40px rgba(33, 188, 255, 0.1),
              inset 0 1px 0 rgba(255, 255, 255, 0.1),
              inset 0 -1px 0 rgba(0, 0, 0, 0.2),
              0 0 0 1px rgba(33, 188, 255, 0.05)
            `
          }}
        >
          {/* Noise overlay */}
          <div
            className="absolute inset-0 opacity-4 pointer-events-none"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='200' height='200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3Cfilter%3E%3Crect width='200' height='200' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
              filter: 'contrast(1.2) brightness(1.1)'
            }}
          />

          {/* Modal Content */}
          <div className="relative z-10">
            {/* Header */}
            <div className="flex items-center justify-between p-8 pb-6 border-b border-white/10">
              <div className="flex items-center gap-4">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{
                    background: 'linear-gradient(135deg, rgba(33, 188, 255, 0.2), rgba(59, 130, 246, 0.1))',
                    border: '1px solid rgba(33, 188, 255, 0.2)',
                    boxShadow: '0 8px 24px rgba(33, 188, 255, 0.2)'
                  }}
                >
                  <Wallet className="w-7 h-7 text-white" style={{ filter: 'drop-shadow(0 0 8px rgba(33, 188, 255, 0.5))' }} />
                </div>
                <div>
                  <h2
                    className="text-2xl font-bold text-white mb-1"
                    style={{
                      fontFamily: 'var(--font-helvetica)',
                      fontWeight: 700,
                      letterSpacing: '0.025em'
                    }}
                  >
                    Connect Wallet
                  </h2>
                  <p className="text-white/70 text-sm">Choose your Solana wallet to get started</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-12 h-12 rounded-2xl flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all duration-200"
                style={{ backdropFilter: 'blur(10px)' }}
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Network Info */}
            <div className="px-8 py-4 border-b border-white/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-sm text-white/80">Solana Mainnet</span>
                </div>
                <span className="text-xs text-white/60">RPC: {connection.rpcEndpoint}</span>
              </div>
            </div>

            {/* Wallet Grid */}
            <div className="p-8 pt-6">
              {/* Primary Wallets */}
              <div className="mb-8">
                <h3 className="text-white font-semibold text-lg mb-4" style={{ fontFamily: 'var(--font-helvetica)' }}>
                  Popular Wallets
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {primaryWallets.map((wallet) => {
                    const isInstalled = isWalletInstalled(wallet.id)
                    const isPending = selectedWallet === wallet.id && connecting

                    return (
                      <div
                        key={wallet.id}
                        className={`relative ${wallet.isRecommended ? 'order-first' : ''}`}
                      >
                        {/* Recommended Badge */}
                        {wallet.isRecommended && !connected && (
                          <div className="absolute -top-2 left-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-400/30 backdrop-blur-sm">
                            <Star className="w-3 h-3 text-blue-400" />
                            <span className="text-blue-300 text-xs font-semibold" style={{ fontFamily: 'var(--font-helvetica)' }}>
                              RECOMMENDED
                            </span>
                          </div>
                        )}

                        <button
                          onClick={() => handleWalletConnect(wallet.id)}
                          disabled={isPending}
                          className={`w-full group relative overflow-hidden rounded-2xl border transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] ${
                            wallet.isRecommended ? 'ring-2 ring-blue-400/20 ring-offset-2 ring-offset-transparent' : ''
                          }`}
                          style={{
                            background: isInstalled
                              ? `
                                linear-gradient(135deg,
                                  rgba(30, 30, 45, 0.8) 0%,
                                  rgba(45, 45, 65, 0.6) 50%,
                                  rgba(30, 30, 45, 0.8) 100%
                                )
                              `
                              : `
                                linear-gradient(135deg,
                                  rgba(30, 30, 45, 0.4) 0%,
                                  rgba(45, 45, 65, 0.3) 50%,
                                  rgba(30, 30, 45, 0.4) 100%
                                )
                              `,
                            borderColor: isInstalled
                              ? 'rgba(33, 188, 255, 0.2)'
                              : 'rgba(55, 65, 81, 0.4)',
                            cursor: isPending ? 'default' : 'pointer',
                            backdropFilter: 'blur(16px) saturate(1.5)',
                            boxShadow: isInstalled
                              ? `
                                0 12px 40px rgba(0, 0, 0, 0.3),
                                inset 0 1px 0 rgba(255, 255, 255, 0.05)
                              `
                              : `
                                0 8px 24px rgba(0, 0, 0, 0.2)
                              `,
                            marginTop: wallet.isRecommended ? '0.75rem' : '0'
                          }}
                          onMouseEnter={(e) => {
                            if (!isPending && isInstalled) {
                              e.currentTarget.style.borderColor = 'rgba(33, 188, 255, 0.4)'
                              e.currentTarget.style.background = `
                                linear-gradient(135deg,
                                  rgba(33, 188, 255, 0.15) 0%,
                                  rgba(33, 188, 255, 0.08) 50%,
                                  rgba(33, 188, 255, 0.15) 100%
                                )
                              `
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isPending && isInstalled) {
                              e.currentTarget.style.borderColor = 'rgba(33, 188, 255, 0.2)'
                              e.currentTarget.style.background = `
                                linear-gradient(135deg,
                                  rgba(30, 30, 45, 0.8) 0%,
                                  rgba(45, 45, 65, 0.6) 50%,
                                  rgba(30, 30, 45, 0.8) 100%
                                )
                              `
                            }
                          }}
                        >
                          <div className="p-5">
                            <div className="flex items-start gap-4 mb-4">
                              {/* Wallet Icon */}
                              <div className="relative">
                                <div
                                  className="w-14 h-14 rounded-xl flex items-center justify-center"
                                  style={{
                                    background: wallet.isRecommended
                                      ? 'rgba(33, 188, 255, 0.15)'
                                      : 'rgba(255, 255, 255, 0.05)',
                                    border: wallet.isRecommended
                                      ? '1px solid rgba(33, 188, 255, 0.3)'
                                      : '1px solid rgba(255, 255, 255, 0.1)',
                                    backdropFilter: 'blur(10px)'
                                  }}
                                >
                                  {wallet.icon ? (
                                    <img
                                      src={wallet.icon}
                                      alt={wallet.name}
                                      className="w-8 h-8 object-contain"
                                      onError={(e) => {
                                        e.currentTarget.style.display = 'none'
                                        e.currentTarget.parentElement!.innerHTML = (wallet.name || 'W').charAt(0)
                                      }}
                                    />
                                  ) : (
                                    <Wallet className="w-6 h-6" style={{ color: wallet.color }} />
                                  )}
                                </div>
                              </div>

                              {/* Wallet Info */}
                              <div className="flex-1 text-left">
                                <div className="flex items-center gap-2 mb-1">
                                  <h3
                                    className="text-white font-semibold text-base"
                                    style={{
                                      fontFamily: 'var(--font-helvetica)',
                                      fontWeight: 600
                                    }}
                                  >
                                    {wallet.name}
                                  </h3>
                                  {getCategoryIcon(wallet.category)}
                                </div>
                                {wallet.userCount && (
                                  <div className="flex items-center gap-1 mb-2">
                                    <Users className="w-3 h-3 text-white/50" />
                                    <span className="text-xs text-white/50">{wallet.userCount}</span>
                                  </div>
                                )}
                              </div>

                              {/* Status/Action */}
                              <div className="flex items-center">
                                {isPending ? (
                                  <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : isInstalled ? (
                                  <div className="w-6 h-6 rounded-full border-2 border-white/30" />
                                ) : (
                                  <ExternalLink className="w-5 h-5 text-blue-400" />
                                )}
                              </div>
                            </div>

                            {/* Wallet Description */}
                            <p className="text-sm text-white/70 mb-3 leading-relaxed">
                              {wallet.description}
                            </p>

                            {/* Features */}
                            {wallet.features && (
                              <div className="flex flex-wrap gap-2 mb-3">
                                {wallet.features.slice(0, 3).map((feature, index: number) => (
                                  <span
                                    key={index}
                                    className="px-2 py-1 text-xs rounded-full"
                                    style={{
                                      background: 'rgba(33, 188, 255, 0.1)',
                                      color: 'rgba(33, 188, 255, 0.8)',
                                      border: '1px solid rgba(33, 188, 255, 0.2)'
                                    }}
                                  >
                                    {feature}
                                  </span>
                                ))}
                                {wallet.features.length > 3 && (
                                  <span className="text-xs text-white/50">+{wallet.features.length - 3} more</span>
                                )}
                              </div>
                            )}

                            {/* Status Badge */}
                            <div className="flex items-center justify-between">
                              {!isInstalled && wallet.category !== 'hardware' && (
                                <div className="flex items-center gap-2">
                                  <AlertCircle className="w-4 h-4 text-orange-400" />
                                  <span className="text-xs text-orange-400">Not Installed</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Other Wallets Dropdown */}
              <div>
                <button
                  onClick={() => setShowOtherWallets(!showOtherWallets)}
                  className="w-full flex items-center justify-between p-4 rounded-2xl border border-white/10 hover:border-white/20 transition-all duration-300"
                  style={{
                    background: 'linear-gradient(135deg, rgba(30, 30, 45, 0.6) 0%, rgba(45, 45, 65, 0.4) 50%, rgba(30, 30, 45, 0.6) 100%)',
                    backdropFilter: 'blur(16px) saturate(1.5)'
                  }}
                >
                  <div className="flex items-center gap-3">
                    <Wallet className="w-5 h-5 text-white/70" />
                    <span className="text-white font-medium" style={{ fontFamily: 'var(--font-helvetica)' }}>
                      Other Wallets
                    </span>
                    <span className="text-xs text-white/60 bg-white/10 px-2 py-1 rounded-full">
                      {otherWallets.length}
                    </span>
                  </div>
                  <ChevronDown
                    className={`w-5 h-5 text-white/60 transition-transform duration-300 ${
                      showOtherWallets ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {showOtherWallets && (
                  <div className="mt-4 space-y-3">
                    {otherWallets.map((wallet) => {
                      const isInstalled = isWalletInstalled(wallet.id)
                      const isPending = selectedWallet === wallet.id && connecting

                      return (
                        <button
                          key={wallet.id}
                          onClick={() => handleWalletConnect(wallet.id)}
                          disabled={isPending}
                          className="w-full group relative overflow-hidden rounded-2xl border transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                          style={{
                            background: isInstalled
                              ? `
                                linear-gradient(135deg,
                                  rgba(30, 30, 45, 0.8) 0%,
                                  rgba(45, 45, 65, 0.6) 50%,
                                  rgba(30, 30, 45, 0.8) 100%
                                )
                              `
                              : `
                                linear-gradient(135deg,
                                  rgba(30, 30, 45, 0.4) 0%,
                                  rgba(45, 45, 65, 0.3) 50%,
                                  rgba(30, 30, 45, 0.4) 100%
                                )
                              `,
                            borderColor: isInstalled
                              ? 'rgba(33, 188, 255, 0.2)'
                              : 'rgba(55, 65, 81, 0.4)',
                            cursor: isPending ? 'default' : 'pointer',
                            backdropFilter: 'blur(16px) saturate(1.5)',
                            boxShadow: isInstalled
                              ? `
                                0 8px 24px rgba(0, 0, 0, 0.3),
                                inset 0 1px 0 rgba(255, 255, 255, 0.05)
                              `
                              : `
                                0 6px 16px rgba(0, 0, 0, 0.2)
                              `
                          }}
                          onMouseEnter={(e) => {
                            if (!isPending && isInstalled) {
                              e.currentTarget.style.borderColor = 'rgba(33, 188, 255, 0.4)'
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isPending && isInstalled) {
                              e.currentTarget.style.borderColor = 'rgba(33, 188, 255, 0.2)'
                            }
                          }}
                        >
                          <div className="p-4">
                            <div className="flex items-center gap-4">
                              {/* Wallet Icon */}
                              <div
                                className="w-12 h-12 rounded-xl flex items-center justify-center"
                                style={{
                                  background: 'rgba(255, 255, 255, 0.05)',
                                  border: '1px solid rgba(255, 255, 255, 0.1)',
                                  backdropFilter: 'blur(10px)'
                                }}
                              >
                                {wallet.icon ? (
                                  <img
                                    src={wallet.icon}
                                    alt={wallet.name}
                                    className="w-6 h-6 object-contain"
                                    onError={(e) => {
                                      e.currentTarget.style.display = 'none'
                                      e.currentTarget.parentElement!.innerHTML = (wallet.name || 'W').charAt(0)
                                    }}
                                  />
                                ) : (
                                  <Wallet className="w-5 h-5" style={{ color: wallet.color }} />
                                )}
                              </div>

                              {/* Wallet Info */}
                              <div className="flex-1 text-left">
                                <div className="flex items-center gap-2 mb-1">
                                  <h4
                                    className="text-white font-medium text-sm"
                                    style={{
                                      fontFamily: 'var(--font-helvetica)',
                                      fontWeight: 500
                                    }}
                                  >
                                    {wallet.name}
                                  </h4>
                                  {getCategoryIcon(wallet.category)}
                                </div>
                                <p className="text-xs text-white/60">{wallet.description}</p>
                              </div>

                              {/* Status/Action */}
                              <div className="flex items-center">
                                {isPending ? (
                                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : isInstalled ? (
                                  <div className="w-5 h-5 rounded-full border-2 border-white/30" />
                                ) : (
                                  <ExternalLink className="w-4 h-4 text-blue-400" />
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Install Section */}
            <div className="px-8 pb-8 pt-2 border-t border-white/10">
              <div className="flex items-start gap-4 mb-6">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{
                    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(37, 99, 235, 0.1))',
                    border: '1px solid rgba(59, 130, 246, 0.3)'
                  }}
                >
                  <AlertCircle className="w-6 h-6 text-blue-400" />
                </div>
                <div className="flex-1">
                  <h4
                    className="text-base font-semibold text-white mb-2"
                    style={{
                      fontFamily: 'var(--font-helvetica)',
                      fontWeight: 600
                    }}
                  >
                    New to Solana Wallets?
                  </h4>
                  <p className="text-sm text-white/70 leading-relaxed mb-4">
                    Install a wallet to securely store your SOL tokens and interact with decentralized applications.
                    Phantom is the most popular choice for beginners.
                  </p>

                  <div className="grid grid-cols-3 gap-3">
                    <a
                      href="https://phantom.app/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-blue-400/30 hover:border-blue-400/50 hover:bg-blue-500/10 transition-all text-sm font-semibold group"
                      style={{
                        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(37, 99, 235, 0.05))',
                        backdropFilter: 'blur(8px)'
                      }}
                    >
                      <ExternalLink className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" />
                      <span className="text-blue-300">Phantom</span>
                    </a>
                    <a
                      href="https://solflare.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-yellow-400/30 hover:border-yellow-400/50 hover:bg-yellow-500/10 transition-all text-sm font-semibold group"
                      style={{
                        background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(217, 119, 6, 0.05))',
                        backdropFilter: 'blur(8px)'
                      }}
                    >
                      <ExternalLink className="w-4 h-4 text-yellow-400 group-hover:scale-110 transition-transform" />
                      <span className="text-yellow-300">Solflare</span>
                    </a>
                    </div>
                </div>
              </div>

              {/* Security Notice */}
              <div className="flex items-start gap-3 p-4 rounded-xl" style={{
                background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.08), rgba(34, 197, 94, 0.04))',
                border: '1px solid rgba(34, 197, 94, 0.15)'
              }}>
                <ShieldCheck className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="text-emerald-300 font-medium mb-1">Connection Active</p>
                  <p className="text-emerald-200/80">
                    Your wallet connection is encrypted and secure. Never share your private key or seed phrase with anyone.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Animation styles */}
      <style jsx>{`
        @keyframes modalSlideIn {
          from {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.9);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
        }
      `}</style>
    </div>
  )
}

export default EnhancedWalletModal