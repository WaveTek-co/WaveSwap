'use client'

import { X, Wrench, Clock, ExternalLink, AlertCircle } from 'lucide-react'
import { useThemeConfig, createGlassStyles } from '@/lib/theme'

interface MaintenanceModalProps {
  isOpen: boolean
  onClose: () => void
}

export function MaintenanceModal({ isOpen, onClose }: MaintenanceModalProps) {
  const theme = useThemeConfig()

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 z-[998] bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div
        className="relative z-[999] w-full max-w-lg transform transition-all duration-300 ease-out"
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
            <div className="flex items-center justify-between p-6 pb-4 border-b border-white/10">
              <div className="flex items-center gap-4">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center animate-pulse"
                  style={{
                    background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.2), rgba(245, 158, 11, 0.1))',
                    border: '1px solid rgba(251, 191, 36, 0.3)',
                    boxShadow: '0 8px 24px rgba(251, 191, 36, 0.3)'
                  }}
                >
                  <Wrench className="w-7 h-7 text-amber-400" style={{ filter: 'drop-shadow(0 0 8px rgba(251, 191, 36, 0.5))' }} />
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
                    Under Maintenance
                  </h2>
                  <p className="text-white/70 text-sm">We're improving your experience</p>
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

            {/* Main Content */}
            <div className="p-6 pb-4">
              {/* Maintenance Message */}
              <div className="text-center mb-4">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse"
                  style={{
                    background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.1), rgba(245, 158, 11, 0.05))',
                    border: '1px solid rgba(251, 191, 36, 0.2)',
                  }}
                >
                  <Wrench className="w-8 h-8 text-amber-400" />
                </div>

                <h3
                  className="text-xl font-bold text-white mb-4"
                  style={{
                    fontFamily: 'var(--font-helvetica)',
                    fontWeight: 600
                  }}
                >
                  WaveSwap is temporarily down
                </h3>

                <p className="text-white/70 leading-relaxed mb-4">
                  We're currently performing essential maintenance to enhance our platform's performance and security.
                  This temporary downtime ensures we can provide you with the best possible trading experience.
                </p>

                {/* Maintenance Features */}
                <div className="grid grid-cols-1 gap-3 mb-4">
                  <div className="flex items-center gap-3 p-3 rounded-xl"
                    style={{
                      background: 'rgba(34, 197, 94, 0.08)',
                      border: '1px solid rgba(34, 197, 94, 0.15)'
                    }}
                  >
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0">
                      <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse" />
                    </div>
                    <div className="text-left">
                      <h4 className="text-green-300 font-medium text-sm mb-1">Performance Improvements</h4>
                      <p className="text-green-200/80 text-xs">Faster swaps and better user experience</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 rounded-xl"
                    style={{
                      background: 'rgba(59, 130, 246, 0.08)',
                      border: '1px solid rgba(59, 130, 246, 0.15)'
                    }}
                  >
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0">
                      <div className="w-3 h-3 bg-blue-400 rounded-full animate-pulse" />
                    </div>
                    <div className="text-left">
                      <h4 className="text-blue-300 font-medium text-sm mb-1">Security Enhancements</h4>
                      <p className="text-blue-200/80 text-xs">Advanced protection for your assets</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 rounded-xl"
                    style={{
                      background: 'rgba(168, 85, 247, 0.08)',
                      border: '1px solid rgba(168, 85, 247, 0.15)'
                    }}
                  >
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0">
                      <div className="w-3 h-3 bg-purple-400 rounded-full animate-pulse" />
                    </div>
                    <div className="text-left">
                      <h4 className="text-purple-300 font-medium text-sm mb-1">New Features</h4>
                      <p className="text-purple-200/80 text-xs">Exciting updates coming soon</p>
                    </div>
                  </div>
                </div>

                {/* Estimated Time */}
                <div className="flex items-center justify-center gap-2 mb-8 p-4 rounded-xl"
                  style={{
                    background: 'rgba(251, 191, 36, 0.08)',
                    border: '1px solid rgba(251, 191, 36, 0.15)'
                  }}
                >
                  <Clock className="w-5 h-5 text-amber-400" />
                  <div className="text-left">
                    <h4 className="text-amber-300 font-medium text-sm">Estimated Downtime</h4>
                    <p className="text-amber-200/80 text-xs">Approximately 2-3 hours</p>
                  </div>
                </div>
            </div>

            {/* Footer */}
            <div className="px-6 pb-4">
              <div className="flex items-center justify-center gap-2 text-xs text-white/40">
                <AlertCircle className="w-3 h-3" />
                <span>Thank you for your patience and understanding</span>
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
    </div>
  )
}

export default MaintenanceModal