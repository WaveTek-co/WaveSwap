import type { Metadata, Viewport } from 'next'
import './globals.css'
import { SolanaWalletProvider } from '@/providers/SolanaWalletProvider'
import { WaveSwapProvider } from '@/components/providers/WaveSwapProvider'
import { NoSSRProvider } from '@/components/providers/NoSSRProvider'
import PrivacyReminder from '@/components/PrivacyReminder'
import { PrivacyProvider } from '@/contexts/PrivacyContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { NearWalletProvider } from '@/providers/NearWalletProvider'
import { StarknetWalletProvider } from '@/providers/StarknetWalletProvider'
import { WalletModalProvider } from '@/contexts/WalletModalContext'
import { GlobalWalletModal } from '@/components/Wallets/GlobalWalletModal'

// Using local Helvetica Neue and JetBrains Mono fonts only

export const metadata: Metadata = {
  title: 'WaveSwap - Privacy-Preserving DEX Aggregator',
  description: 'Swap any SPL tokens privately with encrypted amounts, zero MEV exposure, and institutional-grade execution on Solana.',
  keywords: ['Solana', 'DeFi', 'DEX', 'Privacy', 'Swap', 'Cryptocurrency', 'Blockchain', 'WaveTek'],
  authors: [{ name: 'WaveSwap Team' }],
  creator: 'WaveSwap',
  publisher: 'WaveSwap',
  metadataBase: new URL(process.env.NEXT_PUBLIC_API_URL || 'https://wavetek-v2.vercel.app'),
  openGraph: {
    title: 'WaveSwap - Private Solana Swaps',
    description: 'Swap SPL tokens privately with encrypted amounts on Solana with zero MEV exposure',
    url: 'https://wavetek-v2.vercel.app',
    siteName: 'WaveSwap by WaveTek',
    images: [
      {
        url: '/banner.jpg',
        width: 1200,
        height: 630,
        alt: 'WaveSwap - Private Solana Swaps with Zero MEV',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'WaveSwap - Private Solana Swaps',
    description: 'Swap SPL tokens privately with encrypted amounts on Solana with zero MEV exposure',
    images: ['/banner.jpg'],
    site: '@waveswap',
  },
  other: {
    'og:site_name': 'WaveSwap by WaveTek',
    'twitter:site': '@waveswap',
    'twitter:creator': '@wavetek',
    'application-name': 'WaveSwap',
    'apple-mobile-web-app-title': 'WaveSwap',
    'msapplication-TileColor': '#264af5',
    'theme-color': '#264af5',
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
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        <ThemeProvider>
          <PrivacyProvider>
            <WalletModalProvider>
              <NoSSRProvider>
                <NearWalletProvider>
                  <StarknetWalletProvider>
                    <SolanaWalletProvider>
                      <WaveSwapProvider>
                        <div className="min-h-screen text-foreground theme-background">
                          {children}
                          <PrivacyReminder />
                          <GlobalWalletModal />
                        </div>
                      </WaveSwapProvider>
                    </SolanaWalletProvider>
                  </StarknetWalletProvider>
                </NearWalletProvider>
              </NoSSRProvider>
            </WalletModalProvider>
          </PrivacyProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}