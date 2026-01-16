# WaveSwap 🔒

<div align="center">

![WaveSwap Logo](https://github.com/WaveTek-co.png)

**Privacy-Preserving DEX Aggregator for Solana**

Swap any SPL tokens with encrypted amounts, zero MEV exposure, and institutional-grade execution.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Solana](https://img.shields.io/badge/Solana-9945FF?style=flat&logo=Solana&logoColor=white)](https://solana.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=TypeScript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-000000?style=flat&logo=nextdotjs&logoColor=white)](https://nextjs.org/)

**[Documentation](https://wave-swap-docs.vercel.app)** • **[Launch App](https://app.waveswap.io)** • **[Discord](https://discord.gg/waveswap)**

> ⚠️ **Important Notice**: WaveSwap is currently in development and not formally audited. Please use with caution and only with amounts you can afford to lose. WavePortal cross-chain bridge will be available soon.

</div>

## ✨ Features

### 🔒 Privacy by Default
- **Encrypted swap amounts** using Arcium C-SPL technology
- **MEV protection** - bots cannot see your trade amounts
- **Zero-knowledge** - amounts are only visible to you
- **No opt-in required** - privacy is automatic

### ⚡ Lightning Fast
- **Sub-second execution** with MagicBlock ephemeral rollups
- **Real-time quotes** from Jupiter V6 API
- **Best price routing** across all major Solana DEXs
- **One-click transactions** - no approve → swap dance

### 🏢 Institution Ready
- **Bulk operations** for treasury management
- **Audit trails** with selective disclosure
- **API access** for algorithmic trading
- **Regulatory compliance** features

## 🚀 Quick Start

### Prerequisites

- **Node.js 20+** and **Bun** package manager
- **PostgreSQL** and **Redis** (or use Docker)
- **Solana CLI** and **Anchor CLI** (for program development)

### Installation

```bash
# Clone the repository
git clone https://github.com/waveswap/waveswap.git
cd waveswap

# Install dependencies and setup environment
./scripts/setup.sh

# Start development servers
./scripts/dev.sh
```

### Your First Private Swap

1. **Visit** http://localhost:3000
2. **Connect your wallet** (Phantom, Backpack, etc.)
3. **Select tokens** (e.g., SOL → USDC)
4. **Enter amount** and **confirm swap**
5. **Done!** Your encrypted tokens arrive in seconds

## 🛠️ Development

### Environment Setup

```bash
# Complete setup (installs deps, builds packages, sets up database)
./scripts/setup.sh

# Or step by step:
bun install                    # Install dependencies
bun run build:packages        # Build shared packages
bun run db:setup              # Setup database
bun run dev                  # Start all services
```

### Available Scripts

```bash
# Development
bun run dev                   # Start all services
bun run dev:web              # Start web app only
bun run dev:backend          # Start backend only
bun run dev:docs             # Start docs only

# Building
bun run build                 # Build everything
bun run build:packages       # Build packages only
bun run build:apps           # Build apps only
bun run build:production     # Production build

# Testing
bun run test                  # Run all tests
bun run test:packages         # Test packages only
bun run test:apps             # Test apps only
bun run test:e2e              # End-to-end tests
bun run test:coverage         # Generate coverage

# Utilities
bun run lint                   # Lint code
bun run type-check            # Type check
bun run clean                  # Clean build artifacts
```

### Docker Development

```bash
# Start development environment
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Solana Program Development

```bash
# Build programs
cd packages/programs
anchor build

# Run tests
anchor test

# Deploy to devnet
anchor deploy --provider.cluster devnet
```

## 🏗️ Architecture

### Privacy Technology Stack

1. **Encifer** - Swap into Encifer's confidential tokens and withdraw them easy
2. **Near Intents** - Powering WavePortal to bridge ZEC to Solana confidentially
3. **Arcium** - Using Arcium's confidential SPL tokens and Dark Pools for Wave Staking
4. **Jupiter** - Best-in-class liquidity routing

---

## 💎 WaveStake - Liquid Staking Protocol

**📖 [Full Documentation](./docs/README.md)** | **[Status](./docs/STATUS.md)** | **[Deployment Guide](./docs/mainnet-deployment.md)**

WaveStake allows users to stake tokens and earn rewards while receiving Liquid Staking Tokens (LST) in return.

### Features
- ✅ Multi-token staking (SOL, WAVE, GOLD, WEALTH, ZEC)
- ✅ Flexible & Locked staking options
- ✅ Automatic reward distribution
- ✅ LST tokens: waveSOL, sWAVE, sGOLD, sWEALTH, sZEC
- ✅ Token-2022 compatible

### Current Status
- **v1.1** on devnet - All features working ✅
- Mainnet pending security audit 🚧
- [Full deployment checklist](./docs/mainnet-deployment.md)

### Quick Links
- **[Program Architecture](./docs/program-architecture.md)** - Technical deep dive
- **[Operations Guide](./docs/operations-guide.md)** - Day-to-day operations
- **[Changelog](./docs/CHANGELOG.md)** - Version history & bug fixes

---

### System Flow

1. **Token Wrapping** - SPL → Confidential SPL (encrypted amounts)
2. **Encrypted Computation** - Swap happens in private environment
3. **Settlement** - Final transaction with encrypted outputs
4. **Optional Unwrap** - Convert back to regular SPL when needed
<!-- 
## 📚 Documentation

- **[Getting Started](https://wave-swap-docs.vercel.app/guides/quickstart)** - Your first private swap
- **[API Reference](https://wave-swap-docs.vercel.app/api/overview)** - REST API documentation
- **[SDK Guide](https://wave-swap-docs.vercel.app/developers/sdk)** - TypeScript SDK usage
- **[Architecture](https://wave-swap-docs.vercel.app/products/waveswap)** - Technical deep dive
- **[Security](https://wave-swap-docs.vercel.app/security/overview)** - Security model and audits

## 🔌 SDK Usage

### Installation

```bash
npm install @waveswap/sdk
# or
bun add @waveswap/sdk
```

### Basic Usage

```typescript
import { WaveSwap } from '@waveswap/sdk'
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets'

const wallet = new PhantomWalletAdapter()
const waveswap = new WaveSwap({
  wallet,
  network: 'devnet',
  privacyMode: true
})

// Get a quote
const quote = await waveswap.getQuote({
  inputToken: 'SOL',
  outputToken: 'USDC',
  inputAmount: 10000000, // 0.01 SOL
})

// Submit swap
const intent = await waveswap.swap({
  inputToken: 'SOL',
  outputToken: 'USDC',
  inputAmount: 10000000,
  privacyMode: true
})

// Monitor status
intent.onStatusChange((status, details) => {
  console.log(`Swap status: ${status}`)
})

// Wait for completion
const result = await intent.wait()
console.log(`Received: ${result.outputAmount} USDC`)
```

## 🌐 API Reference

### Quote Endpoint

```http
POST /api/v1/quote
Content-Type: application/json

{
  "inputToken": "So11111111111111111111111111111111111111112",
  "outputToken": "EPjFWdd5Au17hunJyHyer4hoi6UcsbkxNmnpDnJ55ip2",
  "inputAmount": "10000000",
  "slippageBps": 50,
  "privacyMode": true
}
```

### Swap Endpoint

```http
POST /api/v1/swap/submit
Content-Type: application/json

{
  "userAddress": "9B5Xz...",
  "inputToken": "So11111111111111111111111111111111111111112",
  "outputToken": "EPjFWdd5Au17hunJyHyer4hoi6UcsbkxNmnpDnJ55ip2",
  "inputAmount": "10000000",
  "privacyMode": true
}
``` -->
<!-- 
## 🔐 Security

- ✅ **Smart Contract Audits** - CertiK, Trail of Bits, and Certora formal verification
- ✅ **Multi-Party Computation** - Byzantine resilience with K-of-N honest nodes
- ✅ **Encryption Standards** - Battle-tested ElGamal and MPC protocols
- ✅ **Bug Bounty Program** - Rewards for responsible disclosure
- ✅ **Penetration Testing** - Regular security assessments

See our [Security Policy](SECURITY.md) for detailed information. -->

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Quality

- **TypeScript** strict mode enabled
- **ESLint** and **Prettier** for code formatting
- **Husky** git hooks for pre-commit checks
- **100% test coverage** for critical paths

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **[Encifer](https://app.encifher.io/)** - Confidential tokens wrapping and unwrapping
- **[Near Intents](https://near-intents.org/)** - Bridge that enables our confidential Zcash to Solana transations
- **[Jupiter](https://jup.ag/)** - DEX aggregation
- **[Starkgate](https://starkgate.starknet.io/)** - Bridge by Starknet, used for bridging between Solana and Starknet

## 📞 Contact

- **WaveTek**: [wavetek.io](https://wavetek.io)
- **WaveSwap**: [app.waveswap.live](https://app.waveswap.live/)
- **Secure The Bag**: [securethebag.fun](https://securethebag.fun)
- **Documentation**: [docs.wavetek.io](https://docs.wavetek.io)
- **X**: [@securethebag](https://x.com/securethebagfun)
- **Email**: [rahim@wavetek.io](mailto:rahim@wavetek.io)

---

<div align="center">
  <strong>🔒 Your swaps, your privacy. Built on Solana.</strong>
</div>