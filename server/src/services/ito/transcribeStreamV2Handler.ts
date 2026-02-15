import { create } from '@bufbuild/protobuf'
import { ConnectError, Code } from '@connectrpc/connect'
import type { HandlerContext } from '@connectrpc/connect'
import {
  ContextInfo,
  ItoMode,
  ReplacementEntry,
  StreamConfig,
  StreamConfigSchema,
  TranscribeStreamRequest,
  TranscriptionResponseSchema,
  UserDetailsInfo,
} from '../../generated/ito_pb.js'
import { getAsrProvider, getLlmProvider } from '../../clients/providerUtils.js'
import { DEFAULT_ADVANCED_SETTINGS } from '../../constants/generated-defaults.js'
import { errorToProtobuf } from '../../clients/errors.js'
import {
  createUserPromptWithContext,
  detectItoMode,
  getPromptForMode,
} from './helpers.js'
import { SMART_FORMATTER_PROMPT } from './constants.js'
import type { ItoContext } from './types.js'
import { isAbortError, createAbortError } from '../../utils/abortUtils.js'
import {
  concatenateAudioChunks,
  prepareAudioForTranscription,
} from '../../utils/audioProcessing.js'
import {
  serverTimingCollector,
  ServerTimingEventName,
} from '../timing/ServerTimingCollector.js'
import { kUser } from '../../auth/userContext.js'

export class TranscribeStreamV2Handler {
  private readonly MODE_CHANGE_GRACE_PERIOD_MS = 100

  async process(
    requests: AsyncIterable<TranscribeStreamRequest>,
    context?: HandlerContext,
  ) {
    const startTime = Date.now()

    console.log(`📩 [${new Date().toISOString()}] Starting TranscribeStreamV2`)

    // Collect stream data
    const {
      audioChunks,
      mergedConfig: initialConfig,
      lastModeChangeTimestamp,
      previousMode,
    } = await this.collectStreamData(requests)

    const streamEndTime = Date.now()

    // Extract interaction ID and user ID for timing
    const interactionId = initialConfig?.interactionId
    const userId = context?.values.get(kUser)?.sub

    // Initialize timing collection
    serverTimingCollector.startInteraction(interactionId, userId)
    serverTimingCollector.startTiming(
      ServerTimingEventName.TOTAL_PROCESSING,
      interactionId,
    )

    // Check if client cancelled the stream
    if (context?.signal.aborted) {
      serverTimingCollector.clearInteraction(interactionId)

      console.log(
        `🚫 [${new Date().toISOString()}] Stream cancelled by client, aborting processing`,
      )
      throw new ConnectError('Stream cancelled by client', Code.Canceled)
    }

    // Apply mode grace period
    const mergedConfig = this.applyModeGracePeriod(
      initialConfig,
      lastModeChangeTimestamp,
      previousMode,
      streamEndTime,
    )

    console.log(
      `📊 [${new Date().toISOString()}] Processed ${audioChunks.length} audio chunks`,
    )

    // Concatenate and prepare audio
    const fullAudio = concatenateAudioChunks(audioChunks)

    try {
      // Time audio processing
      const fullAudioWAV = interactionId
        ? await serverTimingCollector.timeAsync(
            ServerTimingEventName.AUDIO_PROCESSING,
            () => prepareAudioForTranscription(fullAudio),
            interactionId,
          )
        : prepareAudioForTranscription(fullAudio)

      // Extract configuration
      const asrConfig = this.extractAsrConfig(mergedConfig)

      // Time transcription
      let transcript = await serverTimingCollector.timeAsync(
        ServerTimingEventName.ASR_TRANSCRIPTION,
        () => this.transcribeAudioData(fullAudioWAV, asrConfig, context),
        interactionId,
      )

      const userDetailsContext = this.buildUserDetailsContext(
        mergedConfig.userDetails,
      )

      // Prepare context and settings
      const windowContext: ItoContext = {
        windowTitle: mergedConfig.context?.windowTitle || '',
        appName: mergedConfig.context?.appName || '',
        contextText: mergedConfig.context?.contextText || '',
        browserUrl: mergedConfig.context?.browserUrl || '',
        browserDomain: mergedConfig.context?.browserDomain || '',
        tonePrompt: mergedConfig.context?.tonePrompt || '',
        userDetailsContext,
      }

      const mode = mergedConfig.context?.mode ?? detectItoMode(transcript)

      const advancedSettings = this.prepareAdvancedSettings(
        mergedConfig,
        asrConfig.asrModel,
        asrConfig.asrProvider,
        asrConfig.noSpeechThreshold,
      )

      // Time transcript adjustment (only happens in EDIT mode)
      // transcript = await serverTimingCollector.timeAsync(
      //   ServerTimingEventName.LLM_ADJUSTMENT,
      //   () =>
      //     this.adjustTranscriptForMode(
      //       transcript,
      //       mode,
      //       windowContext,
      //       advancedSettings,
      //     ),
      //   interactionId,
      // )
      transcript = await this.adjustTranscriptForMode(
        transcript,
        mode,
        windowContext,
        advancedSettings,
      )

      const replacements = mergedConfig.replacements || []
      if (replacements.length > 0) {
        const beforeReplacements = transcript
        transcript = this.applyReplacements(transcript, replacements)
        if (transcript !== beforeReplacements) {
          console.log(
            `📝 [${new Date().toISOString()}] Applied ${replacements.length} replacement(s): "${beforeReplacements}" → "${transcript}"`,
          )
        }
      }

      const duration = Date.now() - startTime

      // Finalize timing
      serverTimingCollector.endTiming(
        ServerTimingEventName.TOTAL_PROCESSING,
        interactionId,
      )
      serverTimingCollector.finalizeInteraction(interactionId)

      console.log(
        `✅ [${new Date().toISOString()}] TranscribeStreamV2 completed in ${duration}ms`,
      )

      return create(TranscriptionResponseSchema, {
        transcript,
      })
    } catch (error: any) {
      // Clear timing on error
      if (interactionId) {
        serverTimingCollector.clearInteraction(interactionId)
      }

      if (error instanceof ConnectError) {
        throw error
      }

      console.error('Failed to process TranscribeStreamV2:', error)

      return create(TranscriptionResponseSchema, {
        transcript: '',
        error: errorToProtobuf(
          error,
          (mergedConfig.llmSettings?.asrProvider as any) ||
            (DEFAULT_ADVANCED_SETTINGS.asrProvider as any),
        ),
      })
    }
  }

  private async collectStreamData(
    requests: AsyncIterable<TranscribeStreamRequest>,
  ): Promise<{
    audioChunks: Uint8Array[]
    mergedConfig: StreamConfig
    lastModeChangeTimestamp: number | null
    previousMode: ItoMode | undefined
  }> {
    const audioChunks: Uint8Array[] = []
    let mergedConfig: StreamConfig = create(StreamConfigSchema, {
      context: undefined,
      llmSettings: undefined,
      vocabulary: [],
      replacements: [],
    })
    let lastModeChangeTimestamp: number | null = null
    let previousMode: ItoMode | undefined = undefined

    try {
      for await (const request of requests) {
        if (request.payload.case === 'audioData') {
          audioChunks.push(request.payload.value)
        } else if (request.payload.case === 'config') {
          const currentMode = mergedConfig.context?.mode
          mergedConfig = this.mergeStreamConfigs(
            mergedConfig,
            request.payload.value,
          )

          console.log(
            `🔧 [${new Date().toISOString()}] Received config update:`,
            JSON.stringify(mergedConfig, null, 2),
          )

          const newMode = mergedConfig.context?.mode
          if (newMode !== undefined && newMode !== currentMode) {
            previousMode = currentMode
            lastModeChangeTimestamp = Date.now()
            console.log(
              `🔧 [${new Date().toISOString()}] Mode changed from ${currentMode} to: ${newMode}`,
            )
          }
        }
      }
    } catch (err) {
      if (isAbortError(err)) {
        console.log(
          `🚫 [${new Date().toISOString()}] Stream reading interrupted (client cancelled)`,
        )
        throw createAbortError(err, 'Stream cancelled by client')
      }

      throw err
    }

    return { audioChunks, mergedConfig, lastModeChangeTimestamp, previousMode }
  }

  private applyModeGracePeriod(
    mergedConfig: StreamConfig,
    lastModeChangeTimestamp: number | null,
    previousMode: ItoMode | undefined,
    streamEndTime: number,
  ): StreamConfig {
    // If there was a mode change and it happened within the grace period,
    // revert to the previous mode (or undefined if no previous mode)
    if (lastModeChangeTimestamp !== null) {
      const timeSinceLastChange = streamEndTime - lastModeChangeTimestamp

      if (timeSinceLastChange <= this.MODE_CHANGE_GRACE_PERIOD_MS) {
        const currentMode = mergedConfig.context?.mode
        console.log(
          `⏱️ [${new Date().toISOString()}] Last mode change (${timeSinceLastChange}ms ago) within grace period (${this.MODE_CHANGE_GRACE_PERIOD_MS}ms) - reverting from ${currentMode} to ${previousMode}`,
        )

        if (mergedConfig.context) {
          return {
            ...mergedConfig,
            context: {
              ...mergedConfig.context,
              mode: previousMode,
            },
          }
        }
      }
    }

    return mergedConfig
  }

  private extractAsrConfig(mergedConfig: StreamConfig) {
    return {
      asrModel: this.resolveOrDefault(
        mergedConfig.llmSettings?.asrModel,
        DEFAULT_ADVANCED_SETTINGS.asrModel,
      ),
      asrProvider: this.resolveOrDefault(
        mergedConfig.llmSettings?.asrProvider,
        DEFAULT_ADVANCED_SETTINGS.asrProvider,
      ),
      noSpeechThreshold: this.resolveOrDefault(
        mergedConfig.llmSettings?.noSpeechThreshold,
        DEFAULT_ADVANCED_SETTINGS.noSpeechThreshold,
      ),
      vocabulary: mergedConfig.vocabulary,
    }
  }

  /**
   * Resolves a value to its default if it's undefined, null, or empty.
   * This provides a defensive fallback for optional protobuf fields.
   */
  private resolveOrDefault<T extends string | number>(
    value: T | undefined,
    defaultValue: T,
  ): T {
    if (value === undefined || value === '' || value === null) {
      return defaultValue
    }
    return value
  }

  private prepareAdvancedSettings(
    mergedConfig: StreamConfig,
    asrModel: string,
    asrProvider: string,
    noSpeechThreshold: number,
  ) {
    return {
      asrModel: this.resolveOrDefault(
        asrModel,
        DEFAULT_ADVANCED_SETTINGS.asrModel,
      ),
      asrProvider: this.resolveOrDefault(
        asrProvider,
        DEFAULT_ADVANCED_SETTINGS.asrProvider,
      ),
      asrPrompt: this.resolveOrDefault(
        mergedConfig.llmSettings?.asrPrompt,
        DEFAULT_ADVANCED_SETTINGS.asrPrompt,
      ),
      llmProvider: this.resolveOrDefault(
        mergedConfig.llmSettings?.llmProvider,
        DEFAULT_ADVANCED_SETTINGS.llmProvider,
      ),
      llmModel: this.resolveOrDefault(
        mergedConfig.llmSettings?.llmModel,
        DEFAULT_ADVANCED_SETTINGS.llmModel,
      ),
      llmTemperature: this.resolveOrDefault(
        mergedConfig.llmSettings?.llmTemperature,
        DEFAULT_ADVANCED_SETTINGS.llmTemperature,
      ),
      transcriptionPrompt: this.resolveOrDefault(
        mergedConfig.llmSettings?.transcriptionPrompt,
        DEFAULT_ADVANCED_SETTINGS.transcriptionPrompt,
      ),
      editingPrompt: this.resolveOrDefault(
        mergedConfig.llmSettings?.editingPrompt,
        DEFAULT_ADVANCED_SETTINGS.editingPrompt,
      ),
      noSpeechThreshold: this.resolveOrDefault(
        noSpeechThreshold,
        DEFAULT_ADVANCED_SETTINGS.noSpeechThreshold,
      ),
    }
  }

  private async transcribeAudioData(
    audioWav: Buffer,
    asrConfig: ReturnType<typeof this.extractAsrConfig>,
    context?: HandlerContext,
  ): Promise<string> {
    if (context?.signal.aborted) {
      console.log(
        `🚫 [${new Date().toISOString()}] Stream cancelled before ASR call, skipping transcription`,
      )
      throw new ConnectError('Stream cancelled by client', Code.Canceled)
    }

    const asrClient = getAsrProvider(asrConfig.asrProvider)
    const transcript = await asrClient.transcribeAudio(audioWav, {
      fileType: 'wav',
      asrModel: asrConfig.asrModel,
      noSpeechThreshold: asrConfig.noSpeechThreshold,
      vocabulary: asrConfig.vocabulary,
    })

    console.log(
      `📝 [${new Date().toISOString()}] Received transcript: "${transcript}"`,
    )

    return transcript
  }

  private async adjustTranscriptForMode(
    transcript: string,
    mode: ItoMode,
    windowContext: ItoContext,
    advancedSettings: ReturnType<typeof this.prepareAdvancedSettings>,
  ): Promise<string> {
    console.log(
      `[${new Date().toISOString()}] Detected mode: ${mode}, adjusting transcript`,
    )

    const hasTonePrompt =
      windowContext.tonePrompt && windowContext.tonePrompt.trim() !== ''

    const basePrompt = getPromptForMode(mode, advancedSettings)

    const systemPrompt = hasTonePrompt
      ? `${windowContext.tonePrompt}\n\n${SMART_FORMATTER_PROMPT}`
      : basePrompt

    const userPrompt = createUserPromptWithContext(transcript, windowContext)
    const llmProvider = getLlmProvider(advancedSettings.llmProvider)

    console.log(
      `[TranscribeStreamV2] LLM call - system prompt source: ${hasTonePrompt ? 'tonePrompt' : 'basePrompt'}, has user details: ${!!windowContext.userDetailsContext}`,
    )

    const adjustedTranscript = await serverTimingCollector.timeAsync(
      ServerTimingEventName.LLM_ADJUSTMENT,
      () =>
        llmProvider.adjustTranscript(userPrompt, {
          temperature: advancedSettings.llmTemperature,
          model: advancedSettings.llmModel,
          prompt: systemPrompt,
        }),
    )

    console.log(
      `📝 [${new Date().toISOString()}] Adjusted transcript: "${adjustedTranscript}"`,
    )

    return adjustedTranscript
  }

  private buildUserDetailsContext(
    userDetails: UserDetailsInfo | undefined,
  ): string {
    if (!userDetails) {
      console.log('[TranscribeStreamV2] No user details provided in stream config')
      return ''
    }
    if (!userDetails.fullName && !userDetails.occupation) {
      console.log('[TranscribeStreamV2] User details present but fullName and occupation are both empty')
      return ''
    }
    console.log(`[TranscribeStreamV2] Building user details context - Name: "${userDetails.fullName}", Occupation: "${userDetails.occupation}"`)

    const lines: string[] = []

    if (userDetails.fullName) lines.push(`Name: ${userDetails.fullName}`)
    if (userDetails.occupation)
      lines.push(`Occupation: ${userDetails.occupation}`)
    if (userDetails.companyName)
      lines.push(`Company: ${userDetails.companyName}`)
    if (userDetails.role) lines.push(`Role: ${userDetails.role}`)
    if (userDetails.email) lines.push(`Email: ${userDetails.email}`)
    if (userDetails.phoneNumber) lines.push(`Phone: ${userDetails.phoneNumber}`)
    if (userDetails.businessAddress)
      lines.push(`Address: ${userDetails.businessAddress}`)
    if (userDetails.website) lines.push(`Website: ${userDetails.website}`)
    if (userDetails.linkedin) lines.push(`LinkedIn: ${userDetails.linkedin}`)

    if (userDetails.additionalInfo && userDetails.additionalInfo.length > 0) {
      for (const info of userDetails.additionalInfo) {
        if (info.trim()) lines.push(info)
      }
    }

    return lines.join('\n')
  }

  private mergeStreamConfigs(
    base: StreamConfig,
    update: StreamConfig,
  ): StreamConfig {
    const mergeContext = (
      baseCtx: ContextInfo | undefined,
      updateCtx: ContextInfo | undefined,
    ): ContextInfo | undefined => {
      if (!updateCtx) return baseCtx
      if (!baseCtx) return updateCtx

      return {
        ...baseCtx,
        mode: updateCtx.mode !== undefined ? updateCtx.mode : baseCtx.mode,
        windowTitle:
          updateCtx.windowTitle !== ''
            ? updateCtx.windowTitle
            : baseCtx.windowTitle,
        appName: updateCtx.appName !== '' ? updateCtx.appName : baseCtx.appName,
        contextText:
          updateCtx.contextText !== ''
            ? updateCtx.contextText
            : baseCtx.contextText,
        browserUrl:
          updateCtx.browserUrl !== ''
            ? updateCtx.browserUrl
            : baseCtx.browserUrl,
        browserDomain:
          updateCtx.browserDomain !== ''
            ? updateCtx.browserDomain
            : baseCtx.browserDomain,
        tonePrompt:
          updateCtx.tonePrompt !== ''
            ? updateCtx.tonePrompt
            : baseCtx.tonePrompt,
      }
    }

    return {
      ...base,
      context: mergeContext(base.context, update.context),
      llmSettings: update.llmSettings
        ? { ...base.llmSettings, ...update.llmSettings }
        : base.llmSettings,
      vocabulary:
        update.vocabulary.length > 0 ? update.vocabulary : base.vocabulary,
      replacements:
        update.replacements.length > 0
          ? update.replacements
          : base.replacements,
      interactionId: update.interactionId || base.interactionId,
      userDetails: update.userDetails || base.userDetails,
    }
  }

  private applyReplacements(
    transcript: string,
    replacements: ReplacementEntry[],
  ): string {
    if (!replacements || replacements.length === 0) return transcript

    let result = transcript
    for (const replacement of replacements) {
      const from = replacement.fromText
      const to = replacement.toText
      if (!from || !to) continue
      if (from.toLowerCase() === to.toLowerCase()) continue

      const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(`\\b${escaped}\\b`, 'gi')
      result = result.replace(regex, to)
    }

    return result
  }
}

export const transcribeStreamV2Handler = new TranscribeStreamV2Handler()
