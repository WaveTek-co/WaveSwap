import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const defaultTokens = [
  {
    mint: 'So11111111111111111111111111111111111111112',
    symbol: 'SOL',
    name: 'Solana',
    decimals: 9,
    logoUri: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
    isVerified: true,
  },
  {
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    logoUri: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
    isVerified: true,
  },
  {
    mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    logoUri: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png',
    isVerified: true,
  },
  {
    mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    symbol: 'BONK',
    name: 'Bonk',
    decimals: 5,
    logoUri: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263/logo.png',
    isVerified: true,
  },
]

const defaultRoutes = [
  {
    name: 'Jupiter Aggregated',
    description: 'Jupiter DEX aggregation with best price routing',
    isActive: true,
    priority: 1,
  },
  {
    name: 'Orca Direct',
    description: 'Direct Orca pool swaps',
    isActive: true,
    priority: 2,
  },
  {
    name: 'Raydium Direct',
    description: 'Direct Raydium pool swaps',
    isActive: true,
    priority: 3,
  },
]

async function main() {
  console.log('🌱 Starting database seeding...')

  try {
    // Seed token metadata
    console.log('📊 Seeding token metadata...')
    for (const token of defaultTokens) {
      await prisma.tokenMetadata.upsert({
        where: { mint: token.mint },
        update: {
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals,
          logoUri: token.logoUri,
          isVerified: token.isVerified,
          updatedAt: new Date()
        },
        create: {
          mint: token.mint,
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals,
          logoUri: token.logoUri,
          isVerified: token.isVerified
        }
      })
      console.log(`✅ ${token.symbol} - ${token.name}`)
    }

    // Seed routes
    console.log('🛣️ Seeding routes...')
    for (const route of defaultRoutes) {
      await prisma.route.upsert({
        where: { name: route.name },
        update: {
          description: route.description,
          isActive: route.isActive,
          priority: route.priority,
          updatedAt: new Date()
        },
        create: {
          name: route.name,
          description: route.description,
          isActive: route.isActive,
          priority: route.priority
        }
      })
      console.log(`✅ ${route.name}`)
    }

    console.log('🎉 Database seeding completed successfully!')
  } catch (error) {
    console.error('❌ Error during database seeding:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })