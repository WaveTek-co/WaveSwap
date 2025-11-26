/**
 * Swap Cancel API - Migrated from backend
 * Handles swap cancellation
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const swapCancelSchema = z.object({
  authToken: z.string().min(1, 'Authentication token is required'),
})

/**
 * POST /api/v1/swap/[intentId]/cancel - Cancel a swap
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { intentId: string } }
) {
  try {
    console.log(`[Swap Cancel API] Cancelling swap: ${params.intentId}`)

    const body = await request.json()
    const { authToken } = swapCancelSchema.parse(body)
    const { intentId } = params

    // Validate auth token
    const session = await prisma.session.findUnique({
      where: { authToken },
    })

    if (!session || session.validUntil < new Date()) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized',
          message: 'Invalid or expired authentication token',
        },
        { status: 401 }
      )
    }

    // Check if swap exists and can be cancelled
    const swap = await prisma.swap.findUnique({
      where: { intentId },
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

    if (swap.status !== 'ENCRYPTED_PENDING') {
      return NextResponse.json(
        {
          success: false,
          error: 'Cannot cancel swap',
          message: `Swap cannot be cancelled in status: ${swap.status}`,
        },
        { status: 400 }
      )
    }

    // Update swap status to cancelled
    await prisma.swap.update({
      where: { intentId },
      data: {
        status: 'CANCELLED',
        updatedAt: new Date(),
      },
    })

    // Add cancellation stage
    await prisma.swapStage.create({
      data: {
        swapId: swap.id,
        name: 'Swap Cancelled',
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    })

    console.log(`[Swap Cancel API] Swap cancelled: ${intentId}`)

    return NextResponse.json({
      success: true,
      data: {
        message: 'Swap cancelled',
        intentId,
      },
    })

  } catch (error) {
    console.error('[Swap Cancel API] Error:', error)

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
        error: 'Failed to cancel swap',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}