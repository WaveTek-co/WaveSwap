import { NextRequest, NextResponse } from 'next/server'
import { Connection, PublicKey } from '@solana/web3.js'
import { config } from '@/lib/config'

/**
 * Proxy API endpoint to fetch balance server-side to avoid exposing API keys in browser
 * This prevents 403 errors from Helius when API key is exposed in client-side requests
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('wallet')
    const mint = searchParams.get('mint')
    const commitment = searchParams.get('commitment') || 'confirmed'

    if (!walletAddress || !mint) {
      return NextResponse.json(
        { error: 'Missing wallet address or mint parameter' },
        { status: 400 }
      )
    }

    console.log(`[BalanceProxy] Fetching balance for wallet: ${walletAddress}, mint: ${mint}`)

    // Create connection server-side where API key is secure
    const connection = new Connection(config.rpc.url, {
      commitment,
      httpHeaders: {
        'Content-Type': 'application/json',
      }
    })

    const walletPubkey = new PublicKey(walletAddress)

    let balance: bigint
    let lamports = 0

    if (mint === 'So11111111111111111111111111111111111111112') {
      // SOL balance
      lamports = await connection.getBalance(walletPubkey, { commitment })
      balance = BigInt(lamports)
      console.log(`[BalanceProxy] SOL balance: ${lamports} lamports`)
    } else {
      // SPL token balance
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(walletPubkey, {
        mint: new PublicKey(mint)
      }, { commitment })

      console.log(`[BalanceProxy] Found ${tokenAccounts.value.length} token accounts for mint: ${mint}`)

      if (tokenAccounts.value.length > 0) {
        const account = tokenAccounts.value[0]

        // The correct structure for parsed token accounts
        const parsedInfo = account.account.data.parsed.info

        if (parsedInfo?.tokenAmount?.amount) {
          balance = BigInt(parsedInfo.tokenAmount.amount)
          console.log(`[BalanceProxy] SPL token balance: ${balance.toString()}`)
        } else {
          console.error(`[BalanceProxy] Invalid token account data structure:`, {
            hasParsed: !!account.account.data.parsed,
            hasInfo: !!parsedInfo,
            hasTokenAmount: !!parsedInfo?.tokenAmount,
            hasAmount: !!parsedInfo?.tokenAmount?.amount,
            structure: {
              hasData: !!account.account.data,
              dataType: account.account.data?.type,
              parsedKeys: account.account.data?.parsed ? Object.keys(account.account.data.parsed) : []
            }
          })
          balance = BigInt(0)
        }
      } else {
        balance = BigInt(0)
        console.log(`[BalanceProxy] No token account found for mint: ${mint}`)
      }
    }

    return NextResponse.json({
      success: true,
      balance: balance.toString(),
      lamports: lamports,
      walletAddress,
      mint,
      commitment
    })

  } catch (error) {
    console.error('[BalanceProxy] Error fetching balance:', error)

    // Return actual error details for debugging
    return NextResponse.json({
      success: false,
      error: error?.message || 'Unknown error',
      details: {
        name: error?.name,
        code: error?.code,
        stack: error?.stack
      }
    }, { status: 500 })
  }
}