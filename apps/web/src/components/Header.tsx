'use client'

import { useState } from 'react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { LinkIcon, ShieldCheckIcon, DocumentTextIcon } from '@heroicons/react/24/outline'
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react'
import { PrivacyTag } from './PrivacyReminder'

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <header className="glass sticky top-0 z-50">
      <nav className="container mx-auto px-4 sm:px-6 lg:px-8" aria-label="Top">
        <div className="flex w-full items-center justify-between border-b border-secondary-700/50 py-4 lg:border-none">
          <div className="flex items-center">
            <a href="#">
              <span className="sr-only">WaveSwap</span>
              <div className="flex items-center space-x-3">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary-500 to-privacy-500 flex items-center justify-center">
                  <ShieldCheckIcon className="h-5 w-5 text-white" />
                </div>
                <span className="text-xl font-bold text-white">WaveSwap</span>
              </div>
            </a>
            <div className="ml-10 hidden space-x-8 lg:block">
              <a href="#features" className="text-base font-medium text-white hover:text-primary-400 transition-colors">
                Features
              </a>
              <a href="#how-it-works" className="text-base font-medium text-white hover:text-primary-400 transition-colors">
                How It Works
              </a>
              <a href="#security" className="text-base font-medium text-white hover:text-primary-400 transition-colors">
                Security
              </a>
              <a href="https://docs.waveswap.io" target="_blank" rel="noopener noreferrer" className="text-base font-medium text-white hover:text-primary-400 transition-colors flex items-center space-x-1">
                <span>Docs</span>
                <LinkIcon className="h-4 w-4" />
              </a>
            </div>
          </div>
          <div className="ml-10 flex items-center space-x-4">
            <PrivacyTag />
            <div className="hidden lg:block">
              <WalletMultiButton className="!bg-primary-600 hover:!bg-primary-700 !transition-colors !duration-200 !font-medium !py-2 !px-4 !rounded-lg" />
            </div>
            <button
              type="button"
              className="-m-2.5 rounded-md p-2.5 text-gray-400 lg:hidden"
              onClick={() => setMobileMenuOpen(true)}
            >
              <span className="sr-only">Open menu</span>
              <svg className="h-6 w-6 fill-current" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M3 6h18v2H3V6m0 5h18v2H3v-2m0 5h18v2H3v-2Z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile menu */}
      <Transition show={mobileMenuOpen}>
        <Dialog className="lg:hidden" onClose={setMobileMenuOpen}>
          <TransitionChild
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 z-50" />
          </TransitionChild>
          <TransitionChild
            enter="ease-out duration-300"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <DialogPanel className="fixed inset-y-0 right-0 z-50 w-full overflow-y-auto bg-secondary-900 px-6 py-6 sm:max-w-sm sm:ring-1 sm:ring-white/10">
              <div className="flex items-center justify-between">
                <a href="#" className="-m-1.5 p-1.5">
                  <div className="flex items-center space-x-3">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary-500 to-privacy-500 flex items-center justify-center">
                      <ShieldCheckIcon className="h-5 w-5 text-white" />
                    </div>
                    <span className="text-xl font-bold text-white">WaveSwap</span>
                  </div>
                </a>
                <button
                  type="button"
                  className="-m-2.5 rounded-md p-2.5 text-gray-400"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span className="sr-only">Close menu</span>
                  <svg className="h-6 w-6 fill-current" viewBox="0 0 24 24">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41Z" />
                  </svg>
                </button>
              </div>
              <div className="mt-6 flow-root">
                <div className="-my-6 divide-y divide-gray-500/25">
                  <div className="space-y-2 py-6">
                    <a
                      href="#features"
                      className="-mx-3 block rounded-lg px-3 py-2 text-base font-semibold leading-7 text-white hover:bg-secondary-800"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Features
                    </a>
                    <a
                      href="#how-it-works"
                      className="-mx-3 block rounded-lg px-3 py-2 text-base font-semibold leading-7 text-white hover:bg-secondary-800"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      How It Works
                    </a>
                    <a
                      href="#security"
                      className="-mx-3 block rounded-lg px-3 py-2 text-base font-semibold leading-7 text-white hover:bg-secondary-800"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Security
                    </a>
                    <a
                      href="https://docs.waveswap.io"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="-mx-3 block rounded-lg px-3 py-2 text-base font-semibold leading-7 text-white hover:bg-secondary-800 flex items-center space-x-2"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <span>Docs</span>
                      <LinkIcon className="h-4 w-4" />
                    </a>
                  </div>
                  <div className="py-3 px-6">
                    <PrivacyTag />
                  </div>
                  <div className="py-6">
                    <div className="wallet-adapter-button-trigger">
                      <WalletMultiButton className="w-full !bg-primary-600 hover:!bg-primary-700 !transition-colors !duration-200 !font-medium !py-2 !px-4 !rounded-lg" />
                    </div>
                  </div>
                </div>
              </div>
            </DialogPanel>
          </TransitionChild>
        </Dialog>
      </Transition>
    </header>
  )
}