/**
 * Generic API Route to proxy all Jupiter SDK requests
 * This bypasses CORS issues and rate limits by making server-side requests to Jupiter's API
 */

import { NextRequest, NextResponse } from 'next/server'
import https from 'https'

// Circuit breaker state to prevent cascade failures
let circuitBreakerOpen = false
let lastFailureTime = 0
const FAILURE_THRESHOLD = 5 // Fail 5 times before opening circuit
const RECOVERY_TIMEOUT = 60000 // 1 minute recovery timeout
let consecutiveFailures = 0

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
    const jupiterUrl = `https://lite-api.jup.ag/swap/v1/${path}`

    // Circuit breaker logic
    const now = Date.now()
    if (circuitBreakerOpen) {
      if (now - lastFailureTime < RECOVERY_TIMEOUT) {
        console.log(`[Jupiter Proxy API] Circuit breaker OPEN, rejecting request to ${jupiterUrl}`)
        return NextResponse.json(
          {
            error: 'Jupiter API temporarily unavailable',
            details: 'Circuit breaker is active to prevent cascade failures',
            retryAfter: Math.ceil((RECOVERY_TIMEOUT - (now - lastFailureTime)) / 1000)
          },
          { status: 503 }
        )
      } else {
        // Try to close circuit breaker
        console.log(`[Jupiter Proxy API] Attempting to close circuit breaker`)
        circuitBreakerOpen = false
        consecutiveFailures = 0
      }
    }

    console.log(`[Jupiter Proxy API] ${method} ${jupiterUrl}`)

    // Prepare request options with timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout

    const requestOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'WaveSwap-Proxy/1.0'
      },
      signal: controller.signal
    }

    // Add request body for POST/PUT requests
    if (['POST', 'PUT'].includes(method)) {
      const body = await request.text()
      if (body) {
        requestOptions.body = body
        console.log(`[Jupiter Proxy API] Request body:`, body)
      }
    }

    // Make server-side request to Jupiter API (bypasses CORS and rate limits)
    let jupiterResponse: any

    if (typeof window === 'undefined') {
      // Server-side: use https module for Node.js
      jupiterResponse = await new Promise((resolve, reject) => {
        const url = new URL(jupiterUrl)
        const options = {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: `${url.pathname}${url.search}`,
          method: requestOptions.method as any,
          headers: requestOptions.headers ? Object.fromEntries(requestOptions.headers instanceof Headers ?
            Array.from(requestOptions.headers.entries()) :
            Array.isArray(requestOptions.headers) ? requestOptions.headers :
            Object.entries(requestOptions.headers)) : undefined,
          timeout: 5000, // 5 second timeout
        }

        let data = ''
        const req = https.request(options, (res: any) => {
          res.on('data', (chunk: any) => {
            data += chunk
          })
          res.on('end', () => {
            resolve({
              ok: res.statusCode! >= 200 && res.statusCode! < 300,
              status: res.statusCode,
              statusText: res.statusMessage,
              headers: {
                'content-type': res.headers['content-type'] || 'application/json',
              },
              text: async () => data,
              json: async () => {
                try {
                  return JSON.parse(data)
                } catch {
                  throw new Error('Invalid JSON response')
                }
              }
            })
          })
        })

        req.on('error', reject)
        req.on('timeout', () => {
          req.destroy()
          reject(new Error('Request timeout'))
        })

        if (requestOptions.body) {
          req.write(requestOptions.body)
        }

        req.end()
      })
    } else {
      // Client-side: use regular fetch
      jupiterResponse = await fetch(jupiterUrl, requestOptions)
    }
    clearTimeout(timeoutId)

    if (!jupiterResponse.ok) {
      const errorText = await jupiterResponse.text()
      console.error(`[Jupiter Proxy API] Jupiter API error:`, {
        url: jupiterUrl,
        status: jupiterResponse.status,
        statusText: jupiterResponse.statusText,
        errorText
      })

      // Update circuit breaker state
      consecutiveFailures++
      if (consecutiveFailures >= FAILURE_THRESHOLD) {
        circuitBreakerOpen = true
        lastFailureTime = now
        console.error(`[Jupiter Proxy API] Circuit breaker OPENED after ${consecutiveFailures} failures`)
      }

      return NextResponse.json(
        {
          error: `Jupiter API returned ${jupiterResponse.status}: ${jupiterResponse.statusText}`,
          details: errorText,
          url: jupiterUrl
        },
        { status: jupiterResponse.status }
      )
    }

    // Get the response from Jupiter
    const contentType = jupiterResponse.headers.get('content-type')
    let responseData

    try {
      if (contentType?.includes('application/json')) {
        responseData = await jupiterResponse.json()
      } else {
        responseData = await jupiterResponse.text()
      }
    } catch (parseError) {
      console.error(`[Jupiter Proxy API] Error parsing response:`, parseError)
      consecutiveFailures++
      if (consecutiveFailures >= FAILURE_THRESHOLD) {
        circuitBreakerOpen = true
        lastFailureTime = now
      }
      return NextResponse.json(
        {
          error: 'Failed to parse Jupiter API response',
          details: parseError instanceof Error ? parseError.message : String(parseError)
        },
        { status: 500 }
      )
    }

    console.log(`[Jupiter Proxy API] Successful response from ${jupiterUrl}`)

    // Reset failure count on success
    consecutiveFailures = 0

    // Return the Jupiter response to the client
    return NextResponse.json(responseData, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    })

  } catch (error) {
    console.error('[Jupiter Proxy API] Error proxying request:', error)

    // Update circuit breaker state for network errors
    consecutiveFailures++
    if (consecutiveFailures >= FAILURE_THRESHOLD) {
      circuitBreakerOpen = true
      lastFailureTime = Date.now()
      console.error(`[Jupiter Proxy API] Circuit breaker OPENED after ${consecutiveFailures} failures`)
    }

    // Handle specific error types
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return NextResponse.json(
          {
            error: 'Jupiter API request timeout',
            details: 'Request took too long to respond'
          },
          { status: 504 }
        )
      }

      if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
        return NextResponse.json(
          {
            error: 'Jupiter API DNS resolution failed',
            details: 'Unable to resolve Jupiter API hostname'
          },
          { status: 503 }
        )
      }
    }

    return NextResponse.json(
      {
        error: 'Failed to proxy request to Jupiter API',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

export async function OPTIONS() {
  // Handle CORS preflight requests
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  })
}