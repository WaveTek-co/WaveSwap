// Stealth Worker Client — Main thread async wrapper for the Stealth Web Worker
//
// Provides Promise-based API for communicating with the isolated Worker thread.
// All crypto operations (key derivation, X-Wing decapsulation) happen in the Worker.
// Only PUBLIC keys and per-escrow sharedSecrets cross the Worker boundary.
//
// USAGE:
//   const client = StealthWorkerClient.getInstance()
//   const pubkeys = await client.init(signature) // signature wiped after
//   const matches = await client.checkEscrows(deposits)
//   await client.wipe() // on wallet disconnect
//
// SINGLETON: One Worker per tab. Call StealthWorkerClient.destroy() on cleanup.

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export interface StealthPublicKeys {
  spendPubkey: Uint8Array   // 32 bytes
  viewPubkey: Uint8Array    // 32 bytes
  xwingPubkey: Uint8Array   // 1216 bytes (ML-KEM-768 1184 + X25519 32)
}

export interface EscrowMatch {
  index: number              // Index into the deposits array passed to checkEscrows
  sharedSecret: Uint8Array   // 32 bytes — needed for CLAIM TX, wipe after use
}

// ═══════════════════════════════════════════════════════════════════
// WORKER CLIENT
// ═══════════════════════════════════════════════════════════════════

export class StealthWorkerClient {
  private worker: Worker
  private nextId = 1
  private pending = new Map<number, {
    resolve: (value: any) => void
    reject: (error: Error) => void
    timer?: ReturnType<typeof setTimeout>
  }>()
  private static instance: StealthWorkerClient | null = null

  // Default timeout for Worker operations (30s — ML-KEM keygen can be slow on first run)
  private static readonly TIMEOUT_MS = 30_000

  private constructor() {
    this.worker = new Worker(
      new URL('./stealth-worker.ts', import.meta.url)
    )

    this.worker.onmessage = (event: MessageEvent) => {
      const msg = event.data
      const handler = this.pending.get(msg.id)
      if (!handler) return

      if (handler.timer) clearTimeout(handler.timer)
      this.pending.delete(msg.id)

      if (msg.type === 'ERROR') {
        handler.reject(new Error(msg.error))
      } else {
        handler.resolve(msg)
      }
    }

    this.worker.onerror = (error) => {
      console.error('[StealthWorker] fatal error:', error.message)
      // Reject all pending operations
      for (const [id, handler] of this.pending) {
        if (handler.timer) clearTimeout(handler.timer)
        handler.reject(new Error(`Worker crashed: ${error.message}`))
      }
      this.pending.clear()
    }
  }

  /**
   * Get or create the singleton Worker instance.
   * Only call from client-side (browser) code.
   */
  static getInstance(): StealthWorkerClient {
    if (typeof window === 'undefined') {
      throw new Error('StealthWorkerClient can only be used in browser environment')
    }
    if (!StealthWorkerClient.instance) {
      StealthWorkerClient.instance = new StealthWorkerClient()
    }
    return StealthWorkerClient.instance
  }

  /**
   * Destroy the Worker instance. Call on app unmount or when no longer needed.
   */
  static destroy(): void {
    if (StealthWorkerClient.instance) {
      // Reject any pending operations
      for (const [, handler] of StealthWorkerClient.instance.pending) {
        if (handler.timer) clearTimeout(handler.timer)
        handler.reject(new Error('Worker destroyed'))
      }
      StealthWorkerClient.instance.pending.clear()
      StealthWorkerClient.instance.worker.terminate()
      StealthWorkerClient.instance = null
    }
  }

  /**
   * Check if a Worker instance exists (without creating one).
   */
  static hasInstance(): boolean {
    return StealthWorkerClient.instance !== null
  }

  // ─────────────────────────────────────────────────────────────
  // INTERNAL: Send message to Worker and await response
  // ─────────────────────────────────────────────────────────────

  private send<T>(msg: any, transfer?: Transferable[], timeoutMs?: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++
      msg.id = id

      const timeout = timeoutMs ?? StealthWorkerClient.TIMEOUT_MS
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Worker operation timed out after ${timeout}ms (type: ${msg.type})`))
      }, timeout)

      this.pending.set(id, { resolve, reject, timer })

      if (transfer && transfer.length > 0) {
        this.worker.postMessage(msg, transfer)
      } else {
        this.worker.postMessage(msg)
      }
    })
  }

  // ═══════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════

  /**
   * Initialize keys from wallet signature.
   *
   * SECURITY:
   * - Signature is copied and the copy is transferred to Worker (zero-copy)
   * - Original signature in caller's scope is zeroed by this method
   * - Worker derives all keys from signature, then wipes the signature
   * - Only PUBLIC keys are returned
   *
   * @param signature - Raw wallet signature bytes (will be zeroed after call)
   * @returns Public keys only (spend, view, X-Wing)
   */
  async init(signature: Uint8Array): Promise<StealthPublicKeys> {
    // Create isolated copy for transfer
    const sigCopy = new Uint8Array(signature.length)
    sigCopy.set(signature)

    // Zero the original signature in the main thread IMMEDIATELY
    // Defense-in-depth: even if Worker init fails, signature is already wiped
    crypto.getRandomValues(signature)
    signature.fill(0)

    // Transfer the copy to Worker (zero-copy, main thread loses access to sigCopy)
    const result = await this.send<any>(
      { type: 'INIT', signature: sigCopy.buffer },
      [sigCopy.buffer],
    )

    return {
      spendPubkey: new Uint8Array(result.publicKeys.spendPubkey),
      viewPubkey: new Uint8Array(result.publicKeys.viewPubkey),
      xwingPubkey: new Uint8Array(result.publicKeys.xwingPubkey),
    }
  }

  /**
   * Check which deposits belong to us via X-Wing decapsulation.
   *
   * Worker runs xwingDecapsulate internally for each deposit.
   * X-Wing secret key (2432 bytes) NEVER leaves the Worker.
   *
   * @param deposits - Array of {stealthPubkey, ciphertext} from deposit records
   * @returns Matched deposits with their sharedSecrets (for CLAIM TX)
   */
  async checkEscrows(
    deposits: Array<{ stealthPubkey: Uint8Array; ciphertext: Uint8Array }>,
  ): Promise<EscrowMatch[]> {
    if (deposits.length === 0) return []

    // Serialize deposits into transferable ArrayBuffers
    const serialized = deposits.map(d => ({
      stealthPubkey: copyToBuffer(d.stealthPubkey),
      ciphertext: copyToBuffer(d.ciphertext),
    }))

    // Collect all ArrayBuffers for zero-copy transfer
    const transfer = serialized.flatMap(d => [d.stealthPubkey, d.ciphertext])

    const result = await this.send<any>(
      { type: 'CHECK_ESCROWS', deposits: serialized },
      transfer,
    )

    return result.matches.map((m: any) => ({
      index: m.index,
      sharedSecret: new Uint8Array(m.sharedSecret),
    }))
  }

  /**
   * Get serialized X-Wing public key (1216 bytes) for on-chain registration.
   * Layout: ML-KEM-768 pubkey (1184 bytes) + X25519 pubkey (32 bytes)
   */
  async getRegistrationKey(): Promise<Uint8Array> {
    const result = await this.send<any>({ type: 'GET_REGISTRATION_KEY' })
    return new Uint8Array(result.keyBytes)
  }

  /**
   * Get all public keys (for React state and localStorage public-key cache).
   * No private keys are returned.
   */
  async getPublicKeys(): Promise<StealthPublicKeys> {
    const result = await this.send<any>({ type: 'GET_PUBLIC_KEYS' })
    return {
      spendPubkey: new Uint8Array(result.publicKeys.spendPubkey),
      viewPubkey: new Uint8Array(result.publicKeys.viewPubkey),
      xwingPubkey: new Uint8Array(result.publicKeys.xwingPubkey),
    }
  }

  /**
   * Securely wipe ALL key material in the Worker.
   * Call on wallet disconnect or tab close.
   * After wipe, init() must be called again before any other operation.
   */
  async wipe(): Promise<void> {
    await this.send<any>({ type: 'WIPE' })
  }

  /**
   * Check if Worker has keys initialized and ready for operations.
   */
  async isReady(): Promise<boolean> {
    const result = await this.send<any>({ type: 'IS_READY' })
    return result.ready
  }
}

// ═══════════════════════════════════════════════════════════════════
// HELPER: Copy Uint8Array to a new ArrayBuffer (for Transferable)
// ═══════════════════════════════════════════════════════════════════

function copyToBuffer(arr: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(arr.length)
  copy.set(arr)
  return copy.buffer
}
