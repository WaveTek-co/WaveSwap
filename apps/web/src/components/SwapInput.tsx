'use client'

import { useState, useMemo } from 'react'
import { ChevronDownIcon, WalletIcon } from '@heroicons/react/24/outline'
import { Listbox, Transition } from '@headlessui/react'

interface SwapInputProps {
  label: string
  amount: string
  onAmountChange: (amount: string) => void
  token: { symbol: string; mint: string; decimals: number }
  onTokenChange: (token: { symbol: string; mint: string; decimals: number }) => void
  availableTokens: Array<{ symbol: string; mint: string; decimals: number }>
  balance: string
  balanceLoading: boolean
  disabled?: boolean
  readonly?: boolean
}

export function SwapInput({
  label,
  amount,
  onAmountChange,
  token,
  onTokenChange,
  availableTokens,
  balance,
  balanceLoading,
  disabled = false,
  readonly = false,
}: SwapInputProps) {
  const [tokenSelectOpen, setTokenSelectOpen] = useState(false)

  const filteredTokens = useMemo(() => {
    return availableTokens.filter(t => t.mint !== token.mint)
  }, [availableTokens, token.mint])

  const handleMaxClick = () => {
    if (!readonly && balance && parseFloat(balance) > 0) {
      onAmountChange(balance)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-secondary-300">{label}</label>
        <div className="balance-display">
          {balanceLoading ? (
            <div className="animate-pulse h-4 w-16 bg-secondary-700 rounded"></div>
          ) : (
            <button
              onClick={handleMaxClick}
              disabled={readonly || disabled || parseFloat(balance) === 0}
              className="text-xs text-secondary-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Balance: {balance}
            </button>
          )}
          <WalletIcon className="h-4 w-4 text-secondary-400 flex-shrink-0" />
        </div>
      </div>

      <div className="relative">
        <div className="flex items-center">
          <input
            type="number"
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
            placeholder=""
            disabled={disabled || readonly}
            className={`input-field pr-36 ${readonly ? 'cursor-not-allowed opacity-75' : ''}`}
            step="any"
            min="0"
          />

          {/* Token Selector */}
          <Listbox value={token} onChange={onTokenChange} disabled={disabled || readonly}>
            <div className="absolute inset-y-0 right-0 flex items-center">
              <Listbox.Button
                disabled={disabled || readonly}
                className="btn-with-icon h-full px-4 border-l border-secondary-700 hover:bg-secondary-700/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-[100px]"
              >
                <span className="text-sm font-medium text-white">{token.symbol}</span>
                <ChevronDownIcon className="h-4 w-4 text-secondary-400 flex-shrink-0" />
              </Listbox.Button>

              <Transition
                show={tokenSelectOpen}
                leave="transition ease-in duration-100"
                leaveFrom="opacity-100"
                leaveTo="opacity-0"
              >
                <Listbox.Options className="absolute right-0 z-50 mt-1 w-48 bg-secondary-800 border border-secondary-700 rounded-lg shadow-2xl max-h-60 overflow-auto backdrop-blur-sm">
                  {filteredTokens.map((tokenOption) => (
                    <Listbox.Option
                      key={tokenOption.mint}
                      value={tokenOption}
                      className={({ active }) =>
                        `cursor-pointer select-none px-4 py-3 text-sm transition-colors ${
                          active
                            ? 'bg-primary-600 text-white'
                            : 'text-secondary-300 hover:bg-secondary-700'
                        }`
                      }
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{tokenOption.symbol}</span>
                        {tokenOption.decimals && (
                          <span className="text-xs text-secondary-500">{tokenOption.decimals} decimals</span>
                        )}
                      </div>
                    </Listbox.Option>
                  ))}
                </Listbox.Options>
              </Transition>
            </div>
          </Listbox>
        </div>
      </div>
    </div>
  )
}