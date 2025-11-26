/**
 * Detailed Health API - Migrated from backend
 * Comprehensive health check with system information
 */

import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import { join } from 'path'

const prisma = new PrismaClient()

/**
 * GET /api/v1/health/detailed - Detailed health check
 */
export async function GET() {
  try {
    // Check database connectivity
    const startTime = Date.now()
    await prisma.$queryRaw`SELECT 1`
    const dbResponseTime = Date.now() - startTime
    const dbHealth = true

    // Get package.json for version info
    let packageVersion = '0.1.0'
    try {
      const packageJsonPath = join(process.cwd(), 'package.json')
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
      packageVersion = packageJson.version || '0.1.0'
    } catch (error) {
      console.warn('Could not read package.json version:', error)
    }

    const response = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: packageVersion,
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      services: {
        database: {
          status: dbHealth ? 'healthy' : 'unhealthy',
          url: process.env.DATABASE_URL ? 'configured' : 'not configured',
          responseTime: `${dbResponseTime}ms`,
        },
        redis: {
          status: 'not configured',
          url: 'not configured',
          note: 'Redis not migrated to Next.js app',
        },
        websocket: {
          status: 'not configured',
          note: 'WebSocket service not migrated to Next.js app',
        },
      },
      platform: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
      },
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error('[Health Detailed] Check failed:', error)

    return NextResponse.json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 503 })
  } finally {
    await prisma.$disconnect()
  }
}