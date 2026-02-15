import { fastify } from 'fastify'
import { fastifyConnectPlugin } from '@connectrpc/connect-fastify'
import { createContextValues } from '@connectrpc/connect'
import itoServiceRoutes from './services/ito/itoService.js'
import timingServiceRoutes from './services/ito/timingService.js'
import { kUser } from './auth/userContext.js'
import { errorInterceptor } from './services/errorInterceptor.js'
import { loggingInterceptor } from './services/loggingInterceptor.js'
import { createValidationInterceptor } from './services/validationInterceptor.js'
import { renderCallbackPage } from './utils/renderCallback.js'
import 'dotenv/config'
import { registerLoggingRoutes } from './services/logging.js'
import { IpLinkRepository } from './db/repo.js'
import { registerTrialRoutes } from './services/trial.js'
import {
  registerBillingRoutes,
  registerBillingPublicRoutes,
} from './services/billing.js'
import { registerStripeWebhook } from './services/stripeWebhook.js'
import cors from '@fastify/cors'
import { verifySupabaseToken, SupabaseJwtPayload } from './auth/supabaseJwt.js'

export const startServer = async () => {
  const connectRpcServer = fastify({
    logger: process.env.SHOW_ALL_REQUEST_LOGS === 'true',
    trustProxy: true,
  })

  await connectRpcServer.register(cors, { origin: '*' })

  const REQUIRE_AUTH = process.env.REQUIRE_AUTH === 'true'
  const CLIENT_LOG_GROUP_NAME = process.env.CLIENT_LOG_GROUP_NAME

  connectRpcServer.decorateRequest('user', null)

  if (REQUIRE_AUTH) {
    connectRpcServer.addHook('onRequest', async (request, reply) => {
      if (
        request.url === '/' ||
        request.url === '/health' ||
        request.url.startsWith('/stripe/webhook') ||
        request.url.startsWith('/billing/success') ||
        request.url.startsWith('/billing/cancel') ||
        request.url.startsWith('/link/')
      ) {
        return
      }

      const authHeader = request.headers.authorization
      if (!authHeader?.startsWith('Bearer ')) {
        reply.code(401).send({ error: 'Missing authorization header' })
        return
      }

      try {
        const token = authHeader.slice(7)
        const payload = await verifySupabaseToken(token)
        ;(request as any).user = payload
      } catch (error) {
        reply.code(401).send({ error: 'Invalid token' })
      }
    })
  }

  registerBillingPublicRoutes(connectRpcServer)

  registerStripeWebhook(connectRpcServer)

  connectRpcServer.post('/link/register-ip', async (request, reply) => {
    try {
      const { websiteDistinctId } = (request.body ?? {}) as {
        websiteDistinctId?: string
      }
      if (!websiteDistinctId || typeof websiteDistinctId !== 'string') {
        reply.code(400).send({ error: 'Missing websiteDistinctId' })
        return
      }

      const ip = (request.ip || '').trim()
      const salt = process.env.IP_SALT || 'ito-default-salt'
      const hash = await import('crypto').then(({ createHash }) =>
        createHash('sha256').update(`${salt}:${ip}`).digest('hex'),
      )

      await IpLinkRepository.registerCandidate(hash, websiteDistinctId)
      reply.send({ success: true })
    } catch (error: any) {
      connectRpcServer.log.error({ error }, 'Failed to register IP candidate')
      reply.code(500).send({ error: 'Internal error' })
    }
  })

  connectRpcServer.get('/link/resolve', async (request, reply) => {
    try {
      const ip = (request.ip || '').trim()
      const salt = process.env.IP_SALT || 'ito-default-salt'
      const hash = await import('crypto').then(({ createHash }) =>
        createHash('sha256').update(`${salt}:${ip}`).digest('hex'),
      )
      const websiteDistinctId = await IpLinkRepository.consumeLatestForIp(hash)
      reply.send({ websiteDistinctId: websiteDistinctId ?? null })
      return
    } catch (e) {
      connectRpcServer.log.debug({ error: e }, 'IP correlation failed')
      reply.send({ websiteDistinctId: null })
      return
    }
  })

  connectRpcServer.get('/me', async (request, reply) => {
    const user = (request as any).user as SupabaseJwtPayload
    if (!user) {
      return reply.code(401).send({ error: 'Not authenticated' })
    }
    return {
      sub: user.sub,
      email: user.email,
      name: user.user_metadata?.full_name || user.user_metadata?.name || user.email,
    }
  })

  await connectRpcServer.register(async function (fastify) {
    if (REQUIRE_AUTH) {
      console.log('Authentication is ENABLED.')
    } else {
      console.log('Authentication is DISABLED.')
    }

    if (process.env.SHOW_CLIENT_LOGS === 'true') {
      console.log('SHOW_CLIENT_LOGS is ENABLED.')
    } else {
      console.log('SHOW_CLIENT_LOGS is DISABLED.')
    }

    if (process.env.SHOW_ALL_REQUEST_LOGS === 'true') {
      console.log('SHOW_ALL_REQUEST_LOGS is ENABLED.')
    } else {
      console.log('SHOW_ALL_REQUEST_LOGS is DISABLED.')
    }

    await fastify.register(fastifyConnectPlugin, {
      routes: router => {
        itoServiceRoutes(router)
        timingServiceRoutes(router)
      },
      interceptors: [
        loggingInterceptor,
        createValidationInterceptor(),
        errorInterceptor,
      ],
      contextValues: request => {
        const user = (request as any).user
        if (REQUIRE_AUTH && user && user.sub) {
          return createContextValues().set(kUser, user)
        }
        return createContextValues()
      },
    })

    await registerLoggingRoutes(fastify, {
      requireAuth: REQUIRE_AUTH,
      clientLogGroupName: CLIENT_LOG_GROUP_NAME,
      showClientLogs: process.env.SHOW_CLIENT_LOGS === 'true',
    })

    await registerTrialRoutes(fastify, { requireAuth: REQUIRE_AUTH })
    await registerBillingRoutes(fastify, { requireAuth: REQUIRE_AUTH })
  })

  connectRpcServer.setErrorHandler((error, _, reply) => {
    connectRpcServer.log.error(error)
    reply.status(500).send({
      error: 'Internal Server Error',
      message: error.message,
    })
  })

  connectRpcServer.get('/', async (_, reply) => {
    reply.type('text/plain')
    reply.send('Welcome to the Ito Connect RPC server!')
  })

  connectRpcServer.get('/health', async (_, reply) => {
    reply.send({ status: 'ok' })
  })

  connectRpcServer.get('/callback', async (request, reply) => {
    const { code, state } = request.query as {
      code: string
      state: string
    }

    const html = renderCallbackPage({ code, state })

    reply.type('text/html')
    reply.send(html)
  })

  const rpcPort = Number(process.env.PORT) || 3000
  const host = '0.0.0.0'

  try {
    await Promise.all([connectRpcServer.listen({ port: rpcPort, host })])
    console.log(`🚀 Connect RPC server listening on ${host}:${rpcPort}`)
  } catch (err) {
    connectRpcServer.log.error(err)
    process.exit(1)
  }
}
