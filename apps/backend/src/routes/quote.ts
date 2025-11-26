import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import Joi from 'joi'

const quoteRequestSchema = Joi.object({
  inputToken: Joi.string().required().length(44), // Solana public key length
  outputToken: Joi.string().required().length(44),
  inputAmount: Joi.string().required().pattern(/^\d+$/),
  slippageBps: Joi.number().integer().min(1).max(1000).default(50), // 0.01% to 10%
  privacyMode: Joi.boolean().default(true),
})

export async function quoteRoutes(fastify: FastifyInstance) {
  // Get quote endpoint
  fastify.post('/', {
    schema: {
      body: {
        type: 'object',
        required: ['inputToken', 'outputToken', 'inputAmount'],
        properties: {
          inputToken: { type: 'string', minLength: 44, maxLength: 44 },
          outputToken: { type: 'string', minLength: 44, maxLength: 44 },
          inputAmount: { type: 'string', pattern: '^[0-9]+$' },
          slippageBps: { type: 'integer', minimum: 1, maximum: 1000, default: 50 },
          privacyMode: { type: 'boolean', default: true }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            inputAmount: { type: 'string' },
            outputAmount: { type: 'string' },
            priceImpact: { type: 'string' },
            fee: {
              type: 'object',
              properties: {
                baseBps: { type: 'number' },
                privacyBps: { type: 'number' },
                totalBps: { type: 'number' },
              },
            },
            routes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  output: { type: 'string' },
                  steps: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        pool: { type: 'string' },
                        input: { type: 'string' },
                        output: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
            timestamp: { type: 'number' },
            validFor: { type: 'number' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { inputToken, outputToken, inputAmount, slippageBps, privacyMode } = request.body as any

      // Validate token pair
      const quoteService = fastify.quoteService as any
      const isValidPair = await quoteService.validateTokenPair(inputToken, outputToken)
      if (!isValidPair) {
        reply.code(400).send({
          error: 'Invalid token pair',
          message: 'One or both tokens are not supported',
        })
        return
      }

      // Get quote
      const quote = await quoteService.getQuote({
        inputToken,
        outputToken,
        inputAmount,
        slippageBps,
        privacyMode,
      })

      reply.send(quote)
    } catch (error) {
      fastify.log.error('Quote request failed', error)
      reply.code(500).send({
        error: 'Quote request failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  // Get supported tokens
  fastify.get('/tokens', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const quoteService = fastify.quoteService as any
      const tokens = await quoteService.getSupportedTokens()

      reply.send({
        tokens,
      })
    } catch (error) {
      fastify.log.error('Failed to get supported tokens', error)
      reply.code(500).send({
        error: 'Failed to get supported tokens',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  // Validate token pair
  fastify.post('/validate', {
    schema: {
      body: {
        type: 'object',
        required: ['inputToken', 'outputToken'],
        properties: {
          inputToken: { type: 'string', minLength: 44, maxLength: 44 },
          outputToken: { type: 'string', minLength: 44, maxLength: 44 }
        }
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { inputToken, outputToken } = request.body as any

      const quoteService = fastify.quoteService as any
      const isValid = await quoteService.validateTokenPair(inputToken, outputToken)

      reply.send({
        valid: isValid,
        inputToken,
        outputToken,
      })
    } catch (error) {
      fastify.log.error('Token validation failed', error)
      reply.code(500).send({
        error: 'Token validation failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  // Invalidate quote cache
  fastify.post('/invalidate', {
    schema: {
      body: {
        type: 'object',
        required: ['inputToken', 'outputToken'],
        properties: {
          inputToken: { type: 'string', minLength: 44, maxLength: 44 },
          outputToken: { type: 'string', minLength: 44, maxLength: 44 }
        }
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { inputToken, outputToken } = request.body as any

      const quoteService = fastify.quoteService as any
      await quoteService.invalidateQuoteCache(inputToken, outputToken)

      reply.send({
        message: 'Quote cache invalidated',
        inputToken,
        outputToken,
      })
    } catch (error) {
      fastify.log.error('Quote cache invalidation failed', error)
      reply.code(500).send({
        error: 'Quote cache invalidation failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })
}