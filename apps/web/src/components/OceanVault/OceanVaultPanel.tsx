'use client'

/**
 * OceanVault Panel Component
 * 
 * A comprehensive UI component for OceanVault stealth vault operations.
 * Provides access to viewing keys, vault management, and private transfers.
 */

import React, { useState } from 'react'
import { useOceanVault } from '@/providers/OceanVaultProvider'
import { useStealthTransfer, useStealthSwap, useFees, formatSol, solToLamports } from '@/hooks/useOceanVault'
import { PublicKey } from '@solana/web3.js'

export function OceanVaultPanel() {
    const {
        isInitialized,
        isLoading,
        error,
        viewingKeys,
        hasViewingKeys,
        isGeneratingKeys,
        generateViewingKeys,
        vault,
        isCreatingVault,
        createVault,
        clearError,
    } = useOceanVault()

    const { isTransferring, sendTransfer, lookupRecipient, lastTransfer } = useStealthTransfer()
    const { quote, isQuoting, getQuote, executeSwap, isSwapping, supportedTokens } = useStealthSwap()
    const { calculateFee, formatFee } = useFees()

    // Local state for forms
    const [activeTab, setActiveTab] = useState<'vault' | 'transfer' | 'swap'>('vault')
    const [recipientAddress, setRecipientAddress] = useState('')
    const [transferAmount, setTransferAmount] = useState('')
    const [swapAmount, setSwapAmount] = useState('')

    // Handle viewing keys generation
    const handleGenerateKeys = async () => {
        try {
            await generateViewingKeys()
        } catch (err) {
            console.error('Failed to generate viewing keys:', err)
        }
    }

    // Handle vault creation
    const handleCreateVault = async () => {
        try {
            await createVault()
        } catch (err) {
            console.error('Failed to create vault:', err)
        }
    }

    // Handle transfer
    const handleTransfer = async () => {
        if (!recipientAddress || !transferAmount) return

        try {
            const recipientPubkey = new PublicKey(recipientAddress)
            const recipient = await lookupRecipient(recipientPubkey)

            if (!recipient) {
                throw new Error('Recipient not registered with OceanVault')
            }

            await sendTransfer({
                recipientSpendPubkey: recipient.spendPubkey,
                recipientViewPubkey: recipient.viewPubkey,
                amount: solToLamports(parseFloat(transferAmount)),
            })

            setRecipientAddress('')
            setTransferAmount('')
        } catch (err) {
            console.error('Transfer failed:', err)
        }
    }

    // Handle swap quote
    const handleGetQuote = async () => {
        if (!swapAmount) return

        try {
            await getQuote({
                inputMint: supportedTokens[0].mint, // SOL
                outputMint: supportedTokens[1].mint, // USDC
                inputAmount: solToLamports(parseFloat(swapAmount)),
            })
        } catch (err) {
            console.error('Failed to get quote:', err)
        }
    }

    // Handle swap execution
    const handleExecuteSwap = async () => {
        if (!swapAmount) return

        try {
            await executeSwap({
                inputMint: supportedTokens[0].mint,
                outputMint: supportedTokens[1].mint,
                inputAmount: solToLamports(parseFloat(swapAmount)),
            })

            setSwapAmount('')
        } catch (err) {
            console.error('Swap failed:', err)
        }
    }

    return (
        <div className="bg-surface-dark/80 backdrop-blur-xl rounded-2xl border border-white/5 p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-white">OceanVault</h2>
                    <p className="text-sm text-white/60">Privacy-preserving stealth vault</p>
                </div>
                {isInitialized && (
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-sm text-green-400">Active</span>
                    </div>
                )}
            </div>

            {/* Error display */}
            {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-center justify-between">
                    <p className="text-sm text-red-400">{error.message}</p>
                    <button
                        onClick={clearError}
                        className="text-red-400 hover:text-red-300 text-sm"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {/* Tabs */}
            <div className="flex gap-2">
                {['vault', 'transfer', 'swap'].map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab as any)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab
                            ? 'bg-primary-500 text-white'
                            : 'bg-white/5 text-white/60 hover:bg-white/10'
                            }`}
                    >
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                ))}
            </div>

            {/* Vault Tab */}
            {activeTab === 'vault' && (
                <div className="space-y-4">
                    {/* Viewing Keys Section */}
                    <div className="bg-white/5 rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="font-medium text-white">Viewing Keys</h3>
                            {hasViewingKeys ? (
                                <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded">
                                    Generated
                                </span>
                            ) : (
                                <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded">
                                    Not Generated
                                </span>
                            )}
                        </div>

                        {!hasViewingKeys && (
                            <button
                                onClick={handleGenerateKeys}
                                disabled={isGeneratingKeys}
                                className="w-full py-3 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-medium text-white transition-colors"
                            >
                                {isGeneratingKeys ? 'Generating...' : 'Generate Viewing Keys'}
                            </button>
                        )}

                        {hasViewingKeys && (
                            <div className="text-xs text-white/40 font-mono break-all">
                                Spend Pubkey: {Buffer.from(viewingKeys!.spendPubkey).toString('hex').slice(0, 16)}...
                            </div>
                        )}
                    </div>

                    {/* Vault Section */}
                    {hasViewingKeys && (
                        <div className="bg-white/5 rounded-xl p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <h3 className="font-medium text-white">Stealth Vault</h3>
                                {vault?.isInitialized ? (
                                    <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded">
                                        Active
                                    </span>
                                ) : (
                                    <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded">
                                        Not Created
                                    </span>
                                )}
                            </div>

                            {vault && (
                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-white/60">Balance</span>
                                        <span className="text-white font-medium">
                                            {formatSol(vault.balance)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-white/60">Registry</span>
                                        <span className="text-white/40 font-mono text-xs">
                                            {vault.registryPda.toBase58().slice(0, 8)}...
                                        </span>
                                    </div>
                                    {!vault.isInitialized && (
                                        <div className="text-xs text-yellow-400/80 mt-2">
                                            Vault ready locally. On-chain registration happens on first transaction.
                                        </div>
                                    )}
                                </div>
                            )}

                            {!vault && (
                                <button
                                    onClick={handleCreateVault}
                                    disabled={isCreatingVault}
                                    className="w-full py-3 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-medium text-white transition-colors"
                                >
                                    {isCreatingVault ? 'Creating...' : 'Create Vault'}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Transfer Tab */}
            {activeTab === 'transfer' && (
                <div className="space-y-4">
                    {!hasViewingKeys ? (
                        <div className="text-center py-8 text-white/60">
                            Please generate viewing keys first
                        </div>
                    ) : (
                        <>
                            <div className="space-y-2">
                                <label className="text-sm text-white/60">Recipient Address</label>
                                <input
                                    type="text"
                                    value={recipientAddress}
                                    onChange={(e) => setRecipientAddress(e.target.value)}
                                    placeholder="Enter Solana address"
                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-primary-500"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm text-white/60">Amount (SOL)</label>
                                <input
                                    type="number"
                                    value={transferAmount}
                                    onChange={(e) => setTransferAmount(e.target.value)}
                                    placeholder="0.0"
                                    step="0.01"
                                    min="0"
                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-primary-500"
                                />
                            </div>

                            {transferAmount && (
                                <div className="bg-white/5 rounded-lg p-3 text-sm">
                                    <div className="flex justify-between text-white/60">
                                        <span>Fee (0.1%)</span>
                                        <span>{formatFee(calculateFee('transfer', solToLamports(parseFloat(transferAmount || '0'))).oceanVaultFee)}</span>
                                    </div>
                                </div>
                            )}

                            <button
                                onClick={handleTransfer}
                                disabled={isTransferring || !recipientAddress || !transferAmount}
                                className="w-full py-3 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-medium text-white transition-colors"
                            >
                                {isTransferring ? 'Sending...' : 'Send Private Transfer'}
                            </button>

                            {lastTransfer && (
                                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                                    <p className="text-sm text-green-400">
                                        Transfer successful! Signature: {lastTransfer.signature.slice(0, 16)}...
                                    </p>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* Swap Tab */}
            {activeTab === 'swap' && (
                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm text-white/60">From: SOL</label>
                        <input
                            type="number"
                            value={swapAmount}
                            onChange={(e) => setSwapAmount(e.target.value)}
                            placeholder="0.0"
                            step="0.01"
                            min="0"
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-primary-500"
                        />
                    </div>

                    <div className="text-center text-white/40">
                        ↓
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm text-white/60">To: USDC</label>
                        <div className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white">
                            {quote ? formatSol(quote.outputAmount) : '---'}
                        </div>
                    </div>

                    {quote && (
                        <div className="bg-white/5 rounded-lg p-3 space-y-2 text-sm">
                            <div className="flex justify-between text-white/60">
                                <span>Price Impact</span>
                                <span className={quote.priceImpact > 1 ? 'text-yellow-400' : 'text-white'}>
                                    {quote.priceImpact.toFixed(2)}%
                                </span>
                            </div>
                            <div className="flex justify-between text-white/60">
                                <span>Route</span>
                                <span className="text-white">{quote.route.join(' → ') || 'Direct'}</span>
                            </div>
                            <div className="flex justify-between text-white/60">
                                <span>Fee</span>
                                <span>{formatFee(quote.estimatedFee)}</span>
                            </div>
                        </div>
                    )}

                    <div className="flex gap-2">
                        <button
                            onClick={handleGetQuote}
                            disabled={isQuoting || !swapAmount}
                            className="flex-1 py-3 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-medium text-white transition-colors"
                        >
                            {isQuoting ? 'Getting Quote...' : 'Get Quote'}
                        </button>
                        <button
                            onClick={handleExecuteSwap}
                            disabled={isSwapping || !quote || !swapAmount}
                            className="flex-1 py-3 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-medium text-white transition-colors"
                        >
                            {isSwapping ? 'Swapping...' : 'Execute Swap'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

export default OceanVaultPanel
