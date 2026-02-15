const KEEP_ALIVE_INTERVAL_MS = 10 * 60 * 1000

let keepAliveTimer: NodeJS.Timeout | null = null
let baseUrl: string | null = null

async function ping() {
  if (!baseUrl) return
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    await fetch(`${baseUrl}/health`, { signal: controller.signal })
    console.log('[KeepAlive] Server ping successful')
  } catch (err) {
    console.warn('[KeepAlive] Server ping failed:', err)
  } finally {
    clearTimeout(timeout)
  }
}

function startTimer() {
  if (keepAliveTimer) return
  keepAliveTimer = setInterval(ping, KEEP_ALIVE_INTERVAL_MS)
  console.log(
    `[KeepAlive] Timer started (interval: ${KEEP_ALIVE_INTERVAL_MS / 1000}s)`,
  )
}

function stopTimer() {
  if (!keepAliveTimer) return
  clearInterval(keepAliveTimer)
  keepAliveTimer = null
  console.log('[KeepAlive] Timer paused (app lost focus)')
}

export function startServerKeepAlive(url: string) {
  if (!url) {
    console.warn('[KeepAlive] No base URL provided, skipping')
    return
  }
  baseUrl = url
  ping()
  startTimer()
}

export function onAppFocused() {
  if (!baseUrl) return
  ping()
  startTimer()
}

export function onAppBlurred() {
  if (!baseUrl) return
  stopTimer()
}

export function stopServerKeepAlive() {
  stopTimer()
  baseUrl = null
  console.log('[KeepAlive] Stopped')
}
