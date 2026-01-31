'use client'

import { toast } from 'sonner'
import { CheckCircleIcon, ArrowTopRightOnSquareIcon, BanknotesIcon, PaperAirplaneIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'

// Explorer URL for devnet
const EXPLORER_BASE_URL = 'https://explorer.solana.com/tx'
const NETWORK = 'devnet'

interface TransactionToastProps {
  type: 'send' | 'receive' | 'claim'
  signature: string
  amount?: number | bigint
  symbol?: string
  recipient?: string
  sender?: string
}

// Custom toast content component
function ToastContent({
  type,
  signature,
  amount,
  symbol = 'SOL',
  recipient,
  sender,
  onDismiss
}: TransactionToastProps & { onDismiss: () => void }) {
  const explorerUrl = `${EXPLORER_BASE_URL}/${signature}?cluster=${NETWORK}`

  // Format amount
  const formattedAmount = typeof amount === 'bigint'
    ? (Number(amount) / LAMPORTS_PER_SOL).toFixed(4)
    : amount?.toFixed(4) || '0'

  const titles = {
    send: 'Transaction Confirmed',
    receive: 'Payment Received',
    claim: 'Funds Claimed',
  }

  const icons = {
    send: PaperAirplaneIcon,
    receive: BanknotesIcon,
    claim: CheckCircleIcon,
  }

  const colors = {
    send: { bg: 'rgba(34, 197, 94, 0.1)', border: 'rgba(34, 197, 94, 0.3)', accent: '#22c55e' },
    receive: { bg: 'rgba(59, 130, 246, 0.1)', border: 'rgba(59, 130, 246, 0.3)', accent: '#3b82f6' },
    claim: { bg: 'rgba(168, 85, 247, 0.1)', border: 'rgba(168, 85, 247, 0.3)', accent: '#a855f7' },
  }

  const Icon = icons[type]
  const color = colors[type]

  return (
    <div
      className="relative flex items-start gap-3 p-4 rounded-xl min-w-[320px] max-w-[400px] animate-in slide-in-from-top-2 fade-in duration-300"
      style={{
        background: color.bg,
        border: `1px solid ${color.border}`,
        backdropFilter: 'blur(12px)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
      }}
    >
      {/* Icon */}
      <div
        className="flex-shrink-0 p-2 rounded-full"
        style={{ background: `${color.accent}20` }}
      >
        <Icon className="w-5 h-5" style={{ color: color.accent }} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <h4 className="font-semibold text-white text-sm">
            {titles[type]}
          </h4>
          <button
            onClick={onDismiss}
            className="p-1 rounded-full hover:bg-white/10 transition-colors"
          >
            <XMarkIcon className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Amount */}
        <div className="mt-1 flex items-baseline gap-1">
          <span className="text-xl font-bold" style={{ color: color.accent }}>
            {formattedAmount}
          </span>
          <span className="text-sm text-gray-400">{symbol}</span>
        </div>

        {/* Address info */}
        {type === 'send' && recipient && (
          <p className="text-xs text-gray-400 mt-1">
            To: {recipient.slice(0, 4)}...{recipient.slice(-4)}
          </p>
        )}
        {(type === 'receive' || type === 'claim') && sender && (
          <p className="text-xs text-gray-400 mt-1">
            From: {sender.slice(0, 4)}...{sender.slice(-4)}
          </p>
        )}

        {/* Explorer Link */}
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 hover:scale-[1.02]"
          style={{
            background: `${color.accent}20`,
            color: color.accent,
            border: `1px solid ${color.accent}40`,
          }}
        >
          <span>View on Explorer</span>
          <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
        </a>

        {/* Signature preview */}
        <p className="text-[10px] text-gray-500 mt-2 font-mono">
          {signature.slice(0, 16)}...{signature.slice(-8)}
        </p>
      </div>

      {/* Animated success indicator */}
      <div
        className="absolute top-0 left-0 h-1 rounded-t-xl animate-pulse"
        style={{
          background: `linear-gradient(90deg, ${color.accent}, ${color.accent}80)`,
          width: '100%',
        }}
      />
    </div>
  )
}

// Show send confirmation toast
export function showSendConfirmation(params: {
  signature: string
  amount: number | bigint
  symbol?: string
  recipient?: string
}) {
  const toastId = toast.custom(
    (t) => (
      <ToastContent
        type="send"
        signature={params.signature}
        amount={params.amount}
        symbol={params.symbol}
        recipient={params.recipient}
        onDismiss={() => toast.dismiss(t)}
      />
    ),
    {
      duration: 8000,
      position: 'bottom-right',
    }
  )
  return toastId
}

// Show payment received toast
export function showPaymentReceived(params: {
  signature: string
  amount: number | bigint
  symbol?: string
  sender?: string
}) {
  const toastId = toast.custom(
    (t) => (
      <ToastContent
        type="receive"
        signature={params.signature}
        amount={params.amount}
        symbol={params.symbol}
        sender={params.sender}
        onDismiss={() => toast.dismiss(t)}
      />
    ),
    {
      duration: 10000,
      position: 'bottom-right',
    }
  )
  return toastId
}

// Show claim success toast
export function showClaimSuccess(params: {
  signature: string
  amount: number | bigint
  symbol?: string
  sender?: string
}) {
  const toastId = toast.custom(
    (t) => (
      <ToastContent
        type="claim"
        signature={params.signature}
        amount={params.amount}
        symbol={params.symbol}
        sender={params.sender}
        onDismiss={() => toast.dismiss(t)}
      />
    ),
    {
      duration: 8000,
      position: 'bottom-right',
    }
  )
  return toastId
}

export default {
  showSendConfirmation,
  showPaymentReceived,
  showClaimSuccess,
}
