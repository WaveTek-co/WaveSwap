/**
 * Swap API - Migrated from backend
 * Handles swap submission, status tracking, and history
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const swapSubmitSchema = z.object({
  userAddress: z.string().length(44, 'Solana public key must be 44 characters'),
  inputToken: z.string().length(44, 'Solana public key must be 44 characters'),
  outputToken: z.string().length(44, 'Solana public key must be 44 characters'),
  inputAmount: z.string().regex(/^\d+$/, 'Input amount must be a positive integer'),
  slippageBps: z.number().int().min(1).max(1000).default(50),
  privacyMode: z.boolean().default(true),
  signature: z.string().optional(),
})

const swapCancelSchema = z.object({
  authToken: z.string().min(1, 'Authentication token is required'),
})

/**
 * POST /api/v1/swap/submit - Submit a new swap
 */
export async function POST(request: NextRequest) {
  try {
    console.log('[Swap API] Processing swap submission')

    const body = await request.json()
    const validatedData = swapSubmitSchema.parse(body)

    // Validate swap parameters
    if (validatedData.inputToken === validatedData.outputToken) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid swap',
          message: 'Input and output tokens cannot be the same',
        },
        { status: 400 }
      )
    }

    // Generate intent ID and create swap record
    const intentId = `intent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const swap = await prisma.swap.create({
      data: {
        intentId,
        userAddress: validatedData.userAddress,
        inputToken: validatedData.inputToken,
        outputToken: validatedData.outputToken,
        inputAmount: BigInt(validatedData.inputAmount),
        feeBps: validatedData.privacyMode ? 20 : 0, // 0.2% for private, 0% for standard
        privacyMode: validatedData.privacyMode,
        slippageBps: validatedData.slippageBps,
        status: 'ENCRYPTED_PENDING',
      },
    })

    // Create initial stage
    await prisma.swapStage.create({
      data: {
        swapId: swap.id,
        name: 'Intent Created',
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    })

    // Create session for user
    const authToken = `auth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const validUntil = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    await prisma.session.create({
      data: {
        userAddress: validatedData.userAddress,
        authToken,
        validUntil,
      },
    })

    const mockResponse = {
      intentId,
      status: 'ENCRYPTED_PENDING',
      inputAmount: validatedData.inputAmount,
      estimatedOutput: '0', // Would be calculated by Jupiter
      fee: '0.5',
      privacyFee: '0.1',
      estimatedTime: 30, // seconds
      confirmation: {
        authToken,
        validUntil: validUntil.toISOString(),
      },
    }

    console.log('[Swap API] Swap submitted:', mockResponse)

    return NextResponse.json({
      success: true,
      data: mockResponse,
    })

  } catch (error) {
    console.error('[Swap API] Error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation error',
          details: error.issues,
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Swap submission failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}