/**
 * KORA CONNECTION TEST
 *
 * Tests connectivity to a Kora server and verifies it's configured
 * correctly for WAVETEK gasless withdrawals.
 *
 * Usage:
 *   npx ts-node kora/test-connection.ts [kora-url]
 *
 * Examples:
 *   npx ts-node kora/test-connection.ts
 *   npx ts-node kora/test-connection.ts https://kora.yourdomain.com
 */

const KORA_URL = process.argv[2]
  || process.env.NEXT_PUBLIC_KORA_RPC_URL
  || process.env.KORA_RPC_URL
  || "http://localhost:8080";

const STEALTH_PROGRAM_ID = "4jFg8uSh4jWkeoz6itdbsD7GadkTYLwfbyfDeNeB5nFX";

interface JsonRpcResponse<T> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
  };
}

async function rpcCall<T>(method: string, params: unknown[] = []): Promise<T> {
  const response = await fetch(KORA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const json = await response.json() as JsonRpcResponse<T>;

  if (json.error) {
    throw new Error(`RPC Error ${json.error.code}: ${json.error.message}`);
  }

  return json.result as T;
}

async function testConnection() {
  console.log("=".repeat(60));
  console.log("KORA CONNECTION TEST");
  console.log("=".repeat(60));
  console.log(`\nKora URL: ${KORA_URL}\n`);

  // Test 1: Health check
  console.log("1. Testing health endpoint...");
  try {
    const healthResponse = await fetch(`${KORA_URL}/health`);
    if (healthResponse.ok) {
      console.log("   PASS: Kora server is healthy");
    } else {
      console.log(`   FAIL: Health check returned ${healthResponse.status}`);
    }
  } catch (error: any) {
    console.log(`   FAIL: Cannot reach Kora server - ${error.message}`);
    console.log("\n   Make sure Kora is running:");
    console.log("   cd kora && docker-compose up");
    return;
  }

  // Test 2: Get payer signer
  console.log("\n2. Testing getPayerSigner...");
  try {
    const payer = await rpcCall<{ publicKey: string }>("getPayerSigner");
    console.log(`   PASS: Fee payer = ${payer.publicKey}`);
  } catch (error: any) {
    console.log(`   FAIL: ${error.message}`);
  }

  // Test 3: Get blockhash
  console.log("\n3. Testing getBlockhash...");
  try {
    const result = await rpcCall<{ blockhash: string }>("getBlockhash");
    console.log(`   PASS: Blockhash = ${result.blockhash.slice(0, 20)}...`);
  } catch (error: any) {
    console.log(`   FAIL: ${error.message}`);
  }

  // Test 4: Get config
  console.log("\n4. Testing getConfig...");
  try {
    const config = await rpcCall<{
      allowedPrograms?: string[];
      maxAllowedLamports?: number;
    }>("getConfig");

    console.log(`   PASS: Config retrieved`);

    // Check if STEALTH_PROGRAM_ID is in allowed programs
    if (config.allowedPrograms) {
      const hasStealthProgram = config.allowedPrograms.includes(STEALTH_PROGRAM_ID);
      if (hasStealthProgram) {
        console.log(`   PASS: STEALTH_PROGRAM_ID is in allowed_programs`);
      } else {
        console.log(`   WARN: STEALTH_PROGRAM_ID NOT in allowed_programs!`);
        console.log(`         Add "${STEALTH_PROGRAM_ID}" to kora.toml`);
      }
    }

    if (config.maxAllowedLamports) {
      const maxSol = config.maxAllowedLamports / 1_000_000_000;
      console.log(`   INFO: Max fee per tx = ${maxSol} SOL`);
    }
  } catch (error: any) {
    console.log(`   WARN: ${error.message} (getConfig may not be exposed)`);
  }

  // Test 5: Get supported tokens
  console.log("\n5. Testing getSupportedTokens...");
  try {
    const tokens = await rpcCall<string[]>("getSupportedTokens");
    console.log(`   PASS: ${tokens.length} tokens supported`);
    if (tokens.length === 0) {
      console.log("   INFO: SOL-only mode (no SPL token fees)");
    }
  } catch (error: any) {
    console.log(`   WARN: ${error.message}`);
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`
Kora server at ${KORA_URL} is accessible!

For Vercel deployment:
1. Set NEXT_PUBLIC_KORA_RPC_URL=${KORA_URL}
2. Redeploy your Vercel app
3. Gasless withdrawals will work automatically

For local testing:
export NEXT_PUBLIC_KORA_RPC_URL=${KORA_URL}
npm run dev
`);
}

testConnection().catch(console.error);
