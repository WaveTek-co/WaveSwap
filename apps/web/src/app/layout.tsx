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
    <html lang="en">
      <body className="antialiased">
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