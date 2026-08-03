import { RefreshCw } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'

import { Button } from '@/components/ui/Button'

/**
 * Service worker lifecycle notice.
 *
 * `registerType: 'prompt'` means a new build never replaces the running one
 * mid-session — important while a member is part-way through entering a UPI
 * transaction reference. The member chooses when to reload.
 */
export function PwaUpdatePrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!offlineReady && !needRefresh) return null

  const dismiss = () => {
    setOfflineReady(false)
    setNeedRefresh(false)
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-sm rounded-card border border-slate-200 bg-white p-4 shadow-lg"
    >
      <p className="text-sm text-slate-700">
        {needRefresh
          ? 'A new version of the app is available.'
          : 'The app is ready to work offline.'}
      </p>
      <div className="mt-3 flex gap-2">
        {needRefresh && (
          <Button size="sm" onClick={() => void updateServiceWorker(true)}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Reload
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={dismiss}>
          {needRefresh ? 'Later' : 'Dismiss'}
        </Button>
      </div>
    </div>
  )
}
