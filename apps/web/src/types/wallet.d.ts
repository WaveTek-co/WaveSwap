declare global {
  interface Window {
    // Solana
    solana?: {
      isPhantom?: boolean
      isConnected?: () => boolean
      connect: (options?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString(): string } }>
      disconnect: () => Promise<void>
      getBalance: () => Promise<number>
      signTransaction: (transaction: any) => Promise<any>
      signAllTransactions: (transactions: any[]) => Promise<any[]>
    }

    // Solana Backpack
    backpack?: {
      isBackpack?: boolean
      isConnected?: () => boolean
      connect: (options?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString(): string } }>
      disconnect: () => Promise<void>
      getBalance: () => Promise<number>
      signTransaction: (transaction: any) => Promise<any>
      signAllTransactions: (transactions: any[]) => Promise<any[]>
    }

      // Solflare
    solflare?: {
      isSolflare?: boolean
      isConnected?: () => boolean
      connect: (options?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString(): string } }>
      disconnect: () => Promise<void>
      getBalance: () => Promise<number>
      signTransaction: (transaction: any) => Promise<any>
      signAllTransactions: (transactions: any[]) => Promise<any[]>
    }

    // NEAR
    near?: {
      isSignedIn: () => boolean
      requestSignIn: (options: {
        contractId: string
        methodNames?: string[]
        successUrl?: string
        failureUrl?: string
      }) => Promise<any>
      signOut: () => Promise<void>
      getAccountId: () => string
      getBalance: () => Promise<string>
    }

    myNearWallet?: {
      isSignedIn: () => boolean
      requestSignIn: (options: {
        contractId: string
        methodNames?: string[]
        successUrl?: string
        failureUrl?: string
      }) => Promise<any>
      signOut: () => Promise<void>
      getAccountId: () => string
      getBalance: () => Promise<string>
    }

    // Zcash
    zecwallet?: {
      isInstalled: boolean
      getAddresses: () => Promise<string[]>
      getBalance: () => Promise<string>
      sendTransaction: (tx: any) => Promise<string>
    }

    zashi?: {
      isInstalled: boolean
      getAddresses: () => Promise<string[]>
      getBalance: () => Promise<string>
      sendTransaction: (tx: any) => Promise<string>
    }

    // Starknet
    starknet?: {
      isPreauthorized: () => boolean
      enable: () => Promise<any>
      isConnected: () => boolean
      account: {
        address: string
        getBalance: () => Promise<string>
      }
      signMessage: (message: any) => Promise<any>
      signTransaction: (transaction: any) => Promise<any>
    }

    argentX?: {
      isPreauthorized: () => boolean
      enable: () => Promise<any>
      isConnected: () => boolean
      account: {
        address: string
        getBalance: () => Promise<string>
      }
      signMessage: (message: any) => Promise<any>
      signTransaction: (transaction: any) => Promise<any>
    }
  }
}

export {}