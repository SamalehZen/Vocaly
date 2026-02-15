import CreateAccountContent from './contents/CreateAccountContent'
import SignInContent from './contents/SignInContent'
import ReferralContent from './contents/ReferralContent'
import DataControlContent from './contents/DataControlContent'
import PermissionsContent from './contents/PermissionsContent'
import MicrophoneTestContent from './contents/MicrophoneTestContent'
import KeyboardTestContext from './contents/KeyboardTestContext'
import GoodToGoContent from './contents/GoodToGoContent'
import AnyAppContent from './contents/AnyAppContent'
import TryItOutContent from './contents/TryItOutContent'
import { useEffect } from 'react'
import './styles.css'
import { usePermissionsStore } from '../../store/usePermissionsStore'
import { useOnboardingStore } from '@/app/store/useOnboardingStore'
import { useAuthStore } from '@/app/store/useAuthStore'
import IntroducingIntelligentModeContent from './contents/IntroducingIntelligentModeContent'

export default function WelcomeKit() {
  const { onboardingStep, incrementOnboardingStep } = useOnboardingStore()
  const { isAuthenticated, user } = useAuthStore()

  console.log('[DEBUG][WelcomeKit] State:', {
    isAuthenticated,
    user: user?.id,
    onboardingStep,
  })

  const onboardingStepOrder = [
    CreateAccountContent,
    ReferralContent,
    DataControlContent,
    PermissionsContent,
    MicrophoneTestContent,
    KeyboardTestContext,
    GoodToGoContent,
    IntroducingIntelligentModeContent,
    AnyAppContent,
    TryItOutContent,
  ]

  const { setAccessibilityEnabled, setMicrophoneEnabled } =
    usePermissionsStore()

  useEffect(() => {
    window.api
      ?.invoke('check-accessibility-permission', false)
      .then((enabled: boolean) => {
        setAccessibilityEnabled(enabled)
      })
      .catch(() => {})

    window.api
      ?.invoke('check-microphone-permission', false)
      .then((enabled: boolean) => {
        setMicrophoneEnabled(enabled)
      })
      .catch(() => {})
  }, [setAccessibilityEnabled, setMicrophoneEnabled])

  useEffect(() => {
    if (isAuthenticated && onboardingStep === 0) {
      incrementOnboardingStep()
    }
  }, [isAuthenticated, onboardingStep, incrementOnboardingStep])

  if (!isAuthenticated) {
    if (user) {
      console.log('[DEBUG][WelcomeKit] Rendering: SignInContent (user exists but not authenticated)')
      return <SignInContent />
    } else {
      console.log('[DEBUG][WelcomeKit] Rendering: CreateAccountContent (no user)')
      return <CreateAccountContent />
    }
  }

  const CurrentComponent = onboardingStepOrder[onboardingStep]

  console.log('[DEBUG][WelcomeKit] CurrentComponent:', {
    onboardingStep,
    componentName: CurrentComponent?.name || 'undefined',
    totalSteps: onboardingStepOrder.length,
  })

  if (!CurrentComponent) {
    console.error('[DEBUG][WelcomeKit] ERROR: No component found for step', onboardingStep)
    return (
      <div className="w-full h-full bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground"></div>
      </div>
    )
  }

  console.log('[DEBUG][WelcomeKit] Rendering:', CurrentComponent.name)
  return (
    <div className="w-full h-full bg-background">
      <CurrentComponent />
    </div>
  )
}
