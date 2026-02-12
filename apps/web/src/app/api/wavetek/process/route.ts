import { NextRequest, NextResponse } from 'next/server'
import {
  Connection, Keypair, PublicKey, Transaction, TransactionInstruction,
  sendAndConfirmTransaction, SystemProgram, ComputeBudgetProgram,
} from '@solana/web3.js'

const PROGRAM_ID = new PublicKey('4jFg8uSh4jWkeoz6itdbsD7GadkTYLwfbyfDeNeB5nFX')
const DELEGATION_PROGRAM_ID = new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh')
const VALIDATOR = new PublicKey('MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57')

const POOL_SEED = Buffer.from('per-mixer-pool-oceanvault')
const INPUT_ESCROW_SEQ_SEED = Buffer.from('input-seq')
const DEPOSIT_RECORD_SEQ_SEED = Buffer.from('deposit-seq')
const OUTPUT_ESCROW_SEED = Buffer.from('output-escrow')

function derivePool(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([POOL_SEED], PROGRAM_ID)
}
function deriveInputEscrow(seqId: bigint): [PublicKey, number] {
  const buf = Buffer.alloc(8); buf.writeBigUInt64LE(seqId, 0)
  return PublicKey.findProgramAddressSync([INPUT_ESCROW_SEQ_SEED, buf], PROGRAM_ID)
}
function deriveDepositRecord(seqId: bigint): [PublicKey, number] {
  const buf = Buffer.alloc(8); buf.writeBigUInt64LE(seqId, 0)
  return PublicKey.findProgramAddressSync([DEPOSIT_RECORD_SEQ_SEED, buf], PROGRAM_ID)
}
function deriveOutputEscrow(stealthPubkey: Buffer): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([OUTPUT_ESCROW_SEED, stealthPubkey], PROGRAM_ID)
}
function deriveDelegation(account: PublicKey) {
  const [buffer] = PublicKey.findProgramAddressSync(
    [Buffer.from('buffer'), account.toBuffer()], PROGRAM_ID
  )
  const [delegationRecord] = PublicKey.findProgramAddressSync(
    [Buffer.from('delegation'), account.toBuffer()], DELEGATION_PROGRAM_ID
  )
  const [delegationMetadata] = PublicKey.findProgramAddressSync(
    [Buffer.from('delegation-metadata'), account.toBuffer()], DELEGATION_PROGRAM_ID
  )
  return { buffer, delegationRecord, delegationMetadata }
}

function readPoolState(data: Buffer) {
  return {
    lastDepositedId: data.readBigUInt64LE(79),
    nextToProcessId: data.readBigUInt64LE(87),
    nextOutputId: data.readBigUInt64LE(95),
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

export async function POST(req: NextRequest) {
  try {
    const { seqId: seqIdNum } = await req.json()
    if (!seqIdNum || seqIdNum < 1) {
      return NextResponse.json({ error: 'Invalid seqId' }, { status: 400 })
    }

    const crankKey = process.env.CRANK_PRIVATE_KEY
    if (!crankKey) {
      return NextResponse.json({ error: 'Crank not configured' }, { status: 503 })
    }

    const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(crankKey)))
    const l1Rpc = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com'
    const perRpc = 'https://devnet-as.magicblock.app'

    const l1 = new Connection(l1Rpc, 'confirmed')
    const per = new Connection(perRpc, 'confirmed')
    const seqId = BigInt(seqIdNum)
    const [poolPda, poolBump] = derivePool()
    const [inputEscrow, ieBump] = deriveInputEscrow(seqId)
    const [depositRecord, drBump] = deriveDepositRecord(seqId)

    // Read pool state from PER
    const poolInfo = await per.getAccountInfo(poolPda)
    if (!poolInfo) {
      return NextResponse.json({ error: 'Pool not found on PER' }, { status: 500 })
    }
    const pool = readPoolState(poolInfo.data as Buffer)

    const results: string[] = []

    // Stage 0: REGISTER_DEPOSIT if needed (must run before INPUT_TO_POOL)
    if (seqId > pool.lastDepositedId) {
      const ieInfo = await per.getAccountInfo(inputEscrow)
      if (!ieInfo) {
        return NextResponse.json({ error: `Input escrow seq=${seqIdNum} not on PER yet` }, { status: 202 })
      }

      const regData = Buffer.alloc(12)
      regData.writeUInt8(0x3A, 0)
      regData.writeBigUInt64LE(seqId, 1)
      regData.writeUInt8(ieBump, 9)
      regData.writeUInt8(drBump, 10)
      regData.writeUInt8(poolBump, 11)

      const regIx = new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: payer.publicKey, isSigner: true, isWritable: true },
          { pubkey: poolPda, isSigner: false, isWritable: true },
          { pubkey: inputEscrow, isSigner: false, isWritable: false },
          { pubkey: depositRecord, isSigner: false, isWritable: false },
        ],
        data: regData,
      })

      try {
        const sig = await sendAndConfirmTransaction(per, new Transaction().add(regIx), [payer], {
          commitment: 'confirmed', skipPreflight: true,
        })
        results.push(`REGISTER_DEPOSIT: ${sig}`)
        // Re-read pool state after registration
        const refreshed = await per.getAccountInfo(poolPda)
        if (refreshed) {
          const updated = readPoolState(refreshed.data as Buffer)
          pool.lastDepositedId = updated.lastDepositedId
          pool.nextToProcessId = updated.nextToProcessId
        }
      } catch (e: any) {
        results.push(`REGISTER_DEPOSIT failed: ${e.message}`)
      }
    }

    // Stage 1: INPUT_TO_POOL_SEQ if needed
    if (seqId > pool.nextToProcessId) {
      const ieInfo = await per.getAccountInfo(inputEscrow)
      if (!ieInfo) {
        return NextResponse.json({ error: `Input escrow seq=${seqIdNum} not on PER yet` }, { status: 202 })
      }

      const data = Buffer.alloc(11)
      data.writeUInt8(0x3D, 0)
      data.writeBigUInt64LE(seqId, 1)
      data.writeUInt8(ieBump, 9)
      data.writeUInt8(drBump, 10)

      const ix = new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: payer.publicKey, isSigner: true, isWritable: false },
          { pubkey: inputEscrow, isSigner: false, isWritable: true },
          { pubkey: depositRecord, isSigner: false, isWritable: true },
          { pubkey: poolPda, isSigner: false, isWritable: true },
        ],
        data,
      })

      try {
        const sig = await sendAndConfirmTransaction(per, new Transaction().add(ix), [payer], {
          commitment: 'confirmed', skipPreflight: true,
        })
        results.push(`INPUT_TO_POOL: ${sig}`)
      } catch (e: any) {
        results.push(`INPUT_TO_POOL failed: ${e.message}`)
      }
    }

    // Read deposit record for stealth_pubkey
    const drInfo = await per.getAccountInfo(depositRecord)
    if (!drInfo) {
      return NextResponse.json({ results, note: 'deposit_record not on PER' })
    }
    const stealthPubkey = Buffer.from(drInfo.data.slice(57, 89))
    const [outputEscrow, oeBump] = deriveOutputEscrow(stealthPubkey)

    // Stage 2: PREPARE_OUTPUT on L1 if needed
    const oeInfoPer = await per.getAccountInfo(outputEscrow)
    if (!oeInfoPer) {
      const oeDel = deriveDelegation(outputEscrow)
      const prepData = Buffer.alloc(15)
      prepData.writeUInt8(0x40, 0)
      prepData.writeBigUInt64LE(seqId, 1)
      prepData.writeUInt8(drBump, 9)
      prepData.writeUInt8(oeBump, 10)
      prepData.writeUInt32LE(1000, 11)

      const prepIx = new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: payer.publicKey, isSigner: true, isWritable: true },
          { pubkey: depositRecord, isSigner: false, isWritable: false },
          { pubkey: outputEscrow, isSigner: false, isWritable: true },
          { pubkey: oeDel.buffer, isSigner: false, isWritable: true },
          { pubkey: oeDel.delegationRecord, isSigner: false, isWritable: true },
          { pubkey: oeDel.delegationMetadata, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: DELEGATION_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: VALIDATOR, isSigner: false, isWritable: false },
        ],
        data: prepData,
      })

      const tx = new Transaction()
      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }))
      tx.add(prepIx)

      try {
        const sig = await sendAndConfirmTransaction(l1, tx, [payer], {
          commitment: 'confirmed', skipPreflight: true,
        })
        results.push(`PREPARE_OUTPUT: ${sig}`)

        // Wait for sync to PER
        for (let i = 0; i < 15; i++) {
          await sleep(2000)
          const check = await per.getAccountInfo(outputEscrow)
          if (check) { results.push('output_escrow synced to PER'); break }
        }
      } catch (e: any) {
        results.push(`PREPARE_OUTPUT failed: ${e.message}`)
      }
    }

    // Stage 3: POOL_TO_ESCROW on PER
    const oeCheck = await per.getAccountInfo(outputEscrow)
    if (oeCheck) {
      const p2eData = Buffer.alloc(10)
      p2eData.writeUInt8(0x3E, 0)
      p2eData.writeBigUInt64LE(seqId, 1)
      p2eData.writeUInt8(drBump, 9)

      const p2eIx = new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: payer.publicKey, isSigner: true, isWritable: false },
          { pubkey: depositRecord, isSigner: false, isWritable: true },
          { pubkey: poolPda, isSigner: false, isWritable: true },
          { pubkey: outputEscrow, isSigner: false, isWritable: true },
        ],
        data: p2eData,
      })

      try {
        const sig = await sendAndConfirmTransaction(per, new Transaction().add(p2eIx), [payer], {
          commitment: 'confirmed', skipPreflight: true,
        })
        results.push(`POOL_TO_ESCROW: ${sig}`)
      } catch (e: any) {
        results.push(`POOL_TO_ESCROW failed: ${e.message}`)
      }
    }

    return NextResponse.json({ success: true, results })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
