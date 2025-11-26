/**
 * Health Ready API - Migrated from backend
 * Readiness check with database connectivity
 */

import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * GET /api/v1/health/ready - Readiness check
 */
export async function GET() {
  try {
    // Check database connectivity
    await prisma.$queryRaw`SELECT 1`
    const dbHealth = true

    // For now, we don't have Redis in the Next.js app, so we'll mark it as healthy
    const redisHealth = true

    const isHealthy = dbHealth && redisHealth

    const response = {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      services: {
        database: dbHealth ? 'healthy' : 'unhealthy',
        redis: redisHealth ? 'healthy' : 'unhealthy',
      },
    }

    return NextResponse.json(response, {
      status: isHealthy ? 200 : 503
    })

  } catch (error) {
    console.error('[Health Ready] Check failed:', error)

    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'unhealthy',
        redis: 'unknown',
      },
      error: 'Health check failed',
    }, { status: 503 })
  } finally {
    await prisma.$disconnect()
  }
}