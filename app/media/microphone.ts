import { useSettingsStore } from '../store/useSettingsStore'

type Microphone = {
  deviceId: string
  label: string
}

type MicrophoneToRender = {
  title: string
  description?: string
}

async function getAvailableMicrophones(): Promise<Microphone[]> {
  try {
    console.log('Fetching available native microphones...')
    if (!window.api?.invoke) return []
    const deviceNames: string[] = await window.api.invoke(
      'get-native-audio-devices',
    )
    console.log('Available native microphones:', deviceNames)
    return deviceNames.map(name => ({
      deviceId: name,
      label: name,
    }))
  } catch (error) {
    console.error('Error getting available native microphones:', error)
    return []
  }
}

/**
 * Verifies if the currently selected microphone in settings is still connected.
 * If not, it gracefully falls back to the "default" auto-detect setting.
 */
export async function verifyStoredMicrophone() {
  try {
    console.log('[verifyStoredMicrophone] Verifying selected microphone...')
    const { microphoneDeviceId, setMicrophoneDeviceId } =
      useSettingsStore.getState()

    if (microphoneDeviceId === 'default') {
      console.log(
        '[verifyStoredMicrophone] "Auto-detect" is selected. Verification not needed.',
      )
      return
    }

    if (!window.api?.invoke) return

    const availableDevices: string[] = await window.api.invoke(
      'get-native-audio-devices',
    )

    const isDeviceAvailable = availableDevices.includes(microphoneDeviceId)

    if (isDeviceAvailable) {
      console.log(
        `[verifyStoredMicrophone] Stored microphone "${microphoneDeviceId}" is still available.`,
      )
    } else {
      console.warn(
        `[verifyStoredMicrophone] Stored microphone "${microphoneDeviceId}" is not available. Falling back to "Auto-detect".`,
      )
      setMicrophoneDeviceId('default', 'Auto-detect')
    }
  } catch (error) {
    console.error(
      '[verifyStoredMicrophone] Failed to verify microphone:',
      error,
    )
  }
}

const microphoneToRender = (microphone: Microphone): MicrophoneToRender => {
  const label = microphone.label.toLowerCase()

  // Handle default device case
  if (label.includes('default -')) {
    return {
      title: `Auto-detect`,
      description:
        'May connect to Bluetooth earbuds, slowing transcription speed',
    }
  }

  // Handle built-in microphone
  if (label.includes('built-in') || label.includes('macbook pro microphone')) {
    return {
      title: 'Built-in mic (recommended)',
    }
  }

  // Default case - return original label
  return {
    title: microphone.label,
  }
}

export { getAvailableMicrophones, microphoneToRender }

export type { Microphone, MicrophoneToRender }
