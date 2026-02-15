import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/app/components/ui/dialog'
import { Button } from '@/app/components/ui/button'
import {
  useAppStylingStore,
  type MatchType,
  type DetectedContext,
} from '@/app/store/useAppStylingStore'
import { Globe, AppWindow, Check } from 'lucide-react'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  context: DetectedContext | null
}

export function RegisterAppDialog({ open, onOpenChange, context }: Props) {
  const { registerApp, clearDetectedContext } = useAppStylingStore()
  const [selectedType, setSelectedType] = useState<MatchType>('app')
  const [isRegistering, setIsRegistering] = useState(false)

  useEffect(() => {
    if (context) {
      setSelectedType(context.suggestedMatchType)
    }
  }, [context])

  const handleRegister = async () => {
    if (!context) return

    setIsRegistering(true)
    try {
      const domain = selectedType === 'domain' ? context.browserDomain : null
      await registerApp(selectedType, context.appName, domain)
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to register:', error)
    } finally {
      setIsRegistering(false)
    }
  }

  const handleCancel = () => {
    clearDetectedContext()
    onOpenChange(false)
  }

  if (!context) return null

  const hasDomain = !!context.browserDomain

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Register Target</DialogTitle>
          <DialogDescription>
            Choose how to identify this target for styling
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          <button
            type="button"
            onClick={() => setSelectedType('app')}
            className={`w-full flex items-start gap-3 p-4 rounded-lg border-2 transition-all text-left ${
              selectedType === 'app'
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div
              className={`mt-0.5 p-2 rounded-lg ${
                selectedType === 'app' ? 'bg-blue-500 text-white' : 'bg-gray-100'
              }`}
            >
              <AppWindow className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium">Application</span>
                {selectedType === 'app' && (
                  <Check className="h-4 w-4 text-blue-500" />
                )}
              </div>
              <p className="text-sm text-gray-600 mt-1">
                Match any window from this app
              </p>
              <p className="text-sm font-medium text-gray-900 mt-2 truncate">
                {context.appName}
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => hasDomain && setSelectedType('domain')}
            disabled={!hasDomain}
            className={`w-full flex items-start gap-3 p-4 rounded-lg border-2 transition-all text-left ${
              !hasDomain
                ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                : selectedType === 'domain'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div
              className={`mt-0.5 p-2 rounded-lg ${
                selectedType === 'domain' && hasDomain
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100'
              }`}
            >
              <Globe className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium">Domain</span>
                {selectedType === 'domain' && hasDomain && (
                  <Check className="h-4 w-4 text-blue-500" />
                )}
              </div>
              <p className="text-sm text-gray-600 mt-1">
                {hasDomain
                  ? 'Match when browsing this website'
                  : 'Not available - no browser URL detected'}
              </p>
              {hasDomain && (
                <p className="text-sm font-medium text-gray-900 mt-2 truncate">
                  {context.browserDomain}
                </p>
              )}
            </div>
          </button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleRegister} disabled={isRegistering}>
            {isRegistering ? 'Registering...' : 'Register'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
