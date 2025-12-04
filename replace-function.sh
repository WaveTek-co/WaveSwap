#!/bin/bash

# Create a temporary file with the new function
cat > /tmp/new_function.txt << 'EOF'
// Direct confidential balances fetch (no authentication required - following Encifher examples)
  const fetchSessionBasedBalances = async () => {
    if (!publicKey) {
      console.error('[SwapComponent] Wallet not connected')
      return
    }

    setIsLoadingConfidentialBalances(true)
    try {
      console.log('[SwapComponent] 🔄 Fetching confidential balances directly (no auth required):', publicKey.toString())

      // Following Encifher examples - just call the API with public key, no signing needed
      const balanceResponse = await fetch(
        `/api/v1/confidential/authenticated-balances?userPublicKey=${encodeURIComponent(publicKey.toString())}`
      )

      if (balanceResponse.ok) {
        const balanceData = await balanceResponse.json()
        console.log('[SwapComponent] ✅ Successfully fetched confidential balances:', balanceData)

        // Set the confidential balances
        if (balanceData.success && balanceData.confidentialBalances) {
          setAuthenticatedBalances(balanceData.confidentialBalances)
          console.log('[SwapComponent] ✅ Set authenticated balances:', balanceData.confidentialBalances.length, 'tokens')
        } else {
          console.log('[SwapComponent] No confidential balances found')
          setAuthenticatedBalances([])
        }
      } else {
        const errorText = await balanceResponse.text()
        console.error('[SwapComponent] Failed to fetch confidential balances:', balanceResponse.status, errorText)
        setAuthenticatedBalances([])
      }

    } catch (error) {
      console.error('[SwapComponent] ❌ Failed to fetch confidential balances:', error)
      setAuthenticatedBalances([])
    } finally {
      setIsLoadingConfidentialBalances(false)
    }
  }
EOF

# Replace lines 251-363 in the file with the new function
sed -i '251,363d' apps/web/src/components/SwapComponent/index.tsx

# Insert the new function at line 251
sed -i '250r\
\
' apps/web/src/components/SwapComponent/index.tsx

sed -i '251r\
\
// Direct confidential balances fetch (no authentication required - following Encifher examples)' apps/web/src/components/SwapComponent/index.tsx

cat /tmp/new_function.txt >> apps/web/src/components/SwapComponent/index.tsx

# Clean up
rm /tmp/new_function.txt

echo "Function replacement completed"