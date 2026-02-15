import { useEffect } from 'react'

/**
 * A React hook that listens for changes in media devices (e.g., plugging in or
 * unplugging a microphone/headset) and notifies the main process.
 * This should be used once in a long-lived component, like the root App component.
 */
export const useDeviceChangeListener = (): void => {
  useEffect(() => {
    const handleDeviceChange = () => {
      console.log(
        '[Renderer] `devicechange` event detected. Notifying main process.',
      )
      window.api?.send('audio-devices-changed')
    }

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange)

    return () => {
      navigator.mediaDevices.removeEventListener(
        'devicechange',
        handleDeviceChange,
      )
      console.log('[useDeviceChangeListener] Removed devicechange listener.')
    }
  }, [])
}
