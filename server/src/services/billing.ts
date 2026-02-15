import { FastifyInstance } from 'fastify'
import Stripe from 'stripe'
import { SubscriptionsRepository, TrialsRepository } from '../db/repo.js'
import {
  getUserInfoFromJwt,
  SupabaseJwtPayload,
} from '../auth/supabaseJwt.js'

type Options = {
  requireAuth: boolean
}

function getEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env var: ${name}`)
  return v
}

function renderDeepLinkHtml(targetUrl: string): string {
  const escaped = targetUrl.replace(/"/g, '&quot;')
  return `<!doctype html><html><head><meta charset="utf-8"><title>Returning to Ito…</title></head><body>
  <p>If you are not redirected automatically, click below:</p>
  <a href="${escaped}">Return to Ito</a>
  <script>window.location = "${escaped}";</script>
  </body></html>`
}

export const registerBillingRoutes = async (
  fastify: FastifyInstance,
  options: Options,
) => {
  const { requireAuth } = options

  const FREE_MODE = process.env.FREE_MODE === 'true'

  const STRIPE_SECRET_KEY = FREE_MODE ? null : getEnv('STRIPE_SECRET_KEY')
  const STRIPE_PRICE_ID = FREE_MODE ? null : getEnv('STRIPE_PRICE_ID')
  const STRIPE_PUBLIC_BASE_URL = FREE_MODE ? null : getEnv('STRIPE_PUBLIC_BASE_URL')

  const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null

  fastify.post('/billing/checkout', async (request, reply) => {
    console.log('billing/checkout', request.body)
    try {
      if (FREE_MODE || !stripe) {
        reply.send({ success: true, message: 'Free mode enabled - no payment required' })
        return
      }

      const user = (request as any).user as SupabaseJwtPayload | undefined
      const userSub = (requireAuth && user?.sub) || undefined
      if (!userSub) {
        reply.code(401).send({ success: false, error: 'Unauthorized' })
        return
      }

      const userInfo = user ? getUserInfoFromJwt(user) : { email: '', name: '' }
      const userEmail = userInfo.email || undefined

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        client_reference_id: userSub,
        customer_email: userEmail || undefined,
        metadata: { user_sub: userSub },
        subscription_data: {
          metadata: { user_sub: userSub },
        },
        line_items: [
          {
            price: STRIPE_PRICE_ID!,
            quantity: 1,
          },
        ],
        success_url: `${STRIPE_PUBLIC_BASE_URL!}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${STRIPE_PUBLIC_BASE_URL!}/billing/cancel`,
      })

      reply.send({ success: true, url: session.url })
    } catch (error: any) {
      fastify.log.error({ err: error }, 'Stripe checkout creation failed')
      reply
        .code(500)
        .send({ success: false, error: error?.message || 'Server error' })
    }
  })

  fastify.post('/billing/confirm', async (request, reply) => {
    try {
      if (FREE_MODE || !stripe) {
        reply.send({ success: true, pro_status: 'active_pro' })
        return
      }

      const user = (request as any).user as SupabaseJwtPayload | undefined
      const userSub = (requireAuth && user?.sub) || undefined
      if (!userSub) {
        reply.code(401).send({ success: false, error: 'Unauthorized' })
        return
      }

      const body = request.body as { session_id?: string }
      const sessionId = body?.session_id
      if (!sessionId) {
        reply.code(400).send({ success: false, error: 'Missing session_id' })
        return
      }

      const session = await stripe.checkout.sessions.retrieve(sessionId)
      if (session.mode !== 'subscription') {
        reply.code(400).send({ success: false, error: 'Invalid session mode' })
        return
      }

      const isCompleted = session.status === 'complete'
      const isPaid = session.payment_status === 'paid'
      if (!isCompleted && !isPaid) {
        reply.code(400).send({ success: false, error: 'Session not completed' })
        return
      }

      if (!session.customer || typeof session.customer !== 'string') {
        throw new Error('Session missing customer ID')
      }

      if (!session.subscription || typeof session.subscription !== 'string') {
        throw new Error('Session missing subscription ID')
      }

      const stripeCustomerId = session.customer
      const stripeSubscriptionId = session.subscription

      const userInfo = user ? getUserInfoFromJwt(user) : { email: '', name: '' }
      if (userInfo.name && stripeCustomerId) {
        await stripe.customers.update(stripeCustomerId, {
          name: userInfo.name,
          metadata: { user_sub: userSub },
        })
      }

      const existingSub = await SubscriptionsRepository.getByUserId(userSub)
      if (existingSub?.stripe_subscription_id === stripeSubscriptionId) {
        reply.send({
          success: true,
          pro_status: 'active_pro',
          subscriptionStartAt: existingSub.subscription_start_at,
        })
        return
      }

      const subscription =
        await stripe.subscriptions.retrieve(stripeSubscriptionId)

      if (!subscription.items.data[0]?.current_period_start) {
        throw new Error('Subscription missing current_period_start')
      }

      const subscriptionStartAt = new Date(
        subscription.items.data[0].current_period_start * 1000,
      )

      const upserted = await SubscriptionsRepository.upsertActive(
        userSub,
        stripeCustomerId,
        stripeSubscriptionId,
        subscriptionStartAt,
        null,
      )

      await TrialsRepository.completeTrial(userSub)

      reply.send({
        success: true,
        pro_status: 'active_pro',
        subscriptionStartAt: upserted.subscription_start_at,
      })
    } catch (error: any) {
      fastify.log.error({ err: error }, 'Stripe confirm failed')
      reply
        .code(500)
        .send({ success: false, error: error?.message || 'Server error' })
    }
  })

  fastify.post('/billing/cancel', async (request, reply) => {
    try {
      if (FREE_MODE || !stripe) {
        reply.send({ success: true, message: 'Free mode enabled - nothing to cancel' })
        return
      }

      const userSub = (requireAuth && (request as any).user?.sub) || undefined
      if (!userSub) {
        reply.code(401).send({ success: false, error: 'Unauthorized' })
        return
      }

      const sub = await SubscriptionsRepository.getByUserId(userSub)
      if (sub && sub.stripe_subscription_id) {
        const updatedSubscription = await stripe.subscriptions.update(
          sub.stripe_subscription_id,
          { cancel_at_period_end: true },
        )

        const periodEnd = updatedSubscription.cancel_at
          ? new Date(updatedSubscription.cancel_at * 1000)
          : null

        await SubscriptionsRepository.updateSubscriptionEndAt(
          userSub,
          periodEnd,
        )

        reply.send({ success: true })
        return
      }

      const trial = await TrialsRepository.getByUserId(userSub)
      if (trial && !trial.has_completed_trial) {
        if (trial.stripe_subscription_id) {
          await stripe.subscriptions.cancel(trial.stripe_subscription_id)
        }

        await TrialsRepository.completeTrial(userSub)

        reply.send({ success: true })
        return
      }

      reply
        .code(400)
        .send({ success: false, error: 'No active subscription found' })
    } catch (error: any) {
      fastify.log.error(
        { err: error },
        'Stripe subscription cancellation failed',
      )
      reply
        .code(500)
        .send({ success: false, error: error?.message || 'Server error' })
    }
  })

  fastify.get('/billing/status', async (request, reply) => {
    try {
      if (FREE_MODE) {
        reply.send({
          success: true,
          pro_status: 'active_pro',
          trial: {
            trialDays: 0,
            trialStartAt: null,
            daysLeft: 0,
            isTrialActive: false,
            hasCompletedTrial: true,
          },
        })
        return
      }

      const userSub = (requireAuth && (request as any).user?.sub) || undefined
      if (!userSub) {
        reply.code(401).send({ success: false, error: 'Unauthorized' })
        return
      }

      const sub = await SubscriptionsRepository.getByUserId(userSub)
      const trial = await TrialsRepository.getByUserId(userSub)

      const trialStartAt = trial?.trial_start_at
      const trialEndAt = trial?.trial_end_at
      const trialDays =
        trialStartAt && trialEndAt
          ? Math.ceil(
              (trialEndAt.getTime() - trialStartAt.getTime()) /
                (24 * 60 * 60 * 1000),
            )
          : 14

      if (sub) {
        const trialBlock = {
          trialDays,
          trialStartAt: trialStartAt ? trialStartAt.toISOString() : null,
          daysLeft: 0,
          isTrialActive: false,
          hasCompletedTrial: true,
        }

        const subscriptionEndAt = sub.subscription_end_at
        const isScheduledForCancellation =
          subscriptionEndAt !== null && subscriptionEndAt.getTime() > Date.now()

        reply.send({
          success: true,
          pro_status: 'active_pro',
          subscriptionStartAt: sub.subscription_start_at,
          subscriptionEndAt: subscriptionEndAt
            ? subscriptionEndAt.toISOString()
            : null,
          isScheduledForCancellation,
          trial: trialBlock,
        })
        return
      }

      const now = Date.now()
      const isTrialActive =
        !!trialEndAt &&
        now < trialEndAt.getTime() &&
        !trial?.has_completed_trial

      let daysLeft = 0
      if (trialEndAt && isTrialActive) {
        const remainingMs = trialEndAt.getTime() - now
        daysLeft = Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)))
      }

      const trialBlock = {
        trialDays,
        trialStartAt: trialStartAt ? trialStartAt.toISOString() : null,
        daysLeft,
        isTrialActive,
        hasCompletedTrial: !!trial?.has_completed_trial,
      }

      if (isTrialActive) {
        reply.send({
          success: true,
          pro_status: 'free_trial',
          trial: trialBlock,
        })
        return
      }

      reply.send({ success: true, pro_status: 'none', trial: trialBlock })
    } catch (error: any) {
      reply
        .code(500)
        .send({ success: false, error: error?.message || 'Server error' })
    }
  })

  fastify.post('/billing/reactivate', async (request, reply) => {
    try {
      if (FREE_MODE || !stripe) {
        reply.send({ success: true, message: 'Free mode enabled' })
        return
      }

      const userSub = (requireAuth && (request as any).user?.sub) || undefined
      if (!userSub) {
        reply.code(401).send({ success: false, error: 'Unauthorized' })
        return
      }

      const sub = await SubscriptionsRepository.getByUserId(userSub)
      if (!sub || !sub.stripe_subscription_id) {
        reply
          .code(400)
          .send({ success: false, error: 'No active subscription found' })
        return
      }

      await stripe.subscriptions.update(sub.stripe_subscription_id, {
        cancel_at_period_end: false,
      })

      await SubscriptionsRepository.updateSubscriptionEndAt(userSub, null)

      reply.send({ success: true })
    } catch (error: any) {
      fastify.log.error(
        { err: error },
        'Stripe subscription reactivation failed',
      )
      reply
        .code(500)
        .send({ success: false, error: error?.message || 'Server error' })
    }
  })
}

export const registerBillingPublicRoutes = async (fastify: FastifyInstance) => {
  const APP_PROTOCOL = getEnv('APP_PROTOCOL')

  fastify.get('/billing/success', async (request, reply) => {
    const { session_id } = request.query as { session_id?: string }
    const deeplink = `${APP_PROTOCOL}://billing/success${
      session_id ? `?session_id=${encodeURIComponent(session_id)}` : ''
    }`
    reply.type('text/html').send(renderDeepLinkHtml(deeplink))
  })

  fastify.get('/billing/cancel', async (_request, reply) => {
    const deeplink = `${APP_PROTOCOL}://billing/cancel`
    reply.type('text/html').send(renderDeepLinkHtml(deeplink))
  })
}

export default registerBillingRoutes
