/**
 * Health Check API - Migrated from backend
 * Basic ping endpoint
 */

import { NextResponse } from 'next/server'

/**
 * GET /api/v1/health/ping - Simple ping check
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  })
}