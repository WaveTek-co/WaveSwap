import { Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { createAssociatedTokenAccountInstruction, getAssociatedTokenAddress, createTransferInstruction } from '@solana/spl-token'

/**
 * Fee Collection Service for WaveSwap
 * Handles actual fee transfers to the fee wallet
 */
export class FeeCollectionService {
  private connection: Connection
  private readonly FEE_WALLET = new PublicKey('F2ZuhgGmn9NVVgRyikazWcP1wKdguLP6ZkMDDiWa6TAa')
  private readonly PRIVACY_FEE_BPS = 100 // 1%
  private readonly PLATFORM_FEE_BPS = 0 // 0%

  constructor(connection: Connection) {
    this.connection = connection
  }

  /**
   * Create fee transfer instructions for a swap
   * @param inputMint Input token mint
   * @param outputAmount Output amount (as string)
   * @param userPublicKey User's public key
   * @param privacyMode Whether this is a privacy swap
   * @returns Array of transaction instructions for fee collection
   */
  async createFeeInstructions(
    inputMint: string,
    outputAmount: string,
    userPublicKey: PublicKey,
    privacyMode: boolean = false
  ): Promise<TransactionInstruction[]> {
    const instructions: TransactionInstruction[] = []

    try {
      const feeBps = privacyMode ? this.PRIVACY_FEE_BPS : this.PLATFORM_FEE_BPS
      const feeAmount = Math.floor((parseInt(outputAmount) * feeBps) / 10000)

      if (feeAmount === 0) {
        console.log('[FeeCollection] No fee to collect')
        return instructions
      }

      console.log(`[FeeCollection] Creating fee instructions:`, {
        outputAmount,
        feeBps,
        feeAmount,
        privacyMode,
        feeWallet: this.FEE_WALLET.toString()
      })

      // Handle SOL fees
      if (inputMint === 'So11111111111111111111111111111111111111112') {
        instructions.push(
          SystemProgram.transfer({
            fromPubkey: userPublicKey,
            toPubkey: this.FEE_WALLET,
            lamports: feeAmount
          })
        )
      } else {
        // Handle token fees
        const mint = new PublicKey(inputMint)

        try {
          // Get user's token account
          const userTokenAccount = await getAssociatedTokenAddress(
            mint,
            userPublicKey
          )

          // Get fee wallet's token account (create if needed)
          const feeWalletTokenAccount = await getAssociatedTokenAddress(
            mint,
            this.FEE_WALLET
          )

          // Check if fee wallet's token account exists, create if not
          const feeWalletAccountInfo = await this.connection.getAccountInfo(feeWalletTokenAccount)
          if (!feeWalletAccountInfo) {
            instructions.push(
              createAssociatedTokenAccountInstruction(
                userPublicKey, // payer
                feeWalletTokenAccount, // ata
                this.FEE_WALLET, // owner
                mint // mint
              )
            )
          }

          // Create transfer instruction
          instructions.push(
            createTransferInstruction(
              userTokenAccount, // from
              feeWalletTokenAccount, // to
              userPublicKey, // owner
              BigInt(feeAmount) // amount
            )
          )
        } catch (tokenError) {
          console.error('[FeeCollection] Error creating token fee instructions:', tokenError)
          // Fallback to SOL fee if token operations fail
          const solFeeAmount = feeAmount / 1000000 // Approximate conversion
          if (solFeeAmount > 1000) { // Minimum 0.000001 SOL
            instructions.push(
              SystemProgram.transfer({
                fromPubkey: userPublicKey,
                toPubkey: this.FEE_WALLET,
                lamports: Math.floor(solFeeAmount)
              })
            )
          }
        }
      }

      console.log(`[FeeCollection] Created ${instructions.length} fee instructions`)
      return instructions

    } catch (error) {
      console.error('[FeeCollection] Error creating fee instructions:', error)
      return []
    }
  }

  /**
   * Add fee instructions to existing transaction
   * @param transaction Existing transaction
   * @param inputMint Input token mint
   * @param outputAmount Output amount
   * @param userPublicKey User's public key
   * @param privacyMode Whether this is a privacy swap
   * @returns Transaction with fee instructions added
   */
  async addFeesToTransaction(
    transaction: Transaction,
    inputMint: string,
    outputAmount: string,
    userPublicKey: PublicKey,
    privacyMode: boolean = false
  ): Promise<Transaction> {
    const feeInstructions = await this.createFeeInstructions(
      inputMint,
      outputAmount,
      userPublicKey,
      privacyMode
    )

    // Add fee instructions to the beginning of the transaction
    transaction.instructions = [...feeInstructions, ...transaction.instructions]

    console.log(`[FeeCollection] Added ${feeInstructions.length} fee instructions to transaction`)
    return transaction
  }

  /**
   * Calculate fee amount for display purposes
   * @param outputAmount Output amount
   * @param privacyMode Whether this is a privacy swap
   * @returns Fee amount and basis points
   */
  calculateFee(outputAmount: string, privacyMode: boolean = false) {
    const feeBps = privacyMode ? this.PRIVACY_FEE_BPS : this.PLATFORM_FEE_BPS
    const feeAmount = Math.floor((parseInt(outputAmount) * feeBps) / 10000)

    return {
      amount: feeAmount.toString(),
      bps: feeBps,
      percentage: (feeBps / 100).toFixed(2),
      recipient: this.FEE_WALLET.toString()
    }
  }

  /**
   * Get fee wallet address
   * @returns Fee wallet public key
   */
  getFeeWallet(): PublicKey {
    return this.FEE_WALLET
  }
}

export default FeeCollectionService