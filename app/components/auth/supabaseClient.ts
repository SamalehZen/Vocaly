import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const AUTH_DISABLED = !supabaseUrl || supabaseUrl === 'disabled'

let supabaseInstance: SupabaseClient | null = null

if (!AUTH_DISABLED && supabaseUrl && supabaseAnonKey) {
  try {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        storage: {
          getItem: (key) => {
            try {
              return localStorage.getItem(key)
            } catch {
              return null
            }
          },
          setItem: (key, value) => {
            try {
              localStorage.setItem(key, value)
            } catch {
              console.warn('localStorage not available')
            }
          },
          removeItem: (key) => {
            try {
              localStorage.removeItem(key)
            } catch {
              console.warn('localStorage not available')
            }
          },
        },
      },
    })
  } catch (error) {
    console.error('Failed to initialize Supabase client:', error)
    supabaseInstance = null
  }
}

export const supabase = supabaseInstance
