// Session
export const SESSION_DURATION_DEFAULT_MS = 90 * 60 * 1000; // 90 minutes (force kick)
export const SESSION_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minute buffer

// Periodic reminders: from 20 min remaining, every 5 min
export const REMINDER_START_BEFORE_END_MS = 20 * 60 * 1000; // Start reminders at 20 min remaining
export const REMINDER_INTERVAL_MS = 5 * 60 * 1000; // Every 5 minutes

// Sandbox
export const SANDBOX_TIMEOUT_MS = 55 * 60 * 1000; // 55 minutes (E2B Hobby plan max 1h)
export const FILE_SYNC_DEBOUNCE_MS = 500;
export const ECHO_SUPPRESSION_TTL_MS = 2000;
export const PTY_OUTPUT_BATCH_MS = 16;

// WebSocket
export const WS_HEARTBEAT_INTERVAL_MS = 60_000;
export const WS_HEARTBEAT_TIMEOUT_MS = 120_000;
// AR-5: Extended from 30s to 300s (5 min) — allows recovery after tab close
export const WS_RECONNECT_WINDOW_MS = 300_000;

// AI
export const AI_CONCURRENCY_LIMIT = 8;
export const AI_REQUEST_TIMEOUT_MS = 30_000;

// AI Context Window Management (AR-1)
export const PROVIDER_CONTEXT_LIMITS: Record<string, number> = {
  'doubao-pro': 32_000,
  'doubao-lite': 32_000,
  'deepseek': 64_000,
  'claude': 200_000,
};

export const TOKEN_BUDGET = {
  SYSTEM_PROMPT: 4_000,
  CODE_SNAPSHOT: 7_000,
  CP_SUMMARIES: 2_500,
  CURRENT_DIALOG: 5_000,
  ASSISTANT_SUMMARY: 1_500,
  OUTPUT_RESERVED: 2_048,
  SAFETY_MARGIN: 10_000,
} as const;

export const MID_CP_SUMMARIZE_THRESHOLD = 8_000;
export const SAFETY_OVERFLOW_RATIO = 0.80;
export const STRUCTURED_MEMORY_MAX_ENTRIES = 20;

// SECURITY: Per-message and per-session token limits to prevent token bomb DoS
export const MAX_USER_MESSAGE_CHARS = 10_000; // ~2500 tokens, generous for code paste
export const MAX_SESSION_TOTAL_INPUT_TOKENS = 500_000; // Total input tokens per session across all AI calls

// Circuit Breaker
export const CB_FAILURE_THRESHOLD = 3;
export const CB_OPEN_DURATION_MS = 60_000;
export const CB_HALF_OPEN_DURATION_MS = 30_000;

// Rate Limiting
export const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMIT_MAX_REQUESTS = 100;

// JWT
export const JWT_CANDIDATE_EXPIRY = '90m';
export const JWT_ADMIN_EXPIRY = '8h';

// Checkpoints
export const TOTAL_CHECKPOINTS = 4;
export const TIMER_SYNC_INTERVAL_MS = 10_000; // Sync timer to client every 10s
export const WARNING_BEFORE_END_MS = 3 * 60 * 1000; // 3 minutes warning

/** Checkpoint timing definitions (from interview flow spec) */
export const CHECKPOINT_TIMINGS = [
  { index: 0, title: 'Environment Familiarization', durationMs: 3 * 60_000, startOffsetMs: 0 },
  { index: 1, title: 'Code Understanding', durationMs: 10 * 60_000, startOffsetMs: 3 * 60_000 },
  { index: 2, title: 'Bug Location & Fixing', durationMs: 12 * 60_000, startOffsetMs: 15 * 60_000 },
  { index: 3, title: 'Requirements Extension', durationMs: 15 * 60_000, startOffsetMs: 29 * 60_000 },
  { index: 4, title: 'Decision Probing', durationMs: 20 * 60_000, startOffsetMs: 46 * 60_000 },
] as const;

// AR-5: Transition window compressed from 2min to 30s
export const TRANSITION_DURATION_MS = 30_000;

// Transitions include 2-min buffers between CPs: 13-15, 27-29, 44-46

// ─── Security: Signal whitelist ───
// Only these signal types are accepted from client-side signal:batch events.
// Any signal type not in this list will be rejected and logged as suspicious.
export const ALLOWED_CLIENT_SIGNAL_TYPES = new Set([
  // useEditorSignals
  'paste_event',
  'edit_burst',
  'typing_rhythm',
  // useFileSignals
  'file_switch',
  // useTerminalSignals
  'terminal_command',
  // useIdleSignals
  'idle',
  'tab_hidden',
  'tab_visible',
  // useAISignals
  'ai_query',
  'ai_response',
]);

// System-only signal types — emitted by server, NEVER accepted from clients
export const SYSTEM_ONLY_SIGNAL_TYPES = new Set([
  'AI_COPY_RATIO',
  'SUSPICIOUS_DELAY',
  'V4_TURN_SIGNAL',
  'EDIT_PATTERN',
  'TYPING_SPEED',
  'PASTE_FREQUENCY',
  'FILE_SWITCH',
  'TAB_SWITCH',
  'IDLE_DURATION',
  'TERMINAL_COMMAND',
  'AI_QUERY',
  'AI_RESPONSE',
]);
