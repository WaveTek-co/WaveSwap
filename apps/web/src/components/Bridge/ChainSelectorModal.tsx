'use client'

import { Fragment } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { SUPPORTED_CHAINS, type ChainId } from '../../lib/nearIntentBridge'
import { ChainIcon } from '../ui/IconWithFallback'
import { useThemeConfig, createGlassStyles } from '@/lib/theme'

interface ChainSelectorModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectChain: (chainId: ChainId) => void
  excludeChain?: ChainId
  title: string
}

export function ChainSelectorModal({
  isOpen,
  onClose,
  onSelectChain,
  excludeChain,
  title
}: ChainSelectorModalProps) {
  const theme = useThemeConfig()
  const filteredChains = excludeChain
    ? SUPPORTED_CHAINS.filter(chain => chain.id !== excludeChain)
    : SUPPORTED_CHAINS

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-[999999]" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-3xl p-0 text-left align-middle transition-all relative"
                style={{
                  ...createGlassStyles(theme),
                  background: `
                    linear-gradient(135deg,
                      ${theme.colors.surface}f8 0%,
                      ${theme.colors.surfaceHover}f2 50%,
                      ${theme.colors.surface}f6 100%
                    ),
                    radial-gradient(circle at 50% 10%,
                      ${theme.colors.primary}12 0%,
                      transparent 50%
                    )
                  `,
                  border: `1px solid ${theme.colors.primary}30`,
                  boxShadow: `
                    0 50px 100px -20px ${theme.colors.shadow},
                    0 25px 50px -12px ${theme.colors.shadow}cc,
                    0 0 0 1px ${theme.colors.primary}20,
                    inset 0 1px 0 rgba(255, 255, 255, ${theme.name === 'light' ? '0.3' : '0.1'})
                  `,
                  backdropFilter: 'blur(20px) saturate(1.2)'
                }}
              >
                {/* Header */}
                <div className="p-6" style={{ borderBottom: `1px solid ${theme.colors.border}` }}>
                  <div className="flex items-center justify-between">
                    <Dialog.Title className="text-xl font-bold"
                      style={{
                        fontFamily: 'var(--font-helvetica)',
                        letterSpacing: '0.025em',
                        textShadow: `0 0 20px ${theme.colors.primary}`,
                        color: theme.colors.textPrimary
                      }}
                    >
                      {title}
                    </Dialog.Title>
                    <button
                      onClick={onClose}
                      className="p-2 rounded-xl transition-all group"
                      style={{
                        color: theme.colors.textMuted,
                        background: 'transparent'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = `${theme.colors.surfaceHover}50`
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      <XMarkIcon className="w-5 h-5 transition-colors" style={{
                        color: theme.colors.textMuted
                      }} />
                    </button>
                  </div>
                </div>

                {/* Chain List */}
                <div className="p-2 max-h-96 overflow-y-auto">
                  {filteredChains.map((chain) => (
                    <button
                      key={chain.id}
                      onClick={() => {
                        onSelectChain(chain.id as ChainId)
                        onClose()
                      }}
                      className="w-full p-4 rounded-xl transition-all group"
                      style={{
                        borderBottom: `1px solid ${theme.colors.border}`,
                        background: 'transparent'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = `${theme.colors.primary}10`
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="relative">
                            <div
                              className="w-12 h-12 rounded-2xl flex items-center justify-center"
                              style={{
                                background: `${theme.colors.primary}20`,
                                border: `1px solid ${theme.colors.primary}40`
                              }}
                            >
                              <ChainIcon chainId={chain.id} size={24} />
                            </div>
                            {/* Chain indicator */}
                            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 flex items-center justify-center" style={{
                              backgroundColor: theme.colors.success,
                              borderColor: theme.colors.background
                            }}>
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: theme.colors.textPrimary }}></div>
                            </div>
                          </div>
                          <div className="flex-1 text-left">
                            <div className="font-semibold text-lg transition-colors" style={{
                              color: theme.colors.textPrimary
                            }}>
                              {chain.name}
                            </div>
                            <div className="text-sm mt-1" style={{
                              fontFamily: 'var(--font-mono)',
                              color: theme.colors.textMuted
                            }}>
                              {chain.addressFormat}
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                              <div
                                className="text-xs px-2 py-1 rounded-full font-medium"
                                style={{
                                  background: chain.gradient,
                                  color: theme.colors.textPrimary
                                }}
                              >
                                Active
                              </div>
                              <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: theme.colors.success }}></div>
                            </div>
                          </div>
                        </div>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <svg
                            className="w-5 h-5 transition-colors"
                            fill="none"
                            stroke="currentColor"
                            style={{ color: theme.colors.textMuted }}
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Footer */}
                <div className="p-4" style={{ borderTop: '1px solid var(--wave-glass-border)' }}>
                  <div className="text-center">
                    <p className="text-xs" style={{ color: 'var(--wave-text-muted)' }}>
                      Select the blockchain network for your bridge transaction
                    </p>
                    <div className="flex items-center justify-center gap-4 mt-3">
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span className="text-xs" style={{ color: 'var(--wave-text-muted)' }}>Available</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        <span className="text-xs" style={{ color: 'var(--wave-text-muted)' }}>Connected</span>
                      </div>
                    </div>
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}