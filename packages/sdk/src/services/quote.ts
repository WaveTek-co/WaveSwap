import { QuoteRequest, QuoteResponse } from '../types/quote'

export class QuoteService {
  private endpoint: string

  constructor(endpoint: string = 'https://quote-api.jup.ag/v6') {
    this.endpoint = endpoint
  }

  /**
   * Get a quote for token swap
   */
  async getQuote(request: QuoteRequest): Promise<QuoteResponse> {
    const params = new URLSearchParams()

    params.append('inputMint', request.inputMint)
    params.append('outputMint', request.outputMint)
    params.append('amount', request.amount.toString())

    if (request.slippageBps) {
      params.append('slippageBps', request.slippageBps.toString())
    }

    if (request.onlyDirectRoutes) {
      params.append('onlyDirectRoutes', 'true')
    }

    if (request.asLegacyTransaction) {
      params.append('asLegacyTransaction', 'true')
    }

    const response = await fetch(`${this.endpoint}/quote?${params}`)

    if (!response.ok) {
      throw new Error(`Quote API error: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * Get multiple quotes for comparison
   */
  async getMultipleQuotes(
    inputMint: string,
    outputMint: string,
    amount: number
  ): Promise<QuoteResponse[]> {
    // For now, return single quote
    const quote = await this.getQuote({
      inputMint,
      outputMint,
      amount,
    })

    return [quote]
  }
}