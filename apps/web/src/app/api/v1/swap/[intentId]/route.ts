/**
 * Swap Details API - Migrated from backend
 * Handles detailed swap information queries
 */

import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * GET /api/v1/swap/[intentId] - Get detailed swap information
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { intentId: string } }
) {
  try {
    console.log(`[Swap Details API] Getting details for intent: ${params.intentId}`)

    const { intentId } = params

    const swap = await prisma.swap.findUnique({
      where: { intentId },
      include: {
        stages: {
          orderBy: { startedAt: 'asc' },
        },
      },
    })

    if (!swap) {
      return NextResponse.json(
        {
          success: false,
          error: 'Swap not found',
          message: `No swap found with intent ID: ${intentId}`,
        },
        { status: 404 }
      )
    }

    const swapDetails = {
      intentId: swap.intentId,
      userAddress: swap.userAddress,
      inputToken: swap.inputToken,
      outputToken: swap.outputToken,
      inputAmount: swap.inputAmount.toString(),
      outputAmount: swap.outputAmount?.toString(),
      status: swap.status,
      privacyMode: swap.privacyMode,
      feeBps: swap.feeBps,
      routeId: swap.routeId,
      slippageBps: swap.slippageBps,
      txHash: swap.txHash,
      createdAt: swap.createdAt.toISOString(),
      updatedAt: swap.updatedAt.toISOString(),
      settledAt: swap.settledAt?.toISOString(),
      stages: swap.stages.map(stage => ({
        name: stage.name,
        status: stage.status,
        startedAt: stage.startedAt.toISOString(),
        completedAt: stage.completedAt?.toISOString(),
        error: stage.error,
      })),
      error: swap.error,
    }

    console.log(`[Swap Details API] Details retrieved for ${intentId}`)

    return NextResponse.json({
      success: true,
      data: swapDetails,
    })

  } catch (error) {
    console.error('[Swap Details API] Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get swap details',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}