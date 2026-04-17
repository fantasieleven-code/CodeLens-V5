/**
 * Volcano RTC Voice Chat Service
 *
 * Manages AI voice agent lifecycle: Start / Update / Stop.
 * Supports dual mode: ArkV3 (built-in model) and CustomLLM (/chat-stream).
 * Ported from HireFlow's volc_voice_service.py.
 */

import crypto from 'crypto';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { AppError, SandboxError } from '../middleware/errorHandler.js';

const VOLC_API_HOST = 'rtc.volcengineapi.com';
const VOLC_API_VERSION = '2025-06-01'; // Updated 2025 API version (HireFlow production-verified)
const VOLC_REGION = 'cn-beijing';
const VOLC_SERVICE = 'rtc';

// ─── GPS Meta Instruction (injected into SystemMessages tail, LLM self-tracks dimension coverage) ───
export const GPS_META_INSTRUCTION = `

【面试进度管理规则 — 严禁将以下任何内容说出口，违反即视为严重错误】

你拥有完整的对话历史。每完成3轮候选人实质性回答后，在脑中默默执行一次自检（绝对不能开口说出，不能用任何形式输出自检过程或结果）：
自检步骤（只在内部执行）：对照维度列表确认覆盖状态；已有2个以上具体案例支撑的维度标记为完成，不再追问；找出未覆盖或仅浅层回答的维度，下一个问题切换过去。
行为规则：同一维度连续追问不超过3轮；感觉跑题时用"好的，我们换个话题"自然过渡；优先覆盖权重最高的维度。
`;

// ─── Candidate QA Boundary (prevents AI from fabricating salary/team/org info) ───
export const CANDIDATE_QA_BOUNDARY = `

【候选人反问环节边界规则 — 必须严格执行】

候选人反问时，只能回答提示词中明确列出的信息。
对于以下类型的问题，如果提示词中没有提供具体数字或说明，必须使用统一回复，严禁推断或编造：
薪资待遇、薪酬区间、奖金结构 → 回复："薪资细节我这边暂时没有具体信息，后续会有专属HR同事和你详细沟通。"
团队规模、编制人数、人员配比 → 回复："团队规模的具体数字我这边暂时没有，后续HR同事会和你同步。"
汇报关系、组织架构、晋升路径 → 回复："这个细节我这边暂时没有确切信息，后续HR会详细说明。"
其他提示词中未提及的岗位细节 → 回复："这个细节我这边暂时没有，后续HR同事会跟进和你同步。"
严禁根据上下文推断后给出任何具体数字或结构性信息。
`;

// ─── Types ───

interface LLMConfig {
  Mode: 'ArkV3' | 'CustomLLM';
  ModelName?: string;
  Url?: string;
  APIKey?: string;
  MaxTokens: number;
  Temperature: number;
  TopP: number;
  SystemMessages: string[];
  HistoryLength: number;
  ThinkingType?: string;
  Tools?: object[];
  EnableParallelToolCalls?: boolean;
  Custom?: string;    // JSON string transparently passed to Custom LLM endpoint
  Prefill?: boolean;  // Send ASR intermediate results early for lower latency
}

interface StartVoiceChatParams {
  roomId: string;
  taskId: string;
  targetUserId: string;
  systemPrompt: string;
  welcomeMessage: string;
  candidateName?: string;
  tools?: object[];
  /** Override Custom LLM URL (default: CUSTOM_LLM_URL env or localhost/chat-stream) */
  customLlmUrl?: string;
  /** JSON-serializable data to pass as LLMConfig.Custom (transparently forwarded by VERTC) */
  customData?: Record<string, unknown>;
}

interface UpdateVoiceChatParams {
  roomId: string;
  taskId: string;
  command: 'ExternalPromptsForLLM' | 'Interrupt' | 'ExternalTextToSpeech' | 'FunctionCallResult' | 'UpdateConfig' | 'UpdateFarfieldConfig';
  message?: string;
  interruptMode?: number;
  llmConfig?: Partial<LLMConfig>;
}

// ─── LLMConfig Factory ───

export function buildLLMConfig(
  mode: 'ark' | 'custom',
  systemPrompt: string,
  tools?: object[],
  overrides?: { url?: string; custom?: string; historyLength?: number; prefill?: boolean; temperature?: number; maxTokens?: number },
): LLMConfig {
  if (mode === 'custom') {
    return {
      Mode: 'CustomLLM',
      Url: overrides?.url || env.CUSTOM_LLM_URL || `http://localhost:${env.PORT}/chat-stream`,
      APIKey: env.RTC_CALLBACK_SECRET || env.JWT_SECRET, // Prefer dedicated RTC secret; falls back to JWT_SECRET if not set
      MaxTokens: overrides?.maxTokens ?? 4096,
      Temperature: overrides?.temperature ?? 0.48,
      TopP: 0.4,
      SystemMessages: [systemPrompt],
      HistoryLength: overrides?.historyLength ?? 15,
      ...(overrides?.custom ? { Custom: overrides.custom } : {}),
      ...(overrides?.prefill ? { Prefill: true } : {}),
    };
  }

  // ArkV3 mode (default) — HireFlow production-verified params
  return {
    Mode: 'ArkV3',
    ModelName: env.ARK_MODEL_PRO || 'doubao-seed-2-0-pro-250828',
    MaxTokens: env.VOLC_LLM_MAX_TOKENS,
    Temperature: env.VOLC_LLM_TEMPERATURE,
    TopP: env.VOLC_LLM_TOP_P,
    SystemMessages: [systemPrompt + GPS_META_INSTRUCTION + CANDIDATE_QA_BOUNDARY],
    HistoryLength: env.VOLC_LLM_HISTORY_LENGTH,
    ThinkingType: 'disabled', // Must be disabled — LLM freezes with auto mode (HireFlow 2026-03-03 confirmed)
    ...(tools && tools.length > 0 ? { Tools: tools } : {}),
    ...(tools && tools.length > 0 && env.VOLC_ENABLE_PARALLEL_TOOL_CALLS
      ? { EnableParallelToolCalls: true } : {}),
  };
}

// ─── GPS Tool Definition ───

export const GPS_TOOL = {
  type: 'function',
  function: {
    name: 'check_interview_progress',
    description: '查询面试进度：已覆盖维度、未覆盖维度、剩余时间',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
};

// ─── Volcano OpenAPI Signature ───

function generateVolcSignature(
  method: string,
  path: string,
  queryString: string,
  body: string,
  timestamp: string,
  date: string,
): string {
  const ak = env.VOLC_AK!;
  const sk = env.VOLC_SK!;

  const bodyHash = crypto.createHash('sha256').update(body).digest('hex');
  const canonicalRequest = [
    method,
    path,
    queryString,
    `content-type:application/json\nhost:${VOLC_API_HOST}\nx-date:${timestamp}\n`,
    'content-type;host;x-date',
    bodyHash,
  ].join('\n');

  const credentialScope = `${date}/${VOLC_REGION}/${VOLC_SERVICE}/request`;
  const hashedCanonical = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
  const stringToSign = `HMAC-SHA256\n${timestamp}\n${credentialScope}\n${hashedCanonical}`;

  // Derive signing key
  const kDate = crypto.createHmac('sha256', sk).update(date).digest();
  const kRegion = crypto.createHmac('sha256', kDate).update(VOLC_REGION).digest();
  const kService = crypto.createHmac('sha256', kRegion).update(VOLC_SERVICE).digest();
  const kSigning = crypto.createHmac('sha256', kService).update('request').digest();

  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  return `HMAC-SHA256 Credential=${ak}/${credentialScope}, SignedHeaders=content-type;host;x-date, Signature=${signature}`;
}

async function volcApiRequest(action: string, body: object): Promise<unknown> {
  if (!env.VOLC_AK || !env.VOLC_SK || !env.VOLC_RTC_APP_ID) {
    throw new SandboxError('Volcano RTC credentials not configured (VOLC_AK/SK/RTC_APP_ID required)');
  }

  const path = '/';
  const queryString = `Action=${action}&Version=${VOLC_API_VERSION}`;
  const bodyStr = JSON.stringify(body);
  const url = `https://${VOLC_API_HOST}${path}?${queryString}`;

  const makeRequest = async (timeOffset: number) => {
    const now = new Date(Date.now() + timeOffset * 1000);
    const timestamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const date = timestamp.slice(0, 8);
    const authorization = generateVolcSignature('POST', path, queryString, bodyStr, timestamp, date);

    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Host': VOLC_API_HOST,
        'X-Date': timestamp,
        'Authorization': authorization,
      },
      body: bodyStr,
    });
  };

  let response = await makeRequest(cachedTimeOffset);
  let result = await response.json() as Record<string, unknown>;

  // Auto-detect time offset on InvalidTimestamp (HireFlow: _find_time_offset)
  const meta = result.ResponseMetadata as Record<string, unknown> | undefined;
  const err = meta?.Error as Record<string, string> | undefined;
  if (err?.Code === 'InvalidTimestamp' && cachedTimeOffset === 0) {
    logger.warn(`[voice-chat] InvalidTimestamp on ${action}, detecting time offset...`);
    const offset = await findTimeOffset();
    if (offset !== 0) {
      response = await makeRequest(offset);
      result = await response.json() as Record<string, unknown>;
    }
  }

  if (!response.ok) {
    logger.error(`[voice-chat] Volcano API ${action} failed: status=${response.status}`, JSON.stringify(result));
    throw new AppError(502, `Volcano API ${action} failed: ${response.status}`, 'VOICE_API_ERROR');
  }

  // Check for preParamCheck warnings (ASR may degrade)
  const resMeta = result.ResponseMetadata as Record<string, unknown> | undefined;
  const resErr = resMeta?.Error as Record<string, string> | undefined;
  if (resErr) {
    logger.warn(`[voice-chat] Volcano API ${action} warning: ${JSON.stringify(resErr)}`);
  }

  return result;
}

// ─── Public API ───

class VoiceChatService {
  async startVoiceChat(params: StartVoiceChatParams): Promise<{ taskId: string }> {
    const mode = env.CP4_LLM_MODE;
    const overrides = (params.customLlmUrl || params.customData) ? {
      url: params.customLlmUrl,
      custom: params.customData ? JSON.stringify(params.customData) : undefined,
      prefill: true,
      temperature: 0.35,
      maxTokens: 400,
      historyLength: 10,   // 5 rounds = 10 messages (user + assistant)
    } : undefined;
    const llmConfig = buildLLMConfig(mode, params.systemPrompt, params.tools, overrides);

    const body = {
      AppId: env.VOLC_RTC_APP_ID,
      RoomId: params.roomId,
      TaskId: params.taskId,
      Config: {
        ASRConfig: {
          Provider: 'volcano',
          ProviderParams: {
            Mode: 'bigmodel',
            StreamMode: 2,
          },
          VADConfig: {
            SilenceTime: env.VOLC_VAD_SILENCE_TIME,
            AIVAD: true,
            ExpireTime: env.VOLC_ASR_EXPIRE_TIME, // P0: 噪声环境ASR强制判停兜底
            ...(env.VOLC_VAD_FORCE_BEGIN_THRESHOLD !== 100
              ? { ForceBeginThreshold: env.VOLC_VAD_FORCE_BEGIN_THRESHOLD } : {}),
            ...(env.VOLC_VAD_FORCE_END !== 1200
              ? { ForceEnd: env.VOLC_VAD_FORCE_END } : {}),
          },
          // InterruptSpeechDuration=800ms: 3000ms causes WelcomeMessage roundId=0 stuck (HireFlow 2026-03-03)
          InterruptConfig: {
            InterruptSpeechDuration: env.VOLC_INTERRUPT_SPEECH_DURATION,
            ...(env.VOLC_INTERRUPT_KEYWORDS
              ? { InterruptKeywords: env.VOLC_INTERRUPT_KEYWORDS.split(',').map(k => k.trim()).filter(Boolean) }
              : {}),
          },
          ...(env.VOLC_ENABLE_FARFIELD ? { FarfieldConfig: { Enable: true } } : {}),
        },
        LLMConfig: llmConfig,
        TTSConfig: {
          Provider: 'volcano_bidirection',
          ProviderParams: {
            Credential: { ResourceId: 'seed-tts-1.0' },
            VolcanoTTSParameters: JSON.stringify({
              req_params: {
                speaker: env.VOLC_TTS_SPEAKER,
                audio_params: { speech_rate: 0, loudness_rate: 50 },
              },
            }),
          },
          ...(env.VOLC_TTS_PREFILL ? { Prefill: true } : {}),
          ...(env.VOLC_ENABLE_EMOTION_TTS ? { EmotionConfig: { Enable: true } } : {}),
        },
        SubtitleConfig: {
          ...(env.VOLC_SUBTITLE_CALLBACK_URL
            ? {
                ServerMessageUrl: `${env.VOLC_SUBTITLE_CALLBACK_URL}?task_id=${params.taskId}`,
                ServerMessageSignature: env.VOLC_SUBTITLE_SIGNATURE,
              }
            : {}),
          SubtitleMode: env.VOLC_SUBTITLE_CALLBACK_URL ? 1 : 0,
        },
        InterruptMode: env.VOLC_INTERRUPT_MODE,
        ...(env.VOLC_ENABLE_SNAPSHOT ? { SnapshotConfig: { AutoSelect: true } } : {}),
      },
      AgentConfig: {
        UserId: env.VOLC_AI_USER_ID,
        TargetUserId: [params.targetUserId],
        WelcomeMessage: params.welcomeMessage,
        AnsMode: 3,
        EnableConversationStateCallback: true,
      },
      ...(env.VOLC_TASK_USAGE_CALLBACK_URL ? {
        TaskUsageConfig: {
          ServerMessageUrl: `${env.VOLC_TASK_USAGE_CALLBACK_URL}?task_id=${params.taskId}`,
          ...(env.VOLC_TASK_USAGE_SIGNATURE
            ? { ServerMessageSignature: env.VOLC_TASK_USAGE_SIGNATURE } : {}),
        },
      } : {}),
    };

    logger.info(`[voice-chat] Starting voice chat: room=${params.roomId} task=${params.taskId} mode=${mode} target=${params.targetUserId} agent=${env.VOLC_AI_USER_ID}`);

    const result: Record<string, unknown> = await volcApiRequest('StartVoiceChat', body) as Record<string, unknown>;

    // Log Volcano response (HireFlow-style diagnostics)
    const resMeta = result.ResponseMetadata as Record<string, unknown> | undefined;
    const reqId = resMeta?.RequestId || 'unknown';
    const resResult = result.Result as Record<string, unknown> | undefined;
    logger.info(`[voice-chat] StartVoiceChat response: RequestId=${reqId} room=${params.roomId} task=${params.taskId} result=${JSON.stringify(resResult || {})}`);

    return { taskId: params.taskId };
  }

  async updateVoiceChat(params: UpdateVoiceChatParams): Promise<void> {
    const body: Record<string, unknown> = {
      AppId: env.VOLC_RTC_APP_ID,
      RoomId: params.roomId,
      TaskId: params.taskId,
      Command: params.command,
    };
    if (params.message) {
      body.Message = params.message;
    }
    if (params.command === 'ExternalTextToSpeech' && params.interruptMode !== undefined) {
      body.InterruptMode = params.interruptMode;
    }
    if (params.command === 'UpdateConfig' && params.llmConfig) {
      body.LLMConfig = params.llmConfig;
    }

    logger.info(`[voice-chat] Update: room=${params.roomId} command=${params.command}`);
    await volcApiRequest('UpdateVoiceChat', body);
  }

  async stopVoiceChat(roomId: string, taskId: string): Promise<void> {
    const body = {
      AppId: env.VOLC_RTC_APP_ID,
      RoomId: roomId,
      TaskId: taskId,
    };

    logger.info(`[voice-chat] Stopping voice chat: room=${roomId}`);
    await volcApiRequest('StopVoiceChat', body);
  }

  /** Inject dynamic context via ExternalPromptsForLLM */
  async injectContext(roomId: string, taskId: string, context: string): Promise<void> {
    await this.updateVoiceChat({
      roomId,
      taskId,
      command: 'ExternalPromptsForLLM',
      message: context,
    });
  }

  /** Return GPS function calling result */
  async returnGpsResult(roomId: string, taskId: string, gpsContext: string): Promise<void> {
    await this.updateVoiceChat({
      roomId,
      taskId,
      command: 'FunctionCallResult',
      message: gpsContext,
    });
  }

  /** GPS-C: Refresh SystemMessages with updated progress via UpdateConfig */
  async pushGpsUpdate(roomId: string, taskId: string, newSystemMessage: string): Promise<void> {
    await this.updateVoiceChat({
      roomId,
      taskId,
      command: 'UpdateConfig',
      llmConfig: {
        SystemMessages: [newSystemMessage],
      } as Partial<LLMConfig>,
    });
    logger.info(`[GPS-C] SystemMessages refreshed: room=${roomId}`);
  }

  /** Send ExternalTextToSpeech with configurable interrupt priority */
  async speakText(roomId: string, taskId: string, text: string, interruptMode: number = 1): Promise<void> {
    await this.updateVoiceChat({
      roomId,
      taskId,
      command: 'ExternalTextToSpeech',
      message: text,
      interruptMode,
    });
  }

  /** Check if voice chat is available (credentials configured) */
  isAvailable(): boolean {
    return !!(env.VOLC_RTC_APP_ID && env.VOLC_RTC_APP_KEY && env.VOLC_AK && env.VOLC_SK);
  }

  /**
   * Delayed start for Module C — only called when Module C begins.
   * Builds system prompt from session behavior data and starts the voice agent.
   * Falls back gracefully if RTC is unavailable.
   */
  async delayedStartVoiceChat(params: {
    roomId: string;
    taskId: string;
    targetUserId: string;
    systemPrompt: string;
    welcomeMessage: string;
    candidateName?: string;
  }): Promise<{ started: boolean; taskId: string; fallbackToText: boolean }> {
    if (!this.isAvailable()) {
      logger.info(`[voice-chat] RTC not available, falling back to text mode`);
      return { started: false, taskId: params.taskId, fallbackToText: true };
    }

    try {
      const result = await this.startVoiceChat(params);
      return { started: true, taskId: result.taskId, fallbackToText: false };
    } catch (err) {
      logger.warn(`[voice-chat] Failed to start RTC, falling back to text mode:`, err);
      return { started: false, taskId: params.taskId, fallbackToText: true };
    }
  }
}

// ─── Time Offset Detection (HireFlow: _find_time_offset) ───

let cachedTimeOffset = 0;

/**
 * Detect correct time offset for Volcano API signature (±15 min tolerance).
 * If local clock differs from Volcano server, we need to adjust.
 */
export async function findTimeOffset(): Promise<number> {
  if (!env.VOLC_AK || !env.VOLC_SK || !env.VOLC_RTC_APP_ID) return 0;

  const offsets = [0, -300, -600, -900, 300, 600, 900];
  const testTaskId = `test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const testRoomId = `test_offset_${Date.now()}`;
  const body = {
    AppId: env.VOLC_RTC_APP_ID,
    RoomId: testRoomId,
    TaskId: testTaskId,
    Config: {
      ASRConfig: { Provider: 'volcano', ProviderParams: { Mode: 'bigmodel', StreamMode: 0 } },
      TTSConfig: { Provider: 'volcano_bidirection', ProviderParams: { Credential: { ResourceId: 'seed-tts-1.0' } } },
      LLMConfig: { Mode: 'ArkV3', ModelName: 'doubao-seed-1-6-flash-250828', SystemMessages: ['test'], TopP: 0.3 },
    },
    AgentConfig: { UserId: 'AI_Interviewer01', TargetUserId: ['Candidate_01'], WelcomeMessage: 'test' },
  };

  const bodyStr = JSON.stringify(body);
  const queryString = `Action=StartVoiceChat&Version=${VOLC_API_VERSION}`;

  for (const offset of offsets) {
    try {
      const now = new Date(Date.now() + offset * 1000);
      const timestamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
      const date = timestamp.slice(0, 8);
      const authorization = generateVolcSignature('POST', '/', queryString, bodyStr, timestamp, date);

      const response = await fetch(`https://${VOLC_API_HOST}/?${queryString}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Host': VOLC_API_HOST,
          'X-Date': timestamp,
          'Authorization': authorization,
        },
        body: bodyStr,
      });

      const result = await response.json() as Record<string, unknown>;
      const meta = result.ResponseMetadata as Record<string, unknown> | undefined;
      const err = meta?.Error as Record<string, string> | undefined;

      if (!err) {
        // Success — stop the test task immediately
        try {
          const stopBody = JSON.stringify({ AppId: env.VOLC_RTC_APP_ID, TaskId: testTaskId });
          const stopQS = `Action=StopVoiceChat&Version=${VOLC_API_VERSION}`;
          const stopNow = new Date(Date.now() + offset * 1000);
          const stopTs = stopNow.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
          const stopDate = stopTs.slice(0, 8);
          const stopAuth = generateVolcSignature('POST', '/', stopQS, stopBody, stopTs, stopDate);
          await fetch(`https://${VOLC_API_HOST}/?${stopQS}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Host': VOLC_API_HOST, 'X-Date': stopTs, 'Authorization': stopAuth },
            body: stopBody,
          });
        } catch { /* ignore stop errors */ }

        if (offset !== 0) {
          logger.info(`[voice-chat] Time offset detected: ${offset}s`);
        }
        cachedTimeOffset = offset;
        return offset;
      }
      if (err.Code !== 'InvalidTimestamp') break;
    } catch { /* try next offset */ }
  }
  return 0;
}

export const voiceChatService = new VoiceChatService();
