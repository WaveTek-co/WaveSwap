'use client'

/**
 * OceanVault Provider
 * 
 * Integrates the OceanVault SDK with WaveSwap's existing wallet infrastructure.
 * Provides stealth vault functionality including private transfers, swaps, and staking.
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, ReactNode } from 'react'
import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js'
import { useMultiWallet } from '@/contexts/MultiWalletContext'

// Types for OceanVault SDK (inline to avoid build issues with file: dependencies)
export type NetworkType = 'devnet' | 'mainnet-beta' | 'testnet'
export type TransactionStatus = 'idle' | 'preparing' | 'signing' | 'confirming' | 'confirmed' | 'failed'
export type OperationType = 'transfer' | 'swap' | 'stake' | 'unstake' | 'claim'

export interface ViewingKeys {
    spendPrivkey: Uint8Array
    spendPubkey: Uint8Array
    viewPrivkey: Uint8Array
    viewPubkey: Uint8Array
}

export interface StealthVault {
    address: PublicKey
    registryPda: PublicKey
    balance: bigint
    isInitialized: boolean
    createdAt?: number
    lastActivity?: number
}

export interface OceanVaultContextType {
    // State
    isInitialized: boolean
    isLoading: boolean
    error: Error | null
    network: NetworkType

    // Viewing Keys
    viewingKeys: ViewingKeys | null
    hasViewingKeys: boolean
    isGeneratingKeys: boolean
    generateViewingKeys: () => Promise<ViewingKeys>

    // Vault
    vault: StealthVault | null
    isCreatingVault: boolean
    createVault: () => Promise<void>
    refreshVault: () => Promise<void>

    // Helpers
    clearError: () => void
}

const OceanVaultContext = createContext<OceanVaultContextType | null>(null)

// Configuration
const PROGRAM_IDS = {
    REGISTRY: new PublicKey('6pNpYWSfcVyFaRFQGZHduBSXPZ3CWKG2iV7ve7BUXfJR'),
    STEALTH: new PublicKey('4jFg8uSh4jWkeoz6itdbsD7GadkTYLwfbyfDeNeB5nFX'),
    DEFI: new PublicKey('8Xi4D44Xt3DnT6r8LogM4K9CSt3bHtpc1m21nErGawaA'),
    BRIDGE: new PublicKey('AwZHcaizUMSsQC7fNAMbrahK2w3rLYXUDFCK4MvMKz1f'),
}

const RPC_ENDPOINTS: Record<NetworkType, string> = {
    devnet: 'https://api.devnet.solana.com',
    'mainnet-beta': 'https://api.mainnet-beta.solana.com',
    testnet: 'https://api.testnet.solana.com',
}

const VIEWING_KEY_DOMAIN = 'OceanVault:ViewingKeys:v1'
const KEY_DERIVATION_MESSAGE = `Sign this message to generate your OceanVault stealth viewing keys.\n\nThis signature will be used to derive your private viewing keys. Never share this signature with anyone.\n\nDomain: ${VIEWING_KEY_DOMAIN}`

interface OceanVaultProviderProps {
    children: ReactNode
    network?: NetworkType
    autoInitializeKeys?: boolean
    autoCreateVault?: boolean
}

export function OceanVaultProvider({
    children,
    network = 'devnet',
    autoInitializeKeys = false,
    autoCreateVault = false,
}: OceanVaultProviderProps) {
    const multiWallet = useMultiWallet()

    // State
    const [isInitialized, setIsInitialized] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<Error | null>(null)

    // Viewing Keys State
    const [viewingKeys, setViewingKeys] = useState<ViewingKeys | null>(null)
    const [isGeneratingKeys, setIsGeneratingKeys] = useState(false)

    // Vault State
    const [vault, setVault] = useState<StealthVault | null>(null)
    const [isCreatingVault, setIsCreatingVault] = useState(false)

    const hasViewingKeys = useMemo(() => viewingKeys !== null, [viewingKeys])

    // Generate viewing keys from wallet signature
    const generateViewingKeys = useCallback(async (): Promise<ViewingKeys> => {
        if (!multiWallet.connected || !multiWallet.publicKey) {
            throw new Error('Wallet not connected')
        }

        if (!multiWallet.signMessage) {
            throw new Error('Wallet does not support message signing')
        }

        setIsGeneratingKeys(true)
        setError(null)

        try {
            // Import crypto libraries dynamically
            const { sha3_256 } = await import('js-sha3')
            const { ed25519 } = await import('@noble/curves/ed25519')

            const message = new TextEncoder().encode(KEY_DERIVATION_MESSAGE)
            const signature = await multiWallet.signMessage(message)

            // Helper to concatenate Uint8Arrays
            const concatBytes = (...arrays: Uint8Array[]): Uint8Array => {
                const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0)
                const result = new Uint8Array(totalLength)
                let offset = 0
                for (const arr of arrays) {
                    result.set(arr, offset)
                    offset += arr.length
                }
                return result
            }

            // Helper to convert hex string to Uint8Array
            const hexToBytes = (hex: string): Uint8Array => {
                const bytes = new Uint8Array(hex.length / 2)
                for (let i = 0; i < bytes.length; i++) {
                    bytes[i] = parseInt(hex.substr(i * 2, 2), 16)
                }
                return bytes
            }

            // Ensure signature is Uint8Array
            const signatureBytes = signature instanceof Uint8Array
                ? signature
                : new Uint8Array(signature)

            const domainBytes = new TextEncoder().encode(VIEWING_KEY_DOMAIN)

            // Derive master seed from signature
            const masterSeedHex = sha3_256(concatBytes(signatureBytes, domainBytes))
            const masterSeed = hexToBytes(masterSeedHex)

            // Derive spend keys
            const spendLabel = new TextEncoder().encode('spend')
            const spendSeedHex = sha3_256(concatBytes(masterSeed, spendLabel))
            const spendSeed = hexToBytes(spendSeedHex)
            const spendPrivkey = spendSeed.slice(0, 32)
            const spendPubkey = ed25519.getPublicKey(spendPrivkey)

            // Derive view keys
            const viewLabel = new TextEncoder().encode('view')
            const viewSeedHex = sha3_256(concatBytes(masterSeed, viewLabel))
            const viewSeed = hexToBytes(viewSeedHex)
            const viewPrivkey = viewSeed.slice(0, 32)
            const viewPubkey = ed25519.getPublicKey(viewPrivkey)

            const keys: ViewingKeys = {
                spendPrivkey,
                spendPubkey: new Uint8Array(spendPubkey),
                viewPrivkey,
                viewPubkey: new Uint8Array(viewPubkey),
            }

            setViewingKeys(keys)
            setIsInitialized(true)
            return keys
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err))
            setError(error)
            throw error
        } finally {
            setIsGeneratingKeys(false)
        }
    }, [multiWallet])

    // Create stealth vault
    const createVault = useCallback(async (): Promise<void> => {
        if (!multiWallet.connected || !multiWallet.publicKey) {
            throw new Error('Wallet not connected')
        }

        if (!viewingKeys) {
            throw new Error('Viewing keys not initialized')
        }

        setIsCreatingVault(true)
        setError(null)

        try {
            // Derive registry PDA
            const registrySeed = new TextEncoder().encode('registry')
            const [registryPda] = PublicKey.findProgramAddressSync(
                [registrySeed, multiWallet.publicKey.toBuffer()],
                PROGRAM_IDS.REGISTRY
            )

            // Check if registry already exists with timeout
            let registryInfo = null
            try {
                const timeoutPromise = new Promise<null>((_, reject) => {
                    setTimeout(() => reject(new Error('RPC timeout')), 10000)
                })

                registryInfo = await Promise.race([
                    multiWallet.connection.getAccountInfo(registryPda),
                    timeoutPromise
                ])
            } catch (rpcError) {
                console.warn('RPC call failed or timed out:', rpcError)
                // Continue with uninitialized vault
            }

            if (registryInfo) {
                // Registry exists, just update state
                setVault({
                    address: multiWallet.publicKey,
                    registryPda,
                    balance: BigInt(registryInfo.lamports),
                    isInitialized: true,
                })
            } else {
                // Registry doesn't exist yet - set up local vault state
                // The actual on-chain registration will happen on first transfer
                setVault({
                    address: multiWallet.publicKey,
                    registryPda,
                    balance: BigInt(0),
                    isInitialized: false,
                })
            }

        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err))
            setError(error)
            throw error
        } finally {
            setIsCreatingVault(false)
        }
    }, [multiWallet, viewingKeys])

    // Refresh vault balance
    const refreshVault = useCallback(async (): Promise<void> => {
        if (!vault || !multiWallet.connection) return

        try {
            const balance = await multiWallet.connection.getBalance(vault.registryPda)
            setVault(prev => prev ? { ...prev, balance: BigInt(balance) } : null)
        } catch (err) {
            console.error('Failed to refresh vault balance:', err)
        }
    }, [vault, multiWallet.connection])

    // Clear error
    const clearError = useCallback(() => {
        setError(null)
    }, [])

    // Auto-initialize on wallet connect
    useEffect(() => {
        if (multiWallet.connected && autoInitializeKeys && !viewingKeys && !isGeneratingKeys) {
            generateViewingKeys().catch(console.error)
        }
    }, [multiWallet.connected, autoInitializeKeys, viewingKeys, isGeneratingKeys, generateViewingKeys])

    // Auto-create vault after keys are generated
    useEffect(() => {
        if (viewingKeys && autoCreateVault && !vault && !isCreatingVault) {
            createVault().catch(console.error)
        }
    }, [viewingKeys, autoCreateVault, vault, isCreatingVault, createVault])

    // Reset state when wallet disconnects
    useEffect(() => {
        if (!multiWallet.connected) {
            setViewingKeys(null)
            setVault(null)
            setIsInitialized(false)
        }
    }, [multiWallet.connected])

    const contextValue: OceanVaultContextType = {
        isInitialized,
        isLoading,
        error,
        network,
        viewingKeys,
        hasViewingKeys,
        isGeneratingKeys,
        generateViewingKeys,
        vault,
        isCreatingVault,
        createVault,
        refreshVault,
        clearError,
    }

    return (
        <OceanVaultContext.Provider value={contextValue}>
            {children}
        </OceanVaultContext.Provider>
    )
}

export function useOceanVault(): OceanVaultContextType {
    const context = useContext(OceanVaultContext)
    if (!context) {
        throw new Error('useOceanVault must be used within an OceanVaultProvider')
    }
    return context
}

export default OceanVaultProvider
