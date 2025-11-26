import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { request } from 'http'
import Joi from 'joi'

const swapRequestSchema = Joi.object({
  userAddress: Joi.string().required().length(44),
  inputToken: Joi.string().required().length(44),
  outputToken: Joi.string().required().length(44),
  inputAmount: Joi.string().required().pattern(/^\d+$/),
  slippageBps: Joi.number().integer().min(1).max(1000).default(50),
  privacyMode: Joi.boolean().default(true),
  signature: Joi.string().optional(), // For wallet signature verification
})

export async function swapRoutes(fastify: FastifyInstance) {
  // Submit swap
  fastify.post('/submit', {
    schema: {
      body: {
        type: 'object',
        required: ['userAddress', 'inputToken', 'outputToken', 'inputAmount'],
        properties: {
          userAddress: { type: 'string', minLength: 44, maxLength: 44 },
          inputToken: { type: 'string', minLength: 44, maxLength: 44 },
          outputToken: { type: 'string', minLength: 44, maxLength: 44 },
          inputAmount: { type: 'string', pattern: '^[0-9]+$' },
          slippageBps: { type: 'integer', minimum: 1, maximum: 1000, default: 50 },
          privacyMode: { type: 'boolean', default: true },
          signature: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            intentId: { type: 'string' },
            status: { type: 'string' },
            inputAmount: { type: 'string' },
            estimatedOutput: { type: 'string' },
            fee: { type: 'string' },
            privacyFee: { type: 'string' },
            estimatedTime: { type: 'number' },
            confirmation: {
              type: 'object',
              properties: {
                authToken: { type: 'string' },
                validUntil: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const swapData = request.body as any

      // Validate swap parameters
      if (swapData.inputToken === swapData.outputToken) {
        reply.code(400).send({
          error: 'Invalid swap',
          message: 'Input and output tokens cannot be the same',
        })
        return
      }

      const swapService = fastify.swapService as any
      const result = await swapService.submitSwap(swapData)

      reply.send(result)
    } catch (error) {
      fastify.log.error('Swap submission failed', error)
      reply.code(500).send({
        error: 'Swap submission failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  // Get swap status
  fastify.get('/:intentId/status', {
    schema: {
      params: {
        type: 'object',
        required: ['intentId'],
        properties: {
          intentId: { type: 'string', format: 'uuid' }
        }
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { intentId } = request.params as any

      const swapService = fastify.swapService as any
      const status = await swapService.getSwapStatus(intentId)

      if (!status) {
        reply.code(404).send({
          error: 'Swap not found',
          message: `No swap found with intent ID: ${intentId}`,
        })
        return
      }

      reply.send(status)
    } catch (error) {
      fastify.log.error('Failed to get swap status', error)
      reply.code(500).send({
        error: 'Failed to get swap status',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  // Cancel swap
  fastify.post('/:intentId/cancel', {
    schema: {
      params: {
        type: 'object',
        required: ['intentId'],
        properties: {
          intentId: { type: 'string', format: 'uuid' }
        }
      },
      body: {
        type: 'object',
        required: ['authToken'],
        properties: {
          authToken: { type: 'string' }
        }
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { intentId } = request.params as any
      const { authToken } = request.body as any

      // Validate auth token
      const db = fastify.db as any
      const session = await db.getSession(authToken)
      if (!session) {
        reply.code(401).send({
          error: 'Unauthorized',
          message: 'Invalid authentication token',
        })
        return
      }

      const swapService = fastify.swapService as any
      await swapService.cancelSwap(intentId)

      reply.send({
        message: 'Swap cancelled',
        intentId,
      })
    } catch (error) {
      fastify.log.error('Failed to cancel swap', error)
      reply.code(500).send({
        error: 'Failed to cancel swap',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  // Get user's swap history
  fastify.get('/history/:userAddress', {
    schema: {
      params: {
        type: 'object',
        required: ['userAddress'],
        properties: {
          userAddress: { type: 'string', minLength: 44, maxLength: 44 }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          offset: { type: 'integer', minimum: 0, default: 0 },
          status: { type: 'string' }
        }
      },
    },
  }, 
  
  // async (request)

  async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userAddress } = request.params as any
      const { limit, offset, status } = request.query as any

      const db = fastify.db as any
      let swaps = await db.getSwapsByUser(userAddress, limit, offset)

      // Filter by status if provided
      if (status) {
        swaps = swaps.filter(swap => swap.status === status)
      }

      reply.send({
        swaps: swaps.map(swap => ({
          intentId: swap.intentId,
          inputToken: swap.inputToken,
          outputToken: swap.outputToken,
          inputAmount: swap.inputAmount.toString(),
          outputAmount: swap.outputAmount?.toString(),
          status: swap.status,
          privacyMode: swap.privacyMode,
          feeBps: swap.feeBps,
          createdAt: swap.createdAt.toISOString(),
          settledAt: swap.settledAt?.toISOString(),
          error: swap.error,
        })),
        pagination: {
          limit,
          offset,
          total: swaps.length,
        },
      })
    } catch (error) {
      fastify.log.error('Failed to get swap history', error)
      reply.code(500).send({
        error: 'Failed to get swap history',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  // Get swap details
  fastify.get('/:intentId', {
    schema: {
      params: {
        type: 'object',
        required: ['intentId'],
        properties: {
          intentId: { type: 'string', format: 'uuid' }
        }
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { intentId } = request.params as any

      const swapService = fastify.swapService as any
      const swap = await swapService.getSwapByIntentId(intentId)

      if (!swap) {
        reply.code(404).send({
          error: 'Swap not found',
          message: `No swap found with intent ID: ${intentId}`,
        })
        return
      }

      // Get stages
      const db = fastify.db as any
      const swapWithStages = await db.getSwap(swap.id)

      reply.send({
        intentId: swap.intentId,
        userAddress: swap.userAddress,
        inputToken: swap.inputToken,
        outputToken: swap.outputToken,
        inputAmount: swap.inputAmount.toString(),
        outputAmount: swap.outputAmount?.toString(),
        status: swap.status,
        privacyMode: swap.privacyMode,
        feeBps: swap.feeBps,
        routeId: swap.routeId,
        slippageBps: swap.slippageBps,
        txHash: swap.txHash,
        createdAt: swap.createdAt.toISOString(),
        updatedAt: swap.updatedAt.toISOString(),
        settledAt: swap.settledAt?.toISOString(),
        stages: swapWithStages?.stages?.map((stage: any) => ({
          name: stage.name,
          status: stage.status,
          startedAt: stage.startedAt.toISOString(),
          completedAt: stage.completedAt?.toISOString(),
          error: stage.error,
        })) || [],
        error: swap.error,
      })
    } catch (error) {
      fastify.log.error('Failed to get swap details', error)
      reply.code(500).send({
        error: 'Failed to get swap details',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })
}