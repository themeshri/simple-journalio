
  Detailed Task List: Simplified Solana Wallet Transaction Viewer

  Phase 1: Project Setup

  ✅ 1. Initialize Next.js project
    - Create new Next.js 14+ app with TypeScript and Tailwind CSS
    - Install dependencies: axios for API calls
    - Set up basic folder structure: /app, /components, /lib, /types
  ✅ 2. Environment configuration
    - Create .env.local file with HELIUS_API_KEY
    - Create config utility (/lib/config.ts) to securely load API keys server-side

  Phase 2: Type Definitions

  3. Define TypeScript interfaces (/types/index.ts)
    - DeFiActivity: Core transaction interface with fields:
        - signature, timestamp, type, status, fee
      - fromSymbol, toSymbol, fromAmount, toAmount
      - fromValueUSD, toValueUSD
      - tradedCoin, tradedCoinMint
      - transactionType: 'sell' | 'sell all' | 'first buy' | 'buy more'
      - isBuy, isSell, priceConfidence, priceSource
    - TradeGroup: For trade cycle calculations (buys, sells, P/L)
    - TokenTradeCycles: Grouped trades by token

  Additional Phase: Helius API Integration Details

  Phase 2.5: Understanding Helius API

  20. Choose the correct Helius endpoint

  There are two main approaches:

  Option A: Enhanced Transactions API (RECOMMENDED)
  - Endpoint: https://api.helius.xyz/v0/addresses/{wallet}/transactions?api-key={key}
  - Query params:
    - type=SWAP - Filter for swap transactions only
    - limit=100 - Max results per request (default: 100)
    - before={signature} - Pagination cursor (get transactions before this signature)

  Option B: Parsed Transactions API
  - Endpoint: https://api.helius.xyz/v1/parsed-transactions?api-key={key}
  - Requires POST with transaction signatures
  - More detailed but requires two-step process

  RECOMMENDED: Use Enhanced Transactions API with type=SWAP filter

  ---
  21. Implement Helius transaction fetching with pagination

  // Fetch all swap transactions for a wallet
  async function fetchAllSwapTransactions(walletAddress: string): Promise<any[]> {
    const allTransactions: any[] = []
    let beforeSignature: string | undefined = undefined
    let hasMore = true

    while (hasMore) {
      const url = `https://api.helius.xyz/v0/addresses/${walletAddress}/transactions?api-key=${HELIUS_API_KEY}&type=SWAP&lim
  it=100${beforeSignature ? `&before=${beforeSignature}` : ''}`

      const response = await axios.get(url, { timeout: 30000 })
      const transactions = response.data

      if (!transactions || transactions.length === 0) {
        hasMore = false
        break
      }

      allTransactions.push(...transactions)

      // Use last transaction signature as cursor for next page
      beforeSignature = transactions[transactions.length - 1].signature

      // Optional: Stop after certain number to avoid rate limits
      if (allTransactions.length >= 1000) {
        break
      }
    }

    return allTransactions
  }

  ---
  22. Understand Helius Enhanced Transaction Structure

  Key fields in Helius Enhanced Transaction response:
  interface HeliusTransaction {
    signature: string                    // Transaction signature (unique ID)
    timestamp: number                    // Unix timestamp
    type: string                         // "SWAP", "TRANSFER", etc.
    source: string                       // "JUPITER", "RAYDIUM", "ORCA", etc.
    fee: number                          // Transaction fee in lamports
    feePayer: string                     // Who paid the fee
    nativeTransfers: Array<{             // SOL transfers
      fromUserAccount: string
      toUserAccount: string
      amount: number                     // In lamports
    }>
    tokenTransfers: Array<{              // SPL token transfers
      fromUserAccount: string
      toUserAccount: string
      fromTokenAccount: string
      toTokenAccount: string
      tokenAmount: number
      mint: string                       // Token mint address
      tokenStandard: string              // "Fungible"
    }>
    accountData: Array<{                 // Account information
      account: string
      nativeBalanceChange: number
      tokenBalanceChanges: Array<{
        mint: string
        rawTokenAmount: {
          tokenAmount: string
          decimals: number
        }
        userAccount: string
      }>
    }>
  }

  ---
  23. Process Helius tokenTransfers to identify swaps

  Critical Logic:
  - A swap has 2+ token transfers
  - Transfers OUT of wallet = tokens sold (FROM tokens)
  - Transfers INTO wallet = tokens bought (TO tokens)

  function processHeliusTransaction(tx: HeliusTransaction, walletAddress: string) {
    const tokenTransfers = tx.tokenTransfers || []

    // Find what went OUT (sold/spent)
    const outgoingTransfers = tokenTransfers.filter(
      t => t.fromUserAccount === walletAddress
    )

    // Find what came IN (bought/received)
    const incomingTransfers = tokenTransfers.filter(
      t => t.toUserAccount === walletAddress
    )

    // For swaps, we typically have 1 outgoing + 1 incoming
    const fromToken = outgoingTransfers[0]
    const toToken = incomingTransfers[0]

    return {
      signature: tx.signature,
      timestamp: tx.timestamp,
      source: tx.source, // Jupiter, Raydium, etc.
      fromMint: fromToken?.mint,
      fromAmount: fromToken?.tokenAmount,
      toMint: toToken?.mint,
      toAmount: toToken?.tokenAmount,
    }
  }

  ---
  24. Handle token decimals correctly

  CRITICAL: Token amounts from Helius are in raw units, need division by decimals

  // Get token metadata to find decimals
  async function getTokenMetadata(mintAddress: string) {
    // Check cache first
    if (ESSENTIAL_TOKENS[mintAddress]) {
      return ESSENTIAL_TOKENS[mintAddress]
    }

    // Option 1: Jupiter Token List API
    const response = await axios.get(
      `https://token.jup.ag/strict`
    )
    const token = response.data.find((t: any) => t.address === mintAddress)

    if (token) {
      return {
        symbol: token.symbol,
        decimals: token.decimals,
        name: token.name
      }
    }

    // Option 2: Fallback to Helius metadata
    // Option 3: Default to 9 decimals (common for Solana tokens)
    return { symbol: 'UNKNOWN', decimals: 9 }
  }

  // Convert raw amount to decimal
  function formatTokenAmount(rawAmount: number, decimals: number): number {
    return rawAmount / Math.pow(10, decimals)
  }

  ---
  25. Handle accountData for accurate balance changes

  Better approach: Use accountData[].tokenBalanceChanges as it's more reliable

  function extractSwapFromAccountData(tx: HeliusTransaction, walletAddress: string) {
    // Find the wallet's account data
    const walletAccount = tx.accountData?.find(
      acc => acc.account === walletAddress
    )

    if (!walletAccount?.tokenBalanceChanges) return null

    const balanceChanges = walletAccount.tokenBalanceChanges

    // Negative change = tokens spent/sold (FROM)
    const fromTokens = balanceChanges.filter(
      bc => parseFloat(bc.rawTokenAmount.tokenAmount) < 0
    )

    // Positive change = tokens received/bought (TO)
    const toTokens = balanceChanges.filter(
      bc => parseFloat(bc.rawTokenAmount.tokenAmount) > 0
    )

    return {
      from: fromTokens[0],
      to: toTokens[0]
    }
  }

  ---
  26. Determine transaction classification (BUY vs SELL)

  function classifySwap(fromMint: string, toMint: string, fromSymbol: string, toSymbol: string) {
    const stablecoins = ['USDC', 'USDT', 'DAI', 'BUSD']
    const baseCurrencies = ['SOL', ...stablecoins]

    const fromIsBase = baseCurrencies.includes(fromSymbol) ||
                       fromMint === 'So11111111111111111111111111111111111111112' // Wrapped SOL
    const toIsBase = baseCurrencies.includes(toSymbol) ||
                     toMint === 'So11111111111111111111111111111111111111112'

    // Base → Token = BUY
    if (fromIsBase && !toIsBase) {
      return {
        type: 'BUY',
        tradedCoin: toSymbol,
        tradedCoinMint: toMint,
        isBuy: true,
        isSell: false
      }
    }

    // Token → Base = SELL
    if (!fromIsBase && toIsBase) {
      return {
        type: 'SELL',
        tradedCoin: fromSymbol,
        tradedCoinMint: fromMint,
        isBuy: false,
        isSell: true
      }
    }

    // Token → Token = BOTH (create 2 records)
    if (!fromIsBase && !toIsBase) {
      return {
        type: 'SWAP',
        needsSplitting: true,
        sellRecord: {
          type: 'SELL',
          tradedCoin: fromSymbol,
          tradedCoinMint: fromMint,
          isSell: true
        },
        buyRecord: {
          type: 'BUY',
          tradedCoin: toSymbol,
          tradedCoinMint: toMint,
          isBuy: true
        }
      }
    }

    // Base → Base (e.g., SOL → USDC) = treat as SELL of SOL
    return {
      type: 'SELL',
      tradedCoin: fromSymbol,
      tradedCoinMint: fromMint,
      isSell: true
    }
  }

  ---
  27. Implement transaction splitting for Token-to-Token swaps

  function splitTokenToTokenSwap(tx: HeliusTransaction, swapData: any): DeFiActivity[] {
    const activities: DeFiActivity[] = []

    // Create SELL record for the FROM token
    activities.push({
      signature: tx.signature,
      timestamp: tx.timestamp,
      type: 'SWAP',
      status: 'Success',
      fee: tx.fee,
      fromSymbol: swapData.fromSymbol,
      fromAmount: swapData.fromAmount,
      fromValueUSD: swapData.fromValueUSD,
      toSymbol: 'USD', // Conceptual value
      toAmount: swapData.fromValueUSD,
      toValueUSD: swapData.fromValueUSD,
      transactionType: 'sell',
      tradedCoin: swapData.fromSymbol,
      tradedCoinMint: swapData.fromMint,
      isSell: true,
      isBuy: false,
      source: tx.source
    })

    // Create BUY record for the TO token
    activities.push({
      signature: tx.signature, // SAME signature!
      timestamp: tx.timestamp,
      type: 'SWAP',
      status: 'Success',
      fee: 0, // Don't double-count fee
      fromSymbol: 'USD', // Conceptual value
      fromAmount: swapData.toValueUSD,
      fromValueUSD: swapData.toValueUSD,
      toSymbol: swapData.toSymbol,
      toAmount: swapData.toAmount,
      toValueUSD: swapData.toValueUSD,
      transactionType: 'first buy', // Will be reclassified later
      tradedCoin: swapData.toSymbol,
      tradedCoinMint: swapData.toMint,
      isSell: false,
      isBuy: true,
      source: tx.source
    })

    return activities
  }

  ---
  28. Fetch USD prices from Jupiter API

  async function fetchTokenPrice(mintAddress: string): Promise<number> {
    // Stablecoins are always $1
    const stablecoinMints = [
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
    ]

    if (stablecoinMints.includes(mintAddress)) {
      return 1.0
    }

    try {
      // Jupiter Price API v2
      const response = await axios.get(
        `https://api.jup.ag/price/v2?ids=${mintAddress}`,
        { timeout: 10000 }
      )

      const priceData = response.data.data[mintAddress]

      if (priceData?.price) {
        return priceData.price
      }

      return 0 // Price not available
    } catch (error) {
      console.error(`Failed to fetch price for ${mintAddress}:`, error)
      return 0
    }
  }

  // Batch fetch prices for efficiency
  async function fetchBatchPrices(mintAddresses: string[]): Promise<Map<string, number>> {
    const priceMap = new Map<string, number>()

    // Handle stablecoins first
    const stablecoinMints = [
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
    ]

    mintAddresses.forEach(mint => {
      if (stablecoinMints.includes(mint)) {
        priceMap.set(mint, 1.0)
      }
    })

    // Fetch non-stablecoin prices in batch
    const nonStablecoins = mintAddresses.filter(m => !stablecoinMints.includes(m))

    if (nonStablecoins.length > 0) {
      const ids = nonStablecoins.join(',')
      const response = await axios.get(
        `https://api.jup.ag/price/v2?ids=${ids}`,
        { timeout: 15000 }
      )

      nonStablecoins.forEach(mint => {
        const priceData = response.data.data[mint]
        priceMap.set(mint, priceData?.price || 0)
      })
    }

    return priceMap
  }

  ---
  29. Complete processing pipeline

  async function processAllTransactions(walletAddress: string): Promise<DeFiActivity[]> {
    // Step 1: Fetch all swap transactions
    const rawTransactions = await fetchAllSwapTransactions(walletAddress)

    // Step 2: Collect all unique token mints
    const uniqueMints = new Set<string>()
    rawTransactions.forEach(tx => {
      tx.tokenTransfers?.forEach((transfer: any) => {
        uniqueMints.add(transfer.mint)
      })
    })

    // Step 3: Fetch metadata for all tokens
    const tokenMetadata = new Map()
    for (const mint of uniqueMints) {
      const metadata = await getTokenMetadata(mint)
      tokenMetadata.set(mint, metadata)
    }

    // Step 4: Fetch current prices for all tokens
    const prices = await fetchBatchPrices(Array.from(uniqueMints))

    // Step 5: Process each transaction
    const activities: DeFiActivity[] = []

    for (const tx of rawTransactions) {
      const swapData = extractSwapFromAccountData(tx, walletAddress)
      if (!swapData) continue

      const fromMeta = tokenMetadata.get(swapData.from.mint)
      const toMeta = tokenMetadata.get(swapData.to.mint)

      const fromAmount = formatTokenAmount(
        Math.abs(parseFloat(swapData.from.rawTokenAmount.tokenAmount)),
        swapData.from.rawTokenAmount.decimals
      )
      const toAmount = formatTokenAmount(
        parseFloat(swapData.to.rawTokenAmount.tokenAmount),
        swapData.to.rawTokenAmount.decimals
      )

      const fromPrice = prices.get(swapData.from.mint) || 0
      const toPrice = prices.get(swapData.to.mint) || 0

      const classification = classifySwap(
        swapData.from.mint,
        swapData.to.mint,
        fromMeta.symbol,
        toMeta.symbol
      )

      // Handle token-to-token splitting if needed
      if (classification.needsSplitting) {
        const splitActivities = splitTokenToTokenSwap(tx, {
          fromSymbol: fromMeta.symbol,
          fromMint: swapData.from.mint,
          fromAmount,
          fromValueUSD: fromAmount * fromPrice,
          toSymbol: toMeta.symbol,
          toMint: swapData.to.mint,
          toAmount,
          toValueUSD: toAmount * toPrice
        })
        activities.push(...splitActivities)
      } else {
        // Single activity record
        activities.push({
          signature: tx.signature,
          timestamp: tx.timestamp,
          type: 'SWAP',
          status: 'Success',
          fee: tx.fee,
          fromSymbol: fromMeta.symbol,
          fromAmount,
          fromValueUSD: fromAmount * fromPrice,
          toSymbol: toMeta.symbol,
          toAmount,
          toValueUSD: toAmount * toPrice,
          source: tx.source,
          ...classification
        })
      }
    }

    // Step 6: Sort by timestamp (newest first)
    activities.sort((a, b) => b.timestamp - a.timestamp)

    return activities
  }

  ---
  Updated Task List - Insert After Task 3:

  Task 4: Helius API Implementation
  - Implement fetchAllSwapTransactions() with pagination using before cursor
  - Use Enhanced Transactions API with type=SWAP filter
  - Handle rate limits (150 requests/min for free tier)
  - Implement timeout and retry logic

  Task 5: Transaction Parsing
  - Extract swap data from tokenTransfers or accountData.tokenBalanceChanges
  - Identify incoming vs outgoing token transfers
  - Handle edge cases: failed transactions, multi-token swaps

  Task 6: Token Metadata Resolution
  - Build essential tokens cache (SOL, USDC, USDT, etc.)
  - Fetch metadata from Jupiter Token List API for unknown tokens
  - Cache metadata to avoid repeated API calls
  - Handle missing tokens gracefully with fallback symbols

  Task 7: Price Fetching
  - Implement batch price fetching from Jupiter Price API v2
  - Hardcode stablecoin prices to $1.00
  - Handle tokens with no available price (show 0 or N/A)
  - Add price confidence scoring based on source

  Task 8: Transaction Classification
  - Implement classifySwap() to determine BUY/SELL/SWAP type
  - Detect token-to-token swaps that need splitting
  - Apply stablecoin and base currency logic correctly
  - Mark each transaction with isBuy/isSell flags

  Task 9: Transaction Splitting
  - Implement splitTokenToTokenSwap() for Token→Token swaps
  - Create separate SELL and BUY records with same signature
  - Ensure fee is only counted once
  - Preserve all metadata on both records


  Phase 3: Transaction Fetching API

  4. Create Helius API route (/app/api/helius-swaps/route.ts)
    - Accept wallet address as query parameter
    - Fetch swap transactions from Helius Enhanced Transactions API
    - Implement token classification:
        - Define stablecoins: ['USDC', 'USDT']
      - Define base currencies: ['SOL', ...stablecoins]
      - Classify buys: base currency → token
      - Classify sells: token → base currency
  5. Token metadata resolution
    - Create essential tokens cache with common tokens (SOL, USDC, USDT)
    - Implement fallback: Jupiter API for unknown tokens
    - Handle token decimals for amount formatting
  6. Transaction classification logic
    - Implement classifyTransaction() function:
        - 'first buy': First purchase of a token
      - 'buy more': Additional purchase of existing token
      - 'sell': Partial or full sell
      - 'sell all': Complete position exit (optional detection)
  7. Transaction splitting for token-to-token swaps
    - When swapping Token A → Token B:
        - Create SELL record for Token A
      - Create BUY record for Token B
      - Both share same transaction signature
  8. Price fetching
    - Implement current price fetching from Helius or Birdeye
    - For stablecoins: hardcode $1.00 value
  9. Return formatted transaction data
    - Transform Helius response into DeFiActivity[] array
    - Calculate USD values for all transactions
    - Sort by timestamp (newest first)
    - Return JSON response with metadata (total count, source)

  Phase 4: Frontend Components

  10. Create main page (/app/page.tsx)
    - State management:
        - walletAddress: Input field value
      - activities: Array of fetched transactions
      - loading: Fetch status
      - error: Error messages
      - viewMode: 'table' | 'summary'
    - Wallet address input with validation
    - "Fetch Transactions" button
    - View toggle (Table/Summary)
    - Conditional rendering based on viewMode
  11. Build TransactionTable component (/components/TransactionTable.tsx)
    - Table columns:
        - Signature (link to Solscan)
      - Time (formatted relative time)
      - Coin (badge with buy/sell color)
      - From/To symbols and amounts
      - USD values with price confidence indicator
      - Platform/Source (Jupiter, Raydium, etc.)
      - Transaction type (buy/sell badge)
    - Color coding: Green for buys, Red for sells
    - Responsive design with Tailwind CSS
  12. Build TradeSummary component (/components/TradeSummary.tsx)
    - Trade cycle calculation:
        - Group transactions by tradedCoinMint
      - Track running balance (buys add, sells subtract)
      - Complete cycle when balance returns to 0
    - Display for each trade cycle:
        - Token name and trade number
      - Total buys: count, amount, value, avg price
      - Total sells: count, amount, value, avg price
      - Current/final balance
      - P/L calculation: totalSellValue - (avgBuyPrice × totalSellAmount)
      - Duration: time between first buy and last sell
      - Status: "Active" (open position) or "Completed" (closed)
      - Price confidence warnings for low-quality historical prices
    - Sort trades by start date (newest first)
    - Visual cards with color-coded profit/loss
  13. Create utility functions (/lib/utils)
    - formatTime(): Timestamp → "2h ago" or "Jan 15, 2025"
    - formatAmount(): Token amount with proper decimals
    - formatValue(): USD value with $ and commas
    - formatDuration(): Seconds → "2d 4h 30m" (only non-zero units)
    - calculateTradeCycles(): Group transactions into trade cycles

  Phase 5: Error Handling & Polish

  15. Add comprehensive error handling
    - API errors: Display user-friendly messages
    - Invalid wallet address: Validate format before fetch
    - Network errors: Show retry button
    - Rate limiting: Display cooldown message
    - Empty states: "No transactions found" message
  16. Add loading states
    - Spinner during fetch
    - Skeleton loaders for table rows
    - Disable buttons during loading
  17. Responsive design
    - Mobile-friendly table (horizontal scroll or card layout)
    - Breakpoints for different screen sizes
    - Touch-friendly UI elements

  Phase 6: Testing & Validation

  18. Test with real wallet addresses
    - Test wallet: 4NuB8ZFSjEVWE1nJTJ5RBCRmw9VHUE2g8Q5vFza4L8wm
    - Verify transaction classification accuracy
    - Verify P/L calculations
    - Test edge cases: no transactions, token-to-token swaps
  19. Validate transaction fetching logic
    - Confirm correct identification of stablecoins vs meme coins
    - Verify USDUC is NOT treated as stablecoin
    - Check transaction type classification accuracy
    - Verify price fetching from Jupiter API

  ---
  Key Focus Areas for Transaction Fetching Logic

  Critical Logic to Get Right:

  1. Stablecoin detection: Only USDC, USDT
  2. Buy vs Sell classification: Base currency direction determines type
  3. Transaction splitting: Token→Token creates 2 records with same signature
  4. Price fetching: Jupiter API for current prices, historical for P/L
  5. Trade cycle completion: Balance tracking to identify complete cycles
  6. Classification accuracy: First buy vs buy more vs sell vs sell all

  Optional Enhancements (Future):

  - Add database support (SQLite) for caching
  - Implement incremental sync (fetch only new transactions)
  - Add filtering by token, date range, transaction type
  - Export data to CSV
  - Add historical price caching
  - Implement journal notes functionality
