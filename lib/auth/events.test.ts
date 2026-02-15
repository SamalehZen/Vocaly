import { describe, test, expect, mock, beforeEach } from 'bun:test'
import {
  shouldRefreshToken,
  isTokenExpired,
  handleLogin,
  handleLogout,
  ensureValidTokens,
} from './events'

const mockJwtDecode = mock()
mock.module('jwt-decode', () => ({
  jwtDecode: mockJwtDecode,
}))

const mockStore = {
  get: mock(),
  set: mock(),
  delete: mock(),
}
mock.module('../main/store', () => ({
  default: mockStore,
}))

const mockGrpcClient = {
  setAuthToken: mock(),
}
mock.module('../clients/grpcClient', () => ({
  grpcClient: mockGrpcClient,
}))

const mockSyncService = {
  start: mock(),
  stop: mock(),
}
mock.module('../main/syncService', () => ({
  syncService: mockSyncService,
}))

const mockMainWindow = {
  isDestroyed: mock(() => false),
  webContents: {
    send: mock(),
  },
}
mock.module('../main/app', () => ({
  mainWindow: mockMainWindow,
}))

describe('Auth Events', () => {
  beforeEach(() => {
    mockStore.get.mockReset()
    mockStore.set.mockReset()
    mockStore.delete.mockReset()
    mockGrpcClient.setAuthToken.mockReset()
    mockSyncService.start.mockReset()
    mockSyncService.stop.mockReset()
    mockMainWindow.webContents.send.mockReset()
    mockJwtDecode.mockReset()
  })

  describe('shouldRefreshToken', () => {
    test('should return true when token is about to expire (within 5 minutes)', () => {
      const fourMinutesFromNow = Date.now() + 4 * 60 * 1000
      expect(shouldRefreshToken(fourMinutesFromNow)).toBe(true)
    })

    test('should return false when token has more than 5 minutes left', () => {
      const tenMinutesFromNow = Date.now() + 10 * 60 * 1000
      expect(shouldRefreshToken(tenMinutesFromNow)).toBe(false)
    })

    test('should return true when token has already expired', () => {
      const oneMinuteAgo = Date.now() - 60 * 1000
      expect(shouldRefreshToken(oneMinuteAgo)).toBe(true)
    })

    test('should return true when token expires exactly at 5 minute threshold', () => {
      const fiveMinutesFromNow = Date.now() + 5 * 60 * 1000
      expect(shouldRefreshToken(fiveMinutesFromNow)).toBe(true)
    })
  })

  describe('isTokenExpired', () => {
    test('should return true for expired token', () => {
      const pastTime = Math.floor(Date.now() / 1000) - 3600
      mockJwtDecode.mockReturnValue({ exp: pastTime })
      expect(isTokenExpired('expired-token')).toBe(true)
    })

    test('should return false for valid token', () => {
      const futureTime = Math.floor(Date.now() / 1000) + 3600
      mockJwtDecode.mockReturnValue({ exp: futureTime })
      expect(isTokenExpired('valid-token')).toBe(false)
    })

    test('should return true for malformed token', () => {
      mockJwtDecode.mockImplementation(() => {
        throw new Error('Invalid token')
      })
      expect(isTokenExpired('malformed-token')).toBe(true)
    })

    test('should return true if token has no exp claim', () => {
      mockJwtDecode.mockReturnValue({})
      expect(isTokenExpired('no-exp-token')).toBe(true)
    })
  })

  describe('handleLogin', () => {
    test('should store user profile and set auth token', () => {
      const profile = { id: 'user-123', email: 'test@example.com' }
      const idToken = 'id-token'
      const accessToken = 'access-token'

      handleLogin(profile, idToken, accessToken)

      expect(mockStore.set).toHaveBeenCalledWith('user-profile', profile)
      expect(mockStore.set).toHaveBeenCalledWith('id-token', idToken)
      expect(mockStore.set).toHaveBeenCalledWith('access-token', accessToken)
      expect(mockGrpcClient.setAuthToken).toHaveBeenCalledWith(accessToken)
      expect(mockSyncService.start).toHaveBeenCalled()
    })

    test('should handle null tokens gracefully', () => {
      const profile = { id: 'user-123' }

      handleLogin(profile, null, null)

      expect(mockStore.set).toHaveBeenCalledWith('user-profile', profile)
      expect(mockGrpcClient.setAuthToken).not.toHaveBeenCalled()
      expect(mockSyncService.start).not.toHaveBeenCalled()
    })
  })

  describe('handleLogout', () => {
    test('should clear all auth data', () => {
      handleLogout()

      expect(mockStore.delete).toHaveBeenCalledWith('user-profile')
      expect(mockStore.delete).toHaveBeenCalledWith('id-token')
      expect(mockStore.delete).toHaveBeenCalledWith('access-token')
      expect(mockGrpcClient.setAuthToken).toHaveBeenCalledWith(null)
      expect(mockSyncService.stop).toHaveBeenCalled()
    })
  })

  describe('ensureValidTokens', () => {
    test('should return success when tokens exist and are not expired', async () => {
      const validTokens = {
        access_token: 'access-token',
        expires_at: Date.now() + 3600000,
      }

      mockStore.get.mockReturnValue({ tokens: validTokens })

      const result = await ensureValidTokens()

      expect(result.success).toBe(true)
      expect(result.tokens).toBe(validTokens)
    })

    test('should return error when no tokens exist', async () => {
      mockStore.get.mockReturnValue({ tokens: null })

      const result = await ensureValidTokens()

      expect(result.success).toBe(false)
      expect(result.error).toBe('No access token available')
    })

    test('should notify renderer when token needs refresh', async () => {
      const expiredTokens = {
        access_token: 'access-token',
        expires_at: Date.now() - 3600000,
      }

      mockStore.get.mockReturnValue({ tokens: expiredTokens })

      const result = await ensureValidTokens()

      expect(result.success).toBe(false)
      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
        'auth-token-expired',
      )
    })

    test('should handle missing expires_at gracefully', async () => {
      const tokensWithoutExpiry = {
        access_token: 'access-token',
      }

      mockStore.get.mockReturnValue({ tokens: tokensWithoutExpiry })

      const result = await ensureValidTokens()

      expect(result.success).toBe(true)
      expect(result.tokens).toBe(tokensWithoutExpiry)
    })
  })
})
