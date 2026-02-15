import type { FastifyInstance } from 'fastify'
import Stripe from 'stripe'
import { TrialsRepository, SubscriptionsRepository } from '../db/repo.js'
import {
  getUserInfoFromJwt,
  SupabaseJwtPayload,
} from '../auth/supabaseJwt.js'

const TRIAL_DAYS = 14
const MS_PER_DAY = 24 * 60 * 60 * 1000

async function getOrCreateStripeCustomer(
  stripe: Stripe,
  userSub: string,
  email?: string,
  name?: string,
): Promise<string> {
  const existingSub = await SubscriptionsRepository.getByUserId(userSub)
  if (existingSub?.stripe_customer_id) {
    if (name || email) {
      await stripe.customers.update(existingSub.stripe_customer_id, {
        email: email,
        name: name,
        metadata: { user_sub: userSub },
      })
    }
    return existingSub.stripe_customer_id
  }

  const existingCustomers = await stripe.customers.search({
    query: `metadata['user_sub']:'${userSub}'`,
    limit: 1,
  })

  if (existingCustomers.data.length > 0) {
    const customerId = existingCustomers.data[0].id
    console.log('Updating existing customer with name/email', name, email)
    if (name || email) {
      await stripe.customers.update(customerId, {
        email: email ?? undefined,
        name: name ?? undefined,
        metadata: { user_sub: userSub },
      })
    }
    return customerId
  }

  const customer = await stripe.customers.create({
    email: email,
    name: name,
    metadata: { user_sub: userSub },
  })

  return customer.id
}

function computeStatusFromStripe(subscription: Stripe.Subscription): {
  success: boolean
  trialDays: number
  trialStartAt: string | null
  daysLeft: number
  isTrialActive: boolean
  hasCompletedTrial: boolean
} {
  const now = Date.now()
  const trialEnd = subscription.trial_end
    ? new Date(subscription.trial_end * 1000)
    : null
  const trialStart = trialEnd
    ? new Date(trialEnd.getTime() - TRIAL_DAYS * MS_PER_DAY)
    : null

  let daysLeft = 0
  let isTrialActive = false

  if (trialEnd && subscription.status === 'trialing') {
    const elapsedMs = now - trialStart!.getTime()
    const elapsedDays = Math.floor(elapsedMs / MS_PER_DAY)
    daysLeft = Math.max(0, TRIAL_DAYS - elapsedDays)
    isTrialActive = daysLeft > 0
  }

  const hasCompletedTrial =
    subscription.status === 'active' ||
    subscription.status === 'past_due' ||
    subscription.status === 'canceled'

  return {
    success: true,
    trialDays: TRIAL_DAYS,
    trialStartAt: trialStart ? trialStart.toISOString() : null,
    daysLeft,
    isTrialActive,
    hasCompletedTrial,
  }
}

function computeStatus(row: {
  trial_start_at: Date | null
  has_completed_trial: boolean
}) {
  const now = Date.now()
  const trialStartAt = row.trial_start_at ? new Date(row.trial_start_at) : null
  let daysLeft = 0
  if (trialStartAt && !row.has_completed_trial) {
    const elapsedDays = Math.floor((now - trialStartAt.getTime()) / MS_PER_DAY)
    daysLeft = Math.max(0, TRIAL_DAYS - elapsedDays)
  }
  const isTrialActive =
    !!trialStartAt && !row.has_completed_trial && daysLeft > 0

  return {
    success: true,
    trialDays: TRIAL_DAYS,
    trialStartAt: trialStartAt ? trialStartAt.toISOString() : null,
    daysLeft,
    isTrialActive,
    hasCompletedTrial: row.has_completed_trial,
  }
}

export const registerTrialRoutes = async (
  fastify: FastifyInstance,
  options: { requireAuth: boolean },
) => {
  const { requireAuth } = options

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY
  const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID

  if (!STRIPE_SECRET_KEY || !STRIPE_PRICE_ID) {
    fastify.log.warn(
      'Stripe credentials not configured; trial routes will fail',
    )
  }

  const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null

  fastify.post('/trial/start', async (request, reply) => {
    console.log('trial/start', request.body)
    try {
      const user = (request as any).user as SupabaseJwtPayload | undefined
      const userSub = (requireAuth && user?.sub) || undefined
      if (!userSub) {
        reply.code(401).send({ success: false, error: 'Unauthorized' })
        return
      }

      if (!stripe) {
        reply.code(500).send({ success: false, error: 'Stripe not configured' })
        return
      }

      const existingTrial = await TrialsRepository.getByUserId(userSub)
      if (existingTrial?.stripe_subscription_id) {
        const subscription = await stripe.subscriptions.retrieve(
          existingTrial.stripe_subscription_id,
        )
        const status = computeStatusFromStripe(subscription)

        const trialEndAt = subscription.trial_end
          ? new Date(subscription.trial_end * 1000)
          : null
        await TrialsRepository.upsertFromStripeSubscription(
          userSub,
          subscription.id,
          status.trialStartAt ? new Date(status.trialStartAt) : null,
          status.hasCompletedTrial,
          trialEndAt,
        )

        reply.send(status)
        return
      }

      if (existingTrial?.has_completed_trial) {
        reply.send(computeStatus(existingTrial))
        return
      }

      const userInfo = user ? getUserInfoFromJwt(user) : { email: '', name: '' }
      const userEmail = userInfo.email || undefined
      const userName = userInfo.name || undefined

      const stripeCustomerId = await getOrCreateStripeCustomer(
        stripe,
        userSub,
        userEmail,
        userName,
      )

      const existingSubscriptions = await stripe.subscriptions.list({
        customer: stripeCustomerId,
        status: 'all',
        limit: 100,
      })

      const hasActiveTrialSubscription = existingSubscriptions.data.some(
        sub =>
          (sub.status === 'trialing' || sub.status === 'active') &&
          sub.items.data.some(item => item.price.id === STRIPE_PRICE_ID),
      )

      if (hasActiveTrialSubscription) {
        const activeSubscription = existingSubscriptions.data.find(
          sub =>
            (sub.status === 'trialing' || sub.status === 'active') &&
            sub.items.data.some(item => item.price.id === STRIPE_PRICE_ID),
        )

        if (activeSubscription) {
          const status = computeStatusFromStripe(activeSubscription)
          const trialEndAt = activeSubscription.trial_end
            ? new Date(activeSubscription.trial_end * 1000)
            : null
          await TrialsRepository.upsertFromStripeSubscription(
            userSub,
            activeSubscription.id,
            status.trialStartAt ? new Date(status.trialStartAt) : null,
            status.hasCompletedTrial,
            trialEndAt,
          )
          reply.send(status)
          return
        }
      }

      const subscription = await stripe.subscriptions.create({
        customer: stripeCustomerId,
        items: [{ price: STRIPE_PRICE_ID }],
        trial_period_days: TRIAL_DAYS,
        trial_settings: {
          end_behavior: {
            missing_payment_method: 'cancel',
          },
        },
        metadata: { user_sub: userSub },
      })

      const trialStartAt = subscription.trial_start
        ? new Date(subscription.trial_start * 1000)
        : null
      const trialEndAt = subscription.trial_end
        ? new Date(subscription.trial_end * 1000)
        : null
      const row = await TrialsRepository.upsertFromStripeSubscription(
        userSub,
        subscription.id,
        trialStartAt,
        false,
        trialEndAt,
      )

      const status = computeStatusFromStripe(subscription)
      reply.send(status)
    } catch (error: any) {
      fastify.log.error({ err: error }, 'Trial start failed')
      reply
        .code(500)
        .send({ success: false, error: error?.message || 'Server error' })
    }
  })

  fastify.post('/trial/complete', async (request, reply) => {
    try {
      const userSub = (requireAuth && (request as any).user?.sub) || undefined
      if (!userSub) {
        reply.code(401).send({ success: false, error: 'Unauthorized' })
        return
      }
      const row = await TrialsRepository.completeTrial(userSub)
      reply.send(computeStatus(row))
    } catch (error: any) {
      reply
        .code(500)
        .send({ success: false, error: error?.message || 'Server error' })
    }
  })
}
