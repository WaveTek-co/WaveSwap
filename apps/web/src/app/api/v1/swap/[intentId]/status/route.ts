/**
 * Swap Status API - Migrated from backend
 * Handles swap status queries
 */

import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * GET /api/v1/swap/[intentId]/status - Get swap status
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { intentId: string } }
) {
  try {
    console.log(`[Swap Status API] Getting status for intent: ${params.intentId}`)

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

    const statusResponse = {
      intentId: swap.intentId,
      status: swap.status,
      inputToken: swap.inputToken,
      outputToken: swap.outputToken,
      inputAmount: swap.inputAmount.toString(),
      outputAmount: swap.outputAmount?.toString(),
      feeBps: swap.feeBps,
      privacyMode: swap.privacyMode,
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

    console.log(`[Swap Status API] Status retrieved for ${intentId}:`, swap.status)

    return NextResponse.json({
      success: true,
      data: statusResponse,
    })

  } catch (error) {
    console.error('[Swap Status API] Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get swap status',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}