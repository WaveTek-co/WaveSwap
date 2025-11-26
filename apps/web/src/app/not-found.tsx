import Link from 'next/link'
import { HomeIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { ShieldCheckIcon } from '@heroicons/react/24/outline'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary-900/20 flex items-center justify-center px-4">
      {/* Background particles */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-privacy-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
      </div>

      {/* Main content */}
      <div className="relative z-10 text-center max-w-2xl mx-auto">
        {/* 404 with shield */}
        <div className="mb-8 relative">
          <div className="text-9xl font-bold bg-gradient-to-r from-primary-400 via-primary-300 to-privacy-400 bg-clip-text text-transparent">
            404
          </div>
          <div className="absolute -inset-16 flex items-center justify-center">
            <ShieldCheckIcon className="w-24 h-24 text-primary-400/30" />
          </div>
        </div>

        {/* Error message */}
        <h1 className="text-4xl font-bold text-white mb-4">
          Page Not Found
        </h1>

        <p className="text-xl text-secondary-400 mb-8 max-w-md mx-auto">
          Oops! It seems this page has vanished into the blockchain void.
        </p>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Link
            href="/"
            className="glass-btn-primary group inline-flex items-center px-6 py-3 font-semibold transition-all hover:scale-105 hover:shadow-2xl hover:shadow-primary-500/25"
          >
            <HomeIcon className="w-5 h-5 mr-2 group-hover:translate-x-0.5 transition-transform" />
            Back to Home
          </Link>

          <Link
            href="/"
            className="glass-btn-secondary group inline-flex items-center px-6 py-3 font-semibold transition-all hover:scale-105 hover:shadow-2xl hover:shadow-secondary-500/25"
          >
            <MagnifyingGlassIcon className="w-5 h-5 mr-2 group-hover:translate-x-0.5 transition-transform" />
            Start Swapping
          </Link>
        </div>

        {/* Help text */}
        <div className="mt-12 text-sm text-secondary-500">
          <p className="mb-2">Need help? Try one of these:</p>
          <div className="flex flex-wrap justify-center gap-2 text-xs">
            <span className="px-3 py-1 bg-secondary-800/50 rounded-full border border-secondary-700/30">
              /swap
            </span>
            <span className="px-3 py-1 bg-secondary-800/50 rounded-full border border-secondary-700/30">
              /bridge
            </span>
            <span className="px-3 py-1 bg-secondary-800/50 rounded-full border border-secondary-700/30">
              /docs
            </span>
          </div>
        </div>

        {/* Decorative elements */}
        <div className="absolute top-10 right-10 w-20 h-20 border-l-2 border-t-2 border-primary-500/20 rounded-tl-full" />
        <div className="absolute bottom-10 left-10 w-16 h-16 border-r-2 border-b-2 border-privacy-500/20 rounded-br-full" />
      </div>
    </div>
  )
}