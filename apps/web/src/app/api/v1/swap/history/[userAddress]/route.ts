/**
 * Swap History API - Migrated from backend
 * Handles swap history queries for users
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.string().optional(),
})

/**
 * GET /api/v1/swap/history/[userAddress] - Get user's swap history
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { userAddress: string } }
) {
  try {
    console.log(`[Swap History API] Getting history for user: ${params.userAddress}`)

    const { userAddress } = params
    const { searchParams } = new URL(request.url)

    const query = historyQuerySchema.parse({
      limit: searchParams.get('limit'),
      offset: searchParams.get('offset'),
      status: searchParams.get('status'),
    })

    // Build where clause
    const whereClause: any = {
      userAddress,
    }

    if (query.status) {
      whereClause.status = query.status.toUpperCase()
    }

    // Get total count for pagination
    const total = await prisma.swap.count({
      where: whereClause,
    })

    // Get swaps with pagination
    const swaps = await prisma.swap.findMany({
      where: whereClause,
      orderBy: {
        createdAt: 'desc',
      },
      skip: query.offset,
      take: query.limit,
      select: {
        intentId: true,
        inputToken: true,
        outputToken: true,
        inputAmount: true,
        outputAmount: true,
        status: true,
        privacyMode: true,
        feeBps: true,
        createdAt: true,
        settledAt: true,
        error: true,
      },
    })

    const historyResponse = {
      swaps: swaps.map(swap => ({
        intentId: swap.intentId,
        inputToken: swap.inputToken,
        outputToken: swap.outputToken,
        inputAmount: swap.inputAmount.toString(),
        outputAmount: swap.outputAmount?.toString(),
        status: swap.status,
        privacyMode: swap.privacyMode,
        feeBps: swap.feeBps,
        createdAt: swap.createdAt.toISOString(),
        settledAt: swap.settledAt?.toISOString(),
        error: swap.error,
      })),
      pagination: {
        limit: query.limit,
        offset: query.offset,
        total,
      },
    }

    console.log(`[Swap History API] Retrieved ${swaps.length} swaps for user ${userAddress}`)

    return NextResponse.json({
      success: true,
      data: historyResponse,
    })

  } catch (error) {
    console.error('[Swap History API] Error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation error',
          details: error.errors,
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get swap history',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}