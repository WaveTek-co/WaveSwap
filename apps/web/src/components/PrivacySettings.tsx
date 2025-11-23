'use client'

import { useState, useEffect } from 'react'
import { Switch, Listbox, Transition } from '@headlessui/react'
import {
  ShieldCheckIcon,
  InformationCircleIcon,
  ExclamationTriangleIcon,
  CheckIcon,
  ChevronDownIcon
} from '@heroicons/react/24/outline'
import { EncifherUtils } from '@/lib/encifher'

interface PrivacySettingsProps {
  privacyMode: boolean
  privacyProvider: 'encifher' | 'arcium'
  onPrivacyModeChange: (enabled: boolean) => void
  onPrivacyProviderChange: (provider: 'encifher' | 'arcium') => void
}

const privacyProviders = [
  {
    id: 'encifher',
    name: 'Encifher (Coming Soon)',
    description: 'Advanced privacy with encrypted transactions and enhanced confidentiality',
    features: [
      'Enhanced encryption',
      'Advanced encryption protocols',
      'Private transaction pools',
      'Meta-transaction support'
    ],
    supportedTokens: ['SOL', 'USDC', 'USDT', 'WAVE', 'BONK', 'RAY'],
    estimatedTime: '1-3 minutes',
    privacyLevel: 'maximum',
    isAvailable: false
  },
  {
    id: 'arcium',
    name: 'Arcium',
    description: 'Standard confidentiality with confidential SPL tokens',
    features: [
      'Confidential amounts',
      'Hidden balances',
      'Standard encryption',
      'Basic privacy features'
    ],
    supportedTokens: ['SOL', 'USDC', 'USDT'],
    estimatedTime: '30-60 seconds',
    privacyLevel: 'standard'
  }
]

export function PrivacySettings({
  privacyMode,
  privacyProvider,
  onPrivacyModeChange,
  onPrivacyProviderChange
}: PrivacySettingsProps) {
  const [isEncifherConfigured, setIsEncifherConfigured] = useState(false)

  useEffect(() => {
    setIsEncifherConfigured(EncifherUtils.isConfigured())
  }, [])

  const selectedProvider = privacyProviders.find(p => p.id === privacyProvider)

  return (
    <div className="space-y-6">
      {/* Privacy Mode Toggle */}
      <div className="bg-gray-900/60 backdrop-blur-xl rounded-2xl border border-gray-800/60 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-r from-emerald-600/20 to-teal-600/20 rounded-full p-2">
              <ShieldCheckIcon className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Privacy Mode</h3>
              <p className="text-sm text-gray-400">
                {privacyMode ? 'Privacy features are enabled' : 'Using standard public transactions'}
              </p>
            </div>
          </div>

          <Switch
            checked={privacyMode}
            onChange={onPrivacyModeChange}
            className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:ring-offset-2 focus:ring-offset-gray-900"
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                privacyMode ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </Switch>
        </div>

        {privacyMode && (
          <div className="mt-4 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
            <div className="flex items-start gap-3">
              <InformationCircleIcon className="h-5 w-5 text-emerald-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-emerald-300">
                <p className="font-medium mb-1">Privacy Mode Active</p>
                <p className="text-emerald-200/80">
                  Your transactions will be processed privately, hiding amounts, addresses, and transaction details from public view.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Privacy Provider Selection */}
      {privacyMode && (
        <div className="bg-gray-900/60 backdrop-blur-xl rounded-2xl border border-gray-800/60 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Privacy Provider</h3>

          <div className="space-y-4">
            {privacyProviders.map((provider) => (
              <div
                key={provider.id}
                className={`relative rounded-xl border-2 transition-all duration-200 cursor-pointer ${
                  privacyProvider === provider.id
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : 'border-gray-700/60 hover:border-gray-600/60 hover:bg-gray-800/40'
                }`}
                onClick={() => onPrivacyProviderChange(provider.id as 'encifher' | 'arcium')}
              >
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        privacyProvider === provider.id
                          ? 'border-emerald-400'
                          : 'border-gray-500'
                      }`}>
                        {privacyProvider === provider.id && (
                          <div className="w-2 h-2 bg-emerald-400 rounded-full" />
                        )}
                      </div>
                      <h4 className="text-white font-medium">{provider.name}</h4>
                      {provider.id === 'encifher' && (
                        <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-xs font-medium rounded-full">
                          Recommended
                        </span>
                      )}
                    </div>

                    <div className={`px-2 py-1 rounded-lg text-xs font-medium ${
                      provider.privacyLevel === 'maximum'
                        ? 'bg-purple-500/20 text-purple-400'
                        : 'bg-blue-500/20 text-blue-400'
                    }`}>
                      {provider.privacyLevel === 'maximum' ? 'Maximum Privacy' : 'Standard Privacy'}
                    </div>
                  </div>

                  <p className="text-sm text-gray-300 mb-3">{provider.description}</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="space-y-2">
                      <p className="text-gray-400 font-medium">Features:</p>
                      <ul className="space-y-1">
                        {provider.features.map((feature, index) => (
                          <li key={index} className="flex items-center gap-2 text-gray-300">
                            <CheckIcon className="h-3 w-3 text-emerald-400" />
                            {feature}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="space-y-2">
                      <p className="text-gray-400 font-medium">Specifications:</p>
                      <div className="space-y-1">
                        <p className="text-gray-300">
                          <span className="text-gray-500">Tokens:</span> {provider.supportedTokens.join(', ')}
                        </p>
                        <p className="text-gray-300">
                          <span className="text-gray-500">Time:</span> {provider.estimatedTime}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Configuration Status */}
          {!isEncifherConfigured && (
            <div className="mt-4 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
              <div className="flex items-start gap-3">
                <ExclamationTriangleIcon className="h-5 w-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-yellow-300">
                  <p className="font-medium mb-1">Encifher SDK Not Configured</p>
                  <p className="text-yellow-200/80">
                    Encifher requires additional configuration. Please contact support to enable maximum privacy features.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Privacy Information */}
      <div className="bg-gray-900/60 backdrop-blur-xl rounded-2xl border border-gray-800/60 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">About Private Swaps</h3>

        <div className="space-y-4 text-sm text-gray-300">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-emerald-400 text-xs font-bold">1</span>
            </div>
            <div>
              <p className="font-medium text-white mb-1">Enhanced Privacy</p>
              <p className="text-gray-400">
                Your transaction amounts, addresses, and routing information are encrypted and hidden from public view.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-emerald-400 text-xs font-bold">2</span>
            </div>
            <div>
              <p className="font-medium text-white mb-1">Zero MEV Exposure</p>
              <p className="text-gray-400">
                Private transactions cannot be frontrun or sandwich attacked, protecting you from Maximum Extractable Value attacks.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-emerald-400 text-xs font-bold">3</span>
            </div>
            <div>
              <p className="font-medium text-white mb-1">Institutional-Grade Execution</p>
              <p className="text-gray-400">
                Leverages advanced privacy protocols and decentralized infrastructure for reliable transaction processing.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}