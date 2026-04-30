import { z } from 'zod';

const envSchema = z.object({
  // Server
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // JWT
  JWT_SECRET: z.string().min(16),
  JWT_CANDIDATE_EXPIRY: z.string().default('90m'),
  JWT_ADMIN_EXPIRY: z.string().default('8h'),

  // RTC Callback (dedicated secret, never reuse JWT_SECRET)
  RTC_CALLBACK_SECRET: z.string().min(16).optional(),

  // Sandbox provider: 'e2b' (cloud) or 'docker' (self-hosted, low latency)
  SANDBOX_PROVIDER: z.enum(['e2b', 'docker']).default('e2b'),

  // E2B
  E2B_API_KEY: z.string().optional(),
  E2B_SANDBOX_TIMEOUT_MS: z.coerce.number().default(4_800_000),

  // AI - Tier 1: Doubao (ARK)
  ARK_API_KEY: z.string().optional(),
  ARK_BASE_URL: z.string().default('https://ark.cn-beijing.volces.com/api/v3'),
  ARK_MODEL_PRO: z.string().optional(),
  ARK_MODEL_LITE: z.string().optional(),

  // AI - Tier 2: DeepSeek
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_BASE_URL: z.string().default('https://api.deepseek.com'),
  DEEPSEEK_MODEL: z.string().default('deepseek-chat'),

  // AI - DashScope (Qwen) — used by MB1 agent
  DASHSCOPE_API_KEY: z.string().optional(),
  DASHSCOPE_BASE_URL: z.string().default('https://dashscope.aliyuncs.com/compatible-mode/v1'),
  DASHSCOPE_MODEL: z.string().default('qwen3-coder-plus'),

  // AI - Tier 3: Claude (via Anthropic's OpenAI-compatible endpoint)
  ANTHROPIC_API_KEY: z.string().optional(),
  CLAUDE_BASE_URL: z.string().default('https://api.anthropic.com/v1/'),
  CLAUDE_MODEL: z.string().default('claude-sonnet-4-20250514'),

  // AI - GLM (Zhipu, OpenAI-compatible) — V5.0 scoring / structured output
  GLM_API_KEY: z.string().optional(),
  GLM_BASE_URL: z.string().default('https://open.bigmodel.cn/api/paas/v4/'),
  GLM_DEFAULT_MODEL: z.string().default('glm-4-plus'),

  // AI Concurrency
  AI_CONCURRENCY_LIMIT: z.coerce.number().default(8),

  // Langfuse (optional)
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_BASE_URL: z.string().default('https://cloud.langfuse.com'),

  // Volcano RTC (CP4 voice)
  VOLC_RTC_APP_ID: z.string().optional(),
  VOLC_RTC_APP_KEY: z.string().optional(),
  VOLC_AK: z.string().optional(),
  VOLC_SK: z.string().optional(),
  VOLC_AI_USER_ID: z.string().default('AI_Interviewer01'),
  VOLC_SUBTITLE_CALLBACK_URL: z.string().optional(),
  VOLC_SUBTITLE_SIGNATURE: z.string().optional(), // Required when voice features are enabled; no insecure default
  VOLC_TTS_SPEAKER: z.string().default('ICL_zh_female_yuxin_v1_tob'),
  VOLC_VAD_SILENCE_TIME: z.coerce.number().default(1300), // HireFlow production: 1300ms (官方推荐值)
  VOLC_INTERRUPT_MODE: z.coerce.number().default(0),
  VOLC_INTERRUPT_SPEECH_DURATION: z.coerce.number().default(800), // HireFlow: 800ms (3000ms causes WelcomeMessage roundId=0 stuck)
  VOLC_LLM_HISTORY_LENGTH: z.coerce.number().default(500), // HireFlow: 500 (full conversation history for GPS self-tracking)
  VOLC_LLM_TEMPERATURE: z.coerce.number().default(1),
  VOLC_LLM_TOP_P: z.coerce.number().default(0.6),
  VOLC_LLM_MAX_TOKENS: z.coerce.number().default(2363),
  CP4_LLM_MODE: z.enum(['ark', 'custom']).default('ark'),
  CUSTOM_LLM_URL: z.string().optional(),

  // Volcano RTC — ASR/VAD 增强 (2026-01/02 release)
  VOLC_ASR_EXPIRE_TIME: z.coerce.number().default(5000), // ASR强制判停：噪声环境VAD无法判停时的兜底(ms)
  VOLC_VAD_FORCE_BEGIN_THRESHOLD: z.coerce.number().default(100), // VAD极速打断阈值(ms)
  VOLC_VAD_FORCE_END: z.coerce.number().default(1200), // VAD辅助强制判停(ms)

  // Volcano RTC — 远场人声抑制 (2026-01 release)
  VOLC_ENABLE_FARFIELD: z.coerce.boolean().default(false), // 抑制3-5m外背景人声

  // Volcano RTC — TTS 增强 (2025-12/2026-01 release)
  VOLC_TTS_PREFILL: z.coerce.boolean().default(false), // 关闭TTS预合成，降低ASR中间结果修正时的字符消耗
  VOLC_ENABLE_EMOTION_TTS: z.coerce.boolean().default(false), // 情绪TTS：AI语气随对话情感调整

  // Volcano RTC — 打断关键词 (2025-04 release)
  VOLC_INTERRUPT_KEYWORDS: z.string().default(''), // 逗号分隔的关键词，如"等一下,我想想"

  // Volcano RTC — 用量回调 (2026-02 release)
  VOLC_TASK_USAGE_CALLBACK_URL: z.string().optional(), // 接收taskUsage事件的Webhook URL
  VOLC_TASK_USAGE_SIGNATURE: z.string().optional(), // HMAC签名密钥

  // Volcano RTC — 图片理解 (2025-08 release)
  VOLC_ENABLE_SNAPSHOT: z.coerce.boolean().default(false), // SnapshotConfig.AutoSelect：智能选帧

  // Volcano RTC — 并行函数调用 (2025-12 release)
  VOLC_ENABLE_PARALLEL_TOOL_CALLS: z.coerce.boolean().default(false), // 多工具并行调用

  // Sentry (optional)
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: z.string().default('development'),

  // Scoring
  SCORING_CALIBRATION: z.coerce.boolean().default(false),
  SCORING_CALIBRATION_CALLS: z.coerce.number().default(2),

  // Admin
  ADMIN_EMAIL: z.string().email().default('admin@codelens.dev'),
  ADMIN_PASSWORD: z.string().min(8).optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment variables:');
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  // Require ADMIN_PASSWORD in production to prevent unauthenticated access
  if (result.data.NODE_ENV === 'production' && !result.data.ADMIN_PASSWORD) {
    console.error('ADMIN_PASSWORD is required in production environment');
    process.exit(1);
  }

  return result.data;
}

export const env = loadEnv();
