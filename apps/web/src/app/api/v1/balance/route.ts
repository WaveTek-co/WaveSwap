import { NextRequest, NextResponse } from 'next/server'
import { Connection, PublicKey } from '@solana/web3.js'
import { config } from '@/lib/config'

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

    const connection = new Connection(config.rpc.url, {
      commitment,
      httpHeaders: { 'Content-Type': 'application/json' }
    })

    const walletPubkey = new PublicKey(walletAddress)
    let balance: bigint

    if (mint === 'So11111111111111111111111111111111111111112') {
      const lamports = await connection.getBalance(walletPubkey, { commitment })
      balance = BigInt(lamports)
    } else {
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(walletPubkey, {
        mint: new PublicKey(mint)
      }, { commitment })

      if (tokenAccounts.value.length > 0) {
        const parsedInfo = tokenAccounts.value[0].account.data.parsed.info
        balance = parsedInfo?.tokenAmount?.amount ? BigInt(parsedInfo.tokenAmount.amount) : BigInt(0)
      } else {
        balance = BigInt(0)
      }
    }

    return NextResponse.json({
      success: true,
      balance: balance.toString(),
      walletAddress,
      mint,
      commitment
    })

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error?.message || 'Balance fetch failed'
    }, { status: 500 })
  }
}
