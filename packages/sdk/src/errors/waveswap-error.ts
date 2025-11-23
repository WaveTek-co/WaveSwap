export class WaveSwapError extends Error {
  public code: string
  public details?: Record<string, any>

  constructor(message: string, code: string, details?: Record<string, any>) {
    super(message)
    this.code = code
    if (details !== undefined) {
      this.details = details
    }
    this.name = 'WaveSwapError'

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, WaveSwapError)
    }
  }
}