import React, { createContext, useContext, useEffect, useState } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase, AUTH_DISABLED } from './supabaseClient'

interface SupabaseContextType {
  session: Session | null
  user: User | null
  isLoading: boolean
}

const SupabaseContext = createContext<SupabaseContextType>({
  session: null,
  user: null,
  isLoading: true,
})

export const useSupabaseContext = () => useContext(SupabaseContext)

interface SupabaseProviderProps {
  children: React.ReactNode
}

export const SupabaseProvider: React.FC<SupabaseProviderProps> = ({
  children,
}) => {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(!AUTH_DISABLED && !!supabase)

  console.log('[DEBUG][SupabaseProvider] Init:', {
    AUTH_DISABLED,
    hasSupabase: !!supabase,
    isLoading: !AUTH_DISABLED && !!supabase,
  })

  useEffect(() => {
    if (AUTH_DISABLED || !supabase) {
      setIsLoading(false)
      return
    }

    let mounted = true

    const initSession = async () => {
      try {
        const { data: { session }, error } = await supabase!.auth.getSession()
        if (error) {
          console.error('Error getting session:', error)
        }
        if (mounted) {
          setSession(session)
          setUser(session?.user ?? null)
          setIsLoading(false)
        }
      } catch (error) {
        console.error('Failed to get session:', error)
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    initSession()

    const {
      data: { subscription },
    } = supabase!.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setSession(session)
        setUser(session?.user ?? null)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  return (
    <SupabaseContext.Provider value={{ session, user, isLoading }}>
      {children}
    </SupabaseContext.Provider>
  )
}

export default SupabaseProvider
