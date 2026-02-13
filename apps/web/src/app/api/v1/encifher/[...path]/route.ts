/**
 * Generic API Route to proxy all Encifher SDK requests
 * This bypasses CORS issues by making server-side requests to Encifher's API
 */

import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  return proxyRequest('GET', request, path)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  return proxyRequest('POST', request, path)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  return proxyRequest('PUT', request, path)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  return proxyRequest('DELETE', request, path)
}

async function proxyRequest(
  method: string,
  request: NextRequest,
  pathSegments: string[]
) {
  try {
    // Reconstruct the path
    const path = pathSegments.join('/')
    const encifherUrl = `https://authority.encrypt.trade/api/v1/${path}`

    // Prepare request options
    const requestOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'WaveSwap-Proxy/1.0'
      }
    }

    // Forward any authentication headers from the original request
    const authHeader = request.headers.get('authorization')
    if (authHeader) {
      requestOptions.headers = {
        ...requestOptions.headers,
        'Authorization': authHeader
      }
    }

    // Get API key from environment or request
    let apiKeyHeader = request.headers.get('authorization') || request.headers.get('x-api-key')

    // If no API key in request, try to get from environment
    if (!apiKeyHeader) {
      apiKeyHeader = process.env.NEXT_PUBLIC_ENCIFHER_SDK_KEY || process.env.ENCIFHER_API_KEY || null
    }

    // If still no API key, use the configured key from the client
    if (!apiKeyHeader) {
      apiKeyHeader = 'default-key'
    }

    if (apiKeyHeader) {
      // Format as Bearer token if not already formatted
      const formattedAuth = apiKeyHeader.startsWith('Bearer ') ? apiKeyHeader : `Bearer ${apiKeyHeader}`

      requestOptions.headers = {
        ...requestOptions.headers,
        'Authorization': formattedAuth,
        'x-api-key': apiKeyHeader.replace('Bearer ', '')
      }
    }

    // Add request body for POST/PUT requests
    if (['POST', 'PUT'].includes(method)) {
      const body = await request.text()
      if (body) {
        requestOptions.body = body
      }
    }

    // Make server-side request to Encifher API (bypasses CORS)
    const encifherResponse = await fetch(encifherUrl, requestOptions)

    if (!encifherResponse.ok) {
      const errorText = await encifherResponse.text()
      let errorData
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = errorText
      }

      return NextResponse.json(
        {
          error: `Encifher API returned ${encifherResponse.status}: ${encifherResponse.statusText}`,
          details: errorData,
        },
        { status: encifherResponse.status }
      )
    }

    // Get the response from Encifher
    const contentType = encifherResponse.headers.get('content-type')
    let responseData

    if (contentType?.includes('application/json')) {
      responseData = await encifherResponse.json()
    } else {
      responseData = await encifherResponse.text()
    }

    // Return the Encifher response to the client
    return NextResponse.json(responseData, {
      status: encifherResponse.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, x-api-key',
        'Access-Control-Allow-Credentials': 'true',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    })

  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to proxy request to Encifher API',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function OPTIONS() {
  // Handle CORS preflight requests with comprehensive headers
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, x-api-key',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400' // Cache preflight for 24 hours
    }
  })
}
