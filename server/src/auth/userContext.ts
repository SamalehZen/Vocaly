import { createContextKey } from '@connectrpc/connect'

export interface AuthUser {
  sub?: string
  email?: string
  user_metadata?: {
    full_name?: string
    name?: string
  }
  [key: string]: any
}

export const kUser = createContextKey<AuthUser | undefined>(undefined, {
  description: 'Authenticated user from Supabase JWT',
})
