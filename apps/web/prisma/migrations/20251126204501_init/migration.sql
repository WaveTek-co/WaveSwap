-- CreateEnum
CREATE TYPE "SwapStatus" AS ENUM ('ENCRYPTED_PENDING', 'ENCRYPTED_SETTLED', 'CANCELLED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "StageStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "swaps" (
    "id" TEXT NOT NULL,
    "userAddress" TEXT NOT NULL,
    "inputToken" TEXT NOT NULL,
    "outputToken" TEXT NOT NULL,
    "inputAmount" BIGINT NOT NULL,
    "outputAmount" BIGINT,
    "feeBps" INTEGER NOT NULL,
    "privacyMode" BOOLEAN NOT NULL DEFAULT true,
    "status" "SwapStatus" NOT NULL DEFAULT 'ENCRYPTED_PENDING',
    "routeId" INTEGER,
    "slippageBps" INTEGER NOT NULL,
    "txHash" TEXT,
    "intentId" TEXT,
    "mxeRequestId" TEXT,
    "mxeResultId" TEXT,
    "arciumProof" TEXT,
    "computationHash" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "swaps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "swap_stages" (
    "id" TEXT NOT NULL,
    "swapId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "StageStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "swap_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userAddress" TEXT NOT NULL,
    "authToken" TEXT NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_cache" (
    "id" TEXT NOT NULL,
    "inputToken" TEXT NOT NULL,
    "outputToken" TEXT NOT NULL,
    "inputAmount" BIGINT NOT NULL,
    "outputAmount" BIGINT NOT NULL,
    "routeId" INTEGER,
    "priceImpact" DOUBLE PRECISION NOT NULL,
    "feeBps" INTEGER NOT NULL,
    "cachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quote_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limits" (
    "id" TEXT NOT NULL,
    "userAddress" TEXT,
    "endpoint" TEXT NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "windowEnd" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_metadata" (
    "id" TEXT NOT NULL,
    "mint" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL,
    "logoUri" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "token_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "routes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_address_key" ON "users"("address");

-- CreateIndex
CREATE UNIQUE INDEX "swaps_intentId_key" ON "swaps"("intentId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_authToken_key" ON "sessions"("authToken");

-- CreateIndex
CREATE INDEX "quote_cache_inputToken_outputToken_inputAmount_idx" ON "quote_cache"("inputToken", "outputToken", "inputAmount");

-- CreateIndex
CREATE INDEX "rate_limits_userAddress_endpoint_idx" ON "rate_limits"("userAddress", "endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "token_metadata_mint_key" ON "token_metadata"("mint");

-- CreateIndex
CREATE UNIQUE INDEX "routes_name_key" ON "routes"("name");

-- AddForeignKey
ALTER TABLE "swaps" ADD CONSTRAINT "swaps_userAddress_fkey" FOREIGN KEY ("userAddress") REFERENCES "users"("address") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swap_stages" ADD CONSTRAINT "swap_stages_swapId_fkey" FOREIGN KEY ("swapId") REFERENCES "swaps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userAddress_fkey" FOREIGN KEY ("userAddress") REFERENCES "users"("address") ON DELETE CASCADE ON UPDATE CASCADE;
