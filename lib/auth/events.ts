import store from '../main/store'
import { STORE_KEYS } from '../constants/store-keys'
import { grpcClient } from '../clients/grpcClient'
import { syncService } from '../main/syncService'
import { mainWindow } from '../main/app'
import { jwtDecode } from 'jwt-decode'

// Define TypeScript interfaces for JWT payloads
interface JwtPayload {
  exp?: number
  iat?: number
  sub?: string
  email?: string
  name?: string
  picture?: string
  iss?: string
  aud?: string | string[]
  [key: string]: any
}

// Utility function to check if a JWT token is expired
export const isTokenExpired = (token: string): boolean => {
  try {
    const payload = jwtDecode<JwtPayload>(token)

    // Check if token has expired
    const currentTime = Math.floor(Date.now() / 1000)
    return payload.exp ? payload.exp < currentTime : true
  } catch (error) {
    console.warn('Failed to decode token for expiration check:', error)
    // If we can't decode the token, assume it's expired to be safe
    return true
  }
}

// Check and validate stored tokens on startup
export const validateStoredTokens = async () => {
  try {
    const storedAuth = store.get(STORE_KEYS.AUTH)
    const storedTokens = storedAuth?.tokens
    const storeAccessToken = store.get(STORE_KEYS.ACCESS_TOKEN) as
      | string
      | undefined

    const hasTokens = storedTokens?.access_token || storeAccessToken

    if (hasTokens) {
      console.log('Checking stored access tokens for expiration...')

      const authStoreTokenExpired = storedTokens?.access_token
        ? isTokenExpired(storedTokens.access_token)
        : false
      const storeTokenExpired = storeAccessToken
        ? isTokenExpired(storeAccessToken)
        : false

      if (authStoreTokenExpired || storeTokenExpired) {
        console.log('Stored access tokens are expired, clearing auth data')

        if (storedAuth) {
          store.set(STORE_KEYS.AUTH, {
            ...storedAuth,
            tokens: null,
          })
        }

        grpcClient.setAuthToken(null)
        syncService.stop()

        store.delete(STORE_KEYS.USER_PROFILE)
        store.delete(STORE_KEYS.ID_TOKEN)
        store.delete(STORE_KEYS.ACCESS_TOKEN)

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('auth-token-expired')
        }

        return false
      } else {
        console.log('Stored access tokens are valid')

        if (storedTokens?.access_token && !storeAccessToken) {
          store.set(STORE_KEYS.ACCESS_TOKEN, storedTokens.access_token)
        } else if (storeAccessToken && !storedTokens?.access_token) {
          if (storedAuth) {
            store.set(STORE_KEYS.AUTH, {
              ...storedAuth,
              tokens: {
                ...storedAuth.tokens,
                access_token: storeAccessToken,
              },
            })
          }
        }

        return true
      }
    }

    return true
  } catch (error) {
    console.error('Error validating stored tokens:', error)
    return false
  }
}

export const handleLogin = (
  profile: any,
  idToken: string | null,
  accessToken: string | null,
) => {
  console.log('[DEBUG][auth/events] handleLogin called with profile:', profile)
  store.set(STORE_KEYS.USER_PROFILE, profile)
  console.log('[DEBUG][auth/events] USER_PROFILE set, verifying:', store.get(STORE_KEYS.USER_PROFILE))

  if (idToken) {
    store.set(STORE_KEYS.ID_TOKEN, idToken)
  }

  if (accessToken) {
    store.set(STORE_KEYS.ACCESS_TOKEN, accessToken)
    grpcClient.setAuthToken(accessToken)
    syncService.start()
  }

  // For self-hosted users, we don't start sync service since they don't have tokens
}

export const handleLogout = () => {
  console.log('[DEBUG][auth/events] handleLogout called')
  store.delete(STORE_KEYS.USER_PROFILE)
  store.delete(STORE_KEYS.ID_TOKEN)
  store.delete(STORE_KEYS.ACCESS_TOKEN)
  console.log('[DEBUG][auth/events] USER_PROFILE after delete:', store.get(STORE_KEYS.USER_PROFILE))
  grpcClient.setAuthToken(null)
  syncService.stop()
}

// Check if token needs refresh (5 minutes before expiry)
export const shouldRefreshToken = (expiresAt: number): boolean => {
  const fiveMinutes = 5 * 60 * 1000
  return Date.now() >= expiresAt - fiveMinutes
}

// Refresh tokens via the renderer's Supabase client over IPC
export const ensureValidTokens = async () => {
  const storedAuth = store.get(STORE_KEYS.AUTH)
  const tokens = storedAuth?.tokens
  const storedAccessToken = store.get(STORE_KEYS.ACCESS_TOKEN) as string | undefined

  const accessToken = tokens?.access_token || storedAccessToken
  if (!accessToken) {
    return { success: false, error: 'No access token available' }
  }

  const needsRefresh =
    isTokenExpired(accessToken) ||
    (tokens?.expires_at && shouldRefreshToken(tokens.expires_at))

  if (!needsRefresh) {
    return { success: true, tokens }
  }

  console.log('[ensureValidTokens] Token needs refresh, requesting via IPC')

  if (!mainWindow || mainWindow.isDestroyed()) {
    console.warn('[ensureValidTokens] No main window available for IPC refresh')
    return { success: false, error: 'No main window available for token refresh' }
  }

  const safeSupabaseUrl = JSON.stringify(import.meta.env.VITE_SUPABASE_URL || '')
  const safeAnonKey = JSON.stringify(import.meta.env.VITE_SUPABASE_ANON_KEY || '')

  try {
    const result = await mainWindow.webContents.executeJavaScript(
      `(async () => {
        try {
          const storageKeys = Object.keys(localStorage).filter(k => k.startsWith('sb-'));
          const authKey = storageKeys.find(k => k.endsWith('-auth-token'));
          if (!authKey) return { success: false, error: 'No Supabase session in storage' };
          const raw = localStorage.getItem(authKey);
          if (!raw) return { success: false, error: 'Empty Supabase session' };
          const parsed = JSON.parse(raw);
          const refreshToken = parsed?.refresh_token;
          if (!refreshToken) return { success: false, error: 'No refresh token' };

          const supabaseUrl = ${safeSupabaseUrl};
          const supabaseAnonKey = ${safeAnonKey};
          const resp = await fetch(supabaseUrl + '/auth/v1/token?grant_type=refresh_token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': supabaseAnonKey,
            },
            body: JSON.stringify({ refresh_token: refreshToken }),
          });
          if (!resp.ok) {
            const body = await resp.text();
            return { success: false, error: 'Refresh failed: ' + resp.status + ' ' + body };
          }
          const data = await resp.json();
          if (data.access_token) {
            const updated = { ...parsed, access_token: data.access_token, refresh_token: data.refresh_token || refreshToken, expires_at: data.expires_at, expires_in: data.expires_in };
            localStorage.setItem(authKey, JSON.stringify(updated));
            return { success: true, access_token: data.access_token, refresh_token: data.refresh_token || refreshToken, expires_at: data.expires_at };
          }
          return { success: false, error: 'No access_token in response' };
        } catch (e) {
          return { success: false, error: e.message || String(e) };
        }
      })()`,
    )

    if (result?.success && result.access_token) {
      console.log('[ensureValidTokens] Token refresh succeeded')

      const newTokens = {
        ...tokens,
        access_token: result.access_token,
        refresh_token: result.refresh_token,
        expires_at: result.expires_at,
      }

      if (storedAuth) {
        store.set(STORE_KEYS.AUTH, { ...storedAuth, tokens: newTokens })
      }
      store.set(STORE_KEYS.ACCESS_TOKEN, result.access_token)

      grpcClient.setAuthToken(result.access_token)

      return { success: true, tokens: newTokens }
    }

    console.warn('[ensureValidTokens] Refresh failed:', result?.error)
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('auth-token-expired')
    }
    return { success: false, error: result?.error || 'Token refresh failed' }
  } catch (err) {
    console.error('[ensureValidTokens] IPC refresh error:', err)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('auth-token-expired')
    }
    return { success: false, error: 'IPC refresh error' }
  }
}
