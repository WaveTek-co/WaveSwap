import React from 'react'
import { Listbox } from '@headlessui/react'
import { ChevronDownIcon } from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'

export interface Token {
  symbol: string
  mint: string
  decimals: number
  name: string
  logoURI?: string
}

export interface TokenSelectorProps {
  tokens: Token[]
  selectedToken: Token
  onTokenChange: (token: Token) => void
  disabled?: false
  className?: string
}

export const TokenSelector: React.FC<TokenSelectorProps> = ({
  tokens,
  selectedToken,
  onTokenChange,
  disabled = false,
  className,
}) => {
  return (
    <Listbox value={selectedToken} onChange={onTokenChange} disabled={disabled}>
      <div className="relative">
        <Listbox.Button
          className={cn(
            'flex items-center space-x-2 h-full px-3 border-l border-secondary-700 hover:bg-secondary-700/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
            className
          )}
        >
          <span className="text-sm font-medium text-white">
            {selectedToken.symbol}
          </span>
          <ChevronDownIcon className="h-4 w-4 text-secondary-400" />
        </Listbox.Button>

        <Listbox.Options className="absolute right-0 z-20 mt-1 w-40 bg-secondary-800 border border-secondary-700 rounded-lg shadow-xl max-h-60 overflow-auto">
          {tokens.map((token) => (
            <Listbox.Option
              key={token.mint}
              value={token}
              className={({ active }) =>
                cn(
                  'cursor-pointer select-none px-3 py-2 text-sm',
                  active
                    ? 'bg-primary-600 text-white'
                    : 'text-secondary-300 hover:bg-secondary-700'
                )
              }
            >
              <div className="flex items-center justify-between">
                <span>{token.symbol}</span>
              </div>
            </Listbox.Option>
          ))}
        </Listbox.Options>
      </div>
    </Listbox>
  )
}