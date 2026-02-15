import { useEffect, useState, useCallback } from 'react'
import { useAppStylingStore } from '@/app/store/useAppStylingStore'
import { AppStylingRow } from './settings/AppStylingRow'
import { RegisterAppDialog } from './settings/RegisterAppDialog'
import { Button } from '@/app/components/ui/button'
import { Crosshair, Plus, Globe, AppWindow } from 'lucide-react'

export default function AppStylingContent() {
  const {
    appTargets,
    tones,
    isLoading,
    detectedContext,
    loadAppTargets,
    loadTones,
    detectCurrentApp,
    clearDetectedContext,
  } = useAppStylingStore()

  const [isDetecting, setIsDetecting] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    loadAppTargets()
    loadTones()
  }, [loadAppTargets, loadTones])

  useEffect(() => {
    if (detectedContext) {
      setDialogOpen(true)
    }
  }, [detectedContext])

  const handleDetectApp = useCallback(async () => {
    setStatus(null)
    setIsDetecting(true)

    try {
      const context = await detectCurrentApp()
      if (!context) {
        setStatus('No app detected — click on the target app when this window minimizes')
        setTimeout(() => setStatus(null), 5000)
      }
    } catch (error) {
      console.error('Failed to detect app:', error)
      setStatus('Error detecting app')
      setTimeout(() => setStatus(null), 3000)
    } finally {
      setIsDetecting(false)
    }
  }, [detectCurrentApp])

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open)
    if (!open) {
      clearDetectedContext()
    }
  }

  const sortedApps = Object.values(appTargets).sort((a, b) =>
    a.name.localeCompare(b.name),
  )
  const toneOptions = Object.values(tones).sort(
    (a, b) => a.sortOrder - b.sortOrder,
  )

  const appCount = sortedApps.filter(a => a.matchType === 'app').length
  const domainCount = sortedApps.filter(a => a.matchType === 'domain').length

  if (isLoading) {
    return (
      <div className="w-full max-w-2xl mx-auto px-6 py-12">
        <div className="flex items-center justify-center gap-2 text-slate-400">
          <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
          <span className="text-sm">Loading app targets...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-2xl mx-auto px-6">
      <div className="space-y-8">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">App Styling</h1>
          <p className="text-sm text-slate-500 mt-1">
            Assign a writing tone per app or website. Ito automatically adapts
            your transcription style based on where you're working.
          </p>
        </div>

        {status && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            <span>{status}</span>
          </div>
        )}

        <Button
          onClick={handleDetectApp}
          disabled={isDetecting}
          className="w-full h-12 gap-2 text-sm font-medium"
          variant={isDetecting ? 'secondary' : 'default'}
        >
          {isDetecting ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Click on your target app now...</span>
            </>
          ) : (
            <>
              <Plus className="w-4 h-4" />
              <span>Detect & Add App</span>
            </>
          )}
        </Button>

        {sortedApps.length > 0 && (
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <div className="flex items-center gap-1.5">
              <AppWindow className="w-3.5 h-3.5" />
              <span>
                {appCount} app{appCount !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" />
              <span>
                {domainCount} domain{domainCount !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        )}

        {sortedApps.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-10">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                <Crosshair className="w-6 h-6 text-slate-400" />
              </div>
              <h3 className="text-sm font-medium text-slate-700 mb-2">
                No apps registered yet
              </h3>
              <p className="text-sm text-slate-500 max-w-sm mb-6">
                Register an app or website to automatically apply a writing tone
                whenever you dictate in that context.
              </p>
              <ol className="text-sm text-slate-500 text-left space-y-2">
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-200 text-slate-600 text-xs flex items-center justify-center font-medium mt-0.5">
                    1
                  </span>
                  <span>Open the app or website you want to style</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-200 text-slate-600 text-xs flex items-center justify-center font-medium mt-0.5">
                    2
                  </span>
                  <span>
                    Click <strong>Detect & Add App</strong> above
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-200 text-slate-600 text-xs flex items-center justify-center font-medium mt-0.5">
                    3
                  </span>
                  <span>Click on your target app when this window minimizes</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-200 text-slate-600 text-xs flex items-center justify-center font-medium mt-0.5">
                    4
                  </span>
                  <span>Choose to match by app name or domain</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-200 text-slate-600 text-xs flex items-center justify-center font-medium mt-0.5">
                    5
                  </span>
                  <span>Select a writing tone for that target</span>
                </li>
              </ol>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100">
            {sortedApps.map(app => (
              <AppStylingRow key={app.id} app={app} tones={toneOptions} />
            ))}
          </div>
        )}
      </div>

      <RegisterAppDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        context={detectedContext}
      />
    </div>
  )
}
