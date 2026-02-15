import { FastifyRequest } from 'fastify'
import * as jose from 'jose'

const JWKS_URL = process.env.SUPABASE_JWKS_URL || 'https://pjwojnrjldmruadlwzts.supabase.co/auth/v1/.well-known/jwks.json'

let jwks: jose.JWTVerifyGetKey | null = null

async function getJwks() {
  if (!jwks) {
    jwks = jose.createRemoteJWKSet(new URL(JWKS_URL))
  }
  return jwks
}

export interface SupabaseJwtPayload {
  sub: string
  email?: string
  user_metadata?: {
    full_name?: string
    name?: string
  }
  aud: string
  exp: number
  iat: number
}

export async function verifySupabaseToken(token: string): Promise<SupabaseJwtPayload> {
  const jwksClient = await getJwks()
  const { payload } = await jose.jwtVerify(token, jwksClient, {
    algorithms: ['ES256'],
  })
  return payload as SupabaseJwtPayload
}

export async function getUserFromRequest(request: FastifyRequest): Promise<SupabaseJwtPayload | null> {
  const authHeader = request.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }
  const token = authHeader.slice(7)
  try {
    return await verifySupabaseToken(token)
  } catch {
    return null
  }
}

export function getUserIdFromRequest(request: FastifyRequest & { user?: SupabaseJwtPayload }): string | null {
  return request.user?.sub || null
}

export function getUserInfoFromJwt(user: SupabaseJwtPayload): { email: string; name: string } {
  return {
    email: user.email || '',
    name: user.user_metadata?.full_name || user.user_metadata?.name || user.email || '',
  }
}
