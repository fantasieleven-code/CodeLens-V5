/**
 * V5 Voice API Routes — Module C ("Voice Follow-up" with Emma).
 *
 * Ports V4's `routes/voice.ts` + `routes/voice-v4.ts` into a single V5 router.
 * V5 always reads from `session.metadata` as `V5Submissions` (no `metadata.v4`
 * wrapper) and always uses a Custom LLM endpoint (`/api/v5/mc/voice-chat`,
 * Task 11 step 4D) that builds the Emma system prompt per turn from live
 * `V5Submissions` instead of a one-shot prompt at `/start`.
 *
 * Scope discipline (Task 11 Step 6):
 *   - No gps.service: V4 had dimension-coverage tracking; V5 pushes that
 *     logic inside mc-voice-chat.ts (signal-driven probing via PromptRegistry
 *     templates already replaces GPS cadence).
 *   - No webhook.ts silence-timer integration: out-of-scope for Task 11.
 *   - Reuses shared rtc-token.service and voice-chat.service.
 *
 * Endpoints:
 *   POST /api/voice/v5/token   — RTC join token (reused as-is from V4).
 *   POST /api/voice/v5/start   — Start Emma for a V5 session.
 *   POST /api/voice/v5/stop    — Stop + cleanup.
 *   GET  /api/voice/v5/status  — Availability probe.
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { requireCandidate } from '../middleware/auth.js';
import { generateRtcToken } from '../services/rtc-token.service.js';
import { voiceChatService } from '../services/voice-chat.service.js';
import { prisma } from '../config/db.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { AppError, NotFoundError } from '../middleware/errorHandler.js';

export const voiceRouter = Router();

/** RTC join token for candidate. */
export async function tokenHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { sessionId } = req.body as { sessionId?: string };
    if (!sessionId) {
      throw new AppError(400, 'sessionId required', 'BAD_REQUEST');
    }
    if (!voiceChatService.isAvailable()) {
      throw new AppError(
        503,
        'Voice chat not available (RTC credentials not configured)',
        'VOICE_UNAVAILABLE',
      );
    }

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { candidate: true },
    });
    if (!session) throw new NotFoundError('Session not found');

    const roomId = `interview_${sessionId}`;
    const userId = `candidate_${session.candidateId}`;
    const token = generateRtcToken(roomId, userId);

    res.json({
      token,
      roomId,
      userId,
      appId: env.VOLC_RTC_APP_ID,
    });
  } catch (error) {
    next(error);
  }
}

voiceRouter.post('/token', requireCandidate, tokenHandler);

/**
 * Start Emma (AI voice interviewer) for a V5 Module C session.
 *
 * Unlike V4, V5 does not build a big upfront system prompt from exam
 * artifacts here — the Custom LLM endpoint at /api/v5/mc/voice-chat reads
 * live V5Submissions on each turn and assembles the prompt dynamically
 * (Task 11 Step 4D). The welcome message is still pinned here because
 * VERTC requires it at session start.
 */
export async function v5StartHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { sessionId } = req.body as { sessionId?: string };
    if (!sessionId) {
      throw new AppError(400, 'sessionId required', 'BAD_REQUEST');
    }

    if (!voiceChatService.isAvailable()) {
      throw new AppError(
        503,
        'Voice chat not available (RTC credentials not configured)',
        'VOICE_UNAVAILABLE',
      );
    }

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { candidate: true },
    });
    if (!session) throw new NotFoundError('Session not found');

    if (session.schemaVersion !== 5) {
      throw new AppError(
        400,
        `voice/v5/start requires schemaVersion=5 (got ${session.schemaVersion})`,
        'WRONG_SCHEMA',
      );
    }

    const candidateName = session.candidate?.name || '候选人';
    const roomId = `interview_${sessionId}`;
    const taskId = `task_${sessionId}_mc_v5`;
    const targetUserId = `candidate_${session.candidateId}`;

    // Custom LLM URL: VERTC POSTs each user turn here; the endpoint assembles
    // Emma's system prompt from live V5Submissions + signal snapshot on every
    // call. Derive base from CUSTOM_LLM_URL (e.g. http://host:4000/chat-stream
    // → http://host:4000) with a safe production fallback.
    const serverBase = env.CUSTOM_LLM_URL
      ? env.CUSTOM_LLM_URL.replace(/\/chat-stream.*$/, '')
      : 'https://codelens.recruitagent.cc';
    const v5CustomLlmUrl = `${serverBase}/api/v5/mc/voice-chat`;

    // Delayed start returns immediately if RTC creds are missing (isAvailable
    // re-checks inside the service) — keeps the route non-blocking for
    // frontend readiness handshakes.
    await voiceChatService.delayedStartVoiceChat({
      roomId,
      taskId,
      targetUserId,
      systemPrompt: buildV5BootstrapSystemPrompt(candidateName),
      welcomeMessage:
        `${candidateName}你好，我是你的 AI 面试官 Emma。我们进入最后的语音追问环节，` +
        `我会基于你刚才的模块表现做大约 5 轮深入交流。准备好了我们就开始。`,
      candidateName,
      customLlmUrl: env.CP4_LLM_MODE === 'custom' ? v5CustomLlmUrl : undefined,
      customData:
        env.CP4_LLM_MODE === 'custom'
          ? { sessionId, currentRound: 1, candidateName }
          : undefined,
      tools:
        env.CP4_LLM_MODE === 'ark'
          ? [
              {
                type: 'function',
                function: {
                  name: 'check_interview_progress',
                  description: '查询当前面试进度，用于决定是否进入下一轮',
                  parameters: { type: 'object', properties: {}, required: [] },
                },
              },
            ]
          : undefined,
    });

    // Persist room/task ids so /stop can tear down cleanly.
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        metadata: {
          ...((session.metadata as object) || {}),
          voiceTaskId: taskId,
          voiceRoomId: roomId,
          voiceSchemaVersion: '5',
        },
      },
    });

    logger.info(
      `[voice-v5] Started Module C voice agent session=${sessionId} mode=${env.CP4_LLM_MODE}`,
    );
    res.json({
      taskId,
      roomId,
      mode: env.CP4_LLM_MODE,
      started: true,
    });
  } catch (error) {
    next(error);
  }
}

voiceRouter.post('/v5/start', requireCandidate, v5StartHandler);

/** Stop Emma + cleanup. Reuses V4 contract (voiceTaskId/voiceRoomId in metadata). */
export async function stopHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { sessionId } = req.body as { sessionId?: string };
    if (!sessionId) {
      throw new AppError(400, 'sessionId required', 'BAD_REQUEST');
    }

    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundError('Session not found');

    const metadata = (session.metadata as Record<string, unknown>) || {};
    const roomId = typeof metadata.voiceRoomId === 'string' ? metadata.voiceRoomId : undefined;
    const taskId = typeof metadata.voiceTaskId === 'string' ? metadata.voiceTaskId : undefined;

    if (roomId && taskId) {
      await voiceChatService.stopVoiceChat(roomId, taskId);
    }

    res.json({ stopped: true });
  } catch (error) {
    next(error);
  }
}

voiceRouter.post('/stop', requireCandidate, stopHandler);

/** Availability probe — no auth, used by frontend to decide whether to show voice UI. */
export function statusHandler(_req: Request, res: Response): void {
  res.json({
    available: voiceChatService.isAvailable(),
    mode: env.CP4_LLM_MODE,
  });
}

voiceRouter.get('/status', statusHandler);

/**
 * Minimal bootstrap system prompt sent to VERTC at /start. The Custom LLM
 * endpoint at /api/v5/mc/voice-chat supersedes this on every user turn with
 * a dynamic prompt built from live V5Submissions + signal snapshot. Kept
 * terse because (a) VERTC requires *some* system content and (b) if the
 * Custom LLM endpoint is disabled (CP4_LLM_MODE=ark) this still identifies
 * Emma and constrains output format.
 */
function buildV5BootstrapSystemPrompt(candidateName: string): string {
  return (
    `你是 Emma，CodeLens 的 AI 面试官，正在对候选人"${candidateName}"进行 Module C 语音追问（约 5 轮，10 分钟）。\n` +
    `\n角色要求：\n` +
    `- 语气专业但亲切，像资深技术 leader 在聊天。\n` +
    `- 每次回复 2-4 句话，不要长篇大论（这是语音对话）。\n` +
    `- 禁止输出任何 markdown 格式、代码块、列表符号，只用口语化纯文本。\n` +
    `- 每次只问一个问题，等候选人回答后再追问。\n` +
    `\n注意：你的详细追问策略和参考事实由后端动态下发（每轮独立构建），请优先遵循最新的 system 提示。`
  );
}
