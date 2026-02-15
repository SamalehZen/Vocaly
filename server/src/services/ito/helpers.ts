import { HeaderValidator } from '../../validation/HeaderValidator.js'
import { ItoContext } from './types.js'
import { ITO_MODE_PROMPT } from './constants.js'
import { DEFAULT_ADVANCED_SETTINGS } from '../../constants/generated-defaults.js'
import { ItoMode } from '../../generated/ito_pb.js'
import {
  END_APP_NAME_MARKER,
  END_BROWSER_DOMAIN_MARKER,
  END_BROWSER_URL_MARKER,
  END_CONTEXT_MARKER,
  END_USER_COMMAND_MARKER,
  END_WINDOW_TITLE_MARKER,
  START_APP_NAME_MARKER,
  START_BROWSER_DOMAIN_MARKER,
  START_BROWSER_URL_MARKER,
  START_CONTEXT_MARKER,
  START_USER_COMMAND_MARKER,
  START_WINDOW_TITLE_MARKER,
  START_USER_DETAILS_MARKER,
  END_USER_DETAILS_MARKER,
} from '../../constants/markers.js'

export function createUserPromptWithContext(
  transcript: string,
  context?: ItoContext,
): string {
  let contextPrompt = ''
  if (context) {
    if (context.userDetailsContext) {
      console.log('[Helpers] Including user details in prompt context')
      contextPrompt += `\n${START_USER_DETAILS_MARKER}\n${context.userDetailsContext}\n${END_USER_DETAILS_MARKER}`
    } else {
      console.log('[Helpers] No user details context available - signature will not include name/occupation')
    }
    if (context.windowTitle) {
      contextPrompt += `\n${START_WINDOW_TITLE_MARKER}\n${context.windowTitle}\n${END_WINDOW_TITLE_MARKER}`
    }
    if (context.appName) {
      contextPrompt += `\n${START_APP_NAME_MARKER}\n${context.appName}\n${END_APP_NAME_MARKER}`
    }
    if (context.browserUrl) {
      contextPrompt += `\n${START_BROWSER_URL_MARKER}\n${context.browserUrl}\n${END_BROWSER_URL_MARKER}`
    }
    if (context.browserDomain) {
      contextPrompt += `\n${START_BROWSER_DOMAIN_MARKER}\n${context.browserDomain}\n${END_BROWSER_DOMAIN_MARKER}`
    }
  }
  const userPrompt = `
    ${contextPrompt}${context?.contextText ? '\n' : ''}
    ${START_CONTEXT_MARKER}
    ${context?.contextText || ''}
    ${END_CONTEXT_MARKER}
    ${START_USER_COMMAND_MARKER}
    ${transcript}
    ${END_USER_COMMAND_MARKER}
  `
  return userPrompt
}

function validateAndTransformHeaderValue<T>(
  headers: Headers,
  headerName: string,
  defaultValue: T,
  validator: (value: T) => T,
  logName: string,
): T {
  const headerValue = headers.get(headerName)
  let valueToValidate = (headerValue || defaultValue) as T
  if (typeof defaultValue === 'number') {
    valueToValidate = Number(valueToValidate) as T
  }
  const validatedValue = validator(valueToValidate)
  console.log(
    `[Transcription] Using validated ${logName}: ${typeof validatedValue === 'string' ? validatedValue.slice(0, 50) + '...' : validatedValue} (source: ${headerValue ? 'header' : 'default'})`,
  )
  return validatedValue
}

export function getAdvancedSettingsHeaders(headers: Headers) {
  const asrModel = validateAndTransformHeaderValue(
    headers,
    'asr-model',
    DEFAULT_ADVANCED_SETTINGS.asrModel,
    HeaderValidator.validateAsrModel,
    'ASR model',
  )

  const asrProvider = validateAndTransformHeaderValue(
    headers,
    'asr-provider',
    DEFAULT_ADVANCED_SETTINGS.asrProvider,
    HeaderValidator.validateAsrProvider,
    'ASR Provider',
  )

  const asrPrompt = validateAndTransformHeaderValue(
    headers,
    'asr-prompt',
    DEFAULT_ADVANCED_SETTINGS.asrPrompt,
    HeaderValidator.validateAsrPrompt,
    'ASR prompt',
  )

  const llmProvider = validateAndTransformHeaderValue(
    headers,
    'llm-provider',
    DEFAULT_ADVANCED_SETTINGS.llmProvider,
    HeaderValidator.validateLlmProvider,
    'LLM Provider',
  )

  const llmModel = validateAndTransformHeaderValue(
    headers,
    'llm-model',
    DEFAULT_ADVANCED_SETTINGS.llmModel,
    HeaderValidator.validateLlmModel,
    'LLM model',
  )

  const llmTemperature = validateAndTransformHeaderValue(
    headers,
    'llm-temperature',
    DEFAULT_ADVANCED_SETTINGS.llmTemperature,
    HeaderValidator.validateLlmTemperature,
    'LLM temperature',
  )

  const transcriptionPrompt = validateAndTransformHeaderValue(
    headers,
    'transcription-prompt',
    DEFAULT_ADVANCED_SETTINGS.transcriptionPrompt,
    HeaderValidator.validateTranscriptionPrompt,
    'Transcription prompt',
  )

  const editingPrompt = validateAndTransformHeaderValue(
    headers,
    'editing-prompt',
    DEFAULT_ADVANCED_SETTINGS.editingPrompt,
    HeaderValidator.validateEditingPrompt,
    'Editing prompt',
  )

  const noSpeechThreshold = validateAndTransformHeaderValue(
    headers,
    'no-speech-threshold',
    DEFAULT_ADVANCED_SETTINGS.noSpeechThreshold,
    HeaderValidator.validateNoSpeechThreshold,
    'No speech threshold',
  )

  return {
    asrModel,
    asrProvider,
    asrPrompt,
    llmProvider,
    llmModel,
    llmTemperature,
    transcriptionPrompt,
    editingPrompt,
    noSpeechThreshold,
  }
}

export function getItoMode(input: unknown): ItoMode | undefined {
  try {
    const inputNumber = Number(input)
    if (isNaN(inputNumber) || !Number.isFinite(inputNumber)) {
      return undefined
    }

    return inputNumber as ItoMode
  } catch (error) {
    console.error('Error parsing Ito mode:', error)
    return undefined
  }
}

const WAKE_PHRASES = [
  'salut arka',
  'bonjour arka',
  'bonsoir arka',
  'hey arka',
  'hey ito',
]

export function detectItoMode(transcript: string): ItoMode {
  const words = transcript.trim().split(/\s+/)
  const firstFiveWords = words.slice(0, 5).join(' ').toLowerCase()

  const isEditMode = WAKE_PHRASES.some(phrase =>
    firstFiveWords.includes(phrase),
  )
  return isEditMode ? ItoMode.EDIT : ItoMode.TRANSCRIBE
}

export function getPromptForMode(
  mode: ItoMode,
  advancedSettingsHeaders: ReturnType<typeof getAdvancedSettingsHeaders>,
  tonePrompt?: string,
): string {
  let basePrompt: string
  switch (mode) {
    case ItoMode.EDIT:
      basePrompt = ITO_MODE_PROMPT[ItoMode.EDIT]
      break
    case ItoMode.TRANSCRIBE:
      basePrompt =
        advancedSettingsHeaders.transcriptionPrompt ||
        ITO_MODE_PROMPT[ItoMode.TRANSCRIBE]
      break
    default:
      basePrompt = ITO_MODE_PROMPT[ItoMode.TRANSCRIBE]
  }

  if (tonePrompt && tonePrompt.trim()) {
    return `${tonePrompt}\n\n${basePrompt}`
  }

  return basePrompt
}
