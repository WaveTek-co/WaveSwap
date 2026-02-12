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

interface PoolState {
  lastDepositedId: bigint
  nextToProcessId: bigint
  nextOutputId: bigint
}

function readPoolState(data: Buffer): PoolState {
  return {
    lastDepositedId: data.readBigUInt64LE(79),
    nextToProcessId: data.readBigUInt64LE(87),
    nextOutputId: data.readBigUInt64LE(95),
  }
}

async function readPool(per: Connection, poolPda: PublicKey): Promise<PoolState | null> {
  const info = await per.getAccountInfo(poolPda)
  if (!info) return null
  return readPoolState(info.data as Buffer)
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// ============================================
// FIFO-correct batch crank processing
// ============================================
// Processes ALL pending deposits through the pipeline:
// INPUT pipeline: REGISTER → INPUT_TO_POOL (sequential FIFO)
// OUTPUT pipeline: PREPARE_OUTPUT → POOL_TO_ESCROW (sequential FIFO, temporal decorrelation)
// Both pipelines run in the same invocation

export async function POST(req: NextRequest) {
  try {
    const { seqId: seqIdNum } = await req.json()

    const crankKey = process.env.CRANK_PRIVATE_KEY
    if (!crankKey) {
      return NextResponse.json({ error: 'Crank not configured' }, { status: 503 })
    }

    const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(crankKey)))
    const l1Rpc = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com'
    const perRpc = 'https://devnet-as.magicblock.app'

    const l1 = new Connection(l1Rpc, 'confirmed')
    const per = new Connection(perRpc, 'confirmed')
    const [poolPda, poolBump] = derivePool()
    const targetSeqId = seqIdNum ? BigInt(seqIdNum) : 0n

    const results: string[] = []

    // Wait for target deposit to appear on PER (delegation sync ~3-10s)
    if (targetSeqId > 0n) {
      const [targetEscrow] = deriveInputEscrow(targetSeqId)
      for (let i = 0; i < 15; i++) {
        const info = await per.getAccountInfo(targetEscrow)
        if (info) break
        if (i === 14) {
          results.push(`target seq=${seqIdNum} not on PER after 30s`)
        }
        await sleep(2000)
      }
    }

    // ============================================
    // INPUT PIPELINE: Register + InputToPool
    // ============================================
    // Process all unregistered deposits in FIFO order
    let pool = await readPool(per, poolPda)
    if (!pool) {
      return NextResponse.json({ error: 'Pool not found on PER' }, { status: 500 })
    }

    // Stage 1: REGISTER all unregistered deposits (probe forward from lastDepositedId+1)
    for (let attempt = 0; attempt < 20; attempt++) {
      const nextRegId = pool.lastDepositedId + 1n
      const [ie, ieBump] = deriveInputEscrow(nextRegId)
      const [dr, drBump] = deriveDepositRecord(nextRegId)

      const ieInfo = await per.getAccountInfo(ie)
      if (!ieInfo) break // No more unregistered deposits

      const regData = Buffer.alloc(12)
      regData.writeUInt8(0x3A, 0)
      regData.writeBigUInt64LE(nextRegId, 1)
      regData.writeUInt8(ieBump, 9)
      regData.writeUInt8(drBump, 10)
      regData.writeUInt8(poolBump, 11)

      try {
        const sig = await sendAndConfirmTransaction(per, new Transaction().add(
          new TransactionInstruction({
            programId: PROGRAM_ID,
            keys: [
              { pubkey: payer.publicKey, isSigner: true, isWritable: true },
              { pubkey: poolPda, isSigner: false, isWritable: true },
              { pubkey: ie, isSigner: false, isWritable: false },
              { pubkey: dr, isSigner: false, isWritable: false },
            ],
            data: regData,
          })
        ), [payer], { commitment: 'confirmed', skipPreflight: true })
        results.push(`REGISTER seq=${nextRegId}: ${sig}`)
      } catch (e: any) {
        results.push(`REGISTER seq=${nextRegId} failed: ${e.message}`)
        break
      }

      // Refresh pool state
      pool = (await readPool(per, poolPda)) || pool
    }

    // Stage 2: INPUT_TO_POOL for all registered but unprocessed deposits
    pool = (await readPool(per, poolPda)) || pool
    const pendingInputs = Number(pool.lastDepositedId - pool.nextToProcessId)

    for (let i = 0; i < pendingInputs && i < 20; i++) {
      const nextInputId = pool.nextToProcessId + 1n
      const [ie, ieBump] = deriveInputEscrow(nextInputId)
      const [dr, drBump] = deriveDepositRecord(nextInputId)

      const ieInfo = await per.getAccountInfo(ie)
      if (!ieInfo) break

      // Skip already emptied
      if (ieInfo.data[49] === 1) {
        results.push(`INPUT seq=${nextInputId} already emptied`)
        continue
      }

      const data = Buffer.alloc(11)
      data.writeUInt8(0x3D, 0)
      data.writeBigUInt64LE(nextInputId, 1)
      data.writeUInt8(ieBump, 9)
      data.writeUInt8(drBump, 10)

      try {
        const sig = await sendAndConfirmTransaction(per, new Transaction().add(
          new TransactionInstruction({
            programId: PROGRAM_ID,
            keys: [
              { pubkey: payer.publicKey, isSigner: true, isWritable: false },
              { pubkey: ie, isSigner: false, isWritable: true },
              { pubkey: dr, isSigner: false, isWritable: true },
              { pubkey: poolPda, isSigner: false, isWritable: true },
            ],
            data,
          })
        ), [payer], { commitment: 'confirmed', skipPreflight: true })
        results.push(`INPUT_TO_POOL seq=${nextInputId}: ${sig}`)
      } catch (e: any) {
        results.push(`INPUT_TO_POOL seq=${nextInputId} failed: ${e.message}`)
        break
      }

      pool = (await readPool(per, poolPda)) || pool
    }

    // ============================================
    // OUTPUT PIPELINE: PrepareOutput + PoolToEscrow
    // ============================================
    // Process all mature deposits (3+ heartbeats old) in FIFO order
    // Runs after input pipeline so newly processed inputs can be checked for maturity
    pool = (await readPool(per, poolPda)) || pool
    const pendingOutputs = Number(pool.nextToProcessId - pool.nextOutputId)

    for (let i = 0; i < pendingOutputs && i < 20; i++) {
      const nextOutputId = pool.nextOutputId + 1n
      const [dr, drBump] = deriveDepositRecord(nextOutputId)

      const drInfo = await per.getAccountInfo(dr)
      if (!drInfo) break

      // Check if deposit is in pool and output not yet created
      const isInPool = drInfo.data[204] === 1
      const isOutputCreated = drInfo.data[209] === 1
      if (!isInPool || isOutputCreated) {
        results.push(`OUTPUT seq=${nextOutputId} skip: inPool=${isInPool} created=${isOutputCreated}`)
        continue
      }

      const stealthPubkey = Buffer.from(drInfo.data.slice(57, 89))
      const [outputEscrow, oeBump] = deriveOutputEscrow(stealthPubkey)

      // PREPARE_OUTPUT on L1 if output_escrow doesn't exist on PER yet
      const oeInfoPer = await per.getAccountInfo(outputEscrow)
      if (!oeInfoPer) {
        const oeDel = deriveDelegation(outputEscrow)
        const prepData = Buffer.alloc(15)
        prepData.writeUInt8(0x40, 0)
        prepData.writeBigUInt64LE(nextOutputId, 1)
        prepData.writeUInt8(drBump, 9)
        prepData.writeUInt8(oeBump, 10)
        prepData.writeUInt32LE(1000, 11)

        const tx = new Transaction()
        tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }))
        tx.add(new TransactionInstruction({
          programId: PROGRAM_ID,
          keys: [
            { pubkey: payer.publicKey, isSigner: true, isWritable: true },
            { pubkey: dr, isSigner: false, isWritable: false },
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
        }))

        try {
          const sig = await sendAndConfirmTransaction(l1, tx, [payer], {
            commitment: 'confirmed', skipPreflight: true,
          })
          results.push(`PREPARE_OUTPUT seq=${nextOutputId}: ${sig}`)

          // Wait for delegation sync to PER
          let synced = false
          for (let j = 0; j < 15; j++) {
            await sleep(2000)
            const check = await per.getAccountInfo(outputEscrow)
            if (check) { synced = true; break }
          }
          if (!synced) {
            results.push(`OUTPUT seq=${nextOutputId} sync timeout, will retry next iteration`)
            break
          }
        } catch (e: any) {
          results.push(`PREPARE_OUTPUT seq=${nextOutputId} failed: ${e.message}`)
          break
        }
      }

      // POOL_TO_ESCROW on PER (temporal decorrelation enforced on-chain: min 3 heartbeats)
      const p2eData = Buffer.alloc(10)
      p2eData.writeUInt8(0x3E, 0)
      p2eData.writeBigUInt64LE(nextOutputId, 1)
      p2eData.writeUInt8(drBump, 9)

      try {
        const sig = await sendAndConfirmTransaction(per, new Transaction().add(
          new TransactionInstruction({
            programId: PROGRAM_ID,
            keys: [
              { pubkey: payer.publicKey, isSigner: true, isWritable: false },
              { pubkey: dr, isSigner: false, isWritable: true },
              { pubkey: poolPda, isSigner: false, isWritable: true },
              { pubkey: outputEscrow, isSigner: false, isWritable: true },
            ],
            data: p2eData,
          })
        ), [payer], { commitment: 'confirmed', skipPreflight: true })
        results.push(`POOL_TO_ESCROW seq=${nextOutputId}: ${sig}`)
      } catch (e: any) {
        // Temporal decorrelation failure is expected for recent deposits
        const msg = e.message || ''
        if (msg.includes('temporal') || msg.includes('not old enough')) {
          results.push(`POOL_TO_ESCROW seq=${nextOutputId}: not mature yet (3+ heartbeats required)`)
        } else {
          results.push(`POOL_TO_ESCROW seq=${nextOutputId} failed: ${msg}`)
        }
        break
      }

      pool = (await readPool(per, poolPda)) || pool
    }

    // Final pool state
    pool = (await readPool(per, poolPda)) || pool
    return NextResponse.json({
      success: true,
      pool: {
        lastDepositedId: Number(pool.lastDepositedId),
        nextToProcessId: Number(pool.nextToProcessId),
        nextOutputId: Number(pool.nextOutputId),
      },
      results,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
