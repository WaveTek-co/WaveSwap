'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { useWalletModal, WalletModalButton } from '@solana/wallet-adapter-react-ui'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import {
  X,
  Wallet,
  Check,
  AlertCircle,
  ExternalLink,
  Star,
  ShieldCheck,
  Zap,
  Users,
  Globe
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
  const { select, wallets, connect, disconnect, publicKey, connecting, connected } = useWallet()
  const { connection } = useConnection()
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  const WALLET_OPTIONS: WalletOption[] = [
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

  // Filter available wallets
  const availableWallets = useMemo(() => {
    return wallets.map(wallet => {
      const walletOption = WALLET_OPTIONS.find(option => option.id === wallet.adapter.name.toLowerCase())
      return {
        ...wallet,
        ...walletOption,
        isInstalled: wallet.readyState === 'Installed'
      }
    })
  }, [wallets])

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

      // Find the wallet adapter
      const wallet = availableWallets.find(w => w.adapter.name.toLowerCase() === walletName.toLowerCase())
      if (!wallet) {
        throw new Error('Wallet not found')
      }

      // Select and connect
      select(wallet.adapter.name)
      await connect()

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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {availableWallets.map((wallet) => {
                  const isRecommended = wallet.isRecommended
                  const isInstalled = wallet.readyState === 'Installed'
                  const isConnected = connected && publicKey && wallet.adapter.name === wallet.adapter.name
                  const isPending = selectedWallet === wallet.adapter.name.toLowerCase() && connecting

                  return (
                    <div
                      key={wallet.adapter.name}
                      className={`relative ${isRecommended ? 'order-first' : ''}`}
                    >
                      {/* Recommended Badge */}
                      {isRecommended && !isConnected && (
                        <div className="absolute -top-2 left-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-400/30 backdrop-blur-sm">
                          <Star className="w-3 h-3 text-blue-400" />
                          <span className="text-blue-300 text-xs font-semibold" style={{ fontFamily: 'var(--font-helvetica)' }}>
                            RECOMMENDED
                          </span>
                        </div>
                      )}

                      <button
                        onClick={() => handleWalletConnect(wallet.adapter.name.toLowerCase())}
                        disabled={isConnected || isPending || !isInstalled}
                        className={`w-full group relative overflow-hidden rounded-2xl border transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] ${
                          isRecommended ? 'ring-2 ring-blue-400/20 ring-offset-2 ring-offset-transparent' : ''
                        }`}
                        style={{
                          background: isConnected
                            ? `
                              linear-gradient(135deg,
                                rgba(34, 197, 94, 0.15) 0%,
                                rgba(34, 197, 94, 0.08) 50%,
                                rgba(34, 197, 94, 0.15) 100%
                              )
                            `
                            : isInstalled
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
                          borderColor: isConnected
                            ? 'rgba(34, 197, 94, 0.4)'
                            : isInstalled
                            ? 'rgba(33, 188, 255, 0.2)'
                            : 'rgba(55, 65, 81, 0.4)',
                          cursor: (isConnected || isPending || !isInstalled) ? 'default' : 'pointer',
                          backdropFilter: 'blur(16px) saturate(1.5)',
                          boxShadow: isConnected
                            ? `
                              0 12px 40px rgba(34, 197, 94, 0.2),
                              inset 0 1px 0 rgba(255, 255, 255, 0.1)
                            `
                            : isInstalled
                            ? `
                              0 12px 40px rgba(0, 0, 0, 0.3),
                              inset 0 1px 0 rgba(255, 255, 255, 0.05)
                            `
                            : `
                              0 8px 24px rgba(0, 0, 0, 0.2)
                            `,
                          marginTop: isRecommended ? '0.75rem' : '0'
                        }}
                        onMouseEnter={(e) => {
                          if (!isConnected && !isPending && isInstalled) {
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
                          if (!isConnected && !isPending && isInstalled) {
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
                                  background: isConnected
                                    ? 'rgba(34, 197, 94, 0.2)'
                                    : isRecommended
                                    ? 'rgba(33, 188, 255, 0.15)'
                                    : 'rgba(255, 255, 255, 0.05)',
                                  border: isConnected
                                    ? '1px solid rgba(34, 197, 94, 0.4)'
                                    : isRecommended
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
                              {isConnected && (
                                <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center shadow-lg">
                                  <Check className="w-3 h-3 text-white text-xs" />
                                </div>
                              )}
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
                              ) : isConnected ? (
                                <Check className="w-6 h-6 text-green-400" />
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
                              {wallet.features.slice(0, 3).map((feature, index) => (
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
                            {isConnected && (
                              <span className="px-3 py-1 text-xs font-semibold bg-green-500/20 text-green-400 rounded-full border border-green-500/30">
                                Connected
                              </span>
                            )}
                            {!isInstalled && (
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