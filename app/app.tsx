import { HashRouter, Routes, Route } from 'react-router-dom'
import appIcon from '@/resources/build/icon.png'
import HomeKit from '@/app/components/home/HomeKit'
import WelcomeKit from '@/app/components/welcome/WelcomeKit'
import Pill from '@/app/components/pill/Pill'
import {
  STEP_NAMES,
  STEP_NAMES_ARRAY,
  useOnboardingStore,
} from '@/app/store/useOnboardingStore'
import { useAuth } from '@/app/components/auth/useAuth'
import { WindowContextProvider } from '@/lib/window'
import { SupabaseProvider } from '@/app/components/auth/SupabaseProvider'
import { useDeviceChangeListener } from './hooks/useDeviceChangeListener'
import { verifyStoredMicrophone } from './media/microphone'
import { useEffect } from 'react'

const MainApp = () => {
  const { onboardingCompleted, onboardingStep } = useOnboardingStore()
  const { isAuthenticated } = useAuth()
  useDeviceChangeListener()

  console.log('[DEBUG][MainApp] State:', {
    isAuthenticated,
    onboardingCompleted,
    onboardingStep,
  })

  useEffect(() => {
    verifyStoredMicrophone()
  }, [])

  const onboardingSetupCompleted =
    onboardingStep >= STEP_NAMES_ARRAY.indexOf(STEP_NAMES.TRY_IT_OUT)

  const shouldEnableShortcutGlobally =
    onboardingCompleted || onboardingSetupCompleted

  // If authenticated and onboarding completed, show main app
  if (isAuthenticated && onboardingCompleted) {
    console.log('[DEBUG][MainApp] Rendering: HomeKit')
    window.api?.send(
      'electron-store-set',
      'settings.isShortcutGloballyEnabled',
      shouldEnableShortcutGlobally,
    )
    return <HomeKit />
  }

  // If authenticated but onboarding not completed, continue onboarding
  console.log('[DEBUG][MainApp] Rendering: WelcomeKit')
  window.api?.send(
    'electron-store-set',
    'settings.isShortcutGloballyEnabled',
    shouldEnableShortcutGlobally,
  )
  return <WelcomeKit />
}

export default function App() {
  return (
    <SupabaseProvider>
      <HashRouter>
        <Routes>
          {/* Route for the pill window */}
          <Route
            path="/pill"
            element={
              <>
                <Pill />
              </>
            }
          />

          {/* Default route for the main application window */}
          <Route
            path="/"
            element={
              <>
                <WindowContextProvider
                  titlebar={{ title: 'Ito', icon: appIcon }}
                >
                  <MainApp />
                </WindowContextProvider>
              </>
            }
          />
        </Routes>
      </HashRouter>
    </SupabaseProvider>
  )
}
