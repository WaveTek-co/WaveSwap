import type { Metadata, Viewport } from 'next'
import { Inter, Space_Grotesk, Outfit, Geist_Mono } from 'next/font/google'
import './globals.css'
import { CustomWalletProvider } from '@/components/providers/WalletProvider'
import { WaveSwapProvider } from '@/components/providers/WaveSwapProvider'
import { NoSSRProvider } from '@/components/providers/NoSSRProvider'
import PrivacyReminder from '@/components/PrivacyReminder'

// Professional font stack for UI
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap'
})

// Display font for headings and branding
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap'
})

// Modern wide font for display text
const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap'
})

// Developer-friendly monospace
const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap'
})

export const metadata: Metadata = {
  title: 'WaveSwap - Privacy-Preserving DEX Aggregator',
  description: 'Swap any SPL tokens privately with encrypted amounts, zero MEV exposure, and institutional-grade execution on Solana.',
  keywords: ['Solana', 'DeFi', 'DEX', 'Privacy', 'Swap', 'Cryptocurrency', 'Blockchain'],
  authors: [{ name: 'WaveSwap Team' }],
  creator: 'WaveSwap',
  publisher: 'WaveSwap',
  metadataBase: new URL(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'),
  openGraph: {
    title: 'WaveSwap - Private Solana Swaps',
    description: 'Swap SPL tokens privately with encrypted amounts on Solana',
    url: 'https://waveswap.io',
    siteName: 'WaveSwap',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'WaveSwap - Private Solana Swaps',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'WaveSwap - Private Solana Swaps',
    description: 'Swap SPL tokens privately with encrypted amounts on Solana',
    images: ['/og-image.png'],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`dark ${spaceGrotesk.variable} ${inter.variable} ${outfit.variable} ${geistMono.variable}`}>
      <body className="font-inter antialiased">
        <NoSSRProvider>
          <CustomWalletProvider>
            <WaveSwapProvider>
              <div className="min-h-screen bg-background text-foreground">
                {children}
                <PrivacyReminder />
              </div>
            </WaveSwapProvider>
          </CustomWalletProvider>
        </NoSSRProvider>
      </body>
    </html>
  )
}